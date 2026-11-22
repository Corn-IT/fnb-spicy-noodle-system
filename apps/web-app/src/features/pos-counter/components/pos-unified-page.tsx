import {
  TableActionType,
  type ApplyPosDiscountRequest,
  type CheckoutOrderRequest,
  type PosOrderSummary,
  type PosTableGridResponse,
  type SplitCheckoutOrderRequest,
  type TableActionRequest,
} from '@fnb/shared';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { useThermalPrinter } from '@/components/print-slips';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppMessages } from '@/hooks/use-app-messages';
import { evaluateOrderPendingAlert } from '@/lib/qr-pending-reminder';
import { getActiveQrReminderConfig } from '@/lib/qr-voice-announcer';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';
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
} from '../api/pos.api';
import { usePosCashierSocket } from '../hooks/use-pos-cashier-socket';
import { CheckoutConfirmDialog } from './checkout-confirm-dialog';
import { LiveInvoicePanel, type LiveInvoiceDraftTarget } from './live-invoice-panel';
import { PosDiscountDialog } from './pos-discount-dialog';
import { PosMenuPanel, type PosMenuSelectedItem } from './pos-menu-panel';
import {
  SplitOrderItemsDialog,
  type SplitOrderDialogMode,
  type SplitSelectedItemSummary,
} from './split-order-items-dialog';
import { TableActionDialog } from './table-action-dialog';
import { TableGridPanel } from './table-grid-panel';

