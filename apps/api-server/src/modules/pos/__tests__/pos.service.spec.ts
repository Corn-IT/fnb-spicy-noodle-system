import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitchenSplitService } from '../kitchen-split.service';
import { PosService } from '../pos.service';
import { TableTransferService } from '../table-transfer.service';

const product = {
  id: 11,
  name: 'Mì bò',
  price: new Prisma.Decimal('100.00'),
  station: 'BEP_NAU',
  isAvailable: true,
  modifierGroups: [],
};

function createHarness() {
  const lockedTables: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      lockedTables.push(strings.raw.join(''));
      return [];
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      lockedTables.push(strings.raw.join(''));
      return 1;
    }),
    diningTable: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { takeawayNumber: null } }),
      create: vi.fn(),
      update: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { batchNo: 0 } }),
      createMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    product: { findMany: vi.fn().mockResolvedValue([product]) },
    comboItem: { findMany: vi.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const gateway = {
    emitQrNewOrder: vi.fn(),
    emitQrAddonOrder: vi.fn(),
    emitOrderStatusUpdated: vi.fn(),
    emitOrderSessionRedirected: vi.fn(),
    emitTableGridSync: vi.fn(),
  };
  const configuration = {
    get: vi.fn((key: string) => ({
      vietQrBankId: '970415',
      vietQrAccountNo: '1234567890',
      vietQrAccountName: 'QUAN MI CAY',
    } as Record<string, string>)[key]),
  };
  return { tx, prisma, gateway, configuration, lockedTables };
}

function createPosService(harness: ReturnType<typeof createHarness>) {
  const kitchenSplitService = new KitchenSplitService(harness.prisma as never, harness.gateway as never);
  const tableTransferService = new TableTransferService(harness.prisma as never, harness.gateway as never);
  return new PosService(
    harness.prisma as never,
    harness.gateway as never,
    harness.configuration as never,
    kitchenSplitService,
    tableTransferService,
  );
}

