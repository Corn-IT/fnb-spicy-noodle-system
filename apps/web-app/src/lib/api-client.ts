import {
  ApiErrorResponseSchema,
  ErrorCodes,
  RevokedSessionNoticeSchema,
  resolveHttpErrorDefinition,
  type ApiErrorResponse,
  type MessageVars,
  type UserPermissions,
} from '@fnb/shared';

import { toast } from '@/components/ui/toast';
import { env } from '@/config/env';
import { type AuthNoticeMeta, type AuthNoticeReason, useAuthStore } from '@/stores/auth.store';
import { type ServerUiPreferences, useUiPreferencesStore } from '@/stores/ui-preferences.store';
import {
  resolveCachedAppMessage,
  resolveErrorFromStoreCache,
} from '@/utils/store-messages-cache';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(payload: ApiErrorResponse) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.details = payload.details;
    this.requestId = payload.requestId;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuthRefresh?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

function extractSessionRevokeFromError(payload: {
  code?: string;
  details?: unknown;
}): { noticeReason: AuthNoticeReason; meta: AuthNoticeMeta | null } | null {
  if (
    payload.code !== ErrorCodes.AUTH_SESSION_REPLACED &&
    payload.code !== ErrorCodes.AUTH_SESSION_REVOKED
  ) {
    return null;
  }

  const parsedDetails = RevokedSessionNoticeSchema.safeParse(payload.details);
  const meta: AuthNoticeMeta | null = parsedDetails.success
    ? {
        reason: parsedDetails.data.reason,
        at: parsedDetails.data.at,
      }
    : null;

  return {
    noticeReason:
      payload.code === ErrorCodes.AUTH_SESSION_REPLACED
        ? 'SESSION_REPLACED'
        : 'SESSION_REVOKED',
    meta,
  };
}

async function attemptTokenRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const hadUserSession = useAuthStore.getState().user !== null;
    try {
      const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Chỉ xoá phiên đăng nhập khi Refresh Token thực sự không hợp lệ / bị thu hồi (401/403).
        // Nếu lỗi mạng hoặc Server bảo trì / sập tạm thời (500/502/503/504), giữ nguyên phiên làm việc!
        if (response.status === 401 || response.status === 403) {
          let errPayload: { code?: string; details?: unknown } = {};
          try {
            errPayload = (await response.json()) as { code?: string; details?: unknown };
          } catch {
            // Ignore empty/non-JSON body
          }
          const revoked = extractSessionRevokeFromError(errPayload);
          if (revoked) {
            useAuthStore.getState().clearAuth(revoked.noticeReason, revoked.meta);
          } else {
            useAuthStore.getState().clearAuth(hadUserSession ? 'SESSION_EXPIRED' : null);
          }
        }
        return null;
      }

      const data = (await response.json()) as {
        accessToken?: string;
        user?: {
          id: number;
          employeeId: number;
          username: string;
          isSuperAdmin: boolean;
          permissions: UserPermissions;
          employee?: { fullName?: string; avatarUrl?: string | null };
          uiPreferences?: ServerUiPreferences;
        };
      };
      if (data?.accessToken) {
        useAuthStore.getState().setAccessToken(data.accessToken);
        if (data.user) {
          useAuthStore.getState().updateUser({
            id: data.user.id,
            employeeId: data.user.employeeId,
            username: data.user.username,
            fullName: data.user.employee?.fullName,
            avatarUrl: data.user.employee?.avatarUrl,
            isSuperAdmin: data.user.isSuperAdmin,
            permissions: data.user.permissions,
          });
          // Restoring a session (page reload, token refresh on another device) re-syncs the
          // account preferences; unsent local changes are protected inside hydrateFromServer.
          if (data.user.uiPreferences) {
            useUiPreferencesStore.getState().hydrateFromServer(data.user.uiPreferences);
          }
        }
        return data.accessToken;
      }

      useAuthStore.getState().clearAuth(hadUserSession ? 'SESSION_EXPIRED' : null);
      return null;
    } catch {
      // Lỗi đứt mạng tạm thời (Failed to fetch) -> tuyệt đối KHÔNG xoá phiên đăng nhập của thu ngân
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function refreshAccessToken(): Promise<string | null> {
  return attemptTokenRefresh();
}

export function getJwtExpirationMs(token: string | null | undefined): number | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded =
      typeof window !== 'undefined' && typeof window.atob === 'function'
        ? window.atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
}

