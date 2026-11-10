import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
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
  UserAdminRecordSchema,
  UiPreferencesSchema,
  UserListQuerySchema,
  UserPermissionsSchema,
  type AuthUser,
  type CreateUserInput,
  type ChangePasswordInput,
  type LoginRequest,
  type ProfileResponse,
  type UiPreferences,
  type UpdatePermissionsInput,
  type UserListQuery,
  type UserAdminRecord,
  type UserListResponse,
  type UpdateProfileInput,
  type UpdateUiPreferencesInput,
} from '@fnb/shared';
import type { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../common/prisma/prisma.service';

type UserWithEmployee = Prisma.UserGetPayload<{
  include: { employee: { include: { position: true; specialty: true } } };
}>;

type LoginResult = { accessToken: string; refreshToken: string; user: AuthUser };
type RefreshClaims = { sub?: unknown; tokenType?: unknown };

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-account-password', 10);

@Injectable()
export class IamService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async login(input: LoginRequest): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
      include: { employee: { include: { position: true, specialty: true } } },
    });
    if (!user || !user.isActive || user.employee.isDeleted) {
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      throw this.invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) throw this.invalidCredentials();

    const publicUser = this.toAuthUser(user);
    const tokens = await this.issueTokens(user);
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
    return { ...(await this.issueTokens(user)), user: this.toAuthUser(user) };
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
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { employee: { include: { position: true, specialty: true } } },
        orderBy: { username: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { page, limit, total, items: users.map((user) => this.toUserAdmin(user)) };
  }

  async createUser(input: CreateUserInput): Promise<UserAdminRecord> {
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

  async updateUserPermissions(id: number, input: UpdatePermissionsInput): Promise<UserAdminRecord> {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true, isSuperAdmin: true } });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');
    if (existing.isSuperAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
        message: 'Không thể thay đổi quyền hoặc khoá tài khoản Super Admin',
      });
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.permissions !== undefined) {
      data.permissions = UserPermissionsSchema.parse(input.permissions) as Prisma.InputJsonObject;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { employee: { include: { position: true, specialty: true } } },
    });
    return this.toUserAdmin(user);
  }

  async getProfile(userId: number): Promise<ProfileResponse> {
    const user = await this.findUserWithEmployee(userId);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return this.toProfile(user);
  }

  async updateProfile(userId: number, input: UpdateProfileInput): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    await this.prisma.employee.update({ where: { id: user.employeeId }, data: input });
    return this.getProfile(userId);
  }

  async changePassword(userId: number, input: ChangePasswordInput): Promise<{ message: string }> {
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
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      throw this.invalidCredentials();
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
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

  private async issueTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const permissions = UserPermissionsSchema.parse(user.permissions);
    const baseClaims = {
      sub: user.id,
      employeeId: user.employeeId,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
    };
    const accessToken = await this.jwtService.signAsync({ ...baseClaims, tokenType: 'access' });
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, tokenType: 'refresh' },
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

  private toUserAdmin(user: UserWithEmployee): UserAdminRecord {
    const authUser = this.toAuthUser(user);
    return UserAdminRecordSchema.parse({
      ...authUser,
      isActive: user.isActive,
      employee: { id: user.employee.id, ...authUser.employee },
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
