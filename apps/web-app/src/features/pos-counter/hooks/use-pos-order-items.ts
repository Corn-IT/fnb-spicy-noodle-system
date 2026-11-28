import {
  ErrorCodes,
  type OrderDetailResponse,
  type Product,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useThermalPrinter } from '@/components/print-slips';
import { useAppMessages } from '@/hooks/use-app-messages';
import { ApiClientError } from '@/lib/api-client';
import {
  hydrateModifierSelectionFromExisting,
  inferModifierSelectionsFromLabels,
} from '@/lib/modifier-selection';
import {
  posQueryKeys,
  useApproveQrOrderMutation,
  usePatchOrderItemsMutation,
} from '../api/pos.api';
import type { PosMenuSelectedItem } from '../components/pos-menu-types';
import type { NotifyErrFn, PosEditingItemTarget } from './use-pos-workspace-types';

interface UsePosOrderItemsParams {
  selectedOrderId: number | null;
  currentOrder: OrderDetailResponse | undefined;
  productsById: Map<number, Product>;
  draftItems: PosMenuSelectedItem[];
  addonIsTakeaway: boolean;
  canCreateOrder: boolean;
  canUpdateOrder: boolean;
  isDraftOperationBusy: () => boolean;
  onAddDraftMenuItem: (item: PosMenuSelectedItem) => void;
  onReplaceDraftItem: (idx: number, item: PosMenuSelectedItem) => void;
  notifyErr: NotifyErrFn;
}

