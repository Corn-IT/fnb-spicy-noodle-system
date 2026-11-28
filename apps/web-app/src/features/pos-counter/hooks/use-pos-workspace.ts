import {
  formatTakeawayLabel,
  type PosOrderSummary,
  type PosTableGridResponse,
} from '@fnb/shared';
import * as React from 'react';

import { useAppMessages } from '@/hooks/use-app-messages';
import { evaluateOrderPendingAlert } from '@/lib/qr-pending-reminder';
import { getActiveQrReminderConfig } from '@/lib/qr-voice-announcer';
import { useAuthStore } from '@/stores/auth.store';
import {
  usePosDraftsQuery,
  usePosOrderDetailQuery,
  usePosProductsQuery,
  usePosTableGridQuery,
} from '../api/pos.api';
import { usePosBillingActions } from './use-pos-billing-actions';
import { usePosCashierSocket } from './use-pos-cashier-socket';
import { usePosDrafts } from './use-pos-drafts';
import { usePosOrderItems } from './use-pos-order-items';
import type {
  PosEditingItemTarget,
  PosWorkspaceViewEvent,
  UsePosWorkspaceOptions,
} from './use-pos-workspace-types';

export type { PosEditingItemTarget, PosWorkspaceViewEvent, UsePosWorkspaceOptions };

/**
 * Toàn bộ state, truy vấn, mutation và handler nghiệp vụ của quầy POS.
 * Không chứa giao diện: `PosUnifiedPage` (chuột) và `PosTouchPage` (cảm ứng) cùng dùng hook này
 * nên mọi luồng tách bếp / tạm tính / thanh toán / đổi bàn chạy đúng một đường code.
 */
