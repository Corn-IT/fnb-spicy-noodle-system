import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ErrorCodes,
  UserListQuerySchema,
  UserPermissionsSchema,
  resolveUserRoleDisplay,
  type AuthPrincipal,
  type CreateUserInput,
  type ResetUserPasswordInput,
  type RevokedSessionNotice,
  type UpdatePermissionsInput,
  type UpdateUserAccountInput,
  type UserAdminRecord,
  type UserListQuery,
  type UserListResponse,
} from '@fnb/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { compareUsersForDisplay } from '../../../common/utils/display-order.util';
import { buildIyFallbackKeywords, queryMatchingIdsBySearchNorm } from '../../../common/utils/search-normalize.util';
import {
  isUniqueConstraintError,
  toUserAdmin,
  usernameTaken,
  type IamRuntimeDeps,
  type UserWithEmployee,
} from './iam-shared.helper';

export async function listUsersHelper(deps: IamRuntimeDeps, input: UserListQuery): Promise<UserListResponse> {
  const parsed = UserListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new UnprocessableEntityException({
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Bộ lọc tài khoản không hợp lệ',
      details: { fieldErrors: parsed.error.flatten().fieldErrors },
    });
  }
  const { page, limit, keyword } = parsed.data;
  let where: Prisma.UserWhereInput = {};
  if (keyword) {
    const [matchedUserIds, matchedEmpIds, matchedPositionIds] = await Promise.all([
      queryMatchingIdsBySearchNorm(deps.prisma, 'users', ['username', 'role_label'], keyword),
      queryMatchingIdsBySearchNorm(deps.prisma, 'employees', ['full_name', 'short_name'], keyword),
      queryMatchingIdsBySearchNorm(deps.prisma, 'master_data', ['name'], keyword),
    ]);
    if (matchedUserIds !== null || matchedEmpIds !== null || matchedPositionIds !== null) {
      where = {
        OR: [
          ...(matchedUserIds ? [{ id: { in: matchedUserIds } }] : []),
          ...(matchedEmpIds ? [{ employeeId: { in: matchedEmpIds } }] : []),
          ...(matchedPositionIds
            ? [{ employee: { is: { positionId: { in: matchedPositionIds } } } }]
            : []),
        ],
      };
    } else {
      const variants = buildIyFallbackKeywords(keyword);
      where = {
        OR: variants.flatMap((v) => [
          { username: { contains: v, mode: 'insensitive' as const } },
          { roleLabel: { contains: v, mode: 'insensitive' as const } },
          { employee: { is: { fullName: { contains: v, mode: 'insensitive' as const } } } },
          { employee: { is: { shortName: { contains: v, mode: 'insensitive' as const } } } },
          { employee: { is: { position: { is: { name: { contains: v, mode: 'insensitive' as const } } } } } },
        ]),
      };
    }
  }
  const users = await deps.prisma.user.findMany({
    where,
    include: { employee: { include: { position: true, specialty: true } } },
    orderBy: { id: 'asc' },
  });
  const sorted = [...users].sort(compareUsersForDisplay);
  const paged = sorted.slice((page - 1) * limit, page * limit);
  return { page, limit, total: sorted.length, items: paged.map((user) => toUserAdmin(deps, user)) };
}

export async function createUserHelper(
  deps: IamRuntimeDeps,
  input: CreateUserInput,
  actor?: AuthPrincipal,
): Promise<UserAdminRecord> {
  const employee = await deps.prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, isDeleted: true, user: { select: { id: true } } },
  });
  if (!employee || employee.isDeleted) {
    throw new NotFoundException({ code: ErrorCodes.HR_EMPLOYEE_DELETED, message: 'Không tìm thấy nhân viên đang hoạt động' });
  }
  if (employee.user) {
    throw new ConflictException({ code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS, message: 'Nhân viên đã có tài khoản đăng nhập' });
  }
  if (await deps.prisma.user.findUnique({ where: { username: input.username }, select: { id: true } })) {
    throw usernameTaken();
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const normalizedRoleLabel = input.roleLabel?.trim() || null;
  try {
    const user = await deps.prisma.user.create({
      data: {
        employeeId: input.employeeId,
        username: input.username,
        passwordHash,
        roleLabel: normalizedRoleLabel,
        permissions: UserPermissionsSchema.parse(input.permissions) as Prisma.InputJsonObject,
      },
      include: { employee: { include: { position: true, specialty: true } } },
    });
    if (actor) {
      await deps.auditLogService?.record({
        module: 'RBAC',
        action: 'Tạo tài khoản',
        detail: `${user.employee.fullName} (${user.username})`,
        message: `tạo tài khoản đăng nhập cho ${user.employee.fullName} (${user.username})`,
        actor: actor.id,
        metadata: { targetUserId: user.id, targetUsername: user.username },
      });
    }
    return toUserAdmin(deps, user);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes('username')) throw usernameTaken();
      throw new ConflictException({ code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS, message: 'Nhân viên đã có tài khoản đăng nhập' });
    }
    throw error;
  }
}

