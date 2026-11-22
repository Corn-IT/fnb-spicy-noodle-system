import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { AUTHORIZATION_METADATA } from '../../../common/decorators/permissions.decorator';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { DashboardController } from '../dashboard.controller';

function makePrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    id: 2,
    employeeId: 12,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({
      dashboard: { view: true, viewProfit: false, export: false },
      pos: { view: true },
    }),
    ...overrides,
  };
}

function makeGuardContext(handler: (...args: never[]) => unknown, user?: AuthPrincipal) {
  return {
    getHandler: () => handler,
    getClass: () => DashboardController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('DashboardController & RBAC Guard', () => {
  it('declares dashboard.view permission metadata on overview route', () => {
    const req = Reflect.getMetadata(AUTHORIZATION_METADATA, DashboardController.prototype.getOverview);
    expect(req).toEqual({ module: 'dashboard', action: 'view' });
  });

  it('enforces 401 when unauthenticated and 403 when missing dashboard.view (Hard Invariant 8)', () => {
    const guard = new RbacGuard(new Reflector());

    expect(() => guard.canActivate(makeGuardContext(DashboardController.prototype.getOverview as never, undefined)))
      .toThrow(UnauthorizedException);

    const noDashUser = makePrincipal({
      permissions: UserPermissionsSchema.parse({
        dashboard: { view: false, viewProfit: false, export: false },
        pos: { view: false },
      }),
    });
    expect(() => guard.canActivate(makeGuardContext(DashboardController.prototype.getOverview as never, noDashUser)))
      .toThrow(ForbiddenException);
  });

  it('allows authorized user and forwards query + principal to DashboardService', async () => {
    const user = makePrincipal();
    const getOverview = vi.fn().mockResolvedValue({ ok: true });
    const controller = new DashboardController({ getOverview } as never);
    const guard = new RbacGuard(new Reflector());

    expect(guard.canActivate(makeGuardContext(DashboardController.prototype.getOverview as never, user))).toBe(true);

    await expect(controller.getOverview({ preset: '7d' }, user)).resolves.toEqual({ ok: true });
    expect(getOverview).toHaveBeenCalledWith({ preset: '7d' }, user);
  });
});
