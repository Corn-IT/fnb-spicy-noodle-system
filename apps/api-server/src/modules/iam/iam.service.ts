import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Prisma, type MasterData, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  AuthUserSchema,
  ChangePasswordSchema,
  ErrorCodes,
  ProfileResponseSchema,
  type SessionHistoryEventType,
  UploadAvatarSchema,
  UserAdminRecordSchema,
  UiPreferencesSchema,
  UserListQuerySchema,
  UserPermissionsSchema,
  UserSessionHistoryResponseSchema,
  type AuthPrincipal,
  type AuthUser,
  type CreateUserInput,
  type ChangePasswordInput,
  type LoginRequest,
  type ProfileResponse,
  type ResetUserPasswordInput,
  type RevokedSessionNotice,
  type UiPreferences,
  type UpdatePermissionsInput,
  type UploadAvatarInput,
  type UserListQuery,
  type UserAdminRecord,
  type UserListResponse,
  type UserSessionHistoryResponse,
  type UserSessionStatus,
  type UpdateProfileInput,
  type UpdateUiPreferencesInput,
} from '@fnb/shared';
import type { EnvConfig } from '../../config/env.config';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { getRequestContext } from '../../common/context/request-context';
import { compareUsersForDisplay } from '../../common/utils/display-order.util';
import { generateShortName } from '../../common/utils/short-name.util';
import {
  decodeValidatedImageBase64,
  detectImageMimeFromMagicBytes,
  type SupportedImageMime,
} from '../../common/utils/image-binary.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type ClientMeta } from '../../common/security/client-info.util';
import {
  assertActiveSessionMatches,
  extractTokenSessionId,
} from '../../common/security/session-validation.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const MAX_AVATAR_BYTES = 512 * 1024;
const SELF_SESSION_HISTORY_ACTIONS = [
  'Đăng nhập',
  'Đăng nhập thất bại',
  'Đăng xuất',
  'Chiếm phiên đăng nhập',
  'Đổi mật khẩu',
] as const;
const ADMIN_SESSION_HISTORY_ACTIONS = [
  'Thu hồi phiên',
  'Đặt lại mật khẩu',
  'Khoá / Mở tài khoản',
] as const;
const ALL_SESSION_HISTORY_ACTIONS: string[] = [
  ...SELF_SESSION_HISTORY_ACTIONS,
  ...ADMIN_SESSION_HISTORY_ACTIONS,
];
const STATIC_SESSION_ACTION_MAP: Record<
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
const buildAvatarKey = (employeeId: number) => ({
  normalizedName: `user avatar ${employeeId}`,
  displayName: `USER_AVATAR_${employeeId}`,
});

type UserWithEmployee = Prisma.UserGetPayload<{
  include: { employee: { include: { position: true; specialty: true } } };
}>;

type LoginResult = { accessToken: string; refreshToken: string; user: AuthUser };
type RefreshClaims = { sub?: unknown; tokenType?: unknown; sid?: unknown };

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-account-password', 10);

