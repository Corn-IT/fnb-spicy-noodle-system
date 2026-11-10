import { ConflictException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitchenSplitService } from '../kitchen-split.service';

function createHarness(order: Record<string, unknown>) {
  const lockSql: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      lockSql.push(strings.raw.join(''));
      return [];
    }),
    order: {
      findUnique: vi.fn().mockResolvedValue(order),
      update: vi.fn(),
    },
    orderItem: {
      aggregate: vi.fn().mockResolvedValue({ _max: { batchNo: null } }),
      updateMany: vi.fn(),
    },
    comboItem: { findMany: vi.fn().mockResolvedValue([]) },
    diningTable: { update: vi.fn() },
  };
  let transactionCommitted = false;
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
      const result = await operation(tx);
      transactionCommitted = true;
      return result;
    }),
  };
  const gateway = {
    emitOrderStatusUpdated: vi.fn(() => expect(transactionCommitted).toBe(true)),
    emitTableGridSync: vi.fn(() => expect(transactionCommitted).toBe(true)),
  };
  return {
    tx,
    prisma,
    gateway,
    lockSql,
    service: new KitchenSplitService(prisma as never, gateway as never),
  };
}

describe('KitchenSplitService', () => {
  afterEach(() => vi.useRealTimers());

  it('should return an idempotent response with no batch when there are no NEW items', async () => {
    const harness = createHarness({ id: 42, status: 'SERVING', tableId: 7, items: [] });

    await expect(harness.service.splitKitchen(42)).resolves.toMatchObject({
      batchNo: null,
      tickets: [],
      message: 'Không có món mới cần tách',
    });
    expect(harness.lockSql[0]).toContain('FROM orders');
    expect(harness.tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('should split only NEW order items and number the next add-on batch', async () => {
    const harness = createHarness({
      id: 42,
      orderCode: 'HD-20261107-0007',
      status: 'SERVING',
      tableId: 7,
      tableTransferLogs: [{ fromTable: 'Bàn 01', toTable: 'Bàn 07' }],
      items: [{
        id: 3,
        productId: 11,
        quantity: 2,
        kitchenStatus: 'NEW',
        modifiersSnapshot: [{ name: 'Cấp độ 3' }],
        itemNote: 'Ít cay',
        product: { id: 11, name: 'Mì bò', station: 'BEP_NAU' },
      }],
    });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 1 } });

    const result = await harness.service.splitKitchen(42);

    expect(harness.tx.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42 },
      include: { items: expect.objectContaining({ where: { kitchenStatus: 'NEW' } }) },
    }));
    expect(result.tickets).toEqual([expect.objectContaining({
      station: 'BEP_NAU',
      batchNo: 2,
      batchLabel: '[GỌI THÊM - LƯỢT 2]',
      transferNotice: '[GHI CHÚ ĐỔI BÀN: Chuyển từ Bàn 01 sang Bàn 07]',
      items: [{ name: 'Mì bò', qty: 2, modifiers: ['Cấp độ 3'], note: 'Ít cay' }],
    })]);
    expect(harness.tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3] }, kitchenStatus: 'NEW' },
      data: { kitchenStatus: 'PRINTED', batchNo: 2 },
    });
  });

  it('should keep batch numbers increasing after a previously printed batch was cancelled', async () => {
    const harness = createHarness({
      id: 42,
      orderCode: 'HD-20261107-0007',
      status: 'SERVING',
      tableId: 7,
      tableTransferLogs: [],
      items: [{
        id: 9,
        productId: 11,
        quantity: 1,
        kitchenStatus: 'NEW',
        modifiersSnapshot: [],
        itemNote: null,
        product: { id: 11, name: 'Mì bò', station: 'BEP_NAU' },
      }],
    });
    harness.tx.orderItem.aggregate.mockResolvedValue({ _max: { batchNo: 1 } });

    const result = await harness.service.splitKitchen(42);

    expect(harness.tx.orderItem.aggregate).toHaveBeenCalledWith({
      where: { orderId: 42, kitchenStatus: { in: ['PRINTED', 'CANCELLED'] } },
      _max: { batchNo: true },
    });
    expect(result.batchNo).toBe(2);
    expect(result.tickets[0]?.batchLabel).toBe('[GỌI THÊM - LƯỢT 2]');
    expect(harness.tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [9] }, kitchenStatus: 'NEW' },
      data: { kitchenStatus: 'PRINTED', batchNo: 2 },
    });
  });

  it('should explode combo quantities to real stations and promote a pending QR order', async () => {
    const harness = createHarness({
      id: 42,
      status: 'PENDING',
      tableId: 7,
      tableTransferLogs: [],
      items: [{
        id: 3,
        productId: 90,
        quantity: 2,
        kitchenStatus: 'NEW',
        modifiersSnapshot: [],
        itemNote: null,
        product: { id: 90, name: 'Combo đôi', station: 'COMBO' },
      }],
    });
    harness.tx.comboItem.findMany.mockResolvedValue([
      { parentProductId: 90, childProductId: 11, quantity: 1, childProduct: { id: 11, name: 'Mì bò', station: 'BEP_NAU' } },
      { parentProductId: 90, childProductId: 12, quantity: 2, childProduct: { id: 12, name: 'Khoai chiên', station: 'BEP_CHIEN' } },
      { parentProductId: 90, childProductId: 13, quantity: 1, childProduct: { id: 13, name: 'Trà đào', station: 'PHA_CHE' } },
    ]);

    const result = await harness.service.splitKitchen(42);

    expect(harness.lockSql[0]).toContain('FROM orders');
    expect(harness.lockSql[1]).toContain('FROM dining_tables');
    expect(result.tickets.map(({ station }) => station)).toEqual(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);
    expect(result.tickets.map(({ items }) => items[0]?.qty)).toEqual([2, 4, 2]);
    expect(result.tickets.every(({ station }) => station !== 'COMBO')).toBe(true);
    expect(harness.tx.order.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { status: 'SERVING' } });
    expect(harness.tx.diningTable.update).toHaveBeenCalledWith({
      where: { id: 7 }, data: { status: 'OCCUPIED', activeOrderId: 42 },
    });
    expect(harness.gateway.emitOrderStatusUpdated).toHaveBeenCalledWith(42, { status: 'SERVING', message: 'Bếp đang chế biến' });
  });

  it('should reject a kitchen split when the order is no longer active', async () => {
    const harness = createHarness({ id: 42, status: 'PAID', tableId: 7, items: [] });

    await expect(harness.service.splitKitchen(42)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('should print a NEW item only once when two split requests race on the order lock', async () => {
    let itemStatus = 'NEW';
    let lockTail = Promise.resolve();
    const item = {
      id: 3,
      productId: 11,
      quantity: 1,
      kitchenStatus: 'NEW',
      modifiersSnapshot: [],
      itemNote: null,
      product: { id: 11, name: 'Mì bò', station: 'BEP_NAU' },
    };
    const gateway = { emitOrderStatusUpdated: vi.fn(), emitTableGridSync: vi.fn() };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: {
        $queryRaw: (strings: TemplateStringsArray) => Promise<unknown[]>;
        order: { findUnique: () => Promise<unknown> };
        orderItem: {
          aggregate: () => Promise<{ _max: { batchNo: number | null } }>;
          updateMany: () => Promise<void>;
        };
        comboItem: { findMany: () => Promise<never[]> };
        diningTable: { update: () => Promise<void> };
      }) => Promise<unknown>) => {
        let releaseLock: (() => void) | undefined;
        const tx = {
          $queryRaw: async (strings: TemplateStringsArray) => {
            if (strings.raw.join('').includes('FROM orders')) {
              const previous = lockTail;
              let unlock!: () => void;
              const current = new Promise<void>((resolve) => { unlock = resolve; });
              lockTail = previous.then(() => current);
              await previous;
              releaseLock = unlock;
            }
            return [];
          },
          order: {
            findUnique: async () => ({
              id: 42,
              orderCode: 'HD-20261107-0007',
              status: 'SERVING',
              tableId: null,
              tableTransferLogs: [],
              items: itemStatus === 'NEW' ? [{ ...item }] : [],
            }),
          },
          orderItem: {
            aggregate: async () => ({ _max: { batchNo: itemStatus === 'PRINTED' ? 1 : null } }),
            updateMany: async () => { itemStatus = 'PRINTED'; },
          },
          comboItem: { findMany: async () => [] as never[] },
          diningTable: { update: async () => undefined },
        };
        try {
          return await operation(tx);
        } finally {
          releaseLock?.();
        }
      }),
    };
    const service = new KitchenSplitService(prisma as never, gateway as never);

    const results = await Promise.all([service.splitKitchen(42), service.splitKitchen(42)]);

    expect(results.map(({ tickets }) => tickets.length).sort()).toEqual([0, 1]);
    expect(itemStatus).toBe('PRINTED');
  });
});
