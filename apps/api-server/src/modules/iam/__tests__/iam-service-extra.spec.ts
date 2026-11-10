import { Prisma } from '@prisma/client';
import { UserPermissionsSchema } from '@fnb/shared';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { durationToMilliseconds } from '../../../common/utils/duration.util';
import { IamService } from '../iam.service';

const permissions = UserPermissionsSchema.parse({});

const activeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 4,
  employeeId: 2,
  username: 'cashier01',
  passwordHash: 'hash',
  isSuperAdmin: false,
  isActive: true,
  permissions,
  uiPreferences: {},
  employee: {
    id: 2,
    fullName: 'Cashier One',
    shortName: 'C.One',
    isDeleted: false,
    phone: null,
    address: null,
    bankName: null,
    bankAccountNo: null,
    bankAccountName: null,
    avatarUrl: null,
    position: { id: 10, name: 'Thu Ngân' },
    specialty: { id: 11, name: 'Bếp Nấu' },
  },
  ...overrides,
});

const knownUniqueError = (target: string[]) => new Prisma.PrismaClientKnownRequestError('duplicate', {
  code: 'P2002',
  clientVersion: 'unit-test',
  meta: { target },
});

const makeService = (prisma: Record<string, unknown>, jwt: Record<string, unknown> = {}, lifetime = '7d') =>
  new IamService(prisma as never, jwt as never, { get: vi.fn().mockReturnValue(lifetime) } as never);

