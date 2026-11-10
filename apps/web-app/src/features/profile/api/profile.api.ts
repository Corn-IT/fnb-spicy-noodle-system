import {
  ChangePasswordSchema,
  type ChangePasswordInput,
  type ProfileResponse,
  type UpdateProfileInput,
  UpdateProfileSchema,
  type UpdateUiPreferencesInput,
  UpdateUiPreferencesSchema,
  type UiPreferences,
} from '@fnb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type JoinedUserProfile = ProfileResponse;

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

export async function getMyProfile(): Promise<JoinedUserProfile> {
  return apiClient.get<JoinedUserProfile>('/api/v1/profile');
}

export async function updateMyProfile(
  input: UpdateProfileInput,
): Promise<JoinedUserProfile> {
  const validated = UpdateProfileSchema.parse(input);
  return apiClient.put<JoinedUserProfile>('/api/v1/profile', validated);
}

export async function patchMyUiPreferences(
  input: UpdateUiPreferencesInput,
): Promise<UiPreferences> {
  const validated = UpdateUiPreferencesSchema.parse(input);
  return apiClient.patch<UiPreferences>('/api/v1/profile/ui-prefs', validated);
}

export function useMyProfileQuery() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getMyProfile,
    enabled: Boolean(accessToken),
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updated) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated);
      useAuthStore.getState().updateUser({
        fullName: updated.employee.fullName,
        avatarUrl: updated.employee.avatarUrl,
      });
    },
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => {
      const validated = ChangePasswordSchema.parse(input);
      return apiClient.patch<{ message: string }>('/api/v1/profile/password', validated);
    },
  });
}
