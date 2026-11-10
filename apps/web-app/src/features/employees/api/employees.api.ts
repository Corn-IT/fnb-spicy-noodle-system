import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateEmployeeInput,
  type EmployeeFilterQuery,
  type MdmCategory,
  type MdmItem,
  type UpdateEmployeeInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export interface EmployeeRecord {
  id: number;
  fullName: string;
  shortName: string;
  dob: string | null;
  phone: string | null;
  address: string | null;
  citizenId: string | null;
  citizenIdIssuedPlace: string | null;
  positionId: number;
  specialtyId: number;
  startDate: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  avatarUrl: string | null;
  attachmentUrls: string[];
  note: string | null;
  isDeleted: boolean;
  createdAt: string;
  position: { id: number; name: string } | null;
  specialty: { id: number; name: string } | null;
  user: { id: number; username: string; isActive: boolean } | null;
}

export interface EmployeeListResponse {
  page: number;
  limit: number;
  total: number;
  items: EmployeeRecord[];
}

export function useEmployeesQuery(filter: EmployeeFilterQuery) {
  return useQuery({
    queryKey: ['employees', filter],
    queryFn: () =>
      apiClient.get<EmployeeListResponse>('/api/v1/employees', {
        params: {
          page: filter.page,
          limit: filter.limit,
          keyword: filter.keyword || undefined,
          positionId: filter.positionId,
          specialtyId: filter.specialtyId,
          includeDeleted: filter.includeDeleted || undefined,
          inactiveOnly: filter.inactiveOnly || undefined,
        },
      }),
  });
}

export function useEmployeeDetailQuery(id: number | null) {
  return useQuery({
    queryKey: ['employees', id],
    queryFn: () => apiClient.get<EmployeeRecord>(`/api/v1/employees/${id}`),
    enabled: id !== null,
  });
}

export function useMdmLookupForEmployeesQuery(category: MdmCategory) {
  return useQuery({
    queryKey: ['mdm', 'lookup', category],
    queryFn: () =>
      apiClient.get<MdmItem[]>('/api/v1/mdm/lookup', {
        params: { category, page: 1, limit: 100 },
      }),
  });
}

export function useCreateEmployeeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateEmployeeInput) =>
      apiClient.post<EmployeeRecord>('/api/v1/employees', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useUpdateEmployeeMutation(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateEmployeeInput) =>
      apiClient.put<EmployeeRecord>(`/api/v1/employees/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useDeleteEmployeeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<EmployeeRecord>(`/api/v1/employees/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useSetEmployeeActiveMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeId, isActive }: { employeeId: number; isActive: boolean }) =>
      apiClient.patch<{ id: number; isDeleted: boolean; isActive: boolean }>(
        `/api/v1/employees/${employeeId}/status`,
        { isActive },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}
