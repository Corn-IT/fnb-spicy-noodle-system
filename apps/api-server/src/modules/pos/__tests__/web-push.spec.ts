import { createECDH, randomBytes } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QR_REMINDER_CONFIG,
  UserPermissionsSchema,
  WEB_PUSH_VAPID_NORMALIZED_NAME,
  WebPushNotificationKind,
  type UserPermissions,
} from '@fnb/shared';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IamService } from '../../iam/iam.service';
import { PosPushController } from '../pos-push.controller';
import { PosService } from '../pos.service';
import { QrAutoCancelService } from '../qr-auto-cancel.service';
import {
  buildVapidAuthorizationHeader,
  decodeBase64Url,
  decryptWebPushPayload,
  encodeBase64Url,
  encryptWebPushPayload,
  generateVapidKeyPair,
  verifyVapidJwt,
} from '../web-push-crypto.util';
import { WebPushService } from '../web-push.service';

function makePermissions(posView: boolean): UserPermissions {
  return UserPermissionsSchema.parse({
    pos: { view: posView, create: posView, update: posView },
  });
}

describe('web-push-crypto.util (RFC 8291 aes128gcm & RFC 8292 VAPID ES256)', () => {
  it('should match the official RFC 8291 Appendix A test vector byte-for-byte', () => {
    // Official RFC 8291 Appendix A test vector values
    const uaPublicB64 =
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
    const uaPrivateB64 = 'q1dXQv3LfT5V41-s50x_7R4n4C5c1Q2a5g8h9j0k1l2'; // unused for encrypt; verified with custom roundtrip below
    void uaPrivateB64;
    const asPrivate = decodeBase64Url('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
    const authB64 = 'BTBZMqHH6r4Tts7J_aSIgg';
    const salt = decodeBase64Url('DGv6ra1nlYgDCS1FRnbzlw');
    const plaintext = 'When I grow up, I want to be a watermelon';

    const encrypted = encryptWebPushPayload({
      payload: plaintext,
      p256dh: uaPublicB64,
      auth: authB64,
      salt,
      serverPrivateKey: asPrivate,
    });

    // Expected RFC 8291 Appendix A output (header + ciphertext)
    const expectedB64 =
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
    expect(encodeBase64Url(encrypted.body)).toBe(expectedB64);
  });

  it('should encrypt and decrypt Vietnamese UTF-8 order JSON payload round-trip cleanly', () => {
    const uaEcdh = createECDH('prime256v1');
    uaEcdh.generateKeys();
    const p256dh = encodeBase64Url(uaEcdh.getPublicKey());
    const auth = encodeBase64Url(randomBytes(16));

    const payloadJson = JSON.stringify({
      kind: WebPushNotificationKind.QR_NEW,
      title: 'Đơn QR mới · Bàn 05',
      body: 'Bàn 05 vừa gửi đơn mới (HD-20261124-0008). Chạm để mở quầy POS.',
      url: '/pos?orderId=88',
    });

    const encrypted = encryptWebPushPayload({
      payload: payloadJson,
      p256dh,
      auth,
    });

    const decrypted = decryptWebPushPayload({
      body: encrypted.body,
      uaPrivateKey: uaEcdh.getPrivateKey(),
      auth,
    });

    expect(decrypted.toString('utf8')).toBe(payloadJson);
  });

  it('should generate valid P-256 VAPID keys and sign verifiable ES256 RFC 8292 JWT headers', () => {
    const keys = generateVapidKeyPair();
    expect(decodeBase64Url(keys.publicKey).length).toBe(65);
    expect(decodeBase64Url(keys.privateKey).length).toBe(32);

    const header = buildVapidAuthorizationHeader({
      endpoint: 'https://web.push.apple.com/QABCD1234',
      subject: 'mailto:pos@example.com',
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      nowSeconds: 1_700_000_000,
      expirationSeconds: 3600,
    });

    expect(header.startsWith('vapid t=')).toBe(true);
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const jwt = match![1]!;
    const pubKey = match![2]!;
    expect(pubKey).toBe(keys.publicKey);
    expect(verifyVapidJwt(jwt, pubKey)).toBe(true);

    const payload = JSON.parse(decodeBase64Url(jwt.split('.')[1]!).toString('utf8')) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(payload).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1_700_003_600,
      sub: 'mailto:pos@example.com',
    });
  });
});

