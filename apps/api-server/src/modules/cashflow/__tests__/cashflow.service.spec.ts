import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes, type CreateSettlementRequest } from '@fnb/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashflowService } from '../cashflow.service';

const denominations = {
  '500000': 2,
  '200000': 1,
  '100000': 1,
  '50000': 0,
  '20000': 1,
  '10000': 1,
  '5000': 1,
  '2000': 0,
  '1000': 0,
};

function createHarness() {
  const aggregateRow = {
    totalCashSales: new Prisma.Decimal('150000').plus('85000').plus('120000').plus('100000'),
    totalTransferSales: new Prisma.Decimal('220000').plus('310000').plus('200000'),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([aggregateRow]),
    masterData: {
      findUnique: vi.fn().mockResolvedValue({ metadata: { opening_budget: '1000000.00' } }),
      upsert: vi.fn(),
    },
    inventoryImport: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalCost: new Prisma.Decimal('120000.00') } }),
    },
    cashDrawerSettlement: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 5,
        ...data,
        createdAt: new Date('2026-11-08T15:00:00.000Z'),
      })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma, tx, aggregateRow };
}

function request(overrides: Partial<CreateSettlementRequest> = {}): CreateSettlementRequest {
  return {
    settlementDate: '2026-11-08',
    shiftName: 'Ca Tối',
    actualCountedCash: 1_335_000,
    denominationsDetail: denominations,
    ...overrides,
  };
}

