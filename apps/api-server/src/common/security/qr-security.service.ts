import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCodes,
  QrSecurityConfigResponseSchema,
  QrSecurityConfigSchema,
  UpdateQrSecurityConfigSchema,
  type QrSecurityConfig,
  type QrSecurityConfigResponse,
  type UpdateQrSecurityConfigInput,
} from '@fnb/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { isTakeawayQrToken } from './takeaway-qr.util';

const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const QR_SECURITY_NORMALIZED_NAME = 'qr_security_config';
const QR_SECURITY_DISPLAY_NAME = 'Cấu hình Bảo mật Quét QR';

const DEFAULT_QR_SECURITY_CONFIG: QrSecurityConfig = {
  wifiProtectionEnabled: false,
  autoSyncPosIp: true,
  allowedWifiIps: [],
  wifiSsid: '',
  wifiPassword: '',
  geoProtectionEnabled: false,
  shopLatitude: null,
  shopLongitude: null,
  geoRadiusMeters: 200,
  applySecurityToTakeaway: false,
};

@Injectable()
export class QrSecurityService {
  private latestSyncedPosIp: string | null = null;
  private cachedConfig: {
    config: QrSecurityConfig;
    syncedPosIp: string | null;
    updatedAt: string | null;
    expiresAt: number;
  } | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  recordPosClientIp(rawIp: string | undefined): string {
    const normalized = normalizeClientIp(rawIp);
    if (normalized && normalized !== 'unknown') {
      this.latestSyncedPosIp = normalized;
    }
    return normalized;
  }

  async getConfigResponse(rawClientIp?: string): Promise<QrSecurityConfigResponse> {
    const detectedClientIp = this.recordPosClientIp(rawClientIp);
    const loaded = await this.loadConfigState();
    const resolvedSyncedIp = loaded.syncedPosIp ?? this.latestSyncedPosIp;

    return QrSecurityConfigResponseSchema.parse({
      ...loaded.config,
      detectedClientIp: detectedClientIp || '127.0.0.1',
      syncedPosIp: resolvedSyncedIp ?? null,
      updatedAt: loaded.updatedAt ?? null,
    });
  }

