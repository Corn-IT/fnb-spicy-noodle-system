import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';

@Module({
  imports: [configuredJwtModule()],
  controllers: [DiscountsController],
  providers: [DiscountsService, JwtAuthGuard, RbacGuard],
  exports: [DiscountsService],
})
export class DiscountsModule {}
