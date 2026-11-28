import {
  HTTP_ERROR_CATALOG_BY_KEY,
  isChunkLoadErrorMessage,
  resolveHttpErrorDefinition,
  resolveStoreMessage,
  type PublicStoreSettingsResponse,
  type StoreMessagesMap,
  type SystemErrorCodeKey,
  type SystemErrorSeverity,
} from '@fnb/shared';
import { ZodError } from 'zod';
import { isRouteErrorResponse } from 'react-router-dom';

import { APP_NAVIGATION_ROUTES } from '@/lib/app-navigation';
import { resolveNavLabel } from '@/hooks/use-store-settings';
import { ApiClientError } from '@/lib/api-client';
import { type AuthenticatedUser } from '@/stores/auth.store';
import { readMergedCachedMessages } from '@/utils/store-messages-cache';

export type ErrorAudience = 'staff' | 'guest';

export interface FieldValidationSummary {
  field: string;
  messages: string[];
}

export interface NormalizedClientError {
  key: SystemErrorCodeKey;
  statusCode: number | null;
  statusLabel: string;
  errorCode?: string;
  severity: SystemErrorSeverity;
  title: string;
  reason: string;
  recoveryHint: string;
  retryAfterSeconds?: number;
  fieldErrors: FieldValidationSummary[];
  requestId?: string;
  path?: string;
}

export interface NormalizeErrorOptions {
  statusKeyOverride?: SystemErrorCodeKey;
  titleOverride?: string;
  reasonOverride?: string;
  recoveryHintOverride?: string;
  audience?: ErrorAudience;
  customMessages?: StoreMessagesMap | null;
  path?: string;
}

function extractRetryAfterSeconds(details: unknown): number | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }
  const raw = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.ceil(raw);
  }
  return undefined;
}

function extractFieldErrors(details: unknown): FieldValidationSummary[] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return [];
  }
  const rawFieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!rawFieldErrors || typeof rawFieldErrors !== 'object' || Array.isArray(rawFieldErrors)) {
    return [];
  }
  const summaries: FieldValidationSummary[] = [];
  for (const [field, val] of Object.entries(rawFieldErrors as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      const messages = val.filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
      if (messages.length > 0) {
        summaries.push({ field, messages });
      }
    }
  }
  return summaries;
}

export function sanitizeDiagnosticPath(path: string): string {
  try {
    const pathname = new URL(path, 'https://diagnostic.invalid').pathname;
    return pathname.replace(/^(\/(?:q|qr))\/.*$/i, '$1/[redacted]');
  } catch {
    return '/';
  }
}

export function safeErrorClass(error: unknown): string {
  if (error instanceof ZodError) return 'ZodError';
  if (error instanceof ApiClientError) return 'ApiClientError';
  if (error instanceof Error) {
    return ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'AbortError'].includes(error.name) ? error.name : 'Error';
  }
  return 'Unknown';
}

/**
 * Normalizes any thrown client/API/Router error into structured, user-safe Vietnamese
 * explanations with store overrides applied and internal stack traces stripped.
 */
