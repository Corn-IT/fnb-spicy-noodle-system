import type { PosWorkspace } from '../hooks/use-pos-workspace';
import { CheckoutConfirmDialog } from './checkout-confirm-dialog';
import { PosDiscountDialog } from './pos-discount-dialog';
import { ProductOptionsDialog } from './product-options-dialog';
import { SplitOrderItemsDialog } from './split-order-items-dialog';
import { TableActionDialog } from './table-action-dialog';

export interface PosWorkspaceDialogsProps {
  workspace: PosWorkspace;
}

/** Bộ dialog nghiệp vụ dùng chung (đổi/gộp bàn, thanh toán, giảm giá, tách đơn, chỉnh sửa món) của quầy POS. */
export function PosWorkspaceDialogs({ workspace }: PosWorkspaceDialogsProps) {
  const { currentOrder, gridData, dialogs, pending, actions } = workspace;

  return (
    <>
      <ProductOptionsDialog
        product={dialogs.editingItemTarget?.product ?? null}
        mode="edit"
        editInstanceKey={dialogs.editingItemTarget?.editInstanceKey}
        initialValue={dialogs.editingItemTarget?.initialValue}
        isSubmitting={
          dialogs.editingItemTarget?.kind === 'order' ? pending.isPatchingItems : false
        }
        onClose={() => dialogs.setEditingItemTarget(null)}
        onConfirm={actions.confirmEditItem}
      />

      <TableActionDialog
        open={dialogs.tableActionOpen}
        onOpenChange={dialogs.setTableActionOpen}
        order={currentOrder}
        tables={gridData?.tables ?? []}
        isSubmitting={pending.isTableActionPending}
        onConfirm={actions.confirmTableAction}
      />

      <CheckoutConfirmDialog
        open={dialogs.checkoutOpen}
        onOpenChange={dialogs.setCheckoutOpen}
        order={currentOrder}
        isSubmitting={pending.isCheckoutPending}
        onConfirmCheckout={actions.confirmCheckout}
      />

      <PosDiscountDialog
        open={dialogs.discountDialogOpen}
        onOpenChange={dialogs.setDiscountDialogOpen}
        order={currentOrder}
        isSubmitting={pending.isApplyingDiscount}
        onApplyDiscount={actions.applyDiscount}
      />

      {dialogs.splitDialogMode ? (
        <SplitOrderItemsDialog
          open={Boolean(dialogs.splitDialogMode)}
          onOpenChange={(open) => {
            if (!open) dialogs.setSplitDialogMode(null);
          }}
          mode={dialogs.splitDialogMode}
          order={currentOrder}
          isSubmitting={pending.isSplitDialogPending}
          onPrintSplitProvisional={actions.printSplitProvisional}
          onConfirmSplitCheckout={actions.confirmSplitCheckout}
        />
      ) : null}
    </>
  );
}
