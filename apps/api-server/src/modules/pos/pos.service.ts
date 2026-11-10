import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  ApproveQrOrderSchema,
  CheckoutOrderRequestSchema,
  CreatePosOrderSchema,
  CreateQrOrderSchema,
  OrderDetailResponseSchema,
  PatchOrderItemsResponseSchema,
  PatchOrderItemsSchema,
  PosOrderCreationResponseSchema,
  PosTableGridResponseSchema,
  ProvisionalBillResponseSchema,
  QrOrderResponseSchema,
  VoidInvoiceRequestSchema,
  type CheckoutOrderRequest,
  type ApproveQrOrderInput,
  type CreateOrderItemInput,
  type CreatePosOrderInput,
  type CreateQrOrderInput,
  type PatchOrderItemsInput,
  type QrOrderResponse,
  type ReprintKitchenRequest,
  type TableActionRequest,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import type { ZodType } from 'zod';
import type { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import { KitchenSplitService } from './kitchen-split.service';
import { TableTransferService } from './table-transfer.service';

type PricingModifier = {
  id: number;
  name: string;
  extraPrice: Prisma.Decimal;
  isDefaultChecked?: boolean;
  defaultSubstituteName?: string | null;
};
type PricingGroup = {
  id: number;
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect?: boolean;
  allowSubstitution?: boolean;
  modifiers: PricingModifier[];
};
type PricingProduct = {
  id: number;
  name: string;
  price: Prisma.Decimal;
  station: string;
  isAvailable: boolean;
  modifierGroups: PricingGroup[];
};
type ResolvedOrderItem = {
  productId: number;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersSnapshot: Prisma.InputJsonValue;
  itemNote: string | null;
};
type OrderRow = {
  id: number;
  orderCode: string;
  orderType: string;
  orderSource?: string;
  tableId: number | null;
  takeawayNumber: number | null;
  status: string;
  paymentMethod?: string | null;
  cashAmount?: Prisma.Decimal;
  transferAmount?: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  mergedIntoOrderId?: number | null;
  cashierId?: number | null;
  note?: string | null;
  voidReason?: string | null;
  createdAt?: Date;
  paidAt?: Date | null;
  table?: { id: number; name: string; status?: string } | null;
  items?: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitPrice: Prisma.Decimal;
    modifiersSnapshot: unknown;
    itemNote: string | null;
    batchNo: number;
    kitchenStatus: string;
    product: {
      id: number;
      name: string;
      station: string;
      comboParents?: Array<{ childProductId: number; quantity: number; childProduct?: { name?: string; station: string } }>;
    };
  }>;
  tableTransferLogs?: unknown;
};

const physicalStations = new Set(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);

class RetryQrOrderWithActiveSession extends Error {
  constructor(readonly activeOrderId: number) {
    super('Retry QR order after discovering an active table session');
  }
}

