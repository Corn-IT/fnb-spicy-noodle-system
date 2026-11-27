import { formatTakeawayLabel, formatTakeawaySuffix, type PosDraftResponse, type PosOrderSummary, type PosTableGridResponse } from '@fnb/shared';
import { BellRing, Clock3, Plus, ShoppingBag } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  evaluateOrderPendingAlert,
  type OrderPendingAlertState,
} from '@/lib/qr-pending-reminder';
import { getActiveQrReminderConfig } from '@/lib/qr-voice-announcer';
import { cn } from '@/utils/cn';
import { formatElapsedSince } from './elapsed-time';
import { type ColumnChoice, useGridColumns } from './touch-layout';
import { PosDraftsPanel } from '../components/pos-drafts-panel';

type PosTable = PosTableGridResponse['tables'][number];

export type TouchBoardTab = 'all' | 'tables' | 'takeaway' | 'drafts';

export interface TouchTableBoardProps {
  tab: TouchBoardTab;
  /** Số thẻ mỗi hàng ('auto' = theo bề ngang màn hình). */
  columns?: ColumnChoice;
  tables: PosTable[];
  takeaways: PosOrderSummary[];
  drafts: PosDraftResponse[];
  draftsLoaded: boolean;
  draftsLoading: boolean;
  draftsError: boolean;
  activeDraftId: string | null;
  onlyOccupied: boolean;
  nowMs: number;
  canCreateOrder: boolean;
  canDeleteDraft: boolean;
  isDraftPending?: boolean;
  addonBadgesByOrderId: Record<number, number>;
  onSelectTable: (table: PosTable) => void;
  onSelectTakeaway: (order: PosOrderSummary) => void;
  onStartNewTakeaway: () => void;
  onStartUntargetedDraft: () => void;
  onResumeDraft: (draft: PosDraftResponse) => void;
  onDeleteDraft: (draft: PosDraftResponse) => void;
  onRetryDrafts: () => void;
}

const formatMoney = (amount: number) => `${amount.toLocaleString('vi-VN')}`;

export function sortTakeawaysForBoard(takeaways: PosOrderSummary[]): PosOrderSummary[] {
  return [...takeaways].sort((left, right) => {
    if (left.takeawayNumber === null && right.takeawayNumber === null) {
      return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    }
    if (left.takeawayNumber === null) return 1;
    if (right.takeawayNumber === null) return -1;
    return left.takeawayNumber - right.takeawayNumber;
  });
}

