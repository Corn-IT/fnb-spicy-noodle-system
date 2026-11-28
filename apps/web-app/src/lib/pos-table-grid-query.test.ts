import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { fetchPosTableGrid, POS_TABLE_GRID_QUERY_KEY } from '@/lib/pos-table-grid-query';

const grid = { tables: [{ id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null, activeOrder: null }], takeaways: [] };

describe('shared POS grid failure recovery', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['network', 'schema', '503'])('retains cached cards on %s failure and recovers on the next fetch', async (failure) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const get = vi.spyOn(apiClient, 'get');
    if (failure === 'schema') get.mockResolvedValueOnce({ tables: null });
    else get.mockRejectedValueOnce(new Error(failure));
    get.mockResolvedValueOnce(grid);
    client.setQueryData(POS_TABLE_GRID_QUERY_KEY, grid);
    await expect(client.fetchQuery({ queryKey: POS_TABLE_GRID_QUERY_KEY, queryFn: fetchPosTableGrid })).rejects.toBeDefined();
    expect(client.getQueryData(POS_TABLE_GRID_QUERY_KEY)).toEqual(grid);
    await expect(client.fetchQuery({ queryKey: POS_TABLE_GRID_QUERY_KEY, queryFn: fetchPosTableGrid })).resolves.toEqual(grid);
    client.clear();
  });
});
