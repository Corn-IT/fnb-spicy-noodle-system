import { ChevronLeft, ChevronRight, Hand, LayoutGrid, Receipt, UtensilsCrossed } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { requestAppFullscreen } from '@/hooks/use-fullscreen';
import { POS_TOUCH_PATH } from '@/lib/pos-device-mode';
import { cn } from '@/utils/cn';
import { usePosWorkspace } from '../hooks/use-pos-workspace';
import { LiveInvoicePanel } from './live-invoice-panel';
import { PosMenuPanel } from './pos-menu-panel';
import { PosWorkspaceDialogs } from './pos-workspace-dialogs';
import { TableGridPanel } from './table-grid-panel';

type PosDesktopTab = 'tables' | 'menu' | 'invoice';

const NARROW_LAYOUT_MAX_WIDTH = 820;

const isNarrowViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < NARROW_LAYOUT_MAX_WIDTH;

export function PosUnifiedPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posTab, setPosTab] = React.useState<PosDesktopTab>('tables');
  const workspace = usePosWorkspace({
    onViewChange: (event) => {
      if (event === 'draft-started') {
        setPosTab('menu');
      } else if (event === 'draft-target-picker' || event === 'draft-parked') {
        setPosTab('tables');
      } else if (event === 'draft-submitted') {
        setPosTab('tables');
      } else if (isNarrowViewport()) {
        setPosTab('invoice');
      }
    },
  });
  const {
    tableGridQuery,
    gridData,
    productsQuery,
    products,
    currentOrder,
    selectedOrderId,
    draftTarget,
    draftItems,
    addonIsTakeaway,
    setAddonIsTakeaway,
    addonBadgesByOrderId,
    selectedPendingAlert,
    permissions,
    summary,
    pending,
    dialogs,
    actions,
  } = workspace;
  const { canCreateOrder, canUpdateOrder, canSaveDraft, canSplitKitchen, canTableAction, canCheckout } =
    permissions;
  const { activeBadgeCount, activeTotal, activeLabel } = summary;

  // Deep-link từ Web Push Notification (`/pos?orderId=42`) -> tự mở đúng bàn/hoá đơn để xác nhận ngay.
  const deepLinkOrderIdParam = searchParams.get('orderId');
  React.useEffect(() => {
    if (!deepLinkOrderIdParam || !gridData) return;
    const parsedId = Number(deepLinkOrderIdParam);
    if (Number.isInteger(parsedId) && parsedId > 0) {
      actions.selectOrderById(parsedId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('orderId');
    setSearchParams(next, { replace: true });
  }, [deepLinkOrderIdParam, gridData]);

  const handleEnterTouchMode = () => {
    // Fullscreen phải được gọi trong chính lần bấm của người dùng (quy định của trình duyệt).
    void requestAppFullscreen();
    navigate(POS_TOUCH_PATH);
  };

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
      <div className="flex flex-1 min-h-0 w-full flex-col gap-3 min-[820px]:flex-row overflow-hidden">
      {/* Left Panel: Table Grid / Fast Menu (Expands to fill all remaining width) */}
      <div
        className={cn(
          'flex flex-1 min-w-0 min-h-0 h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
          posTab === 'invoice' && 'hidden min-[820px]:flex',
        )}
      >
        <Tabs
          value={posTab === 'invoice' ? 'tables' : posTab}
          onValueChange={(v) => setPosTab(v as 'tables' | 'menu' | 'invoice')}
          className="flex flex-1 min-h-0 h-full flex-col"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2.5 sm:px-4 py-2 sm:py-2.5 shrink-0">
            <TabsList className="grid flex-1 min-w-[180px] grid-cols-3 min-[820px]:grid-cols-2 h-auto p-1">
              <TabsTrigger
                value="tables"
                data-testid="pos-tab-tables"
                className="min-h-9 min-[820px]:min-h-8 gap-1 px-1.5 sm:px-3 text-xs sm:text-sm"
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0 sm:hidden" />
                <span className="sm:hidden">Bàn</span>
                <span className="hidden sm:inline xl:hidden">Sơ đồ Bàn</span>
                <span className="hidden xl:inline">Sơ đồ Bàn &amp; Mang về</span>
              </TabsTrigger>
              <TabsTrigger
                value="menu"
                data-testid="pos-tab-menu"
                className="min-h-9 min-[820px]:min-h-8 gap-1 px-1.5 sm:px-3 text-xs sm:text-sm"
              >
                <UtensilsCrossed className="h-3.5 w-3.5 shrink-0 sm:hidden" />
                <span className="sm:hidden">Món</span>
                <span className="hidden sm:inline xl:hidden">Thực đơn</span>
                <span className="hidden xl:inline">Thực đơn Gọi món nhanh</span>
              </TabsTrigger>
              <TabsTrigger
                value="invoice"
                data-testid="pos-tab-invoice"
                onClick={() => setPosTab('invoice')}
                className="min-[820px]:hidden min-h-9 gap-1 px-1.5 sm:px-3 text-xs sm:text-sm"
              >
                <Receipt className="h-3.5 w-3.5 shrink-0 sm:hidden" />
                <span className="sm:hidden">Đơn</span>
                <span className="hidden sm:inline">Hoá đơn</span>
                {activeBadgeCount > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold text-accent-text">
                    {activeBadgeCount}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="pos-enter-touch-mode-btn"
                onClick={handleEnterTouchMode}
                aria-label="Chế độ cảm ứng"
                title="Chế độ cảm ứng"
                className="h-10 min-w-10 lg:h-8 lg:min-w-0 gap-1.5 px-2.5 text-xs font-semibold"
              >
                <Hand className="h-3.5 w-3.5 text-accent-text shrink-0" />
                <span className="hidden sm:inline">Chế độ cảm ứng</span>
              </Button>
              <AuditHistoryButton module="POS" label="Lịch sử" className="shrink-0" />
            </div>
          </div>

          <TabsContent value="tables" className="mt-0 flex-1 min-h-0 h-full overflow-hidden flex flex-col data-[state=inactive]:hidden">
            <TableGridPanel
              tables={gridData?.tables ?? []}
              takeaways={gridData?.takeaways ?? []}
              drafts={workspace.parkedDrafts}
              activeDraftId={workspace.activeDraftId}
              takeawayQrToken={gridData?.takeawayQrToken}
              selectedOrderId={selectedOrderId}
              draftTarget={draftTarget}
              addonBadgesByOrderId={addonBadgesByOrderId}
              onSelectTable={actions.selectTable}
              onSelectTakeawayOrder={actions.selectTakeawayOrder}
              onStartNewTakeaway={actions.startNewTakeaway}
              onStartUntargetedDraft={actions.startUntargetedDraft}
              onResumeDraft={actions.resumeDraft}
              onDeleteDraft={actions.deleteDraft}
            />
          </TabsContent>

          <TabsContent value="menu" className="mt-0 flex-1 min-h-0 h-full overflow-hidden flex flex-col data-[state=inactive]:hidden">
            <PosMenuPanel
              products={products}
              onAddItem={actions.addItemFromMenu}
              showAddonServingModeSelector={Boolean(
                currentOrder &&
                  currentOrder.orderType === 'DINE_IN' &&
                  (currentOrder.status === 'PENDING' || currentOrder.status === 'SERVING') &&
                  currentOrder.items.length > 0,
              )}
              addonIsTakeaway={addonIsTakeaway}
              onChangeAddonIsTakeaway={setAddonIsTakeaway}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right Panel: Live Electronic Invoice (Split-view from 820px+) */}
      <div
        className={cn(
          'flex min-h-0 h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm min-[820px]:w-[310px] lg:w-[330px] xl:w-[350px] 2xl:w-[380px] min-[820px]:flex-none shrink-0',
          posTab !== 'invoice' && 'hidden min-[820px]:flex',
        )}
      >
        {/* Mobile Header for Invoice View */}
        <div className="flex items-center justify-between gap-1 border-b px-2.5 py-2 bg-muted/40 min-[820px]:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPosTab('tables')}
            className="text-xs font-semibold gap-1 min-h-10 px-2"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span>Bàn</span>
          </Button>
          <span className="text-xs font-bold text-foreground text-center leading-tight break-words px-1">
            {activeLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPosTab('menu')}
            className="text-xs font-semibold gap-1 min-h-10 px-2"
          >
            <span>Menu</span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Button>
        </div>

        <LiveInvoicePanel
          order={currentOrder}
          draftTarget={draftTarget}
          draftItems={draftItems}
          canCreate={canCreateOrder}
          canSaveDraft={canSaveDraft}
          canUpdate={canUpdateOrder}
          canSplitKitchen={canSplitKitchen}
          canTableAction={canTableAction}
          canCheckout={canCheckout}
          isSplitPending={pending.isSplitPending}
          isProvisionalPending={pending.isProvisionalPending}
          isApprovingQr={pending.isApprovingQr}
          isSubmittingDraft={pending.isSubmittingDraft}
          isSavingDraft={pending.isSavingDraft}
          isCancellingOrder={pending.isCancellingOrder}
          isReprintPending={pending.isReprintPending}
          isDiscountPending={pending.isDiscountPending}
          pendingAlert={selectedPendingAlert}
          onUpdateDraftQty={actions.updateDraftQty}
          onRemoveDraftItem={actions.removeDraftItem}
          onSubmitDraftOrder={actions.submitDraftOrder}
          onSaveDraft={actions.saveDraft}
          onChooseDraftTarget={actions.chooseDraftTarget}
          onApproveQrOrder={actions.approveQrOrder}
          onUpdateOrderItemQuantity={actions.updateOrderItemQuantity}
          onToggleOrderItemTakeaway={actions.toggleOrderItemTakeaway}
          onRemoveOrCancelOrderItem={actions.removeOrCancelOrderItem}
          addonIsTakeaway={addonIsTakeaway}
          onChangeAddonIsTakeaway={setAddonIsTakeaway}
          onOpenTableAction={() => dialogs.setTableActionOpen(true)}
          onSplitKitchen={actions.splitKitchen}
          onReprintKitchen={actions.reprintKitchen}
          onPrintProvisionalBill={actions.printProvisionalBill}
          onOpenSplitProvisionalBill={() => dialogs.setSplitDialogMode('PROVISIONAL')}
          onOpenCheckout={() => dialogs.setCheckoutOpen(true)}
          onOpenSplitCheckout={() => dialogs.setSplitDialogMode('CHECKOUT')}
          onCancelOrder={actions.cancelOrder}
          onOpenDiscount={() => dialogs.setDiscountDialogOpen(true)}
          onRemoveDiscount={actions.removeDiscount}
        />
      </div>
      </div>

      {/* Floating Bottom Quick Action Bar on Mobile/Narrow Tablet */}
      {posTab !== 'invoice' && (currentOrder || draftItems.length > 0 || draftTarget) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 p-2.5 sm:p-3 min-[820px]:hidden pb-safe">
          <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-primary/30 bg-card/95 p-2.5 shadow-2xl backdrop-blur-md">
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-xs font-bold text-foreground leading-snug break-words">
                {activeLabel} {activeBadgeCount > 0 ? `(${activeBadgeCount} món)` : ''}
              </p>
              <p className="text-sm font-extrabold text-price tabular-nums">
                {activeTotal.toLocaleString('vi-VN')} đ
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setPosTab('invoice')}
              className="min-h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-xs active:scale-95 shrink-0 px-3.5"
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span>Xem đơn</span>
            </Button>
          </div>
        </div>
      ) : null}

      <PosWorkspaceDialogs workspace={workspace} />
    </div>
  );
}
