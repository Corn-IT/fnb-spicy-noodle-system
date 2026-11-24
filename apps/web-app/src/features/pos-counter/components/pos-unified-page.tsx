import { ChevronLeft, ChevronRight, Hand, Receipt } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

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

const NARROW_LAYOUT_MAX_WIDTH = 1024;

const isNarrowViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < NARROW_LAYOUT_MAX_WIDTH;

export function PosUnifiedPage() {
  const navigate = useNavigate();
  const [posTab, setPosTab] = React.useState<PosDesktopTab>('tables');
  const workspace = usePosWorkspace({
    onViewChange: (event) => {
      if (event === 'draft-started') {
        setPosTab('menu');
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
  const { canCreateOrder, canUpdateOrder, canSplitKitchen, canTableAction, canCheckout } =
    permissions;
  const { activeBadgeCount, activeTotal, activeLabel } = summary;

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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2.5 sm:px-4 py-2 sm:py-2.5 shrink-0">
            <TabsList className="grid flex-1 min-w-[180px] grid-cols-3 lg:grid-cols-2">
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
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="pos-enter-touch-mode-btn"
                onClick={handleEnterTouchMode}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Hand className="h-3.5 w-3.5 text-accent-text" />
                <span className="hidden sm:inline">Chế độ cảm ứng</span>
              </Button>
              <AuditHistoryButton module="POS" label="Lịch sử" className="shrink-0" />
            </div>
          </div>

          <TabsContent value="tables" className="mt-0 flex-1 min-h-0 h-full overflow-hidden flex flex-col data-[state=inactive]:hidden">
            <TableGridPanel
              tables={gridData?.tables ?? []}
              takeaways={gridData?.takeaways ?? []}
              takeawayQrToken={gridData?.takeawayQrToken}
              selectedOrderId={selectedOrderId}
              draftTarget={draftTarget}
              addonBadgesByOrderId={addonBadgesByOrderId}
              onSelectTable={actions.selectTable}
              onSelectTakeawayOrder={actions.selectTakeawayOrder}
              onStartNewTakeaway={actions.startNewTakeaway}
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
          order={currentOrder}
          draftTarget={draftTarget}
          draftItems={draftItems}
          canCreate={canCreateOrder}
          canUpdate={canUpdateOrder}
          canSplitKitchen={canSplitKitchen}
          canTableAction={canTableAction}
          canCheckout={canCheckout}
          isSplitPending={pending.isSplitPending}
          isProvisionalPending={pending.isProvisionalPending}
          isApprovingQr={pending.isApprovingQr}
          isSubmittingDraft={pending.isSubmittingDraft}
          isCancellingOrder={pending.isCancellingOrder}
          isReprintPending={pending.isReprintPending}
          isDiscountPending={pending.isDiscountPending}
          pendingAlert={selectedPendingAlert}
          onUpdateDraftQty={actions.updateDraftQty}
          onRemoveDraftItem={actions.removeDraftItem}
          onSubmitDraftOrder={actions.submitDraftOrder}
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

      <PosWorkspaceDialogs workspace={workspace} />
    </div>
  );
}
