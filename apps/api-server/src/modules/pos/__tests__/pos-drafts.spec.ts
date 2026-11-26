import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { KitchenSplitService } from '../kitchen-split.service';
import { PosService } from '../pos.service';
import { TableTransferService } from '../table-transfer.service';

const draftItems = [{ productId: 11, quantity: 2, modifiers: [] }];
const storedDraft = {
  id: 'draft-1', orderType: 'DINE_IN', tableId: 7, items: draftItems, note: null, revision: 2,
  createdBy: 3, updatedBy: 3, submittedOrderId: null, submitIdempotencyKey: null, submittedAt: null,
  createdAt: new Date('2026-11-26T03:00:00.000Z'), updatedAt: new Date('2026-11-26T03:01:00.000Z'),
};

function createHarness() {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 1),
    posDraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 81,
        orderCode: 'HD-20261126-0001',
        orderType: 'DINE_IN',
        tableId: 7,
        takeawayNumber: null,
        status: 'SERVING',
        subtotalAmount: new Prisma.Decimal('200.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('200.00'),
      }),
    },
    diningTable: {
      findUnique: vi.fn().mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null }),
      update: vi.fn(),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([{
        id: 11, name: 'Mì bò', price: new Prisma.Decimal('100.00'), station: 'BEP_NAU', isAvailable: true, modifierGroups: [],
      }]),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const gateway = { emitPosDraftsUpdated: vi.fn(), emitTableGridSync: vi.fn() };
  const auditLog = { record: vi.fn() };
  const kitchen = new KitchenSplitService(prisma as never, gateway as never);
  const transfers = new TableTransferService(prisma as never, gateway as never);
  const service = new PosService(prisma as never, gateway as never, {} as never, kitchen, transfers, auditLog as never);
  return { tx, prisma, gateway, auditLog, service };
}

describe('POS parked drafts', () => {
  it('keeps a stale draft revision unchanged and reports a conflict', async () => {
    const harness = createHarness();
    harness.tx.posDraft.findUnique.mockResolvedValue(storedDraft);

    const error = await harness.service.updatePosDraft('draft-1', {
      expectedRevision: 1,
      orderType: 'DINE_IN',
      tableId: 7,
      items: draftItems,
      note: null,
    }, 3).catch((value: unknown) => value as ConflictException);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'POS_DRAFT_CONCURRENT_MODIFICATION' });
    expect(harness.tx.posDraft.update).not.toHaveBeenCalled();
    expect(harness.tx.order.create).not.toHaveBeenCalled();
  });

  it('submits a draft once at current menu prices and replays the idempotent result', async () => {
    const harness = createHarness();
    harness.tx.posDraft.findUnique
      .mockResolvedValueOnce(storedDraft)
      .mockResolvedValueOnce({ ...storedDraft, submittedOrderId: 81, submitIdempotencyKey: 'draft-submit-key-123456', submittedAt: new Date() });
    harness.tx.order.findUnique.mockResolvedValue({
      id: 81,
      orderCode: 'HD-20261126-0001',
      orderType: 'DINE_IN',
      tableId: 7,
      takeawayNumber: null,
      status: 'SERVING',
      subtotalAmount: new Prisma.Decimal('200.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('200.00'),
      table: { name: 'Bàn 07' },
    });

    const first = await harness.service.submitPosDraft('draft-1', {
      expectedRevision: 2, idempotencyKey: 'draft-submit-key-123456',
    }, 3);
    const replay = await harness.service.submitPosDraft('draft-1', {
      expectedRevision: 2, idempotencyKey: 'draft-submit-key-123456',
    }, 3);

    expect(first).toMatchObject({ idempotentReplay: false, order: { orderId: 81, totalAmount: 200, tableId: 7 } });
    expect(replay).toMatchObject({ idempotentReplay: true, order: { orderId: 81 } });
    expect(harness.tx.order.create).toHaveBeenCalledTimes(1);
    expect(harness.tx.diningTable.update).toHaveBeenCalledTimes(1);
    expect(harness.tx.posDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'draft-1' },
      data: expect.objectContaining({ submittedOrderId: 81, submitIdempotencyKey: 'draft-submit-key-123456' }),
    }));
    expect(harness.gateway.emitPosDraftsUpdated).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft-1', action: 'SUBMITTED',
    }));
    expect(harness.auditLog.record).toHaveBeenCalled();
  });

  it('preserves the draft when the selected table is no longer available', async () => {
    const harness = createHarness();
    harness.tx.posDraft.findUnique.mockResolvedValue(storedDraft);
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 });

    const error = await harness.service.submitPosDraft('draft-1', {
      expectedRevision: 2, idempotencyKey: 'draft-submit-key-123456',
    }, 3).catch((value: unknown) => value as ConflictException);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'POS_TABLE_NOT_AVAILABLE' });
    expect(harness.tx.posDraft.update).not.toHaveBeenCalled();
    expect(harness.tx.order.create).not.toHaveBeenCalled();
  });
});
