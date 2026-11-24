import type { PosOrderSummary, PosTableGridResponse } from '@fnb/shared';
import { BellRing, Clock3, Plus, ShoppingBag, Utensils } from 'lucide-react';
import * as React from 'react';

import {
  evaluateOrderPendingAlert,
  type OrderPendingAlertState,
} from '@/lib/qr-pending-reminder';
import { getActiveQrReminderConfig } from '@/lib/qr-voice-announcer';
import { cn } from '@/utils/cn';
import { formatElapsedSince } from './elapsed-time';
import { type ColumnChoice, useGridColumns } from './touch-layout';

type PosTable = PosTableGridResponse['tables'][number];

export interface TouchTableBoardProps {
  /** Số thẻ mỗi hàng ('auto' = theo bề ngang màn hình). */
  columns?: ColumnChoice;
  tables: PosTable[];
  takeaways: PosOrderSummary[];
  onlyOccupied: boolean;
  nowMs: number;
  canCreateOrder: boolean;
  addonBadgesByOrderId: Record<number, number>;
  onSelectTable: (table: PosTable) => void;
  onSelectTakeaway: (order: PosOrderSummary) => void;
  onStartNewTakeaway: () => void;
}

const formatMoney = (amount: number) => `${amount.toLocaleString('vi-VN')}`;

export const TAKEAWAY_SECTION_ID = 'touch-takeaway-section';

export function resolveTakeawayLabel(order: PosOrderSummary): string {
  return order.tableLabel ?? `Mang về #${String(order.takeawayNumber ?? 1).padStart(2, '0')}`;
}

function resolveAlertBadge(
  alert: OrderPendingAlertState,
  hasAddon: boolean,
  isPending: boolean,
  reminderDelayMinutes: number,
): string | null {
  if (alert.isOverdue) {
    const minutes = Math.max(reminderDelayMinutes, alert.elapsedMinutes);
    return alert.kind === 'ADDON' ? `Gọi thêm • Trễ ${minutes}p` : `QR quá ${minutes}p`;
  }
  if (isPending) return 'QR chờ duyệt';
  if (hasAddon) return 'Gọi thêm';
  return null;
}

/** Lưới thẻ dùng chung cho Phòng bàn và Mang về. Số cột tính theo bố cục đã chọn. */
const BOARD_GRID_CLASS = 'grid gap-3';

/** Sơ đồ bàn cảm ứng: Phòng bàn ở trên, Mang về ngay bên dưới trên cùng một màn. */
export function TouchTableBoard({
  columns = 'auto',
  tables,
  takeaways,
  onlyOccupied,
  nowMs,
  canCreateOrder,
  addonBadgesByOrderId,
  onSelectTable,
  onSelectTakeaway,
  onStartNewTakeaway,
}: TouchTableBoardProps) {
  const reminderConfig = getActiveQrReminderConfig();
  const grid = useGridColumns('tables', columns);

  const visibleTables = React.useMemo(
    () => (onlyOccupied ? tables.filter((table) => table.status !== 'AVAILABLE') : tables),
    [tables, onlyOccupied],
  );

  const takeawaySection = (
    <section
      id={TAKEAWAY_SECTION_ID}
      data-testid="touch-takeaway-board"
      aria-labelledby="touch-takeaway-heading"
      className="scroll-mt-2 space-y-3"
    >
      <SectionHeading
        id="touch-takeaway-heading"
        icon={<ShoppingBag className="h-5 w-5" />}
        title="Mang về"
        detail={`${takeaways.length} đơn đang phục vụ`}
      />
      <div className={BOARD_GRID_CLASS} style={grid.style}>
        {canCreateOrder ? (
          <button
            type="button"
            data-testid="touch-new-takeaway"
            onClick={onStartNewTakeaway}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 p-3 text-accent-text transition-transform active:scale-[0.97]"
          >
            <Plus className="h-10 w-10" />
            <span className="text-lg font-bold">Đơn mang về mới</span>
          </button>
        ) : null}
        {takeaways.map((order) => {
          const alert = evaluateOrderPendingAlert(
            order,
            order.status === 'PENDING' ? 'PENDING' : 'OCCUPIED',
            nowMs,
            reminderConfig,
          );
          const addonBatch = addonBadgesByOrderId[order.orderId] ?? order.unprintedAddonBatchNo;
          const hasAddon = addonBatch !== undefined && addonBatch !== null && addonBatch >= 2;
          const badge = resolveAlertBadge(
            alert,
            hasAddon,
            order.status === 'PENDING',
            reminderConfig.reminderDelayMinutes,
          );
          return (
            <TouchBoardCard
              key={order.orderId}
              testId={`touch-takeaway-card-${order.orderId}`}
              title={
                order.takeawayNumber
                  ? `#${String(order.takeawayNumber).padStart(2, '0')}`
                  : resolveTakeawayLabel(order)
              }
              eyebrow={
                <>
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Mang về
                </>
              }
              tone={order.status === 'PENDING' ? 'pending' : 'occupied'}
              isOverdue={alert.isOverdue}
              badge={badge}
              elapsed={formatElapsedSince(order.createdAt, nowMs)}
              amount={formatMoney(order.totalAmount)}
              onSelect={() => onSelectTakeaway(order)}
            />
          );
        })}
      </div>
      {takeaways.length === 0 && !canCreateOrder ? (
        <p className="py-6 text-center text-base font-semibold text-muted-foreground">
          Chưa có đơn mang về nào đang phục vụ
        </p>
      ) : null}
    </section>
  );

  return (
    <div className="space-y-6 p-4">
      <section
        data-testid="touch-table-board"
        aria-labelledby="touch-tables-heading"
        className="space-y-3"
      >
        <SectionHeading
          id="touch-tables-heading"
          icon={<Utensils className="h-5 w-5" />}
          title="Phòng bàn"
          detail={onlyOccupied ? 'Đang lọc bàn có hoá đơn' : undefined}
        />
        {grid.clamped ? (
          <p data-testid="touch-board-columns-clamped" className="text-xs font-medium text-muted-foreground">
            Màn hình hẹp: tự giảm còn {grid.columns} thẻ mỗi hàng để dễ chạm.
          </p>
        ) : null}
        <div
          ref={grid.ref}
          data-testid="touch-table-grid"
          data-columns={grid.columns}
          className={BOARD_GRID_CLASS}
          style={grid.style}
        >
          {visibleTables.map((table) => {
            const order = table.activeOrder;
            const alert = evaluateOrderPendingAlert(order, table.status, nowMs, reminderConfig);
            const addonBatch =
              (table.activeOrderId !== null
                ? addonBadgesByOrderId[table.activeOrderId]
                : undefined) ??
              order?.unprintedAddonBatchNo ??
              undefined;
            const hasAddon =
              table.status === 'OCCUPIED' && addonBatch !== undefined && addonBatch >= 2;
            const badge =
              table.status === 'AVAILABLE'
                ? null
                : resolveAlertBadge(
                    alert,
                    hasAddon,
                    table.status === 'PENDING',
                    reminderConfig.reminderDelayMinutes,
                  );
            return (
              <TouchBoardCard
                key={table.id}
                testId={`touch-table-card-${table.id}`}
                title={table.name}
                tone={
                  table.status === 'AVAILABLE'
                    ? 'available'
                    : table.status === 'PENDING'
                      ? 'pending'
                      : 'occupied'
                }
                isOverdue={alert.isOverdue}
                badge={badge}
                elapsed={order ? formatElapsedSince(order.createdAt, nowMs) : null}
                amount={order ? formatMoney(order.totalAmount) : null}
                onSelect={() => onSelectTable(table)}
              />
            );
          })}
        </div>
        {visibleTables.length === 0 ? (
          <p className="py-6 text-center text-base font-semibold text-muted-foreground">
            {onlyOccupied ? 'Chưa có bàn nào đang có hoá đơn' : 'Chưa cấu hình bàn nào'}
          </p>
        ) : null}
      </section>

      {takeawaySection}
    </div>
  );
}