  async updateConfig(
    input: UpdateQrSecurityConfigInput,
    rawClientIp?: string,
    actorId?: number,
  ): Promise<QrSecurityConfigResponse> {
    const previousState = await this.loadConfigState();
    const prevConfig = previousState.config;
    const parsed = UpdateQrSecurityConfigSchema.parse(input);
    const detectedClientIp = this.recordPosClientIp(rawClientIp);
    const syncedPosIp = parsed.autoSyncPosIp
      ? detectedClientIp || this.latestSyncedPosIp
      : this.latestSyncedPosIp;
    const updatedAt = new Date().toISOString();

    const cleanedAllowedIps = Array.from(
      new Set(
        parsed.allowedWifiIps
          .map((ip) => normalizeClientIp(ip))
          .filter((ip) => ip.length > 0 && ip !== 'unknown'),
      ),
    );

    const nextConfig: QrSecurityConfig = {
      ...parsed,
      allowedWifiIps: cleanedAllowedIps,
    };

    const metadataPayload: Prisma.InputJsonObject = {
      ...nextConfig,
      syncedPosIp: syncedPosIp ?? null,
      updatedAt,
    };

    if (typeof this.prisma.masterData?.upsert === 'function') {
      await this.prisma.masterData.upsert({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: QR_SECURITY_NORMALIZED_NAME,
          },
        },
        update: {
          name: QR_SECURITY_DISPLAY_NAME,
          metadata: metadataPayload,
          isActive: true,
        },
        create: {
          category: SYSTEM_CONFIG_CATEGORY,
          name: QR_SECURITY_DISPLAY_NAME,
          normalizedName: QR_SECURITY_NORMALIZED_NAME,
          metadata: metadataPayload,
          isActive: true,
        },
      });
    }

    this.cachedConfig = {
      config: nextConfig,
      syncedPosIp: syncedPosIp ?? null,
      updatedAt,
      expiresAt: Date.now() + 10_000,
    };

    if (actorId) {
      const changes: Array<{ field: string; from: string; to: string }> = [];
      if (prevConfig.wifiProtectionEnabled !== nextConfig.wifiProtectionEnabled) {
        changes.push({
          field: 'Bảo vệ Wi-Fi',
          from: prevConfig.wifiProtectionEnabled ? 'Bật' : 'Tắt',
          to: nextConfig.wifiProtectionEnabled ? 'Bật' : 'Tắt',
        });
      }
      if (prevConfig.wifiSsid !== nextConfig.wifiSsid) {
        changes.push({
          field: 'Tên Wi-Fi (SSID)',
          from: prevConfig.wifiSsid || 'Trống',
          to: nextConfig.wifiSsid || 'Trống',
        });
      }
      if (prevConfig.autoSyncPosIp !== nextConfig.autoSyncPosIp) {
        changes.push({
          field: 'Tự đồng bộ IP POS',
          from: prevConfig.autoSyncPosIp ? 'Bật' : 'Tắt',
          to: nextConfig.autoSyncPosIp ? 'Bật' : 'Tắt',
        });
      }
      if (prevConfig.allowedWifiIps.join(', ') !== nextConfig.allowedWifiIps.join(', ')) {
        changes.push({
          field: 'Danh sách IP Wi-Fi',
          from: prevConfig.allowedWifiIps.join(', ') || 'Trống',
          to: nextConfig.allowedWifiIps.join(', ') || 'Trống',
        });
      }
      if (prevConfig.geoProtectionEnabled !== nextConfig.geoProtectionEnabled) {
        changes.push({
          field: 'Giới hạn GPS',
          from: prevConfig.geoProtectionEnabled ? 'Bật' : 'Tắt',
          to: nextConfig.geoProtectionEnabled ? 'Bật' : 'Tắt',
        });
      }
      if (prevConfig.geoRadiusMeters !== nextConfig.geoRadiusMeters) {
        changes.push({
          field: 'Bán kính GPS',
          from: `${prevConfig.geoRadiusMeters}m`,
          to: `${nextConfig.geoRadiusMeters}m`,
        });
      }
      if (prevConfig.applySecurityToTakeaway !== nextConfig.applySecurityToTakeaway) {
        changes.push({
          field: 'Bảo mật QR Mang về',
          from: prevConfig.applySecurityToTakeaway ? 'Bật' : 'Tắt',
          to: nextConfig.applySecurityToTakeaway ? 'Bật' : 'Tắt',
        });
      }
      if (
        prevConfig.shopLatitude !== nextConfig.shopLatitude ||
        prevConfig.shopLongitude !== nextConfig.shopLongitude
      ) {
        changes.push({
          field: 'Toạ độ quán',
          from: prevConfig.shopLatitude !== null && prevConfig.shopLongitude !== null
            ? `${prevConfig.shopLatitude}, ${prevConfig.shopLongitude}`
            : 'Chưa đặt',
          to: nextConfig.shopLatitude !== null && nextConfig.shopLongitude !== null
            ? `${nextConfig.shopLatitude}, ${nextConfig.shopLongitude}`
            : 'Chưa đặt',
        });
      }

      const modeSummary = [
        nextConfig.wifiProtectionEnabled ? `Wi-Fi (${nextConfig.wifiSsid || 'Bật'})` : null,
        nextConfig.geoProtectionEnabled ? `GPS (${nextConfig.geoRadiusMeters}m)` : null,
      ]
        .filter(Boolean)
        .join(' + ') || 'Tắt giới hạn';

      await this.auditLogService?.record({
        module: 'POS',
        action: 'Cấu hình bảo mật QR',
        detail: modeSummary,
        message: `cập nhật cấu hình bảo mật quét QR tại bàn: ${modeSummary}`,
        actor: actorId,
        metadata: {
          wifiProtectionEnabled: nextConfig.wifiProtectionEnabled,
          autoSyncPosIp: nextConfig.autoSyncPosIp,
          allowedWifiIps: nextConfig.allowedWifiIps,
          wifiSsid: nextConfig.wifiSsid,
          geoProtectionEnabled: nextConfig.geoProtectionEnabled,
          shopLatitude: nextConfig.shopLatitude,
          shopLongitude: nextConfig.shopLongitude,
          geoRadiusMeters: nextConfig.geoRadiusMeters,
          ...(changes.length > 0 ? { changes } : {}),
        },
      });
    }

    return QrSecurityConfigResponseSchema.parse({
      ...nextConfig,
      detectedClientIp: detectedClientIp || '127.0.0.1',
      syncedPosIp: syncedPosIp ?? null,
      updatedAt,
    });
  }

  async verifyGuestQrAccess(params: {
    clientIp?: string;
    latitude?: number | null;
    longitude?: number | null;
    qrToken?: string;
  }): Promise<void> {
    const { config, syncedPosIp } = await this.loadConfigState();
    if (!config.wifiProtectionEnabled && !config.geoProtectionEnabled) {
      return;
    }
    if (
      !config.applySecurityToTakeaway &&
      params.qrToken &&
      (await isTakeawayQrToken(this.prisma, params.qrToken))
    ) {
      return;
    }

    const guestIp = normalizeClientIp(params.clientIp);
    const effectiveSyncedPosIp = syncedPosIp ?? this.latestSyncedPosIp;

    if (config.wifiProtectionEnabled) {
      const wifiMatched = isWifiIpAllowed(guestIp, config, effectiveSyncedPosIp);
      if (wifiMatched) {
        return;
      }

      if (!config.geoProtectionEnabled) {
        throw new ForbiddenException({
          code: ErrorCodes.QR_WIFI_REQUIRED,
          message: config.wifiSsid
            ? `Vui lòng kết nối Wi-Fi "${config.wifiSsid}" của quán để quét mã và gọi món tại bàn.`
            : 'Vui lòng kết nối mạng Wi-Fi của quán để quét mã và gọi món tại bàn.',
          details: {
            wifiSsid: config.wifiSsid || null,
            wifiPassword: config.wifiPassword || null,
            clientIp: guestIp,
            fallbackGeoAvailable: false,
          },
        });
      }
    }

    if (config.geoProtectionEnabled) {
      if (config.shopLatitude === null || config.shopLongitude === null) {
        return;
      }

      const lat = params.latitude;
      const lng = params.longitude;
      const hasValidCoords =
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng);

      if (!hasValidCoords) {
        throw new ForbiddenException({
          code: ErrorCodes.QR_GEO_REQUIRED,
          message: config.wifiProtectionEnabled
            ? 'Bạn chưa kết nối Wi-Fi của quán. Vui lòng kết nối Wi-Fi quán hoặc xác nhận vị trí GPS tại quán để mở thực đơn.'
            : 'Vui lòng xác nhận vị trí GPS tại quán để mở thực đơn và đặt món.',
          details: {
            geoRadiusMeters: config.geoRadiusMeters,
            wifiProtectionEnabled: config.wifiProtectionEnabled,
            wifiSsid: config.wifiSsid || null,
            wifiPassword: config.wifiPassword || null,
          },
        });
      }

      const distanceMeters = calculateHaversineDistanceMeters(
        lat,
        lng,
        config.shopLatitude,
        config.shopLongitude,
      );

      if (distanceMeters > config.geoRadiusMeters) {
        throw new ForbiddenException({
          code: ErrorCodes.QR_GEO_OUT_OF_RANGE,
          message: `Bạn đang ở cách quán khoảng ${Math.round(distanceMeters)}m (vượt quá bán kính an toàn ${config.geoRadiusMeters}m). Chỉ khách đang có mặt tại quán mới có thể quét mã gọi món.`,
          details: {
            distanceMeters: Math.round(distanceMeters),
            geoRadiusMeters: config.geoRadiusMeters,
            wifiProtectionEnabled: config.wifiProtectionEnabled,
            wifiSsid: config.wifiSsid || null,
            wifiPassword: config.wifiPassword || null,
          },
        });
      }
    }
  }

  private async loadConfigState(): Promise<{
    config: QrSecurityConfig;
    syncedPosIp: string | null;
    updatedAt: string | null;
  }> {
    const now = Date.now();
    if (this.cachedConfig && this.cachedConfig.expiresAt > now) {
      return {
        config: this.cachedConfig.config,
        syncedPosIp: this.cachedConfig.syncedPosIp,
        updatedAt: this.cachedConfig.updatedAt,
      };
    }

    if (typeof this.prisma.masterData?.findUnique !== 'function') {
      return {
        config: DEFAULT_QR_SECURITY_CONFIG,
        syncedPosIp: this.latestSyncedPosIp,
        updatedAt: null,
      };
    }

    try {
      const row = await this.prisma.masterData.findUnique({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: QR_SECURITY_NORMALIZED_NAME,
          },
        },
      });

      if (!row || !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
        const fallback = {
          config: DEFAULT_QR_SECURITY_CONFIG,
          syncedPosIp: this.latestSyncedPosIp,
          updatedAt: null,
        };
        this.cachedConfig = { ...fallback, expiresAt: now + 5_000 };
        return fallback;
      }

      const rawMeta = row.metadata as Record<string, unknown>;
      const parsedConfig = QrSecurityConfigSchema.safeParse({
        wifiProtectionEnabled: Boolean(rawMeta.wifiProtectionEnabled),
        autoSyncPosIp: rawMeta.autoSyncPosIp !== undefined ? Boolean(rawMeta.autoSyncPosIp) : true,
        allowedWifiIps: Array.isArray(rawMeta.allowedWifiIps)
          ? rawMeta.allowedWifiIps.filter((x): x is string => typeof x === 'string')
          : [],
        wifiSsid: typeof rawMeta.wifiSsid === 'string' ? rawMeta.wifiSsid : '',
        wifiPassword: typeof rawMeta.wifiPassword === 'string' ? rawMeta.wifiPassword : '',
        geoProtectionEnabled: Boolean(rawMeta.geoProtectionEnabled),
        shopLatitude: typeof rawMeta.shopLatitude === 'number' ? rawMeta.shopLatitude : null,
        shopLongitude: typeof rawMeta.shopLongitude === 'number' ? rawMeta.shopLongitude : null,
        geoRadiusMeters:
          typeof rawMeta.geoRadiusMeters === 'number' ? Math.round(rawMeta.geoRadiusMeters) : 200,
        applySecurityToTakeaway: Boolean(rawMeta.applySecurityToTakeaway),
      });

      const config = parsedConfig.success ? parsedConfig.data : DEFAULT_QR_SECURITY_CONFIG;
      const syncedPosIp =
        typeof rawMeta.syncedPosIp === 'string' && rawMeta.syncedPosIp.trim()
          ? normalizeClientIp(rawMeta.syncedPosIp)
          : this.latestSyncedPosIp;
      const updatedAt = typeof rawMeta.updatedAt === 'string' ? rawMeta.updatedAt : null;

      this.cachedConfig = {
        config,
        syncedPosIp,
        updatedAt,
        expiresAt: now + 5_000,
      };
      return { config, syncedPosIp, updatedAt };
    } catch {
      return {
        config: DEFAULT_QR_SECURITY_CONFIG,
        syncedPosIp: this.latestSyncedPosIp,
        updatedAt: null,
      };
    }
  }
}

