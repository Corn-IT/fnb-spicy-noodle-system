import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { IamController } from './iam.controller';
import { ProfileController } from './profile.controller';
import { UsersController } from './users.controller';
import { IamService } from './iam.service';

@Module({
  imports: [ConfigModule, PrismaModule, configuredJwtModule()],
  controllers: [IamController, UsersController, ProfileController],
  providers: [IamService, JwtAuthGuard, RbacGuard],
  exports: [IamService],
})
export class IamModule {}
