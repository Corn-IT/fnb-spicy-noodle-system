const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function parseAllowedCorsOrigins(rawCorsOrigin?: string): string[] {
  if (!rawCorsOrigin) return [];
  return rawCorsOrigin
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function isAllowedCorsOrigin(
  requestOrigin: string | undefined,
  configuredOrigins: readonly string[],
  nodeEnv: string = process.env.NODE_ENV ?? 'development',
): boolean {
  // Same-origin non-CORS requests or server-to-server requests do not send an Origin header
  if (!requestOrigin) return true;

  const normalizedOrigin = requestOrigin.trim().replace(/\/+$/, '');
  if (!normalizedOrigin) return false;

  if (configuredOrigins.includes(normalizedOrigin)) {
    return true;
  }

  if (nodeEnv !== 'production' && LOCAL_DEV_ORIGIN_PATTERN.test(normalizedOrigin)) {
    return true;
  }

  return false;
}
