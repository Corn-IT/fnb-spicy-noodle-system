import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('api/v1/health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{
    status: 'ok' | 'error';
    timestamp: string;
    database: 'connected' | 'disconnected';
    uptime: number;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        uptime: process.uptime(),
      };
    } catch {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        uptime: process.uptime(),
      };
    }
  }
}
