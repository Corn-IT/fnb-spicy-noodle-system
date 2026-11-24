import {
  type OrderDetailResponse,
  TableActionType,
  type ApplyPosDiscountRequest,
  type CheckoutOrderRequest,
  type PosOrderSummary,
  type PosTableGridResponse,
  type SplitCheckoutOrderRequest,
  type TableActionRequest,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useThermalPrinter } from '@/components/print-slips';
import { useAppMessages } from '@/hooks/use-app-messages';
import { evaluateOrderPendingAlert } from '@/lib/qr-pending-reminder';
import { getActiveQrReminderConfig } from '@/lib/qr-voice-announcer';
import { useAuthStore } from '@/stores/auth.store';
import {
  useApproveQrOrderMutation,
  useCancelPosOrderMutation,
  useCheckoutOrderMutation,
  useCreatePosOrderMutation,
  usePatchOrderItemsMutation,
  usePosOrderDetailQuery,
  usePosProductsQuery,
  usePosTableGridQuery,
  useProvisionalBillMutation,
  useReprintKitchenMutation,
  useSplitCheckoutOrderMutation,
  useSplitKitchenMutation,
  useApplyPosDiscountMutation,
  useSplitProvisionalBillMutation,
  useTableActionMutation,
  useRemovePosDiscountMutation,
  posQueryKeys,
} from '../api/pos.api';
import type { LiveInvoiceDraftTarget } from '../components/live-invoice-panel';
import type { PosMenuSelectedItem } from '../components/pos-menu-types';
import type {
  SplitOrderDialogMode,
  SplitSelectedItemSummary,
} from '../components/split-order-items-dialog';
import { findMatchingDraftIndex, findMergeableOrderItem } from '../utils/order-item-merge';
import { usePosCashierSocket } from './use-pos-cashier-socket';

/**
 * Sự kiện điều hướng mà mỗi giao diện POS (chuột / cảm ứng) tự quyết định cách hiển thị:
 * - `draft-started`: vừa chọn bàn trống hoặc bắt đầu đơn mang về mới → cần mở thực đơn.
 * - `order-opened`: vừa chọn bàn / đơn mang về đang có hoá đơn.
 * - `draft-submitted`: vừa tạo đơn từ giỏ nháp thành công (đơn mới đã được chọn).
 */
export type PosWorkspaceViewEvent = 'draft-started' | 'order-opened' | 'draft-submitted';

