import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ErrorCodes,
  UserSessionHistoryResponseSchema,
  type AuthPrincipal,
  type LoginRequest,
  type RevokedSessionNotice,
  type UserSessionHistoryResponse,
} from '@fnb/shared';
import { type ClientMeta } from '../../../common/security/client-info.util';
import {
  assertActiveSessionMatches,
  extractTokenSessionId,
} from '../../../common/security/session-validation.util';
import {
  ALL_SESSION_HISTORY_ACTIONS,
  DUMMY_PASSWORD_HASH,
  SELF_SESSION_HISTORY_ACTIONS,
  asObject,
  buildSessionStatus,
  findUserWithEmployee,
  invalidCredentials,
  issueTokens,
  mapSessionAuditRow,
  recordFailedLoginAttempt,
  resolveClientMeta,
  toAuthUser,
  type IamRuntimeDeps,
  type LoginResult,
  type RefreshClaims,
} from './iam-shared.helper';

export async function loginHelper(
  deps: IamRuntimeDeps,
  input: LoginRequest,
  clientMeta?: ClientMeta,
): Promise<LoginResult> {
  const user = await deps.prisma.user.findUnique({
    where: { username: input.username },
    include: { employee: { include: { position: true, specialty: true } } },
  });
  if (!user || user.employee.isDeleted) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw invalidCredentials();
  }

  const meta = resolveClientMeta(clientMeta);
  if (!user.isActive) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    await recordFailedLoginAttempt(deps, user, meta, 'ACCOUNT_DISABLED');
    throw invalidCredentials();
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    await recordFailedLoginAttempt(deps, user, meta, 'INVALID_PASSWORD');
    throw invalidCredentials();
  }
  const previousSessionId =
    typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
      ? user.activeSessionId.trim()
      : null;
  const isPreviousOnline = Boolean(
    previousSessionId && deps.posSocketGateway?.isSessionOnline(previousSessionId),
  );

  if (previousSessionId && isPreviousOnline && !input.force) {
    throw new ConflictException({
      code: ErrorCodes.AUTH_SESSION_CONFLICT_ONLINE,
      message: `Tài khoản @${user.username} hiện đang hoạt động trên một trình duyệt hoặc thiết bị khác. Vui lòng xác nhận nếu bạn muốn đăng xuất phiên kia để tiếp tục.`,
      details: {
        username: user.username,
        startedAt: user.activeSessionAt ? user.activeSessionAt.toISOString() : null,
      },
    });
  }

  const sessionId = randomUUID();
  const now = new Date();

  if (typeof deps.prisma.user?.update === 'function') {
    const revokedNotice: RevokedSessionNotice | null = previousSessionId
      ? {
          reason: 'NEW_LOGIN',
          at: now.toISOString(),
        }
      : null;

    await deps.prisma.user.update({
      where: { id: user.id },
      data: {
        activeSessionId: sessionId,
        activeSessionIp: meta.ipAddress,
        activeSessionDevice: meta.deviceLabel,
        activeSessionAgent: meta.userAgent,
        activeSessionAt: now,
        lastRevokedNotice: (revokedNotice ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
  }

  if (previousSessionId) {
    const noticePayload: RevokedSessionNotice = {
      reason: 'NEW_LOGIN',
      at: now.toISOString(),
    };
    deps.posSocketGateway?.emitSessionRevoked(previousSessionId, noticePayload);
    await deps.prisma.pushSubscription
      ?.deleteMany?.({ where: { userId: user.id, sessionId: previousSessionId } })
      .catch(() => undefined);

    await deps.auditLogService?.record({
      module: 'RBAC',
      action: 'Chiếm phiên đăng nhập',
      detail: `${user.employee.fullName} (${user.username})`,
      message: `đăng nhập từ ${meta.deviceLabel} (IP: ${meta.ipAddress}) và tự động kết thúc phiên cũ từ ${user.activeSessionDevice ?? 'thiết bị trước'} (IP: ${user.activeSessionIp ?? 'N/A'})`,
      actor: { id: user.id, fullName: user.employee.fullName, username: user.username },
      ipAddress: meta.ipAddress,
      deviceLabel: meta.deviceLabel,
      metadata: {
        targetUserId: user.id,
        targetUsername: user.username,
        newSessionId: sessionId,
        previousSessionId,
        previousIp: user.activeSessionIp ?? null,
        previousDevice: user.activeSessionDevice ?? null,
        changes: [
          {
            field: 'Thiết bị giữ phiên',
            from: `${user.activeSessionDevice ?? 'Máy cũ'} (${user.activeSessionIp ?? 'N/A'})`,
            to: `${meta.deviceLabel} (${meta.ipAddress})`,
          },
        ],
      },
    });
  } else {
    await deps.auditLogService?.record({
      module: 'RBAC',
      action: 'Đăng nhập',
      detail: `${user.employee.fullName} (${user.username})`,
      message: `đăng nhập hệ thống từ ${meta.deviceLabel} (IP: ${meta.ipAddress})`,
      actor: { id: user.id, fullName: user.employee.fullName, username: user.username },
      ipAddress: meta.ipAddress,
      deviceLabel: meta.deviceLabel,
      metadata: {
        targetUserId: user.id,
        targetUsername: user.username,
        sessionId,
      },
    });
  }

  const publicUser = toAuthUser(user);
  const tokens = await issueTokens(deps, user, sessionId);
  return { ...tokens, user: publicUser };
}

export async function refreshAccessTokenHelper(
  deps: IamRuntimeDeps,
  refreshToken: string,
): Promise<LoginResult> {
  let claims: RefreshClaims;
  try {
    claims = await deps.jwtService.verifyAsync<RefreshClaims>(refreshToken);
  } catch (error) {
    const expired = error instanceof Error && error.name === 'TokenExpiredError';
    throw new UnauthorizedException({
      code: expired ? ErrorCodes.AUTH_TOKEN_EXPIRED : ErrorCodes.AUTH_TOKEN_INVALID,
      message: expired ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' : 'Refresh token không hợp lệ',
    });
  }

  const userId = typeof claims.sub === 'number' ? claims.sub : Number(claims.sub);
  if (claims.tokenType !== 'refresh' || !Number.isSafeInteger(userId) || userId < 1) {
    throw new UnauthorizedException({ code: ErrorCodes.AUTH_TOKEN_INVALID, message: 'Refresh token không hợp lệ' });
  }
  const user = await findUserWithEmployee(deps.prisma, userId);
  if (!user?.isActive || user.employee.isDeleted) {
    throw new UnauthorizedException({ code: ErrorCodes.AUTH_TOKEN_INVALID, message: 'Tài khoản không hoạt động' });
  }

  const tokenSid = extractTokenSessionId(claims);
  assertActiveSessionMatches(user, tokenSid);
  const activeSid =
    tokenSid ??
    (typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
      ? user.activeSessionId.trim()
      : randomUUID());

  return { ...(await issueTokens(deps, user, activeSid)), user: toAuthUser(user) };
}

export async function logoutHelper(
  deps: IamRuntimeDeps,
  session: { userId?: number; sessionId?: string | null } | null,
  clientMeta?: ClientMeta,
): Promise<void> {
  if (!session?.userId || typeof deps.prisma.user?.updateMany !== 'function') {
    return;
  }

  const meta = resolveClientMeta(clientMeta);
  const now = new Date().toISOString();
  const result = await deps.prisma.user.updateMany({
    where: {
      id: session.userId,
      ...(session.sessionId ? { activeSessionId: session.sessionId } : {}),
    },
    data: {
      activeSessionId: null,
      lastRevokedNotice: {
        reason: 'LOGGED_OUT',
        at: now,
      } as Prisma.InputJsonValue,
    },
  });

  if (result.count > 0) {
    await deps.prisma.pushSubscription
      ?.deleteMany?.({
        where: {
          userId: session.userId,
          ...(session.sessionId ? { sessionId: session.sessionId } : {}),
        },
      })
      .catch(() => undefined);
    if (session.sessionId) {
      deps.posSocketGateway?.emitSessionRevoked(session.sessionId, {
        reason: 'LOGGED_OUT',
        at: now,
      });
    }
    await deps.auditLogService?.record({
      module: 'RBAC',
      action: 'Đăng xuất',
      detail: `Tài khoản #${session.userId}`,
      message: `đăng xuất khỏi hệ thống trên ${meta.deviceLabel} (IP: ${meta.ipAddress})`,
      actor: session.userId,
      ipAddress: meta.ipAddress,
      deviceLabel: meta.deviceLabel,
      metadata: {
        targetUserId: session.userId,
        ...(session.sessionId ? { sessionId: session.sessionId } : {}),
      },
    });
  }
}

export async function revokeUserSessionHelper(
  deps: IamRuntimeDeps,
  targetUserId: number,
  actor: AuthPrincipal,
  clientMeta?: ClientMeta,
): Promise<{ revoked: boolean; userId: number }> {
  const existing = await deps.prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      isSuperAdmin: true,
      activeSessionId: true,
      activeSessionIp: true,
      activeSessionDevice: true,
      employee: { select: { fullName: true } },
    },
  });
  if (!existing) {
    throw new NotFoundException('Không tìm thấy tài khoản');
  }
  if (existing.isSuperAdmin && existing.id !== actor.id) {
    throw new ForbiddenException({
      code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
      message: 'Không thể thu hồi phiên của tài khoản Super Admin khác',
    });
  }

  const meta = resolveClientMeta(clientMeta);
  const now = new Date().toISOString();
  const notice: RevokedSessionNotice = {
    reason: 'ADMIN_REVOKED',
    at: now,
  };

  await deps.prisma.user.update({
    where: { id: targetUserId },
    data: {
      activeSessionId: null,
      lastRevokedNotice: notice as Prisma.InputJsonValue,
    },
  });

  await deps.prisma.pushSubscription
    ?.deleteMany?.({ where: { userId: targetUserId } })
    .catch(() => undefined);

  if (existing.activeSessionId) {
    deps.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, notice);
  }

  await deps.auditLogService?.record({
    module: 'RBAC',
    action: 'Thu hồi phiên',
    detail: `${existing.employee.fullName} (${existing.username})`,
    message: `thu hồi phiên đăng nhập từ xa đối với ${existing.employee.fullName} (${existing.username})`,
    actor: actor.id,
    ipAddress: meta.ipAddress,
    deviceLabel: meta.deviceLabel,
    metadata: {
      targetUserId,
      targetUsername: existing.username,
      revokedSessionId: existing.activeSessionId ?? null,
      revokedIp: existing.activeSessionIp ?? null,
      revokedDevice: existing.activeSessionDevice ?? null,
    },
  });

  return {
    revoked: Boolean(existing.activeSessionId),
    userId: targetUserId,
  };
}

