import { Prisma } from '@prisma/client';
import {
  DashboardItemSalesQuerySchema,
  UserPermissionsSchema,
  type AuthPrincipal,
} from '@fnb/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../dashboard.service';

const dec = (value: number | string) => new Prisma.Decimal(value);

function makePrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    id: 1,
    employeeId: 10,
    username: 'superadmin',
    isSuperAdmin: true,
    permissions: UserPermissionsSchema.parse({
      dashboard: { view: true, viewProfit: true, export: true },
      pos: { view: true },
      invoices: { view: true },
    }),
    ...overrides,
  };
}

function createDailySalesHarness(orderItems: Array<Record<string, unknown>>) {
  const orderFindManyCalls: Array<Record<string, unknown>> = [];
  const itemFindManyCalls: Array<Record<string, unknown>> = [];
  const uniqueOrderIds = [...new Set(orderItems.map((i) => Number(i.orderId)))];
  const paidOrders = uniqueOrderIds.map((id) => ({
    id,
    paidAt: new Date('2026-11-27T05:00:00.000Z'),
    paymentMethod: 'CASH',
    cashAmount: dec(40000),
    transferAmount: dec(0),
    totalAmount: dec(40000),
  }));

  const prisma = {
    orderItem: {
      findMany: vi.fn().mockImplementation(async (args: Record<string, unknown>) => {
        itemFindManyCalls.push(args);
        return orderItems;
      }),
    },
    order: {
      findMany: vi.fn().mockImplementation(async (args: Record<string, unknown>) => {
        orderFindManyCalls.push(args);
        return paidOrders;
      }),
      count: vi.fn().mockResolvedValue(paidOrders.length),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: dec(0) } }),
    },
    comboItem: { findMany: vi.fn().mockResolvedValue([]) },
    diningTable: { findMany: vi.fn().mockResolvedValue([]) },
    paymentAccount: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryImport: { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn() },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    discount: { findMany: vi.fn().mockResolvedValue([]) },
    cashDrawerSettlement: { findFirst: vi.fn().mockResolvedValue(null) },
  };

  const posService = { getTakeawayQrInfo: vi.fn() };
  const cashflowService = {
    getCashflowSummary: vi.fn(),
    getCurrentShiftOpeningBudget: vi.fn(),
    resolveShiftWindow: vi.fn(),
  };
  const paymentQrService = {};
  const schedulesService = { getScheduleBoard: vi.fn() };
  const payrollService = { getSummary: vi.fn() };

  const service = new DashboardService(
    prisma as never,
    posService as never,
    cashflowService as never,
    paymentQrService as never,
    schedulesService as never,
    payrollService as never,
  );

  return { service, prisma, orderFindManyCalls, itemFindManyCalls };
}