export function normalizeClientIp(rawIp: string | undefined | null): string {
  if (!rawIp || typeof rawIp !== 'string') return 'unknown';
  const trimmed = rawIp.trim();
  if (!trimmed) return 'unknown';
  if (trimmed === '::1' || trimmed === '0:0:0:0:0:0:0:1') return '127.0.0.1';
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function isWifiIpAllowed(
  guestIp: string,
  config: Pick<QrSecurityConfig, 'allowedWifiIps' | 'autoSyncPosIp'>,
  syncedPosIp: string | null,
): boolean {
  const normalizedGuest = normalizeClientIp(guestIp);
  if (!normalizedGuest || normalizedGuest === 'unknown') return false;

  const candidates = new Set<string>();
  for (const ip of config.allowedWifiIps) {
    const clean = normalizeClientIp(ip);
    if (clean && clean !== 'unknown') candidates.add(clean);
  }
  if (config.autoSyncPosIp && syncedPosIp) {
    const cleanSynced = normalizeClientIp(syncedPosIp);
    if (cleanSynced && cleanSynced !== 'unknown') candidates.add(cleanSynced);
  }

  for (const pattern of candidates) {
    if (normalizedGuest === pattern) return true;
    // Support prefix matching such as "192.168.1." or "/24" CIDR notation
    if (pattern.endsWith('.') && normalizedGuest.startsWith(pattern)) {
      return true;
    }
    if (pattern.endsWith('/24')) {
      const basePrefix = pattern.slice(0, -3).split('.').slice(0, 3).join('.');
      if (basePrefix && normalizedGuest.startsWith(`${basePrefix}.`)) {
        return true;
      }
    }
    // Same private LAN /24 subnet match (e.g. POS machine at 192.168.1.10 and phone on same Wi-Fi router at 192.168.1.45)
    if (isPrivateLanIpv4(pattern) && isPrivateLanIpv4(normalizedGuest)) {
      const patternSubnet = pattern.split('.').slice(0, 3).join('.');
      const guestSubnet = normalizedGuest.split('.').slice(0, 3).join('.');
      if (patternSubnet === guestSubnet) return true;
    }
  }

  return false;
}

function isPrivateLanIpv4(ip: string): boolean {
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}
