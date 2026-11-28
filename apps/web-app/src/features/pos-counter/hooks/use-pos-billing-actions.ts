import {
  formatTakeawayLabel,
  TableActionType,
  type ApplyPosDiscountRequest,
  type CheckoutOrderRequest,
  type OrderDetailResponse,
  type PaymentMethod,
  type PosTableGridResponse,
  type SplitCheckoutOrderRequest,
  type TableActionRequest,
} from '@fnb/shared';
import * as React from 'react';

import { useThermalPrinter, useThermalPrinterConfigStore } from '@/components/print-slips';
import { useAppMessages } from '@/hooks/use-app-messages';
import {
  useApplyPosDiscountMutation,
  useCancelPosOrderMutation,
  useCheckoutOrderMutation,
  useProvisionalBillMutation,
  useRemovePosDiscountMutation,
  useReprintKitchenMutation,
  useSplitCheckoutOrderMutation,
  useSplitKitchenMutation,
  useSplitProvisionalBillMutation,
  useTableActionMutation,
} from '../api/pos.api';
import type {
  SplitOrderDialogMode,
  SplitSelectedItemSummary,
} from '../components/split-order-items-dialog';
import type { NotifyErrFn } from './use-pos-workspace-types';

async function preloadVietQrImage(vietQrPayload: string | null | undefined): Promise<void> {
  if (!vietQrPayload || typeof Image === 'undefined') return;
  const img = new Image();
  img.src = vietQrPayload;
  if (!img.decode) return;
  try {
    await Promise.race([
      img.decode(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
    ]);
  } catch {
    // fallback handled by ProvisionalVietQrSlip
  }
}

function notifyPaymentQrNotice(
  bill: {
    qrOverLimit?: boolean;
    qrRotated?: boolean;
    paymentAccount?: { label: string; bankName: string; accountNo: string } | null;
  },
  notify: ReturnType<typeof useAppMessages>['notify'],
): void {
  if (!bill.paymentAccount) return;
  if (bill.qrOverLimit) {
    notify('pos.paymentQr.overLimitWarning', {
      variant: 'warning',
      vars: {
        accountLabel: bill.paymentAccount.label,
        bankName: bill.paymentAccount.bankName,
        accountNo: bill.paymentAccount.accountNo,
      },
    });
  } else if (bill.qrRotated) {
    notify('pos.paymentQr.rotatedInfo', {
      variant: 'info',
      vars: {
        accountLabel: bill.paymentAccount.label,
        bankName: bill.paymentAccount.bankName,
        accountNo: bill.paymentAccount.accountNo,
      },
    });
  }
}

function resolvePosTableLabel(orderSnapshot: OrderDetailResponse): string {
  return (
    orderSnapshot.tableLabel ??
    (orderSnapshot.orderType === 'TAKEAWAY'
      ? formatTakeawayLabel(orderSnapshot.takeawayNumber, orderSnapshot.takeawayLabelFormat)
      : `Bàn #${orderSnapshot.tableId}`)
  );
}

interface UsePosBillingActionsParams {
  selectedOrderId: number | null;
  currentOrder: OrderDetailResponse | undefined;
  gridData: PosTableGridResponse | undefined;
  cashierName: string | undefined;
  setSelectedOrderId: (id: number | null) => void;
  clearAddonBadge: (orderId: number) => void;
  markClosingLocally: (orderId: number) => void;
  unmarkClosingLocally: (orderId: number) => void;
  notifyErr: NotifyErrFn;
}

/** Manages kitchen split/reprint, provisional VietQR printing, discounts, checkout, table transfers, and order voiding. */
export function usePosBillingActions({
  selectedOrderId,
  currentOrder,
  gridData,
  cashierName,
  setSelectedOrderId,
  clearAddonBadge,
  markClosingLocally,
  unmarkClosingLocally,
  notifyErr,
}: UsePosBillingActionsParams) {
  const thermalPrinter = useThermalPrinter();
  const { notify } = useAppMessages();

  const [tableActionOpen, setTableActionOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = React.useState(false);
  const [splitDialogMode, setSplitDialogMode] = React.useState<SplitOrderDialogMode | null>(null);
  const [lastSplitPaymentAccountId, setLastSplitPaymentAccountId] = React.useState<number | null>(null);

  React.useEffect(() => {
    setLastSplitPaymentAccountId(null);
  }, [selectedOrderId]);

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
          takeawayLabelFormat: currentOrder?.takeawayLabelFormat,
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
          takeawayLabelFormat: currentOrder?.takeawayLabelFormat,
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
      await preloadVietQrImage(bill.vietQrPayload);
      thermalPrinter.printProvisionalVietQr({
        ...bill,
        tableLabel: currentOrder?.tableLabel,
        takeawayLabelFormat: bill.takeawayLabelFormat ?? currentOrder?.takeawayLabelFormat,
        cashierName,
        createdAt: currentOrder?.createdAt,
      });
      notifyPaymentQrNotice(bill, notify);
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

  // Thanh toán có liên quan tiền mặt (CASH / SPLIT) khi chọn "Xác nhận & Không in":
  // tự động bung két theo hành động thanh toán (không phụ thuộc quyền `pos.openCashDrawer`).
  const autoKickCashDrawerForNoPrintCashPayment = (paymentMethod: PaymentMethod) => {
    if (paymentMethod !== 'CASH' && paymentMethod !== 'SPLIT') return;
    const printerConfig = useThermalPrinterConfigStore.getState().config;
    if (printerConfig.driver === 'BROWSER' || !printerConfig.cashDrawerKick) return;
    void thermalPrinter.kickCashDrawerNow().catch(() => undefined);
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
        const discountLabel =
          orderSnapshot.discountSnapshot?.kind === 'CODE'
            ? (orderSnapshot.discountSnapshot.code ?? orderSnapshot.discountSnapshot.name)
            : (orderSnapshot.discountSnapshot?.name ?? null);
        thermalPrinter.printOfficialReceipt({
          orderCode: orderSnapshot.orderCode,
          tableLabel: resolvePosTableLabel(orderSnapshot),
          cashierName,
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
              ...(orderSnapshot.orderType !== 'TAKEAWAY' && item.isTakeaway
                ? { isTakeaway: true }
                : {}),
            })),
        });
      } else {
        autoKickCashDrawerForNoPrintCashPayment(payload.paymentMethod);
      }

      setCheckoutOpen(false);
      clearAddonBadge(selectedOrderId);
      setSelectedOrderId(null);
      notify(payload.printReceipt ? 'pos.checkout.successWithPrint' : 'pos.checkout.successNoPrint', {
        variant: 'success',
      });
    } catch (err) {
      unmarkClosingLocally(selectedOrderId);
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
      await preloadVietQrImage(bill.vietQrPayload);
      thermalPrinter.printProvisionalVietQr({
        ...bill,
        tableLabel: currentOrder.tableLabel,
        cashierName,
        createdAt: currentOrder.createdAt,
      });
      setSplitDialogMode(null);
      notifyPaymentQrNotice(bill, notify);
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
        thermalPrinter.printOfficialReceipt({
          orderCode: response.paidOrderCode,
          tableLabel: resolvePosTableLabel(orderSnapshot),
          cashierName,
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
            ...(item.pricedModifiers !== undefined ? { pricedModifiers: item.pricedModifiers } : {}),
            note: item.note,
            ...(orderSnapshot.orderType !== 'TAKEAWAY' && item.isTakeaway
              ? { isTakeaway: true }
              : {}),
          })),
        });
      } else {
        autoKickCashDrawerForNoPrintCashPayment(payload.paymentMethod);
      }

      setSplitDialogMode(null);
      if (response.isFullCheckout) {
        setSelectedOrderId(null);
      } else {
        unmarkClosingLocally(selectedOrderId);
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
      unmarkClosingLocally(selectedOrderId);
      notifyErr('pos.split.checkoutError', err);
    }
  };

  const handleConfirmTableAction = async (input: TableActionRequest) => {
    if (!selectedOrderId) return;
    const closesThisOrder = input.action === TableActionType.MERGE;
    if (closesThisOrder) markClosingLocally(selectedOrderId);
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
          cashierName: cashierName || 'Thu ngân',
        });
      }
      setTableActionOpen(false);
      if (result.action === TableActionType.MERGE && mergedTargetOrderId) {
        setSelectedOrderId(mergedTargetOrderId);
      }
      const actionText =
        result.action === 'MOVE'
          ? 'chuyển'
          : result.action === 'MERGE'
            ? 'gộp'
            : result.action === 'TO_TAKEAWAY'
              ? 'chuyển sang Mang về'
              : 'hoán đổi';
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
      if (closesThisOrder) unmarkClosingLocally(selectedOrderId);
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
      unmarkClosingLocally(selectedOrderId);
      notifyErr('pos.order.voidError', err);
    }
  };

  return {
    pending: {
      isSplitPending: splitKitchenMutation.isPending,
      isProvisionalPending: provisionalBillMutation.isPending,
      isCancellingOrder: cancelOrderMutation.isPending,
      isReprintPending: reprintKitchenMutation.isPending,
      isDiscountPending: applyDiscountMutation.isPending || removeDiscountMutation.isPending,
      isApplyingDiscount: applyDiscountMutation.isPending,
      isCheckoutPending: checkoutMutation.isPending,
      isTableActionPending: tableActionMutation.isPending,
      isSplitDialogPending:
        splitCheckoutMutation.isPending || splitProvisionalBillMutation.isPending,
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
    actions: {
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
