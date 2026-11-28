import { randomUUID } from 'node:crypto';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ChangePasswordSchema,
  ErrorCodes,
  UploadAvatarSchema,
  type AuthUser,
  type ChangePasswordInput,
  type ProfileResponse,
  type RevokedSessionNotice,
  type UiPreferences,
  type UpdateProfileInput,
  type UpdateUiPreferencesInput,
  type UploadAvatarInput,
} from '@fnb/shared';
import { type ClientMeta } from '../../../common/security/client-info.util';
import {
  decodeValidatedImageBase64,
  detectImageMimeFromMagicBytes,
  type SupportedImageMime,
} from '../../../common/utils/image-binary.util';
import { generateShortName } from '../../../common/utils/short-name.util';
import {
  MAX_AVATAR_BYTES,
  SYSTEM_CONFIG_CATEGORY,
  asObject,
  buildAvatarKey,
  findUserWithEmployee,
  issueTokens,
  resolveClientMeta,
  toAuthUser,
  toProfile,
  toUiPreferences,
  type IamRuntimeDeps,
} from './iam-shared.helper';

export async function getProfileHelper(deps: IamRuntimeDeps, userId: number): Promise<ProfileResponse> {
  const user = await findUserWithEmployee(deps.prisma, userId);
  if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
  return toProfile(user);
}

export async function updateProfileHelper(
  deps: IamRuntimeDeps,
  userId: number,
  input: UpdateProfileInput,
): Promise<ProfileResponse> {
  const user = await deps.prisma.user.findUnique({
    where: { id: userId },
    select: { employeeId: true, employee: { select: { fullName: true, shortName: true } } },
  });
  if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

  const data: Prisma.EmployeeUncheckedUpdateInput = { ...input };
  const fullNameChanged =
    input.fullName !== undefined &&
    input.fullName.trim() !== (user.employee?.fullName ?? '').trim();
  if (
    input.fullName !== undefined &&
    (fullNameChanged || !user.employee?.shortName) &&
    typeof deps.prisma.employee?.findMany === 'function'
  ) {
    const existingEmployees = await deps.prisma.employee.findMany({
      where: { id: { not: user.employeeId }, isDeleted: false },
      select: { id: true, shortName: true },
    });
    data.shortName = generateShortName(input.fullName, existingEmployees, user.employeeId);
  }

  await deps.prisma.employee.update({ where: { id: user.employeeId }, data });
  await deps.auditLogService?.record({
    module: 'RBAC',
    action: 'Cập nhật hồ sơ',
    detail: input.fullName?.trim() || user.employee?.fullName || `Tài khoản #${userId}`,
    message: 'cập nhật thông tin hồ sơ cá nhân',
    actor: userId,
    metadata: { targetUserId: userId, employeeId: user.employeeId },
  });
  if (fullNameChanged) {
    deps.posSocketGateway?.emitScheduleUpdated();
  }
  return getProfileHelper(deps, userId);
}

