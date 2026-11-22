import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { finalize, type Observable } from 'rxjs';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { redactSensitiveUrl } from '../security/redact.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const startedAt = Date.now();

    return next.handle().pipe(finalize(() => {
      const safePath = redactSensitiveUrl(request.originalUrl ?? request.url);
      this.logger.log(
        `HTTP request completed: requestId=${request.requestId} method=${request.method} path=${safePath} durationMs=${Date.now() - startedAt}`,
      );
    }));
  }
}
