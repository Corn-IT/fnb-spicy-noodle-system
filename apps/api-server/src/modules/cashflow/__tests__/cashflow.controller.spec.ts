import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { AUTHORIZATION_METADATA } from '../../../common/decorators/permissions.decorator';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { CashflowController } from '../cashflow.controller';

function createCashier(): AuthPrincipal {
  return {
    id: 9,
    employeeId: 9,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({
      pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false },
      cashflow: { view: true, create: true, config: false },
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
});
