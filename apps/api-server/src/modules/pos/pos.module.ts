import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { QrSecurityService } from '../../common/security/qr-security.service';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
// Cross-module: PaymentQrModule needed for dynamic VietQR account selection & rotation
import { PaymentQrModule } from '../payment-qr/payment-qr.module';
// Cross-module: DiscountsModule needed for validating and listing dynamic discounts at POS
import { DiscountsModule } from '../discounts/discounts.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { KitchenSplitService } from './kitchen-split.service';
import { QrAutoCancelService } from './qr-auto-cancel.service';
import { TableTransferService } from './table-transfer.service';
import { ThermalLanPrintService } from './thermal-lan-print.service';

@Module({
  imports: [configuredJwtModule(), PaymentQrModule, DiscountsModule],
  controllers: [PosController, InvoicesController],
  providers: [PosService, KitchenSplitService, TableTransferService, InvoicesService, QrAutoCancelService, QrSecurityService, ThermalLanPrintService, JwtAuthGuard, RbacGuard],
  exports: [PosService, InvoicesService, QrSecurityService, QrAutoCancelService, ThermalLanPrintService],
})
export class PosModule {}