/** Manages queued live order item mutations, QR approval, and draft/order item modifier editing. */
export function usePosOrderItems({
  selectedOrderId,
  currentOrder,
  productsById,
  draftItems,
  addonIsTakeaway,
  canCreateOrder,
  canUpdateOrder,
  isDraftOperationBusy,
  onAddDraftMenuItem,
  onReplaceDraftItem,
  notifyErr,
}: UsePosOrderItemsParams) {
  const queryClient = useQueryClient();
  const thermalPrinter = useThermalPrinter();
  const { notify } = useAppMessages();

  const [editingItemTarget, setEditingItemTarget] = React.useState<PosEditingItemTarget | null>(null);

  const approveQrMutation = useApproveQrOrderMutation();
  const patchItemsMutation = usePatchOrderItemsMutation();

  // Mọi thay đổi món trên hoá đơn đang mở (chạm thêm món, nút −/+) đi qua một hàng đợi: lần sau chờ
  // lần trước xong (kể cả tải lại đơn) mới chạy. Thêm món luôn gửi "addItems" để server tự cộng dồn
  // vào dòng trùng trong giao dịch có khoá dòng; −/+ áp dụng mức thay đổi lên số lượng mới nhất.
  const orderMutationQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const enqueueOrderMutation = (task: () => Promise<void>) => {
    const run = orderMutationQueueRef.current.then(task);
    orderMutationQueueRef.current = run.catch(() => undefined);
    return run;
  };

  const addItemToLiveOrder = async (orderId: number, item: PosMenuSelectedItem) => {
    try {
      const canMarkTakeaway =
        currentOrder?.orderType === 'DINE_IN' &&
        (currentOrder.items?.length ?? 0) > 0 &&
        Boolean(item.isTakeaway ?? addonIsTakeaway);
      await patchItemsMutation.mutateAsync({
        orderId,
        input: {
          addItems: [
            {
              productId: item.productId,
              quantity: item.quantity,
              modifiers: item.modifiers,
              ...(item.itemNote ? { itemNote: item.itemNote } : {}),
              ...(canMarkTakeaway ? { isTakeaway: true } : {}),
            },
          ],
        },
      });
      notify('pos.order.addItemSuccess', {
        variant: 'success',
        vars: { quantity: item.quantity, itemName: item.name },
        duration: 3000,
      });
    } catch (err) {
      notifyErr('pos.order.addItemError', err);
    }
  };

  const handleAddItemFromMenu = async (item: PosMenuSelectedItem) => {
    if (isDraftOperationBusy()) return;
    if (selectedOrderId && currentOrder) {
      if (!canUpdateOrder) return;
      const orderId = selectedOrderId;
      await enqueueOrderMutation(() => addItemToLiveOrder(orderId, item));
      return;
    }

    if (!canCreateOrder) return;
    onAddDraftMenuItem(item);
  };

  const handleApproveQrOrder = async () => {
    if (!selectedOrderId) return;
    try {
      await approveQrMutation.mutateAsync({
        orderId: selectedOrderId,
        input: { approved: true },
      });
      notify('pos.order.approveQrSuccess', { variant: 'success' });
    } catch (err) {
      notifyErr('pos.order.approveQrError', err);
    }
  };

  const handleUpdateOrderItemQuantity = async (orderItemId: number, newQuantity: number) => {
    if (!selectedOrderId) return;
    const orderId = selectedOrderId;
    const shownQuantity = currentOrder?.items.find((i) => i.id === orderItemId)?.quantity;
    const delta = shownQuantity === undefined ? null : newQuantity - shownQuantity;
    await enqueueOrderMutation(async () => {
      const latest = queryClient
        .getQueryData<OrderDetailResponse>(posQueryKeys.orderDetail(orderId))
        ?.items.find((i) => i.id === orderItemId);
      const quantity =
        delta === null || !latest ? newQuantity : Math.max(1, latest.quantity + delta);
      if (latest && quantity === latest.quantity) return;
      try {
        await patchItemsMutation.mutateAsync({
          orderId,
          input: { updates: [{ orderItemId, quantity }] },
        });
      } catch (err) {
        notifyErr('pos.order.addItemError', err);
      }
    });
  };

  const handleToggleOrderItemTakeaway = async (orderItemId: number, nextIsTakeaway: boolean) => {
    if (!selectedOrderId) return;
    const orderId = selectedOrderId;
    await enqueueOrderMutation(async () => {
      try {
        await patchItemsMutation.mutateAsync({
          orderId,
          input: { updates: [{ orderItemId, isTakeaway: nextIsTakeaway }] },
        });
      } catch (err) {
        notifyErr('pos.order.addItemError', err);
      }
    });
  };

  const handleRemoveOrCancelOrderItem = async (orderItemId: number) => {
    if (!selectedOrderId) return;
    const result = await patchItemsMutation.mutateAsync({
      orderId: selectedOrderId,
      input: {
        removeItemIds: [orderItemId],
      },
    });

    if (result.requireCancellationSlip && result.kitchenCancellationSlips.length > 0) {
      thermalPrinter.printKitchenCancelItem({
        orderCode: currentOrder?.orderCode,
        slips: result.kitchenCancellationSlips,
      });
      notify('pos.order.cancelItemSlipSuccess', {
        variant: 'warning',
        vars: { stationCount: result.kitchenCancellationSlips.length },
      });
    }
  };

  const handleOpenEditDraftItem = (index: number) => {
    if (!canCreateOrder || isDraftOperationBusy()) return;
    const targetItem = draftItems[index];
    if (!targetItem) return;
    const product = productsById.get(targetItem.productId);
    if (!product) {
      notify('pos.order.editItemError', {
        variant: 'destructive',
        vars: { reason: 'Món này hiện không còn trong thực đơn.' },
      });
      return;
    }
    const { selectedByGroup, manualSubstituteByModifierId } = hydrateModifierSelectionFromExisting(
      product,
      targetItem.modifiers,
    );
    setEditingItemTarget({
      kind: 'draft',
      draftIndex: index,
      product,
      editInstanceKey: `draft-${index}-${targetItem.productId}-${targetItem.quantity}`,
      initialValue: {
        quantity: targetItem.quantity,
        selectedByGroup,
        manualSubstituteByModifierId,
        itemNote: targetItem.itemNote ?? '',
      },
    });
  };

  const handleOpenEditOrderItem = (orderItemId: number) => {
    if (!canUpdateOrder || !currentOrder || !selectedOrderId) return;
    if (currentOrder.status !== 'PENDING' && currentOrder.status !== 'SERVING') return;
    const targetItem = currentOrder.items.find((item) => item.id === orderItemId);
    if (!targetItem || targetItem.kitchenStatus !== 'NEW') return;
    const product = productsById.get(targetItem.productId);
    if (!product) {
      notify('pos.order.editItemError', {
        variant: 'destructive',
        vars: { reason: 'Món này hiện không còn khả dụng để chỉnh sửa tuỳ chọn.' },
      });
      return;
    }
    const selections =
      targetItem.modifierSelections && targetItem.modifierSelections.length > 0
        ? targetItem.modifierSelections
        : inferModifierSelectionsFromLabels(product, targetItem.modifiers);
    const { selectedByGroup, manualSubstituteByModifierId } = hydrateModifierSelectionFromExisting(
      product,
      selections,
    );
    setEditingItemTarget({
      kind: 'order',
      orderItemId,
      product,
      editInstanceKey: `order-${orderItemId}-${targetItem.productId}-${targetItem.quantity}`,
      initialValue: {
        quantity: targetItem.quantity,
        selectedByGroup,
        manualSubstituteByModifierId,
        itemNote: targetItem.itemNote ?? '',
      },
    });
  };

  const handleConfirmEditItem = async (updatedItem: PosMenuSelectedItem) => {
    const target = editingItemTarget;
    if (!target) return;

    if (target.kind === 'draft' && target.draftIndex !== undefined) {
      onReplaceDraftItem(target.draftIndex, updatedItem);
      setEditingItemTarget(null);
      return;
    }

    if (target.kind === 'order' && target.orderItemId !== undefined) {
      if (!selectedOrderId || !canUpdateOrder) return;
      const orderId = selectedOrderId;
      const orderItemId = target.orderItemId;
      await enqueueOrderMutation(async () => {
        try {
          await patchItemsMutation.mutateAsync({
            orderId,
            input: {
              updates: [
                {
                  orderItemId,
                  expectedKitchenStatus: 'NEW',
                  quantity: updatedItem.quantity,
                  modifiers: updatedItem.modifiers,
                  itemNote: updatedItem.itemNote ?? null,
                },
              ],
            },
          });
          setEditingItemTarget(null);
          notify('pos.order.editItemSuccess', {
            variant: 'success',
            vars: { quantity: updatedItem.quantity, itemName: updatedItem.name },
            duration: 2500,
          });
        } catch (err) {
          const errorCode =
            err instanceof ApiClientError
              ? err.code
              : typeof err === 'object' && err !== null && 'code' in err
                ? String((err as { code?: unknown }).code)
                : undefined;
          const statusCode =
            err instanceof ApiClientError
              ? err.statusCode
              : typeof err === 'object' && err !== null && 'statusCode' in err
                ? Number((err as { statusCode?: unknown }).statusCode)
                : undefined;
          if (errorCode === ErrorCodes.POS_ITEM_ALREADY_PRINTED || statusCode === 409) {
            void queryClient.invalidateQueries({ queryKey: posQueryKeys.orderDetail(orderId) });
            void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
            setEditingItemTarget(null);
            notifyErr('pos.order.editItemError', err);
            return;
          }
          notifyErr('pos.order.editItemError', err);
          throw err;
        }
      });
    }
  };

  return {
    editingItemTarget,
    setEditingItemTarget,
    isApprovingQr: approveQrMutation.isPending,
    isPatchingItems: patchItemsMutation.isPending,
    addItemFromMenu: handleAddItemFromMenu,
    approveQrOrder: handleApproveQrOrder,
    updateOrderItemQuantity: handleUpdateOrderItemQuantity,
    toggleOrderItemTakeaway: handleToggleOrderItemTakeaway,
    removeOrCancelOrderItem: handleRemoveOrCancelOrderItem,
    openEditDraftItem: handleOpenEditDraftItem,
    openEditOrderItem: handleOpenEditOrderItem,
    confirmEditItem: handleConfirmEditItem,
  };
}
