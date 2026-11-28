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
  timeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

let refreshPromise: Promise<string | null> | null = null;
let refreshOwner: { revision: number; token: string | null; userId: number | null } | null = null;

// Race the entire IO operation so even a stalled body (or a fetch ignoring abort) is bounded.
async function boundedIo<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal | null,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (callerSignal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const effectiveTimeoutMs =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException('Request cancelled', 'AbortError'));
      controller.abort();
    };
    callerSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const seconds = Math.max(1, Math.round(effectiveTimeoutMs / 1000));
      reject(new ApiClientError({
        statusCode: 408, error: 'Request Timeout', code: 'NETWORK_ERROR',
        message: `Máy chủ phản hồi quá thời gian chờ (${seconds} giây). Vui lòng kiểm tra kết nối mạng và thử lại.`,
      }));
      controller.abort();
    }, effectiveTimeoutMs);
    if (callerSignal?.aborted) cancel();
  });
  try {
    return await Promise.race([stopped, operation(controller.signal)]);
  } finally {
    clearTimeout(timer);
    if (cancel) callerSignal?.removeEventListener('abort', cancel);
  }
}

// A caller may stop waiting for refresh without cancelling the shared refresh for others.
async function waitForRefresh(signal?: AbortSignal | null): Promise<string | null> {
  if (!signal) return attemptTokenRefresh();
  if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      attemptTokenRefresh(),
      new Promise<never>((_, reject) => {
        cancel = () => reject(new DOMException('Request cancelled', 'AbortError'));
        signal.addEventListener('abort', cancel, { once: true });
      }),
    ]);
  } finally {
    if (cancel) signal.removeEventListener('abort', cancel);
  }
}

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
  const state = useAuthStore.getState();
  if (refreshPromise && refreshOwner?.revision === state.sessionRevision && refreshOwner.token === state.accessToken && refreshOwner.userId === (state.user?.id ?? null)) return refreshPromise;
  const owner = { revision: state.sessionRevision, token: state.accessToken, userId: state.user?.id ?? null };
  refreshOwner = owner;
  const stillOwnsSession = () => useAuthStore.getState().sessionRevision === owner.revision && useAuthStore.getState().accessToken === owner.token && (useAuthStore.getState().user?.id ?? null) === owner.userId;
  const pending = (async () => {
    const hadUserSession = state.user !== null;
    try {
      const { response, data: refreshData } = await boundedIo(async (signal) => {
        const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
          signal,
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        });
        const data: unknown = await response.json().catch(() => null);
        return { response, data };
      });
      if (!stillOwnsSession()) return null;

      if (!response.ok) {
        // Chỉ xoá phiên đăng nhập khi Refresh Token thực sự không hợp lệ / bị thu hồi (401).
        // Nếu lỗi mạng hoặc Server bảo trì / sập tạm thời (500/502/503/504), giữ nguyên phiên làm việc!
        if (response.status === 401) {
          const errPayload = (
            refreshData && typeof refreshData === 'object' ? refreshData : {}
          ) as { code?: string; details?: unknown };
          const revoked = extractSessionRevokeFromError(errPayload);
          if (revoked) {
            useAuthStore.getState().clearAuth(revoked.noticeReason, revoked.meta);
          } else {
            useAuthStore.getState().clearAuth(hadUserSession ? 'SESSION_EXPIRED' : null);
          }
        }
        return null;
      }

      const data = (refreshData && typeof refreshData === 'object' ? refreshData : null) as {
        accessToken?: unknown;
        user?: {
          id?: unknown;
          employeeId?: unknown;
          username?: unknown;
          isSuperAdmin?: unknown;
          permissions?: UserPermissions;
          employee?: { fullName?: string; avatarUrl?: string | null };
          uiPreferences?: ServerUiPreferences;
        };
      } | null;
      if (typeof data?.accessToken === 'string' && data.accessToken.length > 0) {
        useAuthStore.getState().setAccessToken(data.accessToken);
        if (
          data.user &&
          typeof data.user === 'object' &&
          typeof data.user.id === 'number' &&
          typeof data.user.employeeId === 'number' &&
          typeof data.user.username === 'string' &&
          typeof data.user.isSuperAdmin === 'boolean' &&
          data.user.permissions
        ) {
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

      return null;
    } catch {
      // Lỗi đứt mạng tạm thời (Failed to fetch) -> tuyệt đối KHÔNG xoá phiên đăng nhập của thu ngân
      return null;
    } finally {
      if (refreshOwner === owner) {
        refreshPromise = null;
        refreshOwner = null;
      }
    }
  })();
  refreshPromise = pending;
  return pending;
}

export async function refreshAccessToken(): Promise<string | null> {
  return attemptTokenRefresh();
}

function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
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
    const payload = JSON.parse(decoded) as unknown;
    return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function getJwtExpirationMs(token: string | null | undefined): number | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' && Number.isFinite(payload.exp)
    ? payload.exp * 1000
    : null;
}

export function getJwtSessionId(token: string | null | undefined): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sid === 'string' && payload.sid.trim().length > 0
    ? payload.sid.trim()
    : null;
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