export function normalizeClientError(
  error: unknown,
  options: NormalizeErrorOptions = {},
): NormalizedClientError {
  const audience = options.audience ?? 'staff';
  const overrides = options.customMessages ?? readMergedCachedMessages();

  let statusCode: number | null = null;
  let errorCode: string | undefined;
  let rawMessage = '';
  let details: unknown;
  let requestId: string | undefined;
  let isChunkError = false;
  let isRuntimeError = false;

  if (options.statusKeyOverride) {
    const preset = HTTP_ERROR_CATALOG_BY_KEY.get(options.statusKeyOverride);
    if (preset) {
      statusCode = preset.httpStatus;
      isChunkError = preset.key === 'CHUNK_LOAD_ERROR';
      isRuntimeError = preset.key === 'RUNTIME_CRASH';
      if (preset.key === 'NETWORK_ERROR') errorCode = 'NETWORK_ERROR';
    }
  }

  if (error instanceof ZodError) {
    errorCode = 'DATA_VALIDATION_ERROR';
  } else if (error instanceof ApiClientError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    rawMessage = error.message;
    details = error.details;
    requestId = error.requestId;
  } else if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    rawMessage =
      typeof error.data === 'string'
        ? error.data
        : typeof error.statusText === 'string'
          ? error.statusText
          : '';
  } else if (error instanceof Error) {
    rawMessage = error.message || '';
    if (isChunkLoadErrorMessage(rawMessage)) {
      isChunkError = true;
    } else if (error.name === 'AbortError') {
      statusCode = 408;
      errorCode = 'NETWORK_ERROR';
    } else if (/Failed to fetch|NetworkError|Load failed/i.test(rawMessage)) {
      statusCode = 0;
      errorCode = 'NETWORK_ERROR';
    } else if (!options.statusKeyOverride) {
      isRuntimeError = true;
    }
  }

  const catalogEntry = options.statusKeyOverride
    ? (HTTP_ERROR_CATALOG_BY_KEY.get(options.statusKeyOverride) ??
      resolveHttpErrorDefinition({ statusCode, code: errorCode, isChunkError, isRuntimeError }))
    : resolveHttpErrorDefinition({ statusCode, code: errorCode, isChunkError, isRuntimeError });

  const retryAfterSeconds = extractRetryAfterSeconds(details);
  const vars = retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined;
  const resolvedHttpOverride = resolveStoreMessage(overrides, catalogEntry.messageKey, vars);
  const domainErrorMsg =
    errorCode && errorCode !== 'NETWORK_ERROR'
      ? resolveStoreMessage(overrides, `error.${errorCode}`, vars)
      : null;

  const isGuest = audience === 'guest';
  const defaultTitle = isGuest ? catalogEntry.guestTitle : catalogEntry.defaultTitle;
  const defaultDesc = isGuest ? catalogEntry.guestDescription : catalogEntry.defaultDescription;
  const recoveryHint =
    options.recoveryHintOverride ??
    (isGuest ? catalogEntry.guestRecoveryHint : catalogEntry.recoveryHint);

  let title = options.titleOverride ?? defaultTitle;
  let reason = options.reasonOverride ?? defaultDesc;

  if (!options.titleOverride && !isGuest && resolvedHttpOverride.isOverridden) {
    title = resolvedHttpOverride.title;
  }
  if (!options.reasonOverride && !isGuest && resolvedHttpOverride.isOverridden && resolvedHttpOverride.description) {
    reason = resolvedHttpOverride.description;
  }

  // Prefer contextual server reason when it is already a clean Vietnamese message (not a raw proxy/internal string)
  const trimmedServerMsg = rawMessage.trim();
  const isUsefulServerMessage =
    trimmedServerMsg.length > 0 &&
    !/^(Internal server error|Not Found|Forbidden|Unauthorized|Error)$/i.test(trimmedServerMsg) &&
    !isChunkLoadErrorMessage(trimmedServerMsg) &&
    !(isRuntimeError && trimmedServerMsg.length > 220);

  if (!options.reasonOverride && !isGuest && domainErrorMsg?.isOverridden) {
    title = domainErrorMsg.title;
    if (domainErrorMsg.description) {
      reason = domainErrorMsg.description;
    }
  } else if (
    !options.reasonOverride &&
    !(!isGuest && resolvedHttpOverride.isOverridden && resolvedHttpOverride.description) &&
    isUsefulServerMessage &&
    !isRuntimeError &&
    !(isGuest && (statusCode === 500 || errorCode === 'DATA_VALIDATION_ERROR'))
  ) {
    reason = trimmedServerMsg;
  }

  const resolvedReason =
    catalogEntry.key === '429' && retryAfterSeconds !== undefined && !options.reasonOverride
      ? `${reason} (Vui lòng chờ khoảng ${retryAfterSeconds} giây trước khi thử lại.)`
      : reason;

  return {
    key: catalogEntry.key,
    statusCode,
    statusLabel: catalogEntry.statusLabel,
    errorCode,
    severity: catalogEntry.severity,
    title,
    reason: resolvedReason,
    recoveryHint,
    retryAfterSeconds,
    fieldErrors: extractFieldErrors(details),
    requestId,
    path: options.path ? sanitizeDiagnosticPath(options.path) : undefined,
  };
}

/**
 * Resolves the primary permitted route for a logged-in employee so "Quay lại hệ thống"
 * always leads to a valid screen rather than hitting another 403.
 */
export function resolveStaffHomeDestination(
  user: AuthenticatedUser | null | undefined,
  settings?: Pick<PublicStoreSettingsResponse, 'navLabels'> | null,
): { path: string; label: string } {
  if (!user) {
    return { path: '/login', label: 'Đăng nhập hệ thống' };
  }

  const canViewRoute = (mod?: keyof AuthenticatedUser['permissions']) =>
    user.isSuperAdmin || !mod || Boolean(user.permissions?.[mod]?.view);

  const posRoute = APP_NAVIGATION_ROUTES.find((r) => r.path === '/pos');
  if (posRoute && canViewRoute(posRoute.module)) {
    return {
      path: posRoute.path,
      label: resolveNavLabel(posRoute.path, posRoute.shortLabel ?? posRoute.label, settings?.navLabels),
    };
  }

  const firstPermitted = APP_NAVIGATION_ROUTES.find(
    (r) => r.path !== '/profile' && canViewRoute(r.module),
  );
  if (firstPermitted) {
    return {
      path: firstPermitted.path,
      label: resolveNavLabel(
        firstPermitted.path,
        firstPermitted.shortLabel ?? firstPermitted.label,
        settings?.navLabels,
      ),
    };
  }

  return { path: '/profile', label: 'Hồ sơ Cá nhân' };
}