export async function uploadMyAvatarHelper(
  deps: IamRuntimeDeps,
  userId: number,
  rawInput: UploadAvatarInput,
): Promise<ProfileResponse> {
  const user = await findUserWithEmployee(deps.prisma, userId);
  if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

  const parsedInput = UploadAvatarSchema.parse(rawInput);
  const {
    buffer,
    mime: detectedMime,
    canonicalBase64,
  } = decodeValidatedImageBase64(parsedInput.base64, MAX_AVATAR_BYTES, 'Ảnh đại diện');

  const updatedAt = new Date().toISOString();
  const key = buildAvatarKey(user.employeeId);

  await deps.prisma.masterData.upsert({
    where: {
      category_normalizedName: {
        category: SYSTEM_CONFIG_CATEGORY,
        normalizedName: key.normalizedName,
      },
    },
    update: {
      name: key.displayName,
      metadata: {
        mime: detectedMime,
        base64: canonicalBase64,
        byteSize: buffer.byteLength,
        updatedAt,
      } as Prisma.InputJsonObject,
      isActive: true,
    },
    create: {
      category: SYSTEM_CONFIG_CATEGORY,
      name: key.displayName,
      normalizedName: key.normalizedName,
      metadata: {
        mime: detectedMime,
        base64: canonicalBase64,
        byteSize: buffer.byteLength,
        updatedAt,
      } as Prisma.InputJsonObject,
      isActive: true,
    },
  });

  const avatarUrl = `/api/v1/public/avatars/${user.employeeId}?v=${encodeURIComponent(updatedAt)}`;
  await deps.prisma.employee.update({
    where: { id: user.employeeId },
    data: { avatarUrl },
  });

  await deps.auditLogService?.record({
    module: 'RBAC',
    action: 'Cập nhật hồ sơ',
    detail: user.employee.fullName,
    message: `cập nhật ảnh đại diện cá nhân (${detectedMime}, ${buffer.byteLength} bytes)`,
    actor: { id: user.id, fullName: user.employee.fullName, username: user.username },
    metadata: {
      targetUserId: user.id,
      employeeId: user.employeeId,
      mime: detectedMime,
      byteSize: buffer.byteLength,
    },
  });

  return getProfileHelper(deps, userId);
}

export async function deleteMyAvatarHelper(deps: IamRuntimeDeps, userId: number): Promise<ProfileResponse> {
  const user = await findUserWithEmployee(deps.prisma, userId);
  if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

  const key = buildAvatarKey(user.employeeId);
  if (typeof deps.prisma.masterData?.updateMany === 'function') {
    await deps.prisma.masterData.updateMany({
      where: {
        category: SYSTEM_CONFIG_CATEGORY,
        normalizedName: key.normalizedName,
      },
      data: { isActive: false },
    });
  }

  await deps.prisma.employee.update({
    where: { id: user.employeeId },
    data: { avatarUrl: null },
  });

  await deps.auditLogService?.record({
    module: 'RBAC',
    action: 'Cập nhật hồ sơ',
    detail: user.employee.fullName,
    message: 'xoá ảnh đại diện cá nhân',
    actor: { id: user.id, fullName: user.employee.fullName, username: user.username },
    metadata: { targetUserId: user.id, employeeId: user.employeeId },
  });

  return getProfileHelper(deps, userId);
}