async function parseErrorResponse(response: Response, bodyText: string): Promise<ApiErrorResponse> {
  const headerRequestId = response.headers.get('x-request-id') ?? undefined;
  const rawRetryAfter = response.headers.get('retry-after');
  const retryAfterSeconds =
    rawRetryAfter && /^\d+$/.test(rawRetryAfter.trim())
      ? Number(rawRetryAfter.trim())
      : undefined;

  try {
    const raw = JSON.parse(bodyText) as unknown;
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

function parseSuccessResponseBody<T>(response: Response, bodyText: string): T {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const trimmedBody = bodyText.trim();
  if (!trimmedBody) {
    return undefined as T;
  }

  try {
    return JSON.parse(trimmedBody) as T;
  } catch {
    const headerRequestId = response.headers.get('x-request-id') ?? undefined;
    const contentType = response.headers.get('content-type') ?? '';
    const isHtmlResponse =
      /text\/html/i.test(contentType) || /^<(?:!doctype|html)\b/i.test(trimmedBody);
    const httpDef = resolveHttpErrorDefinition({ code: 'DATA_VALIDATION_ERROR' });
    const cachedHttpMsg = resolveCachedAppMessage(httpDef.messageKey);
    const defaultMessage = isHtmlResponse
      ? 'Máy chủ hoặc cổng kết nối trả về trang HTML thay vì dữ liệu JSON.'
      : 'Dữ liệu phản hồi từ máy chủ không đúng định dạng JSON hợp lệ.';
    const domainMsg = resolveErrorFromStoreCache('DATA_VALIDATION_ERROR', defaultMessage);
    const message = domainMsg.isOverridden
      ? (domainMsg.description ?? domainMsg.title)
      : cachedHttpMsg.isOverridden
        ? (cachedHttpMsg.description ?? cachedHttpMsg.title)
        : defaultMessage;

    throw new ApiClientError({
      statusCode: response.status,
      error: isHtmlResponse ? 'Unexpected HTML Response' : 'Invalid JSON Response',
      code: 'DATA_VALIDATION_ERROR',
      message,
      ...(headerRequestId ? { requestId: headerRequestId } : {}),
    });
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers: customHeaders, skipAuthRefresh, timeoutMs, ...rest } = options;
  const url = buildUrl(path, params);

  const executeFetch = async (token: string | null): Promise<{ response: Response; bodyText: string }> => {
    const headers = new Headers(customHeaders);
    headers.set('Accept', 'application/json');
    if (body !== undefined && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    try {
      return await boundedIo(async (signal) => {
        const response = await fetch(url, {
          ...rest, signal, headers, credentials: 'include',
          body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
        const bodyText = response.status === 204 || response.status === 205 ? '' : await response.text();
        return { response, bodyText };
      }, rest.signal, timeoutMs);
    } catch (error) {
      if (rest.signal?.aborted || error instanceof ApiClientError) throw error;
      throw new ApiClientError({
        statusCode: 0, error: 'Network Error', code: 'NETWORK_ERROR',
        message: 'Mất kết nối tới máy chủ hoặc đường truyền mạng bị gián đoạn. Vui lòng kiểm tra Wi-Fi/mạng và thử lại.',
      });
    }
  };

  const initialAuth = useAuthStore.getState();
  const requestOwner = { revision: initialAuth.sessionRevision, userId: initialAuth.user?.id ?? null };
  const ownsRequest = () => {
    const current = useAuthStore.getState();
    return current.sessionRevision === requestOwner.revision && (current.user?.id ?? null) === requestOwner.userId;
  };
  let currentToken = initialAuth.accessToken;
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
    currentToken = await waitForRefresh(rest.signal);
    if (!currentToken && !useAuthStore.getState().user) {
      throw new ApiClientError({
        statusCode: 401,
        error: 'Unauthorized',
        code: ErrorCodes.AUTH_TOKEN_EXPIRED,
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
      });
    }
  }
  if (!ownsRequest()) throw new DOMException('Session changed', 'AbortError');
  let { response, bodyText } = await executeFetch(currentToken);

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !didBootstrapRefresh &&
    !path.includes('/api/v1/auth/login') &&
    !path.includes('/api/v1/auth/refresh')
  ) {
    let directRevoke: ReturnType<typeof extractSessionRevokeFromError> = null;
    try {
      const rawJson = JSON.parse(bodyText) as { code?: string; details?: unknown } | null;
      if (rawJson && typeof rawJson === 'object') {
        directRevoke = extractSessionRevokeFromError(rawJson);
      }
    } catch {
      // Ignore parse failure; proceed with normal token refresh
    }

    if (!ownsRequest()) {
      throw new DOMException('Session changed', 'AbortError');
    }
    if (directRevoke) {
      useAuthStore.getState().clearAuth(directRevoke.noticeReason, directRevoke.meta);
    } else {
      const refreshedToken = await waitForRefresh(rest.signal);
      if (!ownsRequest() && useAuthStore.getState().user) {
        throw new DOMException('Session changed', 'AbortError');
      }
      if (refreshedToken) {
        if (!ownsRequest()) throw new DOMException('Session changed', 'AbortError');
        ({ response, bodyText } = await executeFetch(refreshedToken));
      }
    }
  }

  if (!response.ok) {
    const errorPayload = await parseErrorResponse(response, bodyText);
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

  return parseSuccessResponseBody<T>(response, bodyText);
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
