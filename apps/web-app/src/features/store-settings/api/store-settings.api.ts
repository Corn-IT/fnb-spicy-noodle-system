import {
  PublicStoreSettingsResponseSchema,
  sanitizeStoreMessages,
  type PublicStoreSettingsResponse,
  type StoreAssetKind,
  type UpdateStoreSettingsInput,
  type UploadStoreAssetInput,
} from '@fnb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  STORE_MESSAGES_QUERY_KEY,
  useAppMessages,
  writeCachedStoreMessages,
} from '@/hooks/use-app-messages';
import {
  STORE_SETTINGS_QUERY_KEY,
  writeCachedStoreSettings,
} from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export const ADMIN_STORE_SETTINGS_QUERY_KEY = ['admin-store-settings'] as const;

function syncStoreSettingsCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: PublicStoreSettingsResponse,
): void {
  const parsed = PublicStoreSettingsResponseSchema.parse(updated);
  queryClient.setQueryData(STORE_SETTINGS_QUERY_KEY, parsed);
  queryClient.setQueryData(ADMIN_STORE_SETTINGS_QUERY_KEY, parsed);
  writeCachedStoreSettings(parsed);
  void queryClient.invalidateQueries({ queryKey: STORE_SETTINGS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: STORE_MESSAGES_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'SETTINGS'] });
}

export async function fetchAdminStoreSettings(): Promise<PublicStoreSettingsResponse> {
  const payload = await apiClient.get<PublicStoreSettingsResponse>('/api/v1/settings');
  const parsed = PublicStoreSettingsResponseSchema.parse(payload);
  writeCachedStoreSettings(parsed);
  return parsed;
}

export function useAdminStoreSettingsQuery() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery({
    queryKey: ADMIN_STORE_SETTINGS_QUERY_KEY,
    queryFn: fetchAdminStoreSettings,
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useUpdateStoreSettingsMutation() {
  const queryClient = useQueryClient();
  const { notify } = useAppMessages();

  return useMutation({
    mutationFn: (payload: UpdateStoreSettingsInput) =>
      apiClient.put<PublicStoreSettingsResponse>('/api/v1/settings', payload),
    onSuccess: (updated, variables) => {
      if (variables.messages !== undefined) {
        const cleanMessages = sanitizeStoreMessages(variables.messages);
        writeCachedStoreMessages(cleanMessages);
        queryClient.setQueryData(STORE_MESSAGES_QUERY_KEY, {
          messages: cleanMessages,
          updatedAt: updated.updatedAt,
        });
      }
      syncStoreSettingsCaches(queryClient, updated);
      notify('settings.saveSuccess', { variant: 'success' });
    },
  });
}

export function useUploadStoreAssetMutation() {
  const queryClient = useQueryClient();
  const { notify } = useAppMessages();

  return useMutation({
    mutationFn: ({ kind, payload }: { kind: StoreAssetKind; payload: UploadStoreAssetInput }) =>
      apiClient.put<PublicStoreSettingsResponse>(`/api/v1/settings/assets/${kind}`, payload),
    onSuccess: (updated) => {
      syncStoreSettingsCaches(queryClient, updated);
      notify('settings.asset.uploadSuccess', { variant: 'success' });
    },
  });
}

export function useDeleteStoreAssetMutation() {
  const queryClient = useQueryClient();
  const { notify } = useAppMessages();

  return useMutation({
    mutationFn: (kind: StoreAssetKind) =>
      apiClient.delete<PublicStoreSettingsResponse>(`/api/v1/settings/assets/${kind}`),
    onSuccess: (updated) => {
      syncStoreSettingsCaches(queryClient, updated);
      notify('settings.asset.deleteSuccess', { variant: 'success' });
    },
  });
}
