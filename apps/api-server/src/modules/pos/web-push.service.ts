import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  RegisterWebPushSubscriptionSchema,
  UnregisterWebPushSubscriptionSchema,
  UserPermissionsSchema,
  WEB_PUSH_VAPID_NORMALIZED_NAME,
  WebPushNotificationKind,
  WebPushNotificationPayloadSchema,
  WebPushSubscriptionStatusResponseSchema,
  type AuthPrincipal,
  type RegisterWebPushSubscriptionInput,
  type WebPushNotificationPayload,
  type WebPushSubscriptionStatusResponse,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildVapidAuthorizationHeader,
  encryptWebPushPayload,
  generateVapidKeyPair,
  type VapidKeyPair,
} from './web-push-crypto.util';

const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const DEFAULT_VAPID_SUBJECT = 'mailto:pos-alerts@fnb-pos.local';
const PUSH_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_PUSH_TTL_SECONDS = 300;

export type WebPushFetchFn = typeof fetch;

export interface WebPushSendSummary {
  attempted: number;
  delivered: number;
  pruned: number;
  failed: number;
}

export interface OverdueReminderPushItem {
  orderId: number;
  orderCode: string;
  tableLabel: string;
  kind: 'NEW' | 'ADDON';
  elapsedMinutes: number;
}

function readVapidFromEnv(): (VapidKeyPair & { subject: string }) | null {
  const publicKey = (process.env.FNB_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = (process.env.FNB_VAPID_PRIVATE_KEY ?? process.env.VAPID_PRIVATE_KEY ?? '').trim();
  const subject =
    (process.env.FNB_VAPID_SUBJECT ?? process.env.VAPID_SUBJECT ?? '').trim() ||
    DEFAULT_VAPID_SUBJECT;
  if (publicKey && privateKey) {
    return { publicKey, privateKey, subject };
  }
  return null;
}

function extractStoredVapid(metadata: unknown): VapidKeyPair | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const publicKey = typeof record.publicKey === 'string' ? record.publicKey.trim() : '';
  const privateKey = typeof record.privateKey === 'string' ? record.privateKey.trim() : '';
  if (publicKey.length >= 32 && privateKey.length >= 32) {
    return { publicKey, privateKey };
  }
  return null;
}

