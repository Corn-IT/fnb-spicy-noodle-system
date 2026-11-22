import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  UpdateUiPreferencesSchema,
  UploadAvatarSchema,
  type AuthPrincipal,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type UpdateUiPreferencesInput,
  type UploadAvatarInput,
} from '@fnb/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { extractClientMeta } from '../../common/security/client-info.util';
import type { EnvConfig } from '../../config/env.config';
import { IamService } from './iam.service';
import { setRefreshCookie } from './refresh-cookie.util';

@Controller('api/v1/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    @Inject(IamService) private readonly iamService: IamService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get()
  getProfile(@CurrentUser('id') userId: number) {
    return this.iamService.getProfile(userId);
  }

  @Put()
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.iamService.updateProfile(userId, body);
  }

  @Put('avatar')
  uploadAvatar(
    @CurrentUser('id') userId: number,
    @Body(new ZodValidationPipe(UploadAvatarSchema)) body: UploadAvatarInput,
  ) {
    return this.iamService.uploadMyAvatar(userId, body);
  }

  @Delete('avatar')
  deleteAvatar(@CurrentUser('id') userId: number) {
    return this.iamService.deleteMyAvatar(userId);
  }

  @Patch('ui-prefs')
  updateUiPreferences(
    @CurrentUser('id') userId: number,
    @Body(new ZodValidationPipe(UpdateUiPreferencesSchema)) body: UpdateUiPreferencesInput,
  ) {
    return this.iamService.updateUiPreferences(userId, body);
  }

  @Patch('password')
  async changePassword(
    @CurrentUser() actor: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: Request,
  ) {
    const clientMeta = request ? extractClientMeta(request) : undefined;
    const result = actor.sessionId
      ? await this.iamService.changePassword(actor.id, body, actor.sessionId, clientMeta)
      : await this.iamService.changePassword(actor.id, body);

    if (result && 'refreshToken' in result && result.refreshToken && response) {
      setRefreshCookie(response, result.refreshToken, this.config);
    }
    if (result && 'accessToken' in result && result.accessToken && 'user' in result && result.user) {
      return {
        accessToken: result.accessToken,
        user: result.user,
        message: result.message,
      };
    }
    return { message: result.message };
  }
}