describe('IamService additional failure and success paths', () => {
  it('should reject a valid account with a password that does not match its hash', async () => {
    const compare = vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);
    const service = makeService({ user: { findUnique: vi.fn().mockResolvedValue(activeUser()) } });

    await expect(service.login({ username: 'cashier01', password: 'incorrect' })).rejects.toMatchObject({ status: 401 });
    compare.mockRestore();
  });

  it('should reject expired and invalid refresh JWTs with different machine codes', async () => {
    const expired = makeService({ user: {} }, {
      verifyAsync: vi.fn().mockRejectedValue(Object.assign(new Error('expired'), { name: 'TokenExpiredError' })),
    });
    const invalid = makeService({ user: {} }, { verifyAsync: vi.fn().mockRejectedValue(new Error('signature')) });

    await expect(expired.refreshAccessToken('expired')).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_EXPIRED' } });
    await expect(invalid.refreshAccessToken('invalid')).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });
  });

  it('should reject refresh tokens with non-refresh type or a non-positive user id', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValueOnce({ sub: 4, tokenType: 'access' }).mockResolvedValueOnce({ sub: 0, tokenType: 'refresh' }) };
    const service = makeService({ user: {} }, jwt);

    await expect(service.refreshAccessToken('access')).rejects.toMatchObject({ status: 401 });
    await expect(service.refreshAccessToken('invalid-id')).rejects.toMatchObject({ status: 401 });
  });

  it('should reject refresh when the user is missing, inactive, or linked to a deleted employee', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 4, tokenType: 'refresh' }) };
    const missing = makeService({ user: { findUnique: vi.fn().mockResolvedValue(null) } }, jwt);
    const inactive = makeService({ user: { findUnique: vi.fn().mockResolvedValue(activeUser({ isActive: false })) } }, jwt);
    const employeeDeleted = makeService({
      user: { findUnique: vi.fn().mockResolvedValue(activeUser({ employee: { ...activeUser().employee, isDeleted: true } })) },
    }, jwt);

    await expect(missing.refreshAccessToken('refresh')).rejects.toMatchObject({ status: 401 });
    await expect(inactive.refreshAccessToken('refresh')).rejects.toMatchObject({ status: 401 });
    await expect(employeeDeleted.refreshAccessToken('refresh')).rejects.toMatchObject({ status: 401 });
  });

  it('should rotate both tokens for a valid refresh token and include current master-data references', async () => {
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({ sub: '4', tokenType: 'refresh' }),
      signAsync: vi.fn().mockResolvedValueOnce('access-next').mockResolvedValueOnce('refresh-next'),
    };
    const service = makeService({ user: { findUnique: vi.fn().mockResolvedValue(activeUser()) } }, jwt);

    await expect(service.refreshAccessToken('refresh-current')).resolves.toMatchObject({
      accessToken: 'access-next',
      refreshToken: 'refresh-next',
      user: { employee: { position: { id: 10 }, specialty: { id: 11 } } },
    });
  });

  it('should list users with linked employees and safe account fields', async () => {
    const service = makeService({
      user: {
        findMany: vi.fn().mockResolvedValue([activeUser()]),
        count: vi.fn().mockResolvedValue(1),
      },
    });

    const result = await service.listUsers({ page: 1, limit: 20 } as never);

    expect(result).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      items: [{ isActive: true, username: 'cashier01', employee: { id: 2, fullName: 'Cashier One' } }],
    });
    expect(result.items[0]).not.toHaveProperty('passwordHash');
  });

  it('should filter and paginate user accounts by username or linked employee name', async () => {
    const findMany = vi.fn().mockResolvedValue([activeUser()]);
    const count = vi.fn().mockResolvedValue(7);
    const service = makeService({ user: { findMany, count } });

    const result = await service.listUsers({ page: 2, limit: 5, keyword: 'cashier' } as never);

    expect(result).toMatchObject({ page: 2, limit: 5, total: 7, items: [{ username: 'cashier01' }] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { username: { contains: 'cashier', mode: 'insensitive' } },
          { employee: { is: { fullName: { contains: 'cashier', mode: 'insensitive' } } } },
          { employee: { is: { shortName: { contains: 'cashier', mode: 'insensitive' } } } },
        ],
      }),
      skip: 5,
      take: 5,
    }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });

  it('should reject a missing or deleted employee when creating a user', async () => {
    const input = { employeeId: 2, username: 'cashier02', password: 'Password@123', permissions };
    const missing = makeService({ employee: { findUnique: vi.fn().mockResolvedValue(null) }, user: {} });
    const deleted = makeService({ employee: { findUnique: vi.fn().mockResolvedValue({ id: 2, isDeleted: true }) }, user: {} });

    await expect(missing.createUser(input)).rejects.toMatchObject({ status: 404, response: { code: 'HR_EMPLOYEE_DELETED' } });
    await expect(deleted.createUser(input)).rejects.toMatchObject({ status: 404, response: { code: 'HR_EMPLOYEE_DELETED' } });
  });

  it('should reject an employee who already has a linked user', async () => {
    const service = makeService({
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 2, isDeleted: false, user: { id: 7 } }) },
      user: { findUnique: vi.fn(), create: vi.fn() },
    });

    await expect(service.createUser({ employeeId: 2, username: 'cashier02', password: 'Password@123', permissions }))
      .rejects.toMatchObject({ status: 409, response: { code: 'HR_EMPLOYEE_ACCOUNT_EXISTS' } });
  });

  it('should map database uniqueness races to the correct account conflict', async () => {
    const makeRaceService = (error: Error) => makeService({
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 2, isDeleted: false, user: null }) },
      user: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(error) },
    });
    const input = { employeeId: 2, username: 'cashier02', password: 'Password@123', permissions };

    await expect(makeRaceService(knownUniqueError(['username'])).createUser(input))
      .rejects.toMatchObject({ status: 409, response: { code: 'HR_USERNAME_TAKEN' } });
    await expect(makeRaceService(knownUniqueError(['employee_id'])).createUser(input))
      .rejects.toMatchObject({ status: 409, response: { code: 'HR_EMPLOYEE_ACCOUNT_EXISTS' } });
  });

  it('should propagate database failures that are not uniqueness conflicts', async () => {
    const databaseError = new Error('database unavailable');
    const service = makeService({
      employee: { findUnique: vi.fn().mockResolvedValue({ id: 2, isDeleted: false, user: null }) },
      user: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(databaseError) },
    });

    await expect(service.createUser({ employeeId: 2, username: 'cashier02', password: 'Password@123', permissions }))
      .rejects.toBe(databaseError);
  });

  it('should update permissions and account state for regular users', async () => {
    const update = vi.fn().mockResolvedValue(activeUser());
    const service = makeService({ user: {
      findUnique: vi.fn().mockResolvedValue({ id: 4, isSuperAdmin: false }),
      update,
    } });

    await service.updateUserPermissions(4, { permissions, isActive: false });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { permissions, isActive: false } }));
  });

  it('should update permissions without changing account activation state', async () => {
    const update = vi.fn().mockResolvedValue(activeUser());
    const service = makeService({ user: {
      findUnique: vi.fn().mockResolvedValue({ id: 4, isSuperAdmin: false }),
      update,
    } });

    await service.updateUserPermissions(4, { permissions });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { permissions } }));
  });

  it('should return 404 when the target user does not exist', async () => {
    const service = makeService({ user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });

    await expect(service.updateUserPermissions(99, { isActive: false })).rejects.toMatchObject({ status: 404 });
  });

  it('should return 404 when the profile owner does not exist', async () => {
    const service = makeService({ user: { findUnique: vi.fn().mockResolvedValue(null) }, employee: { update: vi.fn() } });

    await expect(service.getProfile(99)).rejects.toMatchObject({ status: 404 });
    await expect(service.updateProfile(99, { phone: null })).rejects.toMatchObject({ status: 404 });
  });

  it('should verify the current password and store a bcrypt hash for the new password', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
    const hashSpy = vi.spyOn(bcrypt, 'hash').mockResolvedValueOnce('next-password-hash' as never);
    const update = vi.fn().mockResolvedValue({ id: 4 });
    const service = makeService({ user: {
      findUnique: vi.fn().mockResolvedValue({ passwordHash: 'current-password-hash' }),
      update,
    } });

    await expect(service.changePassword(4, {
      currentPassword: 'current-pass',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    })).resolves.toEqual({ message: 'Đổi mật khẩu thành công' });

    expect(compareSpy).toHaveBeenCalledWith('current-pass', 'current-password-hash');
    expect(hashSpy).toHaveBeenCalledWith('new-pass-123', 10);
    expect(update).toHaveBeenCalledWith({ where: { id: 4 }, data: { passwordHash: 'next-password-hash' } });
  });

  it('should refuse password changes when the current password is incorrect', async () => {
    vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);
    const update = vi.fn();
    const service = makeService({ user: {
      findUnique: vi.fn().mockResolvedValue({ passwordHash: 'current-password-hash' }),
      update,
    } });

    await expect(service.changePassword(4, {
      currentPassword: 'wrong-pass',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    })).rejects.toMatchObject({ status: 401 });
    expect(update).not.toHaveBeenCalled();
  });

  it('should return 404 when no account exists for UI preference changes', async () => {
    const service = makeService({ user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });

    await expect(service.updateUiPreferences(99, { theme: 'dark' })).rejects.toMatchObject({ status: 404 });
  });

  it('should safely recover from a non-object preferences value before persisting the patch', async () => {
    const update = vi.fn().mockResolvedValue({ uiPreferences: { theme: 'light', sidebar_width: 260, column_widths: {} } });
    const service = makeService({ user: {
      findUnique: vi.fn().mockResolvedValue({ uiPreferences: [] }),
      update,
    } });

    await service.updateUiPreferences(4, { theme: 'light' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: { uiPreferences: { theme: 'light', sidebar_width: 260, column_widths: {} } },
    }));
  });
});

describe('durationToMilliseconds', () => {
  it('should convert the configured 15-minute and 7-day JWT lifetimes', () => {
    expect(durationToMilliseconds('15m')).toBe(900000);
    expect(durationToMilliseconds('7d')).toBe(604800000);
    expect(() => durationToMilliseconds('bad')).toThrow('Unsupported token lifetime');
    expect(() => durationToMilliseconds('0s')).toThrow('Unsupported token lifetime');
  });
});
