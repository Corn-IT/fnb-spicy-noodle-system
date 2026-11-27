import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

describe('@fnb/shared dashboard contracts', () => {
  it('exports dashboard schemas, nav path whitelist, and RBAC dashboard permission fields', () => {
    expect(contracts).toHaveProperty('DashboardPresetSchema');
    expect(contracts).toHaveProperty('DashboardQuerySchema');
    expect(contracts).toHaveProperty('DashboardOverviewResponseSchema');
    expect(contracts.ALLOWED_STORE_NAV_PATHS).toContain('/dashboard');
  });

  it('validates DashboardQuerySchema presets and date range constraints', () => {
    expect(contracts.DashboardQuerySchema.parse({})).toEqual({});
    expect(contracts.DashboardQuerySchema.parse({ preset: '7d' })).toEqual({ preset: '7d' });
    expect(
      contracts.DashboardQuerySchema.safeParse({
        preset: 'custom',
        fromDate: '2026-11-10',
        toDate: '2026-11-17',
      }).success,
    ).toBe(true);
    expect(
      contracts.DashboardQuerySchema.safeParse({
        preset: 'custom',
        fromDate: '2026-11-18',
        toDate: '2026-11-17',
      }).success,
    ).toBe(false);
    expect(
      contracts.DashboardQuerySchema.safeParse({
        preset: 'custom',
        fromDate: '2025-01-01',
        toDate: '2026-11-17',
      }).success,
    ).toBe(false);
  });

  it('defaults dashboard permissions to false for empty objects and derives legacy permissions cleanly', () => {
    const empty = contracts.UserPermissionsSchema.parse({});
    expect(empty.dashboard).toEqual({ view: false, viewProfit: false, export: false });

    const legacyCashier = contracts.UserPermissionsSchema.parse({
      pos: { view: true },
      cashflow: { view: true, config: false },
    });
    expect(legacyCashier.dashboard).toEqual({ view: true, viewProfit: false, export: false });

    const legacyManager = contracts.UserPermissionsSchema.parse({
      pos: { view: true },
      cashflow: { view: true, config: true, export: true },
      payroll: { view: true },
    });
    expect(legacyManager.dashboard).toEqual({ view: true, viewProfit: true, export: true });

    const explicitOverride = contracts.UserPermissionsSchema.parse({
      pos: { view: true },
      dashboard: { view: false, viewProfit: false, export: false },
    });
    expect(explicitOverride.dashboard).toEqual({ view: false, viewProfit: false, export: false });
  });

  it('validates DashboardItemSalesQuerySchema and DashboardDailyItemSalesResponseSchema', () => {
    expect(contracts.DashboardItemSalesQuerySchema.parse({
      preset: 'today',
      station: 'BEP_NAU',
      categoryId: '3',
      search: 'mi cay',
    })).toEqual({
      preset: 'today',
      station: 'BEP_NAU',
      categoryId: 3,
      search: 'mi cay',
    });

    expect(
      contracts.DashboardItemSalesQuerySchema.safeParse({
        preset: 'custom',
        fromDate: '2026-11-20',
        toDate: '2026-11-18',
      }).success,
    ).toBe(false);

    expect(
      contracts.DashboardDailyItemSalesResponseSchema.safeParse({
        meta: {
          preset: 'today',
          fromDate: '2026-11-27',
          toDate: '2026-11-27',
          generatedAt: '2026-11-27T06:00:00.000Z',
          blindMode: false,
          canViewProfit: true,
          canViewSales: true,
        },
        summary: {
          totalProductsSold: 1,
          totalQuantity: 2,
          totalRevenue: 80000,
          totalOrders: 1,
        },
        categories: [{ id: 1, name: 'Mì Cay' }],
        stations: ['BEP_NAU'],
        items: [
          {
            productId: 10,
            name: 'Mì cay xúc xích',
            categoryId: 1,
            categoryName: 'Mì Cay',
            station: 'BEP_NAU',
            qty: 2,
            orderCount: 1,
            revenue: 80000,
            avgUnitPrice: 40000,
            sharePercent: 100,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
