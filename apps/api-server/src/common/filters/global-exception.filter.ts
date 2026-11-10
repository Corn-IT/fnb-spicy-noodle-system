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
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? exceptionResponse as ErrorPayload
      : undefined;
    const isProduction = process.env.NODE_ENV === 'production';
    const exceptionMessage = exception instanceof Error ? exception.message : 'Internal server error';
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
    this.logger.error(`Request failed: requestId=${requestId ?? 'unknown'} path=${request.url} method=${request.method}`, stack);
    response.status(statusCode).json(errorResponse);
  }
}
