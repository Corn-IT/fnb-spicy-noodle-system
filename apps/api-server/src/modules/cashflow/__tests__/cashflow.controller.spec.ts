import { ForbiddenException, Module, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { AUTHORIZATION_METADATA } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CashflowController } from '../cashflow.controller';
import { CashflowService } from '../cashflow.service';

function createCashier(): AuthPrincipal {
  return {
    id: 9,
    employeeId: 9,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({
      pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false },
      cashflow: { view: true, create: true, compensate: false, config: false },
    }),
  };
}

function guardContext(handler: (...args: never[]) => unknown, user: AuthPrincipal) {
  return {
    getHandler: () => handler,
    getClass: () => CashflowController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('CashflowController authorization', () => {
  it('should allow a cashier to settle a shift while forbidding default-budget configuration', async () => {
    const user = createCashier();
    const settle = vi.fn().mockResolvedValue({ status: 'MATCHED' });
    const setDefaultBudget = vi.fn();
    const controller = new CashflowController({ settleShift: settle, setDefaultBudget } as never);
    const guard = new RbacGuard(new Reflector());

    expect(guard.canActivate(guardContext(CashflowController.prototype.settle as never, user))).toBe(true);
    await expect(controller.settle({
      settlementDate: '2026-11-08',
      shiftName: 'Ca Tối',
      actualCountedCash: 500_000,
      denominationsDetail: {
        '500000': 1, '200000': 0, '100000': 0, '50000': 0, '20000': 0,
        '10000': 0, '5000': 0, '2000': 0, '1000': 0,
      },
    }, user)).resolves.toEqual({ status: 'MATCHED' });
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ shiftName: 'Ca Tối' }), user.id);

    expect(() => guard.canActivate(guardContext(CashflowController.prototype.setDefaultBudget as never, user)))
      .toThrow(ForbiddenException);
    expect(setDefaultBudget).not.toHaveBeenCalled();
  });

  it('should declare the cashflow create and config sub-permissions on their respective routes', () => {
    const settleRequirement = Reflect.getMetadata(AUTHORIZATION_METADATA, CashflowController.prototype.settle);
    const budgetRequirement = Reflect.getMetadata(AUTHORIZATION_METADATA, CashflowController.prototype.setDefaultBudget);

    expect(settleRequirement).toEqual({ module: 'cashflow', action: 'create' });
    expect(budgetRequirement).toEqual({ module: 'cashflow', action: 'config' });
  });

  it('enforces HTTP 401/403 RBAC and delegates preview, settlements, compensate, and default-budget', async () => {
    const cashflowService = {
      preview: vi.fn(async (_now: Date, isSuperAdmin: boolean) => ({
        settlementDate: '2026-11-27',
        blindMode: !isSuperAdmin,
        openingBudget: 1000000,
      })),
      listSettlements: vi.fn(async () => ({ page: 1, limit: 20, total: 0, items: [] })),
      settleShift: vi.fn(async () => ({ id: 10, status: 'MATCHED' })),
      compensateSettlement: vi.fn(async () => ({ id: 10, status: 'MATCHED', discrepancyAmount: 0 })),
      setDefaultBudget: vi.fn(async () => ({ openingBudget: 1500000 })),
    };

    const superAdminUser = {
      id: 1,
      employeeId: 1,
      username: 'superadmin',
      isSuperAdmin: true,
      isActive: true,
      permissions: UserPermissionsSchema.parse({}),
    };
    const cashierUser = createCashier();

    class CashflowHttpTestModule {}
    Module({
      controllers: [CashflowController],
      providers: [
        { provide: CashflowService, useValue: cashflowService },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async (token: string) => ({ sub: token === 'cashier' ? 9 : 1, tokenType: 'access' }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async (args: { where: { id: number } }) =>
                args.where.id === 9 ? { ...cashierUser, isActive: true } : superAdminUser,
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
    })(CashflowHttpTestModule);

    const app: INestApplication = await NestFactory.create(CashflowHttpTestModule, {
      logger: ['error'],
      abortOnError: false,
    });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      expect((await fetch(`${baseUrl}/api/v1/cashflow/preview`)).status).toBe(401);

      const cashierPreview = await fetch(`${baseUrl}/api/v1/cashflow/preview`, {
        headers: { authorization: 'Bearer cashier' },
      });
      expect(cashierPreview.status).toBe(200);
      expect(cashflowService.preview).toHaveBeenCalledWith(expect.any(Date), false);

      const adminPreview = await fetch(`${baseUrl}/api/v1/cashflow/preview`, {
        headers: { authorization: 'Bearer admin' },
      });
      expect(adminPreview.status).toBe(200);
      expect(cashflowService.preview).toHaveBeenCalledWith(expect.any(Date), true);

      const settlementsRes = await fetch(`${baseUrl}/api/v1/cashflow/settlements?page=1&limit=20`, {
        headers: { authorization: 'Bearer cashier' },
      });
      expect(settlementsRes.status).toBe(200);
      expect(cashflowService.listSettlements).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));

      // Cashier lacks cashflow.compensate & cashflow.config
      const forbiddenComp = await fetch(`${baseUrl}/api/v1/cashflow/settlements/10/compensate`, {
        method: 'POST',
        headers: { authorization: 'Bearer cashier', 'content-type': 'application/json' },
        body: JSON.stringify({ compensationAmount: 50000, note: 'Nộp bù' }),
      });
      expect(forbiddenComp.status).toBe(403);

      const okComp = await fetch(`${baseUrl}/api/v1/cashflow/settlements/10/compensate`, {
        method: 'POST',
        headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
        body: JSON.stringify({ compensationAmount: 50000, note: 'Nộp bù thiếu' }),
      });
      expect(okComp.status).toBe(201);
      expect(cashflowService.compensateSettlement).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ compensationAmount: 50000 }),
        1,
      );

      const okBudget = await fetch(`${baseUrl}/api/v1/cashflow/default-budget`, {
        method: 'PUT',
        headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
        body: JSON.stringify({ openingBudget: 1500000 }),
      });
      expect(okBudget.status).toBe(200);
      expect(cashflowService.setDefaultBudget).toHaveBeenCalledWith({ openingBudget: 1500000 }, 1);
    } finally {
      await app.close();
    }
  });
});
