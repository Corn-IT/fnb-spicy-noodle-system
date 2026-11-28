import * as os from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import { redactSensitiveUrl } from '../security/redact.util';

export type MonitoringFetchFn = typeof fetch;

export interface MonitoringConfig {
  botToken: string;
  chatId: string;
  projectName: string;
  sourceName: string;
  envLabel: string;
  slowMs: number;
  ramDiffMb: number;
  cpuDiffMs: number;
  cooldownMs: number;
}

export interface RequestMetricInput {
  method: string;
  url: string;
  handler: string;
  durationMs: number;
  ramDiffMb: number;
  cpuDiffMs: number;
  clientIp: string;
  requestId?: string;
}

export interface ServerErrorAlertInput {
  statusCode: number;
  method: string;
  url: string;
  handler: string;
  errorSummary: string;
  clientIp: string;
  requestId?: string;
}

export interface InternalMetricsSnapshot {
  status: 'ok';
  uptimeSeconds: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  loadAvg1m: number;
  loadAvg5m: number;
  windowStartedAt: string;
  windowRequests: number;
  windowSlowCount: number;
  window5xxCount: number;
}

interface CooldownEntry {
  lastSentAt: number;
  suppressedCount: number;
}

const DEFAULT_SLOW_MS = 3000;
const DEFAULT_RAM_DIFF_MB = 64;
const DEFAULT_CPU_DIFF_MS = 2000;
const DEFAULT_COOLDOWN_MS = 300_000;
const MAX_COOLDOWN_KEYS = 500;
const TELEGRAM_SEND_TIMEOUT_MS = 4000;
const MAX_SINGLE_LINE_LEN = 160;

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function readMonitoringConfig(env: NodeJS.ProcessEnv = process.env): MonitoringConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development').trim().toUpperCase();
  return {
    botToken: (env.FNB_TELEGRAM_BOT_TOKEN ?? '').trim(),
    chatId: (env.FNB_TELEGRAM_CHAT_ID ?? '').trim(),
    projectName: (env.FNB_ALERT_PROJECT_NAME ?? '').trim() || 'LonaPOS',
    sourceName: (env.FNB_ALERT_SOURCE_NAME ?? '').trim() || 'FNB_POS_API',
    envLabel: nodeEnv || 'PRODUCTION',
    slowMs: parsePositiveNumber(env.FNB_ALERT_SLOW_MS, DEFAULT_SLOW_MS),
    ramDiffMb: parsePositiveNumber(env.FNB_ALERT_RAM_DIFF_MB, DEFAULT_RAM_DIFF_MB),
    cpuDiffMs: parsePositiveNumber(env.FNB_ALERT_CPU_DIFF_MS, DEFAULT_CPU_DIFF_MS),
    cooldownMs: parsePositiveNumber(env.FNB_ALERT_COOLDOWN_MS, DEFAULT_COOLDOWN_MS),
  };
}

