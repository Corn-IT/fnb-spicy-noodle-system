import {
  resolveStoreMessage,
  StoreMessagesResponseSchema,
  type MessageVars,
  type ResolvedStoreMessage,
  type StoreMessagesMap,
  type StoreMessagesResponse,
} from '@fnb/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { toast, type ToastVariant } from '@/components/ui/toast';

export type { ToastVariant };
import {
  readCachedStoreSettings,
  StoreSettingsContext,
} from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import {
  readCachedStoreMessages,
  readMergedCachedMessages,
  resolveCachedAppMessage,
  resolveErrorFromStoreCache,
  STORE_MESSAGES_CACHE_KEY,
  writeCachedStoreMessages,
} from '@/utils/store-messages-cache';

export {
  readCachedStoreMessages,
  readMergedCachedMessages,
  resolveCachedAppMessage,
  resolveErrorFromStoreCache,
  STORE_MESSAGES_CACHE_KEY,
  writeCachedStoreMessages,
};

export const STORE_MESSAGES_QUERY_KEY = ['store-messages'] as const;

export async function fetchStoreMessages(): Promise<StoreMessagesResponse> {
  const payload = await apiClient.get<StoreMessagesResponse>('/api/v1/store-messages');
  const parsed = StoreMessagesResponseSchema.parse(payload);
  writeCachedStoreMessages(parsed.messages);
  return parsed;
}

export function useStoreMessagesQuery() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery({
    queryKey: STORE_MESSAGES_QUERY_KEY,
    queryFn: fetchStoreMessages,
    enabled: Boolean(accessToken),
    initialData: (): StoreMessagesResponse => ({
      messages: readCachedStoreMessages(),
      updatedAt: null,
    }),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    retry: 1,
  });
}

export function previewResolvedToast(
  resolved: ResolvedStoreMessage,
  variant: ToastVariant = 'info',
): string {
  return toast({
    variant,
    title: resolved.title,
    ...(resolved.description !== undefined ? { description: resolved.description } : {}),
  });
}

export interface NotifyOptions {
  variant?: ToastVariant;
  vars?: MessageVars;
  duration?: number;
}

export interface UseAppMessagesResult {
  messages: StoreMessagesMap;
  resolveMessage: (key: string, vars?: MessageVars) => ResolvedStoreMessage;
  resolveErrorMessage: (key: string, err: unknown, fallbackReason?: string) => ResolvedStoreMessage;
  notify: (key: string, options?: NotifyOptions) => string;
}

export function useAppMessages(): UseAppMessagesResult {
  const storeCtx = React.useContext(StoreSettingsContext);
  const accessToken = useAuthStore((state) => state.accessToken);

  const mergedMessages = React.useMemo<StoreMessagesMap>(() => {
    const qrMessages = storeCtx?.settings?.qrMessages ?? readCachedStoreSettings()?.qrMessages ?? {};
    const staffMessages = storeCtx?.messages ?? (accessToken ? readCachedStoreMessages() : readCachedStoreMessages());
    return { ...qrMessages, ...staffMessages };
  }, [storeCtx?.settings?.qrMessages, storeCtx?.messages, accessToken]);

  const resolveMessage = React.useCallback(
    (key: string, vars?: MessageVars) => resolveStoreMessage(mergedMessages, key, vars),
    [mergedMessages],
  );

  const resolveErrorMessage = React.useCallback(
    (key: string, err: unknown, fallbackReason = 'Vui lòng thử lại') => {
      const reason = err instanceof Error && err.message ? err.message : fallbackReason;
      return resolveStoreMessage(mergedMessages, key, { reason });
    },
    [mergedMessages],
  );

  const notify = React.useCallback(
    (key: string, options?: NotifyOptions) => {
      const resolved = resolveStoreMessage(mergedMessages, key, options?.vars);
      return toast({
        variant: options?.variant,
        title: resolved.title,
        ...(resolved.description !== undefined ? { description: resolved.description } : {}),
        ...(options?.duration !== undefined ? { duration: options.duration } : {}),
      });
    },
    [mergedMessages],
  );

  return React.useMemo(
    () => ({
      messages: mergedMessages,
      resolveMessage,
      resolveErrorMessage,
      notify,
    }),
    [mergedMessages, resolveMessage, resolveErrorMessage, notify],
  );
}
