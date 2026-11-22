import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DashboardController } from '../dashboard.controller';
import { DashboardService } from '../dashboard.service';

const dec = (n: number | string) => new Prisma.Decimal(n);

describe('Dashboard HTTP endpoint integration', () => {
  const adminPermissions = UserPermissionsSchema.parse({
    dashboard: { view: true, viewProfit: true, export: true },
    pos: { view: true },
    invoices: { view: true },
    inventory: { view: true },
    cashflow: { view: true, config: true },
    paymentQr: { view: true },
    discounts: { view: true },
    schedules: { view: true },
    payroll: { view: true },
  });

  const cashierPermissions = UserPermissionsSchema.parse({
    dashboard: { view: true, viewProfit: false, export: false },
    pos: { view: true },
    invoices: { view: true },
    inventory: { view: true },
    cashflow: { view: true },
    schedules: { view: true },
  });

  const noDashboardPermissions = UserPermissionsSchema.parse({
    dashboard: { view: false, viewProfit: false, export: false },
    pos: { view: true },
  });

  const verifyAsync = vi.fn(async (token: string) => {
    if (token === 'invalid') throw new Error('Invalid token');
    const sub =
      token === 'superadmin' ? 1 : token === 'cashier' ? 2 : token === 'no-dash' ? 3 : 0;
    if (!sub) throw new Error('Unknown token');
    return { sub, tokenType: 'access', sid: `sid-${sub}` };
  });

  const mockPaidOrders = [
    {
      id: 50,
      orderCode: 'HD-HTTP-001',
      orderType: 'DINE_IN',
      orderSource: 'POS_COUNTER',
      tableId: 1,
      takeawayNumber: null,
      paymentMethod: 'CASH',
      paymentAccountId: null,
      cashAmount: dec(100000),
      transferAmount: dec(0),
      subtotalAmount: dec(100000),
      discountAmount: dec(0),
      discountId: null,
      discountSnapshot: null,
      totalAmount: dec(100000),
      tableTransferLogs: [],
      paidAt: new Date(),
      table: { name: 'Bàn 01' },
      paymentAccount: null,
    },
  ];

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
        if (where.id === 1) {
          return {
            id: 1,
            employeeId: 1,
            username: 'superadmin',
            isSuperAdmin: true,
            permissions: adminPermissions,
            isActive: true,
            activeSessionId: 'sid-1',
            lastRevokedNotice: null,
          };
        }
        if (where.id === 2) {
          return {
            id: 2,
            employeeId: 2,
            username: 'cashier01',
            isSuperAdmin: false,
            permissions: cashierPermissions,
            isActive: true,
            activeSessionId: 'sid-2',
            lastRevokedNotice: null,
          };
        }
        return {
          id: 3,
          employeeId: 3,
          username: 'restricted',
          isSuperAdmin: false,
          permissions: noDashboardPermissions,
          isActive: true,
          activeSessionId: 'sid-3',
          lastRevokedNotice: null,
        };
      }),
    },
    order: {
      findMany: vi.fn(async (args?: { where?: { status?: string } }) => {
        if (args?.where?.status === 'PAID') return mockPaidOrders;
        return [];
      }),
      aggregate: vi.fn(async () => ({ _sum: { totalAmount: dec(0) }, _count: { id: 0 } })),
    },
    orderItem: {
      findMany: vi.fn(async () => []),
    },
    comboItem: {
      findMany: vi.fn(async () => []),
    },
    inventoryImport: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: { totalCost: dec(0) } })),
    },
    cashDrawerSettlement: {
      findFirst: vi.fn(async () => null),
    },
    discount: {
      findMany: vi.fn(async () => []),
    },
    auditLog: {
      findMany: vi.fn(async () => [
        {
          id: 99,
          module: 'RBAC',
          action: 'Đăng nhập',
          actorId: 1,
          actorFullName: 'Nguyễn Minh Quân',
          actorUsername: 'superadmin',
          summary: 'Đăng nhập hệ thống',
          ipAddress: '10.10.10.1',
          deviceLabel: 'Chrome',
          metadata: {},
          createdAt: new Date(),
        },
      ]),
    },
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class DashboardIntegrationModule {}
    Module({
      controllers: [DashboardController],
      providers: [
        { provide: JwtService, useValue: { verifyAsync } },
        { provide: PrismaService, useValue: prisma },
        {
          provide: DashboardService,
          useFactory: (db: PrismaService) =>
            new DashboardService(
              db,
              {
                getTableGrid: async () => ({ tables: [], takeaways: [] }),
              } as never,
              { getDefaultOpeningBudget: async () => 2000000 } as never,
              { list: async () => [] } as never,
              { getScheduleWeek: async () => ({ weekStartDate: '2026-11-16', cells: [] }) } as never,
              {
                getPayrollSummary: async () => ({
                  summary: {
                    totalEmployees: 4,
                    totalFullShiftDays: 8,
                    totalCustomHours: 0,
                    totalSalary: 1500000,
                  },
                }),
              } as never,
            ),
          inject: [PrismaService],
        },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, db: PrismaService) => new JwtAuthGuard(jwt, db),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(DashboardIntegrationModule);

    app = await NestFactory.create(DashboardIntegrationModule, { logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('enforces 401 Unauthorized, 403 Forbidden (Hard Invariant 8), and 422 ZodValidationPipe checks', async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
    expect(unauth.status).toBe(401);

    const invalidJwt = await fetch(`${baseUrl}/api/v1/dashboard/overview`, {
      headers: { Authorization: 'Bearer invalid' },
    });
    expect(invalidJwt.status).toBe(401);

    const forbidden = await fetch(`${baseUrl}/api/v1/dashboard/overview`, {
      headers: { Authorization: 'Bearer no-dash' },
    });
    expect(forbidden.status).toBe(403);

    const badDateOrder = await fetch(
      `${baseUrl}/api/v1/dashboard/overview?preset=custom&fromDate=2026-11-20&toDate=2026-11-10`,
      { headers: { Authorization: 'Bearer superadmin' } },
    );
    expect(badDateOrder.status).toBe(422);

    const excessiveRange = await fetch(
      `${baseUrl}/api/v1/dashboard/overview?preset=custom&fromDate=2024-01-01&toDate=2026-11-17`,
      { headers: { Authorization: 'Bearer superadmin' } },
    );
    expect(excessiveRange.status).toBe(422);

    const badPreset = await fetch(`${baseUrl}/api/v1/dashboard/overview?preset=century`, {
      headers: { Authorization: 'Bearer superadmin' },
    });
    expect(badPreset.status).toBe(422);
  });

  it('returns SuperAdmin overview with Invariant 6 drawer vs Cashier Blind Settlement payload over HTTP', async () => {
    const adminRes = await fetch(`${baseUrl}/api/v1/dashboard/overview?preset=today`, {
      headers: { Authorization: 'Bearer superadmin' },
    });
    expect(adminRes.status).toBe(200);
    const adminBody = (await adminRes.json()) as {
      kpis: {
        revenue: { netPaidAmount: number } | null;
        cashDrawer: { blindMode: boolean; expectedCashInDrawer: number | null } | null;
        profit: { grossProfitAfterInventory: number } | null;
      };
      recentAuditLogs: Array<{ module: string; ipAddress: string | null }>;
    };
    expect(adminBody.kpis.revenue?.netPaidAmount).toBe(100000);
    expect(adminBody.kpis.cashDrawer?.blindMode).toBe(false);
    expect(adminBody.kpis.cashDrawer?.expectedCashInDrawer).toBe(2100000);
    expect(adminBody.kpis.profit?.grossProfitAfterInventory).toBe(100000);
    expect(adminBody.recentAuditLogs.some((l) => l.module === 'RBAC')).toBe(true);

    const cashierRes = await fetch(`${baseUrl}/api/v1/dashboard/overview?preset=today`, {
      headers: { Authorization: 'Bearer cashier' },
    });
    expect(cashierRes.status).toBe(200);
    const cashierBody = (await cashierRes.json()) as {
      kpis: {
        revenue: unknown;
        cashDrawer: { blindMode: boolean; expectedCashInDrawer: unknown } | null;
        profit: unknown;
      };
      revenueSeries: unknown;
      recentInvoices: unknown[];
      recentAuditLogs: unknown[];
    };
    expect(cashierBody.kpis.revenue).toBeNull();
    expect(cashierBody.kpis.cashDrawer?.blindMode).toBe(true);
    expect(cashierBody.kpis.cashDrawer?.expectedCashInDrawer).toBeNull();
    expect(cashierBody.kpis.profit).toBeNull();
    expect(cashierBody.revenueSeries).toBeNull();
    expect(cashierBody.recentInvoices).toEqual([]);
    expect(cashierBody.recentAuditLogs).toEqual([]);
  });
});
