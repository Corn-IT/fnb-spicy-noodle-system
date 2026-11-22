import { Prisma } from '@prisma/client';
import { STORE_MESSAGES_NORMALIZED_NAME } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { QrAutoCancelService } from '../qr-auto-cancel.service';

function createHarness() {
  const lockedTables: string[] = [];
  let transactionCommitted = false;

  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ? ');
      lockedTables.push(sql);
      return [{ id: 1 }];
    }),
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    diningTable: {
      update: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const prisma = {
    masterData: {
      findUnique: vi.fn(async () => null),
    },
    order: {
      findMany: vi.fn(async () => []),
    },
    orderItem: {
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (cb: (client: typeof tx) => Promise<unknown>) => {
      transactionCommitted = false;
      const out = await cb(tx);
      transactionCommitted = true;
      return out;
    }),
  };

  const gateway = {
    emitOrderStatusUpdated: vi.fn(() => expect(transactionCommitted).toBe(true)),
    emitTableGridSync: vi.fn(() => expect(transactionCommitted).toBe(true)),
    emitQrAutoCancelled: vi.fn(() => expect(transactionCommitted).toBe(true)),
  };

  const auditLogService = {
    record: vi.fn(async () => undefined),
  };

  return { prisma, tx, gateway, auditLogService, lockedTables };
}