export interface UsePosWorkspaceOptions {
  onViewChange?: (event: PosWorkspaceViewEvent) => void;
}

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
  // Đơn do chính máy này đóng (thanh toán / huỷ / đổi-gộp bàn): giao diện dùng để phân biệt với
  // trường hợp đơn bị đóng ở máy khác.
  const locallyClosedOrderIdsRef = React.useRef<Set<number>>(new Set());
  const markClosingLocally = (orderId: number) => {
    locallyClosedOrderIdsRef.current.add(orderId);
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
  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);
  const { addonBadgesByOrderId, clearAddonBadge } = usePosCashierSocket({
    onQrAutoCancelled: (payload) => {
      if (payload.kind === 'NEW' && payload.orderId === selectedOrderId) {
        setSelectedOrderId(null);
      }
    },
  });
  const thermalPrinter = useThermalPrinter();
  const currentUser = useAuthStore((s) => s.user);
  const canCreateOrder = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.create);
  const canUpdateOrder = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.update);
  const canSplitKitchen = Boolean(
    currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.splitKitchen,
  );
  const canTableAction = Boolean(
    currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.tableAction,
  );
  const canCheckout = Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.pos?.checkout);

  const [draftTarget, setDraftTarget] = React.useState<LiveInvoiceDraftTarget | null>(null);
  const [draftItems, setDraftItems] = React.useState<PosMenuSelectedItem[]>([]);

  const [tableActionOpen, setTableActionOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = React.useState(false);
  const [splitDialogMode, setSplitDialogMode] = React.useState<SplitOrderDialogMode | null>(null);
  const [lastSplitPaymentAccountId, setLastSplitPaymentAccountId] = React.useState<number | null>(
    null,
  );

  const { data: currentOrder } = usePosOrderDetailQuery(selectedOrderId);

  const createOrderMutation = useCreatePosOrderMutation();
  const approveQrMutation = useApproveQrOrderMutation();
  const patchItemsMutation = usePatchOrderItemsMutation();
  const splitKitchenMutation = useSplitKitchenMutation();
  const reprintKitchenMutation = useReprintKitchenMutation();
  const provisionalBillMutation = useProvisionalBillMutation();
  const splitProvisionalBillMutation = useSplitProvisionalBillMutation();
  const checkoutMutation = useCheckoutOrderMutation();
  const splitCheckoutMutation = useSplitCheckoutOrderMutation();
  const tableActionMutation = useTableActionMutation();
  const cancelOrderMutation = useCancelPosOrderMutation();
  const applyDiscountMutation = useApplyPosDiscountMutation();
  const removeDiscountMutation = useRemovePosDiscountMutation();

  React.useEffect(() => {
    setLastSplitPaymentAccountId(null);
  }, [selectedOrderId]);

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
    if (table.status === 'AVAILABLE' || !table.activeOrderId) {
      if (!canCreateOrder) {
        setSelectedOrderId(null);
        setDraftTarget(null);
        setDraftItems([]);
        return;
      }
      // Source B: Click empty table -> prepare DINE_IN draft and switch to Menu tab
      setSelectedOrderId(null);
      setDraftTarget({
        orderType: 'DINE_IN',
        tableId: table.id,
        tableName: table.name,
      });
      setDraftItems([]);
      emitViewChange('draft-started');
      return;
    }

    setDraftTarget(null);
    setDraftItems([]);
    setSelectedOrderId(table.activeOrderId);
    clearAddonBadge(table.activeOrderId);
    emitViewChange('order-opened');
  };

  const handleSelectTakeawayOrder = (order: PosOrderSummary) => {
    setDraftTarget(null);
    setDraftItems([]);
    setSelectedOrderId(order.orderId);
    clearAddonBadge(order.orderId);
    emitViewChange('order-opened');
  };

  const handleStartNewTakeaway = () => {
    if (!canCreateOrder) return;
    // Source C: Click [+ TẠO ĐƠN MANG VỀ] -> prepare TAKEAWAY draft (tableId: null) and switch to Menu tab
    setSelectedOrderId(null);
    setDraftTarget({ orderType: 'TAKEAWAY' });
    setDraftItems([]);
    emitViewChange('draft-started');
  };

  // Các lần chạm thêm món vào hoá đơn được xếp hàng: lần sau chờ lần trước xong (kể cả tải lại đơn)
  // mới đọc số lượng hiện tại, nên chạm nhanh liên tiếp vẫn cộng đủ và không bao giờ mất món.
  const queryClient = useQueryClient();
  const addItemQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  const addItemToLiveOrder = async (orderId: number, item: PosMenuSelectedItem) => {
    const latestOrder =
      queryClient.getQueryData<OrderDetailResponse>(posQueryKeys.orderDetail(orderId)) ??
      (currentOrder?.orderId === orderId ? currentOrder : undefined);
    const mergeTarget = latestOrder ? findMergeableOrderItem(latestOrder, item) : undefined;
    try {
      await patchItemsMutation.mutateAsync({
        orderId,
        input: mergeTarget
          ? {
              updates: [
                { orderItemId: mergeTarget.id, quantity: mergeTarget.quantity + item.quantity },
              ],
            }
          : {
              addItems: [
                {
                  productId: item.productId,
                  quantity: item.quantity,
                  modifiers: item.modifiers,
                  ...(item.itemNote ? { itemNote: item.itemNote } : {}),
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
    if (selectedOrderId && currentOrder) {
      if (!canUpdateOrder) return;
      const orderId = selectedOrderId;
      const task = addItemQueueRef.current.then(() => addItemToLiveOrder(orderId, item));
      addItemQueueRef.current = task.catch(() => undefined);
      await task;
      return;
    }

    if (!canCreateOrder) return;

    if (!draftTarget) {
      setDraftTarget({ orderType: 'TAKEAWAY' });
    }

    setDraftItems((prev) => {
      const existingIndex = findMatchingDraftIndex(prev, item);
      if (existingIndex < 0) return [...prev, item];
      return prev.map((entry, index) =>
        index === existingIndex ? { ...entry, quantity: entry.quantity + item.quantity } : entry,
      );
    });
  };

  const handleUpdateDraftQty = (index: number, delta: number) => {
    setDraftItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
      ),
    );
  };

  const handleRemoveDraftItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmitDraftOrder = async () => {
    if (!draftTarget || draftItems.length === 0) return;

    try {
      const created = await createOrderMutation.mutateAsync({
        orderType: draftTarget.orderType,
        tableId: draftTarget.orderType === 'DINE_IN' ? draftTarget.tableId : null,
        items: draftItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          modifiers: item.modifiers,
          ...(item.itemNote ? { itemNote: item.itemNote } : {}),
        })),
      });

      setDraftTarget(null);
      setDraftItems([]);
      setSelectedOrderId(created.orderId);
      emitViewChange('draft-submitted');

      notify('pos.order.createSuccess', {
        variant: 'success',
        vars: { targetLabel: `${created.tableLabel ?? created.orderCode}` },
      });
    } catch (err) {
      notifyErr('pos.order.createError', err);
    }
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
    await patchItemsMutation.mutateAsync({
      orderId: selectedOrderId,
      input: {
        updates: [{ orderItemId, quantity: newQuantity }],
      },
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

  const handleSplitKitchen = async () => {
    if (!selectedOrderId || splitKitchenMutation.isPending) return;
    try {
      const response = await splitKitchenMutation.mutateAsync(selectedOrderId);
      clearAddonBadge(selectedOrderId);
      if (response.tickets.length > 0) {
        thermalPrinter.printKitchenSplit({
          orderCode: currentOrder?.orderCode ?? `#${selectedOrderId}`,
          orderType: currentOrder?.orderType,
          tableLabel: currentOrder?.tableLabel,
          takeawayNumber: currentOrder?.takeawayNumber,
          orderNote: currentOrder?.note,
          tickets: response.tickets,
        });
        notify('pos.kitchen.splitSuccess', {
          variant: 'success',
          vars: { batchNo: response.batchNo, ticketCount: response.tickets.length },
        });
      } else {
        notify('pos.kitchen.splitNoNewItems', {
          variant: 'info',
          vars: { message: response.message ?? 'Không có món mới cần tách' },
          duration: 3500,
        });
      }
    } catch (err) {
      notifyErr('pos.kitchen.splitError', err);
    }
  };

  const handleReprintKitchen = async (batchNo?: number) => {
    if (!selectedOrderId || reprintKitchenMutation.isPending) return;
    try {
      const response = await reprintKitchenMutation.mutateAsync({
        orderId: selectedOrderId,
        input: batchNo ? { batchNo } : undefined,
      });
      if (response.tickets.length > 0) {
        thermalPrinter.printKitchenSplit({
          orderCode: currentOrder?.orderCode ?? `#${selectedOrderId}`,
          orderType: currentOrder?.orderType,
          tableLabel: currentOrder?.tableLabel,
          takeawayNumber: currentOrder?.takeawayNumber,
          orderNote: currentOrder?.note,
          isReprint: true,
          tickets: response.tickets,
        });
        notify(batchNo ? 'pos.kitchen.reprintBatchSuccess' : 'pos.kitchen.reprintAllSuccess', {
          variant: 'info',
          vars: batchNo
            ? { batchNo, ticketCount: response.tickets.length }
            : { ticketCount: response.tickets.length },
        });
      } else {
        notify('pos.kitchen.reprintEmpty', {
          variant: 'info',
          vars: { message: response.message ?? 'Không có món đã in nào để in lại' },
        });
      }
    } catch (err) {
      notifyErr('pos.kitchen.reprintError', err);
    }
  };

  const handlePrintProvisionalBill = async () => {
    if (!selectedOrderId || provisionalBillMutation.isPending) return;
    try {
      const bill = await provisionalBillMutation.mutateAsync(selectedOrderId);
      if (bill.vietQrPayload && typeof Image !== 'undefined') {
        const img = new Image();
        img.src = bill.vietQrPayload;
        if (img.decode) {
          try {
            await Promise.race([
              img.decode(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
            ]);
          } catch {
            // fallback handled by ProvisionalVietQrSlip
          }
        }
      }
      thermalPrinter.printProvisionalVietQr({
        ...bill,
        tableLabel: currentOrder?.tableLabel,
        cashierName: currentUser?.fullName ?? currentUser?.username,
        createdAt: currentOrder?.createdAt,
      });
      if (bill.qrOverLimit && bill.paymentAccount) {
        notify('pos.paymentQr.overLimitWarning', {
          variant: 'warning',
          vars: {
            accountLabel: bill.paymentAccount.label,
            bankName: bill.paymentAccount.bankName,
            accountNo: bill.paymentAccount.accountNo,
          },
        });
      } else if (bill.qrRotated && bill.paymentAccount) {
        notify('pos.paymentQr.rotatedInfo', {
          variant: 'info',
          vars: {
            accountLabel: bill.paymentAccount.label,
            bankName: bill.paymentAccount.bankName,
            accountNo: bill.paymentAccount.accountNo,
          },
        });
      }
      notify('pos.provisional.printSuccess', {
        variant: 'success',
        vars: { orderCode: bill.orderCode },
      });
    } catch (err) {
      notifyErr('pos.provisional.printError', err);
    }
  };

  const handleApplyDiscount = async (payload: ApplyPosDiscountRequest) => {
    if (!selectedOrderId) return;
    try {
      const updated = await applyDiscountMutation.mutateAsync({
        orderId: selectedOrderId,
        input: payload,
      });
      setDiscountDialogOpen(false);
      notify('pos.discount.applySuccess', {
        variant: 'success',
        vars: { amount: (updated.discountAmount ?? 0).toLocaleString('vi-VN') },
      });
      return updated;
    } catch (err) {
      notifyErr('pos.discount.applyError', err);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!selectedOrderId || removeDiscountMutation.isPending) return;
    try {
      await removeDiscountMutation.mutateAsync(selectedOrderId);
      notify('pos.discount.removeSuccess', { variant: 'info' });
    } catch (err) {
      notifyErr('pos.discount.removeError', err);
    }
  };

  const handleConfirmCheckout = async (payload: CheckoutOrderRequest) => {
    if (!selectedOrderId) return;
    markClosingLocally(selectedOrderId);
    try {
      const orderSnapshot = currentOrder;
      const response = await checkoutMutation.mutateAsync({
        orderId: selectedOrderId,
        input: payload,
      });

      if (payload.printReceipt && orderSnapshot) {
        const resolvedTableLabel =
          orderSnapshot.tableLabel ??
          (orderSnapshot.orderType === 'TAKEAWAY'
            ? `Mang về #${String(orderSnapshot.takeawayNumber ?? 1).padStart(2, '0')}`
            : `Bàn #${orderSnapshot.tableId}`);
        const discountLabel =
          orderSnapshot.discountSnapshot?.kind === 'CODE'
            ? (orderSnapshot.discountSnapshot.code ?? orderSnapshot.discountSnapshot.name)
            : (orderSnapshot.discountSnapshot?.name ?? null);
        thermalPrinter.printOfficialReceipt({
          orderCode: orderSnapshot.orderCode,
          tableLabel: resolvedTableLabel,
          cashierName: currentUser?.fullName ?? currentUser?.username,
          paidAt: response.paidAt,
          paymentMethod: payload.paymentMethod,
          cashAmount: payload.cashAmount,
          transferAmount: payload.transferAmount,
          subtotalAmount: orderSnapshot.subtotalAmount,
          discountAmount: orderSnapshot.discountAmount,
          discountLabel,
          totalAmount: orderSnapshot.totalAmount,
          items: orderSnapshot.items
            .filter((item) => item.kitchenStatus !== 'CANCELLED')
            .map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              modifiers: item.modifiers,
              pricedModifiers: item.pricedModifiers,
              note: item.itemNote,
            })),
        });
      }

      setCheckoutOpen(false);
      clearAddonBadge(selectedOrderId);
      setSelectedOrderId(null);
      notify(payload.printReceipt ? 'pos.checkout.successWithPrint' : 'pos.checkout.successNoPrint', {
        variant: 'success',
      });
    } catch (err) {
      notifyErr('pos.checkout.error', err);
    }
  };

  const handlePrintSplitProvisional = async (
    selectedItems: SplitSelectedItemSummary[],
    splitTotal: number,
  ) => {
    if (!currentOrder || splitProvisionalBillMutation.isPending) return;
    try {
      const bill = await splitProvisionalBillMutation.mutateAsync({
        orderId: currentOrder.orderId,
        input: {
          items: selectedItems.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
          })),
        },
      });
      setLastSplitPaymentAccountId(bill.paymentAccount?.id ?? null);

      if (bill.vietQrPayload && typeof Image !== 'undefined') {
        const img = new Image();
        img.src = bill.vietQrPayload;
        if (img.decode) {
          try {
            await Promise.race([
              img.decode(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
            ]);
          } catch {
            // fallback handled by ProvisionalVietQrSlip
          }
        }
      }
      thermalPrinter.printProvisionalVietQr({
        ...bill,
        tableLabel: currentOrder.tableLabel,
        cashierName: currentUser?.fullName ?? currentUser?.username,
        createdAt: currentOrder.createdAt,
      });
      setSplitDialogMode(null);
      if (bill.qrOverLimit && bill.paymentAccount) {
        notify('pos.paymentQr.overLimitWarning', {
          variant: 'warning',
          vars: {
            accountLabel: bill.paymentAccount.label,
            bankName: bill.paymentAccount.bankName,
            accountNo: bill.paymentAccount.accountNo,
          },
        });
      } else if (bill.qrRotated && bill.paymentAccount) {
        notify('pos.paymentQr.rotatedInfo', {
          variant: 'info',
          vars: {
            accountLabel: bill.paymentAccount.label,
            bankName: bill.paymentAccount.bankName,
            accountNo: bill.paymentAccount.accountNo,
          },
        });
      }
      notify('pos.split.provisionalSuccess', {
        variant: 'success',
        vars: {
          itemCount: selectedItems.length,
          amount: splitTotal.toLocaleString('vi-VN'),
        },
      });
    } catch (err) {
      notifyErr('pos.split.provisionalError', err);
    }
  };

  const handleConfirmSplitCheckout = async (
    payload: SplitCheckoutOrderRequest,
    selectedItems: SplitSelectedItemSummary[],
    splitTotal: number,
  ) => {
    if (!selectedOrderId || !currentOrder) return;
    markClosingLocally(selectedOrderId);
    try {
      const orderSnapshot = currentOrder;
      const response = await splitCheckoutMutation.mutateAsync({
        orderId: selectedOrderId,
        input: {
          ...payload,
          ...(lastSplitPaymentAccountId ? { paymentAccountId: lastSplitPaymentAccountId } : {}),
        },
      });
      setLastSplitPaymentAccountId(null);

      if (payload.printReceipt) {
        const resolvedTableLabel =
          orderSnapshot.tableLabel ??
          (orderSnapshot.orderType === 'TAKEAWAY'
            ? `Mang về #${String(orderSnapshot.takeawayNumber ?? 1).padStart(2, '0')}`
            : `Bàn #${orderSnapshot.tableId}`);
        thermalPrinter.printOfficialReceipt({
          orderCode: response.paidOrderCode,
          tableLabel: resolvedTableLabel,
          cashierName: currentUser?.fullName ?? currentUser?.username,
          paidAt: response.paidAt,
          paymentMethod: payload.paymentMethod,
          cashAmount: payload.cashAmount,
          transferAmount: payload.transferAmount,
          totalAmount: splitTotal,
          items: selectedItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            modifiers: item.modifiers,
            note: item.note,
          })),
        });
      }

      setSplitDialogMode(null);
      if (response.isFullCheckout) {
        setSelectedOrderId(null);
      }
      notify(
        response.isFullCheckout
          ? 'pos.split.checkoutFullSuccess'
          : 'pos.split.checkoutPartialSuccess',
        {
          variant: 'success',
          vars: response.isFullCheckout
            ? undefined
            : {
                paidOrderCode: response.paidOrderCode,
                remainingAmount: response.remainingTotalAmount.toLocaleString('vi-VN'),
              },
        },
      );
    } catch (err) {
      notifyErr('pos.split.checkoutError', err);
    }
  };

  const handleConfirmTableAction = async (input: TableActionRequest) => {
    if (!selectedOrderId) return;
    markClosingLocally(selectedOrderId);
    try {
      const mergedTargetOrderId =
        input.action === TableActionType.MERGE
          ? (gridData?.tables.find((t) => t.id === input.targetTableId)?.activeOrderId ?? null)
          : null;
      const result = await tableActionMutation.mutateAsync({
        orderId: selectedOrderId,
        input,
      });
      if (result.requireKitchenNoticePrint && result.kitchenTransferSlip) {
        thermalPrinter.printTableTransferNotice({
          ...result.kitchenTransferSlip,
          cashierName: currentUser?.fullName || currentUser?.username || 'Thu ngân',
        });
      }
      setTableActionOpen(false);
      if (result.action === TableActionType.MERGE && mergedTargetOrderId) {
        setSelectedOrderId(mergedTargetOrderId);
      }
      const actionText =
        result.action === 'MOVE' ? 'chuyển' : result.action === 'MERGE' ? 'gộp' : 'hoán đổi';
      notify(
        result.requireKitchenNoticePrint
          ? 'pos.tableAction.successPrinted'
          : 'pos.tableAction.successSynced',
        {
          variant: 'success',
          vars: { actionText },
        },
      );
    } catch (err) {
      notifyErr('pos.tableAction.error', err);
    }
  };

  const handleCancelOrder = async (reason?: string) => {
    if (!selectedOrderId || cancelOrderMutation.isPending) return;
    markClosingLocally(selectedOrderId);
    const isTakeaway = currentOrder?.orderType === 'TAKEAWAY';
    try {
      const defaultReason = isTakeaway
        ? 'Thu ngân huỷ đơn mang về'
        : 'Tất cả món trong đơn đã bị huỷ bởi thu ngân';
      const resolvedReason =
        typeof reason === 'string' && reason.trim().length >= 10
          ? reason.trim()
          : defaultReason;

      const orderSnapshot = currentOrder;
      const response = await cancelOrderMutation.mutateAsync({
        orderId: selectedOrderId,
        input: {
          voidReason: resolvedReason,
        },
      });
      if (
        response.requireCancellationSlip &&
        response.kitchenCancellationSlips.length > 0
      ) {
        thermalPrinter.printKitchenCancelItem({
          orderCode: orderSnapshot?.orderCode,
          slips: response.kitchenCancellationSlips,
        });
      }
      setSelectedOrderId(null);
      notify(isTakeaway ? 'pos.order.voidTakeawaySuccess' : 'pos.order.voidTableSuccess', {
        variant: 'success',
      });
    } catch (err) {
      notifyErr('pos.order.voidError', err);
    }
  };

  const activeBadgeCount = currentOrder
    ? currentOrder.items.filter((i) => i.kitchenStatus !== 'CANCELLED').length
    : draftItems.length;
  const activeTotal = currentOrder
    ? currentOrder.totalAmount
    : draftItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const activeLabel = currentOrder
    ? currentOrder.tableLabel
    : draftTarget?.orderType === 'TAKEAWAY'
      ? 'Đơn Mang về mới'
      : draftTarget?.tableName ?? 'Đang chọn bàn';

  const clearSelection = () => {
    setSelectedOrderId(null);
    setDraftTarget(null);
    setDraftItems([]);
  };

  return {
    tableGridQuery,
    gridData,
    productsQuery,
    products,
    currentOrder: currentOrder ?? null,
    currentUser,
    selectedOrderId,
    draftTarget,
    draftItems,
    addonBadgesByOrderId,
    selectedPendingAlert,
    permissions: {
      canCreateOrder,
      canUpdateOrder,
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
      isSplitPending: splitKitchenMutation.isPending,
      isProvisionalPending: provisionalBillMutation.isPending,
      isApprovingQr: approveQrMutation.isPending,
      isSubmittingDraft: createOrderMutation.isPending,
      isCancellingOrder: cancelOrderMutation.isPending,
      isReprintPending: reprintKitchenMutation.isPending,
      isDiscountPending: applyDiscountMutation.isPending || removeDiscountMutation.isPending,
      isApplyingDiscount: applyDiscountMutation.isPending,
      isCheckoutPending: checkoutMutation.isPending,
      isTableActionPending: tableActionMutation.isPending,
      isSplitDialogPending:
        splitCheckoutMutation.isPending || splitProvisionalBillMutation.isPending,
      isPatchingItems: patchItemsMutation.isPending,
    },
    dialogs: {
      tableActionOpen,
      setTableActionOpen,
      checkoutOpen,
      setCheckoutOpen,
      discountDialogOpen,
      setDiscountDialogOpen,
      splitDialogMode,
      setSplitDialogMode,
    },
    isOrderClosedLocally,
    actions: {
      clearSelection,
      selectTable: handleSelectTable,
      selectTakeawayOrder: handleSelectTakeawayOrder,
      startNewTakeaway: handleStartNewTakeaway,
      addItemFromMenu: handleAddItemFromMenu,
      updateDraftQty: handleUpdateDraftQty,
      removeDraftItem: handleRemoveDraftItem,
      submitDraftOrder: handleSubmitDraftOrder,
      approveQrOrder: handleApproveQrOrder,
      updateOrderItemQuantity: handleUpdateOrderItemQuantity,
      removeOrCancelOrderItem: handleRemoveOrCancelOrderItem,
      splitKitchen: handleSplitKitchen,
      reprintKitchen: handleReprintKitchen,
      printProvisionalBill: handlePrintProvisionalBill,
      applyDiscount: handleApplyDiscount,
      removeDiscount: handleRemoveDiscount,
      confirmCheckout: handleConfirmCheckout,
      printSplitProvisional: handlePrintSplitProvisional,
      confirmSplitCheckout: handleConfirmSplitCheckout,
      confirmTableAction: handleConfirmTableAction,
      cancelOrder: handleCancelOrder,
    },
  };
}

export type PosWorkspace = ReturnType<typeof usePosWorkspace>;
