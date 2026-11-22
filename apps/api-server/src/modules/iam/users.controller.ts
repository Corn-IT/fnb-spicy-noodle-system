import { Body, Controller, Get, Inject, Param, ParseIntPipe, Put, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateUserSchema,
  ResetUserPasswordSchema,
  UserListQuerySchema,
  UserSessionHistoryQuerySchema,
  UpdatePermissionsSchema,
  type AuthPrincipal,
  type CreateUserInput,
  type ResetUserPasswordInput,
  type UserListQuery,
  type UserSessionHistoryQuery,
  type UpdatePermissionsInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission, SuperAdminOnly } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IamService } from './iam.service';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RbacGuard)
export class UsersController {
  constructor(@Inject(IamService) private readonly iamService: IamService) {}

  @Get()
  @RequirePermission('rbac', 'view')
  async list(
    @Query(new ZodValidationPipe(UserListQuerySchema)) query: UserListQuery,
    @CurrentUser() actor?: AuthPrincipal,
  ) {
    const result = await this.iamService.listUsers(query);
    if (actor && !actor.isSuperAdmin && Array.isArray(result?.items)) {
      return {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          session: item.session
            ? {
                ...item.session,
                ipAddress: null,
                deviceLabel: null,
                startedAt: null,
              }
            : undefined,
        })),
      };
    }
    return result;
  }

  @Post()
  @SuperAdminOnly()
  create(
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserInput,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.iamService.createUser(body, actor);
  }

  @Put(':id/permissions')
  @SuperAdminOnly()
  updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdatePermissionsSchema)) body: UpdatePermissionsInput,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.iamService.updateUserPermissions(id, body, actor);
  }

  @Post(':id/reset-password')
  @SuperAdminOnly()
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ResetUserPasswordSchema)) body: ResetUserPasswordInput,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.iamService.resetUserPassword(id, body, actor);
  }

  @Get(':id/session-history')
  @SuperAdminOnly()
  getSessionHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(UserSessionHistoryQuerySchema)) query: UserSessionHistoryQuery,
  ) {
    return this.iamService.getUserSessionHistory(id, query.limit);
  }

  @Post(':id/revoke-session')
  @SuperAdminOnly()
  revokeSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.iamService.revokeUserSession(id, actor);
  }
}
