import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { PaymentQrController } from './payment-qr.controller';
import { PaymentQrService } from './payment-qr.service';

@Module({
  imports: [configuredJwtModule()],
  controllers: [PaymentQrController],
  providers: [PaymentQrService, JwtAuthGuard, RbacGuard],
  exports: [PaymentQrService],
})
export class PaymentQrModule {}
