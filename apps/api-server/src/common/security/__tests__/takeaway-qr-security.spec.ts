import { ForbiddenException, HttpException, type ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QrSecurityService } from '../qr-security.service';
import { RateLimitGuard } from '../rate-limit.guard';
import {
  setCachedTakeawayQrToken,
  signTakeawayGuestSessionToken,
  verifyTakeawayGuestSessionToken,
} from '../takeaway-qr.util';

const TAKEAWAY_TOKEN = 'e'.repeat(64);
const TABLE_TOKEN = 'f'.repeat(64);

function createQrHttpContext(params: {
  method?: string;
  url?: string;
  ip?: string;
  body?: Record<string, unknown>;
}): ExecutionContext {
  const request = {
    method: params.method ?? 'POST',
    originalUrl: params.url ?? '/api/v1/public/orders/qr',
    url: params.url ?? '/api/v1/public/orders/qr',
    ip: params.ip ?? '203.0.113.10',
    headers: { 'user-agent': 'Mozilla/5.0' },
    socket: { remoteAddress: params.ip ?? '203.0.113.10' },
    body: params.body ?? {},
    query: {},
  };
  const response = {
    setHeader: vi.fn(),
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('Takeaway QR Security & RateLimitGuard', () => {
  afterEach(() => {
    setCachedTakeawayQrToken(null);
  });

  it('should bypass Wi-Fi/GPS checks for Takeaway QR when applySecurityToTakeaway is false and enforce when true', async () => {
    let savedConfig: Record<string, unknown> = {
      wifiProtectionEnabled: true,
      autoSyncPosIp: false,
      allowedWifiIps: ['113.161.77.88'],
      wifiSsid: 'Mi Cay',
      wifiPassword: '',
      geoProtectionEnabled: true,
      shopLatitude: 10.776889,
      shopLongitude: 106.700806,
      geoRadiusMeters: 200,
      applySecurityToTakeaway: false,
    };

    const prisma = {
      masterData: {
        findUnique: vi.fn(async (args: { where: { category_normalizedName: { normalizedName: string } } }) => {
          const key = args.where.category_normalizedName.normalizedName;
          if (key === 'takeaway_qr_config') {
            return { isActive: true, metadata: { qrToken: TAKEAWAY_TOKEN } };
          }
          if (key === 'qr_security_config') {
            return { isActive: true, metadata: savedConfig };
          }
          return null;
        }),
        upsert: vi.fn(async (args: { update: { metadata: Record<string, unknown> } }) => {
          savedConfig = args.update.metadata;
          return { metadata: savedConfig };
        }),
      },
    };

    const service = new QrSecurityService(prisma as never);

    // Table QR from outside 4G IP must still be blocked
    await expect(
      service.verifyGuestQrAccess({ clientIp: '198.51.100.22', qrToken: TABLE_TOKEN }),
    ).rejects.toThrow(ForbiddenException);

    // Takeaway QR from outside 4G IP is allowed by default (applySecurityToTakeaway = false)
    await expect(
      service.verifyGuestQrAccess({ clientIp: '198.51.100.22', qrToken: TAKEAWAY_TOKEN }),
    ).resolves.toBeUndefined();

    // Enable security for Takeaway QR
    const updated = await service.updateConfig(
      {
        ...(savedConfig as {
          wifiProtectionEnabled: boolean;
          autoSyncPosIp: boolean;
          allowedWifiIps: string[];
          wifiSsid: string;
          wifiPassword: string;
          geoProtectionEnabled: boolean;
          shopLatitude: number;
          shopLongitude: number;
          geoRadiusMeters: number;
        }),
        applySecurityToTakeaway: true,
      },
      '113.161.77.88',
      1,
    );
    expect(updated.applySecurityToTakeaway).toBe(true);

    // Takeaway QR from 4G outside geofence is now blocked
    await expect(
      service.verifyGuestQrAccess({ clientIp: '198.51.100.22', qrToken: TAKEAWAY_TOKEN }),
    ).rejects.toThrow(ForbiddenException);

    // Takeaway QR from shop Wi-Fi is allowed
    await expect(
      service.verifyGuestQrAccess({ clientIp: '113.161.77.88', qrToken: TAKEAWAY_TOKEN }),
    ).resolves.toBeUndefined();
  });

  it('should rate-limit takeaway QR orders per (qrToken + clientIp) so concurrent guests on different IPs do not block each other', () => {
    setCachedTakeawayQrToken(TAKEAWAY_TOKEN);
    const guard = new RateLimitGuard();
    guard.setForceEnabled(true);

    // Guest A spams 6 requests from IP 1 -> 7th is throttled
    for (let i = 0; i < 6; i += 1) {
      expect(
        guard.canActivate(createQrHttpContext({ ip: '198.51.100.1', body: { qrToken: TAKEAWAY_TOKEN } })),
      ).toBe(true);
    }
    expect(() =>
      guard.canActivate(createQrHttpContext({ ip: '198.51.100.1', body: { qrToken: TAKEAWAY_TOKEN } })),
    ).toThrow(HttpException);

    // Guest B on a different 4G IP scanning the exact same Takeaway QR is NOT blocked!
    expect(
      guard.canActivate(createQrHttpContext({ ip: '198.51.100.2', body: { qrToken: TAKEAWAY_TOKEN } })),
    ).toBe(true);
  });

  it('should sign and verify HMAC takeaway guest session tokens safely against tampering', () => {
    const token = signTakeawayGuestSessionToken(42, 'HD-20261122-0001');
    expect(verifyTakeawayGuestSessionToken(token, 42, 'HD-20261122-0001')).toBe(true);
    expect(verifyTakeawayGuestSessionToken(token, 43, 'HD-20261122-0001')).toBe(false);
    expect(verifyTakeawayGuestSessionToken('0'.repeat(64), 42, 'HD-20261122-0001')).toBe(false);
    expect(verifyTakeawayGuestSessionToken(undefined, 42, 'HD-20261122-0001')).toBe(false);
  });
});