describe('PosService', () => {
  afterEach(() => vi.useRealTimers());

  it('should create a takeaway order without a table and allocate its first daily number', async () => {
    const harness = createHarness();
    harness.tx.order.create.mockResolvedValue({
      id: 21, orderCode: 'HD-20261107-0001', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
      tableId: null, takeawayNumber: 1, status: 'SERVING', totalAmount: new Prisma.Decimal('200.00'),
    });
    const service = createPosService(harness);

    const result = await service.createOrder({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 2 }] }, 3);

    expect(result).toMatchObject({ orderId: 21, tableId: null, takeawayNumber: 1, status: 'SERVING', totalAmount: 200 });
    expect(harness.tx.order.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER', tableId: null, takeawayNumber: 1, status: 'SERVING',
    }) }));
  });

  it('should increment takeaway numbers during a business day and reset them after midnight in Vietnam', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T03:00:00.000Z'));
    const firstHarness = createHarness();
    firstHarness.tx.order.aggregate.mockResolvedValue({ _max: { takeawayNumber: 2 } });
    firstHarness.tx.order.create.mockResolvedValue({
      id: 23, orderCode: 'HD-20261108-0001', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
      tableId: null, takeawayNumber: 3, status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'),
    });
    const firstService = createPosService(firstHarness);

    await expect(firstService.createOrder({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 1 }] }, 3))
      .resolves.toMatchObject({ takeawayNumber: 3 });
    expect(firstHarness.tx.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      createdAt: { gte: new Date('2026-11-07T17:00:00.000Z'), lt: new Date('2026-11-08T17:00:00.000Z') },
    }) }));

    vi.setSystemTime(new Date('2026-11-08T17:00:00.000Z'));
    const nextDayHarness = createHarness();
    nextDayHarness.tx.order.create.mockResolvedValue({
      id: 24, orderCode: 'HD-20261109-0001', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
      tableId: null, takeawayNumber: 1, status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'),
    });
    const nextDayService = createPosService(nextDayHarness);

    await expect(nextDayService.createOrder({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 1 }] }, 3))
      .resolves.toMatchObject({ takeawayNumber: 1 });
    expect(nextDayHarness.tx.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      createdAt: { gte: new Date('2026-11-08T17:00:00.000Z'), lt: new Date('2026-11-09T17:00:00.000Z') },
    }) }));
  });

  it('should reject a POS dine-in order when its physical table is already occupied', async () => {
    const harness = createHarness();
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 19 });
    const service = createPosService(harness);

    await expect(service.createOrder({ orderType: 'DINE_IN', tableId: 7, items: [{ productId: 11, quantity: 1 }] }, 3))
      .rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.order.create).not.toHaveBeenCalled();
  });

  it('should approve a pending QR order and mark its table occupied under ordered row locks', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', orderSource: 'QR_CODE', tableId: 7, status: 'PENDING',
    });
    harness.tx.order.update.mockResolvedValue({ id: 42, status: 'SERVING' });
    const service = createPosService(harness);

    await expect(service.approveQrOrder(42, { approved: true }, 3)).resolves.toMatchObject({ orderId: 42, status: 'SERVING' });

    expect(harness.lockedTables[0]).toContain('FROM orders');
    expect(harness.lockedTables[1]).toContain('FROM dining_tables');
    expect(harness.tx.order.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { status: 'SERVING', cashierId: 3 } });
    expect(harness.tx.diningTable.update).toHaveBeenCalledWith({
      where: { id: 7 }, data: { status: 'OCCUPIED', activeOrderId: 42 },
    });
  });

  it('should include physical tables and serving takeaways in the POS table grid', async () => {
    const harness = createHarness();
    harness.prisma.diningTable.findMany.mockResolvedValue([{
      id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 42,
      activeOrder: {
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 7, takeawayNumber: null,
        status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'), createdAt: new Date('2026-11-07T08:00:00.000Z'),
      },
    }]);
    harness.prisma.order.findMany.mockResolvedValue([{
      id: 43, orderCode: 'HD-20261107-0008', orderType: 'TAKEAWAY', tableId: null, takeawayNumber: 1,
      status: 'SERVING', totalAmount: new Prisma.Decimal('200.00'), createdAt: new Date('2026-11-07T08:05:00.000Z'),
    }]);
    const service = createPosService(harness);

    const result = await service.getTableGrid();

    expect(result.tables[0]).toMatchObject({ id: 7, activeOrder: { orderId: 42, tableLabel: 'Bàn 07' } });
    expect(result.takeaways[0]).toMatchObject({ orderId: 43, tableId: null, takeawayNumber: 1, tableLabel: 'Mang về #01' });
  });

  it('should map an order detail to its chronological kitchen batches', async () => {
    const harness = createHarness();
    harness.prisma.order.findUnique.mockResolvedValue({
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
      tableId: 7, takeawayNumber: null, status: 'SERVING', paymentMethod: null,
      cashAmount: new Prisma.Decimal(0), transferAmount: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal('100.00'),
      note: null, createdAt: new Date('2026-11-07T08:00:00.000Z'), paidAt: null,
      table: { id: 7, name: 'Bàn 07' }, tableTransferLogs: [],
      items: [{
        id: 1, productId: 11, quantity: 1, unitPrice: new Prisma.Decimal('100.00'), modifiersSnapshot: [],
        itemNote: null, batchNo: 1, kitchenStatus: 'PRINTED', product: { id: 11, name: 'Mì bò' },
      }],
    });
    const service = createPosService(harness);

    const result = await service.getOrder(42);

    expect(result).toMatchObject({ orderId: 42, tableLabel: 'Bàn 07', items: [{ name: 'Mì bò', batchNo: 1, lineTotal: 100 }] });
  });

  it('should route an add-on from an old QR tab to its moved active order', async () => {
    const harness = createHarness();
    harness.prisma.diningTable.findUnique.mockResolvedValue({ id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null });
    harness.tx.order.findUnique.mockResolvedValue({
      id: 538, orderCode: 'HD-20261107-0039', orderType: 'DINE_IN', orderSource: 'QR_CODE',
      tableId: 7, takeawayNumber: null, status: 'SERVING', mergedIntoOrderId: null,
      table: { id: 7, name: 'Bàn 07' }, totalAmount: new Prisma.Decimal('100.00'),
    });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 1 } });
    harness.tx.order.update.mockResolvedValue({ id: 538, totalAmount: new Prisma.Decimal('200.00') });
    const service = createPosService(harness);

    const result = await service.createQrOrder({
      qrToken: 'a'.repeat(64), activeOrderId: 538, items: [{ productId: 11, quantity: 1 }],
    });

    expect(result).toMatchObject({ orderId: 538, currentTableLabel: 'Bàn 07', batchNo: 2 });
    expect(harness.tx.order.create).not.toHaveBeenCalled();
    expect(harness.tx.orderItem.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ orderId: 538, batchNo: 2 })] }));
    expect(harness.gateway.emitQrAddonOrder).toHaveBeenCalledOnce();
  });

  it('should route an add-on from a merged QR session to the surviving order', async () => {
    const harness = createHarness();
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null });
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 538, mergedIntoOrderId: 540 })
      .mockResolvedValueOnce({
        id: 538, orderCode: 'HD-20261107-0039', orderType: 'DINE_IN', orderSource: 'QR_CODE',
        tableId: 1, takeawayNumber: null, status: 'MERGED', mergedIntoOrderId: 540,
        table: { id: 1, name: 'Bàn 01' }, totalAmount: new Prisma.Decimal('100.00'),
      })
      .mockResolvedValueOnce({
        id: 540, orderCode: 'HD-20261107-0041', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
        tableId: 7, takeawayNumber: null, status: 'SERVING', mergedIntoOrderId: null,
        table: { id: 7, name: 'Bàn 07' }, totalAmount: new Prisma.Decimal('300.00'),
      });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 2 } });
    harness.tx.order.update.mockResolvedValue({ id: 540, totalAmount: new Prisma.Decimal('400.00') });
    const service = createPosService(harness);

    const result = await service.createQrOrder({
      qrToken: 'a'.repeat(64), activeOrderId: 538, items: [{ productId: 11, quantity: 1 }],
    });

    expect(result).toMatchObject({ orderId: 540, activeOrderId: 540, currentTableLabel: 'Bàn 07', batchNo: 3 });
    expect(harness.tx.orderItem.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ orderId: 540, batchNo: 3 })],
    }));
    expect(harness.tx.order.create).not.toHaveBeenCalled();
  });

  it('should retry QR add-on routing when the source order merges while waiting for its row lock', async () => {
    const harness = createHarness();
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null });
    const mergedSource = {
      id: 538, orderCode: 'HD-20261107-0039', orderType: 'DINE_IN', orderSource: 'QR_CODE',
      tableId: 1, takeawayNumber: null, status: 'MERGED', mergedIntoOrderId: 540,
      table: { id: 1, name: 'Bàn 01' }, totalAmount: new Prisma.Decimal('100.00'),
    };
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 538, mergedIntoOrderId: null })
      .mockResolvedValueOnce(mergedSource)
      .mockResolvedValueOnce({ id: 538, mergedIntoOrderId: 540 })
      .mockResolvedValueOnce(mergedSource)
      .mockResolvedValueOnce({
        id: 540, orderCode: 'HD-20261107-0041', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
        tableId: 7, takeawayNumber: null, status: 'SERVING', mergedIntoOrderId: null,
        table: { id: 7, name: 'Bàn 07' }, totalAmount: new Prisma.Decimal('300.00'),
      });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 2 } });
    harness.tx.order.update.mockResolvedValue({ id: 540, totalAmount: new Prisma.Decimal('400.00') });
    const service = createPosService(harness);

    const result = await service.createQrOrder({
      qrToken: 'a'.repeat(64), activeOrderId: 538, items: [{ productId: 11, quantity: 1 }],
    });

    expect(result).toMatchObject({ orderId: 540, currentTableLabel: 'Bàn 07' });
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(harness.lockedTables).toHaveLength(2);
    expect(harness.lockedTables.every((sql) => sql.includes('FROM orders'))).toBe(true);
  });

  it('should return a VietQR provisional bill without changing the serving order', async () => {
    const harness = createHarness();
    harness.prisma.order.findUnique.mockResolvedValue({
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
      tableId: 7, takeawayNumber: null, status: 'SERVING', totalAmount: new Prisma.Decimal('129000.00'),
      table: { id: 7, name: 'Bàn 07', status: 'OCCUPIED' },
      items: [{ id: 1, quantity: 1, unitPrice: new Prisma.Decimal('129000.00'), itemNote: null, modifiersSnapshot: [], product: { name: 'Mì bò' } }],
    });
    const service = createPosService(harness);

    const result = await service.getProvisionalBill(42);

    expect(result).toMatchObject({ status: 'SERVING', totalAmount: 129000 });
    expect(result.vietQrPayload).toContain('amount=129000');
    expect(result.vietQrPayload).toContain('addInfo=TT+HD-20261107-0007');
    expect(harness.prisma.order.update).not.toHaveBeenCalled();
    expect(harness.prisma.diningTable.update).not.toHaveBeenCalled();
  });

  it('should check out split payment after locking the order before its dining table', async () => {
    const harness = createHarness();
    const order = {
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 7, status: 'SERVING',
      totalAmount: new Prisma.Decimal('129000.00'),
    };
    harness.tx.order.findUnique.mockResolvedValue(order);
    harness.tx.order.update.mockResolvedValue({ ...order, status: 'PAID', paidAt: new Date('2026-11-07T10:00:00.000Z') });
    harness.tx.diningTable.update.mockResolvedValue({ id: 7, status: 'AVAILABLE', activeOrderId: null });
    const service = createPosService(harness);

    await service.checkout(42, { paymentMethod: 'SPLIT', totalAmount: 129000, cashAmount: 60000, transferAmount: 69000 }, 3);

    expect(harness.lockedTables[0]).toContain('FROM orders');
    expect(harness.lockedTables[1]).toContain('FROM dining_tables');
    expect(harness.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'PAID', paymentMethod: 'SPLIT', cashAmount: new Prisma.Decimal(60000), transferAmount: new Prisma.Decimal(69000), cashierId: 3,
    }) }));
    expect(harness.tx.diningTable.update).toHaveBeenCalledWith({
      where: { id: 7 }, data: { status: 'AVAILABLE', activeOrderId: null },
    });
    expect(harness.gateway.emitOrderStatusUpdated).toHaveBeenCalledWith(42, expect.objectContaining({ status: 'PAID' }));
  });

  it('should return an idempotent empty kitchen split when every item was already printed', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({ id: 42, status: 'SERVING', tableId: 7, orderType: 'DINE_IN', items: [] });
    harness.tx.orderItem.findMany.mockResolvedValue([]);
    const service = createPosService(harness);

    await expect(service.splitKitchen(42)).resolves.toMatchObject({ batchNo: null, tickets: [], message: expect.any(String) });
    expect(harness.tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('should split only NEW items and annotate add-on tickets with batch and latest transfer information', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', status: 'SERVING', tableId: 7,
        tableTransferLogs: [{ fromTable: 'Bàn 01', toTable: 'Bàn 07' }],
        items: [{
          id: 3, productId: 11, quantity: 2, kitchenStatus: 'NEW', batchNo: 2,
          modifiersSnapshot: [{ name: 'Cấp độ 3' }], itemNote: 'Ít cay',
          product: { id: 11, name: 'Mì bò', station: 'BEP_NAU' },
        }],
      });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 1 } });

    const service = createPosService(harness);
    const result = await service.splitKitchen(42);

    expect(result).toMatchObject({
      batchNo: 2,
      tickets: [{
        station: 'BEP_NAU', batchNo: 2,
        batchLabel: '[GỌI THÊM - LƯỢT 2]',
        transferNotice: '[GHI CHÚ ĐỔI BÀN: Chuyển từ Bàn 01 sang Bàn 07]',
        items: [{ name: 'Mì bò', qty: 2, modifiers: ['Cấp độ 3'], note: 'Ít cay' }],
      }],
    });
    expect(harness.tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3] }, kitchenStatus: 'NEW' },
      data: { kitchenStatus: 'PRINTED', batchNo: 2 },
    });
  });

  it('should explode combo quantities into physical kitchen stations', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', status: 'SERVING', tableId: null,
        items: [{
          id: 3, productId: 90, quantity: 2, kitchenStatus: 'NEW', batchNo: 1,
          modifiersSnapshot: [], itemNote: null,
          product: { id: 90, name: 'Combo đôi', station: 'COMBO' },
        }],
      });
    harness.tx.comboItem.findMany.mockResolvedValue([
      { parentProductId: 90, childProductId: 11, quantity: 1, childProduct: { id: 11, name: 'Mì bò', station: 'BEP_NAU' } },
      { parentProductId: 90, childProductId: 12, quantity: 2, childProduct: { id: 12, name: 'Khoai chiên', station: 'BEP_CHIEN' } },
      { parentProductId: 90, childProductId: 13, quantity: 1, childProduct: { id: 13, name: 'Trà đào', station: 'PHA_CHE' } },
    ]);

    const service = createPosService(harness);
    const result = await service.splitKitchen(42);

    expect(result.tickets.map((ticket) => ticket.station)).toEqual(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);
    expect(result.tickets.map((ticket) => ticket.items[0]?.qty)).toEqual([2, 4, 2]);
    expect(result.tickets.some((ticket) => ticket.station === 'COMBO')).toBe(false);
  });

  it('should hard delete a NEW item and recalculate the order without a cancellation slip', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({
      id: 42, status: 'SERVING', orderType: 'DINE_IN', tableId: 7,
      table: { id: 7, name: 'Bàn 07' },
      items: [{ id: 1, orderId: 42, productId: 11, quantity: 1, unitPrice: new Prisma.Decimal('100.00'),
        modifiersSnapshot: [], itemNote: null, batchNo: 1, kitchenStatus: 'NEW', product }],
    });
    harness.tx.orderItem.findMany.mockResolvedValue([]);
    harness.tx.order.update.mockResolvedValue({ id: 42, totalAmount: new Prisma.Decimal(0) });
    const service = createPosService(harness);

    const result = await service.patchOrderItems(42, { removeItemIds: [1] });

    expect(harness.tx.orderItem.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result).toMatchObject({ totalAmount: 0, requireCancellationSlip: false, kitchenCancellationSlips: [] });
  });

  it('should mark a PRINTED item cancelled and return its station cancellation slip', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({
      id: 42, status: 'SERVING', orderType: 'DINE_IN', tableId: 7,
      table: { id: 7, name: 'Bàn 07' },
      items: [{ id: 1, orderId: 42, productId: 11, quantity: 1, unitPrice: new Prisma.Decimal('100.00'),
        modifiersSnapshot: [], itemNote: null, batchNo: 1, kitchenStatus: 'PRINTED', product }],
    });
    harness.tx.orderItem.findMany.mockResolvedValue([]);
    harness.tx.orderItem.update.mockResolvedValue({ id: 1, kitchenStatus: 'CANCELLED' });
    harness.tx.order.update.mockResolvedValue({ id: 42, totalAmount: new Prisma.Decimal(0) });
    const service = createPosService(harness);

    const result = await service.patchOrderItems(42, { removeItemIds: [1] });

    expect(harness.tx.orderItem.delete).not.toHaveBeenCalled();
    expect(harness.tx.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { kitchenStatus: 'CANCELLED' } });
    expect(result).toMatchObject({
      totalAmount: 0, requireCancellationSlip: true,
      kitchenCancellationSlips: [{ station: 'BEP_NAU', tableLabel: 'Bàn 07', itemName: 'Mì bò', quantity: 1 }],
    });
  });

  it('should move an open dine-in order to an available table while preserving kitchen state', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
      tableId: 1, status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'), tableTransferLogs: [],
      table: { id: 1, name: 'Bàn 01' },
      items: [{ id: 1, productId: 11, quantity: 1, unitPrice: new Prisma.Decimal('100.00'), kitchenStatus: 'PRINTED', product }],
    });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null }
      : { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 42 });
    harness.tx.order.update.mockResolvedValue({ id: 42, tableId: 7 });
    harness.tx.diningTable.update.mockResolvedValue({});
    const service = createPosService(harness);

    const result = await service.tableAction(42, { action: 'MOVE', targetTableId: 7, reason: 'Khách đổi bàn' });

    expect(result).toMatchObject({ action: 'MOVE', sourceTableId: 1, targetTableId: 7, requireKitchenNoticePrint: true });
    expect(harness.lockedTables[0]).toContain('FROM orders');
    expect(harness.lockedTables[1]).toContain('FROM dining_tables');
    expect(harness.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 }, data: expect.objectContaining({ tableId: 7 }) }));
    expect(harness.gateway.emitOrderSessionRedirected).toHaveBeenCalledWith(42, expect.objectContaining({ newTableLabel: 'Bàn 07' }));
    expect(result).toMatchObject({ kitchenTransferSlip: {
      orderCode: 'HD-20261107-0007', fromLabel: 'Bàn 01', toLabel: 'Bàn 07', affectedStations: ['BEP_NAU'],
    } });
  });

  it('should exchange occupied table sessions without violating the active-order unique index', async () => {
    const harness = createHarness();
    const orders = new Map<number, { tableId: number; status: string; tableTransferLogs: unknown[] }>([
      [42, { tableId: 1, status: 'SERVING', tableTransferLogs: [] }],
      [99, { tableId: 7, status: 'SERVING', tableTransferLogs: [] }],
    ]);
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1, status: 'SERVING', table: { id: 1, name: 'Bàn 01' } })
      .mockResolvedValueOnce({ id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1, status: 'SERVING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [] })
      .mockResolvedValueOnce({ id: 99, orderCode: 'HD-20261107-0008', orderType: 'DINE_IN', tableId: 7, status: 'SERVING', tableTransferLogs: [], items: [] });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 42 });
    harness.tx.order.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
      const current = orders.get(where.id)!;
      const next = { ...current, ...data } as typeof current;
      if (next.status === 'PENDING' || next.status === 'SERVING') {
        const duplicate = [...orders.entries()].some(([otherId, other]) => otherId !== where.id
          && (other.status === 'PENDING' || other.status === 'SERVING') && other.tableId === next.tableId);
        if (duplicate) throw new Error('idx_one_active_order_per_table violation');
      }
      orders.set(where.id, next);
      return { id: where.id, ...next };
    });
    harness.tx.order.updateMany.mockImplementation(async ({ where, data }: {
      where: { id: { in: number[] } };
      data: Record<string, unknown>;
    }) => {
      for (const id of where.id.in) {
        orders.set(id, { ...orders.get(id)!, ...data } as { tableId: number; status: string; tableTransferLogs: unknown[] });
      }
      return { count: where.id.in.length };
    });

    const service = createPosService(harness);

    await expect(service.tableAction(42, { action: 'SWAP', targetTableId: 7, reason: 'Khách đổi bàn' })).resolves.toMatchObject({ action: 'SWAP' });
    expect(orders.get(42)?.tableId).toBe(7);
    expect(orders.get(99)?.tableId).toBe(1);
  });

  it('should reject merging an order into its own occupied table', async () => {
    const harness = createHarness();
    const order = {
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
      status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'), tableTransferLogs: [],
      table: { id: 1, name: 'Bàn 01' }, items: [],
    };
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(order);
    harness.tx.diningTable.findUnique.mockResolvedValue({
      id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 42,
    });
    const service = createPosService(harness);

    await expect(service.tableAction(42, { action: 'MERGE', targetTableId: 1, reason: 'Gộp cùng bàn' }))
      .rejects.toMatchObject({ response: { code: 'POS_TABLE_NOT_OCCUPIED' } });
    expect(harness.tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('should revalidate that the source order is still open after acquiring table action locks', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1, status: 'SERVING',
        table: { id: 1, name: 'Bàn 01' },
      })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1, status: 'PAID',
        table: { id: 1, name: 'Bàn 01' }, items: [],
      });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null }
      : { id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null });
    const service = createPosService(harness);

    await expect(service.tableAction(42, { action: 'MOVE', targetTableId: 7, reason: 'Khách đổi bàn' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('should snapshot REMOVED_DEFAULT and SUBSTITUTED modifiers accurately when 2 main ingredients are unchecked', async () => {
    const harness = createHarness();
    harness.tx.product.findMany.mockResolvedValue([{
      id: 99,
      name: 'Mì cay hải sản',
      price: new Prisma.Decimal('79000.00'),
      station: 'BEP_NAU',
      isAvailable: true,
      modifierGroups: [
        {
          id: 1,
          name: 'Cấp độ cay',
          isRequired: true,
          maxSelect: 1,
          modifiers: [{ id: 101, name: 'Cấp 3', extraPrice: new Prisma.Decimal('0.00') }],
        },
        {
          id: 2,
          name: 'Đồ ăn mặc định (0đ)',
          isRequired: false,
          maxSelect: 6,
          isAutoSelect: true,
          modifiers: [
            { id: 201, name: 'Rau', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true },
            { id: 202, name: 'Ngô', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true },
          ],
        },
        {
          id: 3,
          name: 'Đồ ăn chính của món',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: true,
          allowSubstitution: true,
          modifiers: [
            { id: 301, name: 'Tôm', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, defaultSubstituteName: 'Mực' },
            { id: 302, name: 'Ngao', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, defaultSubstituteName: 'Mực' },
            { id: 303, name: 'Mực', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, defaultSubstituteName: 'Tôm' },
          ],
        },
        {
          id: 4,
          name: 'Đồ ăn thêm',
          isRequired: false,
          maxSelect: 10,
          modifiers: [
            { id: 401, name: 'Bò Mỹ', extraPrice: new Prisma.Decimal('10000.00') },
          ],
        },
      ],
    }]);
    harness.tx.order.create.mockResolvedValue({
      id: 88,
      orderCode: 'HD-20261110-0001',
      orderType: 'TAKEAWAY',
      tableId: null,
      takeawayNumber: 1,
      status: 'SERVING',
      totalAmount: new Prisma.Decimal('89000.00'),
    });
    const service = createPosService(harness);

    await service.createOrder({
      orderType: 'TAKEAWAY',
      items: [{
        productId: 99,
        quantity: 1,
        modifiers: [
          { groupId: 1, modifierId: 101 },
          { groupId: 2, modifierId: 201, action: 'REMOVED_DEFAULT' },
          { groupId: 3, modifierId: 302, action: 'SUBSTITUTED' },
          { groupId: 3, modifierId: 303, action: 'SUBSTITUTED' },
          { groupId: 4, modifierId: 401, action: 'SELECTED' },
        ],
      }],
    }, 1);

    expect(harness.tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalAmount: new Prisma.Decimal('89000.00'),
        items: {
          create: [expect.objectContaining({
            unitPrice: new Prisma.Decimal('89000.00'),
            modifiersSnapshot: [
              { groupId: 1, modifierId: 101, name: 'Cấp 3', extraPrice: '0.00' },
              { groupId: 2, modifierId: 201, name: 'Không Rau', extraPrice: '0.00', action: 'REMOVED_DEFAULT' },
              { groupId: 3, modifierId: 302, name: 'Không Ngao (Thay bằng Tôm)', extraPrice: '0.00', action: 'SUBSTITUTED', substituteName: 'Tôm' },
              { groupId: 3, modifierId: 303, name: 'Không Mực (Thay bằng Tôm)', extraPrice: '0.00', action: 'SUBSTITUTED', substituteName: 'Tôm' },
              { groupId: 4, modifierId: 401, name: 'Bò Mỹ', extraPrice: '10000.00' },
            ],
          })],
        },
      }),
    }));
  });
});
