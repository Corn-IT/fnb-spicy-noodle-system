import { type DashboardOverviewResponse } from '@fnb/shared';
import { ArrowRight, ChefHat, Flame, Layers, ShoppingBag, Utensils } from 'lucide-react';
import * as React from 'react';
import { useTouchAwareNavigate } from '@/components/touch-shell';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

import { formatDashboardTimeVi } from '../api/dashboard.api';

interface DashboardOperationsRowProps {
  data: DashboardOverviewResponse;
}

const STATION_STYLE: Record<string, { accentBar: string; pillBg: string }> = {
  BEP_NAU: {
    accentBar: 'bg-rose-500',
    pillBg: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
  BEP_CHIEN: {
    accentBar: 'bg-amber-500',
    pillBg: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
  },
  PHA_CHE: {
    accentBar: 'bg-sky-500',
    pillBg: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  },
};

const DEFAULT_STATION_STYLE = {
  accentBar: 'bg-primary',
  pillBg: 'bg-primary/12 text-accent-text',
};

export function DashboardOperationsRow({ data }: DashboardOperationsRowProps) {
  const navigate = useTouchAwareNavigate();
  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);

  const liveTables = data.liveTables;
  const kitchen = data.kitchenStations;
  const canViewProfit = data.meta.scope.canViewProfit;

  const selectedEntity = React.useMemo(() => {
    if (!liveTables || selectedOrderId === null) return null;
    const fromTable = liveTables.tables.find((t) => t.activeOrder?.orderId === selectedOrderId);
    if (fromTable?.activeOrder) {
      return {
        label: fromTable.name,
        order: fromTable.activeOrder,
      };
    }
    const fromTakeaway = liveTables.takeaways.find((tk) => tk.orderId === selectedOrderId);
    if (fromTakeaway) {
      return {
        label: fromTakeaway.tableLabel,
        order: fromTakeaway,
      };
    }
    return null;
  }, [liveTables, selectedOrderId]);

  const maxSpiceCount = React.useMemo(() => {
    if (!kitchen) return 1;
    return Math.max(1, ...kitchen.spiceLevels.map((s) => s.count));
  }, [kitchen]);

  const topSpice = React.useMemo(() => {
    if (!kitchen || kitchen.spiceLevels.every((s) => s.count === 0)) return null;
    return [...kitchen.spiceLevels].sort((a, b) => b.count - a.count)[0] ?? null;
  }, [kitchen]);

  return (
    <section
      aria-label="Sơ đồ bàn trực tiếp và Điều phối 3 khu vực bếp"
      className="grid grid-cols-1 gap-4 xl:grid-cols-12"
    >
      {/* Left 7 cols: Live Floor Plan (30 Tables + Takeaway Strip) */}
      <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-accent-text">
              <Utensils className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Sơ đồ Bàn Realtime ({liveTables?.tables.length ?? 0} bàn + Mang về)
              </h2>
              <p className="text-xs text-muted-foreground">
                Bấm vào bàn đang mở hoặc đơn Mang về để xem nhanh chi tiết đơn
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Trống: {data.kpis.openOrders?.availableTableCount ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 font-medium text-sky-700 dark:text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Có khách: {data.kpis.openOrders?.occupiedTableCount ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Chờ QR: {data.kpis.openOrders?.pendingTableCount ?? 0}
            </span>
          </div>
        </div>

        {!liveTables ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-6 text-xs text-muted-foreground">
            Tài khoản không có quyền POS để xem sơ đồ bàn trực tiếp.
          </div>
        ) : (
          <>
            {/* Physical Dining Tables Grid */}
            <div
              className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6"
              data-testid="dashboard-live-tables-grid"
            >
              {liveTables.tables.map((table) => {
                const order = table.activeOrder;
                const isSelected = Boolean(order && order.orderId === selectedOrderId);
                const isPending = table.status === 'PENDING';
                const isOccupied = table.status === 'OCCUPIED';

                return (
                  <button
                    key={table.id}
                    type="button"
                    disabled={!order}
                    onClick={() =>
                      order &&
                      setSelectedOrderId((prev) => (prev === order.orderId ? null : order.orderId))
                    }
                    className={cn(
                      'relative flex min-h-[58px] flex-col justify-between rounded-lg border p-2 text-left transition-all',
                      !order && 'cursor-default border-border/60 bg-muted/20 text-muted-foreground',
                      isOccupied &&
                        'border-sky-300 bg-sky-50/70 hover:border-sky-500 dark:border-sky-800/80 dark:bg-sky-950/35',
                      isPending &&
                        'border-amber-400 bg-amber-50/80 hover:border-amber-500 dark:border-amber-700 dark:bg-amber-950/40',
                      isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[11px] font-semibold text-foreground">
                        {table.name}
                      </span>
                      {order?.hasUnprintedAddon ? (
                        <span
                          className="rounded-full bg-rose-500 px-1.5 text-[9px] font-bold text-white"
                          title="Có món gọi thêm chưa tách bếp"
                        >
                          Mới
                        </span>
                      ) : null}
                    </div>
                    {order ? (
                      <div className="mt-1 flex items-center justify-between gap-1 text-[10px]">
                        <span className="font-bold text-price">{formatVnd(order.totalAmount)}</span>
                        {isPending ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-300">QR</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/80">Trống</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Takeaway Strip (Hard Invariant 2: tableId = null) */}
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <ShoppingBag className="h-3.5 w-3.5 text-orange-500" />
                  Đơn Mang về (MV-# · Tách riêng bàn vật lý)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {liveTables.takeaways.length} đơn đang mở
                </span>
              </div>
              {liveTables.takeaways.length === 0 ? (
                <p className="text-xs text-muted-foreground">Hiện không có đơn Mang về đang mở.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {liveTables.takeaways.map((tk) => {
                    const isSelected = tk.orderId === selectedOrderId;
                    return (
                      <button
                        key={tk.orderId}
                        type="button"
                        onClick={() =>
                          setSelectedOrderId((prev) => (prev === tk.orderId ? null : tk.orderId))
                        }
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all',
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : 'border-orange-300/80 bg-orange-50/70 hover:border-orange-400 dark:border-orange-800/70 dark:bg-orange-950/30',
                        )}
                      >
                        <span className="font-semibold text-foreground">{tk.tableLabel}</span>
                        <span className="font-bold text-price">{formatVnd(tk.totalAmount)}</span>
                        {tk.hasUnprintedAddon ? (
                          <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                            Chờ in
                          </Badge>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Interactive Order Inspector */}
            {selectedEntity ? (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
                data-testid="dashboard-table-inspector"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{selectedEntity.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedEntity.order.orderCode}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedEntity.order.status}
                    </Badge>
                    {selectedEntity.order.pendingQrKind ? (
                      <Badge variant="info" className="text-[10px]">
                        QR: {selectedEntity.order.pendingQrKind}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Mở lúc {formatDashboardTimeVi(selectedEntity.order.createdAt)} · Tạm tính{' '}
                    <strong className="text-foreground">
                      {formatVnd(selectedEntity.order.totalAmount)}
                    </strong>
                    {selectedEntity.order.hasUnprintedAddon ? ' · Có món chưa tách bếp' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => navigate('/pos')}
                >
                  Vào POS xử lý <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Right 5 cols: 3 Kitchen Stations Load (Invariant 3) + Spice Level Distribution */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-5">
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-300">
                <ChefHat className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Điều phối 3 Khu vực Bếp (In Bếp)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Phân rã Combo về đúng trạm Nấu / Chiên / Pha chế
                </p>
              </div>
            </div>
            {kitchen && kitchen.comboDecomposedCount > 0 ? (
              <Badge variant="info" className="text-[10px]">
                <Layers className="mr-1 h-3 w-3" />
                Đã rã {kitchen.comboDecomposedCount} Combo
              </Badge>
            ) : null}
          </div>

          {!kitchen ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              Không có dữ liệu phân tải bếp.
            </p>
          ) : (
            <div className="space-y-2.5" data-testid="dashboard-kitchen-stations">
              {kitchen.stations.map((st) => {
                const style = STATION_STYLE[st.station] ?? DEFAULT_STATION_STYLE;
                return (
                  <div
                    key={st.station}
                    className="rounded-lg border border-border/80 bg-muted/20 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', style.pillBg)}>
                          {st.label}
                        </span>
                        <span className="font-semibold text-foreground">{st.printedQty} phần đã in</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        {st.pendingQty > 0 ? (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            {st.pendingQty} chờ in
                          </Badge>
                        ) : null}
                        {st.cancelledQty > 0 ? (
                          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                            {st.cancelledQty} huỷ
                          </Badge>
                        ) : null}
                        {canViewProfit ? (
                          <span className="font-semibold text-foreground">{formatVnd(st.revenue)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all', style.accentBar)}
                        style={{ width: `${Math.min(100, st.sharePercent)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Spice Level Distribution 0-7 */}
        {kitchen ? (
          <div className="border-t border-border pt-3">
            <div className="mb-2.5 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Flame className="h-3.5 w-3.5 text-rose-500" />
                Phân bổ Cấp độ Cay Mì (Cấp 0 – 7)
              </span>
              {topSpice ? (
                <span className="text-[11px] font-medium text-muted-foreground">
                  Phổ biến nhất: <strong className="text-foreground">{topSpice.label}</strong> (
                  {topSpice.count})
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-8 items-end gap-1.5 pt-2" data-testid="dashboard-spice-levels">
              {kitchen.spiceLevels.map((lvl) => {
                const heightPct = lvl.count > 0 ? Math.max(18, (lvl.count / maxSpiceCount) * 100) : 6;
                const isHot = lvl.level >= 4;
                return (
                  <div
                    key={lvl.level}
                    className="flex flex-col items-center gap-1"
                    title={`${lvl.label}: ${lvl.count} tô`}
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {lvl.count > 0 ? lvl.count : ''}
                    </span>
                    <div className="flex h-12 w-full items-end justify-center rounded bg-muted/40 p-0.5">
                      <div
                        className={cn(
                          'w-full rounded-xs transition-all',
                          lvl.count === 0
                            ? 'bg-border/60'
                            : isHot
                              ? 'bg-rose-500'
                              : 'bg-orange-400',
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">C{lvl.level}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
