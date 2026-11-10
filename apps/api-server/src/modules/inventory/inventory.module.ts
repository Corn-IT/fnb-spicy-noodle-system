import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { MdmModule } from '../mdm/mdm.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    configuredJwtModule(),
    MdmModule, // Cross-module: MdmModule needed for MdmService.findOrCreate
  ],
  controllers: [InventoryController],
  providers: [InventoryService, JwtAuthGuard, RbacGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
