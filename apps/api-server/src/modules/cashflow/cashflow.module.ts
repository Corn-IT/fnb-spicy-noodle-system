import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { CashflowController } from './cashflow.controller';
import { CashflowService } from './cashflow.service';

@Module({
  imports: [configuredJwtModule()],
  controllers: [CashflowController],
  providers: [CashflowService, JwtAuthGuard, RbacGuard],
  exports: [CashflowService],
})
export class CashflowModule {}