describe('QrAutoCancelService (12-minute auto-cancel & row-lock safety)', () => {
  it('voids expired PENDING QR order after 12 minutes, locks orders before dining_tables, frees table, and logs audit', async () => {
    const h = createHarness();
    const now = new Date('2026-11-17T12:15:00.000Z');
    const createdAt = new Date('2026-11-17T12:02:00.000Z'); // 13 mins ago

    h.prisma.order.findMany.mockResolvedValue([{ id: 101 }]);
    h.tx.order.findUnique.mockResolvedValue({
      id: 101,
      orderCode: 'HD-20261117-0101',
      orderType: 'DINE_IN',
      orderSource: 'QR_CODE',
      tableId: 5,
      takeawayNumber: null,
      status: 'PENDING',
      createdAt,
      table: { id: 5, name: 'Bàn 05', activeOrderId: 101 },
      _count: { items: 2 },
    });

    const service = new QrAutoCancelService(h.prisma as never, h.gateway as never, h.auditLogService as never);
    const events = await service.sweepExpiredQrRequests(now);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderId: 101,
      orderCode: 'HD-20261117-0101',
      tableId: 5,
      tableLabel: 'Bàn 05',
      kind: 'NEW',
      cancelledItemCount: 2,
      autoCancelMinutes: 12,
    });

    // Strict Invariant 5: lock orders FIRST, then dining_tables
    expect(h.lockedTables).toHaveLength(2);
    expect(h.lockedTables[0]).toContain('FROM orders');
    expect(h.lockedTables[1]).toContain('FROM dining_tables');

    expect(h.tx.order.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: {
        status: 'VOIDED',
        voidReason: 'Tự động huỷ do quá 12 phút chưa xác nhận',
      },
    });
    expect(h.tx.diningTable.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { status: 'AVAILABLE', activeOrderId: null },
    });
    expect(h.auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'POS',
        action: 'Tự động huỷ đơn QR',
        actor: null,
      }),
    );
    expect(h.gateway.emitOrderStatusUpdated).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ status: 'VOIDED' }),
    );
    expect(h.gateway.emitTableGridSync).toHaveBeenCalledWith({
      orderId: 101,
      tableId: 5,
      status: 'AVAILABLE',
    });
    expect(h.gateway.emitQrAutoCancelled).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ kind: 'NEW', tableLabel: 'Bàn 05' }),
    );
  });

  it('aborts auto-cancel cleanly when a PENDING QR order is approved concurrently before acquiring row lock', async () => {
    const h = createHarness();
    const now = new Date('2026-11-17T12:15:00.000Z');
    h.prisma.order.findMany.mockResolvedValue([{ id: 102 }]);
    h.tx.order.findUnique.mockResolvedValue({
      id: 102,
      orderCode: 'HD-20261117-0102',
      orderType: 'DINE_IN',
      orderSource: 'QR_CODE',
      tableId: 6,
      takeawayNumber: null,
      status: 'SERVING',
      createdAt: new Date('2026-11-17T12:00:00.000Z'),
      table: { id: 6, name: 'Bàn 06', activeOrderId: 102 },
      _count: { items: 1 },
    });

    const service = new QrAutoCancelService(h.prisma as never, h.gateway as never, h.auditLogService as never);
    const events = await service.sweepExpiredQrRequests(now);

    expect(events).toEqual([]);
    expect(h.tx.order.update).not.toHaveBeenCalled();
    expect(h.tx.diningTable.update).not.toHaveBeenCalled();
    expect(h.gateway.emitQrAutoCancelled).not.toHaveBeenCalled();
  });

  it('cancels ONLY expired QR addon items on an OCCUPIED table, preserves table and PRINTED round-1 items, and recomputes totals', async () => {
    const h = createHarness();
    const now = new Date('2026-11-17T12:20:00.000Z');

    h.prisma.orderItem.findMany.mockResolvedValue([{ orderId: 205 }]);
    h.tx.order.findUnique.mockResolvedValue({
      id: 205,
      orderCode: 'HD-20261117-0205',
      orderType: 'DINE_IN',
      tableId: 9,
      takeawayNumber: null,
      status: 'SERVING',
      discountSnapshot: null,
      table: { id: 9, name: 'Bàn 09' },
    });

    // Query 1: expired QR addon items inside tx; Query 2: recomputeOrderTotals remaining active items
    h.tx.orderItem.findMany
      .mockResolvedValueOnce([
        { id: 88, productId: 12, quantity: 2, product: { name: 'Khoai tây chiên' } },
      ])
      .mockResolvedValueOnce([
        { quantity: 1, unitPrice: new Prisma.Decimal('59000.00'), product: { categoryId: 1 } },
      ]);

    const service = new QrAutoCancelService(h.prisma as never, h.gateway as never, h.auditLogService as never);
    const events = await service.sweepExpiredQrRequests(now);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderId: 205,
      tableId: 9,
      tableLabel: 'Bàn 09',
      kind: 'ADDON',
      cancelledItemCount: 2,
      autoCancelMinutes: 12,
    });
    expect(h.tx.diningTable.update).not.toHaveBeenCalled();
    expect(h.tx.orderItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [88] }, kitchenStatus: 'NEW' },
    });
    expect(h.tx.order.update).toHaveBeenCalledWith({
      where: { id: 205 },
      data: expect.objectContaining({
        totalAmount: new Prisma.Decimal('59000.00'),
      }),
    });
    expect(h.auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'POS',
        action: 'Tự động huỷ món QR',
        actor: null,
      }),
    );
    expect(h.gateway.emitTableGridSync).toHaveBeenCalledWith({
      orderId: 205,
      tableId: 9,
      totalAmount: 59000,
    });
    expect(h.gateway.emitQrAutoCancelled).toHaveBeenCalledWith(
      205,
      expect.objectContaining({ kind: 'ADDON', cancelledItemCount: 2 }),
    );
  });

  it('respects custom pos.voice.reminderConfig from master_data (disabled or custom minutes)', async () => {
    const h = createHarness();
    const now = new Date('2026-11-17T12:15:00.000Z');

    // 1. Auto-cancel disabled via Store Settings
    h.prisma.masterData.findUnique.mockResolvedValueOnce({
      isActive: true,
      metadata: {
        messages: {
          'pos.voice.reminderConfig': {
            title: 'rem=1|remDelay=5|remInt=60|remMax=2|autoCancel=0|autoCancelMin=12',
          },
        },
      },
    });
    const service = new QrAutoCancelService(h.prisma as never, h.gateway as never);
    expect(await service.sweepExpiredQrRequests(now)).toEqual([]);
    expect(h.prisma.order.findMany).not.toHaveBeenCalled();

    // 2. Custom autoCancelMin=8 -> computes cutoff = now - 8 minutes
    h.prisma.masterData.findUnique.mockResolvedValueOnce({
      isActive: true,
      metadata: {
        messages: {
          'pos.voice.reminderConfig': {
            title: 'rem=1|remDelay=3|remInt=30|remMax=2|autoCancel=1|autoCancelMin=8',
          },
        },
      },
    });
    await service.sweepExpiredQrRequests(now);

    expect(STORE_MESSAGES_NORMALIZED_NAME).toBe('store_messages');
    expect(h.prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lte: new Date('2026-11-17T12:07:00.000Z') },
        }),
      }),
    );
  });
});