describe('WebPushService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FNB_VAPID_PUBLIC_KEY;
    delete process.env.FNB_VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should auto-generate and persist zero-config VAPID keys in master_data when env vars are absent', async () => {
    let storedRow: { metadata: Record<string, unknown> } | null = null;
    const prisma = {
      masterData: {
        findUnique: vi.fn(async () => storedRow),
        create: vi.fn(async ({ data }: { data: { metadata: Record<string, unknown>; normalizedName: string } }) => {
          expect(data.normalizedName).toBe(WEB_PUSH_VAPID_NORMALIZED_NAME);
          storedRow = { metadata: data.metadata };
          return storedRow;
        }),
      },
    };

    const svc1 = new WebPushService(prisma as never);
    const key1 = await svc1.getPublicKey();
    expect(decodeBase64Url(key1).length).toBe(65);
    expect(prisma.masterData.create).toHaveBeenCalledTimes(1);

    // Second service instance (e.g. after server restart) loads the exact same persisted keypair
    const svc2 = new WebPushService(prisma as never);
    const key2 = await svc2.getPublicKey();
    expect(key2).toBe(key1);
    expect(prisma.masterData.create).toHaveBeenCalledTimes(1);
  });

  it('should deliver encrypted push ONLY to active single-session POS staff and prune stale, unauthorized, or 410 endpoints', async () => {
    const validKeypair = createECDH('prime256v1');
    validKeypair.generateKeys();
    const p256dh = encodeBase64Url(validKeypair.getPublicKey());
    const auth = encodeBase64Url(randomBytes(16));

    const subscriptions = [
      // 1. Eligible cashier with matching active session -> DELIVERED (201)
      {
        id: 1,
        userId: 10,
        sessionId: 'sid-cashier-live',
        endpoint: 'https://fcm.googleapis.com/fcm/send/live-device',
        p256dh,
        auth,
        user: {
          id: 10,
          isActive: true,
          isSuperAdmin: false,
          permissions: makePermissions(true),
          activeSessionId: 'sid-cashier-live',
        },
      },
      // 2. Eligible superadmin whose endpoint is expired -> PRUNED (410 Gone)
      {
        id: 2,
        userId: 1,
        sessionId: 'sid-admin-live',
        endpoint: 'https://web.push.apple.com/expired-endpoint',
        p256dh,
        auth,
        user: {
          id: 1,
          isActive: true,
          isSuperAdmin: true,
          permissions: makePermissions(false),
          activeSessionId: 'sid-admin-live',
        },
      },
      // 3. Stale session (replaced by NEW_LOGIN on another phone) -> SKIPPED & PRUNED
      {
        id: 3,
        userId: 11,
        sessionId: 'sid-old-phone',
        endpoint: 'https://fcm.googleapis.com/fcm/send/old-phone',
        p256dh,
        auth,
        user: {
          id: 11,
          isActive: true,
          isSuperAdmin: false,
          permissions: makePermissions(true),
          activeSessionId: 'sid-new-phone',
        },
      },
      // 4. Logged out user (activeSessionId = null) -> SKIPPED & PRUNED
      {
        id: 4,
        userId: 12,
        sessionId: 'sid-logged-out',
        endpoint: 'https://fcm.googleapis.com/fcm/send/logged-out',
        p256dh,
        auth,
        user: {
          id: 12,
          isActive: true,
          isSuperAdmin: false,
          permissions: makePermissions(true),
          activeSessionId: null,
        },
      },
      // 5. Active staff WITHOUT pos:view permission -> SKIPPED & PRUNED
      {
        id: 5,
        userId: 13,
        sessionId: 'sid-warehouse',
        endpoint: 'https://fcm.googleapis.com/fcm/send/warehouse',
        p256dh,
        auth,
        user: {
          id: 13,
          isActive: true,
          isSuperAdmin: false,
          permissions: makePermissions(false),
          activeSessionId: 'sid-warehouse',
        },
      },
    ];

    const deletedIdBatches: number[][] = [];
    const updatedNotifiedIds: number[] = [];
    const prisma = {
      masterData: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
      },
      pushSubscription: {
        findMany: vi.fn(async () => subscriptions),
        deleteMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) => {
          deletedIdBatches.push(where.id.in);
          return { count: where.id.in.length };
        }),
        updateMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) => {
          updatedNotifiedIds.push(...where.id.in);
          return { count: where.id.in.length };
        }),
      },
    };

    const deliveredRequests: Array<{ url: string; headers: Record<string, string>; body: Buffer }> = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = Buffer.from(init?.body as Uint8Array);
      deliveredRequests.push({ url, headers, body });
      if (url.includes('expired-endpoint')) {
        return new Response('Gone', { status: 410 });
      }
      return new Response('', { status: 201 });
    });

    const service = new WebPushService(prisma as never, mockFetch as never);
    const summary = await service.notifyQrNewOrder({
      orderId: 42,
      orderCode: 'HD-20261124-0042',
      tableLabel: 'Bàn 05',
    });

    expect(summary).toEqual({
      attempted: 2,
      delivered: 1,
      pruned: 4, // 3 stale/unauthorized + 1 expired 410
      failed: 0,
    });
    expect(deletedIdBatches).toEqual([[3, 4, 5], [2]]);
    expect(updatedNotifiedIds).toEqual([1]);

    const liveReq = deliveredRequests.find((req) => req.url.includes('live-device'));
    expect(liveReq).toBeDefined();
    expect(liveReq!.headers['Content-Encoding']).toBe('aes128gcm');
    expect(liveReq!.headers.Urgency).toBe('high');
    expect(liveReq!.headers.TTL).toBe('90');
    expect(liveReq!.headers.Topic).toBe('qr-new-42');
    expect(liveReq!.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);

    const decrypted = JSON.parse(
      decryptWebPushPayload({
        body: liveReq!.body,
        uaPrivateKey: validKeypair.getPrivateKey(),
        auth,
      }).toString('utf8'),
    ) as { kind: string; title: string; url: string; orderId: number };
    expect(decrypted.kind).toBe(WebPushNotificationKind.QR_NEW);
    expect(decrypted.title).toContain('Bàn 05');
    expect(decrypted.url).toBe('/pos?orderId=42');
    expect(decrypted.orderId).toBe(42);
  });
});

