import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { KitchenSplitService } from './kitchen-split.service';
import { TableTransferService } from './table-transfer.service';

@Module({
  imports: [configuredJwtModule()],
  controllers: [PosController, InvoicesController],
  providers: [PosService, KitchenSplitService, TableTransferService, InvoicesService, PosSocketGateway, JwtAuthGuard, RbacGuard],
  exports: [PosService, InvoicesService, PosSocketGateway],
})
export class PosModule {}