function canUserReceivePosPush(user: {
  isActive: boolean;
  isSuperAdmin: boolean;
  permissions: unknown;
}): boolean {
  if (!user.isActive) return false;
  if (user.isSuperAdmin) return true;
  const parsed = UserPermissionsSchema.safeParse(user.permissions);
  return parsed.success && Boolean(parsed.data.pos?.view);
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private cachedVapid: (VapidKeyPair & { subject: string }) | null = null;
  private vapidInitPromise: Promise<VapidKeyPair & { subject: string }> | null = null;
  private readonly fetchFn: WebPushFetchFn;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() fetchFn?: WebPushFetchFn,
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  /**
   * Resolves VAPID key pair:
   * 1) Environment variables (FNB_VAPID_PUBLIC_KEY / VAPID_PUBLIC_KEY + PRIVATE_KEY) if provided.
   * 2) Existing row in master_data (category = SYSTEM_CONFIG, normalized_name = web_push_vapid_keys).
   * 3) Auto-generates once and persists in master_data for zero-config deployments.
   */
  async getVapidConfig(): Promise<VapidKeyPair & { subject: string }> {
    const envVapid = readVapidFromEnv();
    if (envVapid) {
      return envVapid;
    }
    if (this.cachedVapid) {
      return this.cachedVapid;
    }
    if (!this.vapidInitPromise) {
      this.vapidInitPromise = this.loadOrCreatePersistedVapid().finally(() => {
        this.vapidInitPromise = null;
      });
    }
    const resolved = await this.vapidInitPromise;
    this.cachedVapid = resolved;
    return resolved;
  }

  async getPublicKey(): Promise<string> {
    const config = await this.getVapidConfig();
    return config.publicKey;
  }

  private async loadOrCreatePersistedVapid(): Promise<VapidKeyPair & { subject: string }> {
    const subject =
      (process.env.FNB_VAPID_SUBJECT ?? process.env.VAPID_SUBJECT ?? '').trim() ||
      DEFAULT_VAPID_SUBJECT;

    if (typeof this.prisma.masterData?.findUnique === 'function') {
      const existing = await this.prisma.masterData.findUnique({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: WEB_PUSH_VAPID_NORMALIZED_NAME,
          },
        },
        select: { metadata: true },
      });
      const parsed = extractStoredVapid(existing?.metadata);
      if (parsed) {
        return { ...parsed, subject };
      }
    }

    const generated = generateVapidKeyPair();
    if (typeof this.prisma.masterData?.create === 'function') {
      try {
        await this.prisma.masterData.create({
          data: {
            category: SYSTEM_CONFIG_CATEGORY,
            name: 'Web Push VAPID Keys',
            normalizedName: WEB_PUSH_VAPID_NORMALIZED_NAME,
            isActive: true,
            metadata: {
              publicKey: generated.publicKey,
              privateKey: generated.privateKey,
              createdAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      } catch {
        // Concurrent boot race: re-read persisted keypair if another instance won the insert
        const raced = await this.prisma.masterData.findUnique({
          where: {
            category_normalizedName: {
              category: SYSTEM_CONFIG_CATEGORY,
              normalizedName: WEB_PUSH_VAPID_NORMALIZED_NAME,
            },
          },
          select: { metadata: true },
        });
        const parsed = extractStoredVapid(raced?.metadata);
        if (parsed) {
          return { ...parsed, subject };
        }
      }
    }

    return { ...generated, subject };
  }

  async registerSubscription(
    principal: AuthPrincipal,
    rawInput: RegisterWebPushSubscriptionInput,
    fallbackUserAgent?: string,
  ): Promise<WebPushSubscriptionStatusResponse> {
    const input = RegisterWebPushSubscriptionSchema.parse(rawInput);
    const sessionId = principal.sessionId ?? null;
    const userAgent = (input.userAgent ?? fallbackUserAgent ?? '').trim().slice(0, 512) || null;
    const deviceLabel = (input.deviceLabel ?? '').trim().slice(0, 128) || null;

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: principal.id,
        sessionId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent,
        deviceLabel,
      },
      update: {
        userId: principal.id,
        sessionId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent,
        deviceLabel,
      },
    });

    // Keep single-session hygiene: drop stale subscriptions belonging to older sessions of this user
    if (sessionId && typeof this.prisma.pushSubscription?.deleteMany === 'function') {
      await this.prisma.pushSubscription.deleteMany({
        where: {
          userId: principal.id,
          NOT: { sessionId },
        },
      });
    }

    return this.getSubscriptionStatus(principal, input.endpoint);
  }

  async unregisterSubscription(
    principal: AuthPrincipal,
    rawInput: { endpoint: string },
  ): Promise<WebPushSubscriptionStatusResponse> {
    const input = UnregisterWebPushSubscriptionSchema.parse(rawInput);
    await this.prisma.pushSubscription.deleteMany({
      where: {
        userId: principal.id,
        endpoint: input.endpoint,
      },
    });
    return this.getSubscriptionStatus(principal);
  }

  async getSubscriptionStatus(
    principal: AuthPrincipal,
    endpoint?: string,
  ): Promise<WebPushSubscriptionStatusResponse> {
    const where: Prisma.PushSubscriptionWhereInput = {
      userId: principal.id,
      ...(principal.sessionId ? { sessionId: principal.sessionId } : {}),
    };
    const [activeCount, endpointMatch] = await Promise.all([
      this.prisma.pushSubscription.count({ where }),
      endpoint
        ? this.prisma.pushSubscription.findFirst({
            where: { ...where, endpoint },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    return WebPushSubscriptionStatusResponseSchema.parse({
      subscribed: endpoint ? Boolean(endpointMatch) : activeCount > 0,
      activeCount,
    });
  }

  async notifyQrNewOrder(input: {
    orderId: number;
    orderCode: string;
    tableLabel: string;
  }): Promise<WebPushSendSummary> {
    const payload = WebPushNotificationPayloadSchema.parse({
      kind: WebPushNotificationKind.QR_NEW,
      title: `Đơn QR mới · ${input.tableLabel}`,
      body: `${input.tableLabel} vừa gửi đơn mới (${input.orderCode}). Chạm để mở quầy POS xác nhận.`,
      tag: `qr-new-${input.orderId}`,
      url: `/pos?orderId=${input.orderId}`,
      orderId: input.orderId,
      tableLabel: input.tableLabel,
      timestamp: new Date().toISOString(),
    });
    return this.sendToEligiblePosStaff(payload);
  }

  async notifyQrAddonOrder(input: {
    orderId: number;
    orderCode: string;
    tableLabel: string;
    batchNo?: number;
  }): Promise<WebPushSendSummary> {
    const batch = input.batchNo ?? 2;
    const payload = WebPushNotificationPayloadSchema.parse({
      kind: WebPushNotificationKind.QR_ADDON,
      title: `Gọi thêm món · ${input.tableLabel}`,
      body: `${input.tableLabel} vừa gọi thêm lượt ${batch} (${input.orderCode}). Chạm để xem ngay.`,
      tag: `qr-addon-${input.orderId}-${batch}`,
      url: `/pos?orderId=${input.orderId}`,
      orderId: input.orderId,
      tableLabel: input.tableLabel,
      batchNo: batch,
      timestamp: new Date().toISOString(),
    });
    return this.sendToEligiblePosStaff(payload);
  }

  async notifyQrOverdueReminder(entries: OverdueReminderPushItem[]): Promise<WebPushSendSummary> {
    if (entries.length === 0) {
      return { attempted: 0, delivered: 0, pruned: 0, failed: 0 };
    }

    const first = entries[0]!;
    const payload =
      entries.length === 1
        ? WebPushNotificationPayloadSchema.parse({
            kind: WebPushNotificationKind.QR_OVERDUE_REMINDER,
            title: `Nhắc lại: ${first.tableLabel} chưa xác nhận`,
            body:
              first.kind === 'ADDON'
                ? `Đơn gọi thêm tại ${first.tableLabel} (${first.orderCode}) đã chờ ${first.elapsedMinutes} phút chưa xác nhận.`
                : `Đơn QR mới tại ${first.tableLabel} (${first.orderCode}) đã chờ ${first.elapsedMinutes} phút chưa xác nhận.`,
            tag: `qr-reminder-${first.orderId}`,
            url: `/pos?orderId=${first.orderId}`,
            orderId: first.orderId,
            tableLabel: first.tableLabel,
            timestamp: new Date().toISOString(),
          })
        : WebPushNotificationPayloadSchema.parse({
            kind: WebPushNotificationKind.QR_OVERDUE_REMINDER,
            title: `Nhắc lại: ${entries.length} bàn chờ xác nhận đơn`,
            body: `${entries.map((entry) => entry.tableLabel).join(', ')} đang chờ xác nhận đơn QR quá hạn.`,
            tag: 'qr-reminder-multi',
            url: '/pos',
            tableLabel: entries.map((entry) => entry.tableLabel).join(', '),
            timestamp: new Date().toISOString(),
          });

    return this.sendToEligiblePosStaff(payload);
  }

  async sendToEligiblePosStaff(
    rawPayload: WebPushNotificationPayload,
    options?: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' },
  ): Promise<WebPushSendSummary> {
    if (typeof this.prisma.pushSubscription?.findMany !== 'function') {
      return { attempted: 0, delivered: 0, pruned: 0, failed: 0 };
    }

    const payload = WebPushNotificationPayloadSchema.parse(rawPayload);
    const subscriptions = await this.prisma.pushSubscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
            isSuperAdmin: true,
            permissions: true,
            activeSessionId: true,
          },
        },
      },
    });

    if (subscriptions.length === 0) {
      return { attempted: 0, delivered: 0, pruned: 0, failed: 0 };
    }

    const staleIds: number[] = [];
    const eligible: typeof subscriptions = [];

    for (const sub of subscriptions) {
      const hasActiveSession =
        typeof sub.user.activeSessionId === 'string' &&
        sub.user.activeSessionId.trim().length > 0 &&
        sub.sessionId === sub.user.activeSessionId;

      if (!sub.user.isActive || !hasActiveSession || !canUserReceivePosPush(sub.user)) {
        staleIds.push(sub.id);
        continue;
      }
      eligible.push(sub);
    }

    if (staleIds.length > 0 && typeof this.prisma.pushSubscription?.deleteMany === 'function') {
      await this.prisma.pushSubscription
        .deleteMany({ where: { id: { in: staleIds } } })
        .catch(() => undefined);
    }

    if (eligible.length === 0) {
      return { attempted: 0, delivered: 0, pruned: staleIds.length, failed: 0 };
    }

    const vapid = await this.getVapidConfig();
    const serializedPayload = JSON.stringify(payload);
    const ttl = options?.ttlSeconds ?? DEFAULT_PUSH_TTL_SECONDS;
    const urgency = options?.urgency ?? 'high';

    let delivered = 0;
    let pruned = staleIds.length;
    let failed = 0;
    const deliveredIds: number[] = [];
    const expiredIds: number[] = [];

    await Promise.all(
      eligible.map(async (sub) => {
        try {
          const encrypted = encryptWebPushPayload({
            payload: serializedPayload,
            p256dh: sub.p256dh,
            auth: sub.auth,
          });
          const authorization = buildVapidAuthorizationHeader({
            endpoint: sub.endpoint,
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          });

          const response = await this.fetchFn(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: authorization,
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(encrypted.body.length),
              TTL: String(ttl),
              Urgency: urgency,
            },
            body: new Uint8Array(encrypted.body),
            signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
          });

          if (response.status >= 200 && response.status < 300) {
            delivered += 1;
            deliveredIds.push(sub.id);
          } else if (response.status === 404 || response.status === 410) {
            pruned += 1;
            expiredIds.push(sub.id);
          } else {
            failed += 1;
            this.logger.warn(
              `Web Push delivery returned HTTP ${response.status} for subscription #${sub.id}`,
            );
          }
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `Web Push delivery failed for subscription #${sub.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    if (expiredIds.length > 0 && typeof this.prisma.pushSubscription?.deleteMany === 'function') {
      await this.prisma.pushSubscription
        .deleteMany({ where: { id: { in: expiredIds } } })
        .catch(() => undefined);
    }

    if (deliveredIds.length > 0 && typeof this.prisma.pushSubscription?.updateMany === 'function') {
      await this.prisma.pushSubscription
        .updateMany({
          where: { id: { in: deliveredIds } },
          data: { lastNotifiedAt: new Date() },
        })
        .catch(() => undefined);
    }

    return {
      attempted: eligible.length,
      delivered,
      pruned,
      failed,
    };
  }
}
