import type { Request } from 'express';

export interface ClientMeta {
  ipAddress: string;
  deviceLabel: string;
  userAgent: string | null;
}

export function normalizeIpAddress(raw?: string | null): string {
  if (typeof raw !== 'string') return 'unknown';
  let value = raw.trim();
  if (!value) return 'unknown';

  if (value.includes(',')) {
    value = value.split(',')[0]?.trim() ?? '';
  }

  if (!value) return 'unknown';

  if (value.startsWith('::ffff:')) {
    value = value.slice('::ffff:'.length);
  }

  if (value === '::1') {
    return '127.0.0.1';
  }

  // Strip port suffix from IPv4:port format (leave IPv6 colons untouched)
  const ipv4PortMatch = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (ipv4PortMatch?.[1]) {
    value = ipv4PortMatch[1];
  }

  return value.slice(0, 64) || 'unknown';
}

export function extractClientIpFromHeaders(
  headers?: Record<string, unknown>,
  fallbackIp?: string | null,
): string {
  const cfConnectingIp = headers?.['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
    return normalizeIpAddress(cfConnectingIp);
  }

  const xForwardedFor = headers?.['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const firstHop = xForwardedFor.split(',')[0]?.trim();
    if (firstHop) return normalizeIpAddress(firstHop);
  }

  const xRealIp = headers?.['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return normalizeIpAddress(xRealIp);
  }

  return normalizeIpAddress(fallbackIp);
}

export function extractClientIp(request: Request): string {
  return extractClientIpFromHeaders(
    request.headers as Record<string, unknown>,
    request.ip || request.socket?.remoteAddress || 'unknown',
  );
}

function detectOsLabel(ua: string): string {
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows nt 10\.0/i.test(ua)) return 'Windows';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Thiết bị';
}

function detectBrowserLabel(ua: string): string {
  if (/coc_coc_browser/i.test(ua)) return 'Cốc Cốc';
  if (/edg\//i.test(ua) || /edgios|edga/i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera';
  if (/zalo/i.test(ua)) return 'Zalo';
  if (/fbav|fban/i.test(ua)) return 'Facebook';
  if (/crios/i.test(ua) || /chrome\//i.test(ua)) return 'Chrome';
  if (/fxios|firefox\//i.test(ua)) return 'Firefox';
  if (/safari\//i.test(ua) && !/chrome|crios|android/i.test(ua)) return 'Safari';
  if (/curl|postman|insomnia|node|undici|axios/i.test(ua)) return 'API Client';
  return 'Trình duyệt';
}

export function parseDeviceLabel(rawUserAgent?: string | null): string {
  if (typeof rawUserAgent !== 'string' || !rawUserAgent.trim()) {
    return 'Không rõ thiết bị';
  }
  const ua = rawUserAgent.trim();
  const browser = detectBrowserLabel(ua);
  if (browser === 'API Client') return 'API Client';
  const os = detectOsLabel(ua);
  return `${os} · ${browser}`.slice(0, 128);
}

export function extractClientMetaFromHeaders(
  headers?: Record<string, unknown>,
  fallbackIp?: string | null,
): ClientMeta {
  const rawUa = typeof headers?.['user-agent'] === 'string' ? headers['user-agent'].trim() : '';
  return {
    ipAddress: extractClientIpFromHeaders(headers, fallbackIp),
    deviceLabel: parseDeviceLabel(rawUa),
    userAgent: rawUa ? rawUa.slice(0, 512) : null,
  };
}

export function extractClientMeta(request: Request): ClientMeta {
  return extractClientMetaFromHeaders(
    request.headers as Record<string, unknown>,
    request.ip || request.socket?.remoteAddress || 'unknown',
  );
}
