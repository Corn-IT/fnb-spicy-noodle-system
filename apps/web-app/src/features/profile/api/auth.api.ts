import {
  AuthResponseSchema,
  LoginRequestSchema,
  type AuthResponse,
  type LoginRequest,
} from '@fnb/shared';
import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

export type LoginApiResult = AuthResponse;

export async function loginWithCredentials(input: LoginRequest): Promise<LoginApiResult> {
  const validated = LoginRequestSchema.parse(input);
  const response = await apiClient.post<AuthResponse>('/api/v1/auth/login', validated, {
    skipAuthRefresh: true,
  });

  AuthResponseSchema.parse(response);

  useAuthStore.getState().setAuth({
    accessToken: response.accessToken,
    user: {
      id: response.user.id,
      employeeId: response.user.employeeId,
      username: response.user.username,
      fullName: response.user.employee.fullName,
      avatarUrl: response.user.employee.avatarUrl,
      isSuperAdmin: response.user.isSuperAdmin,
      permissions: response.user.permissions,
    },
  });

  useUiPreferencesStore.getState().hydrateFromServer(response.user.uiPreferences);

  return response;
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: loginWithCredentials,
  });
}
