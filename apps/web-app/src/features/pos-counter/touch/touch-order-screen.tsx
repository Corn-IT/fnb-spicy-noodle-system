import { ArrowLeft, Clock3 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import type { PosWorkspace } from '../hooks/use-pos-workspace';
import { formatClockTime, formatElapsedSince } from './elapsed-time';
import { TouchCartPanel } from './touch-cart-panel';
import type { ColumnChoice } from './touch-layout';
import { TouchMenuBoard } from './touch-menu-board';

export interface TouchOrderScreenProps {
  workspace: PosWorkspace;
  nowMs: number;
  onBack: () => void;
  trailing?: React.ReactNode;
  menuColumns?: ColumnChoice;
}

/** Màn đặt món cảm ứng: thực đơn bên trái, giỏ hàng / hoá đơn bên phải. */
export function TouchOrderScreen({
  workspace,
  nowMs,
  onBack,
  trailing,
  menuColumns = 'auto',
}: TouchOrderScreenProps) {
  const { currentOrder, draftItems, products, permissions, summary, actions } = workspace;

  const quantityByProductId = React.useMemo(() => {
    const map = new Map<number, number>();
    if (currentOrder) {
      for (const item of currentOrder.items) {
        if (item.kitchenStatus === 'CANCELLED') continue;
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      }
    } else {
      for (const item of draftItems) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [currentOrder, draftItems]);

  const canAddItems = currentOrder
    ? permissions.canUpdateOrder &&
      (currentOrder.status === 'PENDING' || currentOrder.status === 'SERVING')
    : permissions.canCreateOrder;

  const title = currentOrder?.tableLabel ?? summary.activeLabel;

  return (
    <div data-testid="touch-order-screen" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button
          type="button"
          variant="outline"
          data-testid="touch-back-to-tables"
          onClick={onBack}
          className="h-12 gap-2 px-4 text-base font-bold"
        >
          <ArrowLeft className="h-5 w-5" />
          Sơ đồ bàn
        </Button>
        <div className="min-w-0 flex-1">
          <h1 data-testid="touch-order-title" className="truncate text-xl font-extrabold leading-tight">
            {title}
          </h1>
          <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
            {currentOrder ? (
              <>
                <span className="font-mono font-semibold">{currentOrder.orderCode}</span>
                <span className="flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  Giờ vào {formatClockTime(currentOrder.createdAt)} ·{' '}
                  {formatElapsedSince(currentOrder.createdAt, nowMs)}
                </span>
              </>
            ) : (
              <span>Đơn mới — chọn món rồi bấm "Xác nhận tạo đơn"</span>
            )}
          </p>
        </div>
        {trailing}
      </header>

      <div className="flex min-h-0 flex-1">
        <TouchMenuBoard
          columns={menuColumns}
          products={products}
          canAddItems={canAddItems}
          quantityByProductId={quantityByProductId}
          onAddItem={(item) => void actions.addItemFromMenu(item)}
        />
        <TouchCartPanel workspace={workspace} />
      </div>
    </div>
  );
}

