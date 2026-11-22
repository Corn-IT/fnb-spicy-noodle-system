import { env } from '@/config/env';

export function resolvePublicAssetUrl(
  rawUrl?: string | null,
  apiBaseUrl: string = env.VITE_API_BASE_URL,
): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('/api/v1/')) {
    return trimmed;
  }

  let base = apiBaseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) {
    base = base.slice(0, -'/api/v1'.length);
  }
  return base ? `${base}${trimmed}` : trimmed;
}
