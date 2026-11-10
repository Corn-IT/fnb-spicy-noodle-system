import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { MdmController } from './mdm.controller';
import { MdmService } from './mdm.service';

@Module({
  imports: [ConfigModule, PrismaModule, configuredJwtModule()],
  controllers: [MdmController],
  providers: [MdmService, JwtAuthGuard, RbacGuard],
  exports: [MdmService],
})
export class MdmModule {}
