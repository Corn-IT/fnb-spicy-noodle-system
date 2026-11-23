import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { IamService } from '../iam.service';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { IamController } from '../iam.controller';
import { MdmController } from '../../mdm/mdm.controller';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AUTHORIZATION_METADATA } from '../../../common/decorators/permissions.decorator';

const permissions = {
  pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false },
  invoices: { view: false, reprint: false, void: false },
  inventory: { view: false, create: false, update: false, delete: false },
  cashflow: { view: false, create: false, config: false },
  employees: { view: false, create: false, update: false, delete: false },
  schedules: { view: false, update: false },
  mdm: { view: false, write: false },
  rbac: { view: false, manage: false },
};

const guardContext = (user?: Record<string, unknown>) => {
  const request = { user, headers: {} as Record<string, string> };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext,
  };
};

/** Gives a hand-written Prisma mock the transaction surface the service now relies on. */
const withTransaction = <T extends object>(prisma: T) => {
  const client = prisma as T & { $queryRaw: unknown; $transaction: unknown };
  client.$queryRaw = vi.fn().mockResolvedValue([]);
  client.$transaction = vi.fn(async (callback: (tx: T) => unknown) => callback(prisma));
  return prisma;
};

describe('RbacGuard', () => {
  it('should return 401 when no authenticated principal reaches the permission guard', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ module: 'mdm', action: 'write' }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should return 403 when an authenticated user does not have the requested permission', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ module: 'mdm', action: 'write' }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({ isSuperAdmin: false, permissions });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should bypass every permission check for a super admin', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ superAdminOnly: true }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({ isSuperAdmin: true, permissions: {} });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow an endpoint without an explicit permission requirement', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({ isSuperAdmin: false, permissions });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return the dedicated 403 code when a non-admin calls a super-admin-only endpoint', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ superAdminOnly: true }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({ isSuperAdmin: false, permissions });

    expect(() => guard.canActivate(context)).toThrow(expect.objectContaining({
      response: { code: 'RBAC_SUPER_ADMIN_REQUIRED', message: expect.any(String) },
    }));
  });

  it('should grant a user who has the exact requested permission', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ module: 'mdm', action: 'view' }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({
      isSuperAdmin: false,
      permissions: { ...permissions, mdm: { view: true, write: false } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow POS sub-permission fallback only when that sub-permission was omitted', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ module: 'pos', action: 'checkout' }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({
      isSuperAdmin: false,
      permissions: { pos: { create: true, update: false } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny a POS sub-permission explicitly set to false despite CRUD fallback', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ module: 'pos', action: 'checkout' }) };
    const guard = new RbacGuard(reflector as never);
    const { context } = guardContext({
      isSuperAdmin: false,
      permissions: { pos: { create: true, checkout: false } },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should return 403 for malformed permission data and for a POS fallback with no CRUD grant', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue({ module: 'pos', action: 'checkout' }) };
    const guard = new RbacGuard(reflector as never);
    const malformed = guardContext({ isSuperAdmin: false, permissions: { pos: 'invalid' } });
    const missingFallback = guardContext({ isSuperAdmin: false, permissions: { pos: { create: false } } });

    expect(() => guard.canActivate(malformed.context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(missingFallback.context)).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  it('should return 401 with AUTH_TOKEN_MISSING when the bearer token is absent', async () => {
    const guard = new JwtAuthGuard({ verifyAsync: vi.fn() } as never, { user: { findUnique: vi.fn() } } as never);
    const { context } = guardContext();

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_MISSING' },
    });
  });

  it('should return 401 with AUTH_TOKEN_INVALID when the signed-in account has been disabled', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 8, tokenType: 'access' }) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 8, isActive: false }) } };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);
    const { context } = guardContext();
    (context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Bearer valid-signature' };

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_INVALID' },
    });
  });

  it('should distinguish an expired token from a malformed or invalid token', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(Object.assign(new Error('expired'), { name: 'TokenExpiredError' })) };
    const guard = new JwtAuthGuard(jwt as never, { user: { findUnique: vi.fn() } } as never);
    const { context } = guardContext();
    (context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Bearer expired' };

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_EXPIRED' },
    });
  });

  it('should return 401 for malformed bearer headers and invalid signatures', async () => {
    const malformedGuard = new JwtAuthGuard({ verifyAsync: vi.fn() } as never, { user: { findUnique: vi.fn() } } as never);
    const malformed = guardContext();
    (malformed.context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Basic abc' };
    await expect(malformedGuard.canActivate(malformed.context)).rejects.toMatchObject({
      status: 401, response: { code: 'AUTH_TOKEN_INVALID' },
    });

    const invalidGuard = new JwtAuthGuard({ verifyAsync: vi.fn().mockRejectedValue(new Error('signature')) } as never,
      { user: { findUnique: vi.fn() } } as never);
    const invalid = guardContext();
    (invalid.context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Bearer bad' };
    await expect(invalidGuard.canActivate(invalid.context)).rejects.toMatchObject({
      status: 401, response: { code: 'AUTH_TOKEN_INVALID' },
    });
  });

  it('should reject a refresh token presented as an access token and a missing database user', async () => {
    const refreshGuard = new JwtAuthGuard({ verifyAsync: vi.fn().mockResolvedValue({ sub: 4, tokenType: 'refresh' }) } as never,
      { user: { findUnique: vi.fn() } } as never);
    const refresh = guardContext();
    (refresh.context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Bearer refresh' };
    await expect(refreshGuard.canActivate(refresh.context)).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });

    const missingUserGuard = new JwtAuthGuard({ verifyAsync: vi.fn().mockResolvedValue({ sub: 4, tokenType: 'access' }) } as never,
      { user: { findUnique: vi.fn().mockResolvedValue(null) } } as never);
    const missingUser = guardContext();
    (missingUser.context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Bearer valid' };
    await expect(missingUserGuard.canActivate(missingUser.context)).rejects.toMatchObject({
      response: { code: 'AUTH_TOKEN_INVALID' },
    });
  });

  it('should reject malformed stored permissions and attach the current database principal when valid', async () => {
    const malformedGuard = new JwtAuthGuard({ verifyAsync: vi.fn().mockResolvedValue({ sub: 4, tokenType: 'access' }) } as never,
      { user: { findUnique: vi.fn().mockResolvedValue({ id: 4, employeeId: 2, username: 'cashier', isSuperAdmin: false, isActive: true, permissions: { pos: 'bad' } }) } } as never);
    const malformed = guardContext();
    (malformed.context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'Bearer valid' };
    await expect(malformedGuard.canActivate(malformed.context)).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });

    const currentPermissions = { ...permissions, mdm: { view: true, write: false } };
    const request = guardContext();
    (request.context.switchToHttp().getRequest() as { headers: { authorization: string } }).headers = { authorization: 'bEaReR valid' };
    const validGuard = new JwtAuthGuard({ verifyAsync: vi.fn().mockResolvedValue({ sub: '4', tokenType: 'access' }) } as never,
      { user: { findUnique: vi.fn().mockResolvedValue({
        id: 4, employeeId: 2, username: 'cashier', isSuperAdmin: false, isActive: true, permissions: currentPermissions,
      }) } } as never);

    await expect(validGuard.canActivate(request.context)).resolves.toBe(true);
    expect(request.request.user).toMatchObject({ id: 4, permissions: { mdm: { view: true } } });
  });
});