describe('DashboardService.getDailyItemSales', () => {
  afterEach(() => vi.useRealTimers());

  it('aggregates all >18 distinct sold products without top-15 truncation across spice variants & toppings', async () => {
    const items: Array<Record<string, unknown>> = [
      // Mì cay xúc xích: 2 phần across 2 orders, 35k base + 5k topping = 40k each -> 80k
      {
        orderId: 101,
        productId: 1,
        quantity: 1,
        unitPrice: dec(40000),
        modifiersSnapshot: [{ groupId: 1, modifierId: 11, name: 'Cấp 2', extraPrice: '0.00' }],
        kitchenStatus: 'PRINTED',
        product: {
          id: 1,
          name: 'Mì Cay Xúc Xích',
          categoryId: 10,
          station: 'BEP_NAU',
          category: { id: 10, name: 'Mì Cay' },
        },
      },
      {
        orderId: 102,
        productId: 1,
        quantity: 1,
        unitPrice: dec(40000),
        modifiersSnapshot: [{ groupId: 1, modifierId: 12, name: 'Cấp 4', extraPrice: '0.00' }],
        kitchenStatus: 'PRINTED',
        product: {
          id: 1,
          name: 'Mì Cay Xúc Xích',
          categoryId: 10,
          station: 'BEP_NAU',
          category: { id: 10, name: 'Mì Cay' },
        },
      },
    ];

    // Add 18 more distinct products -> 19 distinct products total (> 15 cap of TopProducts)
    for (let i = 2; i <= 19; i += 1) {
      items.push({
        orderId: 100 + i,
        productId: i,
        quantity: 1,
        unitPrice: dec(20000 + i * 1000),
        modifiersSnapshot: [],
        kitchenStatus: 'PRINTED',
        product: {
          id: i,
          name: `Món Thứ ${String(i).padStart(2, '0')}`,
          categoryId: i % 2 === 0 ? 20 : 30,
          station: i % 3 === 0 ? 'BEP_CHIEN' : i % 3 === 1 ? 'PHA_CHE' : 'COMBO',
          category: { id: i % 2 === 0 ? 20 : 30, name: i % 2 === 0 ? 'Ăn vặt' : 'Đồ uống' },
        },
      });
    }

    const harness = createDailySalesHarness(items);
    const result = await harness.service.getDailyItemSales(
      { preset: 'custom', fromDate: '2026-11-27', toDate: '2026-11-27' },
      makePrincipal(),
    );

    expect(result.summary.totalProductsSold).toBe(19);
    expect(result.items).toHaveLength(19);
    expect(result.summary.totalQuantity).toBe(20);

    const xucXich = result.items.find((r) => r.productId === 1)!;
    expect(xucXich.name).toBe('Mì Cay Xúc Xích');
    expect(xucXich.qty).toBe(2);
    expect(xucXich.orderCount).toBe(2);
    expect(xucXich.revenue).toBe(80000);
    expect(xucXich.avgUnitPrice).toBe(40000);
    expect(xucXich.sharePercent).toBeGreaterThan(0);

    // Enforces PAID status + excludes CANCELLED items + Vietnam +07:00 boundaries
    expect(harness.orderFindManyCalls[0]?.where).toMatchObject({
      status: 'PAID',
      paidAt: {
        gte: new Date('2026-11-26T17:00:00.000Z'),
        lt: new Date('2026-11-27T17:00:00.000Z'),
      },
    });
    expect(harness.itemFindManyCalls[0]?.where).toMatchObject({
      kitchenStatus: { not: 'CANCELLED' },
    });
  });

  it('filters by station (including dynamic BEP_* & COMBO), categoryId, and accent-insensitive Vietnamese search', async () => {
    const items = [
      {
        orderId: 201,
        productId: 1,
        quantity: 2,
        unitPrice: dec(40000),
        modifiersSnapshot: [],
        kitchenStatus: 'PRINTED',
        product: {
          id: 1,
          name: 'Mì Cay Xúc Xích',
          categoryId: 10,
          station: 'BEP_NAU',
          category: { id: 10, name: 'Mì Cay' },
        },
      },
      {
        orderId: 202,
        productId: 2,
        quantity: 1,
        unitPrice: dec(65000),
        modifiersSnapshot: [],
        kitchenStatus: 'PRINTED',
        product: {
          id: 2,
          name: 'Bò Nướng Đá Sốt Cay',
          categoryId: 11,
          station: 'BEP_NUONG',
          category: { id: 11, name: 'Món Nướng' },
        },
      },
    ];

    const harness = createDailySalesHarness(items);

    const bySearch = await harness.service.getDailyItemSales(
      { preset: 'today', search: 'mi cay xuc xich' },
      makePrincipal(),
    );
    expect(bySearch.items).toHaveLength(1);
    expect(bySearch.items[0]?.productId).toBe(1);

    const byStation = await harness.service.getDailyItemSales(
      { preset: 'today', station: 'BEP_NUONG' },
      makePrincipal(),
    );
    expect(byStation.items).toHaveLength(1);
    expect(byStation.items[0]?.productId).toBe(2);

    const byCategory = await harness.service.getDailyItemSales(
      { preset: 'today', categoryId: 11 },
      makePrincipal(),
    );
    expect(byCategory.items).toHaveLength(1);
    expect(byCategory.items[0]?.productId).toBe(2);
  });

  it('returns zeroed summary and empty items without NaN when no PAID orders exist in the day', async () => {
    const harness = createDailySalesHarness([]);
    const result = await harness.service.getDailyItemSales(
      { preset: 'yesterday' },
      makePrincipal(),
    );

    expect(result.summary).toEqual({
      totalProductsSold: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      totalOrders: 0,
    });
    expect(result.items).toEqual([]);
  });

  it('enforces Blind Mode (masks revenue, avgUnitPrice, sharePercent) when dashboard.viewProfit is false', async () => {
    const items = [
      {
        orderId: 301,
        productId: 1,
        quantity: 3,
        unitPrice: dec(40000),
        modifiersSnapshot: [],
        kitchenStatus: 'PRINTED',
        product: {
          id: 1,
          name: 'Mì Cay Xúc Xích',
          categoryId: 10,
          station: 'BEP_NAU',
          category: { id: 10, name: 'Mì Cay' },
        },
      },
    ];
    const harness = createDailySalesHarness(items);
    const cashierPrincipal = makePrincipal({
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        dashboard: { view: true, viewProfit: false, export: false },
        pos: { view: true },
      }),
    });

    const result = await harness.service.getDailyItemSales(
      { preset: 'today' },
      cashierPrincipal,
    );

    expect(result.meta.blindMode).toBe(true);
    expect(result.meta.canViewProfit).toBe(false);
    expect(result.summary.totalQuantity).toBe(3);
    expect(result.summary.totalRevenue).toBe(0);
    expect(result.items[0]).toMatchObject({
      productId: 1,
      qty: 3,
      orderCount: 1,
      revenue: 0,
      avgUnitPrice: 0,
      sharePercent: 0,
    });
  });

  it('restricts sales visibility when scope lacks pos/invoices/cashflow/viewProfit and validates invalid date ranges', async () => {
    const harness = createDailySalesHarness([
      {
        orderId: 301,
        productId: 1,
        quantity: 1,
        unitPrice: dec(40000),
        modifiersSnapshot: [],
        kitchenStatus: 'PRINTED',
        product: {
          id: 1,
          name: 'Mì Cay Xúc Xích',
          categoryId: 10,
          station: 'BEP_NAU',
          category: { id: 10, name: 'Mì Cay' },
        },
      },
    ]);
    const limited = makePrincipal({
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        dashboard: { view: true, viewProfit: false, export: false },
      }),
    });

    const restricted = await harness.service.getDailyItemSales({ preset: 'today' }, limited);
    expect(restricted.meta.canViewSales).toBe(false);
    expect(restricted.items).toEqual([]);
    expect(harness.orderFindManyCalls).toHaveLength(0);

    expect(
      DashboardItemSalesQuerySchema.safeParse({
        preset: 'custom',
        fromDate: '2026-11-28',
        toDate: '2026-11-27',
      }).success,
    ).toBe(false);
    expect(
      DashboardItemSalesQuerySchema.safeParse({
        preset: 'custom',
        fromDate: '2025-01-01',
        toDate: '2026-06-01',
      }).success,
    ).toBe(false);
  });
});
