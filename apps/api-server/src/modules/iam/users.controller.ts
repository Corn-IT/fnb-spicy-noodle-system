import { Body, Controller, Get, Inject, Param, ParseIntPipe, Put, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateUserSchema,
  UserListQuerySchema,
  UpdatePermissionsSchema,
  type CreateUserInput,
  type UserListQuery,
  type UpdatePermissionsInput,
} from '@fnb/shared';
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
  list(@Query(new ZodValidationPipe(UserListQuerySchema)) query: UserListQuery) {
    return this.iamService.listUsers(query);
  }

  @Post()
  @SuperAdminOnly()
  create(@Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserInput) {
    return this.iamService.createUser(body);
  }

  @Put(':id/permissions')
  @SuperAdminOnly()
  updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdatePermissionsSchema)) body: UpdatePermissionsInput,
  ) {
    return this.iamService.updateUserPermissions(id, body);
  }
}
