import { type PosDraftResponse, UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import { PosDraftsPanel } from '../components/pos-drafts-panel';
import { usePosWorkspace } from '../hooks/use-pos-workspace';

vi.mock('../hooks/use-pos-cashier-socket', () => ({
  usePosCashierSocket: () => ({ addonBadgesByOrderId: {}, clearAddonBadge: vi.fn() }),
}));

const draft: PosDraftResponse = {
  id: 'saved-1', orderType: 'DINE_IN', tableId: 7, tableName: 'Bàn khu vực có tên rất dài',
  revision: 4, note: null, items: [{ productId: 11, quantity: 2, modifiers: [] }],
  createdAt: '2026-11-27T01:00:00.000Z', updatedAt: '2026-11-27T01:00:00.000Z',
};
const item = { productId: 11, name: 'Mì bò', unitPrice: 45000, quantity: 1, modifiers: [], modifierLabels: [] };
function wrapper({ children }: { children: ReactNode }) {
  return <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ThermalPrintProvider>{children}</ThermalPrintProvider>
  </QueryProvider>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  useAuthStore.getState().setAuth({ accessToken: 'token', user: {
    id: 2, employeeId: 2, username: 'cashier', fullName: 'Thu ngân', isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({ pos: { view: true, create: true, update: true, deleteDrafts: true } }),
  } });
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url.endsWith('/pos/tables')) return { tables: [], takeaways: [] };
    if (url.endsWith('/pos/drafts')) return { drafts: [] };
    if (url.endsWith('/menu/products')) return [];
    if (url.endsWith('/store-messages')) return { messages: {}, updatedAt: '2026-11-27T01:00:00.000Z' };
    return {};
  });
});

describe('POS draft discard guards', () => {
  it('clears every unsaved line and target locally and returns to the board', async () => {
    const onViewChange = vi.fn();
    const deletion = vi.spyOn(apiClient, 'delete');
    const post = vi.spyOn(apiClient, 'post');
    const { result } = renderHook(() => usePosWorkspace({ onViewChange }), { wrapper });
    await act(async () => { await result.current.actions.addItemFromMenu(item); });
    await act(async () => { await result.current.actions.addItemFromMenu({ ...item, productId: 12, name: 'Trà' }); });
    expect(result.current.draftItems).toHaveLength(2);
    await act(async () => { expect(await result.current.actions.discardDraft()).toBe(true); });
    expect(result.current.draftItems).toEqual([]);
    expect(result.current.draftTarget).toBeNull();
    expect(onViewChange).toHaveBeenLastCalledWith('draft-discarded');
    expect(deletion).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks stale and repeated discard, submit and edit callbacks while saving is pending', async () => {
    let release!: (value: PosDraftResponse) => void;
    const post = vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const deletion = vi.spyOn(apiClient, 'delete');
    const { result } = renderHook(() => usePosWorkspace(), { wrapper });
    await act(async () => { await result.current.actions.addItemFromMenu(item); });
    const actions = result.current.actions;
    let saving!: Promise<void>;
    await act(async () => {
      saving = actions.saveDraft();
      expect(await actions.discardDraft()).toBe(false);
      await actions.submitDraftOrder();
      actions.removeDraftItem(0);
      actions.resumeDraft(draft);
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(result.current.draftItems).toHaveLength(1);
    expect(result.current.activeDraftId).toBeNull();
    expect(deletion).not.toHaveBeenCalled();
    await act(async () => { release(draft); await saving; });
  });

  it('sends one delete at the resumed revision and retains local edits until success', async () => {
    let release!: (value: { id: string; deleted: true }) => void;
    const deletion = vi.spyOn(apiClient, 'delete').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { result } = renderHook(() => usePosWorkspace(), { wrapper });
    act(() => result.current.actions.resumeDraft(draft));
    act(() => result.current.actions.updateDraftQty(0, 1));
    const actions = result.current.actions;
    let deleting!: Promise<boolean>;
    await act(async () => {
      deleting = actions.discardDraft();
      expect(await actions.discardDraft()).toBe(false);
      await actions.saveDraft();
      actions.startNewTakeaway();
    });
    await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
    expect(deletion).toHaveBeenCalledWith('/api/v1/pos/drafts/saved-1?revision=4');
    expect(result.current.draftItems[0]?.quantity).toBe(3);
    expect(result.current.draftTarget).toMatchObject({ tableId: 7 });
    await act(async () => { release({ id: 'saved-1', deleted: true }); expect(await deleting).toBe(true); });
    expect(result.current.draftItems).toEqual([]);
    expect(result.current.draftTarget).toBeNull();
    expect(result.current.activeDraftId).toBeNull();
  });

  it('marks the selected card and keeps resume and delete as independent accessible buttons', () => {
    const onResume = vi.fn();
    const onDelete = vi.fn();
    render(<PosDraftsPanel drafts={[draft]} activeDraftId={draft.id} canDelete onResume={onResume} onDelete={onDelete} />);
    const resume = screen.getByTestId('pos-resume-draft-saved-1');
    expect(resume).toHaveAttribute('aria-pressed', 'true');
    const remove = screen.getByRole('button', { name: `Xoá giỏ tạm ${draft.tableName}` });
    expect(resume.contains(remove)).toBe(false);
    fireEvent.click(remove);
    expect(onDelete).toHaveBeenCalledWith(draft);
    expect(onResume).not.toHaveBeenCalled();
  });
});