export function sanitizeSingleLine(raw: string, maxLen = MAX_SINGLE_LINE_LEN): string {
  const cleaned = raw.replace(/[\r\n\t\u0000-\u001f]+/g, ' ').trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

export function formatVnTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.hour}:${byType.minute}:${byType.second} ${byType.day}/${byType.month}/${byType.year}`;
}

function toMb(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

export function isLoopbackSocketAddress(rawAddress?: string | null): boolean {
  if (typeof rawAddress !== 'string') return false;
  const trimmed = rawAddress.trim().toLowerCase();
  return trimmed === '127.0.0.1' || trimmed === '::1' || trimmed === '::ffff:127.0.0.1';
}

@Injectable()
export class TelegramAlertService {
  private readonly logger = new Logger(TelegramAlertService.name);
  private readonly cooldowns = new Map<string, CooldownEntry>();
  private readonly hostId = os.hostname();
  private windowStartedAt = new Date().toISOString();
  private windowRequests = 0;
  private windowSlowCount = 0;
  private window5xxCount = 0;
  private forceEnabledInTest = false;
  private fetchFn: MonitoringFetchFn = globalThis.fetch;

  /**
   * Test hook to exercise Telegram HTTP dispatch safely inside Vitest without network side effects.
   */
  configureForTests(options: { fetchFn?: MonitoringFetchFn; forceEnabled?: boolean }): void {
    if (options.fetchFn) this.fetchFn = options.fetchFn;
    if (typeof options.forceEnabled === 'boolean') this.forceEnabledInTest = options.forceEnabled;
  }

  recordRequestMetric(metric: RequestMetricInput): void {
    const cleanPath = (metric.url.split('?')[0] ?? '').trim();
    if (cleanPath === '/internal/metrics') {
      return;
    }

    if (cleanPath !== '/api/v1/health') {
      this.windowRequests += 1;
    }

    const config = readMonitoringConfig();
    const issues: string[] = [];
    if (metric.durationMs >= config.slowMs) issues.push('🐢 Slow');
    if (metric.ramDiffMb >= config.ramDiffMb) issues.push('💾 High RAM');
    if (metric.cpuDiffMs >= config.cpuDiffMs) issues.push('⚙️ High CPU');

    if (issues.length === 0) {
      return;
    }

    this.windowSlowCount += 1;
    if (!this.isAlertDispatchEnabled(config)) {
      return;
    }

    const cooldownResult = this.consumeCooldown(`perf:${metric.method.toUpperCase()}:${cleanPath}`, config.cooldownMs);
    if (!cooldownResult.shouldSend) {
      return;
    }

    const message = this.formatAlertMessage({
      header: `🚀 [${config.projectName}] PERFORMANCE ALERT`,
      issueLine: issues.join(' | '),
      method: metric.method,
      url: metric.url,
      handler: metric.handler,
      clientIp: metric.clientIp,
      requestId: metric.requestId,
      suppressedCount: cooldownResult.suppressedCount,
      metricsLines: [
        `• ⏱️ Time: ${metric.durationMs.toFixed(2)}ms / ${config.slowMs}ms`,
        `• 💾 RAM: ${metric.ramDiffMb.toFixed(2)}MB / ${config.ramDiffMb}MB`,
        `• ⚙️ CPU: ${metric.cpuDiffMs.toFixed(2)}ms / ${config.cpuDiffMs}ms`,
      ],
      config,
    });

    void this.dispatchTelegramMessage(config, message);
  }

  reportServerError(input: ServerErrorAlertInput): void {
    if (input.statusCode < 500) {
      return;
    }

    this.window5xxCount += 1;
    const config = readMonitoringConfig();
    if (!this.isAlertDispatchEnabled(config)) {
      return;
    }

    const cleanPath = (input.url.split('?')[0] ?? '').trim();
    const cooldownResult = this.consumeCooldown(
      `5xx:${input.statusCode}:${input.method.toUpperCase()}:${cleanPath}`,
      config.cooldownMs,
    );
    if (!cooldownResult.shouldSend) {
      return;
    }

    const safeError = sanitizeSingleLine(input.errorSummary || 'Internal server error', 180);
    const message = this.formatAlertMessage({
      header: `🔥 [${config.projectName}] SERVER ERROR ${input.statusCode}`,
      issueLine: `🔥 HTTP ${input.statusCode} — ${safeError}`,
      method: input.method,
      url: input.url,
      handler: input.handler,
      clientIp: input.clientIp,
      requestId: input.requestId,
      suppressedCount: cooldownResult.suppressedCount,
      metricsLines: [],
      config,
    });

    void this.dispatchTelegramMessage(config, message);
  }

  getMetricsSnapshot(resetWindow = false): InternalMetricsSnapshot {
    const mem = process.memoryUsage();
    const [loadAvg1m = 0, loadAvg5m = 0] = os.loadavg();
    const snapshot: InternalMetricsSnapshot = {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      rssMb: toMb(mem.rss),
      heapUsedMb: toMb(mem.heapUsed),
      heapTotalMb: toMb(mem.heapTotal),
      loadAvg1m: Number(loadAvg1m.toFixed(2)),
      loadAvg5m: Number(loadAvg5m.toFixed(2)),
      windowStartedAt: this.windowStartedAt,
      windowRequests: this.windowRequests,
      windowSlowCount: this.windowSlowCount,
      window5xxCount: this.window5xxCount,
    };

    if (resetWindow) {
      this.windowStartedAt = new Date().toISOString();
      this.windowRequests = 0;
      this.windowSlowCount = 0;
      this.window5xxCount = 0;
    }

    return snapshot;
  }

  private isAlertDispatchEnabled(config: MonitoringConfig): boolean {
    if (!config.botToken || !config.chatId) {
      return false;
    }
    if (process.env.NODE_ENV === 'test' && !this.forceEnabledInTest) {
      return false;
    }
    return true;
  }

  private consumeCooldown(key: string, cooldownMs: number): { shouldSend: boolean; suppressedCount: number } {
    const now = Date.now();
    const existing = this.cooldowns.get(key);
    if (existing && now - existing.lastSentAt < cooldownMs) {
      existing.suppressedCount += 1;
      return { shouldSend: false, suppressedCount: 0 };
    }

    if (!existing && this.cooldowns.size >= MAX_COOLDOWN_KEYS) {
      const oldestKey = this.cooldowns.keys().next().value;
      if (oldestKey !== undefined) {
        this.cooldowns.delete(oldestKey);
      }
    }

    const suppressedCount = existing?.suppressedCount ?? 0;
    this.cooldowns.set(key, { lastSentAt: now, suppressedCount: 0 });
    return { shouldSend: true, suppressedCount };
  }

  private formatAlertMessage(params: {
    header: string;
    issueLine: string;
    method: string;
    url: string;
    handler: string;
    clientIp: string;
    requestId?: string;
    suppressedCount: number;
    metricsLines: string[];
    config: MonitoringConfig;
  }): string {
    const mem = process.memoryUsage();
    const [loadAvg1m = 0] = os.loadavg();
    const safeRoute = sanitizeSingleLine(`${params.method.toUpperCase()} ${redactSensitiveUrl(params.url)}`);
    const safeHandler = sanitizeSingleLine(params.handler || 'UnknownHandler', 100);
    const safeIp = sanitizeSingleLine(params.clientIp || 'unknown', 64);
    const reqSuffix = params.requestId ? ` | 🆔 Req: ${sanitizeSingleLine(params.requestId, 36)}` : '';
    const repeatSuffix =
      params.suppressedCount > 0 ? `\n🔁 (+${params.suppressedCount} lần tương tự trong 5 phút qua)` : '';

    const sections = [
      params.header,
      '────────────────────',
      `📍 Project: ${params.config.projectName} | Env: ${params.config.envLabel}`,
      `🏗 Source: ${params.config.sourceName}`,
      `🆔 Container: ${this.hostId}`,
      '────────────────────',
      `🔴 Issue: ${params.issueLine}`,
      `🛣 Route: ${safeRoute}`,
      `🧩 Handler: ${safeHandler}${repeatSuffix}`,
    ];

    if (params.metricsLines.length > 0) {
      sections.push('────────────────────', '📊 Execution Metrics (Diff):', ...params.metricsLines);
    }

    sections.push(
      '────────────────────',
      '📦 Process Real-time Status (Total):',
      `• 🏠 Actual RAM (RSS): ${toMb(mem.rss).toFixed(2)} MB`,
      `• 💎 V8 Heap Used: ${toMb(mem.heapUsed).toFixed(2)} MB`,
      `• 📈 System Load: ${loadAvg1m.toFixed(2)} (avg 1m)`,
      '────────────────────',
      `👥 Client IP: ${safeIp}${reqSuffix}`,
      `⏰ At: ${formatVnTimestamp()}`,
    );

    return sections.join('\n');
  }

  private async dispatchTelegramMessage(config: MonitoringConfig, text: string): Promise<void> {
    try {
      const response = await this.fetchFn(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TELEGRAM_SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`Telegram alert HTTP ${response.status}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Telegram alert dispatch failed: ${msg}`);
    }
  }
}
