import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { CashflowModule } from '../cashflow/cashflow.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { HrScheduleModule } from '../hr-schedule/hr-schedule.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentQrModule } from '../payment-qr/payment-qr.module';
import { PosModule } from '../pos/pos.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AiSessionMemoryService } from './ai-session-memory.service';
import { GeminiMultiPoolService } from './gemini-multipool.service';
import { LocalAiEngineService } from './local-ai-engine.service';
import { RbacToolPolicyService } from './rbac-tool-policy.service';
import { SystemKbService } from './system-kb.service';

@Module({
  imports: [
    configuredJwtModule(),
    StoreSettingsModule,
    DashboardModule,
    PosModule,
    CashflowModule,
    HrScheduleModule,
    InventoryModule,
    DiscountsModule,
    PaymentQrModule,
  ],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    AiSessionMemoryService,
    LocalAiEngineService,
    GeminiMultiPoolService,
    RbacToolPolicyService,
    SystemKbService,
    JwtAuthGuard,
    RateLimitGuard,
  ],
  exports: [AiAssistantService, AiSessionMemoryService],
})
export class AiAssistantModule {}
