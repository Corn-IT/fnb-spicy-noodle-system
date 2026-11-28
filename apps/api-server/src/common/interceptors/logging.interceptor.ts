import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize, type Observable } from 'rxjs';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { TelegramAlertService } from '../monitoring/telegram-alert.service';
import { extractClientIp } from '../security/client-info.util';
import { redactSensitiveUrl } from '../security/redact.util';

type MonitoredRequest = RequestWithId & {
  __routeHandler?: string;
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    @Optional() @Inject(TelegramAlertService) private readonly telegramAlert?: TelegramAlertService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<MonitoredRequest>();
    const startedAtMs = performance.now();
    const startCpu = process.cpuUsage();
    const startRss = process.memoryUsage().rss;
    const className = typeof context.getClass === 'function' ? context.getClass()?.name : undefined;
    const handlerMethod = typeof context.getHandler === 'function' ? context.getHandler()?.name : undefined;
    const handlerLabel =
      className && handlerMethod ? `${className}.${handlerMethod}` : handlerMethod ?? className ?? 'HttpHandler';

    if (request && typeof request === 'object') {
      request.__routeHandler = handlerLabel;
    }

    return next.handle().pipe(finalize(() => {
      const durationMs = performance.now() - startedAtMs;
      const cpuDiff = process.cpuUsage(startCpu);
      const cpuDiffMs = (cpuDiff.user + cpuDiff.system) / 1000;
      const ramDiffMb = Math.max(0, (process.memoryUsage().rss - startRss) / (1024 * 1024));
      const rawUrl = request.originalUrl ?? request.url ?? '';
      const safePath = redactSensitiveUrl(rawUrl);

      this.logger.log(
        `HTTP request completed: requestId=${request.requestId} method=${request.method} path=${safePath} durationMs=${Math.round(durationMs)}`,
      );

      this.telegramAlert?.recordRequestMetric({
        method: request.method ?? 'GET',
        url: rawUrl,
        handler: handlerLabel,
        durationMs,
        ramDiffMb,
        cpuDiffMs,
        clientIp: extractClientIp(request as Request),
        requestId: request.requestId,
      });
    }));
  }
}