export async function updateUserAccountHelper(
  deps: IamRuntimeDeps,
  id: number,
  input: UpdateUserAccountInput,
  actor?: AuthPrincipal,
): Promise<UserAdminRecord> {
  const runTx = async (tx: Prisma.TransactionClient | PrismaService) => {
    const existing = await tx.user.findUnique({
      where: { id },
      include: { employee: { include: { position: true, specialty: true } } },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');
    if (existing.isSuperAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
        message: 'Không thể thay đổi thông tin hoặc khoá tài khoản Super Admin',
      });
    }

    const data: Prisma.UserUncheckedUpdateInput = {};

    if (input.employeeId !== undefined && input.employeeId !== existing.employeeId) {
      const targetEmployee = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, fullName: true, isDeleted: true, user: { select: { id: true } } },
      });
      if (!targetEmployee || targetEmployee.isDeleted) {
        throw new NotFoundException({
          code: ErrorCodes.HR_EMPLOYEE_DELETED,
          message: 'Không tìm thấy nhân viên đang hoạt động',
        });
      }
      if (targetEmployee.user && targetEmployee.user.id !== id) {
        throw new ConflictException({
          code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS,
          message: 'Nhân viên đã có tài khoản đăng nhập',
        });
      }
      data.employeeId = input.employeeId;
    }

    if (input.username !== undefined && input.username !== existing.username) {
      const taken = await tx.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      });
      if (taken && taken.id !== id) {
        throw usernameTaken();
      }
      data.username = input.username;
    }

    if (input.roleLabel !== undefined) {
      data.roleLabel = input.roleLabel?.trim() || null;
    }

    const identityChanged =
      (data.employeeId !== undefined && data.employeeId !== existing.employeeId) ||
      (data.username !== undefined && data.username !== existing.username);

    let revokedNotice: RevokedSessionNotice | null = null;
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
      if (input.isActive === false) {
        revokedNotice = {
          reason: 'ACCOUNT_DISABLED',
          at: new Date().toISOString(),
        };
        data.activeSessionId = null;
        data.lastRevokedNotice = revokedNotice as Prisma.InputJsonValue;
      }
    }

    if (!revokedNotice && identityChanged && existing.activeSessionId) {
      revokedNotice = {
        reason: 'ADMIN_REVOKED',
        at: new Date().toISOString(),
      };
      data.activeSessionId = null;
      data.lastRevokedNotice = revokedNotice as Prisma.InputJsonValue;
    }

    const updated = await tx.user.update({
      where: { id },
      data,
      include: { employee: { include: { position: true, specialty: true } } },
    });

    return { existing, updated, revokedNotice };
  };

  let result: {
    existing: UserWithEmployee;
    updated: UserWithEmployee;
    revokedNotice: RevokedSessionNotice | null;
  };
  try {
    result =
      typeof deps.prisma.$transaction === 'function'
        ? await deps.prisma.$transaction((tx) => runTx(tx))
        : await runTx(deps.prisma);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes('username')) throw usernameTaken();
      throw new ConflictException({
        code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS,
        message: 'Nhân viên đã có tài khoản đăng nhập',
      });
    }
    throw error;
  }

  const { existing, updated, revokedNotice } = result;
  if (revokedNotice && existing.activeSessionId) {
    deps.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, revokedNotice);
    await deps.prisma.pushSubscription
      ?.deleteMany?.({ where: { userId: updated.id } })
      .catch(() => undefined);
  }

  if (actor) {
    const changes: Array<{ field: string; from: string; to: string }> = [];
    if (existing.employeeId !== updated.employeeId) {
      changes.push({
        field: 'Nhân sự liên kết',
        from: existing.employee.fullName,
        to: updated.employee.fullName,
      });
    }
    if (existing.username !== updated.username) {
      changes.push({
        field: 'Tên đăng nhập',
        from: existing.username,
        to: updated.username,
      });
    }
    const prevRoleDisplay = resolveUserRoleDisplay({
      isSuperAdmin: existing.isSuperAdmin,
      roleLabel: existing.roleLabel,
      positionName: existing.employee.position?.name,
    });
    const nextRoleDisplay = resolveUserRoleDisplay({
      isSuperAdmin: updated.isSuperAdmin,
      roleLabel: updated.roleLabel,
      positionName: updated.employee.position?.name,
    });
    if ((existing.roleLabel ?? null) !== (updated.roleLabel ?? null) || prevRoleDisplay !== nextRoleDisplay) {
      changes.push({
        field: 'Vai trò',
        from: prevRoleDisplay,
        to: nextRoleDisplay,
      });
    }
    if (existing.isActive !== updated.isActive) {
      changes.push({
        field: 'Trạng thái tài khoản',
        from: existing.isActive ? 'Đang hoạt động' : 'Đã khoá',
        to: updated.isActive ? 'Đang hoạt động' : 'Đã khoá',
      });
    }

    const isStatusOnly =
      input.isActive !== undefined &&
      input.employeeId === undefined &&
      input.username === undefined &&
      input.roleLabel === undefined;

    await deps.auditLogService?.record({
      module: 'RBAC',
      action: isStatusOnly ? 'Khoá / Mở tài khoản' : 'Cập nhật tài khoản',
      detail: `${updated.employee.fullName} (${updated.username})`,
      message: isStatusOnly
        ? updated.isActive
          ? 'mở khoá tài khoản đăng nhập'
          : 'khoá tài khoản đăng nhập'
        : 'cập nhật thông tin tài khoản đăng nhập',
      actor: actor.id,
      metadata: {
        targetUserId: id,
        targetUsername: updated.username,
        isActive: updated.isActive,
        ...(revokedNotice && existing.activeSessionId
          ? {
              revokedIp: existing.activeSessionIp ?? null,
              revokedDevice: existing.activeSessionDevice ?? null,
            }
          : {}),
        ...(changes.length > 0 ? { changes } : {}),
      },
    });
  }

  return toUserAdmin(deps, updated);
}

