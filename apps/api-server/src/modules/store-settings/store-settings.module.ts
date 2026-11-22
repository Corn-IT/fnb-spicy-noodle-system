import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { PosModule } from '../pos/pos.module';
import { StoreSettingsController } from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';

@Module({
  imports: [configuredJwtModule(), PosModule],
  controllers: [StoreSettingsController],
  providers: [StoreSettingsService, JwtAuthGuard, RbacGuard],
  exports: [StoreSettingsService],
})
export class StoreSettingsModule {}
