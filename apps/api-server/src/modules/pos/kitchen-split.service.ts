import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes, KitchenStationSchema, SplitKitchenResponseSchema } from '@fnb/shared';
import type { KitchenStation, SplitKitchenResponse } from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

const stationPrintInfo = {
  BEP_NAU: { stationTitle: 'BẾP NẤU (MÌ CAY)', logoType: 'CHEF_HAT_NOODLE' },
  BEP_CHIEN: { stationTitle: 'BẾP CHIÊN', logoType: 'FRENCH_FRIES' },
  PHA_CHE: { stationTitle: 'QUẦY NƯỚC UỐNG', logoType: 'DRINK_CUP' },
} as const satisfies Record<KitchenStation, { stationTitle: string; logoType: string }>;

type TicketItem = SplitKitchenResponse['tickets'][number]['items'][number];

@Injectable()
export class KitchenSplitService {
  private readonly logger = new Logger(KitchenSplitService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PosSocketGateway) private readonly gateway: PosSocketGateway,
  ) {}

  async splitKitchen(orderId: number, _userId?: number): Promise<SplitKitchenResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            where: { kitchenStatus: 'NEW' },
            include: { product: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (!['PENDING', 'SERVING'].includes(order.status)) {
        throw new ConflictException({
          code: ErrorCodes.POS_ORDER_NOT_ACTIVE,
          message: 'Đơn hàng không còn mở để tách bếp',
        });
      }
      if (order.items.length === 0) {
        return {
          response: SplitKitchenResponseSchema.parse({
            batchNo: null,
            tickets: [],
            message: 'Không có món mới cần tách',
          }),
          statusUpdated: false,
          tableId: order.tableId,
        };
      }

      if (order.status === 'PENDING' && order.tableId !== null) {
        await tx.$queryRaw`SELECT id FROM dining_tables WHERE id = ${order.tableId} FOR UPDATE`;
      }

      const printedBatch = await tx.orderItem.aggregate({
        where: { orderId, kitchenStatus: { in: ['PRINTED', 'CANCELLED'] } },
        _max: { batchNo: true },
      });
      const batchNo = (printedBatch._max.batchNo ?? 0) + 1;
      const comboProductIds = order.items
        .filter((item) => item.product.station === 'COMBO')
        .map((item) => item.productId);
      const comboParts = comboProductIds.length > 0
        ? await tx.comboItem.findMany({
          where: { parentProductId: { in: comboProductIds } },
          include: { childProduct: { select: { id: true, name: true, station: true } } },
          orderBy: [{ parentProductId: 'asc' }, { childProductId: 'asc' }],
        })
        : [];

      const tickets = new Map<KitchenStation, TicketItem[]>();
      for (const item of order.items) {
        const modifiers = this.modifierNames(item.modifiersSnapshot);
        if (item.product.station === 'COMBO') {
          const parts = comboParts.filter((part) => part.parentProductId === item.productId);
          if (parts.length === 0) {
            throw new ConflictException({
              code: ErrorCodes.POS_ORDER_NOT_ACTIVE,
              message: `Combo ${item.product.name} chưa được cấu hình món thành phần`,
            });
          }
          for (const part of parts) {
            const station = this.physicalStation(part.childProduct.station);
            this.addTicketItem(tickets, station, {
              name: part.childProduct.name,
              qty: item.quantity * part.quantity,
              modifiers,
              note: item.itemNote ?? '',
            });
          }
        } else {
          const station = this.physicalStation(item.product.station);
          this.addTicketItem(tickets, station, {
            name: item.product.name,
            qty: item.quantity,
            modifiers,
            note: item.itemNote ?? '',
          });
        }
      }

      await tx.orderItem.updateMany({
        where: { id: { in: order.items.map((item) => item.id) }, kitchenStatus: 'NEW' },
        data: { kitchenStatus: 'PRINTED', batchNo },
      });

      const statusUpdated = order.status === 'PENDING';
      if (statusUpdated) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'SERVING' } });
        if (order.tableId !== null) {
          await tx.diningTable.update({
            where: { id: order.tableId },
            data: { status: 'OCCUPIED', activeOrderId: orderId },
          });
        }
      }

      const batchLabel = batchNo > 1 ? `[GỌI THÊM - LƯỢT ${batchNo}]` : undefined;
      const transferNotice = this.latestTransferNotice(order.tableTransferLogs);
      const response = SplitKitchenResponseSchema.parse({
        batchNo,
        tickets: [...tickets.entries()].map(([station, items]) => ({
          station,
          ...stationPrintInfo[station],
          batchNo,
          ...(batchLabel ? { batchLabel } : {}),
          ...(transferNotice ? { transferNotice } : {}),
          items,
        })),
      });
      return { response, statusUpdated, tableId: order.tableId };
    });

    if (result.response.tickets.length > 0) {
      const stationCounts = result.response.tickets
        .map((ticket) => `${ticket.station}=${ticket.items.length}items`)
        .join(', ');
      this.logger.log(`Split kitchen: orderId=${orderId}, batchNo=${result.response.batchNo}, ${stationCounts}, userId=${_userId ?? 'unknown'}`);
    }
    if (result.statusUpdated) {
      this.gateway.emitOrderStatusUpdated(orderId, { status: 'SERVING', message: 'Bếp đang chế biến' });
      this.gateway.emitTableGridSync({ orderId, tableId: result.tableId, status: 'SERVING' });
    }
    return result.response;
  }

  private physicalStation(value: string): KitchenStation {
    const parsed = KitchenStationSchema.safeParse(value);
    if (!parsed.success) {
      throw new ConflictException({
        code: ErrorCodes.POS_ORDER_NOT_ACTIVE,
        message: 'Món bếp chưa được gán trạm hợp lệ',
      });
    }
    return parsed.data;
  }

  private addTicketItem(tickets: Map<KitchenStation, TicketItem[]>, station: KitchenStation, item: TicketItem): void {
    const items = tickets.get(station) ?? [];
    items.push(item);
    tickets.set(station, items);
  }

  private modifierNames(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || !('name' in entry)) return [];
      return typeof entry.name === 'string' ? [entry.name] : [];
    });
  }

  private latestTransferNotice(value: Prisma.JsonValue): string | undefined {
    if (!Array.isArray(value)) return undefined;
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const entry = value[index];
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (typeof entry.fromTable === 'string' && typeof entry.toTable === 'string') {
        return `[GHI CHÚ ĐỔI BÀN: Chuyển từ ${entry.fromTable} sang ${entry.toTable}]`;
      }
    }
    return undefined;
  }
}