export async function updateUserPermissionsHelper(
  deps: IamRuntimeDeps,
  id: number,
  input: UpdatePermissionsInput,
  actor?: AuthPrincipal,
): Promise<UserAdminRecord> {
  const existing = await deps.prisma.user.findUnique({
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

  const user = await deps.prisma.user.update({
    where: { id },
    data,
    include: { employee: { include: { position: true, specialty: true } } },
  });
  if (disabledNotice && existing.activeSessionId) {
    deps.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, disabledNotice);
    await deps.prisma.pushSubscription
      ?.deleteMany?.({ where: { userId: user.id } })
      .catch(() => undefined);
  } else if (parsedPermissions && user.isActive && existing.activeSessionId) {
    const nextPerms = UserPermissionsSchema.parse(user.permissions);
    if (!user.isSuperAdmin && !nextPerms.pos?.view) {
      await deps.prisma.pushSubscription
        ?.deleteMany?.({ where: { userId: user.id } })
        .catch(() => undefined);
    }
    deps.posSocketGateway?.emitPermissionsUpdated(
      user.id,
      nextPerms,
    );
  }
  if (actor) {
    const moduleLabels: Record<string, string> = {
      dashboard: 'Tổng quan (Dashboard)',
      pos: 'Bán hàng POS',
      menu: 'Quản trị Thực đơn',
      invoices: 'Quản lý Hoá đơn',
      inventory: 'Nhập hàng Kho',
      cashflow: 'Ngân sách & Kết ca',
      paymentQr: 'Mã QR thanh toán',
      discounts: 'Mã giảm giá',
      employees: 'Hồ sơ Nhân sự',
      schedules: 'Bảng tính ngày công',
      payroll: 'Bảng tính lương',
      mdm: 'Quản trị Master Data',
      rbac: 'Phân quyền Hệ thống',
      settings: 'Cài đặt Cửa hàng',
    };
    const actionLabels: Record<string, string> = {
      view: 'Xem',
      viewProfit: 'Xem doanh thu chi tiết, két & lãi',
      export: 'Xuất file Excel',
      create: 'Thêm mới',
      update: 'Cập nhật / Sửa',
      delete: 'Xoá',
      deleteDrafts: 'Xóa giỏ lưu tạm',
      splitKitchen: 'Tách bếp',
      tableAction: 'Đổi / Gộp bàn',
      checkout: 'Thanh toán',
      openCashDrawer: 'Mở két tiền tự do',
      manualDiscount: 'Giảm giá tay trực tiếp',
      qrSecurity: 'Bảo mật QR',
      manageStations: 'Quản lý khu vực bếp',
      manageCategories: 'Quản lý danh mục con',
      import: 'Nhập file Excel',
      reprint: 'In lại',
      approve: 'Duyệt sửa PTTT',
      void: 'Huỷ đơn',
      compensate: 'Bù chênh lệch',
      config: 'Cấu hình',
      resetPassword: 'Đặt lại mật khẩu',
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
    await deps.auditLogService?.record({
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
  return toUserAdmin(deps, user);
}

export async function resetUserPasswordHelper(
  deps: IamRuntimeDeps,
  id: number,
  input: ResetUserPasswordInput,
  actor?: AuthPrincipal,
): Promise<{ message: string }> {
  const existing = await deps.prisma.user.findUnique({
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
  await deps.prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      activeSessionId: null,
      lastRevokedNotice: notice as Prisma.InputJsonValue,
    },
  });
  await deps.prisma.pushSubscription
    ?.deleteMany?.({ where: { userId: id } })
    .catch(() => undefined);
  if (existing.activeSessionId) {
    deps.posSocketGateway?.emitSessionRevoked(existing.activeSessionId, notice);
  }
  if (actor) {
    await deps.auditLogService?.record({
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
