import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@fnb/shared';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { redactSensitiveUrl } from '../security/redact.util';

type ErrorPayload = {
  code?: unknown;
  details?: unknown;
  message?: unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<{ status: (statusCode: number) => { json: (body: ApiErrorResponse) => void } }>();
    const httpError = exception as { statusCode?: unknown; status?: unknown; type?: unknown } | undefined;
    const rawHttpStatus =
      typeof httpError?.statusCode === 'number'
        ? httpError.statusCode
        : typeof httpError?.status === 'number'
          ? httpError.status
          : undefined;
    const statusCode = exception instanceof HttpException
      ? exception.getStatus()
      : rawHttpStatus !== undefined && rawHttpStatus >= 400 && rawHttpStatus < 600
        ? rawHttpStatus
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? exceptionResponse as ErrorPayload
      : undefined;
    const isProduction = process.env.NODE_ENV === 'production';
    const exceptionMessage = httpError?.type === 'entity.too.large' || statusCode === HttpStatus.PAYLOAD_TOO_LARGE
      ? 'Dữ liệu gửi lên vượt quá dung lượng cho phép'
      : exception instanceof Error
        ? exception.message
        : 'Internal server error';
    const message = isProduction && statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
      ? 'Internal server error'
      : typeof payload?.message === 'string'
        ? payload.message
        : Array.isArray(payload?.message)
          ? payload.message.join(', ')
          : typeof exceptionResponse === 'string'
            ? exceptionResponse
            : exceptionMessage;
    const requestId = request.requestId;
    const errorResponse: ApiErrorResponse = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      ...(typeof payload?.code === 'string' ? { code: payload.code } : {}),
      ...(payload?.details === undefined ? {} : { details: payload.details }),
      ...(requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? { requestId } : {}),
    };

    const stack = exception instanceof Error ? exception.stack : undefined;
    const safePath = redactSensitiveUrl(request.url);
    this.logger.error(`Request failed: requestId=${requestId ?? 'unknown'} path=${safePath} method=${request.method}`, stack);
    response.status(statusCode).json(errorResponse);
  }
}