export function resolveTakeawayLabel(order: PosOrderSummary): string {
  return order.tableLabel ?? formatTakeawayLabel(order.takeawayNumber, order.takeawayLabelFormat);
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

/** Sơ đồ bàn cảm ứng: hiển thị một lưới theo tab đang chọn. */
export function TouchTableBoard({
  tab,
  columns = 'auto',
  tables,
  takeaways,
  drafts,
  draftsLoaded,
  draftsLoading,
  draftsError,
  activeDraftId,
  onlyOccupied,
  nowMs,
  canCreateOrder,
  canDeleteDraft,
  isDraftPending,
  addonBadgesByOrderId,
  onSelectTable,
  onSelectTakeaway,
  onStartNewTakeaway,
  onStartUntargetedDraft,
  onResumeDraft,
  onDeleteDraft,
  onRetryDrafts,
}: TouchTableBoardProps) {
  const reminderConfig = getActiveQrReminderConfig();
  const grid = useGridColumns('tables', columns);

  const visibleTables = React.useMemo(
    () => (onlyOccupied ? tables.filter((table) => table.status !== 'AVAILABLE') : tables),
    [tables, onlyOccupied],
  );
  const sortedTakeaways = React.useMemo(() => sortTakeawaysForBoard(takeaways), [takeaways]);

  const renderNewTakeawayTile = () =>
    canCreateOrder ? (
      <button
        key="new-takeaway"
        type="button"
        data-testid="touch-new-takeaway"
        onClick={onStartNewTakeaway}
        className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 p-3 text-accent-text transition-transform active:scale-[0.97]"
      >
        <Plus className="h-10 w-10" />
        <span className="text-lg font-bold">Đơn mang về mới</span>
      </button>
    ) : null;

  const renderUntargetedDraftTile = () =>
    canCreateOrder ? (
      <button
        key="untargeted-draft"
        type="button"
        data-testid="touch-new-untargeted-draft"
        onClick={onStartUntargetedDraft}
        className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-500/60 bg-indigo-500/5 p-3 text-indigo-700 transition-transform active:scale-[0.97] dark:text-indigo-300"
      >
        <Plus className="h-10 w-10" />
        <span className="text-lg font-bold">Giỏ chưa gán bàn</span>
      </button>
    ) : null;

  const renderTakeawayCard = (order: PosOrderSummary) => {
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
        key={`takeaway-${order.orderId}`}
        testId={`touch-takeaway-card-${order.orderId}`}
        title={
          order.takeawayNumber
            ? `#${formatTakeawaySuffix(order.takeawayNumber, order.takeawayLabelFormat)}`
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
  };

  const renderTableCard = (table: PosTable) => {
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
        key={`table-${table.id}`}
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
  };

  const boardCards =
    tab === 'drafts'
      ? [renderUntargetedDraftTile()]
      : tab === 'tables'
      ? visibleTables.map(renderTableCard)
      : tab === 'takeaway'
        ? [renderNewTakeawayTile(), renderUntargetedDraftTile(), ...sortedTakeaways.map(renderTakeawayCard)]
        : [
            renderNewTakeawayTile(),
            renderUntargetedDraftTile(),
            ...sortedTakeaways.map(renderTakeawayCard),
            ...visibleTables.map(renderTableCard),
          ];

  const emptyMessage =
    tab === 'drafts' && draftsLoaded && drafts.length === 0
      ? 'Chưa có giỏ tạm nào được lưu'
      : tab === 'tables' && visibleTables.length === 0
      ? onlyOccupied
        ? 'Chưa có bàn nào đang có hoá đơn'
        : 'Chưa cấu hình bàn nào'
      : tab === 'takeaway' && sortedTakeaways.length === 0 && !canCreateOrder
        ? 'Chưa có đơn mang về nào đang phục vụ'
        : tab === 'all' && visibleTables.length === 0 && sortedTakeaways.length === 0
          ? onlyOccupied
            ? 'Chưa có bàn nào đang có hoá đơn'
            : tables.length === 0
              ? 'Chưa cấu hình bàn nào'
              : null
          : null;

  return (
    <div
      id="touch-table-board"
      data-testid="touch-table-board"
      data-tab={tab}
      className="space-y-3 p-4"
    >
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
        {boardCards}
      </div>
      {tab === 'drafts' ? (
        <>
          <PosDraftsPanel
            drafts={drafts}
            activeDraftId={activeDraftId}
            canDelete={canDeleteDraft}
            disabled={isDraftPending}
            gridStyle={grid.style}
            onResume={onResumeDraft}
            onDelete={onDeleteDraft}
          />
          {draftsLoading && drafts.length === 0 ? (
            <p data-testid="touch-drafts-loading" role="status" className="py-6 text-center text-base font-semibold text-muted-foreground">
              Đang tải giỏ tạm…
            </p>
          ) : null}
          {draftsError && drafts.length === 0 ? (
            <div role="alert" data-testid="touch-drafts-error" className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-base font-semibold text-muted-foreground">Không tải được danh sách giỏ tạm.</p>
              <Button type="button" variant="outline" onClick={onRetryDrafts}>Thử lại</Button>
            </div>
          ) : null}
        </>
      ) : null}
      {emptyMessage ? (
        <p
          data-testid={tab === 'drafts' ? 'touch-drafts-empty-state' : undefined}
          className="py-6 text-center text-base font-semibold text-muted-foreground"
        >
          {emptyMessage}
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
