import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableTransferService } from '../table-transfer.service';

const sourceTable = { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 42 };
const targetTable = { id: 7, name: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null };

function createHarness() {
  const lockSql: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      lockSql.push(strings.raw.join(''));
      return [];
    }),
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: { updateMany: vi.fn() },
    diningTable: { findUnique: vi.fn(), update: vi.fn() },
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
    emitOrderSessionRedirected: vi.fn(() => expect(transactionCommitted).toBe(true)),
    emitTableGridSync: vi.fn(() => expect(transactionCommitted).toBe(true)),
  };
  return {
    tx,
    prisma,
    gateway,
    lockSql,
    service: new TableTransferService(prisma as never, gateway as never),
    tables: { sourceTable, targetTable },
  };
}

describe('TableTransferService', () => {
  afterEach(() => vi.useRealTimers());

  it('should move an open order and return the printed kitchen notice after ordered row locks', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42,
        orderCode: 'HD-20261107-0007',
        orderType: 'DINE_IN',
        tableId: 1,
        status: 'SERVING',
        tableTransferLogs: [],
        table: { id: 1, name: 'Bàn 01' },
        items: [{
          kitchenStatus: 'PRINTED',
          product: { station: 'COMBO', comboParents: [
            { childProduct: { station: 'BEP_NAU' } },
            { childProduct: { station: 'PHA_CHE' } },
          ] },
        }],
      });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { ...targetTable }
      : { ...sourceTable });

    const result = await harness.service.executeTableAction(42, {
      action: 'MOVE', targetTableId: 7, reason: 'Khách đổi bàn',
    }, 3);

    expect(harness.lockSql[0]).toContain('FROM orders');
    expect(harness.lockSql[1]).toContain('FROM dining_tables');
    expect(result).toMatchObject({
      action: 'MOVE',
      requireKitchenNoticePrint: true,
      kitchenTransferSlip: {
        orderCode: 'HD-20261107-0007',
        fromLabel: 'Bàn 01',
        toLabel: 'Bàn 07',
        affectedStations: ['BEP_NAU', 'PHA_CHE'],
      },
    });
    expect(harness.gateway.emitOrderSessionRedirected).toHaveBeenCalledWith(42, expect.objectContaining({
      newActiveOrderId: 42,
      newTableLabel: 'Bàn 07',
    }));
  });

  it('should reject moving an order to a table that is already occupied', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
        status: 'SERVING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [],
      });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { ...sourceTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MOVE', targetTableId: 7, reason: 'Khách đổi bàn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure).toBeInstanceOf(ConflictException);
    expect(failure.getResponse()).toMatchObject({ code: 'POS_TABLE_NOT_AVAILABLE' });
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('should reject merging a takeaway order', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'TAKEAWAY', tableId: null })
      .mockResolvedValueOnce({ id: 42, orderType: 'TAKEAWAY', tableId: null, status: 'SERVING', items: [] });
    harness.tx.diningTable.findUnique.mockResolvedValue({ ...targetTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MERGE', targetTableId: 7, reason: 'Gộp đơn mang về',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure).toBeInstanceOf(ConflictException);
    expect(failure.getResponse()).toMatchObject({ code: 'POS_TAKEAWAY_CANNOT_MERGE' });
    expect(harness.tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('should merge all source items without changing their kitchen status', async () => {
    const harness = createHarness();
    const source = {
      id: 42,
      orderCode: 'HD-20261107-0007',
      orderType: 'DINE_IN',
      tableId: 1,
      status: 'SERVING',
      totalAmount: new Prisma.Decimal('50.00'),
      tableTransferLogs: [],
      table: { id: 1, name: 'Bàn 01' },
      items: [{ kitchenStatus: 'PRINTED', product: { station: 'BEP_NAU', comboParents: [] } }],
    };
    const targetOrder = {
      id: 99,
      orderType: 'DINE_IN',
      tableId: 7,
      status: 'SERVING',
      totalAmount: new Prisma.Decimal('200.00'),
      tableTransferLogs: [],
    };
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(targetOrder);
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { ...sourceTable });

    const result = await harness.service.executeTableAction(42, {
      action: 'MERGE', targetTableId: 7, reason: 'Khách muốn ngồi chung',
    });

    expect(harness.tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 42 }, data: { orderId: 99 },
    });
    expect(harness.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 99 }, data: expect.objectContaining({ totalAmount: new Prisma.Decimal('250.00') }),
    }));
    expect(result).toMatchObject({ action: 'MERGE', sourceTableId: 1, targetTableId: 7, requireKitchenNoticePrint: true });
    expect(harness.gateway.emitOrderSessionRedirected).toHaveBeenCalledWith(42, expect.objectContaining({ newActiveOrderId: 99 }));
  });

  it('should swap active orders safely and redirect both customer sessions', async () => {
    const harness = createHarness();
    const orders = new Map<number, { tableId: number; status: string; tableTransferLogs: unknown[] }>([
      [42, { tableId: 1, status: 'SERVING', tableTransferLogs: [] }],
      [99, { tableId: 7, status: 'SERVING', tableTransferLogs: [] }],
    ]);
    const source = {
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1, status: 'SERVING',
      tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' },
      items: [{ kitchenStatus: 'PRINTED', product: { station: 'BEP_NAU', comboParents: [] } }],
    };
    const targetOrder = {
      id: 99, orderCode: 'HD-20261107-0008', orderType: 'DINE_IN', tableId: 7, status: 'SERVING', tableTransferLogs: [],
      items: [{ kitchenStatus: 'PRINTED', product: { station: 'PHA_CHE', comboParents: [] } }],
    };
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(targetOrder);
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { ...sourceTable });
    harness.tx.order.updateMany.mockImplementation(async ({ where, data }: {
      where: { id: { in: number[] } };
      data: Record<string, unknown>;
    }) => {
      for (const id of where.id.in) orders.set(id, { ...orders.get(id)!, ...data } as { tableId: number; status: string; tableTransferLogs: unknown[] });
      return { count: where.id.in.length };
    });
    harness.tx.order.update.mockImplementation(async ({ where, data }: {
      where: { id: number };
      data: Record<string, unknown>;
    }) => {
      const next = { ...orders.get(where.id)!, ...data } as { tableId: number; status: string; tableTransferLogs: unknown[] };
      if (activeStatus(next.status) && [...orders.entries()].some(([id, other]) => id !== where.id && activeStatus(other.status) && other.tableId === next.tableId)) {
        throw new Error('idx_one_active_order_per_table violation');
      }
      orders.set(where.id, next);
      return { id: where.id, ...next };
    });

    const result = await harness.service.executeTableAction(42, {
      action: 'SWAP', targetTableId: 7, reason: 'Khách đổi bàn',
    });

    expect(orders.get(42)?.tableId).toBe(7);
    expect(orders.get(99)?.tableId).toBe(1);
    expect(result.kitchenTransferSlip?.affectedStations).toEqual(['BEP_NAU', 'PHA_CHE']);
    expect(harness.gateway.emitOrderSessionRedirected).toHaveBeenCalledTimes(2);
  });

  it('should reject merging an order into its own table', async () => {
    const harness = createHarness();
    const order = {
      id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
      status: 'SERVING', totalAmount: new Prisma.Decimal('100.00'), tableTransferLogs: [],
      table: { id: 1, name: 'Bàn 01' }, items: [],
    };
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce(order);
    harness.tx.diningTable.findUnique.mockResolvedValue({ ...sourceTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MERGE', targetTableId: 1, reason: 'Gộp cùng bàn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure).toBeInstanceOf(ConflictException);
    expect(failure.getResponse()).toMatchObject({ code: 'POS_TABLE_NOT_OCCUPIED' });
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('should validate a table action request before opening a transaction', async () => {
    const harness = createHarness();

    const failure = await harness.service.executeTableAction(42, {
      action: 'INVALID', targetTableId: 7, reason: 'Invalid action',
    } as never).catch((error: unknown) => error as Error);

    expect(failure).toMatchObject({ status: 422 });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject swapping when the source table is pending', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
        status: 'PENDING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [],
      });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { ...sourceTable, status: 'PENDING' });

    const failure = await harness.service.executeTableAction(42, {
      action: 'SWAP', targetTableId: 7, reason: 'Đổi bàn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure.getResponse()).toMatchObject({ code: 'POS_TABLE_NOT_OCCUPIED' });
  });

  it('should reject swapping when the destination order is no longer serving', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
        status: 'SERVING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [],
      })
      .mockResolvedValueOnce({ id: 99, tableId: 7, status: 'PAID', items: [] });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { ...sourceTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'SWAP', targetTableId: 7, reason: 'Đổi bàn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure.getResponse()).toMatchObject({ code: 'POS_ORDER_NOT_ACTIVE' });
  });

  it('should reject moving a takeaway order because it has no physical source table', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'TAKEAWAY', tableId: null })
      .mockResolvedValueOnce({ id: 42, orderType: 'TAKEAWAY', tableId: null, status: 'SERVING', items: [] });
    harness.tx.diningTable.findUnique.mockResolvedValue({ ...targetTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MOVE', targetTableId: 7, reason: 'Chuyển đơn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure.getResponse()).toMatchObject({ code: 'POS_ORDER_NOT_ACTIVE' });
  });

  it('should reject table actions when the source table no longer points to the order', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
        status: 'SERVING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [],
      });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { ...targetTable }
      : { ...sourceTable, activeOrderId: 99 });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MOVE', targetTableId: 7, reason: 'Chuyển bàn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure.getResponse()).toMatchObject({ code: 'POS_CONCURRENT_MODIFICATION' });
  });

  it('should reject merging into a table that is not occupied', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
        status: 'SERVING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [],
      });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null }
      : { ...sourceTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MERGE', targetTableId: 7, reason: 'Gộp đơn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure.getResponse()).toMatchObject({ code: 'POS_TABLE_NOT_OCCUPIED' });
  });

  it('should reject merging into an order that is no longer active', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique
      .mockResolvedValueOnce({ id: 42, orderType: 'DINE_IN', tableId: 1 })
      .mockResolvedValueOnce({
        id: 42, orderCode: 'HD-20261107-0007', orderType: 'DINE_IN', tableId: 1,
        status: 'SERVING', tableTransferLogs: [], table: { id: 1, name: 'Bàn 01' }, items: [],
      })
      .mockResolvedValueOnce({ id: 99, tableId: 7, status: 'PAID' });
    harness.tx.diningTable.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === 7
      ? { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 }
      : { ...sourceTable });

    const failure = await harness.service.executeTableAction(42, {
      action: 'MERGE', targetTableId: 7, reason: 'Gộp đơn',
    }).catch((error: unknown) => error as ConflictException);

    expect(failure.getResponse()).toMatchObject({ code: 'POS_ORDER_NOT_ACTIVE' });
  });
});

function activeStatus(status: string): boolean {
  return status === 'PENDING' || status === 'SERVING';
}
