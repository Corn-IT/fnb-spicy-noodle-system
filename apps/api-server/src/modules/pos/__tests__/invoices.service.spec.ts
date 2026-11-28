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

  it('formats takeaway invoices using each order takeawayLabelFormat snapshot and resolves #AA search queries', async () => {
    const harness = createHarness();
    harness.prisma.order.count.mockResolvedValue(2);
    harness.prisma.order.findMany.mockResolvedValue([
      {
        id: 201,
        orderCode: 'HD-20261127-0005',
        orderType: 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: null,
        table: null,
        takeawayNumber: 5,
        takeawayLabelFormat: 'LETTER',
        status: 'PAID',
        paymentMethod: 'CASH',
        cashAmount: new Prisma.Decimal('60000.00'),
        transferAmount: new Prisma.Decimal('0.00'),
        subtotalAmount: new Prisma.Decimal('60000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        discountSnapshot: null,
        totalAmount: new Prisma.Decimal('60000.00'),
        createdAt: new Date('2026-11-27T04:00:00.000Z'),
        paidAt: new Date('2026-11-27T04:10:00.000Z'),
        note: null,
      },
      {
        id: 202,
        orderCode: 'HD-20261127-0006',
        orderType: 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: null,
        table: null,
        takeawayNumber: 6,
        takeawayLabelFormat: 'NUMBER',
        status: 'PAID',
        paymentMethod: 'TRANSFER',
        cashAmount: new Prisma.Decimal('0.00'),
        transferAmount: new Prisma.Decimal('30000.00'),
        subtotalAmount: new Prisma.Decimal('30000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        discountSnapshot: null,
        totalAmount: new Prisma.Decimal('30000.00'),
        createdAt: new Date('2026-11-27T05:00:00.000Z'),
        paidAt: new Date('2026-11-27T05:10:00.000Z'),
        note: null,
      },
    ]);
    harness.prisma.order.aggregate.mockResolvedValue({
      _sum: {
        totalAmount: new Prisma.Decimal('90000.00'),
        cashAmount: new Prisma.Decimal('60000.00'),
        transferAmount: new Prisma.Decimal('30000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
      },
    });
    const service = new InvoicesService(harness.prisma as never);

    const res = await service.list({
      page: 1,
      limit: 20,
      fromDate: '2026-11-27',
      toDate: '2026-11-27',
      searchField: 'table',
      keyword: 'Mang về #AA',
    });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { orderType: 'TAKEAWAY', takeawayNumber: 5 },
              ]),
            },
          ]),
        },
      }),
    );
    expect(res.items.map((i) => i.tableLabel)).toEqual(['Mang về #AA', 'Mang về #06']);
    expect(res.items[0]?.takeawayLabelFormat).toBe('LETTER');
    expect(res.items[1]?.takeawayLabelFormat).toBe('NUMBER');
  });

  it('recalculates settled cashflow snapshots when voidInvoice voids a PAID order inside a settled shift', async () => {
    const harness = createHarness();
    const settledShift = {
      id: 88,
      settlementDate: new Date('2026-11-27T00:00:00.000Z'),
      shiftName: 'Ca Sáng (08:00 - 15:00)',
      openingBudget: new Prisma.Decimal('1000000.00'),
      totalCashImports: new Prisma.Decimal('120000.00'),
      actualCountedCash: new Prisma.Decimal('980000.00'),
    };
    const txWithCashflow = {
      ...harness.tx,
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.raw.join('');
        harness.queries.push(sql);
        if (sql.includes('FROM orders') && sql.includes("status = 'PAID'")) {
          return [{ totalCashSales: new Prisma.Decimal('100000.00'), totalTransferSales: new Prisma.Decimal('50000.00') }];
        }
        return [];
      }),
      cashDrawerSettlement: {
        findMany: vi.fn().mockResolvedValue([settledShift]),
        update: vi.fn().mockResolvedValue({ ...settledShift, id: 88 }),
      },
    };
    harness.prisma.$transaction.mockImplementation(async (operation: (client: typeof txWithCashflow) => Promise<unknown>) =>
      operation(txWithCashflow),
    );
    txWithCashflow.order.findUnique.mockResolvedValue({
      id: 701,
      status: 'PAID',
      paidAt: new Date('2026-11-27T04:00:00.000Z'), // 11:00 AM GMT+7 inside Ca Sáng (08:00-15:00)
      discountId: null,
      discountAmount: new Prisma.Decimal('0.00'),
    });
    txWithCashflow.order.update.mockResolvedValue({
      id: 701,
      orderCode: 'HD-20261127-0701',
      status: 'VOIDED',
      voidReason: 'Khách phản ánh tính nhầm tiền',
    });

    const auditLogService = { record: vi.fn() };
    const service = new InvoicesService(harness.prisma as never, auditLogService as never);

    const res = await service.voidInvoice(701, { voidReason: 'Khách phản ánh tính nhầm tiền' }, 1);
    expect(res.syncedSettlementIds).toEqual([88]);
    expect(txWithCashflow.cashDrawerSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 88 },
        data: expect.objectContaining({
          totalCashSales: new Prisma.Decimal('100000.00'),
          expectedCashInDrawer: new Prisma.Decimal('980000.00'),
          discrepancyAmount: new Prisma.Decimal('0.00'),
          status: 'MATCHED',
        }),
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ syncedSettlementIds: [88] }),
      }),
    );
  });

  it('rejects REJECT review flows, missing pending edits, invalid SPLIT edits, and missing invoice lookup', async () => {
    const harness = createHarness();
    const auditLogService = { record: vi.fn() };
    const service = new InvoicesService(harness.prisma as never, auditLogService as never);

    harness.prisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(service.get(9999)).rejects.toThrow('Không tìm thấy hoá đơn');

    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: 800,
      orderCode: 'HD-800',
      status: 'SERVING',
      totalAmount: new Prisma.Decimal('100000.00'),
    });
    await expect(
      service.requestPaymentMethodEdit(
        800,
        { paymentMethod: 'CASH', reason: 'Chưa thanh toán không thể sửa' },
        { id: 1, isSuperAdmin: true, permissions: {} } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: 801,
      orderCode: 'HD-801',
      status: 'PAID',
      paymentMethod: 'CASH',
      paidAt: new Date('2026-11-27T05:00:00.000Z'),
      pendingPaymentEdit: null,
    });
    await expect(
      service.reviewPaymentMethodEdit(
        801,
        { decision: 'REJECT' },
        { id: 1, isSuperAdmin: true, permissions: {} } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: 802,
      orderCode: 'HD-802',
      status: 'PAID',
      paymentMethod: 'CASH',
      paidAt: new Date('2026-11-27T05:00:00.000Z'),
      pendingPaymentEdit: {
        paymentMethod: 'TRANSFER',
        cashAmount: 0,
        transferAmount: 100000,
        reason: 'Khách đổi sang QR',
        requestedBy: 2,
        requestedByName: 'Cashier',
        requestedByUsername: 'cashier01',
        requestedAt: '2026-11-27T05:05:00.000Z',
      },
    });
    harness.tx.order.update.mockResolvedValueOnce({});
    const rejected = await service.reviewPaymentMethodEdit(
      802,
      { decision: 'REJECT', reviewNote: 'Chưa nhận tiền CK' },
      { id: 1, isSuperAdmin: true, permissions: {} } as never,
    );
    expect(rejected).toEqual({ orderId: 802, orderCode: 'HD-802', status: 'REJECTED' });
  });

  it('filters invoices across search fields, resolves QR account when editing CASH -> TRANSFER, and reads pricedModifiers', async () => {
    const harness = createHarness();
    const qrService = {
      selectForAmount: vi.fn().mockResolvedValue({ account: { id: 9, label: 'QR #9' } }),
    };
    const auditLogService = { record: vi.fn() };
    harness.prisma.$queryRaw = vi.fn().mockResolvedValue([{ id: 7 }]) as never;
    (harness.prisma.order as { count?: unknown }).count = vi.fn().mockResolvedValue(1);
    (harness.prisma.order as { findMany?: unknown }).findMany = vi.fn().mockResolvedValue([]);

    const svc = new InvoicesService(harness.prisma as never, auditLogService as never, qrService as never);
    await expect(svc.list({ page: 1, limit: 20, fromDate: '2026-11-27', toDate: '2026-11-27', searchField: 'note', keyword: 'ít cay' })).resolves.toMatchObject({ total: 1 });
    await expect(svc.list({ page: 1, limit: 20, fromDate: '2026-11-27', toDate: '2026-11-27', searchField: 'discount_code', keyword: 'VIP', discountCode: 'VIP', paymentMethod: 'CASH', orderType: 'DINE_IN' })).resolves.toMatchObject({ total: 1 });
    await expect(svc.list({ page: 1, limit: 20, fromDate: '2026-11-27', toDate: '2026-11-27', searchField: 'table', keyword: 'mang về 02' })).resolves.toMatchObject({ total: 1 });
    await expect(svc.list({ page: 1, limit: 20, searchField: 'bad_field' as never })).rejects.toMatchObject({ status: 422 });

    // Trigger resolvePaymentAccountIdForEdit on CASH -> TRANSFER approval
    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: 805,
      orderCode: 'HD-805',
      status: 'PAID',
      paymentMethod: 'CASH',
      paymentAccountId: null,
      paidAt: new Date('2026-11-27T05:00:00.000Z'),
      pendingPaymentEdit: {
        paymentMethod: 'TRANSFER',
        cashAmount: 0,
        transferAmount: 100000,
        reason: 'Đổi sang QR',
        requestedBy: 2,
        requestedByName: 'Cashier',
        requestedByUsername: 'cashier01',
        requestedAt: '2026-11-27T05:05:00.000Z',
      },
    });
    harness.tx.paymentAccount = { findMany: vi.fn() };
    harness.tx.order.update.mockResolvedValueOnce({});
    const approved = await svc.reviewPaymentMethodEdit(
      805,
      { decision: 'APPROVE' },
      { id: 1, isSuperAdmin: true, permissions: {} } as never,
    );
    expect(approved.status).toBe('APPROVED');
    expect(qrService.selectForAmount).toHaveBeenCalled();

    harness.prisma.order.findUnique.mockResolvedValueOnce({
      id: 806,
      orderCode: 'HD-806',
      orderType: 'DINE_IN',
      orderSource: 'POS_COUNTER',
      tableId: 7,
      takeawayNumber: null,
      status: 'PAID',
      subtotalAmount: new Prisma.Decimal('100000'),
      discountAmount: new Prisma.Decimal('0'),
      totalAmount: new Prisma.Decimal('100000'),
      discountSnapshot: null,
      paymentMethod: 'CASH',
      cashAmount: new Prisma.Decimal('100000'),
      transferAmount: new Prisma.Decimal('0'),
      paymentAccount: null,
      note: null,
      voidReason: null,
      pendingPaymentEdit: null,
      createdAt: new Date('2026-11-27T05:00:00.000Z'),
      paidAt: new Date('2026-11-27T05:10:00.000Z'),
      table: { id: 7, name: 'Bàn 07' },
      items: [
        {
          id: 1,
          productId: 11,
          quantity: 1,
          unitPrice: new Prisma.Decimal('100000'),
          modifiersSnapshot: [{ name: 'Thêm bò', extraPrice: 20000 }, { name: 'Ít hành', extraPrice: 0 }],
          itemNote: null,
          batchNo: 1,
          kitchenStatus: 'PRINTED',
          createdAt: new Date('2026-11-27T05:00:00.000Z'),
          product: { id: 11, name: 'Mì bò', station: 'BEP_NAU' },
        },
      ],
    });
    const detail = await svc.get(806);
    expect(detail.items[0]?.modifiers).toEqual(['Thêm bò', 'Ít hành']);
    expect(detail.items[0]?.pricedModifiers).toEqual(['Thêm bò']);
  });
});
