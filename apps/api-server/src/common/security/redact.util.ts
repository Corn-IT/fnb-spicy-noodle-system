const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|qrToken|refreshToken|accessToken|password|secret)=)([^&#\s]*)/gi;

const SENSITIVE_METADATA_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'refreshtoken',
  'accesstoken',
  'qrtoken',
  'secret',
  'authorization',
]);

export function redactSensitiveUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  return rawUrl.replace(SENSITIVE_QUERY_PARAM_PATTERN, '$1[REDACTED]');
}

export function maskSensitiveIdentifier(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Trống';
  const trimmed = String(raw).trim();
  if (!trimmed) return 'Trống';
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.min(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

export function sanitizeAuditMetadata(input: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4 || typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
