import type { ExecutionContext } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCodes, SocketEvents, SocketRooms, UserPermissionsSchema } from '@fnb/shared';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { runWithRequestContext } from '../../../common/context/request-context';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  extractClientIpFromHeaders,
  normalizeIpAddress,
  parseDeviceLabel,
} from '../../../common/security/client-info.util';
import { PosSocketGateway } from '../../../gateways/pos-socket.gateway';
import { IamService } from '../iam.service';

const basePermissions = UserPermissionsSchema.parse({
  pos: { view: true, create: true },
});

const makeUserRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  passwordHash: bcrypt.hashSync('Admin@123', 4),
  isSuperAdmin: true,
  isActive: true,
  permissions: basePermissions,
  uiPreferences: { theme: 'dark' },
  activeSessionId: null as string | null,
  activeSessionIp: null as string | null,
  activeSessionDevice: null as string | null,
  activeSessionAgent: null as string | null,
  activeSessionAt: null as Date | null,
  lastRevokedNotice: null as unknown,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  employee: {
    id: 1,
    fullName: 'Chủ Quán Sơn Bảo',
    shortName: 'Sơn Bảo',
    avatarUrl: null,
    isDeleted: false,
    position: { id: 1, name: 'Quản lý' },
    specialty: null,
  },
  ...overrides,
});