export function usePosWorkspace({ onViewChange }: UsePosWorkspaceOptions = {}) {
  const onViewChangeRef = React.useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const emitViewChange = (event: PosWorkspaceViewEvent) => {
    onViewChangeRef.current?.(event);
  };

  // Đơn do chính máy này đang đóng (thanh toán, thanh toán tách trọn đơn, huỷ, gộp sang bàn khác):
  // giao diện dùng để phân biệt với đơn bị đóng ở máy khác. Đánh dấu TRƯỚC khi gọi API và GỠ ngay nếu lỗi.
  const locallyClosedOrderIdsRef = React.useRef<Set<number>>(new Set());
  const markClosingLocally = (orderId: number) => {
    locallyClosedOrderIdsRef.current.add(orderId);
  };
  const unmarkClosingLocally = (orderId: number) => {
    locallyClosedOrderIdsRef.current.delete(orderId);
  };
  const isOrderClosedLocally = (orderId: number) => locallyClosedOrderIdsRef.current.has(orderId);

  const { notify, resolveErrorMessage } = useAppMessages();
  const notifyErr = (key: string, err: unknown) => {
    const resolved = resolveErrorMessage(key, err);
    notify(key, {
      variant: 'destructive',
      vars: { reason: resolved.description ?? 'Vui lòng thử lại' },
    });
  };

  const tableGridQuery = usePosTableGridQuery();
  const gridData = tableGridQuery.data;
  const productsQuery = usePosProductsQuery();
  const products = productsQuery.data ?? [];
  const productsById = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const draftsQuery = usePosDraftsQuery();
  const parkedDrafts = draftsQuery.data ?? [];

  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);
  const [addonIsTakeaway, setAddonIsTakeaway] = React.useState(false);

  const { addonBadgesByOrderId, clearAddonBadge } = usePosCashierSocket({
    onQrAutoCancelled: (payload) => {
      if (payload.kind === 'NEW' && payload.orderId === selectedOrderId) {
        setSelectedOrderId(null);
      }
    },
  });

  const currentUser = useAuthStore((s) => s.user);
  const canCreateOrder = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.create);
  const canUpdateOrder = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.update);
  const canDeleteOrder = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.delete);
  const canSplitKitchen = Boolean(
    currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.splitKitchen,
  );
  const canTableAction = Boolean(
    currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.tableAction,
  );
  const canCheckout = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.checkout);
  const canDeleteDrafts = Boolean(
    currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.deleteDrafts,
  );

  const { data: currentOrder } = usePosOrderDetailQuery(selectedOrderId);

  const clearEditingTargetRef = React.useRef<() => void>(() => undefined);

  const drafts = usePosDrafts({
    products,
    productsLoaded: productsQuery.isSuccess,
    canCreateOrder,
    canUpdateOrder,
    canDeleteDrafts,
    emitViewChange,
    onDraftResetOrderSelection: () => setSelectedOrderId(null),
    onDraftSubmittedOrder: (orderId) => setSelectedOrderId(orderId),
    onClearEditingTarget: () => clearEditingTargetRef.current(),
    notifyErr,
  });

  const orderItems = usePosOrderItems({
    selectedOrderId,
    currentOrder,
    productsById,
    draftItems: drafts.draftItems,
    addonIsTakeaway,
    canCreateOrder,
    canUpdateOrder,
    isDraftOperationBusy: () => drafts.draftOperationRef.current,
    onAddDraftMenuItem: drafts.addDraftMenuItem,
    onReplaceDraftItem: drafts.replaceDraftItem,
    notifyErr,
  });

  clearEditingTargetRef.current = () => orderItems.setEditingItemTarget(null);

  const { setEditingItemTarget } = orderItems;
  React.useEffect(() => {
    setAddonIsTakeaway(false);
    setEditingItemTarget(null);
  }, [selectedOrderId, setEditingItemTarget]);

  const billing = usePosBillingActions({
    selectedOrderId,
    currentOrder,
    gridData,
    cashierName: currentUser?.fullName ?? currentUser?.username,
    setSelectedOrderId,
    clearAddonBadge,
    markClosingLocally,
    unmarkClosingLocally,
    notifyErr,
  });

  const selectedTableRow = React.useMemo(
    () =>
      selectedOrderId !== null
        ? gridData?.tables.find((table) => table.activeOrderId === selectedOrderId) ?? null
        : null,
    [gridData?.tables, selectedOrderId],
  );
  const selectedTakeawayRow = React.useMemo(
    () =>
      selectedOrderId !== null
        ? gridData?.takeaways.find((order) => order.orderId === selectedOrderId) ?? null
        : null,
    [gridData?.takeaways, selectedOrderId],
  );
  const selectedActivePendingOrder =
    selectedTableRow?.activeOrder ?? selectedTakeawayRow ?? null;

  const [alertClockMs, setAlertClockMs] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    setAlertClockMs(Date.now());
    if (!selectedActivePendingOrder?.pendingQrSince && currentOrder?.status !== 'PENDING') {
      return;
    }
    const timer = window.setInterval(() => {
      setAlertClockMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [selectedActivePendingOrder?.pendingQrSince, currentOrder?.status]);

  const selectedPendingAlert = React.useMemo(() => {
    if (!selectedActivePendingOrder) return null;
    const statusHint = selectedTableRow
      ? selectedTableRow.status
      : selectedTakeawayRow?.status === 'PENDING'
        ? 'PENDING'
        : 'OCCUPIED';
    return evaluateOrderPendingAlert(
      selectedActivePendingOrder,
      statusHint,
      alertClockMs,
      getActiveQrReminderConfig(),
    );
  }, [selectedActivePendingOrder, selectedTableRow, selectedTakeawayRow?.status, alertClockMs]);

  const handleSelectTable = (table: PosTableGridResponse['tables'][number]) => {
    if (drafts.draftOperationRef.current) return;
    if (drafts.draftTarget && drafts.draftIsDirty && drafts.draftItems.length > 0 && table.status !== 'AVAILABLE') {
      notify('pos.draft.saveBeforeSwitch', { variant: 'warning' });
      return;
    }
    if (table.status === 'AVAILABLE' || !table.activeOrderId) {
      if (!canCreateOrder) {
        setSelectedOrderId(null);
        drafts.setDraftTarget(null);
        drafts.setDraftItems([]);
        return;
      }
      if (drafts.draftTarget && table.status === 'AVAILABLE') {
        drafts.setDraftTarget({ orderType: 'DINE_IN', tableId: table.id, tableName: table.name });
        drafts.setDraftIsDirty(true);
        emitViewChange('draft-started');
        return;
      }
      setSelectedOrderId(null);
      drafts.resetDineInDraftForTable(table);
      emitViewChange('draft-started');
      return;
    }

    drafts.setDraftTarget(null);
    drafts.setDraftItems([]);
    setSelectedOrderId(table.activeOrderId);
    clearAddonBadge(table.activeOrderId);
    emitViewChange('order-opened');
  };

  const handleSelectTakeawayOrder = (order: PosOrderSummary) => {
    if (drafts.draftOperationRef.current) return;
    if (drafts.draftTarget && drafts.draftIsDirty && drafts.draftItems.length > 0) {
      notify('pos.draft.saveBeforeSwitch', { variant: 'warning' });
      return;
    }
    drafts.detachDraftOnOpenOrder();
    setSelectedOrderId(order.orderId);
    clearAddonBadge(order.orderId);
    emitViewChange('order-opened');
  };

  const handleSelectOrderById = (orderId: number): boolean => {
    if (!gridData || !Number.isInteger(orderId) || orderId <= 0) return false;
    const matchedTable = gridData.tables.find((table) => table.activeOrderId === orderId);
    if (matchedTable) {
      handleSelectTable(matchedTable);
      return true;
    }
    const matchedTakeaway = gridData.takeaways.find((order) => order.orderId === orderId);
    if (matchedTakeaway) {
      handleSelectTakeawayOrder(matchedTakeaway);
      return true;
    }
    return false;
  };

  const handleStartNewTakeaway = () => {
    if (drafts.draftOperationRef.current || !canCreateOrder) return;
    setSelectedOrderId(null);
    drafts.assignTargetDraft({ orderType: 'TAKEAWAY' });
    emitViewChange('draft-started');
  };

  const handleStartUntargetedDraft = () => {
    if (drafts.draftOperationRef.current || !canCreateOrder) return;
    setSelectedOrderId(null);
    drafts.assignTargetDraft({ orderType: null });
    emitViewChange('draft-started');
  };

  const activeBadgeCount = currentOrder
    ? currentOrder.items.filter((i) => i.kitchenStatus !== 'CANCELLED').length
    : drafts.draftItems.length;
  const activeTotal = currentOrder
    ? currentOrder.totalAmount
    : drafts.draftItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const activeLabel = currentOrder
    ? (currentOrder.tableLabel ??
      (currentOrder.orderType === 'TAKEAWAY'
        ? formatTakeawayLabel(currentOrder.takeawayNumber, currentOrder.takeawayLabelFormat)
        : `Bàn #${currentOrder.tableId}`))
    : drafts.draftTarget?.orderType === 'TAKEAWAY'
      ? 'Đơn Mang về mới'
      : drafts.draftTarget?.orderType === 'DINE_IN'
        ? drafts.draftTarget.tableName ?? 'Chưa gán bàn'
        : drafts.draftTarget?.orderType === null
          ? 'Giỏ chưa gán bàn'
          : 'Đang chọn bàn';

  const clearSelection = () => {
    if (drafts.draftOperationRef.current) return;
    setSelectedOrderId(null);
    drafts.clearDraft();
  };

  return {
    tableGridQuery,
    gridData,
    productsQuery,
    products,
    draftsQuery,
    parkedDrafts,
    activeDraftId: drafts.activeSavedDraft?.id ?? null,
    currentOrder: currentOrder ?? null,
    currentUser,
    selectedOrderId,
    draftTarget: drafts.draftTarget,
    draftItems: drafts.draftItems,
    draftIsDirty: drafts.draftIsDirty,
    addonIsTakeaway,
    setAddonIsTakeaway,
    addonBadgesByOrderId,
    selectedPendingAlert,
    permissions: {
      canCreateOrder,
      canUpdateOrder,
      canDeleteOrder,
      canDeleteDrafts,
      canDiscardDraft: !drafts.activeSavedDraft || canDeleteDrafts,
      canSaveDraft: drafts.activeSavedDraft ? canUpdateOrder : canCreateOrder,
      canSplitKitchen,
      canTableAction,
      canCheckout,
    },
    summary: {
      activeBadgeCount,
      activeTotal,
      activeLabel,
    },
    pending: {
      isDraftPending: drafts.draftOperationPending,
      isApprovingQr: orderItems.isApprovingQr,
      isSubmittingDraft: drafts.isSubmittingDraft,
      isSavingDraft: drafts.isSavingDraft,
      isPatchingItems: orderItems.isPatchingItems,
      ...billing.pending,
    },
    dialogs: {
      ...billing.dialogs,
      editingItemTarget: orderItems.editingItemTarget,
      setEditingItemTarget: orderItems.setEditingItemTarget,
    },
    isOrderClosedLocally,
    actions: {
      clearSelection,
      selectTable: handleSelectTable,
      selectTakeawayOrder: handleSelectTakeawayOrder,
      selectOrderById: handleSelectOrderById,
      startNewTakeaway: handleStartNewTakeaway,
      startUntargetedDraft: handleStartUntargetedDraft,
      chooseDraftTarget: () => emitViewChange('draft-target-picker'),
      addItemFromMenu: orderItems.addItemFromMenu,
      updateDraftQty: drafts.handleUpdateDraftQty,
      removeDraftItem: drafts.handleRemoveDraftItem,
      openEditDraftItem: orderItems.openEditDraftItem,
      saveDraft: drafts.handleSaveDraft,
      resumeDraft: drafts.handleResumeDraft,
      deleteDraft: drafts.handleDeleteDraft,
      discardDraft: drafts.handleDiscardDraft,
      submitDraftOrder: drafts.handleSubmitDraftOrder,
      approveQrOrder: orderItems.approveQrOrder,
      updateOrderItemQuantity: orderItems.updateOrderItemQuantity,
      toggleOrderItemTakeaway: orderItems.toggleOrderItemTakeaway,
      removeOrCancelOrderItem: orderItems.removeOrCancelOrderItem,
      openEditOrderItem: orderItems.openEditOrderItem,
      confirmEditItem: orderItems.confirmEditItem,
      ...billing.actions,
    },
  };
}

export type PosWorkspace = ReturnType<typeof usePosWorkspace>;