@Injectable()
export class IamService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
  ) {}

  async login(input: LoginRequest, clientMeta?: ClientMeta): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
      include: { employee: { include: { position: true, specialty: true } } },
    });
    if (!user || user.employee.isDeleted) {
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      throw this.invalidCredentials();
    }

    const meta = this.resolveClientMeta(clientMeta);
    if (!user.isActive) {
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      await this.recordFailedLoginAttempt(user, meta, 'ACCOUNT_DISABLED');
      throw this.invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      await this.recordFailedLoginAttempt(user, meta, 'INVALID_PASSWORD');
      throw this.invalidCredentials();
    }
    const previousSessionId =
      typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
        ? user.activeSessionId.trim()
        : null;
    const isPreviousOnline = Boolean(
      previousSessionId && this.posSocketGateway?.isSessionOnline(previousSessionId),
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

    if (typeof this.prisma.user?.update === 'function') {
      const revokedNotice: RevokedSessionNotice | null = previousSessionId
        ? {
            reason: 'NEW_LOGIN',
            at: now.toISOString(),
          }
        : null;

      await this.prisma.user.update({
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
      this.posSocketGateway?.emitSessionRevoked(previousSessionId, noticePayload);

      await this.auditLogService?.record({
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
      await this.auditLogService?.record({
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

    const publicUser = this.toAuthUser(user);
    const tokens = await this.issueTokens(user, sessionId);
    return { ...tokens, user: publicUser };
  }

  async refreshAccessToken(refreshToken: string): Promise<LoginResult> {
    let claims: RefreshClaims;
    try {
      claims = await this.jwtService.verifyAsync<RefreshClaims>(refreshToken);
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
    const user = await this.findUserWithEmployee(userId);
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

    return { ...(await this.issueTokens(user, activeSid)), user: this.toAuthUser(user) };
  }

  async logout(
    session: { userId?: number; sessionId?: string | null } | null,
    clientMeta?: ClientMeta,
  ): Promise<void> {
    if (!session?.userId || typeof this.prisma.user?.updateMany !== 'function') {
      return;
    }

    const meta = this.resolveClientMeta(clientMeta);
    const now = new Date().toISOString();
    const result = await this.prisma.user.updateMany({
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
      if (session.sessionId) {
        this.posSocketGateway?.emitSessionRevoked(session.sessionId, {
          reason: 'LOGGED_OUT',
          at: now,
        });
      }
      await this.auditLogService?.record({
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

  async revokeUserSession(
    targetUserId: number,
    actor: AuthPrincipal,
    clientMeta?: ClientMeta,
  ): Promise<{ revoked: boolean; userId: number }> {
    const existing = await this.prisma.user.findUnique({
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

    const meta = this.resolveClientMeta(clientMeta);
    const now = new Date().toISOString();
    const notice: RevokedSessionNotice = {
      reason: 'ADMIN_REVOKED',
      at: now,
    };

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        activeSessionId: null,
        lastRevokedNotice: notice as Prisma.InputJsonValue,
      },
    });

    if (existing.activeSessionId) {
      this.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, notice);
    }

    await this.auditLogService?.record({
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

  async getUserSessionHistory(targetUserId: number, limit = 5): Promise<UserSessionHistoryResponse> {
    const user = await this.findUserWithEmployee(targetUserId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 5, 1), 20);
    const selfActions: string[] = [...SELF_SESSION_HISTORY_ACTIONS];

    const rows =
      typeof (this.prisma as unknown as { auditLog?: { findMany?: unknown } }).auditLog?.findMany === 'function'
        ? await this.prisma.auditLog.findMany({
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
        const meta = this.asObject(row.metadata);
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
      currentSession: this.buildSessionStatus(user),
      items: filteredRows.map((row) => this.mapSessionAuditRow(row)),
    });
  }

  async listUsers(input: UserListQuery): Promise<UserListResponse> {
    const parsed = UserListQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Bộ lọc tài khoản không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const { page, limit, keyword } = parsed.data;
    const where: Prisma.UserWhereInput = keyword
      ? {
          OR: [
            { username: { contains: keyword, mode: 'insensitive' } },
            { employee: { is: { fullName: { contains: keyword, mode: 'insensitive' } } } },
            { employee: { is: { shortName: { contains: keyword, mode: 'insensitive' } } } },
          ],
        }
      : {};
    const users = await this.prisma.user.findMany({
      where,
      include: { employee: { include: { position: true, specialty: true } } },
      orderBy: { id: 'asc' },
    });
    const sorted = [...users].sort(compareUsersForDisplay);
    const paged = sorted.slice((page - 1) * limit, page * limit);
    return { page, limit, total: sorted.length, items: paged.map((user) => this.toUserAdmin(user)) };
  }

  async createUser(input: CreateUserInput, actor?: AuthPrincipal): Promise<UserAdminRecord> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, isDeleted: true, user: { select: { id: true } } },
    });
    if (!employee || employee.isDeleted) {
      throw new NotFoundException({ code: ErrorCodes.HR_EMPLOYEE_DELETED, message: 'Không tìm thấy nhân viên đang hoạt động' });
    }
    if (employee.user) {
      throw new ConflictException({ code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS, message: 'Nhân viên đã có tài khoản đăng nhập' });
    }
    if (await this.prisma.user.findUnique({ where: { username: input.username }, select: { id: true } })) {
      throw this.usernameTaken();
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          employeeId: input.employeeId,
          username: input.username,
          passwordHash,
          permissions: UserPermissionsSchema.parse(input.permissions) as Prisma.InputJsonObject,
        },
        include: { employee: { include: { position: true, specialty: true } } },
      });
      if (actor) {
        await this.auditLogService?.record({
          module: 'RBAC',
          action: 'Tạo tài khoản',
          detail: `${user.employee.fullName} (${user.username})`,
          message: `tạo tài khoản đăng nhập cho ${user.employee.fullName} (${user.username})`,
          actor: actor.id,
          metadata: { targetUserId: user.id, targetUsername: user.username },
        });
      }
      return this.toUserAdmin(user);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const target = error.meta?.target;
        if (Array.isArray(target) && target.includes('username')) throw this.usernameTaken();
        throw new ConflictException({ code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS, message: 'Nhân viên đã có tài khoản đăng nhập' });
      }
      throw error;
    }
  }

  async updateUserPermissions(id: number, input: UpdatePermissionsInput, actor?: AuthPrincipal): Promise<UserAdminRecord> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isSuperAdmin: true,
        permissions: true,
        isActive: true,
        activeSessionId: true,
        activeSessionIp: true,
        activeSessionDevice: true,
      },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');
    if (existing.isSuperAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
        message: 'Không thể thay đổi quyền hoặc khoá tài khoản Super Admin',
      });
    }

    const data: Prisma.UserUpdateInput = {};
    let parsedPermissions: Record<string, Record<string, boolean>> | null = null;
    if (input.permissions !== undefined) {
      parsedPermissions = UserPermissionsSchema.parse(input.permissions) as unknown as Record<string, Record<string, boolean>>;
      data.permissions = parsedPermissions as unknown as Prisma.InputJsonObject;
    }
    let disabledNotice: RevokedSessionNotice | null = null;
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
      if (input.isActive === false) {
        disabledNotice = {
          reason: 'ACCOUNT_DISABLED',
          at: new Date().toISOString(),
        };
        data.activeSessionId = null;
        data.lastRevokedNotice = disabledNotice as Prisma.InputJsonValue;
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { employee: { include: { position: true, specialty: true } } },
    });
    if (disabledNotice && existing.activeSessionId) {
      this.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, disabledNotice);
    } else if (parsedPermissions && user.isActive && existing.activeSessionId) {
      this.posSocketGateway?.emitPermissionsUpdated(
        user.id,
        UserPermissionsSchema.parse(user.permissions),
      );
    }
    if (actor) {
      const moduleLabels: Record<string, string> = {
        dashboard: 'Tổng quan (Dashboard)',
        pos: 'Bán hàng POS',
        invoices: 'Hoá đơn',
        menu: 'Thực đơn',
        inventory: 'Nhập kho',
        cashflow: 'Kết ca & Quỹ',
        employees: 'Nhân sự',
        schedules: 'Lịch tuần',
        mdm: 'Master Data',
        rbac: 'Phân quyền',
        settings: 'Cài đặt Cửa hàng',
        audit_logs: 'Lịch sử',
      };
      const actionLabels: Record<string, string> = {
        view: 'Xem',
        viewProfit: 'Xem doanh thu chi tiết & lãi',
        export: 'Xuất file Excel',
        create: 'Thêm',
        update: 'Sửa',
        delete: 'Xoá',
        write: 'Thêm / Sửa',
        edit: 'Chỉnh sửa',
        manage: 'Quản trị',
        checkout: 'Thanh toán',
        cancel_order: 'Huỷ đơn',
        split_kitchen: 'Tách bếp',
        print_provisional: 'In tạm tính',
        table_ops: 'Chuyển / Gộp bàn',
        qr_approve: 'Duyệt / Từ chối QR',
        qr_security_config: 'Cấu hình QR',
        edit_payment_method: 'Đổi PTTT',
        approve_payment_edit: 'Duyệt đổi PTTT',
        settle: 'Chốt kết ca',
        adjust_budget: 'Sửa ngân sách',
        compensate_diff: 'Bù chênh lệch',
      };
      const changes: Array<{ field: string; from: string; to: string }> = [];
      if (typeof existing.isActive === 'boolean' && input.isActive !== undefined && existing.isActive !== user.isActive) {
        changes.push({
          field: 'Trạng thái tài khoản',
          from: existing.isActive ? 'Đang hoạt động' : 'Đã khoá',
          to: user.isActive ? 'Đang hoạt động' : 'Đã khoá',
        });
      }
      if (parsedPermissions && existing.permissions && typeof existing.permissions === 'object') {
        const prevPerms = existing.permissions as Record<string, Record<string, unknown>>;
        for (const [modKey, modFlags] of Object.entries(parsedPermissions)) {
          if (!modFlags || typeof modFlags !== 'object') continue;
          const prevMod = prevPerms[modKey] && typeof prevPerms[modKey] === 'object' ? prevPerms[modKey] : {};
          for (const [flagKey, newVal] of Object.entries(modFlags)) {
            if (typeof newVal !== 'boolean') continue;
            const oldVal = Boolean(prevMod[flagKey]);
            if (oldVal !== newVal) {
              const modLabel = moduleLabels[modKey] ?? modKey;
              const actLabel = actionLabels[flagKey] ?? flagKey;
              changes.push({
                field: `${modLabel} · ${actLabel}`,
                from: oldVal ? 'Bật' : 'Tắt',
                to: newVal ? 'Bật' : 'Tắt',
              });
            }
          }
        }
      }

      const isStatusOnly = input.isActive !== undefined && input.permissions === undefined;
      await this.auditLogService?.record({
        module: 'RBAC',
        action: isStatusOnly ? 'Khoá / Mở tài khoản' : 'Cập nhật phân quyền',
        detail: `${user.employee.fullName} (${user.username})`,
        message: isStatusOnly
          ? user.isActive
            ? 'mở khoá tài khoản đăng nhập'
            : 'khoá tài khoản đăng nhập'
          : 'cập nhật ma trận phân quyền',
        actor: actor.id,
        metadata: {
          targetUserId: id,
          targetUsername: user.username,
          isActive: user.isActive,
          ...(disabledNotice && existing.activeSessionId
            ? {
                revokedIp: existing.activeSessionIp ?? null,
                revokedDevice: existing.activeSessionDevice ?? null,
              }
            : {}),
          ...(changes.length > 0 ? { changes } : {}),
        },
      });
    }
    return this.toUserAdmin(user);
  }

  async resetUserPassword(id: number, input: ResetUserPasswordInput, actor?: AuthPrincipal): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isSuperAdmin: true,
        username: true,
        activeSessionId: true,
        activeSessionIp: true,
        activeSessionDevice: true,
        employee: { select: { fullName: true } },
      },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');
    if (existing.isSuperAdmin && actor && existing.id !== actor.id) {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
        message: 'Không thể đặt lại mật khẩu cho tài khoản Super Admin khác',
      });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    const notice: RevokedSessionNotice = {
      reason: 'PASSWORD_CHANGED',
      at: new Date().toISOString(),
    };
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        activeSessionId: null,
        lastRevokedNotice: notice as Prisma.InputJsonValue,
      },
    });
    if (existing.activeSessionId) {
      this.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, notice);
    }
    if (actor) {
      await this.auditLogService?.record({
        module: 'RBAC',
        action: 'Đặt lại mật khẩu',
        detail: `${existing.employee.fullName} (${existing.username})`,
        message: `đặt lại mật khẩu đăng nhập cho ${existing.employee.fullName} (${existing.username})`,
        actor: actor.id,
        metadata: {
          targetUserId: id,
          targetUsername: existing.username,
          ...(existing.activeSessionId
            ? {
                revokedIp: existing.activeSessionIp ?? null,
                revokedDevice: existing.activeSessionDevice ?? null,
              }
            : {}),
        },
      });
    }
    return { message: 'Đặt lại mật khẩu thành công' };
  }

  async getProfile(userId: number): Promise<ProfileResponse> {
    const user = await this.findUserWithEmployee(userId);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return this.toProfile(user);
  }

  async updateProfile(userId: number, input: UpdateProfileInput): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
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
      typeof this.prisma.employee?.findMany === 'function'
    ) {
      const existingEmployees = await this.prisma.employee.findMany({
        where: { id: { not: user.employeeId }, isDeleted: false },
        select: { id: true, shortName: true },
      });
      data.shortName = generateShortName(input.fullName, existingEmployees, user.employeeId);
    }

    await this.prisma.employee.update({ where: { id: user.employeeId }, data });
    await this.auditLogService?.record({
      module: 'RBAC',
      action: 'Cập nhật hồ sơ',
      detail: input.fullName?.trim() || user.employee?.fullName || `Tài khoản #${userId}`,
      message: 'cập nhật thông tin hồ sơ cá nhân',
      actor: userId,
      metadata: { targetUserId: userId, employeeId: user.employeeId },
    });
    if (fullNameChanged) {
      this.posSocketGateway?.emitScheduleUpdated();
    }
    return this.getProfile(userId);
  }

  async uploadMyAvatar(userId: number, rawInput: UploadAvatarInput): Promise<ProfileResponse> {
    const user = await this.findUserWithEmployee(userId);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

    const parsedInput = UploadAvatarSchema.parse(rawInput);
    const {
      buffer,
      mime: detectedMime,
      canonicalBase64,
    } = decodeValidatedImageBase64(parsedInput.base64, MAX_AVATAR_BYTES, 'Ảnh đại diện');

    const updatedAt = new Date().toISOString();
    const key = buildAvatarKey(user.employeeId);

    await this.prisma.masterData.upsert({
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
    await this.prisma.employee.update({
      where: { id: user.employeeId },
      data: { avatarUrl },
    });

    await this.auditLogService?.record({
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

    return this.getProfile(userId);
  }

  async deleteMyAvatar(userId: number): Promise<ProfileResponse> {
    const user = await this.findUserWithEmployee(userId);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

    const key = buildAvatarKey(user.employeeId);
    if (typeof this.prisma.masterData?.updateMany === 'function') {
      await this.prisma.masterData.updateMany({
        where: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: key.normalizedName,
        },
        data: { isActive: false },
      });
    }

    await this.prisma.employee.update({
      where: { id: user.employeeId },
      data: { avatarUrl: null },
    });

    await this.auditLogService?.record({
      module: 'RBAC',
      action: 'Cập nhật hồ sơ',
      detail: user.employee.fullName,
      message: 'xoá ảnh đại diện cá nhân',
      actor: { id: user.id, fullName: user.employee.fullName, username: user.username },
      metadata: { targetUserId: user.id, employeeId: user.employeeId },
    });

    return this.getProfile(userId);
  }

  async getPublicAvatarBinary(employeeId: number): Promise<{ buffer: Buffer; mime: SupportedImageMime }> {
    const key = buildAvatarKey(employeeId);
    const row = await this.prisma.masterData.findUnique({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: key.normalizedName,
        },
      },
    });

    const meta = row?.isActive ? this.asObject(row.metadata) : {};
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

  async changePassword(
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

    const user = await this.prisma.user.findUnique({
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
    const meta = this.resolveClientMeta(clientMeta);
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

    await this.prisma.user.update({
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
      this.posSocketGateway?.emitSessionRevoked(previousSessionId, notice);
    }
    await this.auditLogService?.record({
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
      const tokens = await this.issueTokens(updatedUser, newSessionId);
      return {
        ...tokens,
        user: this.toAuthUser(updatedUser),
        message: 'Đổi mật khẩu thành công',
      };
    }

    return { message: 'Đổi mật khẩu thành công' };
  }

  async updateUiPreferences(userId: number, input: UpdateUiPreferencesInput): Promise<UiPreferences> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { uiPreferences: true } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    const current = this.toUiPreferences(user.uiPreferences);
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
    };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { uiPreferences: persisted as Prisma.InputJsonObject },
      select: { uiPreferences: true },
    });
    return this.toUiPreferences(updated.uiPreferences);
  }

  private async findUserWithEmployee(id: number): Promise<UserWithEmployee | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { employee: { include: { position: true, specialty: true } } },
    });
  }

  private resolveClientMeta(clientMeta?: ClientMeta): ClientMeta {
    if (clientMeta) return clientMeta;
    const reqCtx = getRequestContext();
    return reqCtx ?? {
      ipAddress: 'unknown',
      deviceLabel: 'Không rõ thiết bị',
      userAgent: null,
    };
  }

  private async issueTokens(user: User, sessionId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const permissions = UserPermissionsSchema.parse(user.permissions);
    const baseClaims = {
      sub: user.id,
      employeeId: user.employeeId,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
      sid: sessionId,
    };
    const accessToken = await this.jwtService.signAsync({ ...baseClaims, tokenType: 'access' });
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, tokenType: 'refresh', sid: sessionId },
      { expiresIn: this.config.get('jwtRefreshExpiresIn') as JwtSignOptions['expiresIn'] },
    );
    return { accessToken, refreshToken };
  }

  private toAuthUser(user: UserWithEmployee): AuthUser {
    return AuthUserSchema.parse({
      id: user.id,
      employeeId: user.employeeId,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      uiPreferences: this.toUiPreferences(user.uiPreferences),
      employee: {
        fullName: user.employee.fullName,
        shortName: user.employee.shortName,
        avatarUrl: user.employee.avatarUrl,
        position: this.toMasterDataReference(user.employee.position),
        specialty: this.toMasterDataReference(user.employee.specialty),
      },
    });
  }

  private buildSessionStatus(user: UserWithEmployee): UserSessionStatus {
    const sessionId =
      typeof user.activeSessionId === 'string' && user.activeSessionId.trim().length > 0
        ? user.activeSessionId.trim()
        : null;
    return {
      isActiveSession: Boolean(sessionId),
      isSocketOnline: this.posSocketGateway?.isSessionOnline(sessionId) ?? false,
      ipAddress: user.activeSessionIp ?? null,
      deviceLabel: user.activeSessionDevice ?? null,
      startedAt: user.activeSessionAt ? user.activeSessionAt.toISOString() : null,
    };
  }

  private mapSessionAuditRow(row: {
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
    const meta = this.asObject(row.metadata);
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

  private toUserAdmin(user: UserWithEmployee): UserAdminRecord {
    const authUser = this.toAuthUser(user);
    return UserAdminRecordSchema.parse({
      ...authUser,
      isActive: user.isActive,
      employee: { id: user.employee.id, ...authUser.employee },
      session: this.buildSessionStatus(user),
    });
  }

  private toProfile(user: UserWithEmployee): ProfileResponse {
    return ProfileResponseSchema.parse({
      id: user.id,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      uiPreferences: this.toUiPreferences(user.uiPreferences),
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
        position: this.toMasterDataReference(user.employee.position),
        specialty: this.toMasterDataReference(user.employee.specialty),
      },
      session: {
        ipAddress: user.activeSessionIp ?? null,
        deviceLabel: user.activeSessionDevice ?? null,
        startedAt: user.activeSessionAt ? user.activeSessionAt.toISOString() : null,
      },
    });
  }

  private toMasterDataReference(value: MasterData | null): { id: number; name: string } | null {
    return value ? { id: value.id, name: value.name } : null;
  }

  private asObject(value: Prisma.JsonValue): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private toUiPreferences(value: Prisma.JsonValue): UiPreferences {
    const stored = this.asObject(value);
    return UiPreferencesSchema.parse({
      theme: stored.theme,
      sidebarWidth: stored.sidebar_width ?? stored.sidebarWidth,
      columnWidths: stored.column_widths ?? stored.columnWidths,
    });
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private async recordFailedLoginAttempt(
    user: UserWithEmployee,
    meta: ClientMeta,
    failureReason: 'INVALID_PASSWORD' | 'ACCOUNT_DISABLED',
  ): Promise<void> {
    const reasonText =
      failureReason === 'ACCOUNT_DISABLED' ? 'Tài khoản đang bị khoá' : 'Sai mật khẩu';
    await this.auditLogService?.record({
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

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCodes.AUTH_CREDENTIALS_INVALID,
      message: 'Tên đăng nhập hoặc mật khẩu không chính xác',
    });
  }

  private usernameTaken(): ConflictException {
    return new ConflictException({ code: ErrorCodes.HR_USERNAME_TAKEN, message: 'Tên đăng nhập đã được sử dụng' });
  }
}
