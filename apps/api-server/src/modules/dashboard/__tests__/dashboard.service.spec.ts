import { Prisma } from '@prisma/client';
import { UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../dashboard.service';

const dec = (n: number) => new Prisma.Decimal(n);

function makeSuperAdmin(): AuthPrincipal {
  return {
    id: 1,
    employeeId: 1,
    username: 'superadmin',
    isSuperAdmin: true,
    permissions: UserPermissionsSchema.parse({}),
  };
}

function makeCashier(): AuthPrincipal {
  return {
    id: 4,
    employeeId: 4,
    username: 'thungan',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({
      dashboard: { view: true, viewProfit: false, export: false },
      pos: { view: true },
      invoices: { view: true },
      inventory: { view: true },
      cashflow: { view: true },
      schedules: { view: true },
      payroll: { view: false },
    }),
  };
}

function buildMockDeps() {
  const now = new Date('2026-11-17T14:30:00.000Z'); // 21:30 VN time (+07:00)

  const paidOrders = [
    {
      id: 101,
      orderCode: 'HD-20261117-0001',
      orderType: 'DINE_IN',
      orderSource: 'QR_CODE',
      tableId: 1,
      takeawayNumber: null,
      paymentMethod: 'CASH',
      paymentAccountId: null,
      cashAmount: dec(100000),
      transferAmount: dec(0),
      subtotalAmount: dec(110000),
      discountAmount: dec(10000),
      discountId: 1,
      discountSnapshot: {
        kind: 'CODE',
        discountId: 1,
        code: 'GIAM10',
        name: 'Giảm 10%',
        valueType: 'PERCENT',
        value: 10,
        maxDiscountAmount: 50000,
        scope: 'ORDER',
        targetCategoryIds: [],
        targetProductIds: [],
        minOrderAmount: 80000,
        appliedAt: '2026-11-17T07:00:00.000Z',
        appliedBy: 1,
        reason: null,
      },
      totalAmount: dec(100000),
      tableTransferLogs: [{ action: 'MOVE', fromTable: 'Bàn 01', toTable: 'Bàn 02', timestamp: '2026-11-17T07:10:00.000Z' }],
      paidAt: new Date('2026-11-17T08:00:00.000Z'), // 15:00 VN (happy hour!)
      table: { name: 'Bàn 02' },
      paymentAccount: null,
    },
    {
      id: 102,
      orderCode: 'HD-20261117-0002',
      orderType: 'TAKEAWAY',
      orderSource: 'POS_COUNTER',
      tableId: null,
      takeawayNumber: 1,
      paymentMethod: 'TRANSFER',
      paymentAccountId: 1,
      cashAmount: dec(0),
      transferAmount: dec(200000),
      subtotalAmount: dec(200000),
      discountAmount: dec(0),
      discountId: null,
      discountSnapshot: null,
      totalAmount: dec(200000),
      tableTransferLogs: [],
      paidAt: new Date('2026-11-17T12:15:00.000Z'), // 19:15 VN
      table: null,
      paymentAccount: { id: 1, label: 'TK Chính (BIDV)', bankCode: 'BIDV' },
    },
    {
      id: 103,
      orderCode: 'HD-20261117-0003',
      orderType: 'DINE_IN',
      orderSource: 'QR_CODE',
      tableId: 3,
      takeawayNumber: null,
      paymentMethod: 'SPLIT',
      paymentAccountId: 2,
      cashAmount: dec(60000),
      transferAmount: dec(90000),
      subtotalAmount: dec(165000),
      discountAmount: dec(15000),
      discountId: null,
      discountSnapshot: {
        kind: 'MANUAL',
        discountId: null,
        code: null,
        name: 'Giảm giá tay',
        valueType: 'FIXED',
        value: 15000,
        maxDiscountAmount: null,
        scope: 'ORDER',
        targetCategoryIds: [],
        targetProductIds: [],
        minOrderAmount: null,
        appliedAt: '2026-11-17T13:00:00.000Z',
        appliedBy: 1,
        reason: 'Khách quen',
      },
      totalAmount: dec(150000),
      tableTransferLogs: [],
      paidAt: new Date('2026-11-17T13:10:00.000Z'), // 20:10 VN
      table: { name: 'Bàn 03' },
      paymentAccount: { id: 2, label: 'TK Phụ (VCB)', bankCode: 'VCB' },
    },
  ];

  const orderItems = [
    {
      orderId: 101,
      productId: 10,
      quantity: 2,
      unitPrice: dec(55000),
      modifiersSnapshot: [
        { groupId: 1, modifierId: 2, name: 'Cấp độ 1', extraPrice: 0 },
        { groupId: 2, modifierId: 8, name: 'Bò Mỹ (10k)', extraPrice: 10000 },
      ],
      kitchenStatus: 'PRINTED',
      product: { id: 10, name: 'Mì Bò Mỹ', station: 'BEP_NAU', price: dec(45000), category: { name: 'Mỳ Cay' } },
    },
    {
      orderId: 102,
      productId: 99,
      quantity: 2,
      unitPrice: dec(100000),
      modifiersSnapshot: [],
      kitchenStatus: 'PRINTED',
      product: { id: 99, name: 'Combo Mì + Trà', station: 'COMBO', price: dec(100000), category: { name: 'Combo' } },
    },
    {
      orderId: 103,
      productId: 20,
      quantity: 3,
      unitPrice: dec(55000),
      modifiersSnapshot: [{ groupId: 1, modifierId: 4, name: 'Cấp độ 3', extraPrice: 0 }],
      kitchenStatus: 'PRINTED',
      product: { id: 20, name: 'Mì Hải Sản', station: 'BEP_NAU', price: dec(55000), category: { name: 'Mỳ Cay' } },
    },
  ];

  const prisma = {
    order: {
      findMany: vi.fn().mockImplementation(async (args: { where?: { status?: string; pendingPaymentEdit?: unknown } }) => {
        if (args.where?.pendingPaymentEdit) {
          return [{
            id: 101,
            orderCode: 'HD-20261117-0001',
            orderType: 'DINE_IN',
            takeawayNumber: null,
            paymentMethod: 'CASH',
            totalAmount: dec(100000),
            pendingPaymentEdit: {
              paymentMethod: 'TRANSFER',
              cashAmount: 0,
              transferAmount: 100000,
              reason: 'Khách chuyển khoản',
              requestedBy: 4,
              requestedByName: 'Trần Thị Lan',
              requestedByUsername: 'thungan',
              requestedAt: '2026-11-17T13:40:00.000Z',
            },
            table: { name: 'Bàn 02' },
          }];
        }
        return paidOrders;
      }),
      aggregate: vi.fn().mockImplementation(async (args: { where?: { status?: string } }) => {
        if (args.where?.status === 'VOIDED') {
          return { _count: { id: 1 }, _sum: { totalAmount: dec(80000) } };
        }
        return { _sum: { totalAmount: dec(300000) } };
      }),
    },
    orderItem: {
      findMany: vi.fn().mockImplementation(async (args: { where?: { kitchenStatus?: unknown } }) => {
        if (args.where?.kitchenStatus === 'NEW') {
          return [{ quantity: 1, productId: 10, product: { station: 'BEP_NAU' } }];
        }
        if (args.where?.kitchenStatus === 'CANCELLED') {
          return [{ quantity: 1, productId: 20, product: { station: 'BEP_NAU' } }];
        }
        return orderItems;
      }),
    },
    comboItem: {
      findMany: vi.fn().mockResolvedValue([
        { parentProductId: 99, quantity: 1, childProduct: { id: 10, name: 'Mì Bò Mỹ', station: 'BEP_NAU', price: dec(45000) } },
        { parentProductId: 99, quantity: 1, childProduct: { id: 30, name: 'Trà Đào', station: 'PHA_CHE', price: dec(30000) } },
      ]),
    },
    inventoryImport: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 1,
          itemNameSnapshot: 'Ba Chỉ Bò Mỹ',
          supplierNameSnapshot: 'Chợ Khu Vực',
          unitName: 'Kg',
          unitPrice: dec(175000),
          quantity: dec(2),
          totalCost: dec(350000),
          paymentSource: 'EXTERNAL',
          importDate: new Date('2026-11-17T00:00:00.000Z'),
        },
        {
          id: 2,
          itemNameSnapshot: 'Đá Bi',
          supplierNameSnapshot: 'Chợ Khu Vực',
          unitName: 'Bao',
          unitPrice: dec(15000),
          quantity: dec(4),
          totalCost: dec(60000),
          paymentSource: 'CASH_DRAWER',
          importDate: new Date('2026-11-17T00:00:00.000Z'),
        },
      ]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalCost: dec(60000) } }),
    },
    cashDrawerSettlement: {
      findFirst: vi.fn().mockResolvedValue({
        id: 11,
        settlementDate: new Date('2026-11-16T00:00:00.000Z'),
        shiftName: 'CA_NGAY',
        status: 'MATCHED',
        discrepancyAmount: dec(0),
        actualCountedCash: dec(4500000),
      }),
    },
    discount: {
      findMany: vi.fn().mockResolvedValue([{ id: 1, usageLimit: 100, usedCount: 15 }]),
    },
    auditLog: {
      findMany: vi.fn().mockImplementation(async (args?: { where?: { module?: { in?: string[] } } }) => {
        const allLogs = [
          {
            id: 1,
            module: 'RBAC',
            action: 'Đăng nhập',
            actorId: 1,
            actorFullName: 'Nguyễn Minh Quân',
            actorUsername: 'superadmin',
            summary: 'Đăng nhập hệ thống',
            ipAddress: '10.0.0.1',
            deviceLabel: 'Chrome',
            metadata: {},
            createdAt: now,
          },
          {
            id: 2,
            module: 'POS',
            action: 'Thanh toán đơn',
            actorId: 4,
            actorFullName: 'Trần Thị Lan',
            actorUsername: 'thungan',
            summary: 'Thanh toán HD-20261117-0003',
            ipAddress: '10.0.0.2',
            deviceLabel: 'POS',
            metadata: {},
            createdAt: now,
          },
        ];
        const allowed = args?.where?.module?.in;
        return Array.isArray(allowed) ? allLogs.filter((l) => allowed.includes(l.module)) : allLogs;
      }),
    },
  };

  const posService = {
    getTableGrid: vi.fn().mockResolvedValue({
      tables: [
        {
          id: 5,
          name: 'Bàn 05',
          status: 'PENDING',
          activeOrderId: 201,
          activeOrder: {
            orderId: 201,
            orderCode: 'HD-20261117-0004',
            orderType: 'DINE_IN',
            tableId: 5,
            tableLabel: 'Bàn 05',
            takeawayNumber: null,
            status: 'PENDING',
            totalAmount: 185000,
            createdAt: '2026-11-17T14:25:00.000Z',
            pendingQrSince: '2026-11-17T14:25:00.000Z', // 5m ago -> overdue!
            pendingQrKind: 'NEW',
          },
        },
        {
          id: 6,
          name: 'Bàn 06',
          status: 'AVAILABLE',
          activeOrderId: null,
          activeOrder: null,
        },
      ],
      takeaways: [
        {
          orderId: 202,
          orderCode: 'HD-20261117-0005',
          orderType: 'TAKEAWAY',
          tableId: null,
          tableLabel: 'Mang về #02',
          takeawayNumber: 2,
          status: 'SERVING',
          totalAmount: 95000,
          createdAt: '2026-11-17T14:20:00.000Z',
        },
      ],
    }),
  };

  const cashflowService = {
    getDefaultOpeningBudget: vi.fn().mockResolvedValue(2000000),
  };

  const paymentQrService = {
    list: vi.fn().mockResolvedValue([
      {
        id: 1,
        label: 'TK Chính (BIDV)',
        bankCode: 'BIDV',
        bankName: 'BIDV',
        accountNo: '8878564012',
        accountName: 'TRAN VAN HUNG',
        priority: 1,
        isActive: true,
        dailyLimit: 5000000,
        monthlyLimit: 150000000,
        yearlyLimit: null,
        usedDay: 4500000, // 90% -> nearLimit alert!
        usedMonth: 12000000,
        usedYear: 50000000,
        status: 'AVAILABLE',
        hasOrders: true,
        orderCount: 10,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-17T14:00:00.000Z',
      },
    ]),
  };

  const schedulesService = {
    getScheduleWeek: vi.fn().mockResolvedValue({
      weekStartDate: '2026-11-16',
      cells: [
        {
          id: 1,
          dayOfWeek: 1, // Tuesday 2026-11-17
          timeSlot: 'Ca Tối (15:00-22:00)',
          employeeIds: [4],
          attendances: [{ employeeId: 4, mode: 'FULL_SHIFT' }],
          employees: [{ id: 4, fullName: 'Trần Thị Lan', shortName: 'T.Lan', isDeleted: false, specialtyCode: 'thu ngan' }],
        },
      ],
      availableEmployees: [],
    }),
  };

  const payrollService = {
    getPayrollSummary: vi.fn().mockResolvedValue({
      fromDate: '2026-11-01',
      toDate: '2026-11-17',
      config: { defaultBaseSalary: 7000000, standardFullTimeDays: 28, standardHoursPerDay: 12, defaultPartTimeHourlyRate: 25000 },
      items: [],
      summary: { totalEmployees: 12, totalFullShiftDays: 20, totalCustomHours: 8, totalSalary: 5200000 },
    }),
  };

  const service = new DashboardService(
    prisma as never,
    posService as never,
    cashflowService as never,
    paymentQrService as never,
    schedulesService as never,
    payrollService as never,
  );

  return { service, now };
}