describe('QrAutoCancelService.sweepOverdueQrPushReminders', () => {
  it('should trigger overdue Web Push reminders per stage for pending QR orders and addons without duplicates', async () => {
    const baseNow = new Date('2026-11-24T12:00:00.000Z');
    const sixMinAgo = new Date(baseNow.getTime() - 6 * 60_000);
    const twoMinAgo = new Date(baseNow.getTime() - 2 * 60_000);

    const prisma = {
      masterData: {
        findUnique: vi.fn(async () => ({
          isActive: true,
          metadata: {
            messages: {
              'pos.voice.reminderConfig': {
                title: 'rem=1|remDelay=5|remInt=60|remMax=2|autoCancel=1|autoCancelMin=12',
              },
            },
          },
        })),
      },
      order: {
        findMany: vi.fn(async () => [
          {
            id: 101,
            orderCode: 'HD-20261124-0101',
            orderType: 'DINE_IN',
            takeawayNumber: null,
            createdAt: sixMinAgo,
            table: { name: 'Bàn 05' },
          },
          {
            id: 102,
            orderCode: 'HD-20261124-0102',
            orderType: 'DINE_IN',
            takeawayNumber: null,
            createdAt: twoMinAgo, // Not overdue yet (< 5m)
            table: { name: 'Bàn 09' },
          },
        ]),
      },
      orderItem: {
        findMany: vi.fn(async () => [
          {
            orderId: 105,
            createdAt: sixMinAgo,
            order: {
              id: 105,
              orderCode: 'HD-20261124-0105',
              orderType: 'DINE_IN',
              takeawayNumber: null,
              table: { name: 'Bàn 12' },
            },
          },
        ]),
      },
    };

    const gateway = { emitTableGridSync: vi.fn(), emitQrAutoCancelled: vi.fn() };
    const notifyQrOverdueReminder = vi.fn(async () => ({
      attempted: 1,
      delivered: 1,
      pruned: 0,
      failed: 0,
    }));
    const webPushService = { notifyQrOverdueReminder };

    const service = new QrAutoCancelService(
      prisma as never,
      gateway as never,
      undefined,
      webPushService as never,
    );

    // Tick 1 at +6m -> reaches stage 2? Wait: delay=5m, int=60s -> at 6m00s elapsed = 360s, (360-300)/60 + 1 = stage 2.
    // Let's test at +5m10s first (stage 1), then +5m30s (no dup), then +6m15s (stage 2), then +7m30s (capped at maxReminders=2).
    const tStage1 = new Date(sixMinAgo.getTime() + 5 * 60_000 + 10_000);
    const firstDue = await service.sweepOverdueQrPushReminders(tStage1);
    expect(firstDue).toHaveLength(2);
    expect(firstDue.map((e) => `${e.tableLabel}:${e.kind}`)).toEqual(['Bàn 05:NEW', 'Bàn 12:ADDON']);
    expect(notifyQrOverdueReminder).toHaveBeenCalledTimes(1);

    // Tick 2 at +5m30s -> still stage 1, must NOT re-send
    const tSameStage = new Date(sixMinAgo.getTime() + 5 * 60_000 + 30_000);
    const secondDue = await service.sweepOverdueQrPushReminders(tSameStage);
    expect(secondDue).toHaveLength(0);
    expect(notifyQrOverdueReminder).toHaveBeenCalledTimes(1);

    // Tick 3 at +6m15s -> stage 2 reached, fires 2nd reminder
    const tStage2 = new Date(sixMinAgo.getTime() + 6 * 60_000 + 15_000);
    const thirdDue = await service.sweepOverdueQrPushReminders(tStage2);
    expect(thirdDue).toHaveLength(2);
    expect(notifyQrOverdueReminder).toHaveBeenCalledTimes(2);

    // Tick 4 at +7m30s -> maxReminders=2 already sent, must NOT fire again
    const tBeyondMax = new Date(sixMinAgo.getTime() + 7 * 60_000 + 30_000);
    const fourthDue = await service.sweepOverdueQrPushReminders(tBeyondMax);
    expect(fourthDue).toHaveLength(0);
    expect(notifyQrOverdueReminder).toHaveBeenCalledTimes(2);
  });

  it('should skip overdue push sweep cleanly when reminderEnabled is false', async () => {
    const prisma = {
      masterData: {
        findUnique: vi.fn(async () => ({
          isActive: true,
          metadata: {
            messages: {
              'pos.voice.reminderConfig': {
                title: `rem=0|remDelay=${DEFAULT_QR_REMINDER_CONFIG.reminderDelayMinutes}`,
              },
            },
          },
        })),
      },
      order: { findMany: vi.fn() },
      orderItem: { findMany: vi.fn() },
    };
    const webPushService = { notifyQrOverdueReminder: vi.fn() };
    const service = new QrAutoCancelService(
      prisma as never,
      {} as never,
      undefined,
      webPushService as never,
    );

    const result = await service.sweepOverdueQrPushReminders(new Date());
    expect(result).toEqual([]);
    expect(webPushService.notifyQrOverdueReminder).not.toHaveBeenCalled();
  });
});

