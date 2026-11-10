import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvConfig } from './config/env.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { MdmModule } from './modules/mdm/mdm.module';
import { MenuModule } from './modules/menu/menu.module';
import { PosModule } from './modules/pos/pos.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CashflowModule } from './modules/cashflow/cashflow.module';
import { HrScheduleModule } from './modules/hr-schedule/hr-schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (environment) => parseEnvConfig(environment),
    }),
    PrismaModule,
    HealthModule,
    IamModule,
    MdmModule,
    MenuModule,
    PosModule,
    InventoryModule,
    CashflowModule,
    HrScheduleModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
