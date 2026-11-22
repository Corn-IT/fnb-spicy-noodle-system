import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  parseQrReminderConfig,
  QrAutoCancelledPayloadSchema,
  STORE_MESSAGES_NORMALIZED_NAME,
  type QrAutoCancelledPayload,
  type QrReminderConfig,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import { recomputeOrderTotals } from './order-totals.helper';

const AUTO_CANCEL_POLL_INTERVAL_MS = 10_000;
const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const BATCH_SWEEP_LIMIT = 50;

function extractReminderConfigTitle(metadata: unknown, isActive: boolean): string | null {
  if (!isActive || typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  const nested =
    typeof record.messages === 'object' && record.messages !== null && !Array.isArray(record.messages)
      ? (record.messages as Record<string, unknown>)
      : record;
  const entry = nested['pos.voice.reminderConfig'];
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return null;
  }
  const title = (entry as Record<string, unknown>).title;
  return typeof title === 'string' ? title : null;
}

@Injectable()
export class QrAutoCancelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QrAutoCancelService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isSweeping = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PosSocketGateway) private readonly gateway: PosSocketGateway,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sweepExpiredQrRequests().catch((err) => {
        this.logger.warn(
          `QR auto-cancel sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, AUTO_CANCEL_POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getReminderConfig(): Promise<QrReminderConfig> {
    if (typeof this.prisma.masterData?.findUnique !== 'function') {
      return parseQrReminderConfig(null);
    }
    const row = await this.prisma.masterData.findUnique({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: STORE_MESSAGES_NORMALIZED_NAME,
        },
      },
      select: { metadata: true, isActive: true },
    });
    const rawTitle = extractReminderConfigTitle(row?.metadata, row?.isActive ?? true);
    return parseQrReminderConfig(rawTitle);
  }

  async sweepExpiredQrRequests(now: Date = new Date()): Promise<QrAutoCancelledPayload[]> {
    if (this.isSweeping) return [];
    this.isSweeping = true;
    try {
      const config = await this.getReminderConfig();
      if (!config.autoCancelEnabled) {
        return [];
      }

      const cutoff = new Date(now.getTime() - config.autoCancelMinutes * 60_000);
      const pendingOrderEvents = await this.sweepExpiredPendingOrders(cutoff, config.autoCancelMinutes, now);
      const addonEvents = await this.sweepExpiredQrAddons(cutoff, config.autoCancelMinutes, now);
      return [...pendingOrderEvents, ...addonEvents];
    } finally {
      this.isSweeping = false;
    }
  }

  private async sweepExpiredPendingOrders(
    cutoff: Date,
    autoCancelMinutes: number,
    now: Date,
  ): Promise<QrAutoCancelledPayload[]> {
    if (typeof this.prisma.order?.findMany !== 'function') return [];

    const candidates = await this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        orderSource: 'QR_CODE',
        createdAt: { lte: cutoff },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SWEEP_LIMIT,
    });

    const events: QrAutoCancelledPayload[] = [];
    for (const candidate of candidates) {
      const committed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${candidate.id} FOR UPDATE`;
        const current = await tx.order.findUnique({
          where: { id: candidate.id },
          include: {
            table: { select: { id: true, name: true, activeOrderId: true } },
            _count: { select: { items: true } },
          },
        });
        if (
          !current ||
          current.status !== 'PENDING' ||
          current.orderSource !== 'QR_CODE' ||
          current.createdAt > cutoff
        ) {
          return null;
        }

        if (current.tableId !== null) {
          await tx.$queryRaw`SELECT id FROM dining_tables WHERE id = ${current.tableId} FOR UPDATE`;
        }

        const reason = `Tự động huỷ do quá ${autoCancelMinutes} phút chưa xác nhận`;
        await tx.order.update({
          where: { id: current.id },
          data: { status: 'VOIDED', voidReason: reason },
        });

        if (current.tableId !== null && current.table?.activeOrderId === current.id) {
          await tx.diningTable.update({
            where: { id: current.tableId },
            data: { status: 'AVAILABLE', activeOrderId: null },
          });
        }

        const tableLabel =
          current.table?.name ??
          (current.orderType === 'TAKEAWAY'
            ? `Mang về #${String(current.takeawayNumber ?? 0).padStart(2, '0')}`
            : null);

        await this.auditLogService?.record({
          module: 'POS',
          action: 'Tự động huỷ đơn QR',
          detail: current.orderCode,
          message: `tự động huỷ đơn QR ${current.orderCode} quá ${autoCancelMinutes} phút chưa xác nhận tại ${tableLabel ?? 'bàn'}`,
          actor: null,
          tx,
          metadata: {
            orderId: current.id,
            orderCode: current.orderCode,
            ...(tableLabel ? { tableLabel } : {}),
            autoCancelMinutes,
            cancelledItemCount: current._count.items,
            reason,
          },
        });

        const payload = QrAutoCancelledPayloadSchema.parse({
          orderId: current.id,
          orderCode: current.orderCode,
          tableId: current.tableId,
          tableLabel,
          kind: 'NEW',
          cancelledItemCount: current._count.items,
          autoCancelMinutes,
          cancelledAt: now.toISOString(),
          reason,
        });

        return { payload, tableId: current.tableId };
      });

      if (!committed) continue;

      this.gateway.emitOrderStatusUpdated(committed.payload.orderId, {
        orderId: committed.payload.orderId,
        status: 'VOIDED',
        message: `Đơn gọi món của bạn đã tự động huỷ do quá ${autoCancelMinutes} phút chưa được xác nhận tại quầy.`,
      });
      this.gateway.emitTableGridSync({
        orderId: committed.payload.orderId,
        tableId: committed.tableId,
        status: 'AVAILABLE',
      });
      this.gateway.emitQrAutoCancelled(committed.payload.orderId, committed.payload);
      events.push(committed.payload);
    }

    return events;
  }

  private async sweepExpiredQrAddons(
    cutoff: Date,
    autoCancelMinutes: number,
    now: Date,
  ): Promise<QrAutoCancelledPayload[]> {
    if (typeof this.prisma.orderItem?.findMany !== 'function') return [];

    const candidateItems = await this.prisma.orderItem.findMany({
      where: {
        kitchenStatus: 'NEW',
        itemSource: 'QR_CODE',
        batchNo: { gte: 2 },
        createdAt: { lte: cutoff },
        order: { status: 'SERVING' },
      },
      select: { orderId: true },
      orderBy: [{ orderId: 'asc' }, { id: 'asc' }],
      take: BATCH_SWEEP_LIMIT * 2,
    });

    const uniqueOrderIds = [...new Set(candidateItems.map((row) => row.orderId))];
    const events: QrAutoCancelledPayload[] = [];

    for (const orderId of uniqueOrderIds) {
      const committed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { table: { select: { id: true, name: true } } },
        });
        if (!order || order.status !== 'SERVING') {
          return null;
        }

        const expiredItems = await tx.orderItem.findMany({
          where: {
            orderId,
            kitchenStatus: 'NEW',
            itemSource: 'QR_CODE',
            batchNo: { gte: 2 },
            createdAt: { lte: cutoff },
          },
          include: { product: { select: { name: true } } },
          orderBy: { id: 'asc' },
        });
        if (expiredItems.length === 0) {
          return null;
        }

        await tx.orderItem.deleteMany({
          where: { id: { in: expiredItems.map((item) => item.id) }, kitchenStatus: 'NEW' },
        });

        const totals = await recomputeOrderTotals(tx, orderId, order.discountSnapshot ?? null);
        const cancelledItemCount = expiredItems.reduce((sum, item) => sum + item.quantity, 0);
        const tableLabel =
          order.table?.name ??
          (order.orderType === 'TAKEAWAY'
            ? `Mang về #${String(order.takeawayNumber ?? 0).padStart(2, '0')}`
            : null);
        const reason = `Tự động huỷ ${cancelledItemCount} món gọi thêm QR do quá ${autoCancelMinutes} phút chưa xác nhận`;

        await this.auditLogService?.record({
          module: 'POS',
          action: 'Tự động huỷ món QR',
          detail: order.orderCode,
          message: `tự động huỷ ${cancelledItemCount} món gọi thêm QR quá ${autoCancelMinutes} phút chưa xác nhận tại ${tableLabel ?? 'bàn'}`,
          actor: null,
          tx,
          metadata: {
            orderId,
            orderCode: order.orderCode,
            ...(tableLabel ? { tableLabel } : {}),
            autoCancelMinutes,
            cancelledItemCount,
            cancelledItems: expiredItems.map(
              (item) => `${item.quantity}x ${item.product?.name ?? `#${item.productId}`}`,
            ),
            reason,
          },
        });

        const payload = QrAutoCancelledPayloadSchema.parse({
          orderId,
          orderCode: order.orderCode,
          tableId: order.tableId,
          tableLabel,
          kind: 'ADDON',
          cancelledItemCount,
          autoCancelMinutes,
          cancelledAt: now.toISOString(),
          reason,
        });

        return { payload, totalAmount: totals.totalAmount };
      });

      if (!committed) continue;

      this.gateway.emitTableGridSync({
        orderId: committed.payload.orderId,
        tableId: committed.payload.tableId,
        totalAmount: committed.totalAmount,
      });
      this.gateway.emitQrAutoCancelled(committed.payload.orderId, committed.payload);
      events.push(committed.payload);
    }

    return events;
  }
}