describe('CashflowService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should compute the documented mixed case plus a split payment and voided invoice', async () => {
    const harness = createHarness();
    const service = new CashflowService(harness.prisma as never);

    const result = await service.settleShift(request(), 9);

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain("WHEN payment_method = 'CASH' THEN total_amount");
    expect(harness.tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain("WHEN payment_method = 'SPLIT' THEN cash_amount");
    expect(harness.tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain("WHEN payment_method = 'TRANSFER' THEN total_amount");
    expect(harness.tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain("WHEN payment_method = 'SPLIT' THEN transfer_amount");
    expect(harness.tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain("WHERE status = 'PAID'");
    expect(harness.tx.inventoryImport.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ paymentSource: 'CASH_DRAWER', isDeleted: false }),
    }));
    expect(harness.tx.cashDrawerSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        openingBudget: new Prisma.Decimal('1000000.00'),
        totalCashSales: new Prisma.Decimal('455000.00'),
        totalTransferSales: new Prisma.Decimal('730000.00'),
        totalCashImports: new Prisma.Decimal('120000.00'),
        expectedCashInDrawer: new Prisma.Decimal('1335000.00'),
        actualCountedCash: new Prisma.Decimal('1335000.00'),
        discrepancyAmount: new Prisma.Decimal('0.00'),
        status: 'MATCHED',
        closedBy: 9,
      }),
    });
    expect(result).toMatchObject({
      expectedCashInDrawer: 1_335_000,
      totalCashSales: 455_000,
      totalTransferSales: 730_000,
      totalCashImports: 120_000,
      discrepancyAmount: 0,
      status: 'MATCHED',
      cashRetainedInDrawer: 1_000_000,
      cashToHandOver: 335_000,
    });
  });

  it('should reject a discrepancy without an explanation before saving the settlement', async () => {
    const harness = createHarness();
    const service = new CashflowService(harness.prisma as never);

    const counts = { ...denominations, '20000': 0, '10000': 0, '5000': 0 };
    await expect(service.settleShift(request({ actualCountedCash: 1_300_000, denominationsDetail: counts }), 9)).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: expect.objectContaining({ code: ErrorCodes.CASHFLOW_DISCREPANCY_NOTE_REQUIRED }),
    });
    expect(harness.tx.cashDrawerSettlement.create).not.toHaveBeenCalled();
  });

  it('should classify a shortage and preserve its explanation', async () => {
    const harness = createHarness();
    const service = new CashflowService(harness.prisma as never);
    const shortCounts = { ...denominations, '100000': 0 };

    const result = await service.settleShift(request({
      actualCountedCash: 1_235_000,
      denominationsDetail: shortCounts,
      note: 'Thiếu tiền sau kiểm đếm',
    }), 9);

    expect(result).toMatchObject({ discrepancyAmount: -100_000, status: 'SHORTAGE', note: 'Thiếu tiền sau kiểm đếm' });
  });

  it('should classify a surplus only after recording the required explanation', async () => {
    const harness = createHarness();
    const service = new CashflowService(harness.prisma as never);
    const surplusCounts = { ...denominations, '50000': 1 };

    const result = await service.settleShift(request({
      actualCountedCash: 1_385_000,
      denominationsDetail: surplusCounts,
      note: 'Khách thanh toán tiền lẻ dư',
    }), 9);

    expect(result).toMatchObject({ discrepancyAmount: 50_000, status: 'SURPLUS', note: 'Khách thanh toán tiền lẻ dư' });
  });

  it('should reject a settlement when the opening budget has not been configured', async () => {
    const harness = createHarness();
    harness.tx.masterData.findUnique.mockResolvedValue(null);
    const service = new CashflowService(harness.prisma as never);

    await expect(service.settleShift(request(), 9)).rejects.toMatchObject({
      constructor: BadRequestException,
      response: expect.objectContaining({ code: ErrorCodes.CASHFLOW_BUDGET_NOT_SET }),
    });
    expect(harness.tx.cashDrawerSettlement.create).not.toHaveBeenCalled();
  });

  it('should retain zero handover when the counted drawer is below the opening budget', async () => {
    const harness = createHarness();
    const service = new CashflowService(harness.prisma as never);
    const lowCounts = {
      ...denominations,
      '500000': 1,
      '200000': 2,
      '100000': 0,
      '50000': 0,
      '20000': 0,
      '10000': 0,
      '5000': 0,
    };

    const result = await service.settleShift(request({
      actualCountedCash: 900_000,
      denominationsDetail: lowCounts,
      note: 'Thiếu tiền mặt cuối ca',
    }), 9);

    expect(result).toMatchObject({ cashRetainedInDrawer: 1_000_000, cashToHandOver: 0, status: 'SHORTAGE' });
  });

  it('should calculate the live preview without including transfer sales in cash on hand', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T05:00:00.000Z'));
    const harness = createHarness();
    const service = new CashflowService(harness.prisma as never);

    const result = await service.preview();

    expect(result).toMatchObject({
      openingBudget: 1_000_000,
      totalCashSales: 455_000,
      totalTransferSales: 730_000,
      totalCashImports: 120_000,
      expectedCashInDrawer: 1_335_000,
    });
    expect(result.shiftName).toBeTruthy();
  });

  it('should update the configured opening budget through a Decimal config value', async () => {
    const harness = createHarness();
    harness.tx.masterData.upsert.mockResolvedValue({ metadata: { opening_budget: '1500000.25' } });
    const service = new CashflowService(harness.prisma as never);

    await expect(service.setDefaultBudget({ openingBudget: 1_500_000.25 })).resolves.toMatchObject({ openingBudget: 1_500_000.25 });
    expect(harness.tx.masterData.upsert).toHaveBeenCalledWith({
      where: { category_normalizedName: { category: 'UNIT', normalizedName: '__internal_cashflow_default_opening_budget__' } },
      create: expect.objectContaining({ category: 'UNIT', metadata: { opening_budget: '1500000.25' }, isActive: false }),
      update: { metadata: { opening_budget: '1500000.25' }, isActive: false },
    });
  });

  it('should list settlement history by date in descending order with server pagination', async () => {
    const harness = createHarness();
    harness.tx.cashDrawerSettlement.count.mockResolvedValue(1);
    harness.tx.cashDrawerSettlement.findMany.mockResolvedValue([{
      id: 3,
      settlementDate: new Date('2026-11-08T00:00:00.000Z'),
      shiftName: 'Ca Tối',
      openingBudget: new Prisma.Decimal('1000000'),
      totalCashSales: new Prisma.Decimal('455000'),
      totalTransferSales: new Prisma.Decimal('730000'),
      totalCashImports: new Prisma.Decimal('120000'),
      expectedCashInDrawer: new Prisma.Decimal('1335000'),
      actualCountedCash: new Prisma.Decimal('1335000'),
      discrepancyAmount: new Prisma.Decimal('0'),
      status: 'MATCHED',
      denominationsDetail: denominations,
      note: null,
      closedBy: 9,
      createdAt: new Date('2026-11-08T15:00:00.000Z'),
    }]);
    const service = new CashflowService(harness.prisma as never);

    const result = await service.listSettlements({ page: 1, limit: 10, fromDate: '2026-11-01', toDate: '2026-11-08' });

    expect(harness.tx.cashDrawerSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { settlementDate: { gte: new Date('2026-11-01T00:00:00.000Z'), lte: new Date('2026-11-08T00:00:00.000Z') } },
      orderBy: [{ settlementDate: 'desc' }, { createdAt: 'desc' }],
      skip: 0,
      take: 10,
    }));
    expect(result.items[0]).toMatchObject({ cashRetainedInDrawer: 1_000_000, cashToHandOver: 335_000 });
  });

  it('should reject a second settlement for the same date and shift', async () => {
    const harness = createHarness();
    harness.tx.cashDrawerSettlement.findUnique.mockResolvedValue({ id: 1 });
    const service = new CashflowService(harness.prisma as never);

    await expect(service.settleShift(request(), 9)).rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.cashDrawerSettlement.create).not.toHaveBeenCalled();
  });

  it('should compensate a non-zero discrepancy settlement to MATCHED and reject 0-discrepancy records', async () => {
    const harness = createHarness();
    const txWithUpdate = {
      ...harness.tx,
      user: {
        findUnique: vi.fn().mockResolvedValue({
          username: 'cashier01',
          employee: { fullName: 'Nguyễn Thu Ngân' },
        }),
      },
      cashDrawerSettlement: {
        ...harness.tx.cashDrawerSettlement,
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    harness.prisma.$transaction.mockImplementation(async (callback: (client: typeof txWithUpdate) => Promise<unknown>) =>
      callback(txWithUpdate),
    );
    const auditLogService = { record: vi.fn() };
    const service = new CashflowService(harness.prisma as never, auditLogService as never);

    txWithUpdate.cashDrawerSettlement.findUnique.mockResolvedValueOnce({
      id: 10,
      settlementDate: new Date('2026-11-08T00:00:00.000Z'),
      shiftName: 'Ca Tối',
      openingBudget: new Prisma.Decimal('1000000.00'),
      totalCashSales: new Prisma.Decimal('1000000.00'),
      totalTransferSales: new Prisma.Decimal('500000.00'),
      totalCashImports: new Prisma.Decimal('200000.00'),
      expectedCashInDrawer: new Prisma.Decimal('1800000.00'),
      actualCountedCash: new Prisma.Decimal('1750000.00'),
      discrepancyAmount: new Prisma.Decimal('-50000.00'),
      status: 'SHORTAGE',
      denominationsDetail: denominations,
      note: 'Thiếu 50k',
      closedBy: 2,
      createdAt: new Date('2026-11-08T15:00:00.000Z'),
    });
    txWithUpdate.cashDrawerSettlement.update.mockResolvedValueOnce({
      id: 10,
      settlementDate: new Date('2026-11-08T00:00:00.000Z'),
      shiftName: 'Ca Tối',
      openingBudget: new Prisma.Decimal('1000000.00'),
      totalCashSales: new Prisma.Decimal('1000000.00'),
      totalTransferSales: new Prisma.Decimal('500000.00'),
      totalCashImports: new Prisma.Decimal('200000.00'),
      expectedCashInDrawer: new Prisma.Decimal('1800000.00'),
      actualCountedCash: new Prisma.Decimal('1800000.00'),
      discrepancyAmount: new Prisma.Decimal('0.00'),
      status: 'MATCHED',
      denominationsDetail: denominations,
      note: 'Thiếu 50k\n[Đã bù chênh lệch -50.000đ bởi Nguyễn Thu Ngân (cashier01): Nộp bù 50k tiền mặt]',
      closedBy: 2,
      closer: { username: 'cashier01', employee: { fullName: 'Nguyễn Thu Ngân' } },
      createdAt: new Date('2026-11-08T15:00:00.000Z'),
    });

    const compensated = await service.compensateSettlement(10, { note: 'Nộp bù 50k tiền mặt' }, 2);
    expect(compensated).toMatchObject({
      id: 10,
      actualCountedCash: 1800000,
      discrepancyAmount: 0,
      status: 'MATCHED',
      cashToHandOver: 800000,
      closedByName: 'Nguyễn Thu Ngân',
      closedByUsername: 'cashier01',
    });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      module: 'CASHFLOW',
      action: 'Bù chênh lệch kết ca',
      metadata: expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ field: 'Chênh lệch' }),
          expect.objectContaining({ field: 'Tiền thực đếm' }),
        ]),
      }),
    }));

    txWithUpdate.cashDrawerSettlement.findUnique.mockResolvedValueOnce({
      id: 11,
      discrepancyAmount: new Prisma.Decimal('0.00'),
    });
    await expect(service.compensateSettlement(11, { note: 'Không có chênh lệch' }, 2))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('should add/subtract compensationAmount when provided and keep remaining discrepancy if partial', async () => {
    const harness = createHarness();
    const txWithUpdate = {
      ...harness.tx,
      user: {
        findUnique: vi.fn().mockResolvedValue({
          username: 'cashier01',
          employee: { fullName: 'Nguyễn Thu Ngân' },
        }),
      },
      cashDrawerSettlement: {
        ...harness.tx.cashDrawerSettlement,
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    harness.prisma.$transaction.mockImplementation(async (callback: (client: typeof txWithUpdate) => Promise<unknown>) =>
      callback(txWithUpdate),
    );
    const auditLogService = { record: vi.fn() };
    const service = new CashflowService(harness.prisma as never, auditLogService as never);

    txWithUpdate.cashDrawerSettlement.findUnique.mockResolvedValueOnce({
      id: 12,
      settlementDate: new Date('2026-11-08T00:00:00.000Z'),
      shiftName: 'CA_NGAY',
      openingBudget: new Prisma.Decimal('1000000.00'),
      totalCashSales: new Prisma.Decimal('1000000.00'),
      totalTransferSales: new Prisma.Decimal('0.00'),
      totalCashImports: new Prisma.Decimal('200000.00'),
      expectedCashInDrawer: new Prisma.Decimal('1800000.00'),
      actualCountedCash: new Prisma.Decimal('1700000.00'),
      discrepancyAmount: new Prisma.Decimal('-100000.00'),
      status: 'SHORTAGE',
      denominationsDetail: denominations,
      note: 'Thiếu 100k',
      closedBy: 2,
      createdAt: new Date('2026-11-08T15:00:00.000Z'),
    });
    txWithUpdate.cashDrawerSettlement.update.mockResolvedValueOnce({
      id: 12,
      settlementDate: new Date('2026-11-08T00:00:00.000Z'),
      shiftName: 'CA_NGAY',
      openingBudget: new Prisma.Decimal('1000000.00'),
      totalCashSales: new Prisma.Decimal('1000000.00'),
      totalTransferSales: new Prisma.Decimal('0.00'),
      totalCashImports: new Prisma.Decimal('200000.00'),
      expectedCashInDrawer: new Prisma.Decimal('1800000.00'),
      actualCountedCash: new Prisma.Decimal('1760000.00'),
      discrepancyAmount: new Prisma.Decimal('-40000.00'),
      status: 'SHORTAGE',
      denominationsDetail: denominations,
      note: 'Thiếu 100k\n[Đã bù chênh lệch 60.000đ bởi Nguyễn Thu Ngân (cashier01): Bù trước 60k]',
      closedBy: 2,
      closer: { username: 'cashier01', employee: { fullName: 'Nguyễn Thu Ngân' } },
      createdAt: new Date('2026-11-08T15:00:00.000Z'),
    });

    const partial = await service.compensateSettlement(12, { compensationAmount: 60000, note: 'Bù trước 60k' }, 2);
    expect(txWithUpdate.cashDrawerSettlement.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actualCountedCash: new Prisma.Decimal('1760000.00'),
        discrepancyAmount: new Prisma.Decimal('-40000.00'),
        status: 'SHORTAGE',
      }),
    }));
    expect(partial.discrepancyAmount).toBe(-40000);
    expect(partial.status).toBe('SHORTAGE');
  });
});