@Injectable()
export class PosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PosSocketGateway) private readonly gateway: PosSocketGateway,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
    @Inject(KitchenSplitService) private readonly kitchenSplitService: KitchenSplitService,
    @Inject(TableTransferService) private readonly tableTransferService: TableTransferService,
  ) {}

  async createOrder(input: CreatePosOrderInput, cashierId: number) {
    const parsed = this.parseRequest(CreatePosOrderSchema, input);
    const created = await this.prisma.$transaction(async (tx) => {
      let table: { id: number; name: string; status: string; activeOrderId: number | null } | null = null;
      if (parsed.orderType === 'DINE_IN') {
        const tableId = parsed.tableId;
        if (tableId === undefined || tableId === null) throw new BadRequestException('Đơn tại bàn cần chọn bàn');
        await this.lockTables(tx, [tableId]);
        table = await tx.diningTable.findUnique({ where: { id: tableId } });
        if (!table || table.status !== 'AVAILABLE' || table.activeOrderId !== null) {
          throw this.conflict('POS_TABLE_NOT_AVAILABLE', 'Bàn đã có khách hoặc không còn trống');
        }
      }

      const now = new Date();
      const businessDay = this.businessDay(now);
      await this.lockOrderSequence(tx, businessDay.key);
      const orderCode = await this.nextOrderCode(tx, businessDay);
      const takeawayNumber = parsed.orderType === 'TAKEAWAY'
        ? await this.nextTakeawayNumber(tx, businessDay)
        : null;
      const items = await this.resolveItems(tx, parsed.items);
      const totalAmount = this.totalForItems(items);
      const order = await tx.order.create({
        data: {
          orderCode,
          orderType: parsed.orderType,
          orderSource: 'POS_COUNTER',
          tableId: parsed.orderType === 'DINE_IN' ? parsed.tableId : null,
          takeawayNumber,
          status: 'SERVING',
          cashierId,
          note: parsed.note,
          totalAmount,
          createdAt: now,
          items: { create: items.map((item) => ({ ...item, batchNo: 1 })) },
        },
      });
      if (table) {
        await tx.diningTable.update({ where: { id: table.id }, data: { status: 'OCCUPIED', activeOrderId: order.id } });
      }
      return this.createdOrderResponse(order as OrderRow, table?.name ?? null);
    });

    this.gateway.emitTableGridSync({ orderId: created.orderId, tableId: created.tableId, status: created.status });
    return created;
  }

  async createQrOrder(input: CreateQrOrderInput): Promise<QrOrderResponse> {
    const parsed = this.parseRequest(CreateQrOrderSchema, input);
    let result: { kind: 'new' | 'addon'; response: ReturnType<typeof QrOrderResponseSchema.parse>; payload: unknown };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const qrTable = await tx.diningTable.findUnique({ where: { qrToken: parsed.qrToken } });
        if (!qrTable) throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });

        const existingOrderId = parsed.activeOrderId ?? qrTable.activeOrderId;
        if (existingOrderId !== null && existingOrderId !== undefined) {
          const sourceBeforeLock = await tx.order.findUnique({
            where: { id: existingOrderId },
            select: { id: true, mergedIntoOrderId: true },
          });
          if (!sourceBeforeLock) throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng QR' });
          const lockIds = [existingOrderId, sourceBeforeLock.mergedIntoOrderId].filter((id): id is number => id !== null);
          await this.lockOrders(tx, lockIds);

          const source = await tx.order.findUnique({
            where: { id: existingOrderId },
            include: { table: { select: { id: true, name: true } } },
          }) as OrderRow | null;
          if (!source) throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng QR' });
          if (source.status === 'MERGED' && typeof source.mergedIntoOrderId === 'number' && !lockIds.includes(source.mergedIntoOrderId)) {
            throw new RetryQrOrderWithActiveSession(existingOrderId);
          }
          let target = source;
          if (source.status === 'MERGED' && typeof source.mergedIntoOrderId === 'number') {
            target = await tx.order.findUnique({
              where: { id: source.mergedIntoOrderId },
              include: { table: { select: { id: true, name: true } } },
            }) as OrderRow | null ?? source;
            if (target.status === 'MERGED' && typeof target.mergedIntoOrderId === 'number') {
              throw new RetryQrOrderWithActiveSession(target.id);
            }
          }
          if (!['PENDING', 'SERVING'].includes(target.status) || target.orderType !== 'DINE_IN' || !target.table) {
            throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để gọi thêm món');
          }

          const response = await this.appendItems(tx, target, parsed.items);
          return {
            kind: 'addon' as const,
            response: QrOrderResponseSchema.parse({
              orderId: target.id,
              activeOrderId: target.id,
              orderCode: target.orderCode,
              currentTableLabel: target.table.name,
              status: target.status,
              batchNo: response.batchNo,
              totalAmount: response.totalAmount,
            }),
            payload: { ...response, orderId: target.id, tableId: target.table.id, tableLabel: target.table.name },
          };
        }

        await this.lockTables(tx, [qrTable.id]);
        const table = await tx.diningTable.findUnique({ where: { id: qrTable.id } });
        if (!table) throw new NotFoundException({ message: 'Không tìm thấy bàn' });
        if (table.activeOrderId !== null) throw new RetryQrOrderWithActiveSession(table.activeOrderId);
        if (table.status !== 'AVAILABLE') throw this.conflict('POS_TABLE_NOT_AVAILABLE', 'Bàn hiện không nhận đơn QR mới');

        const now = new Date();
        const businessDay = this.businessDay(now);
        await this.lockOrderSequence(tx, businessDay.key);
        const orderCode = await this.nextOrderCode(tx, businessDay);
        const items = await this.resolveItems(tx, parsed.items);
        const totalAmount = this.totalForItems(items);
        const order = await tx.order.create({
          data: {
            orderCode,
            orderType: 'DINE_IN',
            orderSource: 'QR_CODE',
            tableId: table.id,
            takeawayNumber: null,
            status: 'PENDING',
            note: parsed.note,
            totalAmount,
            createdAt: now,
            items: { create: items.map((item) => ({ ...item, batchNo: 1 })) },
          },
        });
        await tx.diningTable.update({ where: { id: table.id }, data: { status: 'PENDING', activeOrderId: order.id } });
        const response = QrOrderResponseSchema.parse({
          orderId: order.id,
          activeOrderId: order.id,
          orderCode,
          currentTableLabel: table.name,
          status: 'PENDING',
          batchNo: 1,
          totalAmount: totalAmount.toNumber(),
        });
        return { kind: 'new' as const, response, payload: { ...response, tableId: table.id, tableLabel: table.name } };
      });
    } catch (error) {
      if (error instanceof RetryQrOrderWithActiveSession) {
        return this.createQrOrder({ ...parsed, activeOrderId: error.activeOrderId });
      }
      throw error;
    }

    if (result.kind === 'new') this.gateway.emitQrNewOrder(result.payload);
    else this.gateway.emitQrAddonOrder(result.payload);
    return result.response;
  }

  async getTableGrid() {
    const [tables, takeaways] = await Promise.all([
      this.prisma.diningTable.findMany({
        orderBy: { id: 'asc' },
        include: { activeOrder: { select: { id: true, orderCode: true, orderType: true, tableId: true, takeawayNumber: true, status: true, totalAmount: true, createdAt: true } } },
      }),
      this.prisma.order.findMany({
        where: { orderType: 'TAKEAWAY', status: 'SERVING' },
        orderBy: { takeawayNumber: 'asc' },
      }),
    ]);
    return PosTableGridResponseSchema.parse({
      tables: tables.map((table) => ({
        id: table.id,
        name: table.name,
        status: table.status,
        activeOrderId: table.activeOrderId,
        activeOrder: table.activeOrder ? this.orderSummary(table.activeOrder, table.name) : null,
      })),
      takeaways: takeaways.map((order) => this.orderSummary(order, null)),
    });
  }

  async getOrder(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, name: true } },
        items: {
          orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
          include: { product: { include: { comboParents: { include: { childProduct: true } } } } },
        },
      },
    }) as OrderRow | null;
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    return this.orderDetail(order);
  }

  async approveQrOrder(id: number, input: ApproveQrOrderInput, cashierId: number) {
    const parsed = this.parseRequest(ApproveQrOrderSchema, input);
    const order = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng QR' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const current = await tx.order.findUnique({ where: { id } }) as OrderRow | null;
      if (!current) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng QR' });
      if (current.status !== 'PENDING' || current.orderSource !== 'QR_CODE') {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể duyệt đơn QR đang chờ xác nhận');
      }
      const updated = await tx.order.update({
        where: { id },
        data: parsed.approved
          ? { status: 'SERVING', cashierId }
          : { status: 'VOIDED', cashierId, voidReason: parsed.reason },
      });
      if (current.tableId !== null) {
        await tx.diningTable.update({
          where: { id: current.tableId },
          data: parsed.approved
            ? { status: 'OCCUPIED', activeOrderId: id }
            : { status: 'AVAILABLE', activeOrderId: null },
        });
      }
      return updated as OrderRow;
    });
    this.gateway.emitOrderStatusUpdated(id, { status: order.status, message: parsed.approved ? 'Bếp đang chế biến' : 'Đơn hàng đã bị từ chối' });
    this.gateway.emitTableGridSync({ orderId: id, status: order.status });
    return { orderId: id, status: order.status };
  }

  async cancelOrder(id: number, input: VoidInvoiceRequest, cashierId?: number) {
    const parsed = this.parseRequest(VoidInvoiceRequestSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const current = await tx.order.findUnique({ where: { id } }) as OrderRow | null;
      if (!current) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (!['PENDING', 'SERVING'].includes(current.status)) {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể huỷ đơn hàng đang mở hoặc đang phục vụ');
      }

      await tx.orderItem.deleteMany({ where: { orderId: id, kitchenStatus: 'NEW' } });
      await tx.orderItem.updateMany({ where: { orderId: id, kitchenStatus: 'PRINTED' }, data: { kitchenStatus: 'CANCELLED' } });

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: parsed.voidReason,
          totalAmount: new Prisma.Decimal(0),
          cashierId: cashierId ?? current.cashierId,
        },
      });

      if (current.tableId !== null) {
        await tx.diningTable.update({
          where: { id: current.tableId },
          data: { status: 'AVAILABLE', activeOrderId: null },
        });
      }
      return { order: updated as OrderRow, tableId: current.tableId };
    });

    this.gateway.emitOrderStatusUpdated(id, { status: 'VOIDED', message: 'Đơn hàng đã được huỷ và giải phóng bàn' });
    this.gateway.emitTableGridSync({ orderId: id, tableId: result.tableId, status: 'AVAILABLE' });
    return { orderId: id, status: 'VOIDED', tableId: result.tableId };
  }

  async patchOrderItems(id: number, input: PatchOrderItemsInput) {
    const parsed = this.parseRequest(PatchOrderItemsSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            include: { product: { include: { comboParents: { include: { childProduct: { select: { name: true, station: true } } } } } } },
          },
        },
      }) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (!['PENDING', 'SERVING'].includes(order.status)) throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để sửa món');

      const slips: Array<{ station: 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE'; tableLabel: string; itemName: string; quantity: number }> = [];
      const itemsById = new Map((order.items ?? []).map((item) => [item.id, item]));
      const changedIds = new Set<number>();
      const tableLabel = order.table?.name ?? `Mang về #${String(order.takeawayNumber ?? 0).padStart(2, '0')}`;

      for (const itemId of parsed.removeItemIds ?? []) {
        const item = itemsById.get(itemId);
        if (!item || changedIds.has(itemId)) throw new NotFoundException({ message: 'Không tìm thấy món trong đơn hàng' });
        changedIds.add(itemId);
        if (item.kitchenStatus === 'NEW') await tx.orderItem.delete({ where: { id: itemId } });
        else if (item.kitchenStatus === 'PRINTED') {
          await tx.orderItem.update({ where: { id: itemId }, data: { kitchenStatus: 'CANCELLED' } });
          slips.push(...await this.cancellationSlips(tx, item, tableLabel));
        } else throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Món đã huỷ không thể sửa tiếp');
      }

      for (const update of parsed.updates ?? []) {
        const item = itemsById.get(update.orderItemId);
        if (!item || changedIds.has(update.orderItemId)) throw new NotFoundException({ message: 'Không tìm thấy món trong đơn hàng' });
        changedIds.add(update.orderItemId);
        if (item.kitchenStatus === 'CANCELLED') throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Món đã huỷ không thể sửa tiếp');

        const replacementInput: CreateOrderItemInput = {
          productId: item.productId,
          quantity: update.quantity ?? item.quantity,
          modifiers: update.modifiers ?? this.modifierSelections(item.modifiersSnapshot),
          itemNote: update.itemNote === undefined ? (item.itemNote ?? undefined) : (update.itemNote ?? undefined),
        };
        const [replacement] = await this.resolveItems(tx, [replacementInput]);
        if (item.kitchenStatus === 'NEW') {
          await tx.orderItem.update({ where: { id: item.id }, data: {
            quantity: replacement.quantity,
            unitPrice: replacement.unitPrice,
            modifiersSnapshot: replacement.modifiersSnapshot,
            itemNote: replacement.itemNote,
          } });
        } else {
          await tx.orderItem.update({ where: { id: item.id }, data: { kitchenStatus: 'CANCELLED' } });
          slips.push(...await this.cancellationSlips(tx, item, tableLabel));
          const aggregate = await tx.orderItem.aggregate({ where: { orderId: id }, _max: { batchNo: true } });
          await tx.orderItem.create({ data: {
            orderId: id,
            ...replacement,
            batchNo: (aggregate._max.batchNo ?? 0) + 1,
            kitchenStatus: 'NEW',
          } });
        }
      }

      if (parsed.addItems?.length) {
        const added = await this.resolveItems(tx, parsed.addItems);
        const aggregate = await tx.orderItem.aggregate({ where: { orderId: id }, _max: { batchNo: true } });
        await tx.orderItem.createMany({ data: added.map((item) => ({
          orderId: id, ...item, batchNo: (aggregate._max.batchNo ?? 0) + 1, kitchenStatus: 'NEW',
        })) });
      }

      const remainingItems = await tx.orderItem.findMany({
        where: { orderId: id, kitchenStatus: { in: ['NEW', 'PRINTED'] } },
        select: { quantity: true, unitPrice: true },
      });
      const totalAmount = this.totalForItems(remainingItems);
      await tx.order.update({ where: { id }, data: { totalAmount } });
      return PatchOrderItemsResponseSchema.parse({
        orderId: id,
        totalAmount: totalAmount.toNumber(),
        requireCancellationSlip: slips.length > 0,
        kitchenCancellationSlips: slips,
      });
    });

    this.gateway.emitTableGridSync({ orderId: id, totalAmount: result.totalAmount });
    return result;
  }

  async tableAction(id: number, input: TableActionRequest, userId?: number) {
    return this.tableTransferService.executeTableAction(id, input, userId);
  }

  async getProvisionalBill(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { table: { select: { id: true, name: true, status: true } }, items: { include: { product: { select: { name: true } } }, orderBy: [{ batchNo: 'asc' }, { id: 'asc' }] } },
    }) as OrderRow | null;
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    if (order.status !== 'SERVING') throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể in tạm tính cho đơn đang phục vụ');

    const bankId = this.config.get('vietQrBankId');
    const accountNo = this.config.get('vietQrAccountNo');
    const accountName = this.config.get('vietQrAccountName');
    const vietQrPayload = bankId && accountNo && accountName
      ? this.vietQrUrl(bankId, accountNo, accountName, order.totalAmount, order.orderCode)
      : undefined;

    return ProvisionalBillResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      takeawayNumber: order.takeawayNumber,
      items: (order.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED').map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
        modifiers: this.modifierNames(item.modifiersSnapshot),
        note: item.itemNote,
      })),
      totalAmount: order.totalAmount.toNumber(),
      status: 'SERVING',
      vietQrPayload,
    });
  }

  async checkout(id: number, input: CheckoutOrderRequest, cashierId: number) {
    const parsed = this.parseRequest(CheckoutOrderRequestSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      const order = await tx.order.findUnique({ where: { id } }) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (order.status !== 'SERVING') throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để thanh toán');
      if (order.tableId !== null) await this.lockTables(tx, [order.tableId]);

      const totalCents = this.toCents(order.totalAmount);
      if (parsed.totalAmount !== undefined && this.toCents(parsed.totalAmount) !== totalCents) {
        throw this.conflict('POS_CONCURRENT_MODIFICATION', 'Tổng tiền đơn hàng đã thay đổi, vui lòng tải lại hoá đơn');
      }
      let cashCents = 0;
      let transferCents = 0;
      if (parsed.paymentMethod === 'CASH') cashCents = totalCents;
      else if (parsed.paymentMethod === 'TRANSFER') transferCents = totalCents;
      else {
        cashCents = this.toCents(parsed.cashAmount);
        transferCents = this.toCents(parsed.transferAmount);
        if (cashCents <= 0 || transferCents <= 0 || cashCents + transferCents !== totalCents) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: 'Tiền mặt và chuyển khoản phải lớn hơn 0 và cộng lại bằng tổng hoá đơn',
          });
        }
      }

      const paidAt = new Date();
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          paymentMethod: parsed.paymentMethod,
          cashAmount: this.fromCents(cashCents),
          transferAmount: this.fromCents(transferCents),
          paidAt,
          cashierId,
        },
      });
      if (order.tableId !== null) {
        await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE', activeOrderId: null } });
      }
      return { order: updated as OrderRow, paidAt, tableId: order.tableId };
    });

    const payload = { orderId: id, status: 'PAID', paidAt: result.paidAt.toISOString() };
    this.gateway.emitOrderStatusUpdated(id, payload);
    this.gateway.emitTableGridSync({ orderId: id, tableId: result.tableId, status: 'PAID' });
    return payload;
  }

  async splitKitchen(id: number, userId?: number) {
    return this.kitchenSplitService.splitKitchen(id, userId);
  }

  async reprintKitchen(id: number, options?: ReprintKitchenRequest, userId?: number) {
    return this.kitchenSplitService.reprintKitchen(id, options, userId);
  }

  private async appendItems(tx: Prisma.TransactionClient, order: OrderRow, itemInputs: CreateOrderItemInput[]) {
    const items = await this.resolveItems(tx, itemInputs);
    const aggregate = await tx.orderItem.aggregate({ where: { orderId: order.id }, _max: { batchNo: true } });
    const batchNo = (aggregate._max.batchNo ?? 0) + 1;
    const addedTotal = this.totalForItems(items);
    await tx.orderItem.createMany({
      data: items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiersSnapshot: item.modifiersSnapshot,
        itemNote: item.itemNote,
        batchNo,
        kitchenStatus: 'NEW',
      })),
    });
    const totalAmount = order.totalAmount.add(addedTotal);
    await tx.order.update({ where: { id: order.id }, data: { totalAmount } });
    return { batchNo, totalAmount: totalAmount.toNumber() };
  }

  private async resolveItems(tx: Prisma.TransactionClient, itemInputs: CreateOrderItemInput[]): Promise<ResolvedOrderItem[]> {
    const productIds = [...new Set(itemInputs.map(({ productId }) => productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
      include: { modifierGroups: { include: { modifiers: true } } },
    }) as PricingProduct[];
    const productsById = new Map(products.map((product) => [product.id, product]));
    if (products.length !== productIds.length) throw new NotFoundException({ message: 'Một hoặc nhiều món không tồn tại hoặc đã ngừng bán' });

    return itemInputs.map((input) => {
      const product = productsById.get(input.productId);
      if (!product) throw new NotFoundException({ message: 'Không tìm thấy sản phẩm' });
      const selectedIds = new Set<number>();
      let modifierTotal = new Prisma.Decimal(0);
      const snapshots: Array<{
        groupId: number;
        modifierId: number;
        name: string;
        extraPrice: Prisma.Decimal;
        action?: 'SELECTED' | 'REMOVED_DEFAULT' | 'SUBSTITUTED';
        substituteModifierId?: number;
        substituteName?: string;
      }> = [];
      for (const group of product.modifierGroups) {
        const selections = input.modifiers.filter((selection) => selection.groupId === group.id);
        const positiveSelections = selections.filter((selection) => !selection.action || selection.action === 'SELECTED');
        const exceptionSelections = selections.filter((selection) => selection.action === 'REMOVED_DEFAULT' || selection.action === 'SUBSTITUTED');
        const hasAutoDefaults = Boolean(group.isAutoSelect || group.allowSubstitution || group.modifiers.some((m) => m.isDefaultChecked));

        if (
          positiveSelections.length > group.maxSelect ||
          (!hasAutoDefaults && group.isRequired && positiveSelections.length === 0)
        ) {
          throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: `Lựa chọn món bổ sung không hợp lệ: ${group.name}` });
        }

        if (group.allowSubstitution && exceptionSelections.length >= group.modifiers.length && group.modifiers.length > 0) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: `Phải giữ lại ít nhất 1 thành phần chính trong nhóm ${group.name}`,
          });
        }

        const remainingGroupModifiers = group.modifiers.filter(
          (candidate) => !exceptionSelections.some((ex) => ex.modifierId === candidate.id),
        );

        for (const selection of selections) {
          if (selectedIds.has(selection.modifierId)) throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'Không thể chọn trùng tuỳ chọn món' });
          selectedIds.add(selection.modifierId);
          const modifier = group.modifiers.find((candidate) => candidate.id === selection.modifierId);
          if (!modifier) throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: `Tuỳ chọn không thuộc nhóm ${group.name}` });

          if (selection.action === 'REMOVED_DEFAULT') {
            snapshots.push({
              groupId: group.id,
              modifierId: modifier.id,
              name: `Không ${modifier.name}`,
              extraPrice: new Prisma.Decimal(0),
              action: 'REMOVED_DEFAULT',
            });
            continue;
          }

          if (selection.action === 'SUBSTITUTED') {
            const explicitSubModifier = selection.substituteModifierId
              ? remainingGroupModifiers.find((m) => m.id === selection.substituteModifierId)
              : undefined;
            const replacementName = remainingGroupModifiers.length === 1
              ? remainingGroupModifiers[0]!.name
              : (explicitSubModifier?.name
                ?? selection.substituteName?.trim()
                ?? modifier.defaultSubstituteName?.trim()
                ?? remainingGroupModifiers[0]?.name
                ?? '');
            const formattedName = replacementName
              ? `Không ${modifier.name} (Thay bằng ${replacementName})`
              : `Không ${modifier.name}`;
            snapshots.push({
              groupId: group.id,
              modifierId: modifier.id,
              name: formattedName,
              extraPrice: new Prisma.Decimal(0),
              action: 'SUBSTITUTED',
              ...(explicitSubModifier ? { substituteModifierId: explicitSubModifier.id } : {}),
              ...(replacementName ? { substituteName: replacementName } : {}),
            });
            continue;
          }

          modifierTotal = modifierTotal.add(modifier.extraPrice);
          if (modifier.isDefaultChecked && modifier.extraPrice.equals(0)) {
            continue;
          }
          snapshots.push({ groupId: group.id, modifierId: modifier.id, name: modifier.name, extraPrice: modifier.extraPrice });
        }
      }
      if (input.modifiers.some((selection) => !product.modifierGroups.some((group) => group.id === selection.groupId))) {
        throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'Nhóm tuỳ chọn không thuộc sản phẩm' });
      }
      return {
        productId: product.id,
        quantity: input.quantity,
        unitPrice: product.price.add(modifierTotal),
        modifiersSnapshot: snapshots.map((snapshot) => ({ ...snapshot, extraPrice: snapshot.extraPrice.toFixed(2) })) as unknown as Prisma.InputJsonValue,
        itemNote: input.itemNote ?? null,
      };
    });
  }

  private totalForItems(items: Array<{ unitPrice: Prisma.Decimal; quantity: number }>): Prisma.Decimal {
    return items.reduce((total, item) => total.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0)).toDecimalPlaces(2);
  }

  private createdOrderResponse(order: OrderRow, tableLabel: string | null) {
    const label = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
      ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
      : tableLabel;
    return PosOrderCreationResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      takeawayNumber: order.takeawayNumber,
      tableLabel: label,
      status: order.status,
      totalAmount: order.totalAmount.toNumber(),
    });
  }

  private orderSummary(order: OrderRow, tableLabel: string | null) {
    const resolvedTableLabel = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
      ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
      : tableLabel;
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      tableLabel: resolvedTableLabel,
      takeawayNumber: order.takeawayNumber ?? null,
      status: order.status,
      totalAmount: order.totalAmount.toNumber(),
      createdAt: (order.createdAt ?? new Date(0)).toISOString(),
    };
  }

  private orderDetail(order: OrderRow) {
    const tableLabel = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
      ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
      : order.table?.name ?? null;
    return OrderDetailResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      orderSource: order.orderSource ?? 'POS_COUNTER',
      tableId: order.tableId,
      tableLabel,
      takeawayNumber: order.takeawayNumber ?? null,
      status: order.status,
      paymentMethod: order.paymentMethod ?? null,
      cashAmount: (order.cashAmount ?? new Prisma.Decimal(0)).toNumber(),
      transferAmount: (order.transferAmount ?? new Prisma.Decimal(0)).toNumber(),
      totalAmount: order.totalAmount.toNumber(),
      note: order.note ?? null,
      createdAt: (order.createdAt ?? new Date(0)).toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      tableTransferLogs: Array.isArray(order.tableTransferLogs) ? order.tableTransferLogs : [],
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
        modifiers: this.modifierNames(item.modifiersSnapshot),
        itemNote: item.itemNote,
        batchNo: item.batchNo,
        kitchenStatus: item.kitchenStatus,
      })),
    });
  }

  private async cancellationSlips(
    tx: Prisma.TransactionClient,
    item: NonNullable<OrderRow['items']>[number],
    tableLabel: string,
  ): Promise<Array<{ station: 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE'; tableLabel: string; itemName: string; quantity: number }>> {
    const components = item.product.station === 'COMBO'
      ? item.product.comboParents ?? await tx.comboItem.findMany({
        where: { parentProductId: item.productId },
        include: { childProduct: { select: { name: true, station: true } } },
      })
      : [];
    if (item.product.station !== 'COMBO') {
      if (!physicalStations.has(item.product.station)) throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Món bếp chưa được gán trạm hợp lệ');
      return [{ station: item.product.station as 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE', tableLabel, itemName: item.product.name, quantity: item.quantity }];
    }
    return components.flatMap((part) => {
      const station = part.childProduct?.station;
      if (!station || !physicalStations.has(station)) return [];
      return [{
        station: station as 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE',
        tableLabel,
        itemName: part.childProduct?.name ?? item.product.name,
        quantity: item.quantity * part.quantity,
      }];
    });
  }

  private modifierSelections(value: unknown): CreateOrderItemInput['modifiers'] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('groupId' in entry) || !('modifierId' in entry)) return [];
      if (typeof entry.groupId !== 'number' || typeof entry.modifierId !== 'number') return [];
      const action = 'action' in entry && (entry.action === 'SELECTED' || entry.action === 'REMOVED_DEFAULT' || entry.action === 'SUBSTITUTED')
        ? entry.action
        : undefined;
      const substituteModifierId = 'substituteModifierId' in entry && typeof entry.substituteModifierId === 'number'
        ? entry.substituteModifierId
        : undefined;
      const substituteName = 'substituteName' in entry && typeof entry.substituteName === 'string'
        ? entry.substituteName
        : undefined;
      return [{
        groupId: entry.groupId,
        modifierId: entry.modifierId,
        ...(action ? { action } : {}),
        ...(substituteModifierId ? { substituteModifierId } : {}),
        ...(substituteName ? { substituteName } : {}),
      }];
    });
  }

  private modifierNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string') return [];
      return [entry.name];
    });
  }

  private vietQrUrl(bankId: string, accountNo: string, accountName: string, amount: Prisma.Decimal, orderCode: string): string {
    const numericAmount = amount.toFixed(0);
    const query = new URLSearchParams({ amount: numericAmount, addInfo: `TT ${orderCode}`, accountName });
    return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?${query.toString()}`;
  }

  private toCents(amount: Prisma.Decimal | number): number {
    return new Prisma.Decimal(amount).mul(100).toDecimalPlaces(0).toNumber();
  }

  private fromCents(cents: number): Prisma.Decimal {
    return new Prisma.Decimal(cents).div(100).toDecimalPlaces(2);
  }

  private businessDay(now: Date): { key: string; start: Date; end: Date } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
    const key = `${part('year')}${part('month')}${part('day')}`;
    const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000+07:00`);
    return { key, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

  private async lockOrderSequence(tx: Prisma.TransactionClient, businessDate: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fnb-pos-order-sequence:${businessDate}`}))`;
  }

  private async nextOrderCode(tx: Prisma.TransactionClient, day: { key: string; start: Date; end: Date }): Promise<string> {
    const lastOrder = await tx.order.findFirst({
      where: { createdAt: { gte: day.start, lt: day.end }, orderCode: { startsWith: `HD-${day.key}-` } },
      orderBy: { orderCode: 'desc' },
      select: { orderCode: true },
    });
    const sequence = lastOrder ? Number(lastOrder.orderCode.slice(-4)) + 1 : 1;
    if (!Number.isSafeInteger(sequence) || sequence > 9999) throw new ConflictException({ message: 'Đã vượt giới hạn mã hoá đơn trong ngày' });
    return `HD-${day.key}-${String(sequence).padStart(4, '0')}`;
  }

  private async nextTakeawayNumber(tx: Prisma.TransactionClient, day: { start: Date; end: Date }): Promise<number> {
    const aggregate = await tx.order.aggregate({
      where: { orderType: 'TAKEAWAY', createdAt: { gte: day.start, lt: day.end } },
      _max: { takeawayNumber: true },
    });
    return (aggregate._max.takeawayNumber ?? 0) + 1;
  }

  private async lockOrders(tx: Prisma.TransactionClient, orderIds: number[]): Promise<void> {
    const ids = [...new Set(orderIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM orders WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
  }

  private async lockTables(tx: Prisma.TransactionClient, tableIds: number[]): Promise<void> {
    const ids = [...new Set(tableIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM dining_tables WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
  }

  private parseRequest<T>(schema: ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        details: { fieldErrors: parsed.error.flatten() },
      });
    }
    return parsed.data;
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }
}
