import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const API_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestPath = request?.path ?? request?.originalUrl ?? '';
    const isPublicCrossOriginMedia =
      requestPath.startsWith('/api/v1/public/store-assets/') ||
      requestPath.startsWith('/api/v1/public/tts');

    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', isPublicCrossOriginMedia ? 'cross-origin' : 'same-site');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader('Content-Security-Policy', API_CONTENT_SECURITY_POLICY);

    if (process.env.NODE_ENV === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  }
}
