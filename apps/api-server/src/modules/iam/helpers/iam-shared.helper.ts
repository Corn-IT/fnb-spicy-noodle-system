import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Prisma, type MasterData, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ALLOWED_STORE_NAV_PATHS,
  AuthUserSchema,
  DisplayScalePercentSchema,
  ErrorCodes,
  ProfileResponseSchema,
  UiPreferencesSchema,
  UserAdminRecordSchema,
  UserPermissionsSchema,
  sanitizeNavGroupOrder,
  sanitizeNavOrder,
  type AuthUser,
  type ProfileResponse,
  type SessionHistoryEventType,
  type UiPreferences,
  type UserAdminRecord,
  type UserSessionStatus,
} from '@fnb/shared';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { getRequestContext } from '../../../common/context/request-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { type ClientMeta } from '../../../common/security/client-info.util';
import type { EnvConfig } from '../../../config/env.config';
import { PosSocketGateway } from '../../../gateways/pos-socket.gateway';

export const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
export const MAX_AVATAR_BYTES = 512 * 1024;
export const SELF_SESSION_HISTORY_ACTIONS = [
  'Đăng nhập',
  'Đăng nhập thất bại',
  'Đăng xuất',
  'Chiếm phiên đăng nhập',
  'Đổi mật khẩu',
] as const;
export const ADMIN_SESSION_HISTORY_ACTIONS = [
  'Thu hồi phiên',
  'Đặt lại mật khẩu',
  'Khoá / Mở tài khoản',
] as const;
export const ALL_SESSION_HISTORY_ACTIONS: string[] = [
  ...SELF_SESSION_HISTORY_ACTIONS,
  ...ADMIN_SESSION_HISTORY_ACTIONS,
];
export const STATIC_SESSION_ACTION_MAP: Record<
  string,
  { eventType: SessionHistoryEventType; label: string }
> = {
  'Đăng nhập': { eventType: 'LOGIN', label: 'Đăng nhập' },
  'Đăng nhập thất bại': { eventType: 'LOGIN_FAILED', label: 'Đăng nhập thất bại' },
  'Đăng xuất': { eventType: 'LOGOUT', label: 'Đăng xuất' },
  'Chiếm phiên đăng nhập': { eventType: 'SESSION_REPLACED', label: 'Đăng nhập mới (đá phiên cũ)' },
  'Thu hồi phiên': { eventType: 'ADMIN_REVOKED', label: 'Bị thu hồi từ xa' },
  'Đổi mật khẩu': { eventType: 'PASSWORD_CHANGED', label: 'Đổi mật khẩu' },
  'Đặt lại mật khẩu': { eventType: 'PASSWORD_RESET', label: 'Admin đặt lại mật khẩu' },
};

export const buildAvatarKey = (employeeId: number) => ({
  normalizedName: `user avatar ${employeeId}`,
  displayName: `USER_AVATAR_${employeeId}`,
});

export type UserWithEmployee = Prisma.UserGetPayload<{
  include: { employee: { include: { position: true; specialty: true } } };
}>;

export type LoginResult = { accessToken: string; refreshToken: string; user: AuthUser };
export type RefreshClaims = { sub?: unknown; tokenType?: unknown; sid?: unknown };

export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-account-password', 10);

export interface IamRuntimeDeps {
  prisma: PrismaService;
  jwtService: JwtService;
  config: ConfigService<EnvConfig, true>;
  auditLogService?: AuditLogService;
  posSocketGateway?: PosSocketGateway;
}

export async function findUserWithEmployee(prisma: PrismaService, id: number): Promise<UserWithEmployee | null> {
  return prisma.user.findUnique({
    where: { id },
    include: { employee: { include: { position: true, specialty: true } } },
  });
}

export function resolveClientMeta(clientMeta?: ClientMeta): ClientMeta {
  if (clientMeta) return clientMeta;
  const reqCtx = getRequestContext();
  return reqCtx ?? {
    ipAddress: 'unknown',
    deviceLabel: 'Không rõ thiết bị',
    userAgent: null,
  };
}