export async function bootstrapAuthSession(): Promise<string | null> {
  const state = useAuthStore.getState();
  if (state.accessToken) return state.accessToken;
  if (!state.user) return null;
  return attemptTokenRefresh();
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  let base = env.VITE_API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/api/v1') && normalizedPath.startsWith('/api/v1')) {
    base = base.slice(0, -'/api/v1'.length);
  }
  const url = new URL(`${base}${normalizedPath}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function parseErrorResponse(response: Response): Promise<ApiErrorResponse> {
  const headerRequestId = response.headers.get('x-request-id') ?? undefined;
  const rawRetryAfter = response.headers.get('retry-after');
  const retryAfterSeconds =
    rawRetryAfter && /^\d+$/.test(rawRetryAfter.trim())
      ? Number(rawRetryAfter.trim())
      : undefined;

  try {
    const raw = await response.json();
    const parsed = ApiErrorResponseSchema.safeParse(raw);
    if (parsed.success) {
      return {
        ...parsed.data,
        ...(parsed.data.requestId ?? headerRequestId
          ? { requestId: parsed.data.requestId ?? headerRequestId }
          : {}),
      };
    }
    if (raw && typeof raw === 'object' && 'message' in raw) {
      return {
        statusCode: response.status,
        error: response.statusText || 'Error',
        message: String((raw as { message: unknown }).message),
        code:
          'code' in raw && typeof (raw as { code: unknown }).code === 'string'
            ? (raw as { code: string }).code
            : undefined,
        details: 'details' in raw ? (raw as { details: unknown }).details : undefined,
        ...(headerRequestId ? { requestId: headerRequestId } : {}),
      };
    }
  } catch {
    // Non-JSON response fallback (e.g., Caddy/Proxy HTML 502/503/504/413)
  }

  const httpDef = resolveHttpErrorDefinition({ statusCode: response.status });
  const customHttpMsg = resolveCachedAppMessage(
    httpDef.messageKey,
    retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined,
  );
  const message =
    response.status === 403
      ? 'Bạn không có quyền thực hiện thao tác này'
      : response.status === 401
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'
        : customHttpMsg.isOverridden
          ? customHttpMsg.title
          : httpDef.defaultTitle;

  return {
    statusCode: response.status,
    error: response.statusText || httpDef.statusLabel,
    message,
    ...(retryAfterSeconds !== undefined ? { details: { retryAfterSeconds } } : {}),
    ...(headerRequestId ? { requestId: headerRequestId } : {}),
  };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers: customHeaders, skipAuthRefresh, ...rest } = options;
  const url = buildUrl(path, params);

  const executeFetch = async (token: string | null): Promise<Response> => {
    const headers = new Headers(customHeaders);
    headers.set('Accept', 'application/json');
    if (body !== undefined && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const controller = !rest.signal && typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId =
      controller && typeof setTimeout === 'function'
        ? setTimeout(() => controller.abort(), 15_000)
        : null;

    try {
      return await fetch(url, {
        ...rest,
        ...(controller ? { signal: controller.signal } : {}),
        headers,
        credentials: 'include',
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      throw new ApiClientError({
        statusCode: isTimeout ? 408 : 0,
        error: isTimeout ? 'Request Timeout' : 'Network Error',
        code: 'NETWORK_ERROR',
        message: isTimeout
          ? 'Máy chủ phản hồi quá thời gian chờ (15 giây). Vui lòng kiểm tra kết nối mạng và thử lại.'
          : 'Mất kết nối tới máy chủ hoặc đường truyền mạng bị gián đoạn. Vui lòng kiểm tra Wi-Fi/mạng và thử lại.',
      });
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  };

  let currentToken = useAuthStore.getState().accessToken;
  let didBootstrapRefresh = false;
  if (
    !currentToken &&
    !skipAuthRefresh &&
    useAuthStore.getState().user !== null &&
    !path.includes('/api/v1/public/') &&
    !path.includes('/api/v1/auth/login') &&
    !path.includes('/api/v1/auth/refresh')
  ) {
    didBootstrapRefresh = true;
    currentToken = await bootstrapAuthSession();
    if (!currentToken && !useAuthStore.getState().user) {
      throw new ApiClientError({
        statusCode: 401,
        error: 'Unauthorized',
        code: ErrorCodes.AUTH_TOKEN_EXPIRED,
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
      });
    }
  }
  let response = await executeFetch(currentToken);

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !didBootstrapRefresh &&
    !path.includes('/api/v1/auth/login') &&
    !path.includes('/api/v1/auth/refresh')
  ) {
    let directRevoke: ReturnType<typeof extractSessionRevokeFromError> = null;
    try {
      const cloned = response.clone();
      const rawJson = (await cloned.json()) as { code?: string; details?: unknown };
      directRevoke = extractSessionRevokeFromError(rawJson);
    } catch {
      // Ignore parse failure; proceed with normal token refresh
    }

    if (directRevoke) {
      useAuthStore.getState().clearAuth(directRevoke.noticeReason, directRevoke.meta);
    } else {
      const refreshedToken = await attemptTokenRefresh();
      if (refreshedToken) {
        response = await executeFetch(refreshedToken);
      }
    }
  }

  if (!response.ok) {
    const errorPayload = await parseErrorResponse(response);
    const detailsVars =
      errorPayload.details && typeof errorPayload.details === 'object' && !Array.isArray(errorPayload.details)
        ? (errorPayload.details as MessageVars)
        : undefined;
    const resolvedErr = errorPayload.code
      ? resolveErrorFromStoreCache(errorPayload.code, errorPayload.message, detailsVars)
      : (() => {
          const httpDef = resolveHttpErrorDefinition({ statusCode: response.status });
          const httpMsg = resolveCachedAppMessage(httpDef.messageKey, detailsVars);
          return httpMsg.isOverridden ? httpMsg : undefined;
        })();

    if (resolvedErr?.isOverridden) {
      errorPayload.message = resolvedErr.description
        ? `${resolvedErr.title}: ${resolvedErr.description}`
        : resolvedErr.title;
    }

    // HARD INVARIANT 8:
    // 403 Forbidden -> Hiển thị toast lỗi thiếu quyền, GIỮ NGUYÊN phiên đăng nhập (tuyệt đối không xoá auth hay đá ra /login)
    if (response.status === 403 && !errorPayload.code?.startsWith('QR_')) {
      toast({
        variant: 'destructive',
        title: resolvedErr?.title ?? 'Không đủ quyền truy cập (403)',
        description: resolvedErr?.description ?? errorPayload.message,
      });
    }

    throw new ApiClientError(errorPayload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
