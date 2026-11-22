import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { MdmModule } from '../mdm/mdm.module';
import { PosModule } from '../pos/pos.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [configuredJwtModule(), PosModule, MdmModule],
  controllers: [MenuController],
  providers: [MenuService, JwtAuthGuard, RbacGuard],
  exports: [MenuService],
})
export class MenuModule {}