describe('DashboardService', () => {
  it('computes exact Hard Invariant 6 cash drawer, Invariant 3 combo decomposition, spice levels, alerts, and profit for SuperAdmin', async () => {
    const { service, now } = buildMockDeps();
    const res = await service.getOverview({ preset: 'today' }, makeSuperAdmin(), now);

    // Revenue = 100k + 200k + 150k = 450k (VOIDED excluded)
    expect(res.kpis.revenue?.netPaidAmount).toBe(450000);
    expect(res.kpis.revenue?.discountAmount).toBe(25000);
    expect(res.kpis.revenue?.paidOrderCount).toBe(3);
    expect(res.kpis.revenue?.growthPercent).toBe(50);

    // Expected Cash (Invariant 6): opening 2,000,000 + (CASH 100,000 + SPLIT cash 60,000) - CASH_DRAWER import 60,000 = 2,100,000
    expect(res.kpis.cashDrawer?.blindMode).toBe(false);
    expect(res.kpis.cashDrawer?.totalCashSales).toBe(160000);
    expect(res.kpis.cashDrawer?.totalCashImports).toBe(60000);
    expect(res.kpis.cashDrawer?.expectedCashInDrawer).toBe(2100000);
    expect(res.kpis.cashDrawer?.estimatedHandOver).toBe(100000);

    // Transfer: 200,000 + 90,000 = 290,000
    expect(res.kpis.transfer?.totalTransferSales).toBe(290000);

    // Inventory: 350k EXTERNAL + 60k CASH_DRAWER = 410k
    expect(res.kpis.inventory?.totalImportCost).toBe(410000);
    expect(res.kpis.inventory?.cashDrawerImportCost).toBe(60000);
    expect(res.kpis.inventory?.externalImportCost).toBe(350000);

    // Combo decomposed strictly into BEP_NAU & PHA_CHE (never 'COMBO')
    expect(res.kitchenStations?.comboDecomposedCount).toBe(2);
    expect(res.kitchenStations?.stations.map((s) => s.station)).toEqual(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);
    const phaChe = res.kitchenStations?.stations.find((s) => s.station === 'PHA_CHE');
    expect(phaChe?.printedQty).toBe(2);
    expect(phaChe?.revenue).toBe(80000);

    // Spice levels & paid toppings
    expect(res.kitchenStations?.spiceLevels.find((l) => l.level === 1)?.count).toBe(2);
    expect(res.kitchenStations?.spiceLevels.find((l) => l.level === 3)?.count).toBe(3);
    expect(res.topProducts?.topModifiers[0]).toEqual({ name: 'Bò Mỹ (10k)', qty: 2, revenue: 20000 });

    // Alerts: overdue pending QR, pending payment edit, near-limit VietQR (90%)
    expect(res.alerts.pendingQrTables).toHaveLength(1);
    expect(res.alerts.pendingQrTables[0]?.isOverdue).toBe(true);
    expect(res.alerts.pendingPaymentEdits).toHaveLength(1);
    expect(res.alerts.nearLimitQrAccounts[0]?.dayPercent).toBe(90);

    // SuperAdmin sees RBAC audit log + IP
    expect(res.recentAuditLogs.some((l) => l.module === 'RBAC')).toBe(true);
    expect(res.recentAuditLogs.find((l) => l.module === 'RBAC')?.ipAddress).toBe('10.0.0.1');
  });

  it('enforces Blind Settlement Mode and hides profit, payroll, and RBAC logs for Cashiers', async () => {
    const { service, now } = buildMockDeps();
    const res = await service.getOverview({ preset: 'today' }, makeCashier(), now);

    expect(res.kpis.cashDrawer?.blindMode).toBe(true);
    expect(res.kpis.cashDrawer?.expectedCashInDrawer).toBeNull();
    expect(res.kpis.cashDrawer?.totalCashSales).toBeNull();
    expect(res.kpis.revenue).toBeNull();
    expect(res.kpis.profit).toBeNull();
    expect(res.kpis.transfer).toBeNull();
    expect(res.revenueSeries).toBeNull();
    expect(res.paymentBreakdown).toEqual([]);
    expect(res.recentInvoices).toEqual([]);
    expect(res.kitchenStations?.stations.every((s) => s.revenue === 0)).toBe(true);
    expect(res.topProducts?.items.every((i) => i.revenue === 0)).toBe(true);
    expect(res.discountsAndRisk?.totalDiscountAmount).toBe(0);
    expect(res.discountsAndRisk?.voidedAmount).toBe(0);
    expect(res.staffing?.payrollSummary).toBeNull();
    expect(res.recentAuditLogs.some((l) => l.module === 'RBAC')).toBe(false);
    expect(res.recentAuditLogs.every((l) => l.ipAddress === null)).toBe(true);
    // Operational alerts, live tables, kitchen stations qty, and shift staffing remain visible
    expect(res.liveTables?.tables).toHaveLength(2);
    expect(res.kitchenStations?.stations).toHaveLength(3);
    expect(res.staffing?.shifts[0]?.employees[0]?.shortName).toBe('T.Lan');
  });

  it('resolves yesterday and month presets accurately in Asia/Ho_Chi_Minh timezone', async () => {
    const { service, now } = buildMockDeps();

    const yesterday = await service.getOverview({ preset: 'yesterday' }, makeSuperAdmin(), now);
    expect(yesterday.meta.fromDate).toBe('2026-11-16');
    expect(yesterday.meta.toDate).toBe('2026-11-16');
    expect(yesterday.meta.previousFromDate).toBe('2026-11-15');
    expect(yesterday.meta.isTodayIncluded).toBe(false);
    expect(yesterday.revenueSeries?.granularity).toBe('hour');

    const month = await service.getOverview({ preset: 'month' }, makeSuperAdmin(), now);
    expect(month.meta.fromDate).toBe('2026-11-01');
    expect(month.meta.toDate).toBe('2026-11-17');
    expect(month.meta.isTodayIncluded).toBe(true);
    expect(month.revenueSeries?.granularity).toBe('day');
    expect(month.revenueSeries?.buckets).toHaveLength(17);
  });

  it('switches revenueSeries granularity to daily buckets for 7d preset', async () => {
    const { service, now } = buildMockDeps();
    const res = await service.getOverview({ preset: '7d' }, makeSuperAdmin(), now);

    expect(res.revenueSeries?.granularity).toBe('day');
    expect(res.revenueSeries?.buckets).toHaveLength(7);
    expect(res.revenueSeries?.buckets[6]?.key).toBe('2026-11-17');
    expect(res.revenueSeries?.buckets[6]?.totalSales).toBe(450000);
  });
});
