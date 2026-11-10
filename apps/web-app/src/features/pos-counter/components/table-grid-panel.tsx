import { type PosOrderSummary, type PosTableGridResponse } from '@fnb/shared';
import { BellRing, Plus, ShoppingBag, Utensils } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export interface TableGridPanelProps {
  tables: PosTableGridResponse['tables'];
  takeaways: PosOrderSummary[];
  selectedOrderId: number | null;
  draftTarget: { orderType: 'DINE_IN'; tableId: number; tableName: string } | { orderType: 'TAKEAWAY' } | null;
  addonBadgesByOrderId: Record<number, number>;
  onSelectTable: (table: PosTableGridResponse['tables'][number]) => void;
  onSelectTakeawayOrder: (order: PosOrderSummary) => void;
  onStartNewTakeaway: () => void;
}

export function TableGridPanel({
  tables,
  takeaways,
  selectedOrderId,
  draftTarget,
  addonBadgesByOrderId,
  onSelectTable,
  onSelectTakeawayOrder,
  onStartNewTakeaway,
}: TableGridPanelProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 sm:gap-5 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-4 pb-28 sm:pb-6">
      <div>
        <div className="mb-2.5 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Utensils className="h-4 w-4" />
            Sơ đồ 30 Bàn Vật lý ({tables.length})
          </h2>
          <div className="flex items-center gap-2.5 sm:gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Trống
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" /> Chờ duyệt QR
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Đang ăn
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(98px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2 sm:gap-2.5">
          {tables.map((table) => {
            const isSelectedOrder =
              table.activeOrderId !== null && table.activeOrderId === selectedOrderId;
            const isDraftSelected =
              draftTarget?.orderType === 'DINE_IN' && draftTarget.tableId === table.id;
            const addonBatch =
              table.activeOrderId !== null ? addonBadgesByOrderId[table.activeOrderId] : undefined;

            return (
              <button
                key={table.id}
                type="button"
                data-testid={`table-card-${table.id}`}
                onClick={() => onSelectTable(table)}
                className={cn(
                  'relative flex min-h-[72px] sm:min-h-[80px] flex-col justify-between rounded-xl border-2 p-2.5 text-left transition-all active:scale-[0.98]',
                  table.status === 'AVAILABLE' &&
                    'border-emerald-600/70 bg-emerald-50/90 text-emerald-950 hover:bg-emerald-100/90 dark:border-emerald-500/70 dark:bg-emerald-950/45 dark:text-emerald-100 dark:hover:bg-emerald-900/50',
                  table.status === 'PENDING' &&
                    'animate-pulse border-amber-500 bg-amber-100/90 text-amber-950 hover:bg-amber-200/90 dark:border-amber-400 dark:bg-amber-950/65 dark:text-amber-100',
                  table.status === 'OCCUPIED' &&
                    'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 shadow-xs',
                  (isSelectedOrder || isDraftSelected) && 'ring-4 ring-primary/50',
                )}
              >
                <div className="flex w-full items-start justify-between gap-1">
                  <span className="text-xs sm:text-sm font-bold whitespace-nowrap leading-tight">{table.name}</span>
                  {table.status === 'PENDING' ? (
                    <BellRing className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  ) : null}
                </div>

                {addonBatch ? (
                  <Badge className="mt-1 bg-amber-500 text-[9px] sm:text-[10px] text-white px-1.5 py-0.5 justify-center shrink-0 whitespace-nowrap">
                    +Lượt {addonBatch}
                  </Badge>
                ) : null}

                <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs">
                  {table.status === 'AVAILABLE' ? (
                    <span className="font-medium opacity-80 whitespace-nowrap">Bàn trống</span>
                  ) : (
                    <span className="font-bold block tabular-nums whitespace-nowrap">
                      {(table.activeOrder?.totalAmount ?? 0).toLocaleString('vi-VN')} đ
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <ShoppingBag className="h-4 w-4" />
            Đơn Mang về Đang Phục vụ ({takeaways.length})
          </h3>
          <Button
            type="button"
            data-testid="create-takeaway-btn"
            onClick={onStartNewTakeaway}
            className="bg-rose-600 font-bold text-white hover:bg-rose-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>TẠO ĐƠN MANG VỀ</span>
          </Button>
        </div>

        {takeaways.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Chưa có đơn mang về nào đang mở. Bấm [TẠO ĐƠN MANG VỀ] để tạo đơn MV-# độc lập.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {takeaways.map((order) => {
              const isSelected = order.orderId === selectedOrderId;
              const label =
                order.tableLabel ??
                `Mang về #${String(order.takeawayNumber ?? 1).padStart(2, '0')}`;
              return (
                <button
                  key={order.orderId}
                  type="button"
                  data-testid={`takeaway-card-${order.orderId}`}
                  onClick={() => onSelectTakeawayOrder(order)}
                  className={cn(
                    'flex flex-col justify-between rounded-xl border-2 border-indigo-500/70 bg-indigo-500/10 p-3 text-left transition hover:bg-indigo-500/20',
                    isSelected && 'ring-4 ring-primary/50',
                  )}
                >
                  <span className="text-sm font-bold text-foreground whitespace-nowrap">{label}</span>
                  <span className="mt-1 text-xs text-muted-foreground truncate">{order.orderCode}</span>
                  <span className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-300 tabular-nums whitespace-nowrap">
                    {order.totalAmount.toLocaleString('vi-VN')} đ
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
