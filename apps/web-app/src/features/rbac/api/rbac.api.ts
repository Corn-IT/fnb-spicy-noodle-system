import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateUserInput,
  type ResetUserPasswordInput,
  type UpdatePermissionsInput,
  type UpdateUserAccountInput,
  type UserAdminRecord,
  type UserListResponse,
  type UserSessionHistoryResponse,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export type UserRecord = UserAdminRecord;
export type { UserListResponse };

export interface RbacEmployeeCandidate {
  id: number;
  fullName: string;
  isDeleted: boolean;
  position: { id: number; name: string } | null;
  user: { id: number; username: string; isActive: boolean } | null;
}

export function useAvailableEmployeesForAccountQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['rbac-employee-candidates'],
    enabled,
    queryFn: async () => {
      const response = await apiClient.get<{ items: RbacEmployeeCandidate[] }>('/api/v1/employees', {
        params: { page: 1, limit: 100, includeDeleted: false },
      });
      return response.items.filter((emp) => !emp.isDeleted && emp.user === null);
    },
  });
}

export function useUsersQuery(params?: { page?: number; limit?: number; keyword?: string }) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () =>
      apiClient.get<UserListResponse>('/api/v1/users', {
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
          keyword: params?.keyword || undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserInput) =>
      apiClient.post<UserRecord>('/api/v1/users', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['rbac-employee-candidates'] });
    },
  });
}

export function useUpdateUserAccountMutation(userId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateUserAccountInput) =>
      apiClient.put<UserRecord>(`/api/v1/users/${userId}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['rbac-employee-candidates'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['user-session-history'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'RBAC'] });
    },
  });
}

export function useUpdatePermissionsMutation(userId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdatePermissionsInput) =>
      apiClient.put<UserRecord>(`/api/v1/users/${userId}/permissions`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['rbac-employee-candidates'] });
      void queryClient.invalidateQueries({ queryKey: ['user-session-history'] });
    },
  });
}

export function useResetUserPasswordMutation(userId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ResetUserPasswordInput) =>
      apiClient.post<{ id: number; username: string; passwordReset: boolean }>(
        `/api/v1/users/${userId}/reset-password`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'RBAC'] });
      void queryClient.invalidateQueries({ queryKey: ['user-session-history', userId] });
    },
  });
}

export function useUserSessionHistoryQuery(
  userId: number | null,
  enabled: boolean,
  limit = 5,
) {
  return useQuery({
    queryKey: ['user-session-history', userId, limit],
    enabled: Boolean(userId) && enabled,
    queryFn: () =>
      apiClient.get<UserSessionHistoryResponse>(
        `/api/v1/users/${userId}/session-history`,
        { params: { limit } },
      ),
  });
}

export function useRevokeUserSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.post<{ revoked: boolean; userId: number }>(
        `/api/v1/users/${userId}/revoke-session`,
      ),
    onSuccess: (_result, userId) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'RBAC'] });
      void queryClient.invalidateQueries({ queryKey: ['user-session-history', userId] });
    },
  });
}