export async function issueTokens(
  deps: IamRuntimeDeps,
  user: User,
  sessionId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const permissions = UserPermissionsSchema.parse(user.permissions);
  const baseClaims = {
    sub: user.id,
    employeeId: user.employeeId,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
    permissions,
    sid: sessionId,
  };
  const accessToken = await deps.jwtService.signAsync({ ...baseClaims, tokenType: 'access' });
  const refreshToken = await deps.jwtService.signAsync(
    { sub: user.id, tokenType: 'refresh', sid: sessionId },
    { expiresIn: deps.config.get('jwtRefreshExpiresIn') as JwtSignOptions['expiresIn'] },
  );
  return { accessToken, refreshToken };
}

export function toMasterDataReference(value: MasterData | null): { id: number; name: string } | null {
  return value ? { id: value.id, name: value.name } : null;
}

export function asObject(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Reads stored preferences defensively: values saved before a screen was renamed or removed are
 * dropped instead of failing, so a stale row can never block login.
 */
export function toUiPreferences(value: Prisma.JsonValue): UiPreferences {
  const stored = asObject(value);
  const rawDisplayScale = asObject((stored.display_scale ?? stored.displayScale ?? {}) as Prisma.JsonValue);
  const rawPerPath = asObject((rawDisplayScale.perPath ?? {}) as Prisma.JsonValue);
  const allowedPaths = new Set<string>(ALLOWED_STORE_NAV_PATHS);
  const perPath = Object.fromEntries(
    Object.entries(rawPerPath).filter(
      ([path, percent]) =>
        allowedPaths.has(path) && DisplayScalePercentSchema.safeParse(percent).success,
    ),
  );
  const globalPercent = DisplayScalePercentSchema.safeParse(rawDisplayScale.globalPercent);
  const asStringList = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [];
  const asBoolean = (input: unknown): boolean | undefined =>
    typeof input === 'boolean' ? input : undefined;

  return UiPreferencesSchema.parse({
    theme: stored.theme,
    sidebarWidth: stored.sidebar_width ?? stored.sidebarWidth,
    columnWidths: stored.column_widths ?? stored.columnWidths,
    displayScale: {
      ...(globalPercent.success ? { globalPercent: globalPercent.data } : {}),
      perPath,
    },
    navOrder: sanitizeNavOrder(asStringList(stored.nav_order ?? stored.navOrder)),
    navGroupOrder: sanitizeNavGroupOrder(asStringList(stored.nav_group_order ?? stored.navGroupOrder)),
    sidebarCollapsed: asBoolean(stored.sidebar_collapsed ?? stored.sidebarCollapsed),
    voiceAlertEnabled: asBoolean(stored.voice_alert_enabled ?? stored.voiceAlertEnabled),
  });
}

export function toAuthUser(user: UserWithEmployee): AuthUser {
  return AuthUserSchema.parse({
    id: user.id,
    employeeId: user.employeeId,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
    roleLabel: user.roleLabel ?? null,
    permissions: user.permissions,
    uiPreferences: toUiPreferences(user.uiPreferences),
    employee: {
      fullName: user.employee.fullName,
      shortName: user.employee.shortName,
      avatarUrl: user.employee.avatarUrl,
      position: toMasterDataReference(user.employee.position),
      specialty: toMasterDataReference(user.employee.specialty),
    },
  });
}

export function buildSessionStatus(deps: IamRuntimeDeps, user: UserWithEmployee): UserSessionStatus {
  const sessionId =
    typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
      ? user.activeSessionId.trim()
      : null;
  return {
    isActiveSession: Boolean(sessionId),
    isSocketOnline: deps.posSocketGateway?.isSessionOnline(sessionId) ?? false,
    ipAddress: user.activeSessionIp ?? null,
    deviceLabel: user.activeSessionDevice ?? null,
    startedAt: user.activeSessionAt ? user.activeSessionAt.toISOString() : null,
  };
}

export function mapSessionAuditRow(row: {
  id: number;
  action: string;
  summary: string;
  actorUsername: string;
  actorFullName: string;
  ipAddress: string | null;
  deviceLabel: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}) {
  const meta = asObject(row.metadata);
  const metaStr = (key: string): string | null =>
    typeof meta[key] === 'string' && meta[key].trim() ? meta[key].trim() : null;

  let resolved = STATIC_SESSION_ACTION_MAP[row.action];
  if (!resolved) {
    const isUnlocked = meta.isActive === true;
    resolved = isUnlocked
      ? { eventType: 'ACCOUNT_UNLOCKED', label: 'Mở khoá tài khoản' }
      : { eventType: 'ACCOUNT_LOCKED', label: 'Khoá tài khoản' };
  }

  const previousIp =
    resolved.eventType === 'SESSION_REPLACED'
      ? metaStr('previousIp')
      : metaStr('revokedIp');
  const previousDevice =
    resolved.eventType === 'SESSION_REPLACED'
      ? metaStr('previousDevice')
      : metaStr('revokedDevice');

  return {
    id: row.id,
    eventType: resolved.eventType,
    actionLabel: resolved.label,
    summary: row.summary,
    actorUsername: row.actorUsername || null,
    actorFullName: row.actorFullName || null,
    ipAddress: row.ipAddress ?? null,
    deviceLabel: row.deviceLabel ?? null,
    previousIp,
    previousDevice,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserAdmin(deps: IamRuntimeDeps, user: UserWithEmployee): UserAdminRecord {
  const authUser = toAuthUser(user);
  return UserAdminRecordSchema.parse({
    ...authUser,
    isActive: user.isActive,
    employee: {
      id: user.employee.id,
      isDeleted: user.employee.isDeleted,
      ...authUser.employee,
    },
    session: buildSessionStatus(deps, user),
  });
}

export function toProfile(user: UserWithEmployee): ProfileResponse {
  return ProfileResponseSchema.parse({
    id: user.id,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.permissions,
    uiPreferences: toUiPreferences(user.uiPreferences),
    employee: {
      id: user.employee.id,
      fullName: user.employee.fullName,
      shortName: user.employee.shortName,
      phone: user.employee.phone,
      address: user.employee.address,
      bankName: user.employee.bankName,
      bankAccountNo: user.employee.bankAccountNo,
      bankAccountName: user.employee.bankAccountName,
      avatarUrl: user.employee.avatarUrl,
      position: toMasterDataReference(user.employee.position),
      specialty: toMasterDataReference(user.employee.specialty),
    },
    session: {
      ipAddress: user.activeSessionIp ?? null,
      deviceLabel: user.activeSessionDevice ?? null,
      startedAt: user.activeSessionAt ? user.activeSessionAt.toISOString() : null,
    },
  });
}

export function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function recordFailedLoginAttempt(
  deps: IamRuntimeDeps,
  user: UserWithEmployee,
  meta: ClientMeta,
  failureReason: 'INVALID_PASSWORD' | 'ACCOUNT_DISABLED',
): Promise<void> {
  const reasonText =
    failureReason === 'ACCOUNT_DISABLED' ? 'Tài khoản đang bị khoá' : 'Sai mật khẩu';
  await deps.auditLogService?.record({
    module: 'RBAC',
    action: 'Đăng nhập thất bại',
    detail: `${user.employee.fullName} (${user.username})`,
    message: `thử đăng nhập thất bại (${reasonText}) từ ${meta.deviceLabel} (IP: ${meta.ipAddress})`,
    actor: { id: user.id, fullName: user.employee.fullName, username: user.username },
    ipAddress: meta.ipAddress,
    deviceLabel: meta.deviceLabel,
    metadata: {
      targetUserId: user.id,
      targetUsername: user.username,
      failureReason,
    },
  });
}

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCodes.AUTH_CREDENTIALS_INVALID,
    message: 'Tên đăng nhập hoặc mật khẩu không chính xác',
  });
}

export function usernameTaken(): ConflictException {
  return new ConflictException({ code: ErrorCodes.HR_USERNAME_TAKEN, message: 'Tên đăng nhập đã được sử dụng' });
}
