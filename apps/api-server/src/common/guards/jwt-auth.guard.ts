import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCodes, UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type JwtRequest = Request & { user?: AuthPrincipal };
type AccessTokenPayload = { sub?: unknown; tokenType?: unknown };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<JwtRequest>();
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw this.unauthorized(ErrorCodes.AUTH_TOKEN_MISSING, 'Yêu cầu đăng nhập để truy cập tài nguyên');
    }

    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match?.[1]) {
      throw this.unauthorized(ErrorCodes.AUTH_TOKEN_INVALID, 'Access token không hợp lệ');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(match[1]);
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw this.unauthorized(
        expired ? ErrorCodes.AUTH_TOKEN_EXPIRED : ErrorCodes.AUTH_TOKEN_INVALID,
        expired ? 'Phiên đăng nhập đã hết hạn, vui lòng làm mới token' : 'Access token không hợp lệ',
      );
    }

    const userId = typeof payload.sub === 'number' ? payload.sub : Number(payload.sub);
    if (payload.tokenType !== 'access' || !Number.isSafeInteger(userId) || userId < 1) {
      throw this.unauthorized(ErrorCodes.AUTH_TOKEN_INVALID, 'Access token không hợp lệ');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, employeeId: true, username: true, isSuperAdmin: true, permissions: true, isActive: true },
    });
    if (!user?.isActive) {
      throw this.unauthorized(ErrorCodes.AUTH_TOKEN_INVALID, 'Tài khoản không hoạt động');
    }

    const parsedPermissions = UserPermissionsSchema.safeParse(user.permissions);
    if (!parsedPermissions.success) {
      throw this.unauthorized(ErrorCodes.AUTH_TOKEN_INVALID, 'Thông tin tài khoản không hợp lệ');
    }

    request.user = {
      id: user.id,
      employeeId: user.employeeId,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
      permissions: parsedPermissions.data,
    };
    return true;
  }

  private unauthorized(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }
}
