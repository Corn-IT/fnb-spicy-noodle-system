import { PosTableGridResponseSchema, type PosTableGridResponse } from '@fnb/shared';
import { apiClient } from '@/lib/api-client';

export const POS_TABLE_GRID_QUERY_KEY = ['pos', 'tables'] as const;

export async function fetchPosTableGrid(): Promise<PosTableGridResponse> {
  const raw = await apiClient.get<unknown>('/api/v1/pos/tables');
  return PosTableGridResponseSchema.parse(raw);
}
