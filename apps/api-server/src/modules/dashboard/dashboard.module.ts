import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
// Cross-module: CashflowModule needed for default opening budget configuration
import { CashflowModule } from '../cashflow/cashflow.module';
// Cross-module: HrScheduleModule needed for shift staffing & payroll summary
import { HrScheduleModule } from '../hr-schedule/hr-schedule.module';
// Cross-module: PaymentQrModule needed for VietQR account quota & rotation telemetry
import { PaymentQrModule } from '../payment-qr/payment-qr.module';
// Cross-module: PosModule needed for live 30-table grid & pending QR order alerts
import { PosModule } from '../pos/pos.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    configuredJwtModule(),
    PosModule,
    CashflowModule,
    PaymentQrModule,
    HrScheduleModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, JwtAuthGuard, RbacGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
