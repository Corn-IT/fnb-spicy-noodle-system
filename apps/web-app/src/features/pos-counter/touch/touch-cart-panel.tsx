import type { OrderDetailResponse } from '@fnb/shared';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle,
  ChefHat,
  CreditCard,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  QrCode,
  ShoppingBag,
  Split,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { CancelOrderConfirmDialog } from '../components/cancel-order-confirm-dialog';
import type { PosMenuSelectedItem } from '../components/pos-menu-types';
import type { PosWorkspace } from '../hooks/use-pos-workspace';
import { TouchActionSheet, type TouchSheetAction } from './touch-action-sheet';
import { TouchConfirmDialog, useTouchConfirm } from './touch-confirm-dialog';
import { SHORT_SCREEN_QUERY, useMediaQuery } from './use-media-query';

type OrderItem = OrderDetailResponse['items'][number];

const formatMoney = (amount: number) => `${amount.toLocaleString('vi-VN')} đ`;

export interface TouchCartPanelProps {
  workspace: PosWorkspace;
}

/** Cột giỏ hàng / hoá đơn bên phải màn đặt món cảm ứng. */
export function TouchCartPanel({ workspace }: TouchCartPanelProps) {
  const confirm = useTouchConfirm();
  const { currentOrder } = workspace;

  return (
    <aside
      data-testid="touch-cart-panel"
      className="flex w-[320px] shrink-0 flex-col border-l bg-card min-[1100px]:w-[360px] xl:w-[400px]"
    >
      {currentOrder ? (
        <LiveOrderCart workspace={workspace} order={currentOrder} askConfirm={confirm.ask} />
      ) : (
        <DraftCart workspace={workspace} askConfirm={confirm.ask} />
      )}
      <TouchConfirmDialog request={confirm.request} onClose={confirm.close} />
    </aside>
  );
}

type AskConfirm = ReturnType<typeof useTouchConfirm>['ask'];

function DraftCart({ workspace, askConfirm }: { workspace: PosWorkspace; askConfirm: AskConfirm }) {
  const { draftItems, draftTarget, permissions, pending, actions } = workspace;
  const isShortScreen = useMediaQuery(SHORT_SCREEN_QUERY);
  const total = draftItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {draftItems.length === 0 ? (
          <EmptyCart
            title="Chưa chọn món"
            hint={
              draftTarget
                ? 'Chạm vào món bên trái để thêm vào đơn mới.'
                : 'Quay lại sơ đồ bàn để chọn bàn.'
            }
          />
        ) : (
          draftItems.map((item, index) => (
            <DraftItemRow
              key={`${item.productId}-${index}`}
              item={item}
              index={index}
              onDecrease={() => actions.updateDraftQty(index, -1)}
              onIncrease={() => actions.updateDraftQty(index, 1)}
              onRemove={() =>
                askConfirm({
                  title: 'Bỏ món khỏi đơn?',
                  description: `${item.quantity} x ${item.name}`,
                  confirmLabel: 'Bỏ món',
                  tone: 'destructive',
                  onConfirm: () => actions.removeDraftItem(index),
                })
              }
            />
          ))
        )}
      </div>
      <div className="shrink-0 space-y-3 border-t p-3">
        <TotalRow amount={total} />
        <Button
          type="button"
          data-testid="touch-submit-draft"
          disabled={
            !permissions.canCreateOrder || draftItems.length === 0 || pending.isSubmittingDraft
          }
          onClick={() => void actions.submitDraftOrder()}
          className={cn(
            'w-full bg-emerald-600 font-extrabold text-white hover:bg-emerald-700',
            isShortScreen ? 'h-12 text-base' : 'h-16 text-lg',
          )}
        >
          {pending.isSubmittingDraft ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle className="h-5 w-5" />
          )}
          Xác nhận tạo đơn
        </Button>
      </div>
    </>
  );
}

function DraftItemRow({
  item,
  index,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: PosMenuSelectedItem;
  index: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-testid={`touch-draft-item-${index}`}
      className="space-y-2 rounded-xl border bg-background p-2.5"
    >
      <ItemText
        name={item.name}
        modifiers={item.modifierLabels}
        note={item.itemNote ?? null}
        lineTotal={item.unitPrice * item.quantity}
      />
      <div className="flex items-center justify-between gap-2">
        <QuantityStepper
          name={item.name}
          quantity={item.quantity}
          canDecrease={item.quantity > 1}
          onDecrease={onDecrease}
          onIncrease={onIncrease}
        />
        <RemoveButton label={`Bỏ món ${item.name}`} onClick={onRemove} />
      </div>
    </div>
  );
}

