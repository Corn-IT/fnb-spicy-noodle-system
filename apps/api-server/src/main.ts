import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api-server/.env') });

import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createScopedJsonBodyParserOptions } from './common/security/body-parser.middleware';
import { isAllowedCorsOrigin, parseAllowedCorsOrigins } from './common/security/cors-origin.util';
import type { EnvConfig } from './config/env.config';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService<EnvConfig, true>);
  const corsOrigins = parseAllowedCorsOrigins(config.get('corsOrigin'));
  const nodeEnv = config.get('nodeEnv');

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.useBodyParser('json', createScopedJsonBodyParserOptions());
  app.useBodyParser('urlencoded', { extended: true, limit: '100kb' });
  app.use(cookieParser());
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = isAllowedCorsOrigin(requestOrigin, corsOrigins, nodeEnv);
      callback(null, allowed);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Remaining'],
    maxAge: 86_400,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableShutdownHooks();

  await app.listen(config.get('port'), '0.0.0.0');
}

void bootstrap();
