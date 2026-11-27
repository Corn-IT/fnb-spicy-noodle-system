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
      delete: vi.fn(),
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
  it('deletes only the draft when a QR order now occupies its saved table', async () => {
    const harness = createHarness();
    harness.tx.posDraft.findUnique.mockResolvedValue(storedDraft);
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'PENDING', activeOrderId: 99 });
    await expect(harness.service.deletePosDraft('draft-1', 2, 3)).resolves.toEqual({ id: 'draft-1', deleted: true });
    expect(harness.tx.posDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    expect(harness.tx.order.create).not.toHaveBeenCalled();
    expect(harness.tx.order.findUnique).not.toHaveBeenCalled();
    expect(harness.tx.diningTable.update).not.toHaveBeenCalled();
    expect(harness.tx.diningTable.findUnique).not.toHaveBeenCalled();
    expect(harness.gateway.emitTableGridSync).not.toHaveBeenCalled();
  });

  it('preserves a saved draft and table state when deletion uses a stale revision', async () => {
    const harness = createHarness();
    harness.tx.posDraft.findUnique.mockResolvedValue(storedDraft);
    await expect(harness.service.deletePosDraft('draft-1', 1, 3)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.posDraft.delete).not.toHaveBeenCalled();
    expect(harness.tx.diningTable.update).not.toHaveBeenCalled();
  });

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

  it('preserves the draft when a QR order takes the selected table before submit', async () => {
    const harness = createHarness();
    harness.tx.posDraft.findUnique.mockResolvedValue(storedDraft);
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'PENDING', activeOrderId: 99 });

    const error = await harness.service.submitPosDraft('draft-1', {
      expectedRevision: 2, idempotencyKey: 'draft-submit-key-123456',
    }, 3).catch((value: unknown) => value as ConflictException);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'POS_TABLE_NOT_AVAILABLE' });
    expect(harness.tx.posDraft.update).not.toHaveBeenCalled();
    expect(harness.tx.order.create).not.toHaveBeenCalled();
  });

  it('lists and creates POS drafts and enforces table CRUD + Invariant 2 + modifier mapping', async () => {
    const h = createHarness();
    Object.assign(h.tx.posDraft, {
      findMany: vi.fn().mockResolvedValue([storedDraft]),
      create: vi.fn().mockResolvedValue(storedDraft),
    });
    Object.assign(h.tx.diningTable, {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 20, name: 'Bàn 20', status: 'AVAILABLE', activeOrderId: null }),
      findUnique: vi.fn().mockResolvedValue({ id: 20, name: 'Bàn 20', status: 'AVAILABLE', activeOrderId: null }),
      update: vi.fn().mockResolvedValue({ id: 20, name: 'Bàn 20 VIP', status: 'AVAILABLE', activeOrderId: null }),
      delete: vi.fn().mockResolvedValue({ id: 20 }),
    });
    Object.assign(h.tx.order, {
      count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      findUnique: vi.fn().mockResolvedValue({
        id: 50,
        orderCode: 'HD-20261127-0050',
        orderType: 'DINE_IN',
        orderSource: 'POS_COUNTER',
        tableId: 7,
        takeawayNumber: null,
        status: 'SERVING',
        subtotalAmount: new Prisma.Decimal('100000'),
        discountAmount: new Prisma.Decimal('0'),
        totalAmount: new Prisma.Decimal('100000'),
        discountSnapshot: null,
        paymentMethod: null,
        cashAmount: new Prisma.Decimal('0'),
        transferAmount: new Prisma.Decimal('0'),
        paymentAccount: null,
        note: null,
        voidReason: null,
        createdAt: new Date('2026-11-27T08:00:00.000Z'),
        paidAt: null,
        table: { id: 7, name: 'Bàn 07', status: 'OCCUPIED' },
        items: [
          {
            id: 1,
            productId: 11,
            quantity: 1,
            unitPrice: new Prisma.Decimal('100000'),
            modifiersSnapshot: [
              { groupId: 1, modifierId: 2, name: 'Cay vừa', extraPrice: 0, action: 'SELECTED' },
              { groupId: 2, modifierId: 3, name: 'Thêm bò', extraPrice: 20000, action: 'SUBSTITUTED', substituteModifierId: 4, substituteName: 'Bò viên' },
            ],
            itemNote: null,
            batchNo: 1,
            itemSource: 'POS_COUNTER',
            kitchenStatus: 'PRINTED',
            isTakeaway: false,
            createdAt: new Date('2026-11-27T08:00:00.000Z'),
            product: { id: 11, name: 'Mì bò', categoryId: 1, station: 'BEP_NAU' },
          },
        ],
        tableTransferLogs: [],
      }),
    });
    const gateway = {
      emitPosDraftsUpdated: vi.fn(),
      emitTableGridSync: vi.fn(),
      emitOrderStatusUpdated: vi.fn(),
    };
    const auditLog = { record: vi.fn() };
    const discountsSvc = { findApplicableForOrderItems: vi.fn().mockResolvedValue([]) };
    const svc = new PosService(
      h.prisma as never,
      gateway as never,
      {} as never,
      new KitchenSplitService(h.prisma as never, gateway as never),
      new TableTransferService(h.prisma as never, gateway as never),
      auditLog as never,
      undefined,
      discountsSvc as never,
    );

    const listed = await svc.listPosDrafts();
    expect(listed.drafts).toHaveLength(1);

    const created = await svc.createPosDraft(
      { orderType: 'DINE_IN', tableId: 7, items: draftItems, note: null },
      3,
    );
    expect(created.id).toBe('draft-1');

    // Table CRUD + Invariant 2 check
    await expect(svc.createTable({ name: 'Bàn Mang về' }, 1)).rejects.toMatchObject({ status: 400 });
    const createdTbl = await svc.createTable({ name: 'Bàn 20' }, 1);
    expect(createdTbl).toMatchObject({ id: 20, name: 'Bàn 20' });
    const updatedTbl = await svc.updateTable(20, { name: 'Bàn 20 VIP' }, 1);
    expect(updatedTbl.name).toBe('Bàn 20 VIP');
    const deletedTbl = await svc.deleteTable(20, 1);
    expect(deletedTbl).toEqual({ deleted: true, id: 20, archived: false });

    const detail = await svc.getOrder(50);
    expect(detail.items[0]?.pricedModifiers).toEqual(['Thêm bò']);
    const discounts = await svc.getApplicableDiscounts(50);
    expect(discounts.subtotalAmount).toBe(100000);

    // Additional draft, table guard, archived delete, and takeaway cancel branches
    Object.assign(h.tx.posDraft, {
      findUnique: vi.fn().mockResolvedValueOnce(storedDraft).mockResolvedValueOnce({ ...storedDraft, submittedOrderId: 88 }),
      update: vi.fn().mockResolvedValue({ ...storedDraft, revision: 3 }),
    });
    const updatedDraft = await svc.updatePosDraft('draft-1', {
      expectedRevision: 2, orderType: 'DINE_IN', tableId: 7, items: draftItems, note: null,
    }, 3);
    expect(updatedDraft.revision).toBe(3);

    await expect(svc.deletePosDraft('draft-1', 2, 3)).rejects.toMatchObject({
      response: { code: 'POS_DRAFT_ALREADY_SUBMITTED' },
    });

    // createTable duplicate conflict + updateTable validation & OCCUPIED conflict + deleteTable 30d & archive
    h.tx.diningTable.findFirst = vi.fn().mockResolvedValueOnce({ id: 20, name: 'Bàn 20' });
    await expect(svc.createTable({ name: 'Bàn 20' }, 1)).rejects.toMatchObject({ status: 409 });

    await expect(svc.updateTable(20, { name: 'Mang về' }, 1)).rejects.toMatchObject({ status: 400 });
    h.tx.diningTable.findUnique.mockResolvedValueOnce(null);
    await expect(svc.updateTable(999, { name: 'Bàn X' }, 1)).rejects.toMatchObject({ status: 404 });
    h.tx.diningTable.findUnique.mockResolvedValueOnce({ id: 21, name: 'Bàn 21', status: 'OCCUPIED', activeOrderId: 50 });
    await expect(svc.updateTable(21, { name: 'Bàn 21B' }, 1)).rejects.toMatchObject({ status: 409 });

    h.tx.diningTable.findUnique.mockResolvedValueOnce({ id: 22, name: 'Bàn 22', status: 'AVAILABLE', activeOrderId: null });
    h.tx.order.count = vi.fn().mockResolvedValueOnce(2);
    await expect(svc.deleteTable(22, 1)).rejects.toMatchObject({ status: 400 });

    h.tx.diningTable.findUnique.mockResolvedValueOnce({ id: 23, name: 'Bàn 23', status: 'AVAILABLE', activeOrderId: null });
    h.tx.order.count = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    await expect(svc.deleteTable(23, 1)).resolves.toEqual({ deleted: true, id: 23, archived: true });

    // Cancel SERVING order with PRINTED combo item emits kitchen cancellation slips
    h.tx.order.findUnique
      .mockResolvedValueOnce({ id: 60, tableId: 7 })
      .mockResolvedValueOnce({
        id: 60,
        orderCode: 'HD-60',
        status: 'SERVING',
        tableId: 7,
        orderType: 'DINE_IN',
        takeawayNumber: null,
        cashierId: 1,
        table: { name: 'Bàn 07' },
        items: [
          {
            id: 601,
            quantity: 2,
            product: {
              name: 'Combo A',
              station: 'COMBO',
              comboParents: [{ quantity: 2, childProduct: { name: 'Gà Rán', station: 'BEP_CHIEN' } }],
            },
          },
        ],
      });
    Object.assign(h.tx, {
      orderItem: { deleteMany: vi.fn(), updateMany: vi.fn() },
    });
    h.tx.order.update = vi.fn().mockResolvedValue({ id: 60, orderCode: 'HD-60', status: 'VOIDED' });
    const cancelled = await svc.cancelOrder(60, { voidReason: 'Khách huỷ bàn trước khi lên món' }, 1);
    expect(cancelled.requireCancellationSlip).toBe(true);
    expect(cancelled.kitchenCancellationSlips[0]).toMatchObject({ station: 'BEP_CHIEN', quantity: 4 });
  });

  it('exercises splitCheckout partial SPLIT, full TRANSFER table release, and split validation guards', async () => {
    const h = createHarness();
    const gateway = {
      emitPosDraftsUpdated: vi.fn(),
      emitTableGridSync: vi.fn(),
      emitOrderStatusUpdated: vi.fn(),
    };
    const qrService = {
      selectForAmount: vi.fn().mockResolvedValue({ account: { id: 1 } }),
    };
    const auditLog = { record: vi.fn() };
    Object.assign(h.tx, {
      orderItem: {
        update: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ quantity: 1, unitPrice: new Prisma.Decimal('60000') }]),
      },
      paymentAccount: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      },
    });
    const svc = new PosService(
      h.prisma as never,
      gateway as never,
      {} as never,
      new KitchenSplitService(h.prisma as never, gateway as never),
      new TableTransferService(h.prisma as never, gateway as never),
      auditLog as never,
      qrService as never,
    );

    // 1. NotFound (404)
    h.tx.order.findUnique.mockResolvedValueOnce(null);
    await expect(
      svc.splitCheckout(999, { items: [{ orderItemId: 1, quantity: 1 }], paymentMethod: 'CASH', cashAmount: 60000, transferAmount: 0, printReceipt: false }, 1),
    ).rejects.toMatchObject({ status: 404 });

    const baseOrder = {
      id: 70,
      orderCode: 'HD-70',
      orderType: 'DINE_IN',
      tableId: 5,
      status: 'SERVING',
      discountId: null,
      discountAmount: new Prisma.Decimal('0'),
      discountSnapshot: null,
      paymentAccountId: null,
      takeawayNumber: null,
      takeawayLabelFormat: null,
      table: { id: 5, name: 'Bàn 05' },
      items: [
        {
          id: 1,
          productId: 11,
          quantity: 2,
          unitPrice: new Prisma.Decimal('60000'),
          modifiersSnapshot: [],
          itemNote: null,
          batchNo: 1,
          itemSource: 'POS_COUNTER',
          kitchenStatus: 'PRINTED',
          isTakeaway: false,
          product: { id: 11, name: 'Mì Bò', station: 'BEP_NAU' },
        },
        {
          id: 2,
          productId: 12,
          quantity: 1,
          unitPrice: new Prisma.Decimal('30000'),
          modifiersSnapshot: [],
          itemNote: 'Ít đá',
          batchNo: 1,
          itemSource: 'QR_CODE',
          kitchenStatus: 'NEW',
          isTakeaway: true,
          product: { id: 12, name: 'Trà Đào', station: 'PHA_CHE' },
        },
      ],
    };

    // 2. Non-SERVING (409), bad quantity (400), split mismatch (422)
    h.tx.order.findUnique.mockResolvedValueOnce({ id: 70, tableId: 5 }).mockResolvedValueOnce({ ...baseOrder, status: 'PAID' });
    await expect(
      svc.splitCheckout(70, { items: [{ orderItemId: 1, quantity: 1 }], paymentMethod: 'CASH', cashAmount: 60000, transferAmount: 0, printReceipt: false }, 1),
    ).rejects.toMatchObject({ status: 409 });

    h.tx.order.findUnique.mockResolvedValueOnce({ id: 70, tableId: 5 }).mockResolvedValueOnce(baseOrder);
    await expect(
      svc.splitCheckout(70, { items: [{ orderItemId: 1, quantity: 5 }], paymentMethod: 'CASH', cashAmount: 60000, transferAmount: 0, printReceipt: false }, 1),
    ).rejects.toMatchObject({ status: 400 });

    h.tx.order.findUnique.mockResolvedValueOnce({ id: 70, tableId: 5 }).mockResolvedValueOnce(baseOrder);
    await expect(
      svc.splitCheckout(70, { items: [{ orderItemId: 1, quantity: 1 }], paymentMethod: 'SPLIT', cashAmount: 10000, transferAmount: 10000, printReceipt: false }, 1),
    ).rejects.toMatchObject({ status: 422 });

    // 3. Partial split checkout with SPLIT payment (1 of item #1 + all of item #2 = 90,000)
    h.tx.order.findUnique.mockResolvedValueOnce({ id: 70, tableId: 5 }).mockResolvedValueOnce(baseOrder);
    h.tx.order.findFirst.mockResolvedValueOnce({ orderCode: 'HD-20261128-0001' });
    h.tx.order.create.mockResolvedValueOnce({ id: 71, orderCode: 'HD-20261128-0002' });
    h.tx.order.update = vi.fn().mockResolvedValueOnce({});

    const partial = await svc.splitCheckout(
      70,
      {
        items: [{ orderItemId: 1, quantity: 1 }, { orderItemId: 2, quantity: 1 }],
        paymentMethod: 'SPLIT',
        cashAmount: 40000,
        transferAmount: 50000,
        paymentAccountId: 1,
        printReceipt: false,
      },
      1,
    );
    expect(partial).toMatchObject({
      isFullCheckout: false,
      paidOrderId: 71,
      remainingOrderId: 70,
      paidTotalAmount: 90000,
      remainingTotalAmount: 60000,
      status: 'SERVING',
    });

    // 4. Full split checkout of remaining item -> TRANSFER + releases table to AVAILABLE
    h.tx.order.findUnique.mockResolvedValueOnce({ id: 70, tableId: 5 }).mockResolvedValueOnce({
      ...baseOrder,
      items: [{ ...baseOrder.items[0]!, quantity: 1 }],
    });
    h.tx.order.update.mockResolvedValueOnce({});
    const fullRes = await svc.splitCheckout(
      70,
      {
        items: [{ orderItemId: 1, quantity: 1 }],
        paymentMethod: 'TRANSFER',
        cashAmount: 0,
        transferAmount: 60000,
        printReceipt: true,
      },
      1,
    );
    expect(fullRes).toMatchObject({
      isFullCheckout: true,
      paidOrderId: 70,
      remainingOrderId: null,
      status: 'PAID',
    });
    expect(h.tx.diningTable.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { status: 'AVAILABLE', activeOrderId: null },
    });

    // 5. getSplitProvisionalBill (happy path + validation guards)
    const extQrService = {
      selectForAmount: vi.fn().mockResolvedValue({
        account: { id: 1, bankCode: 'VPB', accountNo: '186877721', accountName: 'LOAN', label: 'TK Chính' },
        brief: { id: 1, label: 'TK Chính', bankCode: 'VPB', bankName: 'VPBank', accountNo: '186877721', accountName: 'LOAN' },
        rotated: false,
        overLimit: false,
      }),
      buildVietQrUrl: vi.fn(() => 'https://img.vietqr.io/image/VPB-186877721-compact2.jpg?amount=60000'),
    };
    const gw2 = { ...gateway, emitQrOrderNotice: vi.fn() };
    const svc2 = new PosService(
      h.prisma as never,
      gw2 as never,
      {} as never,
      new KitchenSplitService(h.prisma as never, gw2 as never),
      new TableTransferService(h.prisma as never, gw2 as never),
      auditLog as never,
      extQrService as never,
    );

    h.prisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(svc2.getSplitProvisionalBill(999, { items: [{ orderItemId: 1, quantity: 1 }] }, 1)).rejects.toMatchObject({ status: 404 });

    h.prisma.order.findUnique.mockResolvedValueOnce({ ...baseOrder, status: 'PAID' });
    await expect(svc2.getSplitProvisionalBill(70, { items: [{ orderItemId: 1, quantity: 1 }] }, 1)).rejects.toMatchObject({ status: 409 });

    h.prisma.order.findUnique.mockResolvedValueOnce({ ...baseOrder, discountId: 5 });
    await expect(svc2.getSplitProvisionalBill(70, { items: [{ orderItemId: 1, quantity: 1 }] }, 1)).rejects.toMatchObject({ status: 409 });

    h.prisma.order.findUnique.mockResolvedValueOnce(baseOrder);
    await expect(svc2.getSplitProvisionalBill(70, { items: [{ orderItemId: 999, quantity: 1 }] }, 1)).rejects.toMatchObject({ status: 400 });

    h.prisma.order.findUnique.mockResolvedValueOnce(baseOrder);
    await expect(svc2.getSplitProvisionalBill(70, { items: [{ orderItemId: 1, quantity: 99 }] }, 1)).rejects.toMatchObject({ status: 400 });

    h.prisma.order.findUnique.mockResolvedValueOnce(baseOrder);
    const splitProv = await svc2.getSplitProvisionalBill(70, { items: [{ orderItemId: 1, quantity: 1 }, { orderItemId: 2, quantity: 1 }] }, 1);
    expect(splitProv.totalAmount).toBe(90000);
    expect(splitProv.items).toHaveLength(2);
    expect(gw2.emitQrOrderNotice).toHaveBeenCalled();

    // 6. approveQrOrder guards & takeaway approval + cancelOrder takeaway & guard + getTableGrid
    h.tx.order.findUnique.mockResolvedValueOnce(null);
    await expect(svc2.approveQrOrder(999, { approved: true }, 1)).rejects.toMatchObject({ status: 404 });

    h.tx.order.findUnique
      .mockResolvedValueOnce({ id: 75, tableId: null })
      .mockResolvedValueOnce({ id: 75, orderCode: 'HD-75', status: 'SERVING', orderSource: 'POS_COUNTER', tableId: null });
    await expect(svc2.approveQrOrder(75, { approved: true }, 1)).rejects.toMatchObject({ status: 409 });

    h.tx.order.findUnique
      .mockResolvedValueOnce({ id: 76, tableId: null })
      .mockResolvedValueOnce({ id: 76, orderCode: 'HD-76', status: 'PENDING', orderSource: 'QR_CODE', orderType: 'TAKEAWAY', tableId: null, takeawayNumber: 3, takeawayLabelFormat: null });
    h.tx.order.update = vi.fn().mockResolvedValueOnce({ id: 76, orderCode: 'HD-76', status: 'SERVING' });
    await expect(svc2.approveQrOrder(76, { approved: true }, 1)).resolves.toEqual({ orderId: 76, status: 'SERVING' });

    h.tx.order.findUnique
      .mockResolvedValueOnce({ id: 77, tableId: null })
      .mockResolvedValueOnce({ id: 77, orderCode: 'HD-77', status: 'SERVING', orderType: 'TAKEAWAY', takeawayNumber: 3, tableId: null, cashierId: 1, items: [] });
    Object.assign(h.tx, { orderItem: { ...((h.tx as { orderItem?: object }).orderItem ?? {}), deleteMany: vi.fn(), updateMany: vi.fn() } });
    h.tx.order.update.mockResolvedValueOnce({ id: 77, orderCode: 'HD-77', status: 'VOIDED' });
    await expect(svc2.cancelOrder(77, { voidReason: 'Khách mang về đổi ý' }, 1)).resolves.toMatchObject({ orderId: 77, status: 'VOIDED' });

    h.tx.order.findUnique
      .mockResolvedValueOnce({ id: 78, tableId: null })
      .mockResolvedValueOnce({ id: 78, status: 'PAID', tableId: null });
    await expect(svc2.cancelOrder(78, { voidReason: 'Đã thanh toán không huỷ được' }, 1)).rejects.toMatchObject({ status: 409 });

    Object.assign(h.prisma, {
      masterData: { findUnique: vi.fn().mockResolvedValue({ metadata: { code: 'mv-static-tok' } }) },
    });
    h.prisma.diningTable.findMany = vi.fn().mockResolvedValue([
      {
        id: 1,
        name: 'Bàn 01',
        status: 'OCCUPIED',
        activeOrderId: 50,
        qrToken: 'short1234',
        activeOrder: {
          id: 50,
          orderCode: 'HD-50',
          orderType: 'DINE_IN',
          orderSource: 'POS_COUNTER',
          tableId: 1,
          takeawayNumber: null,
          takeawayLabelFormat: null,
          status: 'SERVING',
          subtotalAmount: new Prisma.Decimal('120000'),
          discountAmount: new Prisma.Decimal('0'),
          totalAmount: new Prisma.Decimal('120000'),
          createdAt: new Date('2026-11-27T08:00:00.000Z'),
          items: [{ batchNo: 1, kitchenStatus: 'PRINTED', itemSource: 'POS_COUNTER', createdAt: new Date('2026-11-27T08:00:00.000Z') }],
        },
      },
    ]);
    h.prisma.order.findMany = vi.fn().mockResolvedValue([
      {
        id: 51,
        orderCode: 'HD-51',
        orderType: 'TAKEAWAY',
        orderSource: 'QR_CODE',
        tableId: null,
        takeawayNumber: 2,
        takeawayLabelFormat: null,
        status: 'PENDING',
        subtotalAmount: new Prisma.Decimal('40000'),
        discountAmount: new Prisma.Decimal('0'),
        totalAmount: new Prisma.Decimal('40000'),
        createdAt: new Date('2026-11-27T09:00:00.000Z'),
        items: [{ batchNo: 1, kitchenStatus: 'NEW', itemSource: 'QR_CODE', createdAt: new Date('2026-11-27T09:00:00.000Z') }],
      },
    ]);
    const grid = await svc2.getTableGrid();
    expect(grid.tables[0]?.activeOrder?.orderCode).toBe('HD-50');
    expect(grid.takeaways[0]?.orderCode).toBe('HD-51');

    // 7. checkQrOrderStillPending & shortenLegacyQrTokens
    await expect(svc2.checkQrOrderStillPending({ orderId: 0 })).resolves.toEqual({ stillPending: true });
    h.prisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(svc2.checkQrOrderStillPending({ orderId: 99 })).resolves.toEqual({ stillPending: false });

    h.prisma.order.findUnique.mockResolvedValueOnce({ id: 42, status: 'PENDING', orderSource: 'QR_CODE' });
    await expect(svc2.checkQrOrderStillPending({ orderId: 42, kind: 'QR_NEW' })).resolves.toEqual({ stillPending: true });

    h.prisma.order.findUnique.mockResolvedValueOnce({ id: 42, status: 'SERVING', orderSource: 'QR_CODE' });
    Object.assign(h.prisma, { orderItem: { findFirst: vi.fn().mockResolvedValueOnce({ id: 100 }) } });
    await expect(svc2.checkQrOrderStillPending({ orderId: 42, kind: 'QR_ADDON', batchNo: 2 })).resolves.toEqual({ stillPending: true });

    h.prisma.order.findUnique.mockResolvedValueOnce({ id: 42, status: 'PAID', orderSource: 'QR_CODE' });
    await expect(svc2.checkQrOrderStillPending({ orderId: 42, kind: 'QR_OVERDUE_REMINDER' })).resolves.toEqual({ stillPending: false });

    const longLegacyToken = 'a'.repeat(64);
    h.tx.diningTable.findMany = vi.fn().mockResolvedValueOnce([
      { id: 1, name: 'Bàn 01', qrToken: longLegacyToken },
    ]);
    h.tx.diningTable.findUnique = vi.fn().mockResolvedValue(null);
    Object.assign(h.tx, {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, isActive: true, metadata: { qrToken: longLegacyToken } }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    });
    const shortened = await svc2.shortenLegacyQrTokens(1);
    expect(shortened).toEqual({ updatedTables: 1, updatedTakeaway: true });

    const rotated = await svc2.rotateTakeawayQr(1);
    expect(rotated.qrToken).toBeTruthy();

    h.tx.diningTable.findUnique.mockResolvedValueOnce(null);
    await expect(svc2.deleteTable(999, 1)).rejects.toMatchObject({ status: 404 });
    h.tx.diningTable.findUnique.mockResolvedValueOnce({ id: 8, name: 'Bàn 08', status: 'OCCUPIED', activeOrderId: 10 });
    await expect(svc2.deleteTable(8, 1)).rejects.toMatchObject({ status: 409 });

    h.tx.diningTable.findUnique.mockResolvedValueOnce({ id: 9, name: 'Bàn 09', status: 'AVAILABLE', activeOrderId: null });
    h.tx.diningTable.findFirst = vi.fn().mockResolvedValueOnce({ id: 10, name: 'Bàn Trùng' });
    await expect(svc2.updateTable(9, { name: 'Bàn Trùng' }, 1)).rejects.toMatchObject({ status: 409 });

    await expect(svc2.rotateTableQr(999, 1)).rejects.toMatchObject({ status: 404 });

    // 8. submitPosDraft error guards (404, conflicting idempotencyKey, stale revision, empty items, null orderType, null tableId)
    h.tx.posDraft.findUnique.mockResolvedValueOnce(null);
    await expect(svc2.submitPosDraft('missing', { expectedRevision: 1, idempotencyKey: 'k-1234567890-123456' }, 1)).rejects.toMatchObject({ status: 404 });

    h.tx.posDraft.findUnique.mockResolvedValueOnce({ ...storedDraft, submittedOrderId: 90, submitIdempotencyKey: 'other-key-1234567890' });
    await expect(svc2.submitPosDraft('draft-1', { expectedRevision: 2, idempotencyKey: 'k-1234567890-123456' }, 1)).rejects.toMatchObject({
      response: { code: 'POS_DRAFT_ALREADY_SUBMITTED' },
    });

    h.tx.posDraft.findUnique.mockResolvedValueOnce({ ...storedDraft, revision: 9 });
    await expect(svc2.submitPosDraft('draft-1', { expectedRevision: 2, idempotencyKey: 'k-1234567890-123456' }, 1)).rejects.toMatchObject({
      response: { code: 'POS_DRAFT_CONCURRENT_MODIFICATION' },
    });

    h.tx.posDraft.findUnique.mockResolvedValueOnce({ ...storedDraft, items: [] });
    await expect(svc2.submitPosDraft('draft-1', { expectedRevision: 2, idempotencyKey: 'k-1234567890-123456' }, 1)).rejects.toMatchObject({ status: 400 });

    h.tx.posDraft.findUnique.mockResolvedValueOnce({ ...storedDraft, orderType: null, tableId: null });
    await expect(svc2.submitPosDraft('draft-1', { expectedRevision: 2, idempotencyKey: 'k-1234567890-123456' }, 1)).rejects.toMatchObject({ status: 400 });

    h.tx.posDraft.findUnique.mockResolvedValueOnce({ ...storedDraft, orderType: 'DINE_IN', tableId: null });
    await expect(svc2.submitPosDraft('draft-1', { expectedRevision: 2, idempotencyKey: 'k-1234567890-123456' }, 1)).rejects.toMatchObject({ status: 400 });
  });
});
