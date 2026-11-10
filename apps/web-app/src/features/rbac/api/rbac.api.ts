import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateUserInput,
  type UpdatePermissionsInput,
  type UserAdminRecord,
  type UserListResponse,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export type UserRecord = UserAdminRecord;
export type { UserListResponse };

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
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserInput) =>
      apiClient.post<UserRecord>('/api/v1/users', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
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
    },
  });
}
