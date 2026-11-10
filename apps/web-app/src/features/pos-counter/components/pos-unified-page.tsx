import {
  type CheckoutOrderRequest,
  type PosOrderSummary,
  type PosTableGridResponse,
  type TableActionRequest,
} from '@fnb/shared';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import * as React from 'react';

import { useThermalPrinter } from '@/components/print-slips';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
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
  useSplitKitchenMutation,
  useTableActionMutation,
} from '../api/pos.api';
import { usePosCashierSocket } from '../hooks/use-pos-cashier-socket';
import { CheckoutConfirmDialog } from './checkout-confirm-dialog';
import { LiveInvoicePanel, type LiveInvoiceDraftTarget } from './live-invoice-panel';
import { PosMenuPanel, type PosMenuSelectedItem } from './pos-menu-panel';
import { TableActionDialog } from './table-action-dialog';
import { TableGridPanel } from './table-grid-panel';

export function PosUnifiedPage() {
  const { data: gridData } = usePosTableGridQuery();
  const { data: products = [] } = usePosProductsQuery();
  const { addonBadgesByOrderId, clearAddonBadge } = usePosCashierSocket();
  const thermalPrinter = useThermalPrinter();
  const currentUser = useAuthStore((s) => s.user);

  const [posTab, setPosTab] = React.useState<'tables' | 'menu' | 'invoice'>('tables');
  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);
  const [draftTarget, setDraftTarget] = React.useState<LiveInvoiceDraftTarget | null>(null);
  const [draftItems, setDraftItems] = React.useState<PosMenuSelectedItem[]>([]);

  const [tableActionOpen, setTableActionOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);

  const { data: currentOrder } = usePosOrderDetailQuery(selectedOrderId);

  const createOrderMutation = useCreatePosOrderMutation();
  const approveQrMutation = useApproveQrOrderMutation();
  const patchItemsMutation = usePatchOrderItemsMutation();
  const splitKitchenMutation = useSplitKitchenMutation();
  const reprintKitchenMutation = useReprintKitchenMutation();
  const provisionalBillMutation = useProvisionalBillMutation();
  const checkoutMutation = useCheckoutOrderMutation();
  const tableActionMutation = useTableActionMutation();
  const cancelOrderMutation = useCancelPosOrderMutation();

  const handleSelectTable = (table: PosTableGridResponse['tables'][number]) => {
    if (table.status === 'AVAILABLE' || !table.activeOrderId) {
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
    // Source C: Click [+ TẠO ĐƠN MANG VỀ] -> prepare TAKEAWAY draft (tableId: null) and switch to Menu tab
    setSelectedOrderId(null);
    setDraftTarget({ orderType: 'TAKEAWAY' });
    setDraftItems([]);
    setPosTab('menu');
  };

  const handleAddItemFromMenu = async (item: PosMenuSelectedItem) => {
    if (selectedOrderId && currentOrder) {
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
        toast({
          variant: 'success',
          title: 'Đã thêm món vào đơn',
          description: `${item.quantity}x ${item.name}`,
          duration: 3000,
        });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Lỗi thêm món',
          description: err instanceof Error ? err.message : 'Vui lòng thử lại',
        });
      }
      return;
    }

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

      toast({
        variant: 'success',
        title: 'Đã tạo đơn thành công',
        description: `${created.tableLabel ?? created.orderCode}`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể tạo đơn',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
    }
  };

  const handleApproveQrOrder = async () => {
    if (!selectedOrderId) return;
    try {
      await approveQrMutation.mutateAsync({
        orderId: selectedOrderId,
        input: { approved: true },
      });
      toast({
        variant: 'success',
        title: 'Đã duyệt đơn QR',
        description: 'Đơn chuyển sang trạng thái Đang phục vụ (SERVING).',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi duyệt đơn QR',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
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
      toast({
        variant: 'warning',
        title: 'Đã huỷ món bếp & sinh Phiếu Báo Huỷ',
        description: `Đã gửi lệnh in báo huỷ tới ${result.kitchenCancellationSlips.length} trạm bếp.`,
      });
    }
  };

  const handleSplitKitchen = async () => {
    if (!selectedOrderId || splitKitchenMutation.isPending) return;
    try {
      const response = await splitKitchenMutation.mutateAsync(selectedOrderId);
      if (response.tickets.length > 0) {
        thermalPrinter.printKitchenSplit({
          orderCode: currentOrder?.orderCode ?? `#${selectedOrderId}`,
          orderType: currentOrder?.orderType,
          tableLabel: currentOrder?.tableLabel,
          takeawayNumber: currentOrder?.takeawayNumber,
          orderNote: currentOrder?.note,
          tickets: response.tickets,
        });
        toast({
          variant: 'success',
          title: `Đã tách đơn Lượt ${response.batchNo}`,
          description: `Đã gửi ${response.tickets.length} phiếu in nhiệt xuống bếp.`,
        });
      } else {
        toast({
          variant: 'info',
          title: 'Thông báo tách bếp',
          description: response.message ?? 'Không có món mới cần tách',
          duration: 3500,
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi tách bếp',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
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
        toast({
          variant: 'info',
          title: batchNo
            ? `Đã in lại phiếu bếp Lượt ${batchNo}`
            : 'Đã in lại toàn bộ phiếu bếp',
          description: `Đã gửi ${response.tickets.length} bản sao phiếu in (có dấu bản sao chống làm trùng).`,
        });
      } else {
        toast({
          variant: 'info',
          title: 'Thông báo in lại phiếu bếp',
          description: response.message ?? 'Không có món đã in nào để in lại',
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi in lại phiếu bếp',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
    }
  };

  const handlePrintProvisionalBill = async () => {
    if (!selectedOrderId || provisionalBillMutation.isPending) return;
    try {
      const bill = await provisionalBillMutation.mutateAsync(selectedOrderId);
      thermalPrinter.printProvisionalVietQr({
        ...bill,
        tableLabel: currentOrder?.tableLabel,
        cashierName: currentUser?.fullName ?? currentUser?.username,
        createdAt: currentOrder?.createdAt,
      });
      toast({
        variant: 'success',
        title: 'Đã in phiếu tạm tính (VietQR)',
        description: `Mã đơn ${bill.orderCode} vẫn giữ nguyên trạng thái Đang phục vụ.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi in tạm tính',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
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
        thermalPrinter.printOfficialReceipt({
          orderCode: orderSnapshot.orderCode,
          tableLabel: resolvedTableLabel,
          cashierName: currentUser?.fullName ?? currentUser?.username,
          paidAt: response.paidAt,
          paymentMethod: payload.paymentMethod,
          cashAmount: payload.cashAmount,
          transferAmount: payload.transferAmount,
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
      setSelectedOrderId(null);
      toast({
        variant: 'success',
        title: 'Thanh toán hoàn tất',
        description: payload.printReceipt
          ? 'Đã đóng đơn, giải phóng bàn và in hoá đơn.'
          : 'Đã đóng đơn và giải phóng bàn (Không in).',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi thanh toán',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
    }
  };

  const handleConfirmTableAction = async (input: TableActionRequest) => {
    if (!selectedOrderId) return;
    try {
      const result = await tableActionMutation.mutateAsync({
        orderId: selectedOrderId,
        input,
      });
      if (result.requireKitchenNoticePrint && result.kitchenTransferSlip) {
        thermalPrinter.printTableTransferNotice(result.kitchenTransferSlip);
      }
      setTableActionOpen(false);
      const actionText =
        result.action === 'MOVE' ? 'chuyển' : result.action === 'MERGE' ? 'gộp' : 'hoán đổi';
      toast({
        variant: 'success',
        title: `Đã ${actionText} bàn thành công`,
        description: result.requireKitchenNoticePrint
          ? 'Đã in Phiếu Thông báo Chuyển bàn xuống bếp.'
          : 'Đã đồng bộ sơ đồ bàn và phiên QR của khách.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể thao tác bàn',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
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
      toast({
        variant: 'success',
        title: isTakeaway ? 'Đã huỷ đơn mang về' : 'Đã huỷ đơn & giải phóng bàn',
        description: isTakeaway
          ? 'Đơn mang về đã được huỷ thành công.'
          : 'Bàn đã chuyển về trạng thái Bàn trống.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi huỷ đơn',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
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

  return (
    <div
      data-testid="pos-unified-screen"
      className="relative flex flex-1 min-h-0 h-full w-full flex-col gap-3 lg:flex-row overflow-hidden"
    >
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
          <div className="flex items-center justify-between border-b px-2.5 sm:px-4 py-2 sm:py-2.5 shrink-0">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-2">
              <TabsTrigger value="tables" data-testid="pos-tab-tables">
                <span className="hidden sm:inline">Sơ đồ Bàn & Mang về</span>
                <span className="sm:hidden">Sơ đồ Bàn</span>
              </TabsTrigger>
              <TabsTrigger value="menu" data-testid="pos-tab-menu">
                <span className="hidden xl:inline">Thực đơn Gọi món nhanh</span>
                <span className="hidden sm:inline xl:hidden">Thực đơn Gọi món</span>
                <span className="sm:hidden">Thực đơn</span>
              </TabsTrigger>
              <TabsTrigger
                value="invoice"
                data-testid="pos-tab-invoice"
                onClick={() => setPosTab('invoice')}
                className="lg:hidden"
              >
                <span>Hoá đơn {activeBadgeCount > 0 ? `(${activeBadgeCount})` : ''}</span>
              </TabsTrigger>
            </TabsList>
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
          isSplitPending={splitKitchenMutation.isPending}
          isProvisionalPending={provisionalBillMutation.isPending}
          isApprovingQr={approveQrMutation.isPending}
          isSubmittingDraft={createOrderMutation.isPending}
          isCancellingOrder={cancelOrderMutation.isPending}
          isReprintPending={reprintKitchenMutation.isPending}
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
          onOpenCheckout={() => setCheckoutOpen(true)}
          onCancelOrder={handleCancelOrder}
        />
      </div>

      {/* Floating Bottom Quick Action Bar on Mobile/Tablet Portrait */}
      {posTab !== 'invoice' && (currentOrder || draftItems.length > 0 || draftTarget) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 p-2.5 sm:p-3 lg:hidden pb-safe">
          <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-rose-500/30 bg-card/95 p-2.5 shadow-2xl backdrop-blur-md">
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-xs font-bold text-foreground truncate">
                {activeLabel} {activeBadgeCount > 0 ? `(${activeBadgeCount} món)` : ''}
              </p>
              <p className="text-sm font-extrabold text-rose-600 truncate">
                {activeTotal.toLocaleString('vi-VN')} đ
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setPosTab('invoice')}
              className="h-9 bg-rose-600 text-white font-bold shadow-xs active:scale-95 shrink-0 px-3.5"
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
    </div>
  );
}