describe('IamService', () => {
  it('should reject invalid login credentials with the authentication error code', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const jwt = { signAsync: vi.fn() };
    const service = new IamService(prisma as never, jwt as never, { get: vi.fn().mockReturnValue('15m') } as never);

    await expect(service.login({ username: 'cashier01', password: 'wrong-password' })).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_CREDENTIALS_INVALID' },
    });
  });

  it('should preserve existing UI preference keys while patching one preference', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 4, uiPreferences: { theme: 'dark', column_widths: { name: 220 } } }),
        update: vi.fn().mockResolvedValue({ id: 4, uiPreferences: { theme: 'dark', sidebar_width: 300, column_widths: { name: 220 } } }),
      },
    };
    const service = new IamService(withTransaction(prisma) as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await service.updateUiPreferences(4, { sidebarWidth: 300 });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { uiPreferences: { theme: 'dark', sidebar_width: 300, column_widths: { name: 220 }, display_scale: { perPath: {} }, nav_order: [], nav_group_order: [], sidebar_collapsed: false } },
      select: { uiPreferences: true },
    });
  });

  it('should merge partial column-width updates instead of replacing the other saved widths', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 4, uiPreferences: { theme: 'dark', column_widths: { name: 220 } } }),
        update: vi.fn().mockResolvedValue({ uiPreferences: { theme: 'dark', sidebar_width: 260, column_widths: { name: 220, price: 180 } } }),
      },
    };
    const service = new IamService(withTransaction(prisma) as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await service.updateUiPreferences(4, { columnWidths: { price: 180 } });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { uiPreferences: { theme: 'dark', sidebar_width: 260, column_widths: { name: 220, price: 180 }, display_scale: { perPath: {} }, nav_order: [], nav_group_order: [], sidebar_collapsed: false } },
      select: { uiPreferences: true },
    });
  });

  it('should persist per-account display scale and menu order, and reset them with empty values', async () => {
    const stored = {
      theme: 'dark',
      sidebar_width: 260,
      column_widths: {},
      display_scale: { globalPercent: 120, perPath: { '/pos': 110 } },
      nav_order: ['/pos', '/dashboard'],
      nav_group_order: ['sales'],
          sidebar_collapsed: false,
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 4, uiPreferences: stored }),
        update: vi.fn().mockResolvedValue({ uiPreferences: { ...stored, display_scale: { perPath: {} }, nav_order: [] } }),
      },
    };
    const service = new IamService(withTransaction(prisma) as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    const result = await service.updateUiPreferences(4, { displayScale: { perPath: {} }, navOrder: [] });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: {
        uiPreferences: {
          theme: 'dark',
          sidebar_width: 260,
          column_widths: {},
          display_scale: { perPath: {} },
          nav_order: [],
          nav_group_order: ['sales'],
          sidebar_collapsed: false,
        },
      },
      select: { uiPreferences: true },
    });
    expect(result.displayScale).toEqual({ perPath: {} });
    expect(result.navOrder).toEqual([]);
  });

  it('should persist sidebar collapsed and the voice choice, omitting voice when never chosen', async () => {
    const buildService = (updateResult: unknown) => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 4, uiPreferences: { theme: 'dark' } }),
          update: vi.fn().mockResolvedValue({ uiPreferences: updateResult }),
        },
      };
      return { prisma, service: new IamService(withTransaction(prisma) as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never) };
    };

    const first = buildService({ theme: 'dark', sidebar_collapsed: true, voice_alert_enabled: false });
    const result = await first.service.updateUiPreferences(4, { sidebarCollapsed: true, voiceAlertEnabled: false });
    expect(first.prisma.user.update.mock.calls[0]?.[0].data.uiPreferences).toMatchObject({
      sidebar_collapsed: true,
      voice_alert_enabled: false,
    });
    expect(result.sidebarCollapsed).toBe(true);
    expect(result.voiceAlertEnabled).toBe(false);

    const second = buildService({ theme: 'dark' });
    const untouched = await second.service.updateUiPreferences(4, { theme: 'dark' });
    expect(second.prisma.user.update.mock.calls[0]?.[0].data.uiPreferences).not.toHaveProperty('voice_alert_enabled');
    expect(second.prisma.user.update.mock.calls[0]?.[0].data.uiPreferences.sidebar_collapsed).toBe(false);
    expect(untouched.voiceAlertEnabled).toBeUndefined();
    expect(untouched.sidebarCollapsed).toBe(false);
  });

  it('should reject unknown preference keys and wrongly typed per-account values', async () => {
    const { UpdateUiPreferencesSchema } = await import('@fnb/shared');
    expect(UpdateUiPreferencesSchema.safeParse({ unknownKey: 1 }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ sidebarCollapsed: 'yes' }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ voiceAlertEnabled: 1 }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ navOrder: ['no-slash'] }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ navOrder: Array.from({ length: 65 }, (_, i) => `/p${i}`) }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({}).success).toBe(false);
  });

  it('should reject menu paths and group keys that do not exist in the app menu', async () => {
    const { UpdateUiPreferencesSchema } = await import('@fnb/shared');
    expect(UpdateUiPreferencesSchema.safeParse({ navOrder: ['/pos', '/menu'] }).success).toBe(true);
    expect(UpdateUiPreferencesSchema.safeParse({ navOrder: ['/not-a-screen'] }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ navOrder: ['/pos', '/pos'] }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ navGroupOrder: ['sales', 'hr'] }).success).toBe(true);
    expect(UpdateUiPreferencesSchema.safeParse({ navGroupOrder: ['bogus'] }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ navGroupOrder: ['sales', 'sales'] }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ displayScale: { perPath: { '/pos': 110 } } }).success).toBe(true);
    expect(UpdateUiPreferencesSchema.safeParse({ displayScale: { perPath: { '/ghost': 110 } } }).success).toBe(false);
  });

  it('should drop stale stored values instead of failing when reading preferences at login', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 4,
          uiPreferences: {
            theme: 'dark',
            nav_order: ['/pos', '/removed-screen', '/pos', 42],
            nav_group_order: ['sales', 'old-group'],
            display_scale: { globalPercent: 123, perPath: { '/pos': 110, '/removed-screen': 120, '/menu': 77 } },
            sidebar_collapsed: 'yes',
            voice_alert_enabled: 'no',
          },
        }),
        update: vi.fn().mockImplementation(async ({ data }: { data: { uiPreferences: unknown } }) => ({
          uiPreferences: data.uiPreferences,
        })),
      },
    };
    const service = new IamService(withTransaction(prisma) as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    const result = await service.updateUiPreferences(4, { theme: 'light' });

    expect(result.navOrder).toEqual(['/pos']);
    expect(result.navGroupOrder).toEqual(['sales']);
    expect(result.displayScale).toEqual({ perPath: { '/pos': 110 } });
    expect(result.sidebarCollapsed).toBe(false);
    expect(result.voiceAlertEnabled).toBeUndefined();
  });

  it('should lock the account row before reading and write inside the same transaction', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        calls.push('lock');
        return [];
      }),
      user: {
        findUnique: vi.fn(async () => {
          calls.push('read');
          return { uiPreferences: { theme: 'dark' } };
        }),
        update: vi.fn(async () => {
          calls.push('write');
          return { uiPreferences: { theme: 'dark', sidebar_collapsed: true } };
        }),
      },
    };
    const prisma = {
      user: {
        findUnique: vi.fn(() => {
          throw new Error('must read through the transaction client');
        }),
        update: vi.fn(() => {
          throw new Error('must write through the transaction client');
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
        calls.push('begin');
        const result = await callback(tx);
        calls.push('commit');
        return result;
      }),
    };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await service.updateUiPreferences(4, { sidebarCollapsed: true });

    expect(calls).toEqual(['begin', 'lock', 'read', 'write', 'commit']);
  });

  it('should serialize two concurrent saves so neither erases the other', async () => {
    // A tiny in-memory row guarded by a mutex stands in for Postgres row locking.
    let row: Record<string, unknown> = { theme: 'dark' };
    let locked = Promise.resolve();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) => {
        const previous = locked;
        let release: () => void = () => undefined;
        locked = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            user: {
              findUnique: vi.fn(async () => {
                const snapshot = { ...row };
                await new Promise((resolve) => setTimeout(resolve, 5));
                return { uiPreferences: snapshot };
              }),
              update: vi.fn(async ({ data }: { data: { uiPreferences: Record<string, unknown> } }) => {
                row = data.uiPreferences;
                return { uiPreferences: row };
              }),
            },
          };
          return await callback(tx);
        } finally {
          release();
        }
      }),
    };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await Promise.all([
      service.updateUiPreferences(4, { sidebarCollapsed: true }),
      service.updateUiPreferences(4, { voiceAlertEnabled: false }),
      service.updateUiPreferences(4, { navGroupOrder: ['finance', 'sales'] }),
    ]);

    expect(row).toMatchObject({
      sidebar_collapsed: true,
      voice_alert_enabled: false,
      nav_group_order: ['finance', 'sales'],
    });
  });

  it('should announce saved preferences to the account devices only after the transaction commits', async () => {
    const calls: string[] = [];
    const gateway = { emitAccountPreferencesUpdated: vi.fn(() => calls.push('emit')) };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: {
        findUnique: vi.fn().mockResolvedValue({ uiPreferences: { theme: 'dark' } }),
        update: vi.fn().mockResolvedValue({ uiPreferences: { theme: 'dark', sidebar_collapsed: true } }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
        const result = await callback(tx);
        calls.push('commit');
        return result;
      }),
    };
    const service = new IamService(
      prisma as never,
      { signAsync: vi.fn() } as never,
      { get: vi.fn() } as never,
      undefined,
      gateway as never,
    );

    const result = await service.updateUiPreferences(4, { sidebarCollapsed: true });

    expect(calls).toEqual(['commit', 'emit']);
    expect(gateway.emitAccountPreferencesUpdated).toHaveBeenCalledWith(4, result);
    expect(result.sidebarCollapsed).toBe(true);
  });

  it('should not announce anything when the save fails', async () => {
    const gateway = { emitAccountPreferencesUpdated: vi.fn() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new IamService(
      prisma as never,
      { signAsync: vi.fn() } as never,
      { get: vi.fn() } as never,
      undefined,
      gateway as never,
    );

    await expect(service.updateUiPreferences(99, { sidebarCollapsed: true })).rejects.toMatchObject({ status: 404 });
    expect(gateway.emitAccountPreferencesUpdated).not.toHaveBeenCalled();
  });

  it('should reject out-of-range display scale values', async () => {
    const { UpdateUiPreferencesSchema } = await import('@fnb/shared');
    expect(UpdateUiPreferencesSchema.safeParse({ displayScale: { globalPercent: 500, perPath: {} } }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ displayScale: { globalPercent: 123, perPath: {} } }).success).toBe(false);
    expect(UpdateUiPreferencesSchema.safeParse({ displayScale: { globalPercent: 120, perPath: {} } }).success).toBe(true);
  });

  it('should bcrypt-hash a new account password with cost 10 and link the existing employee', async () => {
    const prisma = {
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 2, isDeleted: false, user: null }) },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({
          ...data,
          id: 4,
          isSuperAdmin: false,
          isActive: true,
          uiPreferences: {},
          employee: { id: 2, fullName: 'Cashier One', shortName: 'C.One', avatarUrl: null, isDeleted: false, position: null, specialty: null },
        })),
      },
    };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await service.createUser({ employeeId: 2, username: 'cashier02', password: 'Password@123', permissions });

    const createCall = prisma.user.create.mock.calls[0]?.[0] as { data: { employeeId: number; passwordHash: string } };
    expect(createCall.data.employeeId).toBe(2);
    expect(bcrypt.getRounds(createCall.data.passwordHash)).toBe(10);
    await expect(bcrypt.compare('Password@123', createCall.data.passwordHash)).resolves.toBe(true);
  });

  it('should prevent changing permissions or active state for a super-admin account', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 1, isSuperAdmin: true }), update: vi.fn() } };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await expect(service.updateUserPermissions(1, { isActive: false })).rejects.toMatchObject({
      status: 403,
      response: { code: 'RBAC_SUPER_ADMIN_REQUIRED' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should reject duplicate usernames with a 409 HR_USERNAME_TAKEN response', async () => {
    const prisma = {
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 2, isDeleted: false, user: null }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 3 }), create: vi.fn() },
    };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await expect(service.createUser({ employeeId: 2, username: 'taken', password: 'Password@123', permissions })).rejects.toMatchObject({
      status: 409,
      response: { code: 'HR_USERNAME_TAKEN' },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('should return joined employee and preferences with access and refresh tokens on valid login', async () => {
    const passwordHash = await bcrypt.hash('Password@123', 10);
    const user = {
      id: 4, employeeId: 2, username: 'cashier01', passwordHash, isSuperAdmin: false, isActive: true,
      permissions, uiPreferences: { theme: 'dark' },
      employee: { id: 2, fullName: 'Cashier One', shortName: 'C.One', avatarUrl: null, isDeleted: false, position: null, specialty: null },
    };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
    const jwt = { signAsync: vi.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh') };
    const service = new IamService(prisma as never, jwt as never, { get: vi.fn().mockReturnValue('7d') } as never);

    await expect(service.login({ username: 'cashier01', password: 'Password@123' })).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { username: 'cashier01', employee: { fullName: 'Cashier One' }, uiPreferences: { theme: 'dark' } },
    });
    expect(jwt.signAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({ sub: 4, tokenType: 'access', sid: expect.any(String) }));
    expect(jwt.signAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({ sub: 4, tokenType: 'refresh', sid: expect.any(String) }), { expiresIn: '7d' });
  });

  it('should update editable employee profile fields without changing position or specialty', async () => {
    const profileUser = {
      id: 4,
      employeeId: 2,
      username: 'cashier01',
      isSuperAdmin: false,
      permissions,
      uiPreferences: {},
      employee: {
        id: 2, fullName: 'Cashier One', shortName: 'C.One', phone: '0900', address: 'Old',
        bankName: null, bankAccountNo: null, bankAccountName: null, avatarUrl: null,
        position: null, specialty: null,
      },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValueOnce({ employeeId: 2 }).mockResolvedValueOnce(profileUser) },
      employee: { update: vi.fn().mockResolvedValue({}) },
    };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never);

    await service.updateProfile(4, { phone: '0911', address: 'New address' });

    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { phone: '0911', address: 'New address' },
    });
  });

  it('should recompute shortName and emit schedule:updated when fullName changes in updateProfile', async () => {
    const updatedUser = {
      id: 4,
      employeeId: 2,
      username: 'cashier01',
      isSuperAdmin: false,
      permissions,
      uiPreferences: {},
      employee: {
        id: 2, fullName: 'Nguyễn Minh Hoàng', shortName: 'M.Hoàng', phone: '0900', address: 'Old',
        bankName: null, bankAccountNo: null, bankAccountName: null, avatarUrl: null,
        position: null, specialty: null,
      },
    };
    const prisma = {
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ employeeId: 2, employee: { fullName: 'Cashier One', shortName: 'C.One' } })
          .mockResolvedValueOnce(updatedUser),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([{ id: 3, shortName: 'L.Anh' }]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const gateway = { emitScheduleUpdated: vi.fn(), emitPermissionsUpdated: vi.fn(), emitSessionRevoked: vi.fn() };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never, undefined, gateway as never);

    const profile = await service.updateProfile(4, { fullName: 'Nguyễn Minh Hoàng' });

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: { id: { not: 2 }, isDeleted: false },
      select: { id: true, shortName: true },
    });
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { fullName: 'Nguyễn Minh Hoàng', shortName: 'M.Hoàng' },
    });
    expect(gateway.emitScheduleUpdated).toHaveBeenCalledTimes(1);
    expect(profile.employee.shortName).toBe('M.Hoàng');
  });

  it('should disambiguate shortName on collision and skip schedule emit when fullName is unchanged', async () => {
    const unchangedUser = {
      id: 4,
      employeeId: 2,
      username: 'cashier01',
      isSuperAdmin: false,
      permissions,
      uiPreferences: {},
      employee: {
        id: 2, fullName: 'Trần Văn Nam', shortName: 'T.V.Nam (#2)', phone: '0900', address: 'Old',
        bankName: null, bankAccountNo: null, bankAccountName: null, avatarUrl: null,
        position: null, specialty: null,
      },
    };
    const prisma = {
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ employeeId: 2, employee: { fullName: 'Nguyễn Minh', shortName: 'M.Minh' } })
          .mockResolvedValueOnce(unchangedUser)
          .mockResolvedValueOnce({ employeeId: 2, employee: { fullName: 'Trần Văn Nam', shortName: 'T.V.Nam (#2)' } })
          .mockResolvedValueOnce(unchangedUser),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([{ id: 9, shortName: 'V.Nam' }]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const gateway = { emitScheduleUpdated: vi.fn() };
    const service = new IamService(prisma as never, { signAsync: vi.fn() } as never, { get: vi.fn() } as never, undefined, gateway as never);

    await service.updateProfile(4, { fullName: 'Trần Văn Nam' });
    expect(prisma.employee.update).toHaveBeenLastCalledWith({
      where: { id: 2 },
      data: { fullName: 'Trần Văn Nam', shortName: 'T.V.Nam (#2)' },
    });
    expect(gateway.emitScheduleUpdated).toHaveBeenCalledTimes(1);

    await service.updateProfile(4, { fullName: 'Trần Văn Nam', phone: '0988' });
    expect(gateway.emitScheduleUpdated).toHaveBeenCalledTimes(1);
  });
});

