import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes, UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import type { Request } from 'express';
import {
  AUTHORIZATION_METADATA,
  type AuthorizationRequirement,
} from '../decorators/permissions.decorator';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };
type PermissionRecord = Record<string, unknown>;

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_TOKEN_MISSING,
        message: 'Yêu cầu đăng nhập để truy cập tài nguyên',
      });
    }

    const requirement = this.reflector.getAllAndOverride<AuthorizationRequirement | undefined>(
      AUTHORIZATION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (user.isSuperAdmin) return true;
    if (!requirement) return true;

    if ('superAdminOnly' in requirement) {
      throw this.forbidden(ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED, 'Chỉ Super Admin mới được thực hiện thao tác này');
    }

    const parsed = UserPermissionsSchema.safeParse(user.permissions);
    const modulePermissions = parsed.success
      ? parsed.data[requirement.module as keyof typeof parsed.data]
      : undefined;
    const allowed = modulePermissions && typeof modulePermissions === 'object'
      ? (modulePermissions as Record<string, unknown>)[requirement.action] === true
      : false;

    if (allowed) return true;

    if (requirement.module === 'pos' && ['splitKitchen', 'tableAction', 'checkout'].includes(requirement.action)) {
      const rawPermissions = user.permissions as unknown as PermissionRecord;
      const rawPos = rawPermissions.pos && typeof rawPermissions.pos === 'object'
        ? rawPermissions.pos as PermissionRecord
        : {};
      const rawSubPermission = rawPos[requirement.action];
      if (rawSubPermission === undefined && (rawPos.create === true || rawPos.update === true)) return true;
    }

    throw this.forbidden(ErrorCodes.RBAC_PERMISSION_DENIED, 'Bạn không có quyền thực hiện thao tác này');
  }

  private forbidden(code: string, message: string): ForbiddenException {
    return new ForbiddenException({ code, message });
  }
}
