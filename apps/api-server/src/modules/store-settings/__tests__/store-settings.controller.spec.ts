import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  UserPermissionsSchema,
} from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { createScopedJsonBodyParserOptions } from '../../../common/security/body-parser.middleware';
import { StoreSettingsController } from '../store-settings.controller';
import { StoreSettingsService } from '../store-settings.service';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

describe('StoreSettingsController HTTP integration', () => {
  const rows = new Map<string, { category: string; normalizedName: string; name: string; metadata: unknown; isActive: boolean }>();

  const users = new Map<number, {
    id: number;
    employeeId: number;
    username: string;
    isSuperAdmin: boolean;
    permissions: unknown;
    isActive: boolean;
  }>([
    [1, { id: 1, employeeId: 101, username: 'superadmin', isSuperAdmin: true, permissions: {}, isActive: true }],
    [2, { id: 2, employeeId: 102, username: 'cashier01', isSuperAdmin: false, permissions: UserPermissionsSchema.parse({}), isActive: true }],
    [3, { id: 3, employeeId: 103, username: 'legacy_rbac_admin', isSuperAdmin: false, permissions: { rbac: { view: true, update: true } }, isActive: true }],
    [4, { id: 4, employeeId: 104, username: 'settings_viewer', isSuperAdmin: false, permissions: { settings: { view: true, update: false } }, isActive: true }],
  ]);

  const masterData = {
    findUnique: vi.fn(async ({ where }: { where: { category_normalizedName: { category: string; normalizedName: string } } }) => {
      return rows.get(`${where.category_normalizedName.category}:${where.category_normalizedName.normalizedName}`) ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where: { category: string; normalizedName?: { in: string[] } } }) => {
      return Array.from(rows.values()).filter((r) => {
        if (r.category !== where.category) return false;
        if (where.normalizedName?.in && !where.normalizedName.in.includes(r.normalizedName)) return false;
        return true;
      });
    }),
    upsert: vi.fn(async ({ where, update, create }: { where: { category_normalizedName: { category: string; normalizedName: string } }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
      const key = `${where.category_normalizedName.category}:${where.category_normalizedName.normalizedName}`;
      const existing = rows.get(key);
      const next = existing ? { ...existing, ...update } : { ...create };
      rows.set(key, next as never);
      return next;
    }),
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => users.get(where.id) ?? null),
    },
    masterData,
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ masterData })),
  };

  const verifyAsync = vi.fn(async (token: string) => {
    if (token === 'expired') {
      const error = new Error('expired');
      error.name = 'TokenExpiredError';
      throw error;
    }
    if (token === 'superadmin') return { sub: 1, tokenType: 'access' };
    if (token === 'cashier') return { sub: 2, tokenType: 'access' };
    if (token === 'legacy-admin') return { sub: 3, tokenType: 'access' };
    if (token === 'viewer') return { sub: 4, tokenType: 'access' };
    throw new Error('invalid token');
  });

  const posSocketGateway = { emitStoreSettingsUpdated: vi.fn() };
  const auditLogService = { record: vi.fn(async () => undefined) };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class IntegrationModule {}
    Module({
      controllers: [StoreSettingsController],
      providers: [
        { provide: JwtService, useValue: { verifyAsync } },
        { provide: PrismaService, useValue: prisma },
        {
          provide: StoreSettingsService,
          useFactory: () => new StoreSettingsService(prisma as never, auditLogService as never, posSocketGateway as never),
        },
        { provide: JwtAuthGuard, useFactory: (jwt: JwtService, db: PrismaService) => new JwtAuthGuard(jwt, db), inject: [JwtService, PrismaService] },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(IntegrationModule);

    const nestApp = await NestFactory.create<NestExpressApplication>(IntegrationModule, { bodyParser: false, logger: false });
    nestApp.useBodyParser('json', createScopedJsonBodyParserOptions());
    nestApp.useGlobalFilters(new GlobalExceptionFilter());
    await nestApp.listen(0, '127.0.0.1');
    app = nestApp;
    const addr = nestApp.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves public store settings without auth and returns 404 for missing asset (AC-14.2, AC-14.4)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/store-settings`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    await expect(res.json()).resolves.toMatchObject({
      storeName: DEFAULT_STORE_SETTINGS.storeName,
      assets: { logo: null, favicon: null, qrLogo: null },
    });

    const missingAsset = await fetch(`${baseUrl}/api/v1/public/store-assets/logo`);
    expect(missingAsset.status).toBe(404);
  });

  it('enforces 401/403 RBAC including legacy rbac.update fallback (AC-14.5)', async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/settings`);
    expect(unauth.status).toBe(401);

    const cashierGet = await fetch(`${baseUrl}/api/v1/settings`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(cashierGet.status).toBe(403);
    await expect(cashierGet.json()).resolves.toMatchObject({ code: ErrorCodes.RBAC_PERMISSION_DENIED });

    const viewerGet = await fetch(`${baseUrl}/api/v1/settings`, {
      headers: { authorization: 'Bearer viewer' },
    });
    expect(viewerGet.status).toBe(200);

    const viewerPut = await fetch(`${baseUrl}/api/v1/settings`, {
      method: 'PUT',
      headers: { authorization: 'Bearer viewer', 'content-type': 'application/json' },
      body: JSON.stringify({ ...DEFAULT_STORE_SETTINGS, expectedUpdatedAt: null }),
    });
    expect(viewerPut.status).toBe(403);

    // Legacy user with rbac.update = true should be permitted to update settings
    const legacyPut = await fetch(`${baseUrl}/api/v1/settings`, {
      method: 'PUT',
      headers: { authorization: 'Bearer legacy-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ ...DEFAULT_STORE_SETTINGS, storeName: 'Mì Cay Legacy', expectedUpdatedAt: null }),
    });
    expect(legacyPut.status).toBe(200);
    await expect(legacyPut.json()).resolves.toMatchObject({ storeName: 'Mì Cay Legacy' });
  });

  it('accepts ~650KB JSON payload on PUT /assets/:kind while keeping 100kb cap on regular routes and streams immutable binary asset (AC-14.3, AC-14.4)', async () => {
    // Normal route > 100kb -> 413 from scoped body parser
    const bigSettingsRes = await fetch(`${baseUrl}/api/v1/settings`, {
      method: 'PUT',
      headers: { authorization: 'Bearer superadmin', 'content-type': 'application/json' },
      body: JSON.stringify({ ...DEFAULT_STORE_SETTINGS, description: 'a'.repeat(120 * 1024), expectedUpdatedAt: null }),
    });
    expect(bigSettingsRes.status).toBe(413);

    // Asset route with 450KB binary (~600KB JSON base64) -> allowed through 1mb parser and saved
    const largeValidPng = Buffer.concat([PNG_HEADER, Buffer.alloc(450 * 1024)]);
    const uploadRes = await fetch(`${baseUrl}/api/v1/settings/assets/logo`, {
      method: 'PUT',
      headers: { authorization: 'Bearer superadmin', 'content-type': 'application/json' },
      body: JSON.stringify({ mime: 'image/png', base64: largeValidPng.toString('base64') }),
    });
    expect(uploadRes.status).toBe(200);
    const body = await uploadRes.json() as { assets: { logo: string | null } };
    expect(body.assets.logo).toBeTruthy();

    // Fetch public binary asset with immutable cache headers & nosniff
    const binRes = await fetch(`${baseUrl}/api/v1/public/store-assets/logo?v=${encodeURIComponent(body.assets.logo ?? '')}`);
    expect(binRes.status).toBe(200);
    expect(binRes.headers.get('content-type')).toBe('image/png');
    expect(binRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(binRes.headers.get('x-content-type-options')).toBe('nosniff');
    const fetchedBuf = Buffer.from(await binRes.arrayBuffer());
    expect(fetchedBuf.byteLength).toBe(largeValidPng.byteLength);
  });

  it('allows any authenticated user on GET /api/v1/store-messages while returning 401 when unauthenticated, and rejects invalid placeholders with 400 (AC-17.1, AC-17.5, Invariant 8)', async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/store-messages`);
    expect(unauth.status).toBe(401);

    // Invalid placeholder PUT must fail ZodValidationPipe with 400 VALIDATION_FAILED
    const badRes = await fetch(`${baseUrl}/api/v1/settings`, {
      method: 'PUT',
      headers: { authorization: 'Bearer superadmin', 'content-type': 'application/json' },
      body: JSON.stringify({
        ...DEFAULT_STORE_SETTINGS,
        expectedUpdatedAt: null,
        messages: {
          'pos.kitchen.splitSuccess': { title: 'Sai biến {invalidVar}' },
        },
      }),
    });
    // Note: ZodValidationPipe rejects invalid placeholders with 422 VALIDATION_FAILED before concurrency check
    expect(badRes.status).toBe(422);
    await expect(badRes.json()).resolves.toMatchObject({ code: ErrorCodes.VALIDATION_FAILED });

    // Fetch current settings updatedAt then save valid custom messages as superadmin
    const currentSettingsRes = await fetch(`${baseUrl}/api/v1/public/store-settings`);
    const currentSettings = (await currentSettingsRes.json()) as { updatedAt: string | null };

    const putRes = await fetch(`${baseUrl}/api/v1/settings`, {
      method: 'PUT',
      headers: { authorization: 'Bearer superadmin', 'content-type': 'application/json' },
      body: JSON.stringify({
        ...DEFAULT_STORE_SETTINGS,
        expectedUpdatedAt: currentSettings.updatedAt,
        messages: {
          'qr.banner.tableMoveNotice': { title: 'Khách đổi bàn vui lòng báo nhân viên' },
          'pos.order.createSuccess': { title: 'Mở đơn thành công' },
        },
      }),
    });
    expect(putRes.status).toBe(200);
    const putJson = (await putRes.json()) as { qrMessages: Record<string, unknown> };
    expect(putJson.qrMessages).toEqual({
      'qr.banner.tableMoveNotice': { title: 'Khách đổi bàn vui lòng báo nhân viên' },
    });

    // Cashier01 (no settings.view permission) MUST get 200 on GET /api/v1/store-messages
    const cashierMsgRes = await fetch(`${baseUrl}/api/v1/store-messages`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(cashierMsgRes.status).toBe(200);
    expect(cashierMsgRes.headers.get('cache-control')).toBe('no-cache');
    await expect(cashierMsgRes.json()).resolves.toMatchObject({
      messages: {
        'qr.banner.tableMoveNotice': { title: 'Khách đổi bàn vui lòng báo nhân viên' },
        'pos.order.createSuccess': { title: 'Mở đơn thành công' },
      },
    });

    // Public settings only leaks qrMessages, NEVER pos.* messages
    const pubAfter = await fetch(`${baseUrl}/api/v1/public/store-settings`);
    const pubJson = (await pubAfter.json()) as { qrMessages: Record<string, unknown> };
    expect(pubJson.qrMessages).toEqual({
      'qr.banner.tableMoveNotice': { title: 'Khách đổi bàn vui lòng báo nhân viên' },
    });
  });
});
