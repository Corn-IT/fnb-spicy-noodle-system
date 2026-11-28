import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { parseEnvConfig } from './config/env.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { InternalBizModule } from './common/monitoring/internal-biz.module';
import { MonitoringModule } from './common/monitoring/monitoring.module';
import { RateLimitGuard } from './common/security/rate-limit.guard';
import { SecurityHeadersMiddleware } from './common/security/security-headers.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditLogModule } from './common/audit/audit-log.module';
import { RealtimeModule } from './gateways/realtime.module';
import { HealthModule } from './health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { MdmModule } from './modules/mdm/mdm.module';
import { MenuModule } from './modules/menu/menu.module';
import { PosModule } from './modules/pos/pos.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CashflowModule } from './modules/cashflow/cashflow.module';
import { HrScheduleModule } from './modules/hr-schedule/hr-schedule.module';
import { PaymentQrModule } from './modules/payment-qr/payment-qr.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { StoreSettingsModule } from './modules/store-settings/store-settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (environment) => parseEnvConfig(environment),
    }),
    MonitoringModule,
    PrismaModule,
    AuditLogModule,
    RealtimeModule,
    HealthModule,
    IamModule,
    MdmModule,
    MenuModule,
    PaymentQrModule,
    DiscountsModule,
    PosModule,
    InventoryModule,
    CashflowModule,
    HrScheduleModule,
    StoreSettingsModule,
    DashboardModule,
    AiAssistantModule,
    InternalBizModule,
  ],
  providers: [
    RateLimitGuard,
    {
      provide: APP_GUARD,
      useExisting: RateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
