import type { PosDraftResponse, Product } from '@fnb/shared';
import * as React from 'react';

import { useAppMessages } from '@/hooks/use-app-messages';
import {
  buildInitialSelectedByGroup,
  computeOrderModifiersPayload,
} from '@/lib/modifier-selection';
import {
  useCreatePosDraftMutation,
  useDeletePosDraftMutation,
  useSubmitPosDraftMutation,
  useUpdatePosDraftMutation,
} from '../api/pos.api';
import type { LiveInvoiceDraftTarget } from '../components/live-invoice-panel';
import type { PosMenuSelectedItem } from '../components/pos-menu-types';
import { findMatchingDraftIndex } from '../utils/order-item-merge';
import type { NotifyErrFn, PosWorkspaceViewEvent } from './use-pos-workspace-types';

interface UsePosDraftsParams {
  products: Product[];
  productsLoaded: boolean;
  canCreateOrder: boolean;
  canUpdateOrder: boolean;
  canDeleteDrafts: boolean;
  emitViewChange: (event: PosWorkspaceViewEvent) => void;
  onDraftResetOrderSelection: () => void;
  onDraftSubmittedOrder: (orderId: number) => void;
  onClearEditingTarget: () => void;
  notifyErr: NotifyErrFn;
}

/** Manages local POS draft cart items, parked draft persistence, hydration, and idempotent submit. */
export function usePosDrafts({
  products,
  productsLoaded,
  canCreateOrder,
  canUpdateOrder,
  canDeleteDrafts,
  emitViewChange,
  onDraftResetOrderSelection,
  onDraftSubmittedOrder,
  onClearEditingTarget,
  notifyErr,
}: UsePosDraftsParams) {
  const { notify } = useAppMessages();

  const draftOperationRef = React.useRef(false);
  const [draftOperationPending, setDraftOperationPending] = React.useState(false);

  const [draftTarget, setDraftTarget] = React.useState<LiveInvoiceDraftTarget | null>(null);
  const [draftItems, setDraftItems] = React.useState<PosMenuSelectedItem[]>([]);
  const [activeSavedDraft, setActiveSavedDraft] = React.useState<{ id: string; revision: number } | null>(null);
  const [pendingDraftHydration, setPendingDraftHydration] = React.useState<PosDraftResponse | null>(null);
  const [draftIsDirty, setDraftIsDirty] = React.useState(false);
  const draftSubmitKeyRef = React.useRef<string | null>(null);

  const createDraftMutation = useCreatePosDraftMutation();
  const updateDraftMutation = useUpdatePosDraftMutation();
  const deleteDraftMutation = useDeletePosDraftMutation();
  const submitDraftMutation = useSubmitPosDraftMutation();

  const toSelectedDraftItems = React.useCallback((draft: PosDraftResponse): PosMenuSelectedItem[] => draft.items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) {
      return {
        productId: item.productId,
        name: `Món #${item.productId}`,
        quantity: item.quantity,
        unitPrice: 0,
        modifiers: item.modifiers,
        modifierLabels: [],
        ...(item.itemNote ? { itemNote: item.itemNote } : {}),
        ...(item.isTakeaway ? { isTakeaway: true } : {}),
      };
    }
    const selectedByGroup = buildInitialSelectedByGroup(product);
    const manualSubstituteByModifierId: Record<number, number> = {};
    for (const selection of item.modifiers) {
      const selected = selectedByGroup[selection.groupId] ?? [];
      if (selection.action === 'REMOVED_DEFAULT' || selection.action === 'SUBSTITUTED') {
        selectedByGroup[selection.groupId] = selected.filter((id) => id !== selection.modifierId);
      }
      if (selection.action === 'SUBSTITUTED') {
        if (selection.substituteModifierId !== undefined) {
          selectedByGroup[selection.groupId] = [...new Set([...(selectedByGroup[selection.groupId] ?? []), selection.substituteModifierId])];
          manualSubstituteByModifierId[selection.modifierId] = selection.substituteModifierId;
        }
      } else {
        selectedByGroup[selection.groupId] = [...new Set([...(selectedByGroup[selection.groupId] ?? []), selection.modifierId])];
      }
    }
    const computed = computeOrderModifiersPayload(product, selectedByGroup, manualSubstituteByModifierId);
    return {
      productId: item.productId,
      name: product.name,
      quantity: item.quantity,
      unitPrice: product.price + computed.extraPrice,
      modifiers: item.modifiers,
      modifierLabels: computed.modifierLabels,
      ...(item.itemNote ? { itemNote: item.itemNote } : {}),
      ...(item.isTakeaway ? { isTakeaway: true } : {}),
    };
  }), [products]);

  React.useEffect(() => {
    if (!pendingDraftHydration) return;
    if (activeSavedDraft?.id !== pendingDraftHydration.id) {
      setPendingDraftHydration(null);
      return;
    }
    if (!productsLoaded) return;
    const hydratedItems = toSelectedDraftItems(pendingDraftHydration);
    setDraftItems((current) => current.map((item) => {
      const hydrated = hydratedItems.find((candidate) => candidate.productId === item.productId
        && JSON.stringify(candidate.modifiers) === JSON.stringify(item.modifiers));
      return hydrated
        ? { ...item, name: hydrated.name, unitPrice: hydrated.unitPrice, modifierLabels: hydrated.modifierLabels }
        : item;
    }));
    setPendingDraftHydration(null);
  }, [activeSavedDraft?.id, pendingDraftHydration, productsLoaded, toSelectedDraftItems]);

  const clearDraft = () => {
    setActiveSavedDraft(null);
    setPendingDraftHydration(null);
    setDraftTarget(null);
    setDraftItems([]);
    setDraftIsDirty(false);
    onClearEditingTarget();
    draftSubmitKeyRef.current = null;
  };

  const detachDraftOnOpenOrder = () => {
    setDraftTarget(null);
    setDraftItems([]);
    setActiveSavedDraft(null);
    setDraftIsDirty(false);
    draftSubmitKeyRef.current = null;
  };

  const resetDineInDraftForTable = (table: { id: number; name: string }) => {
    setActiveSavedDraft(null);
    draftSubmitKeyRef.current = null;
    setDraftIsDirty(false);
    setDraftTarget({ orderType: 'DINE_IN', tableId: table.id, tableName: table.name });
    setDraftItems([]);
  };

  const assignTargetDraft = (target: LiveInvoiceDraftTarget) => {
    if (!draftTarget) {
      setDraftItems([]);
      setActiveSavedDraft(null);
      draftSubmitKeyRef.current = null;
      setDraftIsDirty(false);
    } else {
      setDraftIsDirty(true);
    }
    setDraftTarget(target);
  };

  const addDraftMenuItem = (item: PosMenuSelectedItem) => {
    if (!draftTarget) {
      setDraftTarget({ orderType: null });
    }
    setDraftIsDirty(true);
    setDraftItems((prev) => {
      const existingIndex = findMatchingDraftIndex(prev, item);
      if (existingIndex < 0) return [...prev, item];
      return prev.map((entry, index) =>
        index === existingIndex ? { ...entry, quantity: entry.quantity + item.quantity } : entry,
      );
    });
  };

  const replaceDraftItem = (idx: number, updatedItem: PosMenuSelectedItem) => {
    setDraftIsDirty(true);
    setDraftItems((prev) =>
      prev.map((entry, entryIdx) =>
        entryIdx === idx
          ? {
              ...updatedItem,
              ...(entry.isTakeaway ? { isTakeaway: true } : {}),
            }
          : entry,
      ),
    );
  };

  const handleUpdateDraftQty = (index: number, delta: number) => {
    if (draftOperationRef.current) return;
    setDraftIsDirty(true);
    setDraftItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
      ),
    );
  };

  const handleRemoveDraftItem = (index: number) => {
    if (draftOperationRef.current) return;
    setDraftIsDirty(true);
    setDraftItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const draftStateForSave = () => ({
    orderType: draftTarget?.orderType ?? null,
    tableId: draftTarget?.orderType === 'DINE_IN' ? draftTarget.tableId : null,
    items: draftItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      modifiers: item.modifiers,
      ...(item.itemNote ? { itemNote: item.itemNote } : {}),
      ...(item.isTakeaway ? { isTakeaway: true } : {}),
    })),
    note: null,
  });

  const persistCurrentDraft = async () => {
    const state = draftStateForSave();
    if (activeSavedDraft) {
      const updated = await updateDraftMutation.mutateAsync({
        id: activeSavedDraft.id,
        input: { ...state, expectedRevision: activeSavedDraft.revision },
      });
      setActiveSavedDraft({ id: updated.id, revision: updated.revision });
      setDraftIsDirty(false);
      return updated;
    }
    const created = await createDraftMutation.mutateAsync(state);
    setActiveSavedDraft({ id: created.id, revision: created.revision });
    setDraftIsDirty(false);
    return created;
  };

  const handleSaveDraft = async () => {
    const canSave = activeSavedDraft ? canUpdateOrder : canCreateOrder;
    if (!canSave || draftItems.length === 0 || draftOperationRef.current) return;
    draftOperationRef.current = true;
    setDraftOperationPending(true);
    try {
      const saved = draftIsDirty || !activeSavedDraft ? await persistCurrentDraft() : null;
      notify('pos.draft.saved', { variant: 'success', vars: { itemCount: saved?.items.length ?? draftItems.length } });
      onDraftResetOrderSelection();
      setDraftTarget(null);
      setDraftItems([]);
      setActiveSavedDraft(null);
      setDraftIsDirty(false);
      draftSubmitKeyRef.current = null;
      emitViewChange('draft-parked');
    } catch (err) {
      notifyErr('pos.draft.saveError', err);
    } finally {
      draftOperationRef.current = false;
      setDraftOperationPending(false);
    }
  };

  const handleResumeDraft = (draft: PosDraftResponse) => {
    if (draftOperationRef.current) return;
    if (draftTarget && draftIsDirty && draftItems.length > 0) {
      notify('pos.draft.saveBeforeSwitch', { variant: 'warning' });
      return;
    }
    onDraftResetOrderSelection();
    setDraftTarget(draft.orderType === 'DINE_IN'
      ? { orderType: 'DINE_IN', tableId: draft.tableId, tableName: draft.tableName ?? undefined }
      : draft.orderType === 'TAKEAWAY'
        ? { orderType: 'TAKEAWAY' }
        : { orderType: null });
    setDraftItems(toSelectedDraftItems(draft));
    setActiveSavedDraft({ id: draft.id, revision: draft.revision });
    setPendingDraftHydration(productsLoaded ? null : draft);
    setDraftIsDirty(false);
    draftSubmitKeyRef.current = null;
    emitViewChange('draft-started');
  };

  const handleDeleteDraft = async (draft: { id: string; revision: number }): Promise<boolean> => {
    if (!canDeleteDrafts || draftOperationRef.current) return false;
    draftOperationRef.current = true;
    setDraftOperationPending(true);
    try {
      await deleteDraftMutation.mutateAsync({ id: draft.id, revision: draft.revision });
      if (activeSavedDraft?.id === draft.id) {
        clearDraft();
        emitViewChange('draft-discarded');
      }
      notify('pos.draft.deleted', { variant: 'success' });
      return true;
    } catch (err) {
      notifyErr('pos.draft.deleteError', err);
      return false;
    } finally {
      draftOperationRef.current = false;
      setDraftOperationPending(false);
    }
  };

  const handleDiscardDraft = async (): Promise<boolean> => {
    if (draftOperationRef.current || !draftTarget) return false;
    if (activeSavedDraft) return handleDeleteDraft(activeSavedDraft);
    clearDraft();
    emitViewChange('draft-discarded');
    return true;
  };

  const handleSubmitDraftOrder = async () => {
    if (!canCreateOrder || !draftTarget || draftItems.length === 0 || draftOperationRef.current) return;
    if (draftTarget.orderType === null || (draftTarget.orderType === 'DINE_IN' && draftTarget.tableId === null)) {
      notify('pos.draft.assignTarget', { variant: 'warning' });
      return;
    }

    draftOperationRef.current = true;
    setDraftOperationPending(true);
    try {
      let saved = activeSavedDraft;
      if (!saved || draftIsDirty) {
        const persisted = await persistCurrentDraft();
        saved = { id: persisted.id, revision: persisted.revision };
      }
      const idempotencyKey = draftSubmitKeyRef.current ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
      draftSubmitKeyRef.current = idempotencyKey;
      const response = await submitDraftMutation.mutateAsync({
        id: saved.id,
        input: { expectedRevision: saved.revision, idempotencyKey },
      });
      const created = response.order;

      setDraftTarget(null);
      setDraftItems([]);
      setActiveSavedDraft(null);
      setDraftIsDirty(false);
      draftSubmitKeyRef.current = null;
      onDraftSubmittedOrder(created.orderId);
      emitViewChange('draft-submitted');

      notify('pos.order.createSuccess', {
        variant: 'success',
        vars: { targetLabel: `${created.tableLabel ?? created.orderCode}` },
      });
    } catch (err) {
      notifyErr('pos.order.createError', err);
    } finally {
      draftOperationRef.current = false;
      setDraftOperationPending(false);
    }
  };

  return {
    draftOperationRef,
    draftOperationPending,
    draftTarget,
    setDraftTarget,
    draftItems,
    setDraftItems,
    activeSavedDraft,
    draftIsDirty,
    setDraftIsDirty,
    isSubmittingDraft:
      submitDraftMutation.isPending || createDraftMutation.isPending || updateDraftMutation.isPending,
    isSavingDraft: createDraftMutation.isPending || updateDraftMutation.isPending,
    clearDraft,
    detachDraftOnOpenOrder,
    resetDineInDraftForTable,
    assignTargetDraft,
    addDraftMenuItem,
    replaceDraftItem,
    handleUpdateDraftQty,
    handleRemoveDraftItem,
    handleSaveDraft,
    handleResumeDraft,
    handleDeleteDraft,
    handleDiscardDraft,
    handleSubmitDraftOrder,
  };
}
