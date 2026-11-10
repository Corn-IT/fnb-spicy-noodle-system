import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { MdmModule } from '../mdm/mdm.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [configuredJwtModule(), MdmModule],
  controllers: [EmployeesController, SchedulesController],
  providers: [EmployeesService, SchedulesService, JwtAuthGuard, RbacGuard],
  exports: [EmployeesService, SchedulesService],
})
export class HrScheduleModule {}
