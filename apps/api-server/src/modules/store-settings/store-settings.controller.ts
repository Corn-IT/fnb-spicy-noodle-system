import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  StoreAssetKindSchema,
  UpdateStoreSettingsSchema,
  UploadStoreAssetSchema,
  type StoreAssetKind,
  type UpdateStoreSettingsInput,
  type UploadStoreAssetInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreSettingsService } from './store-settings.service';

@Controller('api/v1')
export class StoreSettingsController {
  constructor(
    @Inject(StoreSettingsService) private readonly storeSettingsService: StoreSettingsService,
  ) {}

  @Get('public/store-settings')
  @Header('Cache-Control', 'no-cache')
  getPublicSettings() {
    return this.storeSettingsService.getPublicSettings();
  }

  @Get('public/store-assets/:kind')
  async getPublicAsset(
    @Param('kind', new ZodValidationPipe(StoreAssetKindSchema)) kind: StoreAssetKind,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const asset = await this.storeSettingsService.getAssetBinary(kind);
    response.setHeader('Content-Type', asset.mime);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(asset.buffer);
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('settings', 'view')
  getSettings() {
    return this.storeSettingsService.getPublicSettings();
  }

  @Get('store-messages')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-cache')
  getStoreMessages() {
    return this.storeSettingsService.getMessages();
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('settings', 'update')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateStoreSettingsSchema)) body: UpdateStoreSettingsInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.storeSettingsService.updateSettings(body, userId);
  }

  @Put('settings/assets/:kind')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('settings', 'update')
  uploadAsset(
    @Param('kind', new ZodValidationPipe(StoreAssetKindSchema)) kind: StoreAssetKind,
    @Body(new ZodValidationPipe(UploadStoreAssetSchema)) body: UploadStoreAssetInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.storeSettingsService.uploadAsset(kind, body, userId);
  }

  @Delete('settings/assets/:kind')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('settings', 'update')
  deleteAsset(
    @Param('kind', new ZodValidationPipe(StoreAssetKindSchema)) kind: StoreAssetKind,
    @CurrentUser('id') userId: number,
  ) {
    return this.storeSettingsService.deleteAsset(kind, userId);
  }
}