describe('IAM and MDM controller access boundaries', () => {
  it('should return the access token in JSON and place the refresh token in an HTTP-only cookie', async () => {
    const authUser = {
      id: 4, employeeId: 2, username: 'cashier01', isSuperAdmin: false, permissions,
      employee: { fullName: 'Cashier One', shortName: 'C.One', avatarUrl: null, position: null, specialty: null },
      uiPreferences: { theme: 'system', sidebarWidth: 260, columnWidths: {} },
    };
    const iamService = { login: vi.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: authUser }) };
    const config = { get: vi.fn((key: string) => key === 'jwtRefreshExpiresIn' ? '7d' : 'development') };
    const controller = new IamController(iamService as never, config as never);
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };

    const body = await controller.login({ username: 'cashier01', password: 'Password@123' }, response as never);

    expect(body).toEqual({ accessToken: 'access', user: authUser });
    expect(body).not.toHaveProperty('refreshToken');
    expect(response.cookie).toHaveBeenCalledWith('refreshToken', 'refresh', {
      httpOnly: true, secure: false, sameSite: 'strict', path: '/api/v1/auth', maxAge: 604800000,
    });
  });

  it('should prefer the refresh cookie, rotate it, and set secure cookies in production', async () => {
    const user = {
      id: 4, employeeId: 2, username: 'cashier01', isSuperAdmin: false, permissions,
      employee: { fullName: 'Cashier One', shortName: 'C.One', avatarUrl: null, position: null, specialty: null },
      uiPreferences: { theme: 'system', sidebarWidth: 260, columnWidths: {} },
    };
    const iamService = { refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-next', refreshToken: 'refresh-next', user }) };
    const config = { get: vi.fn((key: string) => key === 'jwtRefreshExpiresIn' ? '7d' : 'production') };
    const controller = new IamController(iamService as never, config as never);
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };

    await controller.refresh({ cookies: { refreshToken: 'cookie-token' } } as never, { refreshToken: 'body-token' }, response as never);

    expect(iamService.refreshAccessToken).toHaveBeenCalledWith('cookie-token');
    expect(response.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-next', expect.objectContaining({ secure: true, httpOnly: true }));
  });

  it('should accept the refresh token from the request body when no cookie is present', async () => {
    const iamService = { refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: {} }) };
    const controller = new IamController(iamService as never, { get: vi.fn((key: string) => key === 'jwtRefreshExpiresIn' ? '7d' : 'test') } as never);

    await controller.refresh({ cookies: {} } as never, { refreshToken: 'body-token' }, { cookie: vi.fn() } as never);

    expect(iamService.refreshAccessToken).toHaveBeenCalledWith('body-token');
  });

  it('should reject refresh requests without a cookie or a body token and clear the cookie on logout', async () => {
    const controller = new IamController({ refreshAccessToken: vi.fn() } as never, { get: vi.fn((key: string) => key === 'jwtRefreshExpiresIn' ? '7d' : 'test') } as never);
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };

    await expect(controller.refresh({ cookies: {} } as never, {}, response as never)).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_MISSING' },
    });
    controller.logout(response as never);
    expect(response.clearCookie).toHaveBeenCalledWith('refreshToken', {
      httpOnly: true, secure: false, sameSite: 'strict', path: '/api/v1/auth',
    });
  });

  it('should protect MDM lookup with authentication alone and management endpoints with RBAC', () => {
    const lookupGuards = Reflect.getMetadata(GUARDS_METADATA, MdmController.prototype.lookup) as unknown[];
    const listGuards = Reflect.getMetadata(GUARDS_METADATA, MdmController.prototype.list) as unknown[];

    expect(Reflect.getMetadata(PATH_METADATA, MdmController)).toBe('api/v1/mdm');
    expect(lookupGuards).toEqual([JwtAuthGuard]);
    expect(listGuards).toEqual([JwtAuthGuard, RbacGuard]);
    expect(Reflect.getMetadata(AUTHORIZATION_METADATA, MdmController.prototype.list)).toEqual({ module: 'mdm', action: 'view' });
    expect(Reflect.getMetadata(AUTHORIZATION_METADATA, MdmController.prototype.create)).toEqual({ module: 'mdm', action: 'create' });
    expect(Reflect.getMetadata(AUTHORIZATION_METADATA, MdmController.prototype.update)).toEqual({ module: 'mdm', action: 'update' });
    expect(Reflect.getMetadata(AUTHORIZATION_METADATA, MdmController.prototype.disable)).toEqual({ module: 'mdm', action: 'delete' });
  });
});
