import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { PaymentQrService } from '../payment-qr.service';

interface MockAccount {
  id: number;
  label: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
  priority: number;
  isActive: boolean;
  dailyLimit: Prisma.Decimal | null;
  monthlyLimit: Prisma.Decimal | null;
  yearlyLimit: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPaidOrder {
  id: number;
  orderCode: string;
  orderType: string;
  paymentMethod: string | null;
  paymentAccountId: number | null;
  status: string;
  totalAmount: Prisma.Decimal;
  transferAmount: Prisma.Decimal;
  paidAt: Date | null;
  table?: { name: string } | null;
  takeawayNumber?: number | null;
  cashier?: { username: string; employee?: { fullName: string } | null } | null;
}

function makeAccount(overrides: Partial<MockAccount> & { id: number }): MockAccount {
  return {
    label: `QR #${overrides.id}`,
    bankCode: 'VPB',
    accountNo: `10000${overrides.id}`,
    accountName: 'THAN THI LOAN',
    priority: overrides.id,
    isActive: true,
    dailyLimit: null,
    monthlyLimit: null,
    yearlyLimit: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createQrHarness(initialAccounts: MockAccount[] = [], initialOrders: MockPaidOrder[] = []) {
  const accounts = [...initialAccounts];
  const orders = [...initialOrders];
  let nextAccountId = accounts.reduce((max, a) => Math.max(max, a.id), 0) + 1;

  const client = {
    paymentAccount: {
      findMany: vi.fn(async (args?: { where?: { isActive?: boolean } }) => {
        const filtered = args?.where?.isActive !== undefined
          ? accounts.filter((a) => a.isActive === args.where!.isActive)
          : [...accounts];
        return filtered.sort((a, b) => a.priority - b.priority || a.id - b.id);
      }),
      findUnique: vi.fn(async (args: { where: { id?: number; bankCode_accountNo?: { bankCode: string; accountNo: string } } }) => {
        if (args.where.id !== undefined) {
          return accounts.find((a) => a.id === args.where.id) ?? null;
        }
        if (args.where.bankCode_accountNo) {
          const { bankCode, accountNo } = args.where.bankCode_accountNo;
          return accounts.find((a) => a.bankCode === bankCode && a.accountNo === accountNo) ?? null;
        }
        return null;
      }),
      aggregate: vi.fn(async () => ({
        _max: { priority: accounts.length ? Math.max(...accounts.map((a) => a.priority)) : null },
      })),
      create: vi.fn(async (args: { data: Omit<MockAccount, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const created: MockAccount = {
          ...args.data,
          id: nextAccountId++,
          createdAt: new Date('2026-11-15T00:00:00.000Z'),
          updatedAt: new Date('2026-11-15T00:00:00.000Z'),
        };
        accounts.push(created);
        return created;
      }),
      update: vi.fn(async (args: { where: { id: number }; data: Partial<MockAccount> }) => {
        const idx = accounts.findIndex((a) => a.id === args.where.id);
        if (idx < 0) throw new Error('Account not found');
        accounts[idx] = { ...accounts[idx], ...args.data, updatedAt: new Date('2026-11-15T01:00:00.000Z') };
        return accounts[idx];
      }),
      delete: vi.fn(async (args: { where: { id: number } }) => {
        const idx = accounts.findIndex((a) => a.id === args.where.id);
        if (idx < 0) throw new Error('Account not found');
        const [removed] = accounts.splice(idx, 1);
        return removed;
      }),
    },
    order: {
      findMany: vi.fn(async (args?: {
        where?: {
          paymentAccountId?: number | { not: null };
          status?: string;
          paymentMethod?: { in: string[] };
          paidAt?: { gte?: Date; lte?: Date };
        };
        skip?: number;
        take?: number;
      }) => {
        return orders.filter((o) => {
          if (args?.where?.paymentAccountId !== undefined) {
            if (typeof args.where.paymentAccountId === 'number') {
              if (o.paymentAccountId !== args.where.paymentAccountId) return false;
            } else if (o.paymentAccountId === null) {
              return false;
            }
          }
          if (args?.where?.status && o.status !== args.where.status) return false;
          if (args?.where?.paymentMethod?.in && (!o.paymentMethod || !args.where.paymentMethod.in.includes(o.paymentMethod))) {
            return false;
          }
          if (args?.where?.paidAt?.gte && (!o.paidAt || o.paidAt < args.where.paidAt.gte)) return false;
          if (args?.where?.paidAt?.lte && (!o.paidAt || o.paidAt > args.where.paidAt.lte)) return false;
          return true;
        });
      }),
      count: vi.fn(
        async (args?: {
          where?: {
            paymentAccountId?: number;
            status?: string;
            paymentMethod?: { in?: string[] };
          };
        }) => {
          return orders.filter((o) => {
            if (args?.where?.paymentAccountId !== undefined && o.paymentAccountId !== args.where.paymentAccountId) {
              return false;
            }
            if (args?.where?.status && o.status !== args.where.status) return false;
            if (args?.where?.paymentMethod?.in && !args.where.paymentMethod.in.includes(o.paymentMethod ?? '')) {
              return false;
            }
            return true;
          }).length;
        },
      ),
      updateMany: vi.fn(
        async (args: {
          where: { paymentAccountId?: number; status?: { not?: string } };
          data: { paymentAccountId: number | null };
        }) => {
          let count = 0;
          for (const o of orders) {
            if (args.where.paymentAccountId !== undefined && o.paymentAccountId !== args.where.paymentAccountId) {
              continue;
            }
            if (args.where.status?.not && o.status === args.where.status.not) {
              continue;
            }
            o.paymentAccountId = args.data.paymentAccountId;
            count++;
          }
          return { count };
        },
      ),
      groupBy: vi.fn(
        async (args?: {
          where?: {
            status?: string;
            paymentMethod?: { in?: string[] };
          };
        }) => {
          const counts = new Map<number, number>();
          for (const o of orders) {
            if (o.paymentAccountId === null) continue;
            if (args?.where?.status && o.status !== args.where.status) continue;
            if (args?.where?.paymentMethod?.in && !args.where.paymentMethod.in.includes(o.paymentMethod ?? '')) {
              continue;
            }
            counts.set(o.paymentAccountId, (counts.get(o.paymentAccountId) ?? 0) + 1);
          }
          return [...counts.entries()].map(([paymentAccountId, count]) => ({
            paymentAccountId,
            _count: { _all: count },
          }));
        },
      ),
    },
  };

  const prisma = {
    ...client,
    $transaction: vi.fn(async (cb: (tx: typeof client) => Promise<unknown>) => cb(client)),
  };

  const auditLog = { record: vi.fn() };
  const service = new PaymentQrService(prisma as never, auditLog as never);
  return { service, prisma, client, auditLog, accounts, orders };
}

describe('PaymentQrService', () => {
  describe('selectForAmount', () => {
    it('should select priority 1 account when usage has not yet reached configured limits (even if single bill exceeds small test limit)', async () => {
      const now = new Date('2026-11-15T10:00:00.000+07:00');
      const { service, client } = createQrHarness([
        makeAccount({ id: 1, priority: 1, dailyLimit: new Prisma.Decimal('5000.00') }),
        makeAccount({ id: 2, priority: 2, bankCode: 'VCB', accountNo: '999999' }),
      ]);

      const selection = await service.selectForAmount(client as never, new Prisma.Decimal('10000.00'), now);

      expect(selection.account.id).toBe(1);
      expect(selection.rotated).toBe(false);
      expect(selection.overLimit).toBe(false);
    });

    it('should rotate to priority 2 when priority 1 has reached or exceeded dailyLimit', async () => {
      const now = new Date('2026-11-15T10:00:00.000+07:00');
      const { service, client } = createQrHarness(
        [
          makeAccount({ id: 1, label: 'QR 1', priority: 1, dailyLimit: new Prisma.Decimal('100000.00') }),
          makeAccount({ id: 2, label: 'QR 2', priority: 2, bankCode: 'VCB', accountNo: '999999', dailyLimit: new Prisma.Decimal('500000.00') }),
        ],
        [
          {
            id: 101,
            orderCode: 'HD-20261115-0001',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 1,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('100000.00'),
            transferAmount: new Prisma.Decimal('100000.00'),
            paidAt: new Date('2026-11-15T09:00:00.000+07:00'),
          },
        ],
      );

      const selection = await service.selectForAmount(client as never, new Prisma.Decimal('30000.00'), now);

      expect(selection.account.id).toBe(2);
      expect(selection.rotated).toBe(true);
      expect(selection.overLimit).toBe(false);
    });

    it('should rotate when monthlyLimit or yearlyLimit is reached and count only transferAmount for SPLIT orders', async () => {
      const now = new Date('2026-11-15T10:00:00.000+07:00');
      const { service, client, orders } = createQrHarness(
        [
          makeAccount({ id: 1, priority: 1, monthlyLimit: new Prisma.Decimal('200000.00') }),
          makeAccount({ id: 2, priority: 2, bankCode: 'TCB', accountNo: '888888', yearlyLimit: new Prisma.Decimal('300000.00') }),
          makeAccount({ id: 3, priority: 3, bankCode: 'MB', accountNo: '777777' }),
        ],
        [
          // SPLIT order earlier this month on QR 1: total=300k, transfer=180k, cash=120k
          {
            id: 201,
            orderCode: 'HD-20261102-0001',
            orderType: 'DINE_IN',
            paymentMethod: 'SPLIT',
            paymentAccountId: 1,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('300000.00'),
            transferAmount: new Prisma.Decimal('180000.00'),
            paidAt: new Date('2026-11-02T12:00:00.000+07:00'),
          },
          // VOIDED order on QR 1 (must be ignored)
          {
            id: 202,
            orderCode: 'HD-20261103-0001',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 1,
            status: 'VOIDED',
            totalAmount: new Prisma.Decimal('500000.00'),
            transferAmount: new Prisma.Decimal('500000.00'),
            paidAt: new Date('2026-11-03T12:00:00.000+07:00'),
          },
          // Earlier this year (May) on QR 2: 300k (reached yearlyLimit)
          {
            id: 203,
            orderCode: 'HD-20260510-0001',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 2,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('300000.00'),
            transferAmount: new Prisma.Decimal('300000.00'),
            paidAt: new Date('2026-05-10T12:00:00.000+07:00'),
          },
        ],
      );

      // QR 1 has 180k < 200k monthlyLimit -> still AVAILABLE, selects QR 1
      const withinQr1 = await service.selectForAmount(client as never, new Prisma.Decimal('25000.00'), now);
      expect(withinQr1.account.id).toBe(1);

      // Once that 25k order is paid on QR 1 (180k + 25k = 205k >= 200k), QR 1 is MONTH_FULL and QR 2 is YEAR_FULL (300k >= 300k) -> selects QR 3
      orders.push({
        id: 204,
        orderCode: 'HD-20261115-0002',
        orderType: 'DINE_IN',
        paymentMethod: 'TRANSFER',
        paymentAccountId: 1,
        status: 'PAID',
        totalAmount: new Prisma.Decimal('25000.00'),
        transferAmount: new Prisma.Decimal('25000.00'),
        paidAt: new Date('2026-11-15T09:30:00.000+07:00'),
      });
      const rotatedToQr3 = await service.selectForAmount(client as never, new Prisma.Decimal('25000.00'), now);
      expect(rotatedToQr3.account.id).toBe(3);
      expect(rotatedToQr3.rotated).toBe(true);
      expect(rotatedToQr3.overLimit).toBe(false);
    });

    it('should automatically reuse priority 1 on a new Vietnam calendar day', async () => {
      const { service, client } = createQrHarness(
        [
          makeAccount({ id: 1, priority: 1, dailyLimit: new Prisma.Decimal('100000.00') }),
          makeAccount({ id: 2, priority: 2, bankCode: 'VCB', accountNo: '999999' }),
        ],
        [
          {
            id: 301,
            orderCode: 'HD-20261115-0009',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 1,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('100000.00'),
            transferAmount: new Prisma.Decimal('100000.00'),
            paidAt: new Date('2026-11-15T23:30:00.000+07:00'),
          },
        ],
      );

      // Next day at 00:05 Vietnam time: daily usage resets to 0
      const nextDayVn = new Date('2026-11-16T00:05:00.000+07:00');
      const selection = await service.selectForAmount(client as never, new Prisma.Decimal('50000.00'), nextDayVn);
      expect(selection.account.id).toBe(1);
      expect(selection.rotated).toBe(false);
    });

    it('should fall back to the highest-priority active account with overLimit=true when all active accounts are full', async () => {
      const now = new Date('2026-11-15T10:00:00.000+07:00');
      const { service, client } = createQrHarness(
        [
          makeAccount({ id: 1, priority: 1, dailyLimit: new Prisma.Decimal('50000.00') }),
          makeAccount({ id: 2, priority: 2, bankCode: 'VCB', accountNo: '999999', dailyLimit: new Prisma.Decimal('50000.00') }),
        ],
        [
          {
            id: 351,
            orderCode: 'HD-20261115-0010',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 1,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('50000.00'),
            transferAmount: new Prisma.Decimal('50000.00'),
            paidAt: new Date('2026-11-15T08:00:00.000+07:00'),
          },
          {
            id: 352,
            orderCode: 'HD-20261115-0011',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 2,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('50000.00'),
            transferAmount: new Prisma.Decimal('50000.00'),
            paidAt: new Date('2026-11-15T09:00:00.000+07:00'),
          },
        ],
      );

      const selection = await service.selectForAmount(client as never, new Prisma.Decimal('80000.00'), now);
      expect(selection.account.id).toBe(1);
      expect(selection.overLimit).toBe(true);
    });

    it('should throw 409 PAYMENT_QR_NOT_CONFIGURED when no active QR accounts exist', async () => {
      const { service, client } = createQrHarness([
        makeAccount({ id: 1, priority: 1, isActive: false }),
      ]);

      await expect(
        service.selectForAmount(client as never, new Prisma.Decimal('50000.00')),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('CRUD & protection invariants', () => {
    it('should lock bankCode and accountNo updates, prevent deleting last/active/in-use accounts, and prevent disabling the last active account', async () => {
      const { service } = createQrHarness(
        [
          makeAccount({ id: 1, bankCode: 'VPB', accountNo: '186877721', isActive: true }),
          makeAccount({ id: 2, bankCode: 'VCB', accountNo: '999999999', isActive: false }),
        ],
        [
          {
            id: 401,
            orderCode: 'HD-20261115-0001',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 1,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('100000.00'),
            transferAmount: new Prisma.Decimal('100000.00'),
            paidAt: new Date('2026-11-15T09:00:00.000+07:00'),
          },
        ],
      );

      await expect(
        service.update(1, { accountNo: '999999999' }, 1),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.PAYMENT_QR_LOCKED_FIELD }),
      });

      // Cannot disable account #1 when it is the only active account
      await expect(service.update(1, { isActive: false }, 1)).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.PAYMENT_QR_LAST_ACTIVE }),
      });

      // Cannot delete active account #1 before deactivating
      await expect(service.remove(1, 1)).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.PAYMENT_QR_CANNOT_DELETE_ACTIVE }),
      });

      // Turn on account #2, then turn off #1 -> now #1 is inactive, but still blocked from delete due to hasOrders
      await service.update(2, { isActive: true }, 1);
      await service.update(1, { isActive: false }, 1);
      await expect(service.remove(1, 1)).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.PAYMENT_QR_IN_USE }),
      });

      // Limit hierarchy check on update
      await expect(
        service.update(2, { dailyLimit: 500000, monthlyLimit: 200000 }, 1),
      ).rejects.toThrow();

      const updated = await service.update(1, { label: 'TK Chính Đổi Tên', dailyLimit: 5000000 }, 1);
      expect(updated.label).toBe('TK Chính Đổi Tên');
      expect(updated.dailyLimit).toBe(5000000);
    });

    it('should list accounts with computed status, create normalized holder names, reorder priorities, and list linked orders', async () => {
      const now = new Date('2026-11-15T10:00:00.000+07:00');
      const { service } = createQrHarness(
        [
          makeAccount({ id: 1, label: 'QR 1', priority: 1, dailyLimit: new Prisma.Decimal('100000.00') }),
          makeAccount({ id: 2, label: 'QR 2', priority: 2, bankCode: 'VCB', accountNo: '222222', isActive: false }),
        ],
        [
          {
            id: 501,
            orderCode: 'HD-20261115-0001',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 1,
            status: 'PAID',
            totalAmount: new Prisma.Decimal('100000.00'),
            transferAmount: new Prisma.Decimal('100000.00'),
            paidAt: new Date('2026-11-15T08:00:00.000+07:00'),
            table: { name: 'Bàn 05' },
          },
        ],
      );

      const created = await service.create(
        {
          label: 'TK Dự Phòng',
          bankCode: 'TCB',
          accountNo: '333333',
          accountName: 'Nguyễn Văn An',
          isActive: true,
          dailyLimit: null,
          monthlyLimit: 50000000,
          yearlyLimit: null,
        },
        1,
        now,
      );
      expect(created.accountName).toBe('NGUYEN VAN AN');
      expect(created.priority).toBe(2);

      const listed = await service.list(now);
      expect(listed[0]).toMatchObject({ id: 1, priority: 1, status: 'DAY_FULL', usedDay: 100000, hasOrders: true, orderCount: 1 });
      expect(listed[1]).toMatchObject({ id: 3, priority: 2, status: 'AVAILABLE', hasOrders: false });
      expect(listed[2]).toMatchObject({ id: 2, priority: 3, status: 'INACTIVE', hasOrders: false });

      const reordered = await service.reorder({ orderedIds: [3, 1, 2] }, 1, now);
      expect(reordered.map((a) => a.id)).toEqual([3, 1, 2]);
      expect(reordered.map((a) => a.priority)).toEqual([1, 2, 3]);

      const ordersRes = await service.listOrders(1, { page: 1, limit: 20 });
      expect(ordersRes.total).toBe(1);
      expect(ordersRes.totalTransferAmount).toBe(100000);
      expect(ordersRes.items[0]).toMatchObject({
        orderCode: 'HD-20261115-0001',
        tableLabel: 'Bàn 05',
        transferAmount: 100000,
      });

      // Must deactivate #3 before deletion succeeds
      await expect(service.remove(3, 1)).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.PAYMENT_QR_CANNOT_DELETE_ACTIVE }),
      });
      await service.update(3, { isActive: false }, 1);
      const deleted = await service.remove(3, 1);
      expect(deleted).toEqual({ deletedId: 3 });

      // Single remaining account cannot be deleted even when inactive
      const { service: singleService } = createQrHarness([
        makeAccount({ id: 9, label: 'Duy nhất', isActive: false }),
      ]);
      await expect(singleService.remove(9, 1)).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.PAYMENT_QR_LAST_ACTIVE }),
      });
    });

    it('should ignore non-PAID provisional/voided orders in orderCount and allow editing/deleting once inactive', async () => {
      const now = new Date('2026-11-15T10:00:00.000+07:00');
      const { service, orders } = createQrHarness(
        [
          makeAccount({ id: 1, priority: 1, isActive: true }),
          makeAccount({ id: 2, priority: 2, bankCode: 'VCB', accountNo: '444444', isActive: false }),
        ],
        [
          {
            id: 601,
            orderCode: 'HD-20261115-0010',
            orderType: 'DINE_IN',
            paymentMethod: null,
            paymentAccountId: 2,
            status: 'SERVING',
            totalAmount: new Prisma.Decimal('30000.00'),
            transferAmount: new Prisma.Decimal('0.00'),
            paidAt: null,
          },
          {
            id: 602,
            orderCode: 'HD-20261115-0011',
            orderType: 'DINE_IN',
            paymentMethod: 'TRANSFER',
            paymentAccountId: 2,
            status: 'VOIDED',
            totalAmount: new Prisma.Decimal('50000.00'),
            transferAmount: new Prisma.Decimal('50000.00'),
            paidAt: null,
          },
        ],
      );

      const listed = await service.list(now);
      expect(listed.find((a) => a.id === 2)).toMatchObject({
        orderCount: 0,
        hasOrders: false,
        usedDay: 0,
      });

      const edited = await service.update(2, { accountNo: '555555' }, 1);
      expect(edited.accountNo).toBe('555555');

      const deleted = await service.remove(2, 1);
      expect(deleted).toEqual({ deletedId: 2 });
      expect(orders.every((o) => o.paymentAccountId === null)).toBe(true);
    });
  });
});
