import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../context/request-context';
import { extractClientMeta } from '../security/client-info.util';

export type RequestWithId = Request & { requestId: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestWithId = request as RequestWithId;
    requestWithId.requestId = randomUUID();
    response.setHeader('X-Request-Id', requestWithId.requestId);

    const clientMeta = extractClientMeta(request);
    runWithRequestContext(
      {
        requestId: requestWithId.requestId,
        ...clientMeta,
      },
      next,
    );
  }
}