function LiveOrderCart({
  workspace,
  order,
  askConfirm,
}: {
  workspace: PosWorkspace;
  order: OrderDetailResponse;
  askConfirm: AskConfirm;
}) {
  const { permissions, pending, actions, dialogs, selectedPendingAlert } = workspace;
  const { canUpdateOrder, canSplitKitchen, canTableAction, canCheckout } = permissions;
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  // Màn thấp: gom Đổi/Gộp bàn và Giảm giá vào "Thêm…" để danh sách món còn đủ chỗ hiển thị.
  const isShortScreen = useMediaQuery(SHORT_SCREEN_QUERY);

  const isOrderActive = order.status === 'PENDING' || order.status === 'SERVING';
  const isServing = order.status === 'SERVING';
  const activeItems = order.items.filter((item) => item.kitchenStatus !== 'CANCELLED');
  const isAllCancelled = order.items.length > 0 && activeItems.length === 0;
  const newItemCount = order.items
    .filter((item) => item.kitchenStatus === 'NEW')
    .reduce((sum, item) => sum + item.quantity, 0);
  const hasPrintedItems = order.items.some((item) => item.kitchenStatus === 'PRINTED');
  const hasDiscount = Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0;
  const discountAmount = order.discountAmount ?? 0;
  const subtotalAmount = order.subtotalAmount ?? order.totalAmount + discountAmount;
  const discountLabel =
    order.discountSnapshot?.kind === 'CODE'
      ? (order.discountSnapshot.code ?? order.discountSnapshot.name)
      : (order.discountSnapshot?.name ?? 'Giảm tay');
  const canUseDiscount = canCheckout && isServing && order.items.length > 0;
  const cancelOrderLabel =
    order.orderType === 'TAKEAWAY' ? 'Huỷ đơn mang về' : 'Huỷ đơn & giải phóng bàn';

  const batches = React.useMemo(() => {
    const map = new Map<number, OrderItem[]>();
    for (const item of order.items) {
      const list = map.get(item.batchNo) ?? [];
      list.push(item);
      map.set(item.batchNo, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [order.items]);

  const tableActionDisabled =
    !canTableAction || !isOrderActive || order.orderType === 'TAKEAWAY';
  const discountDisabled = !canUseDiscount || pending.isDiscountPending;

  const moreActions: TouchSheetAction[] = [
    ...(isShortScreen
      ? [
          {
            key: 'table-action',
            label: 'Đổi / Gộp / Hoán đổi bàn',
            hint: order.orderType === 'TAKEAWAY' ? 'Không áp dụng cho đơn mang về' : undefined,
            icon: ArrowLeftRight,
            disabled: tableActionDisabled,
            onSelect: () => dialogs.setTableActionOpen(true),
          },
          {
            key: 'discount',
            label: hasDiscount ? 'Đổi ưu đãi' : 'Áp dụng giảm giá',
            icon: Tag,
            disabled: discountDisabled,
            onSelect: () => dialogs.setDiscountDialogOpen(true),
          },
        ]
      : []),
    ...(canUseDiscount && hasDiscount
      ? [
          {
            key: 'remove-discount',
            label: 'Gỡ giảm giá',
            hint: `${discountLabel}: -${formatMoney(discountAmount)}`,
            icon: X,
            disabled: pending.isDiscountPending,
            onSelect: () => void actions.removeDiscount(),
          },
        ]
      : []),
    {
      key: 'split-provisional',
      label: 'Tạm tính tách món',
      hint: hasDiscount ? 'Không tách được khi đơn đang giảm giá' : 'Chọn từng món để in tạm tính',
      icon: Split,
      disabled: !isServing || hasDiscount,
      onSelect: () => dialogs.setSplitDialogMode('PROVISIONAL'),
    },
    ...(canCheckout
      ? [
          {
            key: 'split-checkout',
            label: 'Thanh toán tách món',
            hint: hasDiscount
              ? 'Không tách được khi đơn đang giảm giá'
              : 'Khách trả riêng một phần món',
            icon: Split,
            tone: 'success' as const,
            disabled: !isServing || hasDiscount,
            onSelect: () => dialogs.setSplitDialogMode('CHECKOUT'),
          },
        ]
      : []),
    ...(canSplitKitchen && hasPrintedItems
      ? [
          {
            key: 'reprint-kitchen',
            label: 'In lại toàn bộ phiếu bếp',
            icon: Printer,
            disabled: pending.isReprintPending,
            onSelect: () => void actions.reprintKitchen(),
          },
        ]
      : []),
    ...(canUpdateOrder && isOrderActive
      ? [
          {
            key: 'cancel-order',
            label: cancelOrderLabel,
            hint: 'Cần nhập lý do huỷ',
            icon: Trash2,
            tone: 'destructive' as const,
            disabled: pending.isCancellingOrder,
            onSelect: () => setCancelOpen(true),
          },
        ]
      : []),
  ];

  const confirmRemoveItem = (item: OrderItem) => {
    const isPrinted = item.kitchenStatus === 'PRINTED';
    askConfirm({
      title: isPrinted ? 'Huỷ món đã gửi bếp?' : 'Xoá món khỏi đơn?',
      description: isPrinted
        ? `${item.quantity} x ${item.name} — máy sẽ in phiếu báo huỷ xuống bếp.`
        : `${item.quantity} x ${item.name}`,
      confirmLabel: isPrinted ? 'Huỷ món' : 'Xoá món',
      tone: 'destructive',
      onConfirm: () => void actions.removeOrCancelOrderItem(item.id),
    });
  };

  return (
    <>
      {canUpdateOrder && order.status === 'PENDING' && order.orderSource === 'QR_CODE' ? (
        <div className="shrink-0 border-b p-3">
          <Button
            type="button"
            data-testid="touch-approve-qr"
            disabled={pending.isApprovingQr}
            onClick={() => void actions.approveQrOrder()}
            className="h-14 w-full bg-amber-500 text-base font-extrabold text-white hover:bg-amber-600"
          >
            <CheckCircle className="h-5 w-5" />
            Duyệt đơn QR
          </Button>
        </div>
      ) : null}

      {selectedPendingAlert?.isOverdue ? (
        <div
          role="alert"
          className="mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-xl border border-red-600 bg-red-600/15 p-3 text-sm font-bold text-red-900 dark:text-red-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-red-600" />
          <span>
            {selectedPendingAlert.kind === 'ADDON'
              ? `Món gọi thêm QR đã chờ ${selectedPendingAlert.elapsedMinutes} phút chưa gửi bếp.`
              : `Đơn QR mới đã chờ ${selectedPendingAlert.elapsedMinutes} phút chưa duyệt.`}
          </span>
        </div>
      ) : null}

      {order.note ? (
        <div className="mx-3 mt-3 shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          {order.note}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        {order.items.length === 0 ? (
          <EmptyCart title="Đơn chưa có món nào" hint="Chạm vào món bên trái để thêm." />
        ) : (
          batches.map(([batchNo, items]) => {
            const hasPrintedInBatch = items.some((item) => item.kitchenStatus === 'PRINTED');
            return (
              <section key={batchNo} className="space-y-2">
                <header className="flex min-h-10 items-center justify-between rounded-lg bg-muted px-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  <span>{batchNo === 1 ? 'Lượt 1' : `Gọi thêm - Lượt ${batchNo}`}</span>
                  {canSplitKitchen && hasPrintedInBatch ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`touch-reprint-batch-${batchNo}`}
                      disabled={pending.isReprintPending}
                      onClick={() => void actions.reprintKitchen(batchNo)}
                      className="gap-1 text-amber-700 dark:text-amber-400"
                    >
                      <Printer className="h-4 w-4" />
                      In lại
                    </Button>
                  ) : null}
                </header>
                {items.map((item) => (
                  <LiveItemRow
                    key={item.id}
                    item={item}
                    canEdit={canUpdateOrder && isOrderActive}
                    onChangeQuantity={(quantity) =>
                      void actions.updateOrderItemQuantity(item.id, quantity)
                    }
                    onRemove={() => confirmRemoveItem(item)}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>

      <div className={cn('shrink-0 border-t', isShortScreen ? 'space-y-2 p-2.5' : 'space-y-2.5 p-3')}>
        {hasDiscount ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Tạm tính</span>
              <span className="font-semibold tabular-nums">{formatMoney(subtotalAmount)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span className="truncate pr-2">Giảm giá ({discountLabel})</span>
              <span className="font-bold tabular-nums">-{formatMoney(discountAmount)}</span>
            </div>
          </div>
        ) : null}
        {order.discountWarning ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            {order.discountWarning === 'MIN_ORDER_NOT_MET'
              ? 'Chưa đạt đơn tối thiểu nên mức giảm hiện tại tạm về 0 đ.'
              : 'Không có món thuộc phạm vi ưu đãi nên mức giảm tạm về 0 đ.'}
          </p>
        ) : null}
        <TotalRow amount={order.totalAmount} />

        {order.items.length === 0 || isAllCancelled ? (
          canUpdateOrder && isOrderActive ? (
            <Button
              type="button"
              data-testid="touch-void-order"
              disabled={pending.isCancellingOrder}
              onClick={() =>
                askConfirm({
                  title: `${cancelOrderLabel}?`,
                  description: isAllCancelled
                    ? 'Tất cả món trong đơn đã bị huỷ.'
                    : 'Đơn chưa có món nào.',
                  confirmLabel: 'Huỷ đơn',
                  tone: 'destructive',
                  onConfirm: () =>
                    void actions.cancelOrder(
                      isAllCancelled
                        ? undefined
                        : order.orderType === 'TAKEAWAY'
                          ? 'Thu ngân huỷ đơn mang về rỗng'
                          : 'Thu ngân huỷ đơn bàn rỗng',
                    ),
                })
              }
              className="h-14 w-full bg-rose-600 text-base font-bold text-white hover:bg-rose-700"
            >
              <Trash2 className="h-5 w-5" />
              {cancelOrderLabel}
            </Button>
          ) : null
        ) : (
          <div className="space-y-2">
            <div
              className={cn(
                'grid',
                isShortScreen
                  ? 'grid-cols-[minmax(0,1.45fr)_minmax(0,1.1fr)_minmax(0,0.8fr)] gap-1.5'
                  : 'grid-cols-2 gap-2',
              )}
            >
              {canSplitKitchen ? (
                <Button
                  type="button"
                  data-testid="touch-split-kitchen"
                  disabled={pending.isSplitPending || newItemCount === 0 || !isOrderActive}
                  onClick={() => void actions.splitKitchen()}
                  className={cn(
                    'bg-amber-600 font-bold text-white hover:bg-amber-700 disabled:bg-muted disabled:text-muted-foreground',
                    isShortScreen ? 'h-12 gap-1 px-1 text-sm' : 'h-14 text-base',
                  )}
                >
                  {pending.isSplitPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ChefHat className="h-5 w-5" />
                  )}
                  Gửi bếp{newItemCount > 0 ? ` (${newItemCount})` : ''}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                data-testid="touch-provisional-bill"
                disabled={pending.isProvisionalPending || !isServing}
                onClick={() => void actions.printProvisionalBill()}
                className={cn(
                  'font-bold',
                  isShortScreen ? 'h-12 gap-1 px-1 text-sm' : 'h-14 text-base',
                  !canSplitKitchen && !isShortScreen && 'col-span-2',
                )}
              >
                {pending.isProvisionalPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <QrCode className="h-5 w-5" />
                )}
                Tạm tính
              </Button>
              {isShortScreen ? (
                <MoreButton disabled={moreActions.length === 0} compact onClick={() => setMoreOpen(true)} />
              ) : null}
            </div>
            {isShortScreen ? null : (
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="touch-table-action"
                  disabled={tableActionDisabled}
                  onClick={() => dialogs.setTableActionOpen(true)}
                  className="h-14 flex-col gap-0.5 px-1 text-xs font-bold"
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  Đổi/Gộp bàn
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="touch-open-discount"
                  disabled={discountDisabled}
                  onClick={() => dialogs.setDiscountDialogOpen(true)}
                  className="h-14 flex-col gap-0.5 px-1 text-xs font-bold"
                >
                  <Tag className="h-5 w-5" />
                  {hasDiscount ? 'Đổi ưu đãi' : 'Giảm giá'}
                </Button>
                <MoreButton disabled={moreActions.length === 0} onClick={() => setMoreOpen(true)} />
              </div>
            )}
            {canCheckout ? (
              <Button
                type="button"
                data-testid="touch-checkout"
                disabled={!isServing}
                onClick={() => dialogs.setCheckoutOpen(true)}
                className={cn(
                  'w-full justify-between bg-emerald-600 px-5 font-extrabold text-white hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground',
                  isShortScreen ? 'h-12 text-base' : 'h-16 text-lg',
                )}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-6 w-6" />
                  Thanh toán
                </span>
                <span className="tabular-nums">{formatMoney(order.totalAmount)}</span>
              </Button>
            ) : null}
            {order.status === 'PENDING' ? (
              <p className="text-center text-xs font-medium text-muted-foreground">
                Gửi bếp hoặc duyệt đơn QR để mở Tạm tính và Thanh toán.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <TouchActionSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title="Thao tác khác"
        description={order.tableLabel ?? order.orderCode}
        actions={moreActions}
        testId="touch-more-sheet"
      />

      <CancelOrderConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        order={order}
        isPending={pending.isCancellingOrder}
        onConfirm={async (reason) => {
          await actions.cancelOrder(reason);
          setCancelOpen(false);
        }}
      />
    </>
  );
}

function MoreButton({
  disabled,
  compact = false,
  onClick,
}: {
  disabled: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      data-testid="touch-more-actions"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex-col gap-0.5 px-1 text-xs font-bold',
        compact ? 'h-12' : 'h-14',
      )}
    >
      <MoreHorizontal className="h-5 w-5" />
      Thêm…
    </Button>
  );
}

function LiveItemRow({
  item,
  canEdit,
  onChangeQuantity,
  onRemove,
}: {
  item: OrderItem;
  canEdit: boolean;
  onChangeQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const isCancelled = item.kitchenStatus === 'CANCELLED';
  const isNew = item.kitchenStatus === 'NEW';

  return (
    <div
      data-testid={`touch-order-item-${item.id}`}
      className={cn(
        'space-y-2 rounded-xl border bg-background p-2.5',
        isCancelled && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn('min-w-0 flex-1', isCancelled && 'line-through')}>
          <ItemText
            name={`${item.quantity} x ${item.name}`}
            modifiers={item.modifiers}
            note={item.itemNote}
            lineTotal={item.lineTotal}
          />
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-xs font-bold',
            isNew && 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
            item.kitchenStatus === 'PRINTED' &&
              'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
            isCancelled && 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200',
          )}
        >
          {isNew ? 'Mới' : isCancelled ? 'Đã huỷ' : 'Đã in bếp'}
        </span>
      </div>
      {canEdit && !isCancelled ? (
        <div className="flex items-center justify-between gap-2">
          {isNew ? (
            <QuantityStepper
              name={item.name}
              quantity={item.quantity}
              canDecrease={item.quantity > 1}
              onDecrease={() => onChangeQuantity(item.quantity - 1)}
              onIncrease={() => onChangeQuantity(item.quantity + 1)}
            />
          ) : (
            <span />
          )}
          {isNew ? (
            <RemoveButton label={`Xoá món ${item.name}`} onClick={onRemove} />
          ) : (
            <Button
              type="button"
              variant="outline"
              data-testid={`touch-cancel-printed-${item.id}`}
              onClick={onRemove}
              className="border-rose-500 font-semibold text-rose-600 dark:text-rose-300"
            >
              Huỷ món bếp
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ItemText({
  name,
  modifiers,
  note,
  lineTotal,
}: {
  name: string;
  modifiers: string[];
  note: string | null;
  lineTotal: number;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-base font-bold leading-snug">{name}</p>
      {modifiers.length > 0 ? (
        <p className="text-sm text-muted-foreground">{modifiers.join(', ')}</p>
      ) : null}
      {note ? (
        <p className="text-sm font-medium italic text-amber-700 dark:text-amber-300">
          Ghi chú: {note}
        </p>
      ) : null}
      <p className="text-sm font-bold text-price tabular-nums">{formatMoney(lineTotal)}</p>
    </div>
  );
}

function QuantityStepper({
  name,
  quantity,
  canDecrease,
  onDecrease,
  onIncrease,
}: {
  name: string;
  quantity: number;
  canDecrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Giảm số lượng ${name}`}
        disabled={!canDecrease}
        onClick={onDecrease}
        className="h-11 w-11"
      >
        <Minus className="h-5 w-5" />
      </Button>
      <span className="w-9 text-center text-lg font-extrabold tabular-nums">{quantity}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Tăng số lượng ${name}`}
        onClick={onIncrease}
        className="h-11 w-11"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className="h-11 w-11 text-rose-600 dark:text-rose-400"
    >
      <Trash2 className="h-5 w-5" />
    </Button>
  );
}

function TotalRow({ amount }: { amount: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-base font-semibold text-muted-foreground">Tổng cộng</span>
      <span
        data-testid="touch-cart-total"
        className="text-2xl font-extrabold text-price tabular-nums"
      >
        {formatMoney(amount)}
      </span>
    </div>
  );
}

function EmptyCart({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
      <ShoppingBag className="mb-2 h-10 w-10 opacity-40" />
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm">{hint}</p>
    </div>
  );
}
