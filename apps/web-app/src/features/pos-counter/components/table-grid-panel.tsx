import { type PosOrderSummary, type PosTableGridResponse } from '@fnb/shared';
import {
  AlertTriangle,
  BellRing,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Utensils,
  Volume2,
  VolumeX,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { persistAccountPreferences } from '@/lib/persist-account-preferences';
import { evaluateOrderPendingAlert } from '@/lib/qr-pending-reminder';
import {
  getActiveQrReminderConfig,
  isQrVoiceAlertEnabled,
  setQrVoiceAlertEnabled,
  subscribeQrVoiceAlertState,
  unlockQrVoiceAudio,
} from '@/lib/qr-voice-announcer';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';
import { QrSecurityConfigDialog } from './qr-security-config-dialog';
import { TableManageDialog } from './table-manage-dialog';

export interface TableGridPanelProps {
  tables: PosTableGridResponse['tables'];
  takeaways: PosOrderSummary[];
  takeawayQrToken?: string;
  selectedOrderId: number | null;
  draftTarget:
    | { orderType: 'DINE_IN'; tableId: number; tableName: string }
    | { orderType: 'TAKEAWAY' }
    | null;
  addonBadgesByOrderId: Record<number, number>;
  onSelectTable: (table: PosTableGridResponse['tables'][number]) => void;
  onSelectTakeawayOrder: (order: PosOrderSummary) => void;
  onStartNewTakeaway: () => void;
}

export function TableGridPanel({
  tables,
  takeaways,
  takeawayQrToken,
  selectedOrderId,
  draftTarget,
  addonBadgesByOrderId,
  onSelectTable,
  onSelectTakeawayOrder,
  onStartNewTakeaway,
}: TableGridPanelProps) {
  const user = useAuthStore((s) => s.user);
  const canCreateOrder = Boolean(user?.isSuperAdmin || user?.permissions.pos.create);
  const canManageTables = Boolean(user?.isSuperAdmin || user?.permissions.pos.update);
  const canManageQrSecurity = Boolean(user?.isSuperAdmin || user?.permissions.pos.qrSecurity);
  const [tableManageOpen, setTableManageOpen] = React.useState(false);
  const [qrSecurityOpen, setQrSecurityOpen] = React.useState(false);
  const [voiceEnabled, setVoiceEnabled] = React.useState<boolean>(() => isQrVoiceAlertEnabled());
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    return subscribeQrVoiceAlertState((enabled) => {
      setVoiceEnabled(enabled);
    });
  }, []);

  const hasAnyPendingQr = React.useMemo(
    () =>
      tables.some(
        (table) =>
          table.status === 'PENDING' ||
          Boolean(table.activeOrder?.pendingQrKind) ||
          Boolean(table.activeOrder?.hasUnprintedAddon),
      ) ||
      takeaways.some(
        (order) =>
          order.status === 'PENDING' ||
          Boolean(order.pendingQrKind) ||
          Boolean(order.hasUnprintedAddon),
      ),
    [tables, takeaways],
  );

  React.useEffect(() => {
    setNowMs(Date.now());
    if (!hasAnyPendingQr) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [hasAnyPendingQr, tables, takeaways]);

  const reminderConfig = getActiveQrReminderConfig();

  const tableAlertStates = React.useMemo(() => {
    return tables.map((table) => ({
      table,
      alert: evaluateOrderPendingAlert(table.activeOrder, table.status, nowMs, reminderConfig),
    }));
  }, [tables, nowMs, reminderConfig]);

  const takeawayAlertStates = React.useMemo(() => {
    return takeaways.map((order) => ({
      order,
      label:
        order.tableLabel ??
        `Mang về #${String(order.takeawayNumber ?? 1).padStart(2, '0')}`,
      alert: evaluateOrderPendingAlert(
        order,
        order.status === 'PENDING' ? 'PENDING' : 'OCCUPIED',
        nowMs,
        reminderConfig,
      ),
    }));
  }, [takeaways, nowMs, reminderConfig]);

  const overdueTableEntries = React.useMemo(
    () => tableAlertStates.filter((entry) => entry.alert.isOverdue),
    [tableAlertStates],
  );

  const overdueTakeawayEntries = React.useMemo(
    () => takeawayAlertStates.filter((entry) => entry.alert.isOverdue),
    [takeawayAlertStates],
  );

  const totalOverdueCount = overdueTableEntries.length + overdueTakeawayEntries.length;

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setQrVoiceAlertEnabled(next);
    useUiPreferencesStore.getState().setUserVoiceAlertEnabled(next);
    void persistAccountPreferences({ voiceAlertEnabled: next });
    if (next) {
      void unlockQrVoiceAudio();
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 sm:gap-4 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-4 pb-28 sm:pb-6">
      <div>
        <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <Utensils className="h-4 w-4" />
              Sơ đồ Bàn Vật lý ({tables.length})
            </h2>
            {canManageTables ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-table-manager-btn"
                onClick={() => setTableManageOpen(true)}
                className="h-8 sm:h-9 px-3 text-xs font-semibold gap-1.5"
              >
                <Settings2 className="h-3.5 w-3.5 text-accent-text" />
                <span>Quản lý Bàn</span>
              </Button>
            ) : null}
            {canManageQrSecurity ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-qr-security-btn"
                onClick={() => setQrSecurityOpen(true)}
                className="h-8 sm:h-9 px-3 text-xs font-semibold gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Bảo mật QR</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="toggle-qr-voice-btn"
              onClick={handleToggleVoice}
              title={
                voiceEnabled
                  ? 'Đang bật loa đọc thông báo đơn QR trên máy này (Nhấn để tắt)'
                  : 'Đang tắt loa đọc thông báo đơn QR trên máy này (Nhấn để bật)'
              }
              className={cn(
                'h-8 sm:h-9 px-3 text-xs font-semibold gap-1.5',
                !voiceEnabled && 'text-muted-foreground opacity-75',
              )}
            >
              {voiceEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-accent-text" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span>{voiceEnabled ? 'Loa báo đơn: Bật' : 'Loa báo đơn: Tắt'}</span>
            </Button>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Trống
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" /> Mới gọi món
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Đang phục vụ
            </span>
            {totalOverdueCount > 0 ? (
              <span className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Chờ xác nhận quá hạn
              </span>
            ) : null}
          </div>
        </div>

        {totalOverdueCount > 0 ? (
          <div
            data-testid="pos-overdue-qr-banner"
            role="alert"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-red-600 bg-red-600/15 px-3 py-2 text-xs font-bold text-red-900 dark:border-red-500 dark:bg-red-950/60 dark:text-red-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 animate-pulse" />
              <span>
                Cảnh báo đỏ: Có {totalOverdueCount} {overdueTakeawayEntries.length > 0 ? 'bàn / đơn' : 'bàn'} chờ xác nhận quá {reminderConfig.reminderDelayMinutes} phút
                {reminderConfig.autoCancelEnabled
                  ? ` (tự động huỷ khi quá ${reminderConfig.autoCancelMinutes} phút)`
                  : ''}
                :
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {overdueTableEntries.map(({ table, alert }) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => onSelectTable(table)}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-red-700"
                >
                  <span>{table.name}</span>
                  <span className="opacity-90">({alert.elapsedMinutes}p)</span>
                </button>
              ))}
              {overdueTakeawayEntries.map(({ order, label, alert }) => (
                <button
                  key={`tw-${order.orderId}`}
                  type="button"
                  onClick={() => onSelectTakeawayOrder(order)}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-red-700"
                >
                  <span>{label}</span>
                  <span className="opacity-90">({alert.elapsedMinutes}p)</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(98px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2">
          {tableAlertStates.map(({ table, alert }) => {
            const isSelectedOrder =
              table.activeOrderId !== null && table.activeOrderId === selectedOrderId;
            const isDraftSelected =
              draftTarget?.orderType === 'DINE_IN' && draftTarget.tableId === table.id;
            const addonBatch =
              (table.activeOrderId !== null
                ? addonBadgesByOrderId[table.activeOrderId]
                : undefined) ??
              table.activeOrder?.unprintedAddonBatchNo ??
              undefined;
            // Khi gọi lượt 2 trở đi thì mới nhấp nháy chuông & hiển thị nhãn "Gọi thêm"
            const hasAddon = Boolean(
              table.status === 'OCCUPIED' &&
                addonBatch !== undefined &&
                addonBatch >= 2,
            );
            const isOverdue = alert.isOverdue;

            return (
              <button
                key={table.id}
                type="button"
                data-testid={`table-card-${table.id}`}
                data-overdue={isOverdue ? 'true' : undefined}
                onClick={() => onSelectTable(table)}
                className={cn(
                  'relative flex min-h-[54px] sm:min-h-[58px] flex-col justify-between overflow-hidden rounded-xl border-2 p-2 text-left transition-all active:scale-[0.98]',
                  table.status === 'AVAILABLE' &&
                    'border-emerald-600/70 bg-emerald-50/90 text-emerald-950 hover:bg-emerald-100/90 dark:border-emerald-500/70 dark:bg-emerald-950/45 dark:text-emerald-100 dark:hover:bg-emerald-900/50',
                  table.status === 'PENDING' &&
                    !isOverdue &&
                    'animate-pulse border-amber-500 bg-amber-100/90 text-amber-950 hover:bg-amber-200/90 dark:border-amber-400 dark:bg-amber-950/65 dark:text-amber-100',
                  table.status === 'PENDING' &&
                    isOverdue &&
                    'animate-pulse border-red-600 bg-red-600 text-white hover:bg-red-700 ring-4 ring-red-400/75 shadow-sm dark:border-red-400 dark:bg-red-700',
                  table.status === 'OCCUPIED' &&
                    !isOverdue &&
                    'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 shadow-xs',
                  table.status === 'OCCUPIED' && hasAddon && !isOverdue && 'animate-pulse',
                  table.status === 'OCCUPIED' &&
                    isOverdue &&
                    'animate-pulse border-red-200 bg-red-700 text-white hover:bg-red-800 ring-4 ring-red-500/80 shadow-md',
                  (isSelectedOrder || isDraftSelected) && 'ring-4 ring-primary/50',
                )}
              >
                <div className="flex w-full items-start justify-between gap-1 min-w-0">
                  <span className="text-xs sm:text-sm font-bold whitespace-nowrap leading-tight">
                    {table.name}
                  </span>
                  {table.status === 'PENDING' ? (
                    <BellRing
                      className={cn(
                        'h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0',
                        isOverdue ? 'animate-bounce text-white' : 'text-amber-600 dark:text-amber-300',
                      )}
                    />
                  ) : table.status === 'OCCUPIED' && (hasAddon || isOverdue) ? (
                    <BellRing
                      data-testid={`table-addon-bell-${table.id}`}
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 animate-bounce text-white"
                    />
                  ) : null}
                </div>

                {isOverdue ? (
                  <Badge
                    data-testid={`table-overdue-badge-${table.id}`}
                    className="mt-1 border border-white/60 bg-red-950/90 text-[9px] sm:text-[10px] font-extrabold text-white px-1.5 py-0.5 justify-center shrink-0 whitespace-nowrap"
                  >
                    {alert.kind === 'ADDON'
                      ? `Gọi thêm • Trễ ${Math.max(reminderConfig.reminderDelayMinutes, alert.elapsedMinutes)}p`
                      : `Quá ${Math.max(reminderConfig.reminderDelayMinutes, alert.elapsedMinutes)}p`}
                  </Badge>
                ) : hasAddon ? (
                  <Badge className="mt-1 bg-amber-500 text-[9px] sm:text-[10px] text-white px-1.5 py-0.5 justify-center shrink-0 whitespace-nowrap">
                    Gọi thêm
                  </Badge>
                ) : null}

                <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs min-w-0">
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
        <div className="mb-2.5 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <ShoppingBag className="h-4 w-4 shrink-0" />
            <span>Đơn Mang về Đang Phục vụ ({takeaways.length})</span>
          </h3>
          {canCreateOrder ? (
            <Button
              type="button"
              data-testid="create-takeaway-btn"
              onClick={onStartNewTakeaway}
              className="h-8 sm:h-9 px-3 text-xs sm:text-sm bg-primary font-bold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] gap-1.5 shadow-xs shrink-0"
            >
              <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>TẠO ĐƠN MANG VỀ</span>
            </Button>
          ) : null}
        </div>

        {takeaways.length === 0 && draftTarget?.orderType !== 'TAKEAWAY' ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {canCreateOrder
              ? 'Chưa có đơn mang về nào đang mở. Bấm [TẠO ĐƠN MANG VỀ] để tạo đơn mang về độc lập.'
              : 'Chưa có đơn mang về nào đang mở.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2 sm:gap-2.5">
            {draftTarget?.orderType === 'TAKEAWAY' ? (
              <div
                data-testid="takeaway-draft-card"
                className="relative flex min-h-[64px] sm:min-h-[70px] flex-col justify-between overflow-hidden rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-500/15 p-2.5 sm:p-3 text-left ring-4 ring-primary/50"
              >
                <div className="flex w-full items-center justify-between gap-1.5 min-w-0">
                  <span className="text-xs sm:text-sm font-bold whitespace-nowrap leading-tight text-indigo-700 dark:text-indigo-300">
                    Mang về mới
                  </span>
                  <ShoppingBag className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                </div>
                <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                  Đang chọn món
                </div>
              </div>
            ) : null}

            {takeawayAlertStates.map(({ order, label, alert }) => {
              const isSelected = order.orderId === selectedOrderId;
              const addonBatch =
                addonBadgesByOrderId[order.orderId] ?? order.unprintedAddonBatchNo ?? undefined;
              // Khi gọi lượt 2 trở đi thì mới nhấp nháy chuông & hiển thị nhãn "Gọi thêm"
              const hasAddon = Boolean(
                order.status === 'SERVING' &&
                  addonBatch !== undefined &&
                  addonBatch >= 2,
              );
              const isOverdue = alert.isOverdue;

              return (
                <button
                  key={order.orderId}
                  type="button"
                  data-testid={`takeaway-card-${order.orderId}`}
                  data-overdue={isOverdue ? 'true' : undefined}
                  onClick={() => onSelectTakeawayOrder(order)}
                  className={cn(
                    'relative flex min-h-[64px] sm:min-h-[70px] flex-col justify-between overflow-hidden rounded-xl border-2 p-2.5 sm:p-3 text-left transition-all active:scale-[0.98]',
                    order.status === 'PENDING' &&
                      !isOverdue &&
                      'animate-pulse border-amber-500 bg-amber-100/90 text-amber-950 hover:bg-amber-200/90 dark:border-amber-400 dark:bg-amber-950/65 dark:text-amber-100',
                    order.status === 'SERVING' &&
                      !isOverdue &&
                      'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 shadow-xs',
                    order.status === 'SERVING' && hasAddon && !isOverdue && 'animate-pulse',
                    isOverdue &&
                      'animate-pulse border-red-600 bg-red-600/20 text-red-950 ring-2 ring-red-500/70 hover:bg-red-600/30 dark:border-red-500 dark:bg-red-950/75 dark:text-red-100',
                    order.status !== 'PENDING' &&
                      order.status !== 'SERVING' &&
                      !isOverdue &&
                      'border-indigo-500/70 bg-indigo-500/10 text-foreground hover:bg-indigo-500/20',
                    isSelected && 'ring-4 ring-primary/50',
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1.5 min-w-0">
                    <span className="text-xs sm:text-sm font-bold whitespace-nowrap leading-tight">
                      {label}
                    </span>
                    {isOverdue ? (
                      <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-red-600 dark:text-red-400 animate-bounce" />
                    ) : order.status === 'PENDING' ? (
                      <BellRing className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                    ) : order.status === 'SERVING' && hasAddon ? (
                      <BellRing className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 animate-bounce text-white" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5 opacity-80 shrink-0" />
                    )}
                  </div>

                  {isOverdue ? (
                    <Badge
                      data-testid={`takeaway-overdue-badge-${order.orderId}`}
                      className="mt-1 bg-red-600 text-[9px] sm:text-[10px] text-white px-1.5 py-0.5 justify-center shrink-0 whitespace-nowrap"
                    >
                      Quá hạn ({alert.elapsedMinutes}p)
                    </Badge>
                  ) : hasAddon ? (
                    <Badge className="mt-1 bg-amber-500 text-[9px] sm:text-[10px] text-white px-1.5 py-0.5 justify-center shrink-0 whitespace-nowrap">
                      Gọi thêm
                    </Badge>
                  ) : null}

                  <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs">
                    <span className="font-bold block tabular-nums whitespace-nowrap">
                      {order.totalAmount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <TableManageDialog
        open={tableManageOpen}
        onOpenChange={setTableManageOpen}
        tables={tables}
        takeawayQrToken={takeawayQrToken}
        canManageTables={canManageTables}
      />

      {canManageQrSecurity ? (
        <QrSecurityConfigDialog
          open={qrSecurityOpen}
          onOpenChange={setQrSecurityOpen}
        />
      ) : null}
    </div>
  );
}