export function PosUnifiedPage() {
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

  const [posTab, setPosTab] = React.useState<'tables' | 'menu' | 'invoice'>('tables');
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

  const [alertClockMs, setAlertClockMs] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    setAlertClockMs(Date.now());
    if (!selectedTableRow?.activeOrder?.pendingQrSince && currentOrder?.status !== 'PENDING') {
      return;
    }
    const timer = window.setInterval(() => {
      setAlertClockMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [selectedTableRow?.activeOrder?.pendingQrSince, currentOrder?.status]);

  const selectedPendingAlert = React.useMemo(() => {
    if (!selectedTableRow?.activeOrder) return null;
    return evaluateOrderPendingAlert(
      selectedTableRow.activeOrder,
      selectedTableRow.status,
      alertClockMs,
      getActiveQrReminderConfig(),
    );
  }, [selectedTableRow, alertClockMs]);

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
      setPosTab('menu');
      return;
    }

    setDraftTarget(null);
    setDraftItems([]);
    setSelectedOrderId(table.activeOrderId);
    clearAddonBadge(table.activeOrderId);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setPosTab('invoice');
    }
  };

  const handleSelectTakeawayOrder = (order: PosOrderSummary) => {
    setDraftTarget(null);
    setDraftItems([]);
    setSelectedOrderId(order.orderId);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setPosTab('invoice');
    }
  };

  const handleStartNewTakeaway = () => {
    if (!canCreateOrder) return;
    // Source C: Click [+ TẠO ĐƠN MANG VỀ] -> prepare TAKEAWAY draft (tableId: null) and switch to Menu tab
    setSelectedOrderId(null);
    setDraftTarget({ orderType: 'TAKEAWAY' });
    setDraftItems([]);
    setPosTab('menu');
  };

  const handleAddItemFromMenu = async (item: PosMenuSelectedItem) => {
    if (selectedOrderId && currentOrder) {
      if (!canUpdateOrder) return;
      try {
        await patchItemsMutation.mutateAsync({
          orderId: selectedOrderId,
          input: {
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
      return;
    }

    if (!canCreateOrder) return;

    if (!draftTarget) {
      setDraftTarget({ orderType: 'TAKEAWAY' });
    }

    setDraftItems((prev) => [...prev, item]);
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
      setPosTab('tables');

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
    const isTakeaway = currentOrder?.orderType === 'TAKEAWAY';
    try {
      const defaultReason = isTakeaway
        ? 'Thu ngân huỷ đơn mang về'
        : 'Tất cả món trong đơn đã bị huỷ bởi thu ngân';
      const resolvedReason =
        typeof reason === 'string' && reason.trim().length >= 10
          ? reason.trim()
          : defaultReason;

      await cancelOrderMutation.mutateAsync({
        orderId: selectedOrderId,
        input: {
          voidReason: resolvedReason,
        },
      });
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

  if (!gridData && tableGridQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={tableGridQuery.error}
        onRetry={() => {
          void tableGridQuery.refetch();
          void productsQuery.refetch();
        }}
      />
    );
  }

  return (
    <div
      data-testid="pos-unified-screen"
      className="relative flex flex-1 min-h-0 h-full w-full flex-col gap-3 overflow-hidden"
    >
      <PageHeader path="/pos" defaultTitle="Bán hàng POS" hideWhenDefault className="shrink-0" />
      <div className="flex flex-1 min-h-0 w-full flex-col gap-3 lg:flex-row overflow-hidden">
      {/* Left Panel: Table Grid / Fast Menu (Expands to fill all remaining width) */}
      <div
        className={cn(
          'flex flex-1 min-w-0 min-h-0 h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
          posTab === 'invoice' && 'hidden lg:flex',
        )}
      >
        <Tabs
          value={posTab === 'invoice' ? 'tables' : posTab}
          onValueChange={(v) => setPosTab(v as 'tables' | 'menu' | 'invoice')}
          className="flex flex-1 min-h-0 h-full flex-col"
        >
          <div className="flex items-center justify-between gap-2 border-b px-2.5 sm:px-4 py-2 sm:py-2.5 shrink-0">
            <TabsList className="grid w-full min-w-0 grid-cols-3 lg:grid-cols-2">
              <TabsTrigger value="tables" data-testid="pos-tab-tables">
                <span className="hidden xl:inline truncate">Sơ đồ Bàn & Mang về</span>
                <span className="xl:hidden truncate">Sơ đồ Bàn</span>
              </TabsTrigger>
              <TabsTrigger value="menu" data-testid="pos-tab-menu">
                <span className="hidden xl:inline truncate">Thực đơn Gọi món nhanh</span>
                <span className="xl:hidden truncate">Thực đơn</span>
              </TabsTrigger>
              <TabsTrigger
                value="invoice"
                data-testid="pos-tab-invoice"
                onClick={() => setPosTab('invoice')}
                className="lg:hidden"
              >
                <span className="truncate">Hoá đơn {activeBadgeCount > 0 ? `(${activeBadgeCount})` : ''}</span>
              </TabsTrigger>
            </TabsList>
            <AuditHistoryButton module="POS" label="Lịch sử" className="shrink-0" />
          </div>

          <TabsContent value="tables" className="mt-0 flex-1 min-h-0 h-full overflow-hidden flex flex-col data-[state=inactive]:hidden">
            <TableGridPanel
              tables={gridData?.tables ?? []}
              takeaways={gridData?.takeaways ?? []}
              selectedOrderId={selectedOrderId}
              draftTarget={draftTarget}
              addonBadgesByOrderId={addonBadgesByOrderId}
              onSelectTable={handleSelectTable}
              onSelectTakeawayOrder={handleSelectTakeawayOrder}
              onStartNewTakeaway={handleStartNewTakeaway}
            />
          </TabsContent>

          <TabsContent value="menu" className="mt-0 flex-1 min-h-0 h-full overflow-hidden flex flex-col data-[state=inactive]:hidden">
            <PosMenuPanel products={products} onAddItem={handleAddItemFromMenu} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right Panel: Live Electronic Invoice (Compact fixed width on desktop: 320px - 360px) */}
      <div
        className={cn(
          'flex min-h-0 h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm lg:w-[320px] xl:w-[350px] 2xl:w-[380px] lg:flex-none shrink-0',
          posTab !== 'invoice' && 'hidden lg:flex',
        )}
      >
        {/* Mobile Header for Invoice View */}
        <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/40 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPosTab('tables')}
            className="text-xs font-semibold gap-1 h-8"
          >
            <ChevronLeft className="h-4 w-4" />
            Sơ đồ Bàn
          </Button>
          <span className="text-xs font-bold text-foreground truncate px-1">
            {activeLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPosTab('menu')}
            className="text-xs font-semibold gap-1 h-8"
          >
            Menu
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <LiveInvoicePanel
          order={currentOrder ?? null}
          draftTarget={draftTarget}
          draftItems={draftItems}
          canCreate={canCreateOrder}
          canUpdate={canUpdateOrder}
          canSplitKitchen={canSplitKitchen}
          canTableAction={canTableAction}
          canCheckout={canCheckout}
          isSplitPending={splitKitchenMutation.isPending}
          isProvisionalPending={provisionalBillMutation.isPending}
          isApprovingQr={approveQrMutation.isPending}
          isSubmittingDraft={createOrderMutation.isPending}
          isCancellingOrder={cancelOrderMutation.isPending}
          isReprintPending={reprintKitchenMutation.isPending}
          isDiscountPending={applyDiscountMutation.isPending || removeDiscountMutation.isPending}
          pendingAlert={selectedPendingAlert}
          onUpdateDraftQty={handleUpdateDraftQty}
          onRemoveDraftItem={handleRemoveDraftItem}
          onSubmitDraftOrder={handleSubmitDraftOrder}
          onApproveQrOrder={handleApproveQrOrder}
          onUpdateOrderItemQuantity={handleUpdateOrderItemQuantity}
          onRemoveOrCancelOrderItem={handleRemoveOrCancelOrderItem}
          onOpenTableAction={() => setTableActionOpen(true)}
          onSplitKitchen={handleSplitKitchen}
          onReprintKitchen={handleReprintKitchen}
          onPrintProvisionalBill={handlePrintProvisionalBill}
          onOpenSplitProvisionalBill={() => setSplitDialogMode('PROVISIONAL')}
          onOpenCheckout={() => setCheckoutOpen(true)}
          onOpenSplitCheckout={() => setSplitDialogMode('CHECKOUT')}
          onCancelOrder={handleCancelOrder}
          onOpenDiscount={() => setDiscountDialogOpen(true)}
          onRemoveDiscount={handleRemoveDiscount}
        />
      </div>
      </div>

      {/* Floating Bottom Quick Action Bar on Mobile/Tablet Portrait */}
      {posTab !== 'invoice' && (currentOrder || draftItems.length > 0 || draftTarget) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 p-2.5 sm:p-3 lg:hidden pb-safe">
          <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-primary/30 bg-card/95 p-2.5 shadow-2xl backdrop-blur-md">
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-xs font-bold text-foreground truncate">
                {activeLabel} {activeBadgeCount > 0 ? `(${activeBadgeCount} món)` : ''}
              </p>
              <p className="text-sm font-extrabold text-price truncate">
                {activeTotal.toLocaleString('vi-VN')} đ
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setPosTab('invoice')}
              className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-xs active:scale-95 shrink-0 px-3.5"
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span>Xem Hoá đơn</span>
            </Button>
          </div>
        </div>
      ) : null}

      <TableActionDialog
        open={tableActionOpen}
        onOpenChange={setTableActionOpen}
        order={currentOrder ?? null}
        tables={gridData?.tables ?? []}
        isSubmitting={tableActionMutation.isPending}
        onConfirm={handleConfirmTableAction}
      />

      <CheckoutConfirmDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        order={currentOrder ?? null}
        isSubmitting={checkoutMutation.isPending}
        onConfirmCheckout={handleConfirmCheckout}
      />

      <PosDiscountDialog
        open={discountDialogOpen}
        onOpenChange={setDiscountDialogOpen}
        order={currentOrder ?? null}
        isSubmitting={applyDiscountMutation.isPending}
        onApplyDiscount={handleApplyDiscount}
      />

      {splitDialogMode ? (
        <SplitOrderItemsDialog
          open={Boolean(splitDialogMode)}
          onOpenChange={(open) => {
            if (!open) setSplitDialogMode(null);
          }}
          mode={splitDialogMode}
          order={currentOrder ?? null}
          isSubmitting={
            splitCheckoutMutation.isPending || splitProvisionalBillMutation.isPending
          }
          onPrintSplitProvisional={handlePrintSplitProvisional}
          onConfirmSplitCheckout={handleConfirmSplitCheckout}
        />
      ) : null}
    </div>
  );
}
