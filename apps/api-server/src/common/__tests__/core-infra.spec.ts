import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { parseEnvConfig } from '../../config/env.config';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { HealthController } from '../../health/health.controller';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { normalizeVietnameseString, toTitleCase } from '../utils/normalized-string.util';
import { z } from 'zod';

describe('core infrastructure', () => {
  describe('normalizeVietnameseString', () => {
    it('should return an empty string for empty input', () => {
      expect(normalizeVietnameseString('')).toBe('');
    });

    it('should strip Vietnamese diacritics and collapse whitespace', () => {
      expect(normalizeVietnameseString('  TƯƠNG   Ớt Đỏ  ')).toBe('tuong ot do');
    });
  });

  describe('toTitleCase', () => {
    it('should return an empty string for empty input', () => {
      expect(toTitleCase('')).toBe('');
    });

    it('should normalize each word while preserving Vietnamese diacritics', () => {
      expect(toTitleCase('  nGUYỄN   vĂN aNH ')).toBe('Nguyễn Văn Anh');
    });
  });

  describe('parseEnvConfig', () => {
    const validEnvironment = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/fnb_pos?schema=public',
      JWT_SECRET: 's'.repeat(64),
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:5173',
    };

    it('should prefer FNB variables over standard variables', () => {
      const config = parseEnvConfig({
        ...validEnvironment,
        FNB_DATABASE_URL: 'postgresql://fnb:secret@localhost:5432/fnb_pos',
        FNB_PORT: '3100',
      });

      expect(config.databaseUrl).toBe('postgresql://fnb:secret@localhost:5432/fnb_pos');
      expect(config.port).toBe(3100);
    });

    it('should support standard variables when FNB variables are absent', () => {
      const config = parseEnvConfig(validEnvironment);

      expect(config.databaseUrl).toBe(validEnvironment.DATABASE_URL);
      expect(config.port).toBe(3000);
      expect(config.jwtRefreshExpiresIn).toBe('7d');
    });

    it('should reject an invalid database URL and weak JWT secret', () => {
      expect(() => parseEnvConfig({ ...validEnvironment, DATABASE_URL: 'not-a-url', JWT_SECRET: 'short' })).toThrow();
    });
  });

  describe('ZodValidationPipe', () => {
    const schema = z.object({ name: z.string().trim().min(2) });
    const pipe = new ZodValidationPipe(schema);

    it('should return the parsed value', () => {
      expect(pipe.transform({ name: '  An  ' })).toEqual({ name: 'An' });
    });

    it('should throw a 422 response with field errors for invalid input', () => {
      try {
        pipe.transform({ name: ' ' });
        throw new Error('Expected validation to fail');
      } catch (error) {
        expect(error).toMatchObject({
          status: 422,
          response: {
            code: 'VALIDATION_FAILED',
            details: { fieldErrors: { name: expect.any(Array) } },
          },
        });
      }
    });
  });

  describe('GlobalExceptionFilter', () => {
    const createHost = (requestId?: string) => {
      const json = vi.fn();
      const status = vi.fn(() => ({ json }));
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({ requestId, url: '/api/v1/example', method: 'GET' }),
          getResponse: () => ({ status }),
        }),
      } as unknown as ArgumentsHost;

      return { host, json, status };
    };

    it('should map Nest HTTP exceptions to the shared error response shape', () => {
      const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const { host, json, status } = createHost(randomUUID());

      try {
        filter.catch(new BadRequestException({ code: 'INVALID_INPUT', message: 'Dữ liệu sai' }), host);

        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({
          statusCode: 400,
          error: 'Bad Request',
          code: 'INVALID_INPUT',
          message: 'Dữ liệu sai',
        }));
        expect(json.mock.calls[0]?.[0].requestId).toBeDefined();
      } finally {
        logger.mockRestore();
      }
    });

    it('should hide internal exception messages in production', () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const { host, json, status } = createHost();

      try {
        filter.catch(new Error('database password leaked'), host);
        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
        }));
        expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain('database password leaked');
      } finally {
        logger.mockRestore();
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  describe('RequestIdMiddleware', () => {
    it('should attach a UUID request id and response header', () => {
      const middleware = new RequestIdMiddleware();
      const request = {} as Request & { requestId?: string };
      const setHeader = vi.fn();
      const response = { setHeader } as unknown as Response;
      const next = vi.fn() as NextFunction;

      middleware.use(request, response, next);

      expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', request.requestId);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('PrismaService', () => {
    it('should connect and disconnect with the Nest module lifecycle', async () => {
      const prisma = new PrismaService();
      const connect = vi.spyOn(prisma, '$connect').mockResolvedValue(undefined);
      const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue(undefined);

      await prisma.onModuleInit();
      await prisma.onModuleDestroy();

      expect(connect).toHaveBeenCalledOnce();
      expect(disconnect).toHaveBeenCalledOnce();
      connect.mockRestore();
      disconnect.mockRestore();
      await prisma.$disconnect();
    });
  });

  describe('LoggingInterceptor', () => {
    it('should include the request id and HTTP method in request logs', async () => {
      const logger = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const interceptor = new LoggingInterceptor();
      const request = { requestId: randomUUID(), method: 'GET', originalUrl: '/api/v1/health' };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as never;
      const handler = { handle: () => of({ status: 'ok' }) };

      await expect(firstValueFrom(interceptor.intercept(context, handler))).resolves.toEqual({ status: 'ok' });
      expect(logger).toHaveBeenCalledWith(expect.stringContaining(`requestId=${request.requestId}`));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('method=GET'));
      logger.mockRestore();
    });
  });

  describe('HealthController', () => {
    it('should report a connected database after SELECT 1 succeeds', async () => {
      const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
      const controller = new HealthController(prisma as never);

      await expect(controller.check()).resolves.toMatchObject({ status: 'ok', database: 'connected' });
      expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    });

    it('should report a disconnected database when SELECT 1 fails', async () => {
      const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) };
      const controller = new HealthController(prisma as never);

      await expect(controller.check()).resolves.toMatchObject({ status: 'error', database: 'disconnected' });
    });
  });
});
