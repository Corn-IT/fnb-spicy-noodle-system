import { Controller, ForbiddenException, Get, Inject, Query, Req } from '@nestjs/common';
import { ErrorCodes } from '@fnb/shared';
import type { Request } from 'express';
import {
  isLoopbackSocketAddress,
  TelegramAlertService,
  type InternalMetricsSnapshot,
} from './telegram-alert.service';

@Controller('internal')
export class InternalMetricsController {
  constructor(
    @Inject(TelegramAlertService) private readonly telegramAlertService: TelegramAlertService,
  ) {}

  @Get('metrics')
  getMetrics(@Req() request: Request, @Query('reset') reset?: string): InternalMetricsSnapshot {
    const remoteAddress = request.socket?.remoteAddress;
    if (!isLoopbackSocketAddress(remoteAddress)) {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_PERMISSION_DENIED,
        message: 'Endpoint nội bộ chỉ cho phép truy cập từ loopback',
      });
    }

    return this.telegramAlertService.getMetricsSnapshot(reset === '1' || reset === 'true');
  }
}
