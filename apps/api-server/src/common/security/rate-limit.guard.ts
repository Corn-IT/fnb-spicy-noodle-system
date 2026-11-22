import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthPrincipal } from '@fnb/shared';
import type { Request, Response } from 'express';
import { extractClientIp } from './client-info.util';
import { isCachedTakeawayQrToken } from './takeaway-qr.util';

export { extractClientIp };

type RateLimitRequest = Request & {
  user?: AuthPrincipal;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

interface BucketState {
  timestamps: number[];
  expiresAt: number;
}

interface RateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

const SCRAPER_USER_AGENT_PATTERN =
  /\b(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|nessus|scrapy|httrack|python-requests|python-urllib|go-http-client|libwww-perl|dirbuster|gobuster|wfuzz|ffuf)\b/i;

const SENSITIVE_LIST_PATH_PATTERN =
  /^\/api\/v1\/(invoices|employees|mdm|audit-logs|users)(?:\/|$|\?)/i;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private static readonly MAX_BUCKETS = 10_000;
  private readonly buckets = new Map<string, BucketState>();
  private lastCleanupAt = 0;
  private forceEnabled = false;

  getBucketCount(): number {
    return this.buckets.size;
  }

  /**
   * Used in unit tests to explicitly verify rate-limiting behavior even when NODE_ENV === 'test'.
   */
  setForceEnabled(enabled: boolean): void {
    this.forceEnabled = enabled;
  }

  resetAll(): void {
    this.buckets.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    if (process.env.NODE_ENV === 'test' && !this.forceEnabled) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitRequest>();
    const response = http.getResponse<Response>();

    const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
    const method = (request.method ?? 'GET').toUpperCase();
    const clientIp = extractClientIp(request);

    // 1. Anti-scraper / vulnerability scanner User-Agent check on public routes
    if (path.startsWith('/api/v1/public/')) {
      const userAgent = String(request.headers['user-agent'] ?? '');
      if (SCRAPER_USER_AGENT_PATTERN.test(userAgent)) {
        throw new ForbiddenException({
          code: 'SECURITY_BOT_BLOCKED',
          message: 'Truy cập tự động bị từ chối bởi hệ thống bảo vệ',
        });
      }
    }

    // 2. Build composite rate-limit rules for this endpoint
    const rules = this.resolveRules(method, path, clientIp, request);
    if (rules.length === 0) return true;

    const now = Date.now();
    this.cleanupExpiredBuckets(now);

    let minRemaining = Number.POSITIVE_INFINITY;
    for (const rule of rules) {
      const { allowed, remaining, retryAfterSeconds } = this.consumeBucket(rule, now);
      if (remaining < minRemaining) minRemaining = remaining;

      if (!allowed) {
        if (typeof response?.setHeader === 'function') {
          response.setHeader('Retry-After', String(retryAfterSeconds));
          response.setHeader('X-RateLimit-Remaining', '0');
        }
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Thao tác quá nhanh hoặc vượt quá giới hạn bảo mật, vui lòng thử lại sau ít giây',
            details: { retryAfterSeconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (typeof response?.setHeader === 'function' && Number.isFinite(minRemaining)) {
      response.setHeader('X-RateLimit-Remaining', String(minRemaining));
    }
    return true;
  }

  private resolveRules(
    method: string,
    path: string,
    clientIp: string,
    request: RateLimitRequest,
  ): RateLimitRule[] {
    if (path === '/api/v1/health') return [];

    // Auth Login: strict brute-force cap per (IP + username) and global IP cap
    if (method === 'POST' && path === '/api/v1/auth/login') {
      const rawUsername = typeof request.body?.username === 'string'
        ? request.body.username.trim().toLowerCase().slice(0, 64)
        : 'unknown';
      return [
        {
          key: `auth:acct:${clientIp}:${rawUsername}`,
          limit: 8,
          windowMs: 5 * 60_000,
        },
        {
          key: `auth:ip:${clientIp}`,
          limit: 25,
          windowMs: 5 * 60_000,
        },
      ];
    }

    // Auth Refresh: scoped per session cookie/token fingerprint so multiple POS tabs/terminals on shared shop Wi-Fi don't lock each other out
    if (method === 'POST' && path === '/api/v1/auth/refresh') {
      const refreshFp = extractRefreshCookieFingerprint(request);
      return [
        {
          key: `auth-refresh:tok:${clientIp}:${refreshFp}`,
          limit: 20,
          windowMs: 5 * 60_000,
        },
        {
          key: `auth-refresh:ip:${clientIp}`,
          limit: 60,
          windowMs: 5 * 60_000,
        },
      ];
    }

    // Public QR Menu: anti-scraping per IP (allows shared restaurant Wi-Fi NAT behind Cloudflare)
    if (method === 'GET' && path === '/api/v1/public/menu') {
      return [
        {
          key: `pub-menu:ip:${clientIp}`,
          limit: 120,
          windowMs: 60_000,
        },
      ];
    }

    // Public QR Order submission: per-table (qrToken) spam lock, or per-(qrToken, clientIp) for shared takeaway QR
    if (method === 'POST' && path === '/api/v1/public/orders/qr') {
      const qrToken = typeof request.body?.qrToken === 'string'
        ? request.body.qrToken.trim().slice(0, 64)
        : 'unknown';
      if (isCachedTakeawayQrToken(qrToken)) {
        return [
          {
            key: `pub-qr:takeaway-ip:${qrToken}:${clientIp}`,
            limit: 6,
            windowMs: 60_000,
          },
          {
            key: `pub-qr:takeaway-all:${qrToken}`,
            limit: 30,
            windowMs: 60_000,
          },
          {
            key: `pub-qr:ip:${clientIp}`,
            limit: 60,
            windowMs: 60_000,
          },
        ];
      }
      return [
        {
          key: `pub-qr:table:${qrToken}`,
          limit: 6,
          windowMs: 60_000,
        },
        {
          key: `pub-qr:ip:${clientIp}`,
          limit: 60,
          windowMs: 60_000,
        },
      ];
    }

    const actorKey =
      request.user?.id
        ? `user:${request.user.id}`
        : extractBearerTokenFingerprint(request.headers?.authorization) ?? `ip:${clientIp}`;

    // Self-service password change: protect logged-in terminals against brute-forcing currentPassword
    if (method === 'PATCH' && path === '/api/v1/profile/password') {
      return [
        {
          key: `pwd-chg:actor:${actorKey}`,
          limit: 8,
          windowMs: 5 * 60_000,
        },
        {
          key: `pwd-chg:ip:${clientIp}`,
          limit: 25,
          windowMs: 5 * 60_000,
        },
      ];
    }

    // Bulk data listing endpoints: anti-harvesting cap
    if (method === 'GET' && SENSITIVE_LIST_PATH_PATTERN.test(path)) {
      return [
        {
          key: `list:${actorKey}:${path}`,
          limit: 60,
          windowMs: 60_000,
        },
      ];
    }

    // General authenticated POS & operational APIs
    if (path.startsWith('/api/v1/')) {
      return [
        {
          key: `api:${actorKey}`,
          limit: 300,
          windowMs: 60_000,
        },
      ];
    }

    return [];
  }

  private consumeBucket(
    rule: RateLimitRule,
    now: number,
  ): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const windowStart = now - rule.windowMs;
    const existing = this.buckets.get(rule.key);
    const activeTimestamps = existing
      ? existing.timestamps.filter((timestamp) => timestamp > windowStart)
      : [];

    if (activeTimestamps.length >= rule.limit) {
      const oldest = activeTimestamps[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
      this.buckets.set(rule.key, {
        timestamps: activeTimestamps,
        expiresAt: now + rule.windowMs,
      });
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    activeTimestamps.push(now);
    this.buckets.set(rule.key, {
      timestamps: activeTimestamps,
      expiresAt: now + rule.windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(0, rule.limit - activeTimestamps.length),
      retryAfterSeconds: 0,
    };
  }

  private cleanupExpiredBuckets(now: number): void {
    const overMax = this.buckets.size >= RateLimitGuard.MAX_BUCKETS;
    if (!overMax && now - this.lastCleanupAt < 60_000 && this.buckets.size < 2000) return;
    this.lastCleanupAt = now;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
    if (this.buckets.size >= RateLimitGuard.MAX_BUCKETS) {
      const overflow = this.buckets.size - RateLimitGuard.MAX_BUCKETS + 500;
      let removed = 0;
      for (const key of this.buckets.keys()) {
        this.buckets.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
  }
}

function extractBearerTokenFingerprint(authorizationHeader: unknown): string | null {
  if (typeof authorizationHeader !== 'string') return null;
  const trimmed = authorizationHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  if (token.length < 16) return null;
  return `tok:${token.slice(-24)}`;
}

function extractRefreshCookieFingerprint(request: RateLimitRequest): string {
  const cookieToken =
    typeof (request as RateLimitRequest & { cookies?: Record<string, unknown> }).cookies?.refreshToken === 'string'
      ? String((request as RateLimitRequest & { cookies?: Record<string, unknown> }).cookies?.refreshToken)
      : '';
  const rawHeader = cookieToken || String(request.headers?.cookie ?? '');
  const trimmed = rawHeader.trim();
  if (trimmed.length < 8) return 'anon';
  return trimmed.slice(-24);
}
