import type { PosOrderSummary, PosTableGridResponse } from '@fnb/shared';
import { BellRing, Clock3, Plus, ShoppingBag } from 'lucide-react';
import * as React from 'react';

import {
  evaluateOrderPendingAlert,
  type OrderPendingAlertState,
} from '@/lib/qr-pending-reminder';
import { getActiveQrReminderConfig } from '@/lib/qr-voice-announcer';
import { cn } from '@/utils/cn';
import { formatElapsedSince } from './elapsed-time';

type PosTable = PosTableGridResponse['tables'][number];

export type TouchBoardTab = 'tables' | 'takeaway';

export interface TouchTableBoardProps {
  tab: TouchBoardTab;
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

/** Lưới bàn / đơn mang về cỡ lớn cho màn cảm ứng. */
export function TouchTableBoard({
  tab,
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

  const visibleTables = React.useMemo(
    () => (onlyOccupied ? tables.filter((table) => table.status !== 'AVAILABLE') : tables),
    [tables, onlyOccupied],
  );

  if (tab === 'takeaway') {
    return (
      <div
        data-testid="touch-takeaway-board"
        className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] content-start gap-3 p-4"
      >
        {canCreateOrder ? (
          <button
            type="button"
            data-testid="touch-new-takeaway"
            onClick={onStartNewTakeaway}
            className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 p-3 text-accent-text transition-transform active:scale-[0.97]"
          >
            <Plus className="h-8 w-8" />
            <span className="text-base font-bold">Đơn mang về mới</span>
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
              title={resolveTakeawayLabel(order)}
              tone={order.status === 'PENDING' ? 'pending' : 'occupied'}
              isOverdue={alert.isOverdue}
              badge={badge}
              elapsed={formatElapsedSince(order.createdAt, nowMs)}
              amount={formatMoney(order.totalAmount)}
              icon={<ShoppingBag className="h-4 w-4 shrink-0 opacity-80" />}
              onSelect={() => onSelectTakeaway(order)}
            />
          );
        })}
        {takeaways.length === 0 && !canCreateOrder ? (
          <p className="col-span-full py-16 text-center text-base font-semibold text-muted-foreground">
            Chưa có đơn mang về nào đang phục vụ
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="touch-table-board"
      className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] content-start gap-3 p-4"
    >
      {visibleTables.map((table) => {
        const order = table.activeOrder;
        const alert = evaluateOrderPendingAlert(order, table.status, nowMs, reminderConfig);
        const addonBatch =
          (table.activeOrderId !== null ? addonBadgesByOrderId[table.activeOrderId] : undefined) ??
          order?.unprintedAddonBatchNo ??
          undefined;
        const hasAddon = table.status === 'OCCUPIED' && addonBatch !== undefined && addonBatch >= 2;
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
      {visibleTables.length === 0 ? (
        <p className="col-span-full py-16 text-center text-base font-semibold text-muted-foreground">
          {onlyOccupied ? 'Chưa có bàn nào đang có hoá đơn' : 'Chưa cấu hình bàn nào'}
        </p>
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
  icon?: React.ReactNode;
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
  icon,
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
        'relative flex min-h-28 flex-col justify-between gap-1.5 overflow-hidden rounded-2xl border-2 p-3 text-left shadow-xs transition-transform active:scale-[0.97]',
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
        <span className="flex min-w-0 items-center gap-1.5 text-lg font-extrabold leading-tight">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {badge ? <BellRing className="h-5 w-5 shrink-0 animate-bounce" /> : null}
      </div>

      {badge ? (
        <span className="self-start rounded-md bg-black/25 px-2 py-0.5 text-xs font-extrabold dark:bg-black/40">
          {badge}
        </span>
      ) : null}

      {tone === 'available' ? (
        <span className="text-sm font-semibold opacity-75">Bàn trống</span>
      ) : (
        <div className="flex items-end justify-between gap-2">
          <span className="text-lg font-extrabold tabular-nums leading-none">{amount}</span>
          {elapsed ? (
            <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums opacity-90">
              <Clock3 className="h-4 w-4" />
              {elapsed}
            </span>
          ) : null}
        </div>
      )}
    </button>
  );
}
