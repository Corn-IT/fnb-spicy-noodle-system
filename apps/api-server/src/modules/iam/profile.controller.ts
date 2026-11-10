import { Body, Controller, Get, Inject, Patch, Put, UseGuards } from '@nestjs/common';
import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  UpdateUiPreferencesSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type UpdateUiPreferencesInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IamService } from './iam.service';

@Controller('api/v1/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(@Inject(IamService) private readonly iamService: IamService) {}

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

  @Patch('ui-prefs')
  updateUiPreferences(
    @CurrentUser('id') userId: number,
    @Body(new ZodValidationPipe(UpdateUiPreferencesSchema)) body: UpdateUiPreferencesInput,
  ) {
    return this.iamService.updateUiPreferences(userId, body);
  }

  @Patch('password')
  changePassword(
    @CurrentUser('id') userId: number,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.iamService.changePassword(userId, body);
  }
}