export async function getUserSessionHistoryHelper(
  deps: IamRuntimeDeps,
  targetUserId: number,
  limit = 5,
): Promise<UserSessionHistoryResponse> {
  const user = await findUserWithEmployee(deps.prisma, targetUserId);
  if (!user) {
    throw new NotFoundException('Không tìm thấy tài khoản');
  }

  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 5, 1), 20);
  const selfActions: string[] = [...SELF_SESSION_HISTORY_ACTIONS];

  const rows =
    typeof (deps.prisma as unknown as { auditLog?: { findMany?: unknown } }).auditLog?.findMany === 'function'
      ? await deps.prisma.auditLog.findMany({
          where: {
            module: 'RBAC',
            action: { in: ALL_SESSION_HISTORY_ACTIONS },
            OR: [
              { metadata: { path: ['targetUserId'], equals: targetUserId } },
              {
                AND: [
                  { actorId: targetUserId },
                  { action: { in: selfActions } },
                ],
              },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: safeLimit,
        })
      : [];

  const filteredRows = rows
    .filter((row) => {
      if (row.module !== 'RBAC' || !ALL_SESSION_HISTORY_ACTIONS.includes(row.action)) {
        return false;
      }
      const meta = asObject(row.metadata);
      if (meta.targetUserId !== undefined && meta.targetUserId !== null) {
        return Number(meta.targetUserId) === targetUserId;
      }
      return row.actorId === targetUserId && selfActions.includes(row.action);
    })
    .slice(0, safeLimit);

  return UserSessionHistoryResponseSchema.parse({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.employee.fullName,
      isSuperAdmin: user.isSuperAdmin,
      isActive: user.isActive,
    },
    currentSession: buildSessionStatus(deps, user),
    items: filteredRows.map((row) => mapSessionAuditRow(row)),
  });
}
