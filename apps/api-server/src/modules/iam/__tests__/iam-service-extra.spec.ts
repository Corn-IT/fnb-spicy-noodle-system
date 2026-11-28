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

/** Gives a hand-written Prisma mock the transaction surface the service now relies on. */
const withTransaction = <T extends object>(prisma: T) => {
  const client = prisma as T & { $queryRaw: unknown; $transaction: unknown };
  client.$queryRaw = vi.fn().mockResolvedValue([]);
  client.$transaction = vi.fn(async (callback: (tx: T) => unknown) => callback(prisma));
  return prisma;
};

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

  it('should filter, sort hierarchically, and paginate user accounts by username or linked employee name', async () => {
    const pagedPool = [
      activeUser({ id: 5, username: 'thungan', isSuperAdmin: false }),
      activeUser({ id: 6, username: 'cashier06', isSuperAdmin: false }),
      activeUser({ id: 3, username: 'adminview', isSuperAdmin: false }),
      activeUser({ id: 2, username: 'admin', isSuperAdmin: false }),
      activeUser({ id: 1, username: 'superadmin', isSuperAdmin: true }),
      activeUser({ id: 4, username: 'cashier01', isSuperAdmin: false }),
      activeUser({ id: 7, username: 'cashier07', isSuperAdmin: false }),
    ];
    const findMany = vi.fn().mockResolvedValue(pagedPool);
    const service = makeService({ user: { findMany } });

    const result = await service.listUsers({ page: 2, limit: 5, keyword: 'cashier' } as never);

    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.total).toBe(7);
    expect(result.items).toHaveLength(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { username: { contains: 'cashier', mode: 'insensitive' } },
          { employee: { is: { fullName: { contains: 'cashier', mode: 'insensitive' } } } },
          { employee: { is: { shortName: { contains: 'cashier', mode: 'insensitive' } } } },
        ]),
      }),
    }));

    const page1 = await service.listUsers({ page: 1, limit: 4 } as never);
    expect(page1.items.map((u) => u.username)).toEqual(['superadmin', 'admin', 'adminview', 'thungan']);
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

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        permissions,
        isActive: false,
        activeSessionId: null,
        lastRevokedNotice: expect.objectContaining({ reason: 'ACCOUNT_DISABLED' }),
      }),
    }));
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
    expect(update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({
        passwordHash: 'next-password-hash',
        activeSessionId: expect.any(String),
      }),
    });
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
    })).rejects.toMatchObject({
      status: 422,
      response: {
        message: 'Mật khẩu hiện tại không chính xác',
      },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('should return 404 when no account exists for UI preference changes', async () => {
    const service = makeService(withTransaction({ user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } }));

    await expect(service.updateUiPreferences(99, { theme: 'dark' })).rejects.toMatchObject({ status: 404 });
  });

  it('should safely recover from a non-object preferences value before persisting the patch', async () => {
    const update = vi.fn().mockResolvedValue({ uiPreferences: { theme: 'light', sidebar_width: 260, column_widths: {} } });
    const service = makeService(withTransaction({ user: {
      findUnique: vi.fn().mockResolvedValue({ uiPreferences: [] }),
      update,
    } }));

    await service.updateUiPreferences(4, { theme: 'light' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: { uiPreferences: { theme: 'light', sidebar_width: 260, column_widths: {}, display_scale: { perPath: {} }, nav_order: [], nav_group_order: [], sidebar_collapsed: false } },
    }));
  });

  it('should record localized Vietnamese audit diffs for all 14 modules and new camelCase permission flags in updateUserPermissions', async () => {
    const prevPerms = UserPermissionsSchema.parse({});
    const updatedPerms = UserPermissionsSchema.parse({
      pos: {
        view: true,
        deleteDrafts: true,
        openCashDrawer: true,
        manualDiscount: true,
      },
      discounts: { view: true, create: true },
      paymentQr: { view: true },
      payroll: { view: true, export: true },
      invoices: { view: true, void: true },
    });

    const record = vi.fn().mockResolvedValue(undefined);
    const emitPermissionsUpdated = vi.fn();
    const existingRow = activeUser({
      id: 7,
      username: 'cashier07',
      permissions: prevPerms,
      activeSessionId: 'sid_live_7',
    });

    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(existingRow),
        update: vi.fn().mockResolvedValue({ ...existingRow, permissions: updatedPerms }),
      },
      pushSubscription: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const service = new IamService(
      prisma as never,
      {} as never,
      { get: vi.fn().mockReturnValue('7d') } as never,
      { record } as never,
      { emitPermissionsUpdated, isSessionOnline: vi.fn(() => true) } as never,
    );

    await service.updateUserPermissions(
      7,
      { permissions: updatedPerms },
      {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    );

    expect(emitPermissionsUpdated).toHaveBeenCalledWith(7, expect.objectContaining({
      pos: expect.objectContaining({ deleteDrafts: true, openCashDrawer: true, manualDiscount: true }),
    }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      module: 'RBAC',
      action: 'Cập nhật phân quyền',
      metadata: expect.objectContaining({
        changes: expect.arrayContaining([
          { field: 'Bán hàng POS · Xóa giỏ lưu tạm', from: 'Tắt', to: 'Bật' },
          { field: 'Bán hàng POS · Mở két tiền tự do', from: 'Tắt', to: 'Bật' },
          { field: 'Bán hàng POS · Giảm giá tay trực tiếp', from: 'Tắt', to: 'Bật' },
          { field: 'Mã giảm giá · Thêm mới', from: 'Tắt', to: 'Bật' },
          { field: 'Mã QR thanh toán · Xem', from: 'Tắt', to: 'Bật' },
          { field: 'Bảng tính lương · Xuất file Excel', from: 'Tắt', to: 'Bật' },
          { field: 'Quản lý Hoá đơn · Huỷ đơn', from: 'Tắt', to: 'Bật' },
        ]),
      }),
    }));
  });

  it('should emit session revoke, clear push subscriptions, and prevent modifying Super Admin inside updateUserPermissions', async () => {
    const emitSessionRevoked = vi.fn();
    const deletePush = vi.fn().mockResolvedValue({ count: 1 });
    const record = vi.fn().mockResolvedValue(undefined);
    const existingRegular = activeUser({
      id: 8,
      username: 'staff08',
      isActive: true,
      activeSessionId: 'sid_888',
      activeSessionIp: '192.168.1.88',
      activeSessionDevice: 'Windows · Chrome',
    });

    const service = new IamService(
      {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(activeUser({ id: 1, isSuperAdmin: true }))
            .mockResolvedValueOnce(existingRegular),
          update: vi.fn().mockResolvedValue({ ...existingRegular, isActive: false, activeSessionId: null }),
        },
        pushSubscription: { deleteMany: deletePush },
      } as never,
      {} as never,
      { get: vi.fn().mockReturnValue('7d') } as never,
      { record } as never,
      { emitSessionRevoked, isSessionOnline: vi.fn(() => false) } as never,
    );

    const adminActor = {
      id: 1,
      employeeId: 1,
      username: 'superadmin',
      isSuperAdmin: true,
      permissions: UserPermissionsSchema.parse({}),
    };

    await expect(service.updateUserPermissions(1, { isActive: false }, adminActor)).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'RBAC_SUPER_ADMIN_REQUIRED' }),
    });

    await service.updateUserPermissions(8, { isActive: false }, adminActor);
    expect(emitSessionRevoked).toHaveBeenCalledWith(
      'sid_888',
      expect.objectContaining({ reason: 'ACCOUNT_DISABLED' }),
    );
    expect(deletePush).toHaveBeenCalledWith({ where: { userId: 8 } });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Khoá / Mở tài khoản',
        metadata: expect.objectContaining({
          revokedIp: '192.168.1.88',
          revokedDevice: 'Windows · Chrome',
        }),
      }),
    );
  });

  it('guards revokeUserSession 404/super-admin 403, getUserSessionHistory 404, and updateUserAccount identity revocation + P2002 collisions', async () => {
    const emitSessionRevoked = vi.fn();
    const actor = {
      id: 1,
      employeeId: 1,
      username: 'superadmin',
      isSuperAdmin: true,
      permissions,
    };
    const otherSuperAdmin = activeUser({ id: 9, isSuperAdmin: true, activeSessionId: 'sid-9' });
    const staffUser = activeUser({
      id: 12,
      employeeId: 2,
      username: 'staff12',
      activeSessionId: 'sid-12',
    });

    const userRepo = {
      findUnique: vi.fn(async ({ where }: { where: { id?: number; username?: string } }) => {
        if (where.id === 999) return null;
        if (where.id === 9) return otherSuperAdmin;
        if (where.id === 12) return staffUser;
        return null;
      }),
      update: vi
        .fn()
        .mockResolvedValueOnce({ ...staffUser, username: 'staff12_new', activeSessionId: null })
        .mockRejectedValueOnce(knownUniqueError(['username']))
        .mockRejectedValueOnce(knownUniqueError(['employee_id'])),
    };
    const service = new IamService(
      withTransaction({ user: userRepo, pushSubscription: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } }) as never,
      {} as never,
      { get: vi.fn().mockReturnValue('7d') } as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      { emitSessionRevoked, isSessionOnline: vi.fn(() => false) } as never,
    );

    await expect(service.revokeUserSession(999, actor)).rejects.toMatchObject({ status: 404 });
    await expect(service.revokeUserSession(9, actor)).rejects.toMatchObject({ status: 403 });
    await expect(service.getUserSessionHistory(999, 5)).rejects.toMatchObject({ status: 404 });

    await service.updateUserAccount(12, { username: 'staff12_new' }, actor);
    expect(emitSessionRevoked).toHaveBeenCalledWith(
      'sid-12',
      expect.objectContaining({ reason: 'ADMIN_REVOKED' }),
    );

    await expect(
      service.updateUserAccount(12, { username: 'taken' }, actor),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateUserAccount(12, { username: 'staff12' }, actor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('covers uploadMyAvatar, deleteMyAvatar, getPublicAvatarBinary, and login disabled/deleted/conflict/force branches', async () => {
    const validPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const userRow = activeUser({
      roleLabel: null,
      activeSessionId: 'sid-old',
      activeSessionIp: '10.0.0.5',
      activeSessionDevice: 'Chrome',
      activeSessionAt: new Date('2026-11-28T01:00:00.000Z'),
    });

    const masterUpsert = vi.fn().mockResolvedValue({});
    const masterUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const masterFindUnique = vi.fn();
    const empUpdate = vi.fn().mockResolvedValue({});
    const userFindUnique = vi.fn().mockResolvedValue(userRow);
    const userUpdate = vi.fn().mockResolvedValue({});
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const emitSessionRevoked = vi.fn();
    const isSessionOnline = vi.fn(() => true);

    const svc = new IamService(
      {
        user: { findUnique: userFindUnique, update: userUpdate },
        employee: { update: empUpdate },
        masterData: { upsert: masterUpsert, updateMany: masterUpdateMany, findUnique: masterFindUnique },
        pushSubscription: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      } as never,
      { signAsync: vi.fn().mockResolvedValue('jwt-token') } as never,
      { get: vi.fn().mockReturnValue('7d') } as never,
      { record: auditRecord } as never,
      { emitSessionRevoked, isSessionOnline } as never,
    );

    // Avatar upload/delete/public-binary
    userFindUnique.mockResolvedValueOnce(null);
    await expect(
      svc.uploadMyAvatar(999, { mime: 'image/png', base64: validPngBase64 }),
    ).rejects.toMatchObject({ status: 404 });

    const uploaded = await svc.uploadMyAvatar(4, {
      mime: 'image/png',
      base64: `data:image/png;base64,${validPngBase64}`,
    });
    expect(masterUpsert).toHaveBeenCalled();
    expect(empUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({ avatarUrl: expect.stringContaining('/api/v1/public/avatars/2?v=') }),
      }),
    );
    expect(uploaded.id).toBe(4);

    userFindUnique.mockResolvedValueOnce(null);
    await expect(svc.deleteMyAvatar(999)).rejects.toMatchObject({ status: 404 });
    await svc.deleteMyAvatar(4);
    expect(masterUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(empUpdate).toHaveBeenLastCalledWith({ where: { id: 2 }, data: { avatarUrl: null } });

    masterFindUnique.mockResolvedValueOnce({ isActive: false, metadata: { base64: validPngBase64 } });
    await expect(svc.getPublicAvatarBinary(2)).rejects.toMatchObject({ status: 404 });
    masterFindUnique.mockResolvedValueOnce({ isActive: true, metadata: { base64: 'not-image-bytes' } });
    await expect(svc.getPublicAvatarBinary(2)).rejects.toMatchObject({ status: 404 });
    masterFindUnique.mockResolvedValueOnce({ isActive: true, metadata: { base64: validPngBase64 } });
    const bin = await svc.getPublicAvatarBinary(2);
    expect(bin.mime).toBe('image/png');
    expect(bin.buffer.byteLength).toBeGreaterThan(0);

    // Login: deleted employee, inactive account, online conflict (no force), and force takeover
    const compare = vi.spyOn(bcrypt, 'compare');
    compare.mockResolvedValue(true);
    try {
      userFindUnique.mockResolvedValueOnce(activeUser({ employee: { ...userRow.employee, isDeleted: true } }));
      await expect(svc.login({ username: 'cashier01', password: 'pw' })).rejects.toMatchObject({ status: 401 });

      userFindUnique.mockResolvedValueOnce(activeUser({ isActive: false }));
      await expect(svc.login({ username: 'cashier01', password: 'pw' })).rejects.toMatchObject({ status: 401 });

      userFindUnique.mockResolvedValueOnce(userRow);
      await expect(svc.login({ username: 'cashier01', password: 'pw', force: false })).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'AUTH_SESSION_CONFLICT_ONLINE' }),
      });

      userFindUnique.mockResolvedValueOnce(userRow);
      const loginOk = await svc.login({ username: 'cashier01', password: 'pw', force: true });
      expect(loginOk.accessToken).toBe('jwt-token');
      expect(emitSessionRevoked).toHaveBeenCalledWith('sid-old', expect.objectContaining({ reason: 'NEW_LOGIN' }));
    } finally {
      compare.mockRestore();
    }
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
