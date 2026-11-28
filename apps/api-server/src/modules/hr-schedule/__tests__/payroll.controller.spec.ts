import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PayrollController } from '../payroll.controller';
import { PayrollService } from '../payroll.service';

describe('PayrollController HTTP routes & RBAC (Invariant 8)', () => {
  const payrollService = {
    getPayrollSummary: vi.fn(async () => ({
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      config: {
        defaultBaseSalary: 7000000,
        standardFullTimeDays: 28,
        standardHoursPerDay: 12,
        defaultPartTimeHourlyRate: 25000,
      },
      items: [],
      summary: { totalEmployees: 0, totalFullShiftDays: 0, totalCustomHours: 0, totalSalary: 0 },
    })),
    updatePayrollConfig: vi.fn(async () => ({
      defaultBaseSalary: 8000000,
      standardFullTimeDays: 28,
      standardHoursPerDay: 12,
      defaultPartTimeHourlyRate: 28000,
    })),
    updateEmployeePayroll: vi.fn(async () => ({ employeeId: 5, totalSalary: 5000000 })),
  };

  const superAdmin = {
    id: 1,
    employeeId: 1,
    username: 'superadmin',
    isSuperAdmin: true,
    isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };

  const viewOnlyPayroll = {
    id: 2,
    employeeId: 2,
    username: 'viewer',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({
      payroll: { view: true, update: false, config: false, export: false },
    }),
  };

  const cashierNoPayroll = {
    id: 3,
    employeeId: 3,
    username: 'cashier01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class PayrollHttpTestModule {}
    Module({
      controllers: [PayrollController],
      providers: [
        { provide: PayrollService, useValue: payrollService },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async (token: string) => ({
              sub: token === 'viewer' ? 2 : token === 'cashier' ? 3 : 1,
              tokenType: 'access',
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async (args: { where: { id: number } }) => {
                if (args.where.id === 2) return viewOnlyPayroll;
                if (args.where.id === 3) return cashierNoPayroll;
                return superAdmin;
              },
            },
          },
        },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(PayrollHttpTestModule);

    app = await NestFactory.create(PayrollHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => app?.close());

  it('enforces 401 unauthenticated and 403 RBAC across view, config, and update routes', async () => {
    expect((await fetch(`${baseUrl}/api/v1/payroll?fromDate=2026-11-01&toDate=2026-11-30`)).status).toBe(401);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/payroll?fromDate=2026-11-01&toDate=2026-11-30`, {
          headers: { authorization: 'Bearer cashier' },
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/payroll/config`, {
          method: 'PUT',
          headers: { authorization: 'Bearer viewer', 'content-type': 'application/json' },
          body: JSON.stringify({
            defaultBaseSalary: 8000000,
            standardFullTimeDays: 28,
            standardHoursPerDay: 12,
            defaultPartTimeHourlyRate: 28000,
          }),
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/payroll/employees/5`, {
          method: 'PUT',
          headers: { authorization: 'Bearer viewer', 'content-type': 'application/json' },
          body: JSON.stringify({
            fromDate: '2026-11-01',
            toDate: '2026-11-30',
            shiftType: 'FULL_TIME',
            useCustomRate: false,
            bonusOrAdjustment: 0,
          }),
        })
      ).status,
    ).toBe(403);
  });

  it('validates payloads and delegates getPayrollSummary, updatePayrollConfig, and updateEmployeePayroll', async () => {
    const adminHeaders = { authorization: 'Bearer admin', 'content-type': 'application/json' };

    const getRes = await fetch(`${baseUrl}/api/v1/payroll?fromDate=2026-11-01&toDate=2026-11-30`, {
      headers: { authorization: 'Bearer viewer' },
    });
    expect(getRes.status).toBe(200);
    expect(payrollService.getPayrollSummary).toHaveBeenCalledWith({
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });

    const invalidConfig = await fetch(`${baseUrl}/api/v1/payroll/config`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ defaultBaseSalary: -100, standardFullTimeDays: 0 }),
    });
    expect(invalidConfig.status).toBe(422);

    const cfgRes = await fetch(`${baseUrl}/api/v1/payroll/config`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        defaultBaseSalary: 8000000,
        standardFullTimeDays: 28,
        standardHoursPerDay: 12,
        defaultPartTimeHourlyRate: 28000,
      }),
    });
    expect(cfgRes.status).toBe(200);
    expect(payrollService.updatePayrollConfig).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBaseSalary: 8000000 }),
      expect.objectContaining({ id: 1 }),
    );

    const empRes = await fetch(`${baseUrl}/api/v1/payroll/employees/5`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        shiftType: 'PART_TIME',
        useCustomRate: true,
        customHourlyRate: 35000,
        bonusOrAdjustment: 100000,
        note: 'Thưởng Tết',
      }),
    });
    expect(empRes.status).toBe(200);
    expect(payrollService.updateEmployeePayroll).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ shiftType: 'PART_TIME', customHourlyRate: 35000 }),
      expect.objectContaining({ id: 1 }),
    );
  });
});