function SectionHeading({
  id,
  icon,
  title,
  detail,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 id={id} className="text-lg font-extrabold uppercase tracking-wide">
        {title}
      </h2>
      {detail ? (
        <span className="text-sm font-semibold text-muted-foreground">· {detail}</span>
      ) : null}
    </div>
  );
}

interface TouchBoardCardProps {
  testId: string;
  title: string;
  tone: 'available' | 'pending' | 'occupied';
  isOverdue: boolean;
  badge: string | null;
  elapsed: string | null;
  amount: string | null;
  /** Dòng nhỏ phía trên tên (VD: "Mang về") để tên chính ngắn gọn, không bị cắt chữ. */
  eyebrow?: React.ReactNode;
  onSelect: () => void;
}

function TouchBoardCard({
  testId,
  title,
  tone,
  isOverdue,
  badge,
  elapsed,
  amount,
  eyebrow,
  onSelect,
}: TouchBoardCardProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-tone={tone}
      data-overdue={isOverdue ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-36 flex-col justify-between gap-2 overflow-hidden rounded-2xl border-2 p-4 text-left shadow-xs transition-transform active:scale-[0.97]',
        tone === 'available' &&
          'border-emerald-600/60 bg-emerald-50 text-emerald-950 dark:border-emerald-500/60 dark:bg-emerald-950/45 dark:text-emerald-100',
        tone === 'pending' &&
          !isOverdue &&
          'animate-pulse border-amber-500 bg-amber-100 text-amber-950 dark:border-amber-400 dark:bg-amber-950/65 dark:text-amber-100',
        tone === 'occupied' && !isOverdue && 'border-rose-600 bg-rose-600 text-white',
        isOverdue &&
          'animate-pulse border-red-200 bg-red-700 text-white ring-4 ring-red-500/70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          {eyebrow ? (
            <span className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide opacity-80">
              {eyebrow}
            </span>
          ) : null}
          <span className="block truncate text-2xl font-extrabold leading-tight">{title}</span>
        </span>
        {badge ? <BellRing className="h-6 w-6 shrink-0 animate-bounce" /> : null}
      </div>

      {badge ? (
        <span className="self-start rounded-md bg-black/25 px-2 py-0.5 text-sm font-extrabold dark:bg-black/40">
          {badge}
        </span>
      ) : null}

      {tone === 'available' ? (
        <span className="text-base font-semibold opacity-75">Bàn trống</span>
      ) : (
        <div className="flex items-end justify-between gap-2">
          <span className="text-xl font-extrabold tabular-nums leading-none">{amount}</span>
          {elapsed ? (
            <span className="flex shrink-0 items-center gap-1 text-base font-bold tabular-nums opacity-90">
              <Clock3 className="h-4 w-4" />
              {elapsed}
            </span>
          ) : null}
        </div>
      )}
    </button>
  );
}
