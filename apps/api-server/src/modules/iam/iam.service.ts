import {
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  type AuthPrincipal,
  type AuthUser,
  type ChangePasswordInput,
  type CreateUserInput,
  type LoginRequest,
  type ProfileResponse,
  type ResetUserPasswordInput,
  type UiPreferences,
  type UpdatePermissionsInput,
  type UpdateProfileInput,
  type UpdateUiPreferencesInput,
  type UpdateUserAccountInput,
  type UploadAvatarInput,
  type UserAdminRecord,
  type UserListQuery,
  type UserListResponse,
  type UserSessionHistoryResponse,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type ClientMeta } from '../../common/security/client-info.util';
import { type SupportedImageMime } from '../../common/utils/image-binary.util';
import type { EnvConfig } from '../../config/env.config';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import {
  changePasswordHelper,
  deleteMyAvatarHelper,
  getProfileHelper,
  getPublicAvatarBinaryHelper,
  updateProfileHelper,
  updateUiPreferencesHelper,
  uploadMyAvatarHelper,
} from './helpers/iam-profile.helper';
import {
  getUserSessionHistoryHelper,
  loginHelper,
  logoutHelper,
  refreshAccessTokenHelper,
  revokeUserSessionHelper,
} from './helpers/iam-session.helper';
import type { IamRuntimeDeps, LoginResult } from './helpers/iam-shared.helper';
import {
  createUserHelper,
  listUsersHelper,
  resetUserPasswordHelper,
  updateUserAccountHelper,
  updateUserPermissionsHelper,
} from './helpers/iam-users.helper';

@Injectable()
export class IamService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
  ) {}

  private get deps(): IamRuntimeDeps {
    return {
      prisma: this.prisma,
      jwtService: this.jwtService,
      config: this.config,
      auditLogService: this.auditLogService,
      posSocketGateway: this.posSocketGateway,
    };
  }

  async login(input: LoginRequest, clientMeta?: ClientMeta): Promise<LoginResult> {
    return loginHelper(this.deps, input, clientMeta);
  }

  async refreshAccessToken(refreshToken: string): Promise<LoginResult> {
    return refreshAccessTokenHelper(this.deps, refreshToken);
  }

  async logout(
    session: { userId?: number; sessionId?: string | null } | null,
    clientMeta?: ClientMeta,
  ): Promise<void> {
    return logoutHelper(this.deps, session, clientMeta);
  }

  async revokeUserSession(
    targetUserId: number,
    actor: AuthPrincipal,
    clientMeta?: ClientMeta,
  ): Promise<{ revoked: boolean; userId: number }> {
    return revokeUserSessionHelper(this.deps, targetUserId, actor, clientMeta);
  }

  async getUserSessionHistory(targetUserId: number, limit = 5): Promise<UserSessionHistoryResponse> {
    return getUserSessionHistoryHelper(this.deps, targetUserId, limit);
  }

  async listUsers(input: UserListQuery): Promise<UserListResponse> {
    return listUsersHelper(this.deps, input);
  }

  async createUser(input: CreateUserInput, actor?: AuthPrincipal): Promise<UserAdminRecord> {
    return createUserHelper(this.deps, input, actor);
  }

  async updateUserAccount(
    id: number,
    input: UpdateUserAccountInput,
    actor?: AuthPrincipal,
  ): Promise<UserAdminRecord> {
    return updateUserAccountHelper(this.deps, id, input, actor);
  }

  async updateUserPermissions(id: number, input: UpdatePermissionsInput, actor?: AuthPrincipal): Promise<UserAdminRecord> {
    return updateUserPermissionsHelper(this.deps, id, input, actor);
  }

  async resetUserPassword(id: number, input: ResetUserPasswordInput, actor?: AuthPrincipal): Promise<{ message: string }> {
    return resetUserPasswordHelper(this.deps, id, input, actor);
  }

  async getProfile(userId: number): Promise<ProfileResponse> {
    return getProfileHelper(this.deps, userId);
  }

  async updateProfile(userId: number, input: UpdateProfileInput): Promise<ProfileResponse> {
    return updateProfileHelper(this.deps, userId, input);
  }

  async uploadMyAvatar(userId: number, rawInput: UploadAvatarInput): Promise<ProfileResponse> {
    return uploadMyAvatarHelper(this.deps, userId, rawInput);
  }

  async deleteMyAvatar(userId: number): Promise<ProfileResponse> {
    return deleteMyAvatarHelper(this.deps, userId);
  }

  async getPublicAvatarBinary(employeeId: number): Promise<{ buffer: Buffer; mime: SupportedImageMime }> {
    return getPublicAvatarBinaryHelper(this.deps, employeeId);
  }

  async changePassword(
    userId: number,
    input: ChangePasswordInput,
    actorSessionId?: string | null,
    clientMeta?: ClientMeta,
  ): Promise<{ accessToken?: string; refreshToken?: string; user?: AuthUser; message: string }> {
    return changePasswordHelper(this.deps, userId, input, actorSessionId, clientMeta);
  }

  async updateUiPreferences(userId: number, input: UpdateUiPreferencesInput): Promise<UiPreferences> {
    return updateUiPreferencesHelper(this.deps, userId, input);
  }
}
