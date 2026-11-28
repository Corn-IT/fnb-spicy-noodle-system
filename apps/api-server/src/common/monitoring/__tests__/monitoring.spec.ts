import type { ArgumentsHost, CallHandler, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, HttpException, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../../filters/global-exception.filter';
import { LoggingInterceptor } from '../../interceptors/logging.interceptor';
import { InternalBizController } from '../internal-biz.controller';
import { InternalMetricsController } from '../internal-metrics.controller';
import {
  computeCpuPercentFromSamples,
  escapeTelegramHtml,
  formatVnTimestamp,
  isLoopbackSocketAddress,
  parseProcMeminfoText,
  parseProcStatCpuSample,
  readContainerResourceStats,
  readMonitoringConfig,
  readVpsHostStats,
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
      FNB_ALERT_PROJECT_NAME: 'Ăn Vặt Tran',
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
      projectName: 'Ăn Vặt Tran',
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
    expect(escapeTelegramHtml('<script>&a>')).toBe('&lt;script&gt;&amp;a&gt;');

    expect(isLoopbackSocketAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackSocketAddress('::1')).toBe(true);
    expect(isLoopbackSocketAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackSocketAddress('103.252.136.192')).toBe(false);
    expect(isLoopbackSocketAddress(undefined)).toBe(false);

    const cgStats = readContainerResourceStats((p) => {
      if (p === '/sys/fs/cgroup/memory.current') return 120 * 1024 * 1024;
      if (p === '/sys/fs/cgroup/memory.max') return 1200 * 1024 * 1024;
      return null;
    });
    expect(cgStats).toMatchObject({
      ramLabel: 'Container RAM',
      ramUsedMb: 120,
      ramLimitMb: 1200,
      ramPercent: 10,
    });
    expect(cgStats.cpuCores).toBeGreaterThanOrEqual(1);

    const hostFallbackStats = readContainerResourceStats(() => null);
    expect(hostFallbackStats.ramLabel).toBe('Host RAM');
    expect(hostFallbackStats.ramLimitMb).toBeGreaterThan(0);

    const parsedMem = parseProcMeminfoText('MemTotal:        4010040 kB\nMemFree: 200000 kB\nMemAvailable: 3007530 kB\n');
    expect(parsedMem).toEqual({ ramUsedMb: 979, ramTotalMb: 3916, ramPercent: 25 });
    expect(parseProcMeminfoText('MemFree: 100 kB')).toBeNull();

    const s1 = parseProcStatCpuSample('cpu  1000 0 200 8800 0 0 0 0 0 0');
    const s2 = parseProcStatCpuSample('cpu  1200 0 250 9550 0 0 0 0 0 0');
    expect(computeCpuPercentFromSamples(s1, s2)).toBe(25);
    expect(computeCpuPercentFromSamples(s2, s2)).toBeNull();
    expect(parseProcStatCpuSample('invalid')).toBeNull();

    const vpsSample = readVpsHostStats({
      prevCpuSample: s1,
      readText: (p) =>
        p === '/proc/meminfo'
          ? 'MemTotal: 4010040 kB\nMemAvailable: 3007530 kB\n'
          : 'cpu  1200 0 250 9550 0 0 0 0 0 0',
      statDisk: () => ({ blocks: 3000, bfree: 1800, bavail: 1650, bsize: 10 * 1024 * 1024 }),
    });
    expect(vpsSample.stats).toMatchObject({
      ramUsedMb: 979,
      ramTotalMb: 3916,
      ramPercent: 25,
      cpuPercent: 25,
      diskPercent: 42.1,
    });
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
    expect(sentPayloads[0]?.text).toContain('🚀 <b>[Ăn Vặt Tran] CẢNH BÁO HIỆU NĂNG</b>');
    expect(sentPayloads[0]?.text).toContain('🐢 Chậm · 💾 RAM tăng · ⚙️ CPU cao');
    expect(sentPayloads[0]?.text).toContain('/api/v1/public/menu?token=[REDACTED]');
    expect(sentPayloads[0]?.text).not.toContain('super-secret-token');
    expect(sentPayloads[0]?.text).toContain('• Thời gian: <b>3456.78ms</b> / 3000ms');
    expect(sentPayloads[0]?.text).toContain('• RAM tăng: <b>72.50MB</b> / 64MB');
    expect(sentPayloads[0]?.text).toContain('• CPU dùng: <b>2150.25ms</b> / 2000ms');
    expect(sentPayloads[0]?.text).toContain('<b>3. Tài nguyên API &amp; Toàn VPS</b>');
    expect(sentPayloads[0]?.text).toContain('• VPS RAM:');
    expect(sentPayloads[0]?.text).toContain('• Request ID: <code>req-1234</code>');

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
    expect(sentPayloads[1]?.text).toContain('+1 lần trong 5 phút qua');

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

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { text: string; parse_mode?: string };
    expect(firstBody.parse_mode).toBe('HTML');
    expect(firstBody.text).toContain('🔥 <b>[Ăn Vặt Tran] LỖI SERVER HTTP 500</b>');
    expect(firstBody.text).toContain('PrismaClientKnownRequestError: deadlock detected');
    expect(firstBody.text).toContain('• Handler: <code>PosController.checkoutOrder</code>');

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

  it('excludes /internal/biz/* from windowRequests while enforcing loopback and exposing owner fields in InternalBizController', async () => {
    const alertService = new TelegramAlertService();
    alertService.recordRequestMetric({
      method: 'GET',
      url: '/internal/biz/overview?preset=today',
      handler: 'InternalBizController.getOverview',
      durationMs: 25,
      ramDiffMb: 0.1,
      cpuDiffMs: 2,
      clientIp: '127.0.0.1',
    });
    expect(alertService.getMetricsSnapshot().windowRequests).toBe(0);

    const mockOverview = {
      meta: {
        preset: 'today',
        fromDate: '2026-11-28',
        toDate: '2026-11-28',
        previousFromDate: '2026-11-27',
        previousToDate: '2026-11-27',
        generatedAt: '2026-11-28T06:00:00.000Z',
        isTodayIncluded: true,
        scope: {
          canPos: true,
          canInvoices: true,
          canInventory: true,
          canCashflow: true,
          canPaymentQr: true,
          canDiscounts: true,
          canSchedules: true,
          canPayroll: true,
          canViewProfit: true,
        },
      },
      alerts: {
        pendingQrTables: [],
        pendingPaymentEdits: [],
        nearLimitQrAccounts: [
          {
            id: 1,
            label: 'MBBank Chinh',
            bankCode: 'MB',
            accountNo: '0987654321012',
            usedDay: 8500000,
            dailyLimit: 10000000,
            dayPercent: 85,
            status: 'ACTIVE',
          },
        ],
      },
      kpis: {
        revenue: null,
        cashDrawer: null,
        transfer: null,
        inventory: null,
        openOrders: null,
        profit: null,
      },
      revenueSeries: null,
      paymentBreakdown: [],
      paymentQrAccounts: [
        {
          id: 1,
          label: 'MBBank Chinh',
          bankCode: 'MB',
          accountNo: '0987654321012',
          accountName: 'TRAN VAN A',
          priority: 1,
          isActive: true,
          dailyLimit: 10000000,
          monthlyLimit: null,
          yearlyLimit: null,
          usedDay: 8500000,
          usedMonth: 10000000,
          usedYear: 10000000,
          status: 'ACTIVE',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-28T00:00:00.000Z',
        },
      ],
      liveTables: {
        tables: [
          {
            id: 1,
            name: 'Bàn 01',
            qrToken: 'secret-table-qr-token-1234',
            status: 'AVAILABLE',
            activeOrderId: null,
            activeOrder: null,
          },
        ],
        takeaways: [],
      },
      kitchenStations: null,
      topProducts: null,
      discountsAndRisk: null,
      recentInventoryImports: [],
      staffing: null,
      recentInvoices: [],
      recentAuditLogs: [
        {
          id: 1,
          module: 'POS',
          action: 'Huỷ đơn',
          actorId: 1,
          actorFullName: 'Admin',
          actorUsername: 'admin',
          summary: 'Hủy đơn',
          ipAddress: '14.224.1.1',
          deviceLabel: 'Chrome',
          metadata: {},
          createdAt: '2026-11-28T05:00:00.000Z',
        },
      ],
    } as const;

    const getOverview = vi.fn().mockResolvedValue(mockOverview);
    const getDailyItemSales = vi.fn().mockResolvedValue({ summary: { totalOrders: 3 } });
    const getPayrollSummary = vi.fn().mockResolvedValue({ summary: { totalSalary: 15000000 } });
    const getScheduleWeek = vi.fn().mockResolvedValue({ weekStartDate: '2026-11-23', cells: [] });
    const preview = vi.fn().mockResolvedValue({ expectedCashInDrawer: 500000 });
    const listSettlements = vi.fn().mockResolvedValue({ total: 1, items: [] });

    const controller = new InternalBizController(
      { getOverview, getDailyItemSales } as never,
      { preview, listSettlements } as never,
      { getPayrollSummary } as never,
      { getScheduleWeek } as never,
    );

    const loopbackReq = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as never;
    const remoteReq = { socket: { remoteAddress: '103.252.136.192' }, headers: { 'x-forwarded-for': '127.0.0.1' } } as never;

    const overviewRes = await controller.getOverview(loopbackReq, { preset: 'today' });
    expect(getOverview).toHaveBeenCalledWith({ preset: 'today' }, expect.objectContaining({ isSuperAdmin: true }));
    expect(overviewRes.alerts.nearLimitQrAccounts[0]?.accountNo).toBe('0987654321012');
    expect(overviewRes.paymentQrAccounts[0]?.accountNo).toBe('0987654321012');
    expect(overviewRes.recentAuditLogs[0]?.ipAddress).toBe('14.224.1.1');
    expect(overviewRes.recentAuditLogs[0]?.deviceLabel).toBe('Chrome');

    await expect(controller.getDailyItems(loopbackReq, { preset: 'today' })).resolves.toMatchObject({ summary: { totalOrders: 3 } });
    await expect(controller.getPayroll(loopbackReq, { fromDate: '2026-11-01', toDate: '2026-11-28' })).resolves.toMatchObject({ summary: { totalSalary: 15000000 } });
    await expect(controller.getSchedule(loopbackReq, { weekStartDate: '2026-11-23' })).resolves.toMatchObject({ weekStartDate: '2026-11-23' });
    await expect(controller.getCashflowPreview(loopbackReq)).resolves.toMatchObject({ expectedCashInDrawer: 500000 });
    await expect(controller.getCashflowSettlements(loopbackReq, { page: 1, limit: 10 })).resolves.toMatchObject({ total: 1 });

    expect(() => controller.getOverview(remoteReq, { preset: 'today' })).toThrow(ForbiddenException);
    expect(() => controller.getDailyItems(remoteReq, { preset: 'today' })).toThrow(ForbiddenException);
    expect(() => controller.getPayroll(remoteReq, { fromDate: '2026-11-01', toDate: '2026-11-28' })).toThrow(ForbiddenException);
    expect(() => controller.getSchedule(remoteReq, { weekStartDate: '2026-11-23' })).toThrow(ForbiddenException);
    expect(() => controller.getCashflowPreview(remoteReq)).toThrow(ForbiddenException);
    expect(() => controller.getCashflowSettlements(remoteReq, { page: 1, limit: 10 })).toThrow(ForbiddenException);
  });
});