describe('Single Active Session & 3-Layer IP/Device Tracking (Backend)', () => {
  describe('client-info normalization & device parsing', () => {
    it('normalizes ::ffff: IPv4-mapped addresses, loopback ::1, and proxy chains', () => {
      expect(normalizeIpAddress('::ffff:192.168.1.50')).toBe('192.168.1.50');
      expect(normalizeIpAddress('::1')).toBe('127.0.0.1');
      expect(normalizeIpAddress('10.0.0.15:54321')).toBe('10.0.0.15');
      expect(
        extractClientIpFromHeaders(
          {
            'x-forwarded-for': '::ffff:203.113.10.22, 10.0.0.1',
          },
          '127.0.0.1',
        ),
      ).toBe('203.113.10.22');
      expect(
        extractClientIpFromHeaders(
          {
            'cf-connecting-ip': '171.244.1.9',
            'x-forwarded-for': '10.0.0.2',
          },
          '127.0.0.1',
        ),
      ).toBe('171.244.1.9');
    });

    it('parses human-readable OS & browser device labels cleanly', () => {
      expect(
        parseDeviceLabel(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        ),
      ).toBe('Windows · Chrome');
      expect(
        parseDeviceLabel(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        ),
      ).toBe('iPhone · Safari');
      expect(
        parseDeviceLabel(
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Zalo/24.0',
        ),
      ).toBe('Android · Zalo');
      expect(parseDeviceLabel('curl/8.5.0')).toBe('API Client');
    });
  });

  describe('Single-session replacement, kick notifications & anti-race guards', () => {
    it('enforces 1-machine-per-account even for superadmin, kicks old session via Socket & rejects stale JWT/Refresh', async () => {
      let dbUser = makeUserRow();
      const auditRecords: Array<Record<string, unknown>> = [];

      const prisma = {
        user: {
          findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: number; username?: string } }) => {
            if (where.username && where.username !== dbUser.username) return null;
            if (where.id && where.id !== dbUser.id) return null;
            return { ...dbUser };
          }),
          update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            dbUser = { ...dbUser, ...data };
            return { ...dbUser };
          }),
          updateMany: vi.fn().mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            if (where.activeSessionId && where.activeSessionId !== dbUser.activeSessionId) {
              return { count: 0 };
            }
            dbUser = { ...dbUser, ...data };
            return { count: 1 };
          }),
        },
        auditLog: {
          create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            auditRecords.push(data);
            return { id: auditRecords.length, ...data };
          }),
        },
      };

      const signAsync = vi.fn().mockImplementation(async (payload: Record<string, unknown>) =>
        JSON.stringify(payload),
      );
      const verifyAsync = vi.fn().mockImplementation(async (token: string) => JSON.parse(token));
      const jwtService = { signAsync, verifyAsync };
      const configService = { get: vi.fn().mockReturnValue('15m') };
      const auditService = new AuditLogService(prisma as never);
      const socketEmissions: Array<{ room: string; event: string; payload: unknown }> = [];
      const gateway = new PosSocketGateway(jwtService as never, prisma as never);
      (gateway as unknown as { server: unknown }).server = {
        emit: vi.fn(),
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => {
            socketEmissions.push({ room, event, payload });
          },
        }),
      };

      const service = new IamService(
        prisma as never,
        jwtService as never,
        configService as never,
        auditService,
        gateway,
      );

      // 1) Machine A (Windows · Chrome, 192.168.1.10) logs in as superadmin
      const loginA = await service.login(
        { username: 'superadmin', password: 'Admin@123' },
        { ipAddress: '192.168.1.10', deviceLabel: 'Windows · Chrome', userAgent: 'Chrome/131' },
      );
      const claimsA = JSON.parse(loginA.accessToken) as { sid: string };
      expect(claimsA.sid).toBeTruthy();
      expect(dbUser.activeSessionId).toBe(claimsA.sid);
      expect(dbUser.activeSessionIp).toBe('192.168.1.10');
      expect(dbUser.activeSessionDevice).toBe('Windows · Chrome');

      // Refresh on Machine A keeps the SAME sessionId across tabs
      const refreshedA = await service.refreshAccessToken(loginA.refreshToken);
      const refreshedClaimsA = JSON.parse(refreshedA.accessToken) as { sid: string };
      expect(refreshedClaimsA.sid).toBe(claimsA.sid);

      // 2) Machine B (iPhone · Safari, 192.168.1.88) logs into the SAME superadmin account -> kicks Machine A
      const loginB = await service.login(
        { username: 'superadmin', password: 'Admin@123' },
        { ipAddress: '192.168.1.88', deviceLabel: 'iPhone · Safari', userAgent: 'Safari/18' },
      );
      const claimsB = JSON.parse(loginB.accessToken) as { sid: string };
      expect(claimsB.sid).not.toBe(claimsA.sid);
      expect(dbUser.activeSessionId).toBe(claimsB.sid);

      // Instant 0ms Socket kick MUST target Machine A's session room without leaking IP/device
      expect(socketEmissions).toContainEqual({
        room: SocketRooms.userSession(claimsA.sid),
        event: SocketEvents.SESSION_REVOKED,
        payload: expect.objectContaining({
          reason: 'NEW_LOGIN',
          at: expect.any(String),
        }),
      });
      const kickPayload = socketEmissions[0]?.payload as Record<string, unknown>;
      expect(kickPayload).not.toHaveProperty('byIp');
      expect(kickPayload).not.toHaveProperty('byDevice');

      // RBAC AuditLog records both "Đăng nhập" and "Chiếm phiên đăng nhập" with full IP + device for Admin
      expect(auditRecords.some((r) => r.action === 'Đăng nhập' && r.ipAddress === '192.168.1.10')).toBe(true);
      expect(
        auditRecords.some(
          (r) =>
            r.action === 'Chiếm phiên đăng nhập' &&
            r.ipAddress === '192.168.1.88' &&
            r.deviceLabel === 'iPhone · Safari',
        ),
      ).toBe(true);

      // 3) Stale Access Token from Machine A is rejected by JwtAuthGuard with AUTH_SESSION_REPLACED without leaking IP/device
      const jwtGuard = new JwtAuthGuard(jwtService as never, prisma as never);
      const oldRequest = {
        headers: { authorization: `Bearer ${loginA.accessToken}` },
      };
      await expect(
        jwtGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => oldRequest }),
        } as unknown as ExecutionContext),
      ).rejects.toMatchObject({
        status: 401,
        response: {
          code: ErrorCodes.AUTH_SESSION_REPLACED,
          details: {
            reason: 'NEW_LOGIN',
            at: expect.any(String),
          },
        },
      });

      // 4) Stale Refresh Token from Machine A is rejected with AUTH_SESSION_REPLACED
      await expect(service.refreshAccessToken(loginA.refreshToken)).rejects.toMatchObject({
        status: 401,
        response: { code: ErrorCodes.AUTH_SESSION_REPLACED },
      });

      // 5) Stale Socket connection from Machine A fails authentication middleware
      let socketAuthMiddleware: ((client: unknown, next: (err?: Error) => void) => void) | undefined;
      gateway.afterInit({
        use: (fn: (client: unknown, next: (err?: Error) => void) => void) => {
          socketAuthMiddleware = fn;
        },
      } as never);
      const staleSocketNext = vi.fn();
      const socketMiddlewareDone = new Promise<void>((resolve) => {
        socketAuthMiddleware?.(
          {
            handshake: { headers: {}, auth: { token: loginA.accessToken } },
            data: {},
            join: vi.fn(),
          },
          (err?: Error) => {
            staleSocketNext(err);
            resolve();
          },
        );
      });
      await socketMiddlewareDone;
      expect(staleSocketNext).toHaveBeenCalledWith(expect.any(Error));

      // 6) Stale browser tab calling logout() with Machine A's old sid MUST NOT wipe Machine B's active session!
      await service.logout(
        { userId: 1, sessionId: claimsA.sid },
        { ipAddress: '192.168.1.10', deviceLabel: 'Windows · Chrome', userAgent: null },
      );
      expect(dbUser.activeSessionId).toBe(claimsB.sid);

      // 7) Active session on Machine B passes JwtAuthGuard cleanly
      const validRequest: { headers: Record<string, string>; user?: unknown } = {
        headers: { authorization: `Bearer ${loginB.accessToken}` },
      };
      await expect(
        jwtGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => validRequest }),
        } as unknown as ExecutionContext),
      ).resolves.toBe(true);
    });

    it('requires explicit confirmation (409 AUTH_SESSION_CONFLICT_ONLINE) when previous session has an active online socket, and allows force login after confirmation', async () => {
      let dbUser = makeUserRow();
      const auditRecords: Array<Record<string, unknown>> = [];

      const prisma = {
        user: {
          findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: number; username?: string } }) => {
            if (where.username && where.username !== dbUser.username) return null;
            if (where.id && where.id !== dbUser.id) return null;
            return { ...dbUser };
          }),
          update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            dbUser = { ...dbUser, ...data };
            return { ...dbUser };
          }),
        },
        auditLog: {
          create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            auditRecords.push(data);
            return { id: auditRecords.length, ...data };
          }),
        },
      };

      const jwtService = {
        signAsync: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => JSON.stringify(payload)),
        verifyAsync: vi.fn().mockImplementation(async (token: string) => JSON.parse(token)),
      };
      const gateway = new PosSocketGateway(jwtService as never, prisma as never);
      const socketEmissions: Array<{ room: string; event: string; payload: unknown }> = [];
      (gateway as unknown as { server: unknown }).server = {
        emit: vi.fn(),
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => {
            socketEmissions.push({ room, event, payload });
          },
        }),
      };

      const service = new IamService(
        prisma as never,
        jwtService as never,
        { get: vi.fn().mockReturnValue('15m') } as never,
        new AuditLogService(prisma as never),
        gateway,
      );

      // Machine A logs in and connects an active WebSocket
      const loginA = await service.login(
        { username: 'superadmin', password: 'Admin@123' },
        { ipAddress: '192.168.1.10', deviceLabel: 'Windows · Chrome', userAgent: 'Chrome/131' },
      );
      const claimsA = JSON.parse(loginA.accessToken) as { sid: string };
      const socketA = {
        id: 'socket-machine-a',
        data: { authMode: 'staff' as const, user: { id: 1 }, sessionId: claimsA.sid },
        join: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      };
      await gateway.handleConnection(socketA as never);
      expect(gateway.isSessionOnline(claimsA.sid)).toBe(true);

      // Wrong password MUST still return 401 AUTH_CREDENTIALS_INVALID (never leaks active device info via 409)
      await expect(
        service.login(
          { username: 'superadmin', password: 'WrongPassword' },
          { ipAddress: '192.168.1.88', deviceLabel: 'iPhone · Safari', userAgent: 'Safari/18' },
        ),
      ).rejects.toMatchObject({
        status: 401,
        response: { code: ErrorCodes.AUTH_CREDENTIALS_INVALID },
      });

      // Machine B logs in without force -> 409 ConflictException without leaking Machine A IP/device
      await expect(
        service.login(
          { username: 'superadmin', password: 'Admin@123' },
          { ipAddress: '192.168.1.88', deviceLabel: 'iPhone · Safari', userAgent: 'Safari/18' },
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: ErrorCodes.AUTH_SESSION_CONFLICT_ONLINE,
          details: {
            username: 'superadmin',
            startedAt: expect.any(String),
          },
        },
      });
      expect(dbUser.activeSessionId).toBe(claimsA.sid);
      expect(socketEmissions).toHaveLength(0);

      // Machine B confirms force=true -> replaces Machine A, emits 0ms kick, and logs full IP/device in audit
      const loginB = await service.login(
        { username: 'superadmin', password: 'Admin@123', force: true },
        { ipAddress: '192.168.1.88', deviceLabel: 'iPhone · Safari', userAgent: 'Safari/18' },
      );
      const claimsB = JSON.parse(loginB.accessToken) as { sid: string };
      expect(claimsB.sid).not.toBe(claimsA.sid);
      expect(dbUser.activeSessionId).toBe(claimsB.sid);
      expect(gateway.isSessionOnline(claimsA.sid)).toBe(false);
      expect(socketEmissions).toContainEqual({
        room: SocketRooms.userSession(claimsA.sid),
        event: SocketEvents.SESSION_REVOKED,
        payload: expect.objectContaining({
          reason: 'NEW_LOGIN',
          at: expect.any(String),
        }),
      });
      const forceKickPayload = socketEmissions[0]?.payload as Record<string, unknown>;
      expect(forceKickPayload).not.toHaveProperty('byIp');
      expect(forceKickPayload).not.toHaveProperty('byDevice');
      expect(auditRecords.some((r) => r.action === 'Chiếm phiên đăng nhập' && r.ipAddress === '192.168.1.88')).toBe(true);
    });

    it('revokes active sessions when Super Admin clicks remote revoke, resets password, or disables account', async () => {
      let targetUser = makeUserRow({
        id: 5,
        username: 'cashier01',
        isSuperAdmin: false,
        activeSessionId: 'sid-cashier-active',
        activeSessionIp: '192.168.1.33',
        activeSessionDevice: 'Windows · Edge',
      });

      const prisma = {
        user: {
          findUnique: vi.fn().mockImplementation(async () => ({ ...targetUser })),
          update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            targetUser = { ...targetUser, ...data };
            return { ...targetUser };
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };

      const socketEmissions: Array<{ room: string; event: string; payload: unknown }> = [];
      const gateway = new PosSocketGateway({} as never, prisma as never);
      (gateway as unknown as { server: unknown }).server = {
        emit: vi.fn(),
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => {
            socketEmissions.push({ room, event, payload });
          },
        }),
      };

      const service = new IamService(
        prisma as never,
        { signAsync: vi.fn(), verifyAsync: vi.fn() } as never,
        { get: vi.fn().mockReturnValue('15m') } as never,
        new AuditLogService(prisma as never),
        gateway,
      );

      const adminActor = {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        isSuperAdmin: true,
        permissions: basePermissions,
      };

      const revokeResult = await service.revokeUserSession(5, adminActor, {
        ipAddress: '192.168.1.10',
        deviceLabel: 'Windows · Chrome',
        userAgent: null,
      });

      expect(revokeResult).toEqual({ revoked: true, userId: 5 });
      expect(targetUser.activeSessionId).toBeNull();
      expect(targetUser.lastRevokedNotice).toMatchObject({
        reason: 'ADMIN_REVOKED',
        at: expect.any(String),
      });
      expect(targetUser.lastRevokedNotice).not.toHaveProperty('byIp');
      expect(targetUser.lastRevokedNotice).not.toHaveProperty('byDevice');
      expect(socketEmissions).toContainEqual({
        room: SocketRooms.userSession('sid-cashier-active'),
        event: SocketEvents.SESSION_REVOKED,
        payload: expect.objectContaining({ reason: 'ADMIN_REVOKED' }),
      });

      // Password reset also terminates active session
      targetUser.activeSessionId = 'sid-cashier-2';
      await service.resetUserPassword(5, { newPassword: 'NewPass@123' }, adminActor);
      expect(targetUser.activeSessionId).toBeNull();
      expect(socketEmissions).toContainEqual({
        room: SocketRooms.userSession('sid-cashier-2'),
        event: SocketEvents.SESSION_REVOKED,
        payload: expect.objectContaining({ reason: 'PASSWORD_CHANGED' }),
      });

      // Disabling account also terminates active session
      targetUser.activeSessionId = 'sid-cashier-3';
      await service.updateUserPermissions(5, { isActive: false }, 1);
      expect(targetUser.activeSessionId).toBeNull();
      expect(socketEmissions).toContainEqual({
        room: SocketRooms.userSession('sid-cashier-3'),
        event: SocketEvents.SESSION_REVOKED,
        payload: expect.objectContaining({ reason: 'ACCOUNT_DISABLED' }),
      });
    });
  });

  describe('AuditLogService AsyncLocalStorage IP/Device auto-capture & search', () => {
    it('automatically attaches IP + device from RequestContext across modules and filters list by IP/device', async () => {
      const findManyMock = vi.fn().mockResolvedValue([
        {
          id: 9,
          module: 'POS',
          actorId: 2,
          actorUsername: 'cashier01',
          actorFullName: 'Nguyễn Văn Anh',
          action: 'Tạo đơn mang về',
          summary: 'Đơn MV #01',
          ipAddress: '192.168.1.77',
          deviceLabel: 'Windows · Chrome',
          metadata: {},
          createdAt: new Date('2026-11-17T08:00:00.000Z'),
        },
      ]);
      const createMock = vi.fn().mockResolvedValue({ id: 9 });
      const countMock = vi.fn().mockResolvedValue(1);

      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 2,
            username: 'cashier01',
            employee: { fullName: 'Nguyễn Văn Anh' },
          }),
        },
        auditLog: {
          create: createMock,
          findMany: findManyMock,
          count: countMock,
        },
      };

      const auditService = new AuditLogService(prisma as never);

      await runWithRequestContext(
        {
          requestId: 'req-123',
          ipAddress: '192.168.1.77',
          deviceLabel: 'Windows · Chrome',
          userAgent: 'Mozilla/5.0 Chrome/131',
        },
        async () => {
          await auditService.record({
            module: 'POS',
            action: 'Tạo đơn mang về',
            detail: 'Đơn MV #01',
            actor: 2,
          });
        },
      );

      expect(createMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          module: 'POS',
          ipAddress: '192.168.1.77',
          deviceLabel: 'Windows · Chrome',
        }),
      });

      const listResult = await auditService.list(
        {
          module: 'RBAC',
          keyword: '192.168.1.77',
          page: 1,
          limit: 20,
        },
        { includeClientInfo: true },
      );

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { ipAddress: { contains: '192.168.1.77', mode: 'insensitive' } },
              { deviceLabel: { contains: '192.168.1.77', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
      expect(listResult.items[0]).toMatchObject({
        ipAddress: '192.168.1.77',
        deviceLabel: 'Windows · Chrome',
      });
    });
  });

  describe('Profile Avatar Upload/Delete/Serve, Session Info & Self-Change Password Rotation', () => {
    // Valid 1x1 PNG binary
    const validPngBase64 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]).toString('base64');

    it('uploads validated avatar magic bytes, serves binary, deletes cleanly, and returns session metadata on getProfile', async () => {
      let avatarRow: Record<string, unknown> | null = null;
      const employeeRecord = {
        id: 1,
        fullName: 'Chủ Quán Sơn Bảo',
        shortName: 'Sơn Bảo',
        phone: '0901234567',
        address: '123 Lê Lợi',
        bankName: 'Vietcombank',
        bankAccountNo: '007100123456',
        bankAccountName: 'SON BAO',
        avatarUrl: null as string | null,
        isDeleted: false,
        position: { id: 1, name: 'Quản lý' },
        specialty: null,
      };
      const userRow = makeUserRow({
        activeSessionId: 'sid-live',
        activeSessionIp: '192.168.1.25',
        activeSessionDevice: 'Windows · Chrome',
        activeSessionAt: new Date('2026-11-17T10:00:00.000Z'),
        employee: employeeRecord,
      });

      const prisma = {
        user: {
          findUnique: vi.fn().mockImplementation(async () => ({ ...userRow, employee: { ...employeeRecord } })),
        },
        employee: {
          update: vi.fn().mockImplementation(async ({ data }: { data: { avatarUrl: string | null } }) => {
            employeeRecord.avatarUrl = data.avatarUrl;
            return { ...employeeRecord };
          }),
        },
        masterData: {
          upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
            avatarRow = { ...create };
            return avatarRow;
          }),
          findUnique: vi.fn().mockImplementation(async () => avatarRow),
          updateMany: vi.fn().mockImplementation(async () => {
            if (avatarRow) avatarRow = { ...avatarRow, isActive: false };
            return { count: 1 };
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };

      const service = new IamService(
        prisma as never,
        { signAsync: vi.fn(), verifyAsync: vi.fn() } as never,
        { get: vi.fn().mockReturnValue('15m') } as never,
        new AuditLogService(prisma as never),
      );

      // Rejects forged PNG bytes (invalid magic bytes)
      await expect(
        service.uploadMyAvatar(1, {
          mime: 'image/png',
          base64: Buffer.from('not-a-real-image').toString('base64'),
        }),
      ).rejects.toMatchObject({ status: 400 });

      // Uploads real PNG -> returns relative /api/v1/public/avatars/1?v=... URL & session info
      const uploadedProfile = await service.uploadMyAvatar(1, {
        mime: 'image/png',
        base64: validPngBase64,
      });
      expect(uploadedProfile.employee.avatarUrl).toMatch(/^\/api\/v1\/public\/avatars\/1\?v=/);
      expect(uploadedProfile.session).toMatchObject({
        ipAddress: '192.168.1.25',
        deviceLabel: 'Windows · Chrome',
        startedAt: '2026-11-17T10:00:00.000Z',
      });

      // Serves raw binary cleanly
      const served = await service.getPublicAvatarBinary(1);
      expect(served.mime).toBe('image/png');
      expect(served.buffer.byteLength).toBe(16);

      // Deletes avatar cleanly
      const afterDelete = await service.deleteMyAvatar(1);
      expect(afterDelete.employee.avatarUrl).toBeNull();
      await expect(service.getPublicAvatarBinary(1)).rejects.toMatchObject({ status: 404 });
    });

    it('rotates activeSessionId and returns fresh tokens on self changePassword without kicking current browser', async () => {
      let dbUser = makeUserRow({
        activeSessionId: 'sid-current-browser',
        activeSessionIp: '192.168.1.10',
        activeSessionDevice: 'Windows · Chrome',
        activeSessionAt: new Date('2026-11-17T09:00:00.000Z'),
      });
      const prisma = {
        user: {
          findUnique: vi.fn().mockImplementation(async () => ({ ...dbUser })),
          update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            dbUser = { ...dbUser, ...data };
            return { ...dbUser };
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };
      const jwtService = {
        signAsync: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => JSON.stringify(payload)),
        verifyAsync: vi.fn(),
      };
      const socketEmissions: Array<{ room: string; event: string }> = [];
      const gateway = new PosSocketGateway(jwtService as never, prisma as never);
      (gateway as unknown as { server: unknown }).server = {
        emit: vi.fn(),
        to: (room: string) => ({
          emit: (event: string) => {
            socketEmissions.push({ room, event });
          },
        }),
      };

      const service = new IamService(
        prisma as never,
        jwtService as never,
        { get: vi.fn().mockReturnValue('15m') } as never,
        new AuditLogService(prisma as never),
        gateway,
      );

      const res = await service.changePassword(
        1,
        {
          currentPassword: 'Admin@123',
          newPassword: 'NewAdmin@123',
          confirmPassword: 'NewAdmin@123',
        },
        'sid-current-browser',
        { ipAddress: '192.168.1.10', deviceLabel: 'Windows · Chrome', userAgent: 'Chrome/131' },
      );

      expect(res.message).toBe('Đổi mật khẩu thành công');
      expect(res.accessToken).toBeTruthy();
      expect(res.refreshToken).toBeTruthy();
      const issuedClaims = JSON.parse(res.accessToken!) as { sid: string };
      expect(issuedClaims.sid).not.toBe('sid-current-browser');
      expect(dbUser.activeSessionId).toBe(issuedClaims.sid);
      // MUST NOT emit SESSION_REVOKED to the very browser changing its own password
      expect(socketEmissions).toHaveLength(0);
    });

    it('returns up to limit scoped session history entries for target user without cross-account admin leakage', async () => {
      const targetUser = makeUserRow({
        id: 2,
        username: 'thungan',
        isSuperAdmin: false,
        activeSessionId: 'sid-active-2',
        activeSessionIp: '192.168.1.33',
        activeSessionDevice: 'Windows · Chrome',
        activeSessionAt: new Date('2026-11-17T12:15:00.000Z'),
        employee: {
          id: 12,
          fullName: 'Trần Thị Lan',
          shortName: 'T.Lan',
          avatarUrl: null,
          isDeleted: false,
          position: { id: 2, name: 'Thu Ngân' },
          specialty: null,
        },
      });
      const adminUser = makeUserRow({ id: 1, username: 'superadmin', isSuperAdmin: true });

      const sampleLogs = [
        {
          id: 10,
          module: 'RBAC',
          action: 'Chiếm phiên đăng nhập',
          actorId: 2,
          actorFullName: 'Trần Thị Lan',
          actorUsername: 'thungan',
          summary: 'Nhân viên Trần Thị Lan (thungan) đăng nhập đè',
          ipAddress: '192.168.1.33',
          deviceLabel: 'Windows · Chrome',
          metadata: { targetUserId: 2, previousIp: '192.168.1.12', previousDevice: 'iPhone · Safari' },
          createdAt: new Date('2026-11-17T12:15:00.000Z'),
        },
        {
          id: 9,
          module: 'RBAC',
          action: 'Thu hồi phiên',
          actorId: 1,
          actorFullName: 'Chủ Quán Sơn Bảo',
          actorUsername: 'superadmin',
          summary: 'Thu hồi phiên từ xa',
          ipAddress: '192.168.1.1',
          deviceLabel: 'macOS · Safari',
          metadata: { targetUserId: 2, revokedIp: '192.168.1.12', revokedDevice: 'iPhone · Safari' },
          createdAt: new Date('2026-11-17T11:30:00.000Z'),
        },
        {
          id: 8,
          module: 'RBAC',
          action: 'Khoá / Mở tài khoản',
          actorId: 1,
          actorFullName: 'Chủ Quán Sơn Bảo',
          actorUsername: 'superadmin',
          summary: 'Khoá tài khoản',
          ipAddress: '192.168.1.1',
          deviceLabel: 'macOS · Safari',
          metadata: { targetUserId: 2, isActive: false, revokedIp: '10.0.0.5', revokedDevice: 'Android · Chrome' },
          createdAt: new Date('2026-11-17T11:00:00.000Z'),
        },
        {
          id: 7,
          module: 'RBAC',
          action: 'Đăng xuất',
          actorId: 2,
          actorFullName: 'Trần Thị Lan',
          actorUsername: 'thungan',
          summary: 'Đăng xuất',
          ipAddress: '192.168.1.12',
          deviceLabel: 'iPhone · Safari',
          metadata: { targetUserId: 2 },
          createdAt: new Date('2026-11-17T10:00:00.000Z'),
        },
        {
          id: 6,
          module: 'RBAC',
          action: 'Đăng nhập',
          actorId: 2,
          actorFullName: 'Trần Thị Lan',
          actorUsername: 'thungan',
          summary: 'Đăng nhập',
          ipAddress: '192.168.1.12',
          deviceLabel: 'iPhone · Safari',
          metadata: { targetUserId: 2 },
          createdAt: new Date('2026-11-17T09:00:00.000Z'),
        },
        {
          id: 5,
          module: 'RBAC',
          action: 'Đổi mật khẩu',
          actorId: 2,
          actorFullName: 'Trần Thị Lan',
          actorUsername: 'thungan',
          summary: 'Đổi mật khẩu',
          ipAddress: '192.168.1.12',
          deviceLabel: 'iPhone · Safari',
          metadata: { targetUserId: 2 },
          createdAt: new Date('2026-11-17T08:00:00.000Z'),
        },
        {
          id: 4,
          module: 'RBAC',
          action: 'Đăng nhập',
          actorId: 1,
          actorFullName: 'Chủ Quán Sơn Bảo',
          actorUsername: 'superadmin',
          summary: 'Superadmin đăng nhập',
          ipAddress: '192.168.1.1',
          deviceLabel: 'macOS · Safari',
          metadata: { targetUserId: 1 },
          createdAt: new Date('2026-11-17T07:00:00.000Z'),
        },
      ];

      const prisma = {
        user: {
          findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: number } }) => {
            if (where.id === 2) return targetUser;
            if (where.id === 1) return adminUser;
            return null;
          }),
        },
        auditLog: {
          findMany: vi.fn().mockResolvedValue(sampleLogs),
        },
      };
      const jwtService = { signAsync: vi.fn(), verifyAsync: vi.fn() };
      const gateway = new PosSocketGateway(jwtService as never, prisma as never);
      vi.spyOn(gateway, 'isSessionOnline').mockImplementation((sid) => sid === 'sid-active-2');

      const service = new IamService(
        prisma as never,
        jwtService as never,
        { get: vi.fn().mockReturnValue('15m') } as never,
        new AuditLogService(prisma as never),
        gateway,
      );

      const history2 = await service.getUserSessionHistory(2, 5);
      expect(history2.user).toMatchObject({ id: 2, username: 'thungan', fullName: 'Trần Thị Lan' });
      expect(history2.currentSession).toMatchObject({
        isActiveSession: true,
        isSocketOnline: true,
        ipAddress: '192.168.1.33',
        deviceLabel: 'Windows · Chrome',
      });
      expect(history2.items).toHaveLength(5);
      expect(history2.items.map((item) => item.eventType)).toEqual([
        'SESSION_REPLACED',
        'ADMIN_REVOKED',
        'ACCOUNT_LOCKED',
        'LOGOUT',
        'LOGIN',
      ]);
      expect(history2.items[0]).toMatchObject({
        previousIp: '192.168.1.12',
        previousDevice: 'iPhone · Safari',
      });
      expect(history2.items[1]).toMatchObject({
        actorUsername: 'superadmin',
        previousIp: '192.168.1.12',
        previousDevice: 'iPhone · Safari',
      });

      // Superadmin's own timeline must NOT include revoke/lock actions done against cashier #2
      const history1 = await service.getUserSessionHistory(1, 5);
      expect(history1.items).toHaveLength(1);
      expect(history1.items[0]).toMatchObject({ eventType: 'LOGIN', actorUsername: 'superadmin' });

      await expect(service.getUserSessionHistory(999, 5)).rejects.toMatchObject({ status: 404 });
    });

    it('records failed login attempts for existing/disabled accounts (not non-existent typo usernames) and pushes realtime permission updates via Socket', async () => {
      const dbUser = makeUserRow({
        id: 4,
        username: 'thungan',
        isSuperAdmin: false,
        activeSessionId: 'sid-cashier-live',
        employee: {
          id: 14,
          fullName: 'Trần Thị Lan',
          shortName: 'T.Lan',
          avatarUrl: null,
          isDeleted: false,
          position: { id: 2, name: 'Thu Ngân' },
          specialty: null,
        },
      });
      const disabledUser = makeUserRow({
        id: 5,
        username: 'locked_staff',
        isSuperAdmin: false,
        isActive: false,
      });
      const recordedAuditRows: Array<Record<string, unknown>> = [];
      const socketEmissions: Array<{ room: string; event: string; payload: unknown }> = [];

      const prisma = {
        user: {
          findUnique: vi.fn(async ({ where }: { where: { id?: number; username?: string } }) => {
            if (where.username === 'thungan' || where.id === 4) return { ...dbUser };
            if (where.username === 'locked_staff' || where.id === 5) return { ...disabledUser };
            return null;
          }),
          update: vi.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
            const target = where.id === 4 ? dbUser : disabledUser;
            Object.assign(target, data);
            return { ...target };
          }),
        },
        auditLog: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            recordedAuditRows.push(data);
            return { id: recordedAuditRows.length, ...data };
          }),
          findMany: vi.fn(async () =>
            recordedAuditRows.map((row, idx) => ({
              id: idx + 1,
              createdAt: new Date('2026-11-17T12:00:00.000Z'),
              ...row,
            })),
          ),
        },
      };

      const jwtService = { signAsync: vi.fn(), verifyAsync: vi.fn() };
      const gateway = new PosSocketGateway(jwtService as never, prisma as never);
      (gateway as unknown as { server: unknown }).server = {
        emit: vi.fn(),
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => {
            socketEmissions.push({ room, event, payload });
          },
        }),
      };

      const service = new IamService(
        prisma as never,
        jwtService as never,
        { get: vi.fn().mockReturnValue('15m') } as never,
        new AuditLogService(prisma as never),
        gateway,
      );

      // 1. Unknown username -> 401 without polluting audit logs
      await expect(
        service.login({ username: 'unknown_typo', password: 'WrongPassword!1' }),
      ).rejects.toMatchObject({ status: 401 });
      expect(recordedAuditRows).toHaveLength(0);

      // 2. Existing active account with wrong password -> 401 + LOGIN_FAILED audit row
      await expect(
        service.login(
          { username: 'thungan', password: 'WrongPassword!1' },
          { ipAddress: '203.113.10.5', deviceLabel: 'Android · Chrome', userAgent: 'Chrome/131' },
        ),
      ).rejects.toMatchObject({ status: 401, response: { code: ErrorCodes.AUTH_CREDENTIALS_INVALID } });

      // 3. Disabled account login attempt -> 401 + LOGIN_FAILED (ACCOUNT_DISABLED) audit row
      await expect(
        service.login(
          { username: 'locked_staff', password: 'Admin@123' },
          { ipAddress: '203.113.10.6', deviceLabel: 'Windows · Edge', userAgent: 'Edg/131' },
        ),
      ).rejects.toMatchObject({ status: 401, response: { code: ErrorCodes.AUTH_CREDENTIALS_INVALID } });

      expect(recordedAuditRows).toHaveLength(2);
      expect(recordedAuditRows[0]).toMatchObject({
        module: 'RBAC',
        action: 'Đăng nhập thất bại',
        actorUsername: 'thungan',
        ipAddress: '203.113.10.5',
        deviceLabel: 'Android · Chrome',
        metadata: { targetUserId: 4, targetUsername: 'thungan', failureReason: 'INVALID_PASSWORD' },
      });
      expect(recordedAuditRows[1]).toMatchObject({
        module: 'RBAC',
        action: 'Đăng nhập thất bại',
        actorUsername: 'locked_staff',
        ipAddress: '203.113.10.6',
        deviceLabel: 'Windows · Edge',
        metadata: { targetUserId: 5, targetUsername: 'locked_staff', failureReason: 'ACCOUNT_DISABLED' },
      });

      const history4 = await service.getUserSessionHistory(4, 5);
      expect(history4.items[0]).toMatchObject({
        eventType: 'LOGIN_FAILED',
        actionLabel: 'Đăng nhập thất bại',
        ipAddress: '203.113.10.5',
      });

      // 4. Live permission update pushes SocketEvents.PERMISSIONS_UPDATED to SocketRooms.userAccount(4)
      const nextPerms = UserPermissionsSchema.parse({ pos: { view: true }, menu: { view: false } });
      await service.updateUserPermissions(
        4,
        { permissions: nextPerms },
        {
          id: 1,
          employeeId: 1,
          username: 'superadmin',
          isSuperAdmin: true,
          permissions: UserPermissionsSchema.parse({}),
        },
      );
      expect(socketEmissions).toContainEqual({
        room: SocketRooms.userAccount(4),
        event: SocketEvents.PERMISSIONS_UPDATED,
        payload: {
          userId: 4,
          permissions: nextPerms,
          updatedAt: expect.any(String),
        },
      });
    });
  });
});
