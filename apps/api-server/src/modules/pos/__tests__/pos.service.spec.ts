import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { ErrorCodes } from '@fnb/shared';
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
  let takeawaySequence = 0;
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.raw.join('');
      lockedTables.push(sql);
      if (sql.includes('INSERT INTO takeaway_sequences')) return [{ takeawayNumber: ++takeawaySequence }];
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
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { takeawayNumber: null } }),
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentAccount: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 1,
          label: 'TK Chính (VPBank)',
          bankCode: 'VPB',
          accountNo: '186877721',
          accountName: 'THAN THI LOAN',
          priority: 1,
          isActive: true,
          dailyLimit: null,
          monthlyLimit: null,
          yearlyLimit: null,
          createdAt: new Date('2026-11-01T00:00:00.000Z'),
          updatedAt: new Date('2026-11-01T00:00:00.000Z'),
        },
      ]),
      findUnique: vi.fn().mockImplementation(async (args: { where: { id: number } }) =>
        args.where.id === 1
          ? {
              id: 1,
              label: 'TK Chính (VPBank)',
              bankCode: 'VPB',
              accountNo: '186877721',
              accountName: 'THAN THI LOAN',
              priority: 1,
              isActive: true,
            }
          : null,
      ),
    },
    orderItem: {
      findMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { batchNo: 0 } }),
      createMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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
    emitQrOrderNotice: vi.fn(),
    emitTableOrderNotice: vi.fn(),
    emitTableQrRotated: vi.fn(),
    emitTableGridSync: vi.fn(),
  };
  const configuration = {
    get: vi.fn((key: string) => ({
      vietQrBankId: '970415',
      vietQrAccountNo: '1234567890',
      vietQrAccountName: 'QUAN MI CAY',
    } as Record<string, string>)[key]),
  };
  return { tx, prisma, gateway, configuration, lockedTables, setTakeawaySequence: (number: number) => { takeawaySequence = number; } };
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
    firstHarness.setTakeawaySequence(2);
    firstHarness.tx.order.create.mockResolvedValue({
      id: 23, orderCode: 'HD-20261108-0001', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
      tableId: null, takeawayNumber: 3, status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'),
    });
    const firstService = createPosService(firstHarness);

    await expect(firstService.createOrder({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 1 }] }, 3))
      .resolves.toMatchObject({ takeawayNumber: 3 });
    expect(firstHarness.lockedTables.some((sql) => sql.includes('INSERT INTO takeaway_sequences'))).toBe(true);

    vi.setSystemTime(new Date('2026-11-08T17:00:00.000Z'));
    const nextDayHarness = createHarness();
    nextDayHarness.tx.order.create.mockResolvedValue({
      id: 24, orderCode: 'HD-20261109-0001', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
      tableId: null, takeawayNumber: 1, status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'),
    });
    const nextDayService = createPosService(nextDayHarness);

    await expect(nextDayService.createOrder({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 1 }] }, 3))
      .resolves.toMatchObject({ takeawayNumber: 1 });
    expect(nextDayHarness.lockedTables.some((sql) => sql.includes('INSERT INTO takeaway_sequences'))).toBe(true);
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
    expect(harness.gateway.emitOrderStatusUpdated).toHaveBeenCalledWith(42, {
      status: 'SERVING',
      message: 'Quầy đã xác nhận đơn, đang chờ chuyển xuống bếp',
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

  it('tracks pendingQrSince and pendingQrKind exclusively for QR orders and QR addons while ignoring manual POS counter items', async () => {
    const harness = createHarness();
    const pendingCreated = new Date('2026-11-17T11:00:00.000Z');
    const qrAddonCreated = new Date('2026-11-17T11:10:00.000Z');

    harness.prisma.diningTable.findMany.mockResolvedValue([
      {
        id: 2,
        name: 'Bàn 02',
        status: 'PENDING',
        activeOrderId: 101,
        activeOrder: {
          id: 101,
          orderCode: 'HD-20261117-0101',
          orderType: 'DINE_IN',
          orderSource: 'QR_CODE',
          tableId: 2,
          takeawayNumber: null,
          status: 'PENDING',
          totalAmount: new Prisma.Decimal('80000.00'),
          createdAt: pendingCreated,
          items: [
            { batchNo: 1, kitchenStatus: 'NEW', itemSource: 'QR_CODE', createdAt: pendingCreated },
          ],
        },
      },
      {
        id: 3,
        name: 'Bàn 03',
        status: 'OCCUPIED',
        activeOrderId: 102,
        activeOrder: {
          id: 102,
          orderCode: 'HD-20261117-0102',
          orderType: 'DINE_IN',
          orderSource: 'QR_CODE',
          tableId: 3,
          takeawayNumber: null,
          status: 'SERVING',
          totalAmount: new Prisma.Decimal('140000.00'),
          createdAt: new Date('2026-11-17T10:30:00.000Z'),
          items: [
            { batchNo: 1, kitchenStatus: 'PRINTED', itemSource: 'QR_CODE', createdAt: new Date('2026-11-17T10:30:00.000Z') },
            { batchNo: 2, kitchenStatus: 'NEW', itemSource: 'QR_CODE', createdAt: qrAddonCreated },
          ],
        },
      },
      {
        id: 4,
        name: 'Bàn 04',
        status: 'OCCUPIED',
        activeOrderId: 103,
        activeOrder: {
          id: 103,
          orderCode: 'HD-20261117-0103',
          orderType: 'DINE_IN',
          orderSource: 'POS_COUNTER',
          tableId: 4,
          takeawayNumber: null,
          status: 'SERVING',
          totalAmount: new Prisma.Decimal('95000.00'),
          createdAt: new Date('2026-11-17T10:45:00.000Z'),
          items: [
            { batchNo: 1, kitchenStatus: 'PRINTED', itemSource: 'POS_COUNTER', createdAt: new Date('2026-11-17T10:45:00.000Z') },
            { batchNo: 2, kitchenStatus: 'NEW', itemSource: 'POS_COUNTER', createdAt: new Date('2026-11-17T11:05:00.000Z') },
          ],
        },
      },
    ]);
    harness.prisma.order.findMany.mockResolvedValue([]);

    const service = createPosService(harness);
    const result = await service.getTableGrid();

    expect(result.tables[0]?.activeOrder).toMatchObject({
      orderId: 101,
      pendingQrKind: 'NEW',
      pendingQrSince: pendingCreated.toISOString(),
    });
    expect(result.tables[1]?.activeOrder).toMatchObject({
      orderId: 102,
      hasUnprintedAddon: true,
      pendingQrKind: 'ADDON',
      pendingQrSince: qrAddonCreated.toISOString(),
    });
    // Manual POS_COUNTER batch-2 item must not expose pendingQrKind/pendingQrSince
    expect(result.tables[2]?.activeOrder?.pendingQrKind).toBeUndefined();
    expect(result.tables[2]?.activeOrder?.pendingQrSince).toBeUndefined();
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
      tableTransferLogs: [{ action: 'MOVE', fromTable: 'Bàn 01', toTable: 'Bàn 07' }],
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

  it('should reject cross-table IDOR and takeaway order hijacking in createQrOrder', async () => {
    const harness = createHarness();
    harness.tx.diningTable.findUnique.mockResolvedValue({ id: 2, name: 'Bàn 02', status: 'AVAILABLE', activeOrderId: null });
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 97, mergedIntoOrderId: null })
      .mockResolvedValueOnce({
        id: 97, orderCode: 'HD-20261118-0097', orderType: 'DINE_IN', orderSource: 'QR_CODE',
        tableId: 1, takeawayNumber: null, status: 'SERVING', mergedIntoOrderId: null,
        tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, totalAmount: new Prisma.Decimal('100.00'),
      })
      .mockResolvedValueOnce({ id: 98, mergedIntoOrderId: null })
      .mockResolvedValueOnce({
        id: 98, orderCode: 'HD-20261118-0098', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
        tableId: null, takeawayNumber: 1, status: 'SERVING', mergedIntoOrderId: null,
        tableTransferLogs: [], table: null, totalAmount: new Prisma.Decimal('100.00'),
      });
    const service = createPosService(harness);

    await expect(service.createQrOrder({
      qrToken: 'b'.repeat(64), activeOrderId: 97, items: [{ productId: 11, quantity: 1 }],
    })).rejects.toThrow(ForbiddenException);
    await expect(service.createQrOrder({
      qrToken: 'b'.repeat(64), activeOrderId: 98, items: [{ productId: 11, quantity: 1 }],
    })).rejects.toThrow(ForbiddenException);
    expect(harness.tx.orderItem.createMany).not.toHaveBeenCalled();
  });

  it('should return a VietQR provisional bill, stamp paymentAccountId, and keep the serving order status unchanged', async () => {
    const harness = createHarness();
    harness.prisma.order.findUnique.mockResolvedValue({
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
      tableId: 7, takeawayNumber: null, status: 'SERVING', totalAmount: new Prisma.Decimal('129000.00'),
      table: { id: 7, name: 'Bàn 07', status: 'OCCUPIED' },
      items: [{ id: 1, quantity: 1, unitPrice: new Prisma.Decimal('129000.00'), itemNote: null, modifiersSnapshot: [], product: { name: 'Mì bò' } }],
    });
    const service = createPosService(harness);

    const result = await service.getProvisionalBill(42);

    expect(result).toMatchObject({
      status: 'SERVING',
      totalAmount: 129000,
      qrRotated: false,
      qrOverLimit: false,
      paymentAccount: {
        id: 1,
        bankCode: 'VPB',
        accountNo: '186877721',
        accountName: 'THAN THI LOAN',
      },
    });
    expect(result.vietQrPayload).toContain('amount=129000');
    expect(result.vietQrPayload).toContain('addInfo=TT+B07+HD-20261107-0007');
    expect(harness.prisma.order.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { paymentAccountId: 1 },
    });
    expect(harness.prisma.diningTable.update).not.toHaveBeenCalled();
  });

  it('should generate a split provisional bill from DB item prices without overwriting the parent order QR', async () => {
    const harness = createHarness();
    harness.prisma.order.findUnique.mockResolvedValue({
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', orderSource: 'POS_COUNTER',
      tableId: 7, takeawayNumber: null, status: 'SERVING', totalAmount: new Prisma.Decimal('200000.00'),
      table: { id: 7, name: 'Bàn 07', status: 'OCCUPIED' },
      items: [
        { id: 1, quantity: 2, kitchenStatus: 'PRINTED', unitPrice: new Prisma.Decimal('100000.00'), itemNote: null, modifiersSnapshot: [], product: { id: 11, name: 'Mì bò' } },
      ],
    });
    const service = createPosService(harness);

    const result = await service.getSplitProvisionalBill(42, {
      items: [{ orderItemId: 1, quantity: 1 }],
    });

    expect(result).toMatchObject({
      status: 'SERVING',
      totalAmount: 100000,
      paymentAccount: { id: 1, bankCode: 'VPB' },
    });
    expect(result.vietQrPayload).toContain('amount=100000');
    expect(harness.prisma.order.update).not.toHaveBeenCalled();
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

  describe('patchOrderItems addItems — cộng dồn món trùng', () => {
    const orderWith = (items: Array<Record<string, unknown>>) => ({
      id: 42, status: 'SERVING', orderType: 'DINE_IN', tableId: 7, orderCode: 'HD-20261124-0042',
      table: { id: 7, name: 'Bàn 07' },
      items: items.map((item, index) => ({
        id: 100 + index, orderId: 42, productId: 11, quantity: 1, unitPrice: new Prisma.Decimal('100.00'),
        modifiersSnapshot: [], itemNote: null, batchNo: 1, kitchenStatus: 'NEW', itemSource: 'POS_COUNTER', product,
        ...item,
      })),
    });

    const run = async (order: ReturnType<typeof orderWith>, addItems: Array<{ productId: number; quantity: number; itemNote?: string }>) => {
      const harness = createHarness();
      harness.tx.order.findUnique.mockResolvedValue(order);
      harness.tx.orderItem.findMany.mockResolvedValue([]);
      harness.tx.order.update.mockResolvedValue({ id: 42, totalAmount: new Prisma.Decimal(0) });
      const service = createPosService(harness);
      await service.patchOrderItems(42, { addItems });
      return harness.tx;
    };

    it('increments the matching NEW counter line inside the locked transaction instead of adding a row', async () => {
      const tx = await run(orderWith([{}]), [{ productId: 11, quantity: 2 }]);
      expect(tx.orderItem.update).toHaveBeenCalledWith({ where: { id: 100 }, data: { quantity: { increment: 2 } } });
      expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    });

    it('keeps a new line when the same dish was already printed, came from a QR guest, has another note or an old price', async () => {
      for (const existing of [
        { kitchenStatus: 'PRINTED' },
        { itemSource: 'QR_CODE' },
        { itemNote: 'Ít cay' },
        { unitPrice: new Prisma.Decimal('90.00') },
      ]) {
        const tx = await run(orderWith([existing]), [{ productId: 11, quantity: 1 }]);
        expect(tx.orderItem.update).not.toHaveBeenCalled();
        expect(tx.orderItem.createMany).toHaveBeenCalledWith({
          data: [expect.objectContaining({ productId: 11, quantity: 1, kitchenStatus: 'NEW', batchNo: 1 })],
        });
      }
    });

    it('folds identical dishes sent in one request into a single new line', async () => {
      const tx = await run(orderWith([]), [
        { productId: 11, quantity: 1 },
        { productId: 11, quantity: 2 },
      ]);
      expect(tx.orderItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ productId: 11, quantity: 3 })],
      });
    });
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

  it('should reject ordering a modifier marked as temporarily out of stock (isAvailable = false)', async () => {
    const harness = createHarness();
    harness.tx.product.findMany.mockResolvedValue([{
      id: 99,
      name: 'Mì Hải Sản',
      price: new Prisma.Decimal('69000.00'),
      station: 'BEP_NAU',
      isAvailable: true,
      modifierGroups: [
        {
          id: 3,
          name: 'Đồ ăn chính',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: true,
          allowSubstitution: true,
          modifiers: [
            { id: 301, name: 'Tôm', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, isAvailable: false, defaultSubstituteName: 'Mực' },
            { id: 302, name: 'Mực', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, isAvailable: true, defaultSubstituteName: 'Tôm' },
          ],
        },
      ],
    }]);
    const service = createPosService(harness);

    await expect(service.createOrder({
      orderType: 'TAKEAWAY',
      items: [{
        productId: 99,
        quantity: 1,
        modifiers: [{ groupId: 3, modifierId: 301, action: 'SELECTED' }],
      }],
    }, 1)).rejects.toThrow(/tạm hết/);
    expect(harness.tx.order.create).not.toHaveBeenCalled();
  });

  it('should clear paymentAccountId when cancelling an active order that previously stamped a provisional QR', async () => {
    const harness = createHarness();
    const servingOrder = {
      id: 88,
      orderCode: 'HD-20261117-0015',
      orderType: 'DINE_IN',
      tableId: 30,
      status: 'SERVING',
      cashierId: 1,
      paymentAccountId: 9,
      table: { id: 30, name: 'Bàn 30', status: 'OCCUPIED' },
    };
    harness.tx.order.findUnique.mockResolvedValue(servingOrder);
    harness.tx.order.update.mockResolvedValue({ ...servingOrder, status: 'VOIDED', paymentAccountId: null });
    harness.tx.diningTable.update.mockResolvedValue({ id: 30, status: 'AVAILABLE', activeOrderId: null });
    const service = createPosService(harness);

    await service.cancelOrder(88, { voidReason: 'Khách huỷ bàn trước khi thanh toán' }, 1);

    expect(harness.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 88 },
      data: expect.objectContaining({
        status: 'VOIDED',
        paymentAccountId: null,
      }),
    }));
    expect(harness.gateway.emitOrderStatusUpdated).toHaveBeenCalledWith(
      88,
      expect.objectContaining({
        status: 'VOIDED',
        reason: 'Khách huỷ bàn trước khi thanh toán',
      }),
    );
  });

  it('should emit QR realtime notices for patchOrderItems cancellations, provisional bills, table QR rotation, and QR order rejection reasons', async () => {
    const harness = createHarness();
    // 1. patchOrderItems removing/reducing items
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 51, tableId: 3 })
      .mockResolvedValueOnce({
        id: 51,
        orderCode: 'HD-51',
        tableId: 3,
        status: 'SERVING',
        totalAmount: new Prisma.Decimal('100.00'),
        discountSnapshot: null,
        table: { id: 3, name: 'Bàn 03' },
        items: [
          {
            id: 201,
            productId: 11,
            quantity: 2,
            unitPrice: new Prisma.Decimal('50.00'),
            modifiersSnapshot: [],
            itemNote: null,
            kitchenStatus: 'NEW',
            product: { name: 'Mì bò', station: 'BEP_NAU', comboParents: [] },
          },
        ],
      });
    harness.tx.orderItem.findMany.mockResolvedValue([{ id: 201, quantity: 1, unitPrice: new Prisma.Decimal('50.00'), modifiersSnapshot: [], product: { categoryId: null } }]);
    harness.tx.product.findMany.mockResolvedValue([{ ...product, price: new Prisma.Decimal('50.00') }]);
    const service = createPosService(harness);

    await service.patchOrderItems(51, { removeItemIds: [201] }, 1);
    expect(harness.gateway.emitQrOrderNotice).toHaveBeenCalledWith(
      51,
      expect.objectContaining({
        orderId: 51,
        tableId: 3,
        kind: 'ITEMS_UPDATED',
        cancelledItems: [{ name: 'Mì bò', quantity: 2 }],
      }),
    );

    // 2. getProvisionalBill -> PROVISIONAL_BILL_PRINTED without leaking payment account/VietQR
    harness.gateway.emitQrOrderNotice.mockClear();
    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: 51,
      orderCode: 'HD-51',
      orderType: 'DINE_IN',
      tableId: 3,
      takeawayNumber: null,
      status: 'SERVING',
      totalAmount: new Prisma.Decimal('50000.00'),
      discountSnapshot: null,
      table: { id: 3, name: 'Bàn 03', status: 'OCCUPIED' },
      items: [],
    });
    await service.getProvisionalBill(51, 1);
    expect(harness.gateway.emitQrOrderNotice).toHaveBeenCalledWith(
      51,
      expect.objectContaining({
        orderId: 51,
        tableId: 3,
        kind: 'PROVISIONAL_BILL_PRINTED',
        totalAmount: 50000,
      }),
    );

    // 3. rotateTableQr -> emits TABLE_QR_ROTATED with activeOrderId
    harness.tx.diningTable.findUnique
      .mockResolvedValueOnce({ id: 3, name: 'Bàn 03', status: 'OCCUPIED', activeOrderId: 51, qrToken: 'ban03-old1' })
      .mockResolvedValueOnce(null);
    harness.tx.diningTable.update.mockResolvedValueOnce({
      id: 3,
      name: 'Bàn 03',
      qrToken: 'ban03-new2',
      status: 'OCCUPIED',
      activeOrderId: 51,
    });
    await service.rotateTableQr(3, 1);
    expect(harness.gateway.emitTableQrRotated).toHaveBeenCalledWith(3, 51);

    // 4. approveQrOrder(false) -> forwards reason to QR room
    harness.gateway.emitOrderStatusUpdated.mockClear();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 52, tableId: 4 })
      .mockResolvedValueOnce({ id: 52, orderCode: 'HD-52', orderSource: 'QR_CODE', status: 'PENDING', tableId: 4, table: { name: 'Bàn 04' } });
    harness.tx.order.update.mockResolvedValueOnce({ id: 52, orderCode: 'HD-52', status: 'VOIDED' });
    await service.approveQrOrder(52, { approved: false, reason: 'Quán tạm hết nguyên liệu lẩu' }, 1);
    expect(harness.gateway.emitOrderStatusUpdated).toHaveBeenCalledWith(
      52,
      expect.objectContaining({
        status: 'VOIDED',
        reason: 'Quán tạm hết nguyên liệu lẩu',
      }),
    );
  });

  it('snapshots Size M (0đ default) and Size L (+5.000đ) and propagates isTakeaway flag on QR addon and kitchen split', async () => {
    const harness = createHarness();
    harness.tx.product.findMany.mockResolvedValue([{
      id: 77,
      name: 'Trà Đào',
      price: new Prisma.Decimal('25000.00'),
      station: 'PHA_CHE',
      isAvailable: true,
      modifierGroups: [
        {
          id: 90,
          name: 'Size',
          isRequired: true,
          maxSelect: 1,
          modifiers: [
            { id: 901, name: 'Size M', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true },
            { id: 902, name: 'Size L', extraPrice: new Prisma.Decimal('5000.00'), isDefaultChecked: false },
          ],
        },
      ],
    }]);
    harness.tx.diningTable.findUnique.mockResolvedValue({
      id: 3,
      name: 'Bàn 03',
      status: 'OCCUPIED',
      activeOrderId: 500,
    });
    harness.tx.order.findUnique.mockResolvedValue({
      id: 500,
      orderCode: 'HD-500',
      orderType: 'DINE_IN',
      orderSource: 'QR_CODE',
      tableId: 3,
      status: 'SERVING',
      mergedIntoOrderId: null,
      table: { id: 3, name: 'Bàn 03' },
      totalAmount: new Prisma.Decimal('50000.00'),
    });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 1 } });
    harness.tx.order.update.mockResolvedValue({ id: 500, totalAmount: new Prisma.Decimal('105000.00') });

    const service = createPosService(harness);
    await service.createQrOrder({
      qrToken: 'ban03-abcd',
      activeOrderId: 500,
      isTakeawayBatch: true,
      items: [
        { productId: 77, quantity: 1, modifiers: [{ groupId: 90, modifierId: 901 }] },
        { productId: 77, quantity: 1, modifiers: [{ groupId: 90, modifierId: 902 }] },
      ],
    });

    expect(harness.tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 500,
          productId: 77,
          unitPrice: new Prisma.Decimal('25000.00'),
          isTakeaway: true,
          modifiersSnapshot: [{ groupId: 90, modifierId: 901, name: 'Size M', extraPrice: '0.00' }],
        }),
        expect.objectContaining({
          orderId: 500,
          productId: 77,
          unitPrice: new Prisma.Decimal('30000.00'),
          isTakeaway: true,
          modifiersSnapshot: [{ groupId: 90, modifierId: 902, name: 'Size L', extraPrice: '5000.00' }],
        }),
      ],
    });
  });

  it('toggles isTakeaway on an already PRINTED order item without cancelling or creating a cancellation slip', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({
      id: 42,
      orderCode: 'HD-42',
      status: 'SERVING',
      orderType: 'DINE_IN',
      tableId: 7,
      table: { id: 7, name: 'Bàn 07' },
      items: [{
        id: 10,
        orderId: 42,
        productId: 11,
        quantity: 1,
        unitPrice: new Prisma.Decimal('100.00'),
        modifiersSnapshot: [],
        itemNote: null,
        batchNo: 1,
        kitchenStatus: 'PRINTED',
        isTakeaway: true,
        product,
      }],
    });
    harness.tx.orderItem.findMany.mockResolvedValue([{
      id: 10,
      quantity: 1,
      unitPrice: new Prisma.Decimal('100.00'),
      modifiersSnapshot: [],
      product: { categoryId: null },
    }]);
    harness.tx.order.update.mockResolvedValue({ id: 42, totalAmount: new Prisma.Decimal('100.00') });

    const service = createPosService(harness);
    const res = await service.patchOrderItems(42, {
      updates: [{ orderItemId: 10, isTakeaway: false }],
    });

    expect(harness.tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { isTakeaway: false },
    });
    expect(res.requireCancellationSlip).toBe(false);
    expect(res.kitchenCancellationSlips).toEqual([]);
  });

  it('snapshots takeawayLabelFormat on POS takeaway orders and preserves old labels when setting toggles mid-day', async () => {
    const harness = createHarness();
    let currentFormat: 'NUMBER' | 'LETTER' = 'LETTER';
    (harness.tx as Record<string, unknown>).masterData = {
      findUnique: vi.fn(async () => ({
        metadata: { takeawayLabelFormat: currentFormat },
      })),
    };
    harness.tx.order.create
      .mockResolvedValueOnce({
        id: 21,
        orderCode: 'HD-20261127-0005',
        orderType: 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: null,
        takeawayNumber: 5,
        takeawayLabelFormat: 'LETTER',
        status: 'SERVING',
        totalAmount: new Prisma.Decimal('100.00'),
      })
      .mockResolvedValueOnce({
        id: 22,
        orderCode: 'HD-20261127-0006',
        orderType: 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: null,
        takeawayNumber: 6,
        takeawayLabelFormat: 'NUMBER',
        status: 'SERVING',
        totalAmount: new Prisma.Decimal('100.00'),
      });
    const service = createPosService(harness);

    const fifth = await service.createOrder(
      { orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 1 }] },
      3,
    );
    expect(fifth.tableLabel).toBe('Mang về #AA');
    expect(fifth.takeawayLabelFormat).toBe('LETTER');
    expect(harness.tx.order.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          takeawayLabelFormat: 'LETTER',
        }),
      }),
    );

    currentFormat = 'NUMBER';
    const sixth = await service.createOrder(
      { orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 11, quantity: 1 }] },
      3,
    );
    expect(sixth.tableLabel).toBe('Mang về #06');
    expect(sixth.takeawayLabelFormat).toBe('NUMBER');

    harness.prisma.order.findUnique = vi.fn().mockResolvedValue({
      id: 21,
      orderCode: 'HD-20261127-0005',
      orderType: 'TAKEAWAY',
      orderSource: 'POS_COUNTER',
      tableId: null,
      table: null,
      takeawayNumber: 5,
      takeawayLabelFormat: 'LETTER',
      status: 'SERVING',
      paymentMethod: null,
      cashAmount: new Prisma.Decimal('0.00'),
      transferAmount: new Prisma.Decimal('0.00'),
      subtotalAmount: new Prisma.Decimal('100.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      discountSnapshot: null,
      totalAmount: new Prisma.Decimal('100.00'),
      note: null,
      createdAt: new Date('2026-11-27T05:00:00.000Z'),
      paidAt: null,
      tableTransferLogs: [],
      items: [],
    });
    const detail = await service.getOrder(21);
    expect(detail.tableLabel).toBe('Mang về #AA');
    expect(detail.takeawayLabelFormat).toBe('LETTER');
  });

  it('edits modifiers, quantity, and itemNote on a NEW order item and recalculates active percentage discount', async () => {
    const harness = createHarness();
    const spicyNoodle = {
      id: 55,
      name: 'Mì Cay Bò',
      price: new Prisma.Decimal('50000.00'),
      station: 'BEP_NAU',
      isAvailable: true,
      modifierGroups: [
        {
          id: 1,
          name: 'Cấp độ cay',
          isRequired: true,
          maxSelect: 1,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [
            { id: 101, name: 'Cấp 1', extraPrice: new Prisma.Decimal('0.00'), isAvailable: true, isDefaultChecked: true },
            { id: 103, name: 'Cấp 3', extraPrice: new Prisma.Decimal('0.00'), isAvailable: true, isDefaultChecked: false },
          ],
        },
        {
          id: 2,
          name: 'Topping',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [
            { id: 201, name: 'Thêm Bò Mỹ', extraPrice: new Prisma.Decimal('20000.00'), isAvailable: true, isDefaultChecked: false },
            { id: 202, name: 'Hết hàng', extraPrice: new Prisma.Decimal('10000.00'), isAvailable: false, isDefaultChecked: false },
          ],
        },
      ],
    };
    harness.tx.product.findMany.mockResolvedValue([spicyNoodle]);
    (harness.tx as Record<string, unknown>).discount = {
      findUnique: vi.fn().mockResolvedValue({
        id: 9,
        code: 'GIAM10',
        name: 'Giảm 10%',
        type: 'PERCENT',
        value: new Prisma.Decimal('10.00'),
        maxDiscountAmount: null,
        minOrderAmount: new Prisma.Decimal('50000.00'),
        applyScope: 'ALL',
        categoryId: null,
        isActive: true,
        startDate: null,
        endDate: null,
      }),
    };
    harness.tx.order.findUnique.mockResolvedValue({
      id: 77,
      orderCode: 'HD-77',
      status: 'SERVING',
      orderType: 'DINE_IN',
      tableId: 4,
      table: { id: 4, name: 'Bàn 04' },
      discountId: 9,
      discountSnapshot: {
        kind: 'CODE',
        discountId: 9,
        code: 'GIAM10',
        name: 'Giảm 10%',
        valueType: 'PERCENT',
        value: 10,
        maxDiscountAmount: null,
        scope: 'ORDER',
        targetCategoryIds: [],
        targetProductIds: [],
        minOrderAmount: 50000,
        appliedAt: '2026-11-27T04:00:00.000Z',
        appliedBy: 1,
        reason: null,
      },
      items: [
        {
          id: 301,
          orderId: 77,
          productId: 55,
          quantity: 1,
          unitPrice: new Prisma.Decimal('50000.00'),
          modifiersSnapshot: [{ groupId: 1, modifierId: 101, name: 'Cấp 1', extraPrice: '0.00' }],
          itemNote: null,
          batchNo: 1,
          kitchenStatus: 'NEW',
          isTakeaway: false,
          product: spicyNoodle,
        },
      ],
    });
    harness.tx.orderItem.findMany.mockResolvedValue([
      {
        id: 301,
        productId: 55,
        quantity: 2,
        kitchenStatus: 'NEW',
        unitPrice: new Prisma.Decimal('70000.00'),
        modifiersSnapshot: [
          { groupId: 1, modifierId: 103, name: 'Cấp 3', extraPrice: '0.00' },
          { groupId: 2, modifierId: 201, name: 'Thêm Bò Mỹ', extraPrice: '20000.00' },
        ],
        product: { categoryId: 1 },
      },
    ]);
    harness.tx.order.update.mockResolvedValue({ id: 77, totalAmount: new Prisma.Decimal('126000.00') });

    const service = createPosService(harness);
    const res = await service.patchOrderItems(77, {
      updates: [
        {
          orderItemId: 301,
          expectedKitchenStatus: 'NEW',
          quantity: 2,
          modifiers: [
            { groupId: 1, modifierId: 103 },
            { groupId: 2, modifierId: 201 },
          ],
          itemNote: 'Không hành',
        },
      ],
    });

    expect(harness.tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: expect.objectContaining({
        quantity: 2,
        unitPrice: new Prisma.Decimal('70000.00'),
        itemNote: 'Không hành',
        modifiersSnapshot: expect.arrayContaining([
          expect.objectContaining({ modifierId: 103, name: 'Cấp 3' }),
          expect.objectContaining({ modifierId: 201, name: 'Thêm Bò Mỹ', extraPrice: '20000.00' }),
        ]),
      }),
    });
    expect(harness.tx.order.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: {
        subtotalAmount: new Prisma.Decimal('140000.00'),
        discountAmount: new Prisma.Decimal('14000.00'),
        totalAmount: new Prisma.Decimal('126000.00'),
      },
    });
    expect(res.requireCancellationSlip).toBe(false);
  });

  it('rejects editing an already PRINTED order item with 409 POS_ITEM_ALREADY_PRINTED when expectedKitchenStatus is NEW', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({
      id: 42,
      orderCode: 'HD-42',
      status: 'SERVING',
      orderType: 'DINE_IN',
      tableId: 7,
      table: { id: 7, name: 'Bàn 07' },
      items: [
        {
          id: 10,
          orderId: 42,
          productId: 11,
          quantity: 1,
          unitPrice: new Prisma.Decimal('100.00'),
          modifiersSnapshot: [],
          itemNote: null,
          batchNo: 1,
          kitchenStatus: 'PRINTED',
          isTakeaway: false,
          product,
        },
      ],
    });

    const service = createPosService(harness);
    const err = await service
      .patchOrderItems(42, {
        updates: [{ orderItemId: 10, expectedKitchenStatus: 'NEW', quantity: 2, itemNote: 'Cấp 3' }],
      })
      .catch((caught: unknown) => caught as ConflictException);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: ErrorCodes.POS_ITEM_ALREADY_PRINTED });
    expect(harness.tx.orderItem.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('rejects editing a CANCELLED item and rejects unavailable modifiers', async () => {
    const harness = createHarness();
    const spicyNoodle = {
      id: 55,
      name: 'Mì Cay Bò',
      price: new Prisma.Decimal('50000.00'),
      station: 'BEP_NAU',
      isAvailable: true,
      modifierGroups: [
        {
          id: 2,
          name: 'Topping',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [
            { id: 202, name: 'Nấm Hết Hàng', extraPrice: new Prisma.Decimal('10000.00'), isAvailable: false },
          ],
        },
      ],
    };
    harness.tx.product.findMany.mockResolvedValue([spicyNoodle]);
    (harness.tx as Record<string, unknown>).discount = {
      findUnique: vi.fn().mockResolvedValue({
        id: 9,
        code: 'GIAM10',
        name: 'Giảm 10%',
        type: 'PERCENT',
        value: new Prisma.Decimal('10.00'),
        maxDiscountAmount: null,
        minOrderAmount: new Prisma.Decimal('50000.00'),
        applyScope: 'ALL',
        categoryId: null,
        isActive: true,
        startDate: null,
        endDate: null,
      }),
    };
    harness.tx.order.findUnique.mockResolvedValue({
      id: 88,
      orderCode: 'HD-88',
      status: 'SERVING',
      orderType: 'DINE_IN',
      tableId: 4,
      table: { id: 4, name: 'Bàn 04' },
      items: [
        {
          id: 501,
          orderId: 88,
          productId: 55,
          quantity: 1,
          unitPrice: new Prisma.Decimal('50000.00'),
          modifiersSnapshot: [],
          itemNote: null,
          batchNo: 1,
          kitchenStatus: 'CANCELLED',
          isTakeaway: false,
          product: spicyNoodle,
        },
        {
          id: 502,
          orderId: 88,
          productId: 55,
          quantity: 1,
          unitPrice: new Prisma.Decimal('50000.00'),
          modifiersSnapshot: [],
          itemNote: null,
          batchNo: 2,
          kitchenStatus: 'NEW',
          isTakeaway: false,
          product: spicyNoodle,
        },
      ],
    });

    const service = createPosService(harness);
    await expect(
      service.patchOrderItems(88, {
        updates: [{ orderItemId: 501, quantity: 2 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.patchOrderItems(88, {
        updates: [{ orderItemId: 502, modifiers: [{ groupId: 2, modifierId: 202 }] }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(harness.tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('should enforce modifier allowedSubstituteNames rules for SUBSTITUTED vs REMOVED_DEFAULT on create and patch', async () => {
    const matrixProduct = {
      id: 99,
      name: 'Mì Hải Sản',
      price: new Prisma.Decimal('69000.00'),
      station: 'BEP_NAU',
      isAvailable: true,
      modifierGroups: [
        {
          id: 3,
          name: 'Đồ ăn món chính',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: true,
          allowSubstitution: true,
          modifiers: [
            {
              id: 301,
              name: 'Ngao',
              extraPrice: new Prisma.Decimal('0.00'),
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: null,
              allowedSubstituteNames: [],
            },
            {
              id: 302,
              name: 'Tôm',
              extraPrice: new Prisma.Decimal('0.00'),
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: 'Mực',
              allowedSubstituteNames: ['Mực'],
            },
            {
              id: 303,
              name: 'Mực',
              extraPrice: new Prisma.Decimal('0.00'),
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: 'Tôm',
              allowedSubstituteNames: ['Tôm', 'Ngao'],
            },
          ],
        },
      ],
    };

    const harness = createHarness();
    harness.tx.product.findMany.mockResolvedValue([matrixProduct]);
    harness.tx.order.create.mockResolvedValue({
      id: 101,
      orderCode: 'HD-20261127-0101',
      orderType: 'TAKEAWAY',
      tableId: null,
      takeawayNumber: 1,
      status: 'SERVING',
      totalAmount: new Prisma.Decimal('69000.00'),
    });
    const service = createPosService(harness);

    // 1. Disallowed swap: unchecking Ngao (allowedSubstituteNames: []) MUST NOT use SUBSTITUTED -> 422
    await expect(
      service.createOrder({
        orderType: 'TAKEAWAY',
        items: [{
          productId: 99,
          quantity: 1,
          modifiers: [{ groupId: 3, modifierId: 301, action: 'SUBSTITUTED', substituteModifierId: 302 }],
        }],
      }, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // 2. Disallowed swap target: Tôm only allows Mực; attempting Tôm -> Ngao throws 422
    await expect(
      service.createOrder({
        orderType: 'TAKEAWAY',
        items: [{
          productId: 99,
          quantity: 1,
          modifiers: [{ groupId: 3, modifierId: 302, action: 'SUBSTITUTED', substituteModifierId: 301 }],
        }],
      }, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(harness.tx.order.create).not.toHaveBeenCalled();

    // 3. Removing Ngao via REMOVED_DEFAULT + substituting Tôm -> Mực succeeds accurately
    await service.createOrder({
      orderType: 'TAKEAWAY',
      items: [{
        productId: 99,
        quantity: 1,
        modifiers: [
          { groupId: 3, modifierId: 301, action: 'REMOVED_DEFAULT' },
          { groupId: 3, modifierId: 302, action: 'SUBSTITUTED', substituteModifierId: 303 },
        ],
      }],
    }, 1);

    expect(harness.tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: {
          create: [expect.objectContaining({
            modifiersSnapshot: [
              { groupId: 3, modifierId: 301, name: 'Không Ngao', extraPrice: '0.00', action: 'REMOVED_DEFAULT' },
              {
                groupId: 3,
                modifierId: 302,
                name: 'Không Tôm (Thay bằng Mực)',
                extraPrice: '0.00',
                action: 'SUBSTITUTED',
                substituteModifierId: 303,
                substituteName: 'Mực',
              },
            ],
          })],
        },
      }),
    }));

    // 4. When Mực (the only allowed substitute for Tôm) is out-of-stock, Tôm SUBSTITUTED throws 422
    harness.tx.product.findMany.mockResolvedValue([{
      ...matrixProduct,
      modifierGroups: [{
        ...matrixProduct.modifierGroups[0]!,
        modifiers: [
          matrixProduct.modifierGroups[0]!.modifiers[0]!,
          matrixProduct.modifierGroups[0]!.modifiers[1]!,
          { ...matrixProduct.modifierGroups[0]!.modifiers[2]!, isAvailable: false },
        ],
      }],
    }]);
    await expect(
      service.createOrder({
        orderType: 'TAKEAWAY',
        items: [{
          productId: 99,
          quantity: 1,
          modifiers: [{ groupId: 3, modifierId: 302, action: 'SUBSTITUTED' }],
        }],
      }, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
