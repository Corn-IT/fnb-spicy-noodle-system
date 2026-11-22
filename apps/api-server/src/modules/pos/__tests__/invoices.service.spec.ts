import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoicesService } from '../invoices.service';

function createHarness() {
  const queries: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.raw.join(''));
      return [];
    }),
    order: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          totalAmount: new Prisma.Decimal('0.00'),
          cashAmount: new Prisma.Decimal('0.00'),
          transferAmount: new Prisma.Decimal('0.00'),
        },
      }),
      update: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { prisma, tx, queries };
}

describe('InvoicesService', () => {
  afterEach(() => vi.useRealTimers());

  it('should default invoice filtering to the current business day and paginate on the server', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T03:00:00.000Z'));
    const harness = createHarness();
    harness.prisma.order.findMany.mockResolvedValue([]);
    const service = new InvoicesService(harness.prisma as never);

    const result = await service.list({ page: 2, limit: 10 });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: [
              { createdAt: {
                gte: new Date('2026-11-08T00:00:00.000+07:00'),
                lt: new Date('2026-11-09T00:00:00.000+07:00'),
              } },
              { paidAt: {
                gte: new Date('2026-11-08T00:00:00.000+07:00'),
                lt: new Date('2026-11-09T00:00:00.000+07:00'),
              } },
            ],
          }),
        ]),
      }),
      skip: 10,
      take: 10,
    }));
    expect(result).toMatchObject({ page: 2, limit: 10, total: 0, items: [] });
  });

  it('should combine the selected search field with date, status, payment, and orderType filters', async () => {
    const harness = createHarness();
    const service = new InvoicesService(harness.prisma as never);

    await service.list({
      page: 1, limit: 20, fromDate: '2026-11-01', toDate: '2026-11-08',
      searchField: 'table', keyword: '07', status: 'PAID', paymentMethod: 'CASH', orderType: 'DINE_IN',
    });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { status: 'PAID' },
          { paymentMethod: 'CASH' },
          { orderType: 'DINE_IN' },
          expect.objectContaining({
            OR: expect.arrayContaining([
              { table: { is: { name: { contains: '07', mode: 'insensitive' } } } },
            ]),
          }),
        ]),
      }),
    }));
  });

  it('should match takeaway orders when searching by table with takeaway keyword or number', async () => {
    const harness = createHarness();
    const service = new InvoicesService(harness.prisma as never);

    await service.list({
      page: 1, limit: 20, searchField: 'table', keyword: 'Mang về 02',
    });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { orderType: 'TAKEAWAY' },
              { orderType: 'TAKEAWAY', takeawayNumber: 2 },
            ]),
          }),
        ]),
      }),
    }));
  });

  it('should default a keyword without an explicit field to order code search', async () => {
    const harness = createHarness();
    const service = new InvoicesService(harness.prisma as never);

    await service.list({ page: 1, limit: 20, keyword: 'HD-0001' });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { orderCode: { contains: 'HD-0001', mode: 'insensitive' } },
        ]),
      }),
    }));
  });

  it('should void a paid invoice under a row lock without overwriting payment fields', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({ id: 42, status: 'PAID', totalAmount: new Prisma.Decimal('100.00') });
    harness.tx.order.update.mockResolvedValue({ id: 42, status: 'VOIDED', voidReason: 'Khách phản ánh tính sai' });
    const service = new InvoicesService(harness.prisma as never);

    await expect(service.voidInvoice(42, { voidReason: 'Khách phản ánh tính sai' }, 3))
      .resolves.toMatchObject({ orderId: 42, status: 'VOIDED', voidReason: 'Khách phản ánh tính sai' });

    expect(harness.queries[0]).toContain('FROM orders');
    expect(harness.tx.order.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'VOIDED', voidReason: 'Khách phản ánh tính sai' },
      select: { id: true, orderCode: true, status: true, voidReason: true },
    });
  });

  it('should reject voiding an invoice unless it is currently paid', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({ id: 42, status: 'SERVING' });
    const service = new InvoicesService(harness.prisma as never);

    await expect(service.voidInvoice(42, { voidReason: 'Khách phản ánh tính sai' }, 3))
      .rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('should always restrict invoice list queries strictly to PAID invoices', async () => {
    const harness = createHarness();
    const service = new InvoicesService(harness.prisma as never);

    await service.list({ page: 1, limit: 20 });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { status: 'PAID' },
        ]),
      }),
    }));
  });

  it('should save a pending PTTT edit for an employee without invoices:approve and approve/sync on approver review', async () => {
    const harness = createHarness();
    const txWithSettlements = {
      ...harness.tx,
      user: {
        findUnique: vi.fn().mockResolvedValue({
          username: 'cashier01',
          employee: { fullName: 'Nguyễn Thu Ngân' },
        }),
      },
      cashDrawerSettlement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    harness.prisma.$transaction.mockImplementation(async (operation: (client: typeof txWithSettlements) => Promise<unknown>) =>
      operation(txWithSettlements),
    );
    txWithSettlements.order.findUnique.mockResolvedValue({
      id: 501,
      orderCode: 'HD-20261114-0001',
      status: 'PAID',
      paymentMethod: 'CASH',
      totalAmount: new Prisma.Decimal('185000.00'),
      paidAt: new Date('2026-11-14T05:00:00.000Z'),
    });
    txWithSettlements.order.update.mockResolvedValue({});
    const auditLogService = { record: vi.fn() };
    const service = new InvoicesService(harness.prisma as never, auditLogService as never);

    const employeeResult = await service.requestPaymentMethodEdit(
      501,
      { paymentMethod: 'TRANSFER', reason: 'Thu ngân bấm nhầm tiền mặt sang chuyển khoản' },
      { id: 2, permissions: { invoices: { approve: false } }, isSuperAdmin: false, username: 'cashier01' } as never,
    );

    expect(employeeResult).toMatchObject({
      orderId: 501,
      status: 'PENDING_APPROVAL',
      pendingPaymentEdit: expect.objectContaining({
        paymentMethod: 'TRANSFER',
        cashAmount: 0,
        transferAmount: 185000,
        requestedByName: 'Nguyễn Thu Ngân',
        requestedByUsername: 'cashier01',
      }),
    });

    txWithSettlements.order.findUnique.mockResolvedValue({
      id: 501,
      orderCode: 'HD-20261114-0001',
      status: 'PAID',
      paymentMethod: 'CASH',
      paidAt: new Date('2026-11-14T05:00:00.000Z'),
      pendingPaymentEdit: employeeResult.pendingPaymentEdit,
    });

    const approveResult = await service.reviewPaymentMethodEdit(
      501,
      { decision: 'APPROVE', reviewNote: 'Đã kiểm tra sao kê QR' },
      { id: 1, permissions: { invoices: { approve: true } }, isSuperAdmin: true, username: 'superadmin' } as never,
    );

    expect(approveResult).toMatchObject({
      orderId: 501,
      status: 'APPROVED',
      paymentMethod: 'TRANSFER',
      cashAmount: 0,
      transferAmount: 185000,
    });
    expect(txWithSettlements.order.update).toHaveBeenLastCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({
        paymentMethod: 'TRANSFER',
        pendingPaymentEdit: Prisma.DbNull,
      }),
    });
    expect(auditLogService.record).toHaveBeenCalledTimes(2);
  });

  it('should immediately apply PTTT edit when the actor already holds invoices:approve permission', async () => {
    const harness = createHarness();
    const txWithSettlements = {
      ...harness.tx,
      cashDrawerSettlement: { findMany: vi.fn().mockResolvedValue([]) },
    };
    harness.prisma.$transaction.mockImplementation(async (operation: (client: typeof txWithSettlements) => Promise<unknown>) =>
      operation(txWithSettlements),
    );
    txWithSettlements.order.findUnique.mockResolvedValue({
      id: 502,
      orderCode: 'HD-20261114-0002',
      status: 'PAID',
      paymentMethod: 'TRANSFER',
      totalAmount: new Prisma.Decimal('200000.00'),
      paidAt: new Date('2026-11-14T05:00:00.000Z'),
    });
    txWithSettlements.order.update.mockResolvedValue({});
    const service = new InvoicesService(harness.prisma as never);

    const result = await service.requestPaymentMethodEdit(
      502,
      { paymentMethod: 'CASH', reason: 'Khách đổi trả bằng tiền mặt tại quầy' },
      { id: 1, permissions: { invoices: { approve: true } }, isSuperAdmin: false, username: 'manager01' } as never,
    );

    expect(result).toMatchObject({
      orderId: 502,
      status: 'APPLIED',
      paymentMethod: 'CASH',
      cashAmount: 200000,
      transferAmount: 0,
    });
  });

  it('should aggregate totalPaidAmount, cashAmount, and transferAmount across all matching paid invoices', async () => {
    const harness = createHarness();
    harness.prisma.order.count.mockResolvedValue(3);
    harness.prisma.order.findMany.mockResolvedValue([]);
    harness.prisma.order.aggregate.mockResolvedValue({
      _sum: {
        totalAmount: new Prisma.Decimal('650000.00'),
        cashAmount: new Prisma.Decimal('400000.00'),
        transferAmount: new Prisma.Decimal('250000.00'),
      },
    });
    const service = new InvoicesService(harness.prisma as never);

    const res = await service.list({ page: 1, limit: 20, fromDate: '2026-11-14', toDate: '2026-11-14' });

    expect(res.summary).toEqual({
      totalPaidAmount: 650000,
      totalCashAmount: 400000,
      totalTransferAmount: 250000,
      totalDiscountAmount: 0,
      paidCount: 3,
    });
  });

  it('should filter by discountCode and searchField=discount_code and aggregate totalDiscountAmount', async () => {
    const harness = createHarness();
    harness.prisma.order.count.mockResolvedValue(1);
    harness.prisma.order.findMany.mockResolvedValue([
      {
        id: 77,
        orderCode: 'HD-20261115-0005',
        orderType: 'DINE_IN',
        tableId: 2,
        takeawayNumber: null,
        table: { id: 2, name: 'Bàn 02' },
        status: 'PAID',
        paymentMethod: 'TRANSFER',
        cashAmount: new Prisma.Decimal(0),
        transferAmount: new Prisma.Decimal('180000.00'),
        subtotalAmount: new Prisma.Decimal('200000.00'),
        discountAmount: new Prisma.Decimal('20000.00'),
        discountId: 1,
        discountSnapshot: {
          kind: 'CODE',
          discountId: 1,
          code: 'GIAM10',
          name: 'Giảm 10%',
          valueType: 'PERCENT',
          value: 10,
          maxDiscountAmount: 20000,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: null,
          appliedAt: '2026-11-15T10:00:00.000Z',
          appliedBy: 1,
          reason: null,
        },
        totalAmount: new Prisma.Decimal('180000.00'),
        createdAt: new Date('2026-11-15T10:00:00.000Z'),
        paidAt: new Date('2026-11-15T10:05:00.000Z'),
        note: null,
      },
    ]);
    harness.prisma.order.aggregate.mockResolvedValue({
      _sum: {
        totalAmount: new Prisma.Decimal('180000.00'),
        cashAmount: new Prisma.Decimal(0),
        transferAmount: new Prisma.Decimal('180000.00'),
        discountAmount: new Prisma.Decimal('20000.00'),
      },
    });
    const service = new InvoicesService(harness.prisma as never);

    const res = await service.list({
      page: 1,
      limit: 20,
      fromDate: '2026-11-15',
      toDate: '2026-11-15',
      keyword: 'giam10',
      searchField: 'discount_code',
    });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { discount: { is: { code: { contains: 'giam10', mode: 'insensitive' } } } },
        ]),
      },
    }));
    expect(res.summary.totalDiscountAmount).toBe(20000);
    expect(res.items[0].subtotalAmount).toBe(200000);
    expect(res.items[0].discountAmount).toBe(20000);
    expect(res.items[0].discountSnapshot?.code).toBe('GIAM10');
  });

  it('should reject reprinting a VOIDED invoice without writing an audit log', async () => {
    const harness = createHarness();
    const auditLogService = { record: vi.fn() };
    harness.prisma.order.findUnique.mockResolvedValue({
      id: 94,
      orderCode: 'HD-20261118-0004',
      orderType: 'DINE_IN',
      orderSource: 'POS_COUNTER',
      tableId: 5,
      table: { id: 5, name: 'Bàn 05' },
      takeawayNumber: null,
      status: 'VOIDED',
      paymentMethod: 'CASH',
      cashAmount: new Prisma.Decimal('15000.00'),
      transferAmount: new Prisma.Decimal('0.00'),
      subtotalAmount: new Prisma.Decimal('15000.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      discountId: null,
      discountSnapshot: null,
      totalAmount: new Prisma.Decimal('15000.00'),
      note: null,
      createdAt: new Date('2026-11-18T01:12:02.000Z'),
      paidAt: new Date('2026-11-18T01:12:02.000Z'),
      pendingPaymentEdit: null,
      tableTransferLogs: [],
      items: [],
    });
    const service = new InvoicesService(harness.prisma as never, auditLogService as never);

    await expect(service.reprint(94, { id: 1, isSuperAdmin: true } as never))
      .rejects.toBeInstanceOf(ConflictException);
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
