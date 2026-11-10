import { Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserPermissionsSchema } from '@fnb/shared';
import { IamController } from '../iam.controller';
import { IamService } from '../iam.service';
import { ProfileController } from '../profile.controller';
import { UsersController } from '../users.controller';
import { MdmController } from '../../mdm/mdm.controller';
import { MdmService } from '../../mdm/mdm.service';

describe('IAM and MDM HTTP integration', () => {
  const records = [{
    id: 7,
    category: 'INGREDIENT',
    name: 'Bún bò Huế',
    normalizedName: 'bun bo hue',
    metadata: {},
    isActive: true,
  }];
  const permissions = UserPermissionsSchema.parse({});
  const authUser = {
    id: 4,
    employeeId: 14,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions,
    employee: { fullName: 'Cashier One', shortName: 'C.One', avatarUrl: null, position: null, specialty: null },
    uiPreferences: { theme: 'system' as const, sidebarWidth: 260, columnWidths: {} },
  };
  const adminUser = {
    ...authUser,
    isActive: true,
    employee: { id: authUser.employeeId, ...authUser.employee },
  };
  const profile = {
    id: 4,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions,
    uiPreferences: authUser.uiPreferences,
    employee: {
      id: 14,
      fullName: 'Cashier One',
      shortName: 'C.One',
      phone: null,
      address: null,
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      avatarUrl: null,
      position: null,
      specialty: null,
    },
  };
  const loginResult = { accessToken: 'access', refreshToken: 'refresh-cookie', user: authUser };
  const verifyAsync = vi.fn(async (token: string) => {
    if (token === 'expired') {
      const error = new Error('expired');
      error.name = 'TokenExpiredError';
      throw error;
    }
    if (token === 'invalid') throw new Error('invalid signature');
    return { sub: token === 'superadmin' ? 1 : 4, tokenType: 'access' };
  });
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        employeeId: where.id + 10,
        username: where.id === 1 ? 'superadmin' : 'cashier01',
        isSuperAdmin: where.id === 1,
        permissions: {},
        isActive: true,
      })),
    },
  };
  const mdmService = {
    lookup: vi.fn(async () => records),
    list: vi.fn(async () => records),
    findOrCreate: vi.fn(async () => records[0]),
    update: vi.fn(async () => records[0]),
    softDisable: vi.fn(async () => records[0]),
  };
  const iamService = {
    login: vi.fn(async () => loginResult),
    refreshAccessToken: vi.fn(async () => loginResult),
    listUsers: vi.fn(async () => ({ page: 1, limit: 50, total: 1, items: [adminUser] })),
    createUser: vi.fn(async () => adminUser),
    updateUserPermissions: vi.fn(async () => adminUser),
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => profile),
    updateUiPreferences: vi.fn(async () => authUser.uiPreferences),
    changePassword: vi.fn(async () => ({ message: 'Đổi mật khẩu thành công' })),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class IntegrationModule {}
    Module({
      controllers: [IamController, UsersController, ProfileController, MdmController],
      providers: [
        { provide: ConfigService, useValue: { get: (key: string) => key === 'jwtRefreshExpiresIn' ? '7d' : 'test' } },
        { provide: JwtService, useValue: { verifyAsync } },
        { provide: PrismaService, useValue: prisma },
        { provide: MdmService, useValue: mdmService },
        { provide: IamService, useValue: iamService },
        { provide: JwtAuthGuard, useFactory: (jwt: JwtService, db: PrismaService) => new JwtAuthGuard(jwt, db), inject: [JwtService, PrismaService] },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(IntegrationModule);

    app = await NestFactory.create(IntegrationModule, { logger: false });
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 401 with the specific auth code when the token is missing, expired, or invalid', async () => {
    const cases = [
      { authorization: undefined, code: 'AUTH_TOKEN_MISSING' },
      { authorization: 'Bearer expired', code: 'AUTH_TOKEN_EXPIRED' },
      { authorization: 'Bearer invalid', code: 'AUTH_TOKEN_INVALID' },
    ];

    for (const testCase of cases) {
      const response = await fetch(`${baseUrl}/api/v1/mdm/lookup?category=INGREDIENT`, {
        headers: testCase.authorization ? { authorization: testCase.authorization } : {},
      });
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: testCase.code });
    }
  });

  it('returns 403 for an authenticated cashier on MDM administration and account permissions routes', async () => {
    const headers = { authorization: 'Bearer cashier', 'content-type': 'application/json' };
    const createMdmResponse = await fetch(`${baseUrl}/api/v1/mdm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ category: 'INGREDIENT', name: 'Bún bò Huế' }),
    });
    const updateUserResponse = await fetch(`${baseUrl}/api/v1/users/1/permissions`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ isActive: false }),
    });

    expect(createMdmResponse.status).toBe(403);
    await expect(createMdmResponse.json()).resolves.toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
    expect(updateUserResponse.status).toBe(403);
    await expect(updateUserResponse.json()).resolves.toMatchObject({ code: 'RBAC_SUPER_ADMIN_REQUIRED' });
  });

  it('allows authenticated cashiers to use MDM lookup while denying the management list', async () => {
    const headers = { authorization: 'Bearer cashier' };
    const lookupResponse = await fetch(`${baseUrl}/api/v1/mdm/lookup?category=INGREDIENT`, { headers });
    const listResponse = await fetch(`${baseUrl}/api/v1/mdm?category=INGREDIENT`, { headers });

    expect(lookupResponse.status).toBe(200);
    await expect(lookupResponse.json()).resolves.toEqual(records);
    expect(listResponse.status).toBe(403);
    await expect(listResponse.json()).resolves.toMatchObject({ code: 'RBAC_PERMISSION_DENIED' });
  });

  it('allows a super-admin through permission-protected MDM administration routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/mdm?category=INGREDIENT`, {
      headers: { authorization: 'Bearer superadmin' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(records);
  });

  it('serves login, refresh, and logout with the refresh token kept in an HTTP-only cookie', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'cashier01', password: 'Password@123' }),
    });
    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toEqual({ accessToken: 'access', user: authUser });
    expect(loginResponse.headers.get('set-cookie')).toContain('refreshToken=refresh-cookie');
    expect(loginResponse.headers.get('set-cookie')?.toLowerCase()).toContain('httponly');

    const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: 'refreshToken=refresh-cookie' },
    });
    expect(refreshResponse.status).toBe(200);
    await expect(refreshResponse.json()).resolves.toEqual({ accessToken: 'access', user: authUser });
    expect(iamService.refreshAccessToken).toHaveBeenCalledWith('refresh-cookie');

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST' });
    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers.get('set-cookie')).toContain('refreshToken=;');
  });

  it('serves all authenticated profile routes and forwards the authenticated user id', async () => {
    const headers = { authorization: 'Bearer cashier', 'content-type': 'application/json' };
    const getResponse = await fetch(`${baseUrl}/api/v1/profile`, { headers });
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(profile);

    const updateResponse = await fetch(`${baseUrl}/api/v1/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ bankName: 'ACB', phone: '0911', address: 'New address' }),
    });
    expect(updateResponse.status).toBe(200);
    expect(iamService.updateProfile).toHaveBeenCalledWith(4, { bankName: 'ACB', phone: '0911', address: 'New address' });

    const preferencesResponse = await fetch(`${baseUrl}/api/v1/profile/ui-prefs`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ theme: 'dark', sidebarWidth: 300 }),
    });
    expect(preferencesResponse.status).toBe(200);
    await expect(preferencesResponse.json()).resolves.toEqual({ theme: 'system', sidebarWidth: 260, columnWidths: {} });
    expect(iamService.updateUiPreferences).toHaveBeenCalledWith(4, { theme: 'dark', sidebarWidth: 300 });

    const passwordResponse = await fetch(`${baseUrl}/api/v1/profile/password`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        currentPassword: 'current-pass',
        newPassword: 'new-pass-123',
        confirmPassword: 'new-pass-123',
      }),
    });
    expect(passwordResponse.status).toBe(200);
    await expect(passwordResponse.json()).resolves.toEqual({ message: 'Đổi mật khẩu thành công' });
    expect(iamService.changePassword).toHaveBeenCalledWith(4, {
      currentPassword: 'current-pass',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    });
  });

  it('serves all user administration routes to a super-admin', async () => {
    const headers = { authorization: 'Bearer superadmin', 'content-type': 'application/json' };
    const listResponse = await fetch(`${baseUrl}/api/v1/users?page=2&limit=10&keyword=Anh`, { headers });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ page: 1, limit: 50, total: 1, items: [adminUser] });
    expect(iamService.listUsers).toHaveBeenCalledWith({ page: 2, limit: 10, keyword: 'Anh' });

    const createResponse = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ employeeId: 14, username: 'newcashier', password: 'Password@123' }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(adminUser);

    const updateResponse = await fetch(`${baseUrl}/api/v1/users/4/permissions`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ isActive: false }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual(adminUser);
  });

  it('serves MDM create, update, and disable routes to a super-admin', async () => {
    const headers = { authorization: 'Bearer superadmin', 'content-type': 'application/json' };
    const createResponse = await fetch(`${baseUrl}/api/v1/mdm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ category: 'INGREDIENT', name: 'Bún bò Huế' }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(records[0]);

    const updateResponse = await fetch(`${baseUrl}/api/v1/mdm/7`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'Bún bò Huế' }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual(records[0]);

    const disableResponse = await fetch(`${baseUrl}/api/v1/mdm/7`, { method: 'DELETE', headers });
    expect(disableResponse.status).toBe(200);
    await expect(disableResponse.json()).resolves.toEqual(records[0]);
  });
});
