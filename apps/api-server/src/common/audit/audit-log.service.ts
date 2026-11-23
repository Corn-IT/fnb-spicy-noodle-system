import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AUDIT_MODULE_CONFIG, type AuditLogFilterQuery, type AuditModule } from '@fnb/shared';
import { getRequestContext } from '../context/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { buildIyFallbackKeywords, queryMatchingIdsBySearchNorm } from '../utils/search-normalize.util';
import { sanitizeAuditMetadata } from '../security/redact.util';

export interface AuditActor {
  id?: number | null;
  fullName?: string;
  username?: string;
}

export interface RecordAuditParams {
  module: AuditModule;
  action: string;
  detail: string;
  /** Optional custom Vietnamese action phrase appended after "đã thực hiện thao tác " */
  message?: string;
  actor?: AuditActor | number | null;
  ipAddress?: string | null;
  deviceLabel?: string | null;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}

export const PAYMENT_METHOD_LABELS_VI: Record<string, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  SPLIT: 'Kết hợp Tiền mặt & Chuyển khoản',
};

export const formatPaymentMethodVi = (method?: string | null): string =>
  method ? (PAYMENT_METHOD_LABELS_VI[method] ?? method) : 'Chưa xác định';

const toVnDayStartUtc = (dateText: string): Date => new Date(`${dateText}T00:00:00.000+07:00`);
const toVnDayEndUtc = (dateText: string): Date => new Date(`${dateText}T23:59:59.999+07:00`);

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    const db = (params.tx ?? this.prisma) as unknown as {
      auditLog?: { create: (args: unknown) => Promise<unknown> };
      user?: { findUnique: (args: unknown) => Promise<{ username?: string; employee?: { fullName?: string | null } | null } | null> };
    };

    if (typeof db.auditLog?.create !== 'function') return;

    try {
      const actorInfo = await this.resolveActor(params.actor);
      const moduleLabel = AUDIT_MODULE_CONFIG[params.module]?.moduleLabel ?? params.module;
      const normalizedAction = params.action.trim().slice(0, 32) || 'Thao tác';
      const actionPhrase = (params.message?.trim() || `${params.action.trim()} ${params.detail.trim()}`.trim());
      const summary = `Nhân viên ${actorInfo.fullName} (${actorInfo.username}) đã thực hiện thao tác ${actionPhrase} tại ${moduleLabel}`;

      const reqCtx = getRequestContext();
      const resolvedIp = (params.ipAddress ?? reqCtx?.ipAddress)?.slice(0, 64) ?? null;
      const resolvedDevice = (params.deviceLabel ?? reqCtx?.deviceLabel)?.slice(0, 128) ?? null;

      await db.auditLog.create({
        data: {
          module: params.module,
          action: normalizedAction,
          actorId: actorInfo.id,
          actorFullName: actorInfo.fullName,
          actorUsername: actorInfo.username,
          summary,
          ipAddress: resolvedIp,
          deviceLabel: resolvedDevice,
          metadata: sanitizeAuditMetadata(params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to write audit log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async list(
    query: AuditLogFilterQuery,
    options?: { includeClientInfo?: boolean },
  ) {
    const includeClientInfo = options?.includeClientInfo ?? false;
    const where: Prisma.AuditLogWhereInput = {
      module: query.module,
    };

    if (query.action) {
      const actions = query.action
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (actions.length === 1) {
        where.action = actions[0];
      } else if (actions.length > 1) {
        where.action = { in: actions };
      }
    }

    if (query.keyword) {
      const cols = includeClientInfo
        ? ['summary', 'actor_full_name', 'actor_username', 'action', 'ip_address', 'device_label']
        : ['summary', 'actor_full_name', 'actor_username', 'action'];
      const matchedIds = await queryMatchingIdsBySearchNorm(
        this.prisma,
        'audit_logs',
        cols,
        query.keyword,
      );
      if (matchedIds !== null) {
        where.id = { in: matchedIds };
      } else {
        const variants = buildIyFallbackKeywords(query.keyword);
        where.OR = variants.flatMap((v) => [
          { summary: { contains: v, mode: 'insensitive' as const } },
          { actorFullName: { contains: v, mode: 'insensitive' as const } },
          { actorUsername: { contains: v, mode: 'insensitive' as const } },
          { action: { contains: v, mode: 'insensitive' as const } },
          ...(includeClientInfo
            ? [
                { ipAddress: { contains: v, mode: 'insensitive' as const } },
                { deviceLabel: { contains: v, mode: 'insensitive' as const } },
              ]
            : []),
        ]);
      }
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: toVnDayStartUtc(query.fromDate) } : {}),
        ...(query.toDate ? { lte: toVnDayEndUtc(query.toDate) } : {}),
      };
    }

    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        module: row.module,
        action: row.action,
        actorId: row.actorId,
        actorFullName: row.actorFullName,
        actorUsername: row.actorUsername,
        summary: row.summary,
        ipAddress: includeClientInfo ? (row.ipAddress ?? null) : null,
        deviceLabel: includeClientInfo ? (row.deviceLabel ?? null) : null,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private async resolveActor(actor?: AuditActor | number | null): Promise<{
    id: number | null;
    fullName: string;
    username: string;
  }> {
    if (actor === undefined || actor === null) {
      return { id: null, fullName: 'Hệ thống', username: 'system' };
    }

    const actorId = typeof actor === 'number' ? actor : (actor.id ?? null);
    let fullName = typeof actor === 'number' ? undefined : actor.fullName;
    let username = typeof actor === 'number' ? undefined : actor.username;

    if (actorId !== null && (!fullName || !username) && typeof this.prisma.user?.findUnique === 'function') {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: {
          username: true,
          employee: { select: { fullName: true } },
        },
      });
      username = username ?? user?.username;
      fullName = fullName ?? user?.employee?.fullName ?? undefined;
    }

    const resolvedUsername = username ?? (actorId !== null ? `user_${actorId}` : 'system');
    const resolvedFullName = fullName ?? resolvedUsername;
    return { id: actorId, fullName: resolvedFullName, username: resolvedUsername };
  }
}
