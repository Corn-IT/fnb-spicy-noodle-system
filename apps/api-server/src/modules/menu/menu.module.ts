import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [configuredJwtModule()],
  controllers: [MenuController],
  providers: [MenuService, JwtAuthGuard, RbacGuard],
  exports: [MenuService],
})
export class MenuModule {}