export async function getPublicAvatarBinaryHelper(
  deps: IamRuntimeDeps,
  employeeId: number,
): Promise<{ buffer: Buffer; mime: SupportedImageMime }> {
  const key = buildAvatarKey(employeeId);
  const row = await deps.prisma.masterData.findUnique({
    where: {
      category_normalizedName: {
        category: SYSTEM_CONFIG_CATEGORY,
        normalizedName: key.normalizedName,
      },
    },
  });

  const meta = row?.isActive ? asObject(row.metadata) : {};
  const rawBase64 = typeof meta.base64 === 'string' ? meta.base64 : '';
  if (!rawBase64) {
    throw new NotFoundException('Không tìm thấy ảnh đại diện');
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  const detectedMime = detectImageMimeFromMagicBytes(buffer);
  if (!detectedMime) {
    throw new NotFoundException('Dữ liệu ảnh đại diện không hợp lệ');
  }

  return { buffer, mime: detectedMime };
}

export async function changePasswordHelper(
  deps: IamRuntimeDeps,
  userId: number,
  input: ChangePasswordInput,
  actorSessionId?: string | null,
  clientMeta?: ClientMeta,
): Promise<{ accessToken?: string; refreshToken?: string; user?: AuthUser; message: string }> {
  const parsed = ChangePasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new UnprocessableEntityException({
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Thông tin đổi mật khẩu không hợp lệ',
      details: { fieldErrors: parsed.error.flatten().fieldErrors },
    });
  }

  const user = await deps.prisma.user.findUnique({
    where: { id: userId },
    include: { employee: { include: { position: true, specialty: true } } },
  });
  if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    throw new UnprocessableEntityException({
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Mật khẩu hiện tại không chính xác',
      details: {
        fieldErrors: {
          currentPassword: ['Mật khẩu hiện tại không chính xác'],
        },
      },
    });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const meta = resolveClientMeta(clientMeta);
  const now = new Date();
  const previousSessionId =
    typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
      ? user.activeSessionId.trim()
      : null;
  const newSessionId = randomUUID();
  const isRevokingOtherSession = Boolean(
    previousSessionId && actorSessionId && previousSessionId !== actorSessionId,
  );
  const notice: RevokedSessionNotice | null = isRevokingOtherSession
    ? {
        reason: 'PASSWORD_CHANGED',
        at: now.toISOString(),
      }
    : null;

  await deps.prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      activeSessionId: newSessionId,
      activeSessionIp: meta.ipAddress,
      activeSessionDevice: meta.deviceLabel,
      activeSessionAgent: meta.userAgent,
      activeSessionAt: now,
      lastRevokedNotice: (notice ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  });
  if (previousSessionId && notice) {
    deps.posSocketGateway?.emitSessionRevoked(previousSessionId, notice);
  }
  await deps.auditLogService?.record({
    module: 'RBAC',
    action: 'Đổi mật khẩu',
    detail: user.employee?.fullName ? `${user.employee.fullName} (${user.username})` : `Tài khoản #${userId}`,
    message: 'đổi mật khẩu tài khoản cá nhân',
    actor: userId,
    ipAddress: meta.ipAddress,
    deviceLabel: meta.deviceLabel,
    metadata: { targetUserId: userId, newSessionId },
  });

  if (user.employee) {
    const updatedUser = {
      ...user,
      passwordHash,
      activeSessionId: newSessionId,
      activeSessionIp: meta.ipAddress,
      activeSessionDevice: meta.deviceLabel,
      activeSessionAgent: meta.userAgent,
      activeSessionAt: now,
    };
    const tokens = await issueTokens(deps, updatedUser, newSessionId);
    return {
      ...tokens,
      user: toAuthUser(updatedUser),
      message: 'Đổi mật khẩu thành công',
    };
  }

  return { message: 'Đổi mật khẩu thành công' };
}

export async function updateUiPreferencesHelper(
  deps: IamRuntimeDeps,
  userId: number,
  input: UpdateUiPreferencesInput,
): Promise<UiPreferences> {
  // The read-merge-write below must be atomic per account: two quick saves (two devices, or a theme
  // toggle racing a menu change) would otherwise each merge into the same stale snapshot and the
  // later write would silently erase the earlier one.
  const updated = await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { uiPreferences: true } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    const current = toUiPreferences(user.uiPreferences);
    const merged = {
      ...current,
      ...input,
      ...(input.columnWidths
        ? { columnWidths: { ...current.columnWidths, ...input.columnWidths } }
        : {}),
    };
    const persisted = {
      theme: merged.theme,
      sidebar_width: merged.sidebarWidth,
      column_widths: merged.columnWidths,
      display_scale: merged.displayScale,
      nav_order: merged.navOrder,
      nav_group_order: merged.navGroupOrder,
      sidebar_collapsed: merged.sidebarCollapsed,
      ...(merged.voiceAlertEnabled === undefined
        ? {}
        : { voice_alert_enabled: merged.voiceAlertEnabled }),
    };
    return tx.user.update({
      where: { id: userId },
      data: { uiPreferences: persisted as Prisma.InputJsonObject },
      select: { uiPreferences: true },
    });
  });
  const saved = toUiPreferences(updated.uiPreferences);
  // Announced only after the transaction has committed and released its lock, so other devices of
  // this account refresh straight away without anything external running under the row lock.
  deps.posSocketGateway?.emitAccountPreferencesUpdated(userId, saved);
  return saved;
}
