import { ForbiddenException, HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { isAllowedCorsOrigin, parseAllowedCorsOrigins } from '../cors-origin.util';
import {
  QrSecurityService,
  calculateHaversineDistanceMeters,
  isWifiIpAllowed,
} from '../qr-security.service';
import { RateLimitGuard, extractClientIp } from '../rate-limit.guard';
import { redactSensitiveUrl, sanitizeAuditMetadata } from '../redact.util';
import { SecurityHeadersMiddleware } from '../security-headers.middleware';

function createMockHttpContext(overrides: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  ip?: string;
}): {
  context: ExecutionContext;
  headersWritten: Record<string, string>;
} {
  const headersWritten: Record<string, string> = {};
  const request = {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.url ?? '/api/v1/health',
    url: overrides.url ?? '/api/v1/health',
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
    ip: overrides.ip ?? '203.0.113.10',
    socket: { remoteAddress: overrides.ip ?? '203.0.113.10' },
  } as unknown as Request;

  const response = {
    setHeader: (name: string, value: string) => {
      headersWritten[name] = value;
    },
  } as unknown as Response;

  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, headersWritten };
}

describe('Security Hardening Utilities & Guards', () => {
  describe('cors-origin.util', () => {
    it('parses comma-separated origins cleanly', () => {
      expect(
        parseAllowedCorsOrigins('https://pos.micay.vn, https://qr.micay.vn/ , '),
      ).toEqual(['https://pos.micay.vn', 'https://qr.micay.vn']);
    });

    it('strictly enforces allowed origins in production and rejects unknown origins in all environments', () => {
      const allowed = ['https://pos.micay.vn'];

      expect(isAllowedCorsOrigin(undefined, allowed, 'production')).toBe(true);
      expect(isAllowedCorsOrigin('https://pos.micay.vn', allowed, 'production')).toBe(true);
      expect(isAllowedCorsOrigin('https://evil-attacker.com', allowed, 'production')).toBe(false);
      expect(isAllowedCorsOrigin('http://localhost:5173', allowed, 'production')).toBe(false);

      // Development allows localhost ports but still blocks arbitrary external origins
      expect(isAllowedCorsOrigin('http://localhost:5173', allowed, 'development')).toBe(true);
      expect(isAllowedCorsOrigin('https://evil-attacker.com', allowed, 'development')).toBe(false);
    });
  });

  describe('redact.util', () => {
    it('masks sensitive query parameters in logged URLs', () => {
      const rawUrl =
        '/api/v1/public/menu?table=1&token=514c58bf6700c34968bf7df8880488dd&qrToken=secret123';
      const redacted = redactSensitiveUrl(rawUrl);
      expect(redacted).toBe('/api/v1/public/menu?table=1&token=[REDACTED]&qrToken=[REDACTED]');
      expect(redacted).not.toContain('514c58bf6700c34968bf7df8880488dd');
      expect(redacted).not.toContain('secret123');
    });

    it('recursively strips sensitive fields from audit metadata', () => {
      const sanitized = sanitizeAuditMetadata({
        username: 'cashier01',
        password: 'PlaintextPassword!123',
        nested: {
          refreshToken: 'jwt-refresh-token',
          qrToken: 'table-qr-token',
          safeField: 'kept',
        },
      });

      expect(sanitized).toEqual({
        username: 'cashier01',
        password: '[REDACTED]',
        nested: {
          refreshToken: '[REDACTED]',
          qrToken: '[REDACTED]',
          safeField: 'kept',
        },
      });
    });
  });

  describe('SecurityHeadersMiddleware', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('applies anti-clickjacking, CSP, nosniff, Permissions-Policy, and HSTS in production', () => {
      process.env.NODE_ENV = 'production';
      const middleware = new SecurityHeadersMiddleware();
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
        },
      } as unknown as Response;
      const next = vi.fn();

      middleware.use({} as Request, res, next);

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['X-Robots-Tag']).toBe('noindex, nofollow, noarchive');
      expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['Cross-Origin-Resource-Policy']).toBe('same-site');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows cross-origin resource embedding for public store assets only', () => {
      const middleware = new SecurityHeadersMiddleware();
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
        },
      } as unknown as Response;
      const next = vi.fn();

      middleware.use({ path: '/api/v1/public/store-assets/logo' } as Request, res, next);

      expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('RateLimitGuard & Anti-Scraper Protection', () => {
    let guard: RateLimitGuard;

    beforeEach(() => {
      guard = new RateLimitGuard();
      guard.setForceEnabled(true);
    });

    it('extracts real client IP prioritizing CF-Connecting-IP and X-Forwarded-For', () => {
      const reqWithCf = {
        headers: {
          'cf-connecting-ip': '198.51.100.77',
          'x-forwarded-for': '198.51.100.88, 10.0.0.1',
        },
        ip: '127.0.0.1',
      } as unknown as Request;
      expect(extractClientIp(reqWithCf)).toBe('198.51.100.77');

      const reqWithXff = {
        headers: {
          'x-forwarded-for': '198.51.100.88, 10.0.0.1',
        },
        ip: '127.0.0.1',
      } as unknown as Request;
      expect(extractClientIp(reqWithXff)).toBe('198.51.100.88');
    });

    it('blocks automated scraper/scanner User-Agents on /api/v1/public/* with 403 Forbidden', () => {
      const { context } = createMockHttpContext({
        method: 'GET',
        url: '/api/v1/public/menu?table=1&token=abc',
        headers: { 'user-agent': 'sqlmap/1.7.2#stable (https://sqlmap.org)' },
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('enforces 8 login attempts per 5 minutes per (IP + username) without locking out other usernames on the same IP', () => {
      for (let i = 0; i < 8; i += 1) {
        const { context } = createMockHttpContext({
          method: 'POST',
          url: '/api/v1/auth/login',
          ip: '203.0.113.50',
          body: { username: 'victim_user', password: 'wrong' },
        });
        expect(guard.canActivate(context)).toBe(true);
      }

      // 9th attempt for victim_user from same IP -> 429 Too Many Requests
      const ninthAttempt = createMockHttpContext({
        method: 'POST',
        url: '/api/v1/auth/login',
        ip: '203.0.113.50',
        body: { username: 'victim_user', password: 'wrong' },
      });

      let caughtError: unknown;
      try {
        guard.canActivate(ninthAttempt.context);
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(ninthAttempt.headersWritten['Retry-After']).toBeDefined();

      // Different staff account on the same restaurant Wi-Fi IP can still log in
      const otherStaffAttempt = createMockHttpContext({
        method: 'POST',
        url: '/api/v1/auth/login',
        ip: '203.0.113.50',
        body: { username: 'cashier_legit', password: 'correct' },
      });
      expect(guard.canActivate(otherStaffAttempt.context)).toBe(true);
    });

    it('isolates /auth/refresh buckets per session cookie so multiple terminals on the same IP do not hit login lockout', () => {
      for (let i = 0; i < 12; i += 1) {
        const { context } = createMockHttpContext({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          ip: '203.0.113.70',
          headers: { cookie: `refreshToken=session-alpha-${i % 2 === 0 ? 'token-a-12345678' : 'token-b-87654321'}` },
        });
        expect(guard.canActivate(context)).toBe(true);
      }

      const loginCtx = createMockHttpContext({
        method: 'POST',
        url: '/api/v1/auth/login',
        ip: '203.0.113.70',
        body: { username: 'cashier_after_refresh', password: 'secret' },
      });
      expect(guard.canActivate(loginCtx.context)).toBe(true);
    });

    it('rate-limits QR order spam per table qrToken (6 req/min) while allowing other tables on shared restaurant Wi-Fi IP', () => {
      for (let i = 0; i < 6; i += 1) {
        const { context } = createMockHttpContext({
          method: 'POST',
          url: '/api/v1/public/orders/qr',
          ip: '198.51.100.25',
          body: { qrToken: 'table-01-token' },
        });
        expect(guard.canActivate(context)).toBe(true);
      }

      // 7th order submission in 1 minute for table-01-token -> 429
      const spamTable1 = createMockHttpContext({
        method: 'POST',
        url: '/api/v1/public/orders/qr',
        ip: '198.51.100.25',
        body: { qrToken: 'table-01-token' },
      });
      expect(() => guard.canActivate(spamTable1.context)).toThrow(HttpException);

      // Table 02 on the exact same shop Wi-Fi IP is unaffected
      const legitTable2 = createMockHttpContext({
        method: 'POST',
        url: '/api/v1/public/orders/qr',
        ip: '198.51.100.25',
        body: { qrToken: 'table-02-token' },
      });
      expect(guard.canActivate(legitTable2.context)).toBe(true);
    });

    it('enforces 8 password change attempts per 5 minutes per actor without blocking another user on the same IP', () => {
      for (let i = 0; i < 8; i += 1) {
        const { context } = createMockHttpContext({
          method: 'PATCH',
          url: '/api/v1/profile/password',
          ip: '198.51.100.25',
          headers: { authorization: 'Bearer user-token-aaa-0123456789abcdef' },
        });
        expect(guard.canActivate(context)).toBe(true);
      }

      const ninthAttempt = createMockHttpContext({
        method: 'PATCH',
        url: '/api/v1/profile/password',
        ip: '198.51.100.25',
        headers: { authorization: 'Bearer user-token-aaa-0123456789abcdef' },
      });
      expect(() => guard.canActivate(ninthAttempt.context)).toThrow(HttpException);
      expect(ninthAttempt.headersWritten['Retry-After']).toBeDefined();

      const otherUserOnSameIp = createMockHttpContext({
        method: 'PATCH',
        url: '/api/v1/profile/password',
        ip: '198.51.100.25',
        headers: { authorization: 'Bearer user-token-bbb-fedcba9876543210' },
      });
      expect(guard.canActivate(otherUserOnSameIp.context)).toBe(true);
    });

    it('bypasses non-HTTP contexts and prunes expired or overflow buckets cleanly', () => {
      const wsContext = { getType: () => 'ws' } as unknown as ExecutionContext;
      expect(guard.canActivate(wsContext)).toBe(true);

      // Seed buckets beyond cleanup threshold and ensure expired/oldest entries prune cleanly
      for (let i = 0; i < 65; i += 1) {
        const ctx = createMockHttpContext({
          method: 'GET',
          url: '/api/v1/public/menu',
          ip: `192.0.2.${i}`,
        });
        expect(guard.canActivate(ctx.context)).toBe(true);
      }
      expect(guard.getBucketCount()).toBeGreaterThan(0);

      // Simulate hitting sensitive list endpoint cap (60 req/min)
      for (let i = 0; i < 60; i += 1) {
        const ctx = createMockHttpContext({
          method: 'GET',
          url: '/api/v1/audit-logs',
          ip: '198.51.100.200',
          headers: { authorization: 'Bearer list-harvester-token-1234567890' },
        });
        expect(guard.canActivate(ctx.context)).toBe(true);
      }
      const blockedList = createMockHttpContext({
        method: 'GET',
        url: '/api/v1/audit-logs',
        ip: '198.51.100.200',
        headers: { authorization: 'Bearer list-harvester-token-1234567890' },
      });
      expect(() => guard.canActivate(blockedList.context)).toThrow(HttpException);

      guard.resetAll();
      expect(guard.getBucketCount()).toBe(0);
    });
  });

  describe('QrSecurityService (Wi-Fi Lock + GPS Geofencing)', () => {
    it('matches exact public Wi-Fi IPs and same /24 private LAN subnets in isWifiIpAllowed', () => {
      const config = {
        wifiProtectionEnabled: true,
        autoSyncPosIp: true,
        allowedWifiIps: ['113.161.50.100'],
        wifiSsid: 'Mi Cay Tran',
        wifiPassword: 'micay888',
        geoProtectionEnabled: false,
        shopLatitude: null,
        shopLongitude: null,
        geoRadiusMeters: 200,
      };

      expect(isWifiIpAllowed('113.161.50.100', config, null)).toBe(true);
      expect(isWifiIpAllowed('::ffff:192.168.1.45', config, '192.168.1.10')).toBe(true);
      expect(isWifiIpAllowed('203.0.113.99', config, '192.168.1.10')).toBe(false);
    });

    it('calculates Haversine distance accurately in meters', () => {
      // Same point -> 0m
      expect(calculateHaversineDistanceMeters(10.776889, 106.700806, 10.776889, 106.700806)).toBeLessThan(1);
      // ~50m apart
      const nearby = calculateHaversineDistanceMeters(10.776889, 106.700806, 10.7772, 106.7009);
      expect(nearby).toBeGreaterThan(20);
      expect(nearby).toBeLessThan(100);
    });

    it('enforces Mode 1 (Wi-Fi Lock) and Mode 2 (GPS Geofence Fallback) with runtime toggle', async () => {
      let storedMetadata: Record<string, unknown> | null = null;
      const mockPrisma = {
        masterData: {
          findUnique: vi.fn(async () =>
            storedMetadata ? { id: 1, metadata: storedMetadata } : null,
          ),
          upsert: vi.fn(async ({ create, update }: { create: { metadata: Record<string, unknown> }; update: { metadata: Record<string, unknown> } }) => {
            storedMetadata = update?.metadata ?? create?.metadata;
            return { id: 1, metadata: storedMetadata };
          }),
        },
      } as unknown as PrismaService;

      const service = new QrSecurityService(mockPrisma);

      // 1. Enable Mode 1 (Wi-Fi only) from shop POS IP 113.161.77.88
      await service.updateConfig(
        {
          wifiProtectionEnabled: true,
          autoSyncPosIp: true,
          allowedWifiIps: [],
          wifiSsid: 'Mi Cay POS Free',
          wifiPassword: '12345678',
          geoProtectionEnabled: false,
          shopLatitude: 10.776889,
          shopLongitude: 106.700806,
          geoRadiusMeters: 200,
        },
        '113.161.77.88',
        1,
      );

      // Guest on shop Wi-Fi (113.161.77.88) passes immediately
      await expect(
        service.verifyGuestQrAccess({ clientIp: '113.161.77.88' }),
      ).resolves.toBeUndefined();

      // Attacker at home on 4G (203.0.113.55) is blocked with QR_WIFI_REQUIRED
      await expect(
        service.verifyGuestQrAccess({ clientIp: '203.0.113.55' }),
      ).rejects.toThrow(ForbiddenException);

      // 2. Switch to Mode 2 (Wi-Fi down -> GPS Geofence within 200m)
      await service.updateConfig(
        {
          wifiProtectionEnabled: false,
          autoSyncPosIp: true,
          allowedWifiIps: [],
          wifiSsid: 'Mi Cay POS Free',
          wifiPassword: '12345678',
          geoProtectionEnabled: true,
          shopLatitude: 10.776889,
          shopLongitude: 106.700806,
          geoRadiusMeters: 200,
        },
        '113.161.77.88',
        1,
      );

      // Guest on 4G without coordinates -> QR_GEO_REQUIRED
      await expect(
        service.verifyGuestQrAccess({ clientIp: '203.0.113.55' }),
      ).rejects.toThrow(ForbiddenException);

      // Attacker at home 3km away (10.805, 106.720) -> QR_GEO_OUT_OF_RANGE
      await expect(
        service.verifyGuestQrAccess({
          clientIp: '203.0.113.55',
          latitude: 10.805,
          longitude: 106.72,
        }),
      ).rejects.toThrow(ForbiddenException);

      // Real diner at the shop on 4G (~40m from shop center) -> Allowed!
      await expect(
        service.verifyGuestQrAccess({
          clientIp: '203.0.113.55',
          latitude: 10.7771,
          longitude: 106.7009,
        }),
      ).resolves.toBeUndefined();

      const cfg = await service.getConfigResponse('113.161.77.88');
      expect(cfg.detectedClientIp).toBe('113.161.77.88');
      expect(cfg.wifiSsid).toBe('Mi Cay POS Free');

      await service.updateConfig(
        {
          wifiProtectionEnabled: true,
          autoSyncPosIp: false,
          allowedWifiIps: ['192.168.1.1'],
          wifiSsid: 'Quán Mới',
          wifiPassword: 'newpassword',
          geoProtectionEnabled: false,
          shopLatitude: 10.78,
          shopLongitude: 106.71,
          geoRadiusMeters: 300,
        },
        '113.161.77.88',
        1,
      );

      // Prefix pattern, CIDR /24 match, missing GPS shop coordinates fallback, and rate-limit bucket expiry cleanup
      const { normalizeClientIp } = await import('../qr-security.service');
      expect(
        isWifiIpAllowed('192.168.5.44', { allowedWifiIps: ['192.168.5.'], autoSyncPosIp: false }, null),
      ).toBe(true);
      expect(
        isWifiIpAllowed('10.20.30.99', { allowedWifiIps: ['10.20.30.0/24'], autoSyncPosIp: false }, null),
      ).toBe(true);
      expect(normalizeClientIp('::ffff:192.168.1.15')).toBe('192.168.1.15');
      expect(normalizeClientIp('::1')).toBe('127.0.0.1');

      await service.updateConfig(
        {
          wifiProtectionEnabled: false,
          autoSyncPosIp: true,
          allowedWifiIps: [],
          wifiSsid: '',
          wifiPassword: '',
          geoProtectionEnabled: true,
          shopLatitude: null,
          shopLongitude: null,
          geoRadiusMeters: 200,
          applySecurityToTakeaway: true,
        },
        '113.161.77.88',
        1,
      );
      await expect(service.verifyGuestQrAccess({ clientIp: '203.0.113.55' })).resolves.toBeUndefined();
    });

    it('enforces general /api/v1 rate limits, non-API bypass, and bucket cleanup on overflow', () => {
      const rl = new RateLimitGuard();
      rl.setForceEnabled(true);

      const nonApi = createMockHttpContext({ method: 'GET', url: '/health' });
      expect(rl.canActivate(nonApi.context)).toBe(true);

      const apiReq = createMockHttpContext({
        method: 'GET',
        url: '/api/v1/pos/orders/1',
        headers: { authorization: 'Bearer valid-bearer-token-123456' },
      });
      expect(rl.canActivate(apiReq.context)).toBe(true);
      expect(apiReq.headersWritten['X-RateLimit-Remaining']).toBe('299');

      const internalBuckets = (rl as unknown as {
        buckets: Map<string, { timestamps: number[]; expiresAt: number }>;
        lastCleanupAt: number;
      });
      internalBuckets.lastCleanupAt = 0;
      for (let i = 0; i < 4050; i += 1) {
        internalBuckets.buckets.set(`k-${i}`, {
          timestamps: [1],
          expiresAt: i < 200 ? 1 : Date.now() + 60_000,
        });
      }
      const sweepCtx = createMockHttpContext({ method: 'GET', url: '/api/v1/menu/products' });
      expect(rl.canActivate(sweepCtx.context)).toBe(true);
      expect(internalBuckets.buckets.size).toBeLessThan(4000);
    });
  });
});
