import { Body, Controller, Get, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  BulkSaveScheduleRequestSchema,
  CopyPreviousWeekRequestSchema,
  ScheduleWeekQuerySchema,
  type AuthPrincipal,
  type BulkSaveScheduleRequest,
  type CopyPreviousWeekRequest,
  type ScheduleWeekQuery,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SchedulesService } from './schedules.service';

@Controller('api/v1/schedules')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SchedulesController {
  constructor(@Inject(SchedulesService) private readonly schedulesService: SchedulesService) {}

  @Get()
  @RequirePermission('schedules', 'view')
  getWeek(@Query(new ZodValidationPipe(ScheduleWeekQuerySchema)) query: ScheduleWeekQuery) {
    return this.schedulesService.getScheduleWeek(query.weekStartDate);
  }

  @Put('bulk-save')
  @RequirePermission('schedules', 'update')
  bulkSave(
    @Body(new ZodValidationPipe(BulkSaveScheduleRequestSchema)) body: BulkSaveScheduleRequest,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.schedulesService.bulkSaveSchedule(body, user.id);
  }

  @Post('copy-previous-week')
  @RequirePermission('schedules', 'update')
  copyPreviousWeek(
    @Body(new ZodValidationPipe(CopyPreviousWeekRequestSchema)) body: CopyPreviousWeekRequest,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.schedulesService.copyPreviousWeek(body, user.id);
  }
}
