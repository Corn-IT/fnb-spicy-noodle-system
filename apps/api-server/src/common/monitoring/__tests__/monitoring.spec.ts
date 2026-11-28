import type { ArgumentsHost, CallHandler, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, HttpException, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../../filters/global-exception.filter';
import { LoggingInterceptor } from '../../interceptors/logging.interceptor';
import { InternalMetricsController } from '../internal-metrics.controller';
import {
  formatVnTimestamp,
  isLoopbackSocketAddress,
  readMonitoringConfig,
  sanitizeSingleLine,
  TelegramAlertService,
} from '../telegram-alert.service';

describe('MonitoringModule & TelegramAlertService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      FNB_TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN',
      FNB_TELEGRAM_CHAT_ID: '-100999888777',
      FNB_ALERT_PROJECT_NAME: 'LonaPOS',
      FNB_ALERT_SOURCE_NAME: 'FNB_POS_API',
      FNB_ALERT_SLOW_MS: '3000',
      FNB_ALERT_RAM_DIFF_MB: '64',
      FNB_ALERT_CPU_DIFF_MS: '2000',
      FNB_ALERT_COOLDOWN_MS: '300000',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reads env defaults cleanly, sanitizes single-line strings, formats VN timestamp, and detects loopback sockets', () => {
    const defaults = readMonitoringConfig({});
    expect(defaults).toMatchObject({
      botToken: '',
      chatId: '',
      projectName: 'LonaPOS',
      sourceName: 'FNB_POS_API',
      envLabel: 'DEVELOPMENT',
      slowMs: 3000,
      ramDiffMb: 64,
      cpuDiffMs: 2000,
      cooldownMs: 300_000,
    });

    const formatted = formatVnTimestamp(new Date('2026-11-28T04:15:09.000Z'));
    expect(formatted).toBe('11:15:09 28/11/2026');

    expect(sanitizeSingleLine('a\r\nb\tc\u0007', 10)).toBe('a b c');
    expect(sanitizeSingleLine('x'.repeat(20), 5)).toBe('xxxx…');

    expect(isLoopbackSocketAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackSocketAddress('::1')).toBe(true);
    expect(isLoopbackSocketAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackSocketAddress('103.252.136.192')).toBe(false);
    expect(isLoopbackSocketAddress(undefined)).toBe(false);
  });

  it('no-ops telegram dispatch when missing credentials or NODE_ENV=test unless forced', () => {
    const service = new TelegramAlertService();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    service.configureForTests({ fetchFn: fetchMock });

    delete process.env.FNB_TELEGRAM_BOT_TOKEN;
    service.recordRequestMetric({
      method: 'POST',
      url: '/api/v1/pos/orders',
      handler: 'PosController.createOrder',
      durationMs: 4500,
      ramDiffMb: 10,
      cpuDiffMs: 10,
      clientIp: '10.0.0.1',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.FNB_TELEGRAM_BOT_TOKEN = '123456:TEST-TOKEN';
    process.env.NODE_ENV = 'test';
    service.recordRequestMetric({
      method: 'POST',
      url: '/api/v1/pos/orders',
      handler: 'PosController.createOrder',
      durationMs: 4500,
      ramDiffMb: 10,
      cpuDiffMs: 10,
      clientIp: '10.0.0.1',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends formatted performance alerts on Slow/HighRAM/HighCPU, redacts sensitive query tokens, enforces cooldown & LRU cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T04:20:00.000Z'));

    const sentPayloads: Array<{ chat_id: string; text: string }> = [];
    const service = new TelegramAlertService();
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentPayloads.push(JSON.parse(String(init?.body)) as { chat_id: string; text: string });
      return new Response('{"ok":true}', { status: 200 });
    });
    service.configureForTests({ fetchFn: fetchMock, forceEnabled: true });

    // Skips /internal/metrics self-polling completely
    service.recordRequestMetric({
      method: 'GET',
      url: '/internal/metrics?reset=1',
      handler: 'InternalMetricsController.getMetrics',
      durationMs: 5000,
      ramDiffMb: 100,
      cpuDiffMs: 5000,
      clientIp: '127.0.0.1',
    });
    expect(service.getMetricsSnapshot().windowRequests).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // Skips health from request counter when fast, counts normal API requests
    service.recordRequestMetric({
      method: 'GET',
      url: '/api/v1/health',
      handler: 'HealthController.check',
      durationMs: 5,
      ramDiffMb: 0.1,
      cpuDiffMs: 1,
      clientIp: '127.0.0.1',
    });
    service.recordRequestMetric({
      method: 'GET',
      url: '/api/v1/pos/tables',
      handler: 'PosController.listTables',
      durationMs: 12,
      ramDiffMb: 0.2,
      cpuDiffMs: 2,
      clientIp: '14.224.1.1',
    });
    expect(service.getMetricsSnapshot()).toMatchObject({
      windowRequests: 1,
      windowSlowCount: 0,
      window5xxCount: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Triggers Slow + High RAM + High CPU and redacts token query param
    service.recordRequestMetric({
      method: 'POST',
      url: '/api/v1/public/menu?token=super-secret-token',
      handler: 'MenuController.getPublicMenu',
      durationMs: 3456.78,
      ramDiffMb: 72.5,
      cpuDiffMs: 2150.25,
      clientIp: '14.224.144.211',
      requestId: 'req-1234',
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentPayloads[0]?.chat_id).toBe('-100999888777');
    expect(sentPayloads[0]?.text).toContain('🚀 [LonaPOS] PERFORMANCE ALERT');
    expect(sentPayloads[0]?.text).toContain('🐢 Slow | 💾 High RAM | ⚙️ High CPU');
    expect(sentPayloads[0]?.text).toContain('/api/v1/public/menu?token=[REDACTED]');
    expect(sentPayloads[0]?.text).not.toContain('super-secret-token');
    expect(sentPayloads[0]?.text).toContain('⏱️ Time: 3456.78ms / 3000ms');
    expect(sentPayloads[0]?.text).toContain('💾 RAM: 72.50MB / 64MB');
    expect(sentPayloads[0]?.text).toContain('⚙️ CPU: 2150.25ms / 2000ms');
    expect(sentPayloads[0]?.text).toContain('🆔 Req: req-1234');

    // Within 5m cooldown -> suppressed instead of spamming Telegram
    service.recordRequestMetric({
      method: 'POST',
      url: '/api/v1/public/menu?token=other',
      handler: 'MenuController.getPublicMenu',
      durationMs: 4000,
      ramDiffMb: 1,
      cpuDiffMs: 10,
      clientIp: '14.224.144.211',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After cooldown expires -> fires again noting 1 suppressed occurrence
    vi.advanceTimersByTime(300_001);
    service.recordRequestMetric({
      method: 'POST',
      url: '/api/v1/public/menu',
      handler: 'MenuController.getPublicMenu',
      durationMs: 3100,
      ramDiffMb: 1,
      cpuDiffMs: 10,
      clientIp: '14.224.144.211',
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentPayloads[1]?.text).toContain('(+1 lần tương tự trong 5 phút qua)');

    // Evicts oldest cooldown key cleanly above 500 distinct routes
    for (let i = 0; i < 505; i += 1) {
      service.recordRequestMetric({
        method: 'GET',
        url: `/api/v1/route-${i}`,
        handler: 'TestController.run',
        durationMs: 3500,
        ramDiffMb: 0,
        cpuDiffMs: 0,
        clientIp: '127.0.0.1',
      });
    }
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(500);
  });

  it('reports HTTP 5xx errors immediately, skips 4xx errors, handles Telegram errors gracefully, and resets hourly snapshot', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new TelegramAlertService();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'));
    service.configureForTests({ fetchFn: fetchMock, forceEnabled: true });

    // Non-5xx ignored
    service.reportServerError({
      statusCode: 404,
      method: 'GET',
      url: '/api/v1/missing',
      handler: 'AppController.missing',
      errorSummary: 'Not Found',
      clientIp: '1.2.3.4',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    service.reportServerError({
      statusCode: 500,
      method: 'POST',
      url: '/api/v1/pos/checkout',
      handler: 'PosController.checkoutOrder',
      errorSummary: 'PrismaClientKnownRequestError: deadlock detected',
      clientIp: '14.224.144.211',
      requestId: 'req-500',
    });
    service.reportServerError({
      statusCode: 503,
      method: 'GET',
      url: '/api/v1/dashboard/overview',
      handler: 'DashboardController.overview',
      errorSummary: 'Service Unavailable',
      clientIp: '14.224.144.211',
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { text: string };
    expect(firstBody.text).toContain('🔥 [LonaPOS] SERVER ERROR 500');
    expect(firstBody.text).toContain('PrismaClientKnownRequestError: deadlock detected');
    expect(firstBody.text).toContain('🧩 Handler: PosController.checkoutOrder');

    const snapshot = service.getMetricsSnapshot(true);
    expect(snapshot.window5xxCount).toBe(2);
    expect(service.getMetricsSnapshot().window5xxCount).toBe(0);
  });

  it('enforces strict socket-level loopback access in InternalMetricsController', () => {
    const service = new TelegramAlertService();
    const controller = new InternalMetricsController(service);

    const loopbackReq = {
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: { 'x-forwarded-for': '8.8.8.8' },
    } as never;
    expect(controller.getMetrics(loopbackReq, '1')).toMatchObject({ status: 'ok', windowRequests: 0 });

    const remoteReq = {
      socket: { remoteAddress: '103.252.136.192' },
      headers: { 'cf-connecting-ip': '127.0.0.1' },
    } as never;
    expect(() => controller.getMetrics(remoteReq)).toThrow(ForbiddenException);
  });

  it('wires LoggingInterceptor handler tags into GlobalExceptionFilter 500 alerts end-to-end', async () => {
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const loggerLogSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const service = new TelegramAlertService();
    const reportServerSpy = vi.spyOn(service, 'reportServerError').mockImplementation(() => undefined);
    const recordMetricSpy = vi.spyOn(service, 'recordRequestMetric').mockImplementation(() => undefined);

    const request: Record<string, unknown> = {
      requestId: 'req-e2e-500',
      method: 'POST',
      url: '/api/v1/pos/orders/10/split-kitchen',
      originalUrl: '/api/v1/pos/orders/10/split-kitchen',
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    };

    class SamplePosController {
      splitKitchen() {}
    }

    const context = {
      getClass: () => SamplePosController,
      getHandler: () => SamplePosController.prototype.splitKitchen,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const interceptor = new LoggingInterceptor(service);
    const failingHandler: CallHandler = {
      handle: () => throwError(() => new HttpException('DB failure', 500)),
    };

    await expect(firstValueFrom(interceptor.intercept(context, failingHandler))).rejects.toThrow('DB failure');
    expect(recordMetricSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: 'SamplePosController.splitKitchen',
        clientIp: '203.0.113.10',
      }),
    );

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const filter = new GlobalExceptionFilter(service);
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('Unexpected database timeout'), host);
    expect(reportServerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        handler: 'SamplePosController.splitKitchen',
        errorSummary: 'Error: Unexpected database timeout',
        clientIp: '203.0.113.10',
        requestId: 'req-e2e-500',
      }),
    );

    // Ensure regular 200 observable completes cleanly with custom minimal context
    const minimalCtx = { switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/x' }) }) } as unknown as ExecutionContext;
    await expect(firstValueFrom(interceptor.intercept(minimalCtx, { handle: () => of('ok') }))).resolves.toBe('ok');
    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalled();
  });
});
