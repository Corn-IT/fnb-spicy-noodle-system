import { Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCodes, UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IamController } from '../iam.controller';
import { IamService } from '../iam.service';
import { ProfileController } from '../profile.controller';
import { PublicAvatarController } from '../public-avatar.controller';
import { UsersController } from '../users.controller';

describe('IAM Controllers (Auth, Users redaction, PublicAvatar)', () => {
  const iamService = {
    login: vi.fn(async () => ({
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      user: { id: 1, username: 'admin', isSuperAdmin: true },
    })),
    refreshAccessToken: vi.fn(async () => ({
      accessToken: 'acc-2',
      refreshToken: 'ref-2',
      user: { id: 1, username: 'admin', isSuperAdmin: true },
    })),
    logout: vi.fn(async () => undefined),
    getProfile: vi.fn(async (userId: number) => ({ id: userId, username: 'admin' })),
    updateProfile: vi.fn(async (userId: number, body: Record<string, unknown>) => ({ id: userId, ...body })),
    uploadMyAvatar: vi.fn(async (userId: number) => ({ id: userId, avatarUrl: '/api/v1/public/avatars/1?v=1' })),
    deleteMyAvatar: vi.fn(async (userId: number) => ({ id: userId, avatarUrl: null })),
    updateUiPreferences: vi.fn(async (userId: number, body: Record<string, unknown>) => ({ id: userId, uiPreferences: body })),
    changePassword: vi.fn(async () => ({
      accessToken: 'acc-pw',
      refreshToken: 'ref-pw',
      user: { id: 1, username: 'admin' },
      message: 'Đổi mật khẩu thành công',
    })),
    listUsers: vi.fn(async () => ({
      page: 1,
      limit: 20,
      total: 1,
      items: [
        {
          id: 2,
          username: 'thungan',
          session: {
            isOnline: true,
            ipAddress: '10.0.0.5',
            deviceLabel: 'Chrome macOS',
            startedAt: '2026-11-27T10:00:00.000Z',
          },
        },
      ],
    })),
    createUser: vi.fn(async (body: Record<string, unknown>) => ({ id: 9, ...body })),
    updateUserAccount: vi.fn(async (id: number, body: Record<string, unknown>) => ({ id, ...body })),
    updateUserPermissions: vi.fn(async (id: number) => ({ id })),
    resetUserPassword: vi.fn(async (id: number) => ({ id, reset: true })),
    getUserSessionHistory: vi.fn(async (id: number, limit: number) => ({ userId: id, limit, events: [] })),
    getPublicAvatarBinary: vi.fn(async () => ({
      mime: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71]),
    })),
  };

  let mockPrincipal = {
    id: 1,
    employeeId: 1,
    username: 'admin',
    isSuperAdmin: true,
    isActive: true,
    activeSessionId: 'sid-123',
    lastRevokedNotice: null,
    permissions: UserPermissionsSchema.parse({ rbac: { view: true } }),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class IamCtrlTestModule {}
    Module({
      controllers: [IamController, ProfileController, UsersController, PublicAvatarController],
      providers: [
        { provide: IamService, useValue: iamService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) =>
              key === 'nodeEnv' ? 'test' : key === 'jwtRefreshExpiresIn' ? '7d' : undefined,
            ),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: vi.fn(async (token: string) => {
              if (token === 'bad-token') throw new Error('invalid');
              return { sub: 1, sid: 'sid-123', tokenType: 'access' };
            }),
          },
        },
        { provide: PrismaService, useValue: { user: { findUnique: async () => mockPrincipal } } },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(IamCtrlTestModule);

    app = await NestFactory.create(IamCtrlTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => app?.close());

  it('streams public avatar binary with cache and nosniff headers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/avatars/5`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toContain('immutable');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
  });

  it('handles refresh 401 when missing token and extracts session info on logout', async () => {
    const missingRefresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingRefresh.status).toBe(401);
    await expect(missingRefresh.json()).resolves.toMatchObject({ code: ErrorCodes.AUTH_TOKEN_MISSING });

    const okRefresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'r-body' }),
    });
    expect(okRefresh.status).toBe(200);

    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer good-bearer-token',
      },
    });
    expect(logoutRes.status).toBe(204);
    expect(iamService.logout).toHaveBeenCalledWith(
      { userId: 1, sessionId: 'sid-123' },
      expect.any(Object),
    );
  });

  it('redacts sensitive session fields for non-SuperAdmin in UsersController.list and guards SuperAdmin routes', async () => {
    const prev = mockPrincipal;
    try {
      const adminList = await fetch(`${baseUrl}/api/v1/users?page=1&limit=20`, {
        headers: { authorization: 'Bearer tok' },
      });
      expect(adminList.status).toBe(200);
      await expect(adminList.json()).resolves.toMatchObject({
        items: [{ session: { ipAddress: '10.0.0.5', deviceLabel: 'Chrome macOS' } }],
      });

      mockPrincipal = {
        ...prev,
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ rbac: { view: true } }),
      };
      const viewerList = await fetch(`${baseUrl}/api/v1/users?page=1&limit=20`, {
        headers: { authorization: 'Bearer tok' },
      });
      expect(viewerList.status).toBe(200);
      await expect(viewerList.json()).resolves.toMatchObject({
        items: [{ session: { isOnline: true, ipAddress: null, deviceLabel: null, startedAt: null } }],
      });

      const deniedHistory = await fetch(`${baseUrl}/api/v1/users/2/session-history`, {
        headers: { authorization: 'Bearer tok' },
      });
      expect(deniedHistory.status).toBe(403);

      mockPrincipal = prev;
      const adminHistory = await fetch(`${baseUrl}/api/v1/users/2/session-history?limit=10`, {
        headers: { authorization: 'Bearer tok' },
      });
      expect(adminHistory.status).toBe(200);
      expect(iamService.getUserSessionHistory).toHaveBeenCalledWith(2, 10);
    } finally {
      mockPrincipal = prev;
    }
  });

  it('routes ProfileController endpoints (/profile, avatar, ui-prefs, password) and handles sessionless changePassword', async () => {
    const getProf = await fetch(`${baseUrl}/api/v1/profile`, { headers: { authorization: 'Bearer tok' } });
    expect(getProf.status).toBe(200);

    const putProf = await fetch(`${baseUrl}/api/v1/profile`, {
      method: 'PUT',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: 'Nguyễn Văn A' }),
    });
    expect(putProf.status).toBe(200);

    const putAvatar = await fetch(`${baseUrl}/api/v1/profile/avatar`, {
      method: 'PUT',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify({ mime: 'image/png', base64: 'iVBORw0KGgo=' }),
    });
    expect(putAvatar.status).toBe(200);

    const delAvatar = await fetch(`${baseUrl}/api/v1/profile/avatar`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer tok' },
    });
    expect(delAvatar.status).toBe(200);

    const patchUi = await fetch(`${baseUrl}/api/v1/profile/ui-prefs`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'dark', sidebarCollapsed: true }),
    });
    expect(patchUi.status).toBe(200);

    const patchPw = await fetch(`${baseUrl}/api/v1/profile/password`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'oldPassword1',
        newPassword: 'newPassword2',
        confirmPassword: 'newPassword2',
      }),
    });
    expect(patchPw.status).toBe(200);
    await expect(patchPw.json()).resolves.toMatchObject({ accessToken: 'acc-pw', message: 'Đổi mật khẩu thành công' });
    expect(patchPw.headers.get('set-cookie')).toContain('refreshToken=ref-pw');

    // Direct controller check for changePassword without sessionId / without accessToken response
    const messageOnlyIam = { changePassword: vi.fn(async () => ({ message: 'Đã cập nhật mật khẩu' })) };
    const ctrl = new ProfileController(messageOnlyIam as never, { get: vi.fn(() => 'test') } as never);
    const msgRes = await ctrl.changePassword(
      { id: 5, employeeId: 5, username: 'u5', isSuperAdmin: false, permissions: UserPermissionsSchema.parse({}) },
      { currentPassword: 'oldPassword1', newPassword: 'newPassword2', confirmPassword: 'newPassword2' },
      { cookie: vi.fn() } as never,
      undefined,
    );
    expect(msgRes).toEqual({ message: 'Đã cập nhật mật khẩu' });
    expect(messageOnlyIam.changePassword).toHaveBeenCalledWith(5, expect.any(Object));
  });
});