describe('PosPushController HTTP integration (RBAC 401/403 & Zod validation)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwtService = new JwtService({ secret: 'test-jwt-secret-for-web-push-controller-integration-tests-0123456789' });

  const users = new Map<
    number,
    {
      id: number;
      employeeId: number;
      username: string;
      isSuperAdmin: boolean;
      permissions: unknown;
      isActive: boolean;
      activeSessionId: string | null;
      lastRevokedNotice: unknown;
    }
  >([
    [
      10,
      {
        id: 10,
        employeeId: 10,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: makePermissions(true),
        isActive: true,
        activeSessionId: 'sid-c1',
        lastRevokedNotice: null,
      },
    ],
    [
      20,
      {
        id: 20,
        employeeId: 20,
        username: 'warehouse01',
        isSuperAdmin: false,
        permissions: makePermissions(false),
        isActive: true,
        activeSessionId: 'sid-w1',
        lastRevokedNotice: null,
      },
    ],
  ]);

  const storedSubs = new Map<string, { userId: number; sessionId: string | null; endpoint: string }>();
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => users.get(where.id) ?? null),
    },
    masterData: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    pushSubscription: {
      upsert: vi.fn(async ({ create }: { create: { userId: number; sessionId: string | null; endpoint: string } }) => {
        storedSubs.set(create.endpoint, create);
        return create;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { userId: number; endpoint?: string; NOT?: { sessionId?: string } } }) => {
        let count = 0;
        for (const [ep, row] of storedSubs.entries()) {
          if (row.userId !== where.userId) continue;
          if (where.endpoint && ep !== where.endpoint) continue;
          if (where.NOT?.sessionId && row.sessionId === where.NOT.sessionId) continue;
          storedSubs.delete(ep);
          count += 1;
        }
        return { count };
      }),
      count: vi.fn(async ({ where }: { where: { userId: number } }) => {
        let count = 0;
        for (const row of storedSubs.values()) {
          if (row.userId === where.userId) count += 1;
        }
        return count;
      }),
      findFirst: vi.fn(async ({ where }: { where: { userId: number; endpoint?: string } }) => {
        if (!where.endpoint) return null;
        const found = storedSubs.get(where.endpoint);
        return found && found.userId === where.userId ? { id: 1 } : null;
      }),
    },
  };

  beforeEach(async () => {
    storedSubs.clear();
    class TestPosPushModule {}
    Module({
      controllers: [PosPushController],
      providers: [
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: WebPushService, useFactory: () => new WebPushService(prisma as never) },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, db: PrismaService) => new JwtAuthGuard(jwt, db),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(TestPosPushModule);

    app = await NestFactory.create(TestPosPushModule, { logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 401 Unauthorized when missing JWT and 403 Forbidden when user lacks pos:view (Invariant 8)', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/v1/pos/push/vapid-public-key`);
    expect(unauthRes.status).toBe(401);

    const warehouseToken = await jwtService.signAsync({
      sub: 20,
      tokenType: 'access',
      sid: 'sid-w1',
    });
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/pos/push/vapid-public-key`, {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it('should allow pos:view staff to fetch VAPID key, reject non-HTTPS endpoint, register and unregister push subscription', async () => {
    const cashierToken = await jwtService.signAsync({
      sub: 10,
      tokenType: 'access',
      sid: 'sid-c1',
    });
    const authHeaders = { Authorization: `Bearer ${cashierToken}` };

    const keyRes = await fetch(`${baseUrl}/api/v1/pos/push/vapid-public-key`, {
      headers: authHeaders,
    });
    expect(keyRes.status).toBe(200);
    const keyBody = (await keyRes.json()) as { publicKey: string };
    expect(decodeBase64Url(keyBody.publicKey).length).toBe(65);

    // Reject insecure http:// push endpoint
    const badRes = await fetch(`${baseUrl}/api/v1/pos/push/subscriptions`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'http://insecure.example.com/push',
        keys: { p256dh: 'A'.repeat(64), auth: 'B'.repeat(22) },
      }),
    });
    expect(badRes.status).toBe(422);

    // Register valid HTTPS endpoint
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device-xyz';
    const subRes = await fetch(`${baseUrl}/api/v1/pos/push/subscriptions`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        keys: { p256dh: 'A'.repeat(64), auth: 'B'.repeat(22) },
        deviceLabel: 'iPhone (iOS)',
      }),
    });
    expect(subRes.status).toBe(200);
    expect(await subRes.json()).toEqual({ subscribed: true, activeCount: 1 });

    // Self-test Push endpoint: rejects invalid delay (>15s) with 422 and schedules valid test push (200)
    const badTestRes = await fetch(`${baseUrl}/api/v1/pos/push/test`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delaySeconds: 99 }),
    });
    expect(badTestRes.status).toBe(422);

    const testPushRes = await fetch(`${baseUrl}/api/v1/pos/push/test`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delaySeconds: 5 }),
    });
    expect(testPushRes.status).toBe(200);
    expect(await testPushRes.json()).toEqual({
      scheduled: true,
      delaySeconds: 5,
      activeSubscriptions: 1,
    });

    // Unregister endpoint
    const delRes = await fetch(`${baseUrl}/api/v1/pos/push/subscriptions`, {
      method: 'DELETE',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ subscribed: false, activeCount: 0 });
  });
});

describe('End-to-end wiring: PosService QR order & IamService session revocation -> WebPush', () => {
  it('should trigger WebPushService.notifyQrNewOrder on QR order creation and never fail order if push rejects', async () => {
    const notifyQrNewOrder = vi.fn(async () => {
      throw new Error('Simulated push network outage');
    });
    const gateway = {
      emitQrNewOrder: vi.fn(),
      emitQrAddonOrder: vi.fn(),
      emitTableOrderNotice: vi.fn(),
      emitQrOrderNotice: vi.fn(),
    };

    const tx = {
      $queryRaw: vi.fn(async () => [{ id: 5 }]),
      $executeRaw: vi.fn(async () => 1),
      diningTable: {
        findUnique: vi.fn(async () => ({
          id: 5,
          name: 'Bàn 05',
          qrToken: '00000000-0000-4000-8000-000000000005',
          status: 'AVAILABLE',
          activeOrderId: null,
        })),
        update: vi.fn(async () => ({})),
      },
      order: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 88, orderCode: 'HD-20261124-0088' })),
      },
      product: {
        findMany: vi.fn(async () => [
          {
            id: 1,
            name: 'Mì Cay Hải Sản',
            price: { toNumber: () => 55000, add: (n: unknown) => n, mul: (n: unknown) => n },
            isAvailable: true,
            modifierGroups: [],
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    };
    const posService = new PosService(
      prisma as never,
      gateway as never,
      undefined as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      { notifyQrNewOrder } as never,
    );

    // Stub internal pricing/sequence helpers cleanly via spy on private/prototype methods isn't needed if product price is Prisma.Decimal
    const { Prisma } = await import('@prisma/client');
    tx.product.findMany = vi.fn(async () => [
      {
        id: 1,
        name: 'Mì Cay Hải Sản',
        price: new Prisma.Decimal(55000),
        isAvailable: true,
        modifierGroups: [],
      },
    ]) as never;

    const created = await posService.createQrOrder({
      qrToken: '00000000-0000-4000-8000-000000000005',
      items: [{ productId: 1, quantity: 1, modifiers: [], isTakeaway: false }],
    });

    expect(created.orderId).toBe(88);
    expect(gateway.emitQrNewOrder).toHaveBeenCalledTimes(1);
    expect(notifyQrNewOrder).toHaveBeenCalledWith({
      orderId: 88,
      orderCode: created.orderCode,
      tableLabel: 'Bàn 05',
    });
  });

  it('should delete push subscriptions when a user logs out or has their session revoked by admin', async () => {
    const deletePushCalls: unknown[] = [];
    const prisma = {
      user: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({
          id: 10,
          username: 'cashier01',
          isSuperAdmin: false,
          activeSessionId: 'sid-cashier-live',
          activeSessionIp: '10.0.0.5',
          activeSessionDevice: 'iPhone',
          employee: { fullName: 'Thu Ngân 01' },
        })),
        update: vi.fn(async () => ({})),
      },
      pushSubscription: {
        deleteMany: vi.fn(async (args: unknown) => {
          deletePushCalls.push(args);
          return { count: 1 };
        }),
      },
    };
    const gateway = { emitSessionRevoked: vi.fn() };
    const iamService = new IamService(
      prisma as never,
      {} as never,
      { get: () => '15m' } as never,
      undefined,
      gateway as never,
    );

    await iamService.logout({ userId: 10, sessionId: 'sid-cashier-live' });
    expect(deletePushCalls[0]).toEqual({
      where: { userId: 10, sessionId: 'sid-cashier-live' },
    });

    await iamService.revokeUserSession(10, {
      id: 1,
      employeeId: 1,
      username: 'superadmin',
      isSuperAdmin: true,
      permissions: makePermissions(true),
    });
    expect(deletePushCalls[1]).toEqual({
      where: { userId: 10 },
    });
  });

  it('should accurately report stillPending=true for unconfirmed QR orders/addons and false after kitchen print/approval', async () => {
    const orderMap = new Map<number, { id: number; status: string; orderSource: string }>([
      [1, { id: 1, status: 'PENDING', orderSource: 'QR_CODE' }],
      [2, { id: 2, status: 'SERVING', orderSource: 'QR_CODE' }],
      [3, { id: 3, status: 'PAID', orderSource: 'QR_CODE' }],
    ]);
    let hasUnprintedAddonForOrder2 = true;
    const prisma = {
      order: {
        findUnique: vi.fn(async ({ where }: { where: { id: number } }) => orderMap.get(where.id) ?? null),
      },
      orderItem: {
        findFirst: vi.fn(async ({ where }: { where: { orderId: number } }) =>
          where.orderId === 2 && hasUnprintedAddonForOrder2 ? { id: 500 } : null,
        ),
      },
    };
    const posService = new PosService(
      prisma as never,
      {} as never,
      undefined as never,
      {} as never,
      {} as never,
    );

    expect(await posService.checkQrOrderStillPending({ orderId: 1, kind: 'QR_NEW' })).toEqual({
      stillPending: true,
    });
    expect(await posService.checkQrOrderStillPending({ orderId: 2, kind: 'QR_NEW' })).toEqual({
      stillPending: false,
    });
    expect(await posService.checkQrOrderStillPending({ orderId: 3, kind: 'QR_NEW' })).toEqual({
      stillPending: false,
    });
    expect(
      await posService.checkQrOrderStillPending({ orderId: 2, kind: 'QR_ADDON', batchNo: 2 }),
    ).toEqual({ stillPending: true });

    // Once kitchen slip is printed for batch 2 -> stillPending flips to false!
    hasUnprintedAddonForOrder2 = false;
    expect(
      await posService.checkQrOrderStillPending({ orderId: 2, kind: 'QR_ADDON', batchNo: 2 }),
    ).toEqual({ stillPending: false });
  });
});
