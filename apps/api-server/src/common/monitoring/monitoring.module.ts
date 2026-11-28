import { Global, Module } from '@nestjs/common';
import { InternalMetricsController } from './internal-metrics.controller';
import { TelegramAlertService } from './telegram-alert.service';

@Global()
@Module({
  controllers: [InternalMetricsController],
  providers: [TelegramAlertService],
  exports: [TelegramAlertService],
})
export class MonitoringModule {}
