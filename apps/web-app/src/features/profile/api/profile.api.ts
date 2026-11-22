import {
  ChangePasswordSchema,
  type AuthResponse,
  type ChangePasswordInput,
  type ChangePasswordResponse,
  type ProfileResponse,
  type UpdateProfileInput,
  UpdateProfileSchema,
  type UpdateUiPreferencesInput,
  UpdateUiPreferencesSchema,
  type UiPreferences,
  type UploadAvatarInput,
  UploadAvatarSchema,
} from '@fnb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type JoinedUserProfile = ProfileResponse;
export type ChangePasswordResult = { message: string } | ChangePasswordResponse;

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

export async function uploadMyAvatar(
  input: UploadAvatarInput,
): Promise<JoinedUserProfile> {
  const validated = UploadAvatarSchema.parse(input);
  return apiClient.put<JoinedUserProfile>('/api/v1/profile/avatar', validated);
}

export async function deleteMyAvatar(): Promise<JoinedUserProfile> {
  return apiClient.delete<JoinedUserProfile>('/api/v1/profile/avatar');
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

function syncUpdatedProfileToCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: JoinedUserProfile,
) {
  queryClient.setQueryData(PROFILE_QUERY_KEY, updated);
  useAuthStore.getState().updateUser({
    fullName: updated.employee.fullName,
    avatarUrl: updated.employee.avatarUrl,
  });
  void queryClient.invalidateQueries({ queryKey: ['employees'] });
  void queryClient.invalidateQueries({ queryKey: ['users'] });
  void queryClient.invalidateQueries({ queryKey: ['schedules'] });
  void queryClient.invalidateQueries({ queryKey: ['payroll'] });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updated) => {
      syncUpdatedProfileToCaches(queryClient, updated);
    },
  });
}

export function useUploadAvatarMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadMyAvatar,
    onSuccess: (updated) => {
      syncUpdatedProfileToCaches(queryClient, updated);
    },
  });
}

export function useDeleteAvatarMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMyAvatar,
    onSuccess: (updated) => {
      syncUpdatedProfileToCaches(queryClient, updated);
    },
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => {
      const validated = ChangePasswordSchema.parse(input);
      return apiClient.patch<ChangePasswordResult>('/api/v1/profile/password', validated);
    },
    onSuccess: (result) => {
      if (result && 'accessToken' in result && result.accessToken && 'user' in result && result.user) {
        const nextUser: AuthResponse['user'] = result.user;
        useAuthStore.getState().setAuth({
          accessToken: result.accessToken,
          user: {
            id: nextUser.id,
            employeeId: nextUser.employeeId,
            username: nextUser.username,
            fullName: nextUser.employee.fullName,
            avatarUrl: nextUser.employee.avatarUrl,
            isSuperAdmin: nextUser.isSuperAdmin,
            permissions: nextUser.permissions,
          },
        });
      }
    },
  });
}
