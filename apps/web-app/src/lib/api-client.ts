import { ApiErrorResponseSchema, type ApiErrorResponse } from '@fnb/shared';

import { toast } from '@/components/ui/toast';
import { env } from '@/config/env';
import { useAuthStore } from '@/stores/auth.store';

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

async function attemptTokenRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${env.VITE_API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        useAuthStore.getState().clearAuth();
        return null;
      }

      const data = (await response.json()) as { accessToken?: string };
      if (data?.accessToken) {
        useAuthStore.getState().setAccessToken(data.accessToken);
        return data.accessToken;
      }

      useAuthStore.getState().clearAuth();
      return null;
    } catch {
      useAuthStore.getState().clearAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  const base = env.VITE_API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
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
  try {
    const raw = await response.json();
    const parsed = ApiErrorResponseSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
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
      };
    }
  } catch {
    // Non-JSON response fallback
  }

  return {
    statusCode: response.status,
    error: response.statusText || 'Error',
    message:
      response.status === 403
        ? 'Bạn không có quyền thực hiện thao tác này'
        : response.status === 401
          ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'
          : `Yêu cầu thất bại (${response.status})`,
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

    return fetch(url, {
      ...rest,
      headers,
      credentials: 'include',
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  };

  const currentToken = useAuthStore.getState().accessToken;
  let response = await executeFetch(currentToken);

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !path.includes('/api/v1/auth/login') &&
    !path.includes('/api/v1/auth/refresh')
  ) {
    const refreshedToken = await attemptTokenRefresh();
    if (refreshedToken) {
      response = await executeFetch(refreshedToken);
    }
  }

  if (!response.ok) {
    const errorPayload = await parseErrorResponse(response);

    // HARD INVARIANT 8:
    // 403 Forbidden -> Hiển thị toast lỗi thiếu quyền, GIỮ NGUYÊN phiên đăng nhập (tuyệt đối không xoá auth hay đá ra /login)
    if (response.status === 403) {
      toast({
        variant: 'destructive',
        title: 'Không đủ quyền truy cập (403)',
        description: errorPayload.message,
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
