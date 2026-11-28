import { Module } from '@nestjs/common';
import { CashflowModule } from '../../modules/cashflow/cashflow.module';
import { DashboardModule } from '../../modules/dashboard/dashboard.module';
import { HrScheduleModule } from '../../modules/hr-schedule/hr-schedule.module';
import { InternalBizController } from './internal-biz.controller';

@Module({
  imports: [DashboardModule, CashflowModule, HrScheduleModule],
  controllers: [InternalBizController],
})
export class InternalBizModule {}
