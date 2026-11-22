import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { configuredJwtModule } from '../utils/jwt-module-options';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, configuredJwtModule()],
  controllers: [AuditLogController],
  providers: [AuditLogService, JwtAuthGuard],
  exports: [AuditLogService],
})
export class AuditLogModule {}
