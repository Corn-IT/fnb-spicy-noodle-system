import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { configuredJwtModule } from '../../common/utils/jwt-module-options';
import { MdmModule } from '../mdm/mdm.module';
import { PosModule } from '../pos/pos.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [configuredJwtModule(), MdmModule, PosModule],
  controllers: [EmployeesController, SchedulesController, PayrollController],
  providers: [EmployeesService, SchedulesService, PayrollService, JwtAuthGuard, RbacGuard],
  exports: [EmployeesService, SchedulesService, PayrollService],
})
export class HrScheduleModule {}
