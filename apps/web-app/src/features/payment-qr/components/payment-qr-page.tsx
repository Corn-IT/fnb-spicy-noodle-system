import { useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
  SocketEvents,
  type CreatePaymentAccountRequest,
  type PaymentAccount,
  type UpdatePaymentAccountRequest,
} from '@fnb/shared';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  Pencil,
  QrCode,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppMessages } from '@/hooks/use-app-messages';
import { usePosSocketContext } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';

import {
  paymentQrQueryKeys,
  useCreatePaymentAccountMutation,
  useDeletePaymentAccountMutation,
  usePaymentAccountsQuery,
  useReorderPaymentAccountsMutation,
  useUpdatePaymentAccountMutation,
} from '../api/payment-qr.api';
import { PaymentQrFormDrawer } from './payment-qr-form-drawer';
import { PaymentQrOrdersDrawer } from './payment-qr-orders-drawer';

function UsageLimitCell({
  used,
  limit,
  testIdPrefix,
}: {
  used: number;
  limit: number | null;
  testIdPrefix: string;
}) {
  const ratio = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const barColor =
    ratio === null
      ? 'bg-emerald-500'
      : ratio >= 100
        ? 'bg-rose-600'
        : ratio >= 80
          ? 'bg-amber-500'
          : 'bg-emerald-500';

  return (
    <div className="space-y-1 min-w-[130px]" data-testid={testIdPrefix}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-1.5 gap-y-0.5 text-xs tabular-nums">
        <span className="whitespace-nowrap font-bold text-foreground">
          {used.toLocaleString('vi-VN')} đ
        </span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          / {limit !== null ? `${limit.toLocaleString('vi-VN')} đ` : 'Không giới hạn'}
        </span>
      </div>
      {ratio !== null ? (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{ width: `${ratio}%` }}
            />
          </div>
          <span
            className={cn(
              'text-[10px] font-bold tabular-nums',
              ratio >= 100
                ? 'text-rose-600 dark:text-rose-400'
                : ratio >= 80
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
            )}
          >
            {ratio}%
          </span>
        </div>
      ) : (
        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
          Không giới hạn hạn mức
        </div>
      )}
    </div>
  );
}

function getStatusBadgeMeta(
  status: PaymentAccount['status'],
  isPrimaryActive: boolean,
): {
  label: string;
  variant: 'success' | 'secondary' | 'warning' | 'outline';
  testId: string;
} {
  switch (status) {
    case 'AVAILABLE':
      return isPrimaryActive
        ? { label: 'Đang dùng', variant: 'success', testId: 'qr-status-ACTIVE_PRIMARY' }
        : { label: 'Dự phòng', variant: 'secondary', testId: 'qr-status-STANDBY' };
    case 'DAY_FULL':
      return { label: 'Đầy hạn mức', variant: 'warning', testId: 'qr-status-DAY_FULL' };
    case 'MONTH_FULL':
      return { label: 'Đầy hạn mức', variant: 'warning', testId: 'qr-status-MONTH_FULL' };
    case 'YEAR_FULL':
      return { label: 'Đầy hạn mức', variant: 'warning', testId: 'qr-status-YEAR_FULL' };
    case 'INACTIVE':
    default:
      return { label: 'Đang tắt', variant: 'outline', testId: 'qr-status-INACTIVE' };
  }
}

export function PaymentQrPage() {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canCreate = Boolean(user?.isSuperAdmin || user?.permissions?.paymentQr?.create);
  const canUpdate = Boolean(user?.isSuperAdmin || user?.permissions?.paymentQr?.update);
  const canDelete = Boolean(user?.isSuperAdmin || user?.permissions?.paymentQr?.delete);

  const queryClient = useQueryClient();
  const { socket } = usePosSocketContext();

  const accountsQuery = usePaymentAccountsQuery();
  const accounts = accountsQuery.data ?? [];
  const isLoading = accountsQuery.isLoading;
  const createMutation = useCreatePaymentAccountMutation();
  const updateMutation = useUpdatePaymentAccountMutation();
  const reorderMutation = useReorderPaymentAccountsMutation();
  const deleteMutation = useDeletePaymentAccountMutation();

  const [keyword, setKeyword] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'ACTIVE' | 'FULL'>('ALL');
  const [formDrawerOpen, setFormDrawerOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<PaymentAccount | null>(null);
  const [ordersDrawerAccount, setOrdersDrawerAccount] = React.useState<PaymentAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PaymentAccount | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<PaymentAccount | null>(null);

  // Realtime sync when POS prints provisional bill or completes checkout
  React.useEffect(() => {
    if (!socket) return;
    const handleSync = () => {
      void queryClient.invalidateQueries({ queryKey: paymentQrQueryKeys.all });
    };
    socket.on(SocketEvents.ORDER_STATUS_UPDATED, handleSync);
    socket.on(SocketEvents.TABLE_GRID_SYNC, handleSync);
    return () => {
      socket.off(SocketEvents.ORDER_STATUS_UPDATED, handleSync);
      socket.off(SocketEvents.TABLE_GRID_SYNC, handleSync);
    };
  }, [socket, queryClient]);

  const filteredAccounts = React.useMemo(() => {
    const trimmed = keyword.trim();
    return accounts.filter((acc) => {
      if (statusFilter === 'ACTIVE' && !acc.isActive) return false;
      if (
        statusFilter === 'FULL' &&
        acc.status !== 'DAY_FULL' &&
        acc.status !== 'MONTH_FULL' &&
        acc.status !== 'YEAR_FULL'
      ) {
        return false;
      }
      if (!trimmed) return true;
      return matchesVietnameseQuery(
        trimmed,
        acc.label,
        acc.bankCode,
        acc.bankName,
        acc.accountNo,
        acc.accountName,
      );
    });
  }, [accounts, keyword, statusFilter]);

  const activePrimaryAccount = React.useMemo(
    () => accounts.find((a) => a.status === 'AVAILABLE') ?? null,
    [accounts],
  );

  const totalsSummary = React.useMemo(() => {
    return accounts.reduce(
      (acc, item) => ({
        today: acc.today + item.usedDay,
        month: acc.month + item.usedMonth,
        year: acc.year + item.usedYear,
      }),
      { today: 0, month: 0, year: 0 },
    );
  }, [accounts]);

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setFormDrawerOpen(true);
  };

  const handleOpenEdit = React.useCallback((account: PaymentAccount) => {
    setEditingAccount(account);
    setFormDrawerOpen(true);
  }, []);

  const handleSubmitCreate = async (payload: CreatePaymentAccountRequest) => {
    try {
      await createMutation.mutateAsync(payload);
      setFormDrawerOpen(false);
      notify('paymentQr.createSuccess', {
        variant: 'success',
        vars: {
          label: payload.label,
          bankCode: payload.bankCode,
          accountNo: payload.accountNo,
        },
      });
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'paymentQr.createError',
        err,
        'Vui lòng kiểm tra lại thông tin.',
      );
      notify('paymentQr.createError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng kiểm tra lại thông tin.' },
      });
    }
  };

  const handleSubmitUpdate = async (id: number, payload: UpdatePaymentAccountRequest) => {
    try {
      await updateMutation.mutateAsync({ id, input: payload });
      setFormDrawerOpen(false);
      notify('paymentQr.updateSuccess', { variant: 'success' });
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'paymentQr.updateError',
        err,
        'Vui lòng thử lại.',
      );
      notify('paymentQr.updateError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    }
  };

  const activeAccountsCount = React.useMemo(
    () => accounts.filter((a) => a.isActive).length,
    [accounts],
  );

  const performToggleActive = React.useCallback(
    async (account: PaymentAccount, nextActive: boolean) => {
      try {
        const updated = await updateMutation.mutateAsync({
          id: account.id,
          input: { isActive: nextActive },
        });
        if (nextActive) {
          const nextStateLabel =
            !activePrimaryAccount && updated.status === 'AVAILABLE'
              ? 'Đang dùng'
              : updated.status === 'AVAILABLE'
                ? 'Dự phòng'
                : 'Đầy hạn mức';
          notify('paymentQr.activateSuccess', {
            variant: 'success',
            vars: {
              stateLabel: nextStateLabel,
              label: account.label,
              bankName: account.bankName,
              accountNo: account.accountNo,
            },
          });
        } else {
          notify('paymentQr.deactivateSuccess', {
            variant: 'success',
            vars: {
              label: account.label,
              bankName: account.bankName,
              accountNo: account.accountNo,
            },
          });
        }
      } catch (err) {
        const resolvedErr = resolveErrorMessage(
          'paymentQr.toggleError',
          err,
          'Vui lòng thử lại.',
        );
        notify('paymentQr.toggleError', {
          variant: 'destructive',
          vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
        });
      }
    },
    [updateMutation, activePrimaryAccount, notify, resolveErrorMessage],
  );

  const handleStatusActionClick = React.useCallback(
    async (account: PaymentAccount) => {
      if (!canUpdate || updateMutation.isPending) return;
      if (!account.isActive) {
        await performToggleActive(account, true);
        return;
      }
      if (activeAccountsCount <= 1) {
        notify('paymentQr.lastActiveWarning', { variant: 'warning' });
        return;
      }
      if (activePrimaryAccount?.id === account.id) {
        setDeactivateTarget(account);
        return;
      }
      await performToggleActive(account, false);
    },
    [canUpdate, updateMutation.isPending, activeAccountsCount, activePrimaryAccount?.id, performToggleActive],
  );

  const handleConfirmDeactivatePrimary = async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    setDeactivateTarget(null);
    await performToggleActive(target, false);
  };

  const isReorderLockedByFilter = Boolean(keyword.trim()) || statusFilter === 'FULL';

  const handleMovePriority = React.useCallback(
    async (activeIndex: number, direction: 'UP' | 'DOWN') => {
      if (isReorderLockedByFilter) return;
      const activeList = accounts.filter((a) => a.isActive);
      const inactiveList = accounts.filter((a) => !a.isActive);
      const targetIndex = direction === 'UP' ? activeIndex - 1 : activeIndex + 1;
      if (
        activeIndex < 0 ||
        activeIndex >= activeList.length ||
        targetIndex < 0 ||
        targetIndex >= activeList.length
      ) {
        return;
      }
      const reorderedActive = [...activeList];
      const [moved] = reorderedActive.splice(activeIndex, 1);
      if (!moved) return;
      reorderedActive.splice(targetIndex, 0, moved);

      try {
        await reorderMutation.mutateAsync({
          orderedIds: [...reorderedActive, ...inactiveList].map((a) => a.id),
        });
        notify('paymentQr.reorderSuccess', { variant: 'success' });
      } catch (err) {
        const resolvedErr = resolveErrorMessage(
          'paymentQr.reorderError',
          err,
          'Vui lòng thử lại.',
        );
        notify('paymentQr.reorderError', {
          variant: 'destructive',
          vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
        });
      }
    },
    [accounts, isReorderLockedByFilter, reorderMutation, notify, resolveErrorMessage],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      notify('paymentQr.deleteSuccess', {
        variant: 'success',
        vars: { label: deleteTarget.label },
      });
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'paymentQr.deleteError',
        err,
        'Vui lòng thử lại.',
      );
      notify('paymentQr.deleteError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    }
  };

  const columns = React.useMemo<ColumnDef<PaymentAccount, unknown>[]>(
    () => [
      {
        id: 'priority',
        header: 'Ưu tiên',
        size: 86,
        minSize: 80,
        cell: ({ row }) => {
          const isInactive = !row.original.isActive;
          const activeIdx = accounts
            .filter((a) => a.isActive)
            .findIndex((a) => a.id === row.original.id);
          const isPrimaryActive = activePrimaryAccount?.id === row.original.id;
          const moveUpTitle = isInactive
            ? 'Mã QR đang tắt nằm ở cuối danh sách ưu tiên'
            : isReorderLockedByFilter
              ? 'Tắt bộ lọc/tìm kiếm để sắp xếp thứ tự ưu tiên'
              : 'Tăng độ ưu tiên (Lên)';
          const moveDownTitle = isInactive
            ? 'Mã QR đang tắt nằm ở cuối danh sách ưu tiên'
            : isReorderLockedByFilter
              ? 'Tắt bộ lọc/tìm kiếm để sắp xếp thứ tự ưu tiên'
              : 'Giảm độ ưu tiên (Xuống)';
          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Badge
                variant={isPrimaryActive ? 'default' : 'outline'}
                className={cn(
                  'font-mono text-xs font-extrabold',
                  isInactive && 'opacity-50',
                )}
                data-testid={`qr-priority-badge-${row.original.id}`}
              >
                #{row.original.priority}
              </Badge>
              {canUpdate ? (
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={
                      isInactive ||
                      isReorderLockedByFilter ||
                      activeIdx <= 0 ||
                      reorderMutation.isPending
                    }
                    data-testid={`qr-move-up-${row.original.id}`}
                    title={moveUpTitle}
                    onClick={() => handleMovePriority(activeIdx, 'UP')}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={
                      isInactive ||
                      isReorderLockedByFilter ||
                      activeIdx < 0 ||
                      activeIdx >= activeAccountsCount - 1 ||
                      reorderMutation.isPending
                    }
                    data-testid={`qr-move-down-${row.original.id}`}
                    title={moveDownTitle}
                    onClick={() => handleMovePriority(activeIdx, 'DOWN')}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'label',
        header: 'Tên gợi nhớ',
        size: 145,
        minSize: 130,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-bold text-foreground">{row.original.label}</div>
            <div className="text-[11px] text-muted-foreground">
              {row.original.orderCount} hoá đơn CK đã thu
            </div>
          </div>
        ),
      },
      {
        id: 'bankAccount',
        header: 'Ngân hàng',
        size: 195,
        minSize: 175,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-foreground">
              {row.original.bankName} ({row.original.bankCode})
            </div>
            <div className="font-mono text-[11px] font-semibold text-accent-text">
              STK: {row.original.accountNo}
            </div>
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
              {row.original.accountName}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        size: 136,
        minSize: 124,
        cell: ({ row }) => {
          const item = row.original;
          const isPrimaryActive = activePrimaryAccount?.id === item.id;
          const meta = getStatusBadgeMeta(item.status, isPrimaryActive);
          const isLastActive = item.isActive && activeAccountsCount <= 1;
          const statusTitle = !canUpdate
            ? meta.label
            : !item.isActive
              ? activePrimaryAccount
                ? 'Bấm để bật mã QR (Chuyển sang Dự phòng)'
                : 'Bấm để bật mã QR (Chuyển thành Đang dùng)'
              : isLastActive
                ? 'Không thể tắt mã QR đang bật duy nhất trong hệ thống'
                : isPrimaryActive
                  ? 'Bấm để tắt mã QR đang dùng (cần xác nhận)'
                  : 'Bấm để chuyển sang Đang tắt';

          if (!canUpdate) {
            return (
              <Badge variant={meta.variant} data-testid={meta.testId}>
                {meta.label}
              </Badge>
            );
          }

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                data-testid={`qr-status-btn-${item.id}`}
                title={statusTitle}
                disabled={updateMutation.isPending}
                onClick={() => handleStatusActionClick(item)}
                className={cn(
                  'inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition',
                  isLastActive
                    ? 'cursor-not-allowed opacity-85'
                    : 'cursor-pointer hover:brightness-95 active:scale-[0.98]',
                )}
              >
                <Badge
                  variant={meta.variant}
                  data-testid={meta.testId}
                  className="pointer-events-none"
                >
                  {meta.label}
                </Badge>
              </button>
            </div>
          );
        },
      },
      {
        id: 'dailyUsage',
        header: 'Hạn mức Ngày',
        size: 148,
        minSize: 138,
        cell: ({ row }) => (
          <UsageLimitCell
            used={row.original.usedDay}
            limit={row.original.dailyLimit}
            testIdPrefix={`qr-daily-usage-${row.original.id}`}
          />
        ),
      },
      {
        id: 'monthlyUsage',
        header: 'Hạn mức Tháng',
        size: 148,
        minSize: 138,
        cell: ({ row }) => (
          <UsageLimitCell
            used={row.original.usedMonth}
            limit={row.original.monthlyLimit}
            testIdPrefix={`qr-monthly-usage-${row.original.id}`}
          />
        ),
      },
      {
        id: 'yearlyUsage',
        header: 'Hạn mức Năm',
        size: 148,
        minSize: 138,
        cell: ({ row }) => (
          <UsageLimitCell
            used={row.original.usedYear}
            limit={row.original.yearlyLimit}
            testIdPrefix={`qr-yearly-usage-${row.original.id}`}
          />
        ),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 108,
        minSize: 104,
        enableResizing: false,
        cell: ({ row }) => {
          const item = row.original;
          const isPrimaryActive = activePrimaryAccount?.id === item.id;
          const isLastAccount = accounts.length <= 1;
          const isDeleteDisabled =
            item.hasOrders || item.isActive || isLastAccount || deleteMutation.isPending;

          const deleteTitle = isLastAccount
            ? 'Không thể xoá mã QR duy nhất còn lại trong hệ thống'
            : item.hasOrders
              ? 'Mã QR đã phát sinh hoá đơn nên không thể xoá cứng (chỉ được giữ ở trạng thái Đang tắt)'
              : item.isActive
                ? 'Mã QR đang ở trạng thái bật. Vui lòng bấm Trạng thái để chuyển sang Đang tắt trước khi xoá'
                : 'Xoá mã QR chưa phát sinh giao dịch';

          const editTitle = isPrimaryActive
            ? 'Không thể chỉnh sửa mã QR đang ở trạng thái Đang dùng. Vui lòng chuyển sang Đang tắt hoặc đổi ưu tiên xuống Dự phòng trước khi sửa'
            : 'Chỉnh sửa cấu hình & hạn mức';

          return (
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                data-testid={`qr-view-orders-${item.id}`}
                title="Xem các hoá đơn chuyển khoản của mã QR này"
                onClick={() => setOrdersDrawerAccount(item)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {canUpdate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isPrimaryActive || updateMutation.isPending}
                  data-testid={`qr-edit-${item.id}`}
                  title={editTitle}
                  onClick={() => handleOpenEdit(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isDeleteDisabled}
                  data-testid={`qr-delete-${item.id}`}
                  title={deleteTitle}
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      accounts,
      activeAccountsCount,
      activePrimaryAccount,
      canUpdate,
      canDelete,
      reorderMutation.isPending,
      updateMutation.isPending,
      deleteMutation.isPending,
      handleMovePriority,
      handleOpenEdit,
      handleStatusActionClick,
    ],
  );

  if (!accountsQuery.data && accountsQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={accountsQuery.error}
        onRetry={() => void accountsQuery.refetch()}
      />
    );
  }

  return (
    <div
      data-testid="payment-qr-page"
      className="flex flex-col gap-4"
    >
      <PageHeader
        path="/payment-qr"
        defaultTitle="Quản lý Mã QR Thanh toán (VietQR)"
        className="shrink-0"
      />

      {/* Top Status & Totals Banner */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4 shrink-0">
        <div
          data-testid="payment-qr-active-banner"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-3"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <QrCode className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Mã QR đang ưu tiên in</span>
            </div>
            {activePrimaryAccount ? (
              <>
                <div className="truncate text-sm font-extrabold text-foreground">
                  #{activePrimaryAccount.priority} {activePrimaryAccount.label}
                </div>
                <div className="truncate text-xs font-medium text-muted-foreground">
                  {activePrimaryAccount.bankName} • {activePrimaryAccount.accountNo}
                </div>
              </>
            ) : (
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Chưa có mã QR khả dụng hoặc tất cả đã chạm hạn mức
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Tổng tiền CK đã thu Hôm nay
          </div>
          <div
            data-testid="payment-qr-summary-today"
            className="mt-1 text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums"
          >
            {totalsSummary.today.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[11px] text-muted-foreground">
            Tự động làm mới sau 00:00 (GMT+7)
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Tổng tiền CK đã thu Tháng này
          </div>
          <div
            data-testid="payment-qr-summary-month"
            className="mt-1 text-lg font-extrabold text-blue-600 dark:text-blue-400 tabular-nums"
          >
            {totalsSummary.month.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[11px] text-muted-foreground">
            Tính theo các hoá đơn đã thanh toán (Chuyển khoản &amp; Kết hợp)
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Tổng tiền CK đã thu Năm nay
          </div>
          <div
            data-testid="payment-qr-summary-year"
            className="mt-1 text-lg font-extrabold text-purple-600 dark:text-purple-400 tabular-nums"
          >
            {totalsSummary.year.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[11px] text-muted-foreground">
            Tự động trừ khi hoá đơn bị huỷ
          </div>
        </div>
      </div>

      {/* Main BaseTable */}
      <BaseTable
        tableId="payment-qr"
        data={filteredAccounts}
        columns={columns}
        isLoading={isLoading}
        isFetching={accountsQuery.isFetching}
        isPlaceholderData={accountsQuery.isPlaceholderData}
        emptyMessage="Chưa có mã QR thanh toán nào được cấu hình."
        searchPlaceholder="Tìm theo tên gợi nhớ, ngân hàng, STK..."
        searchValue={keyword}
        onSearchChange={setKeyword}
        toolbarLeft={
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: 'ALL', label: `Tất cả (${accounts.length})` },
                {
                  key: 'ACTIVE',
                  label: `Đang bật (${accounts.filter((a) => a.isActive).length})`,
                },
                {
                  key: 'FULL',
                  label: `Đầy hạn mức (${
                    accounts.filter(
                      (a) =>
                        a.status === 'DAY_FULL' ||
                        a.status === 'MONTH_FULL' ||
                        a.status === 'YEAR_FULL',
                    ).length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.key}
                type="button"
                size="sm"
                variant={statusFilter === tab.key ? 'default' : 'outline'}
                className="h-8 text-xs font-semibold"
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        }
        toolbarRight={
          <div className="flex items-center gap-2">
            <AuditHistoryButton module="PAYMENT_QR" label="Lịch sử xoay vòng QR" />
            {canCreate ? (
              <Button
                type="button"
                size="sm"
                data-testid="btn-create-payment-qr"
                onClick={handleOpenCreate}
              >
                Thêm mã QR
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Create / Edit Drawer */}
      <PaymentQrFormDrawer
        open={formDrawerOpen}
        onOpenChange={setFormDrawerOpen}
        editingAccount={editingAccount}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmitCreate={handleSubmitCreate}
        onSubmitUpdate={handleSubmitUpdate}
      />

      {/* Linked Transfer Orders Drawer */}
      <PaymentQrOrdersDrawer
        open={Boolean(ordersDrawerAccount)}
        onOpenChange={(open) => {
          if (!open) setOrdersDrawerAccount(null);
        }}
        account={ordersDrawerAccount}
      />

      {/* Confirm Deactivating Primary QR Dialog */}
      <Dialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <DialogContent data-testid="payment-qr-deactivate-dialog">
          <DialogHeader>
            {(() => {
              const deactivateCopy = resolveMessage('paymentQr.confirm.deactivateActive', {
                label: deactivateTarget?.label ?? '',
                bankName: deactivateTarget?.bankName ?? '',
                accountNo: deactivateTarget?.accountNo ?? '',
              });
              const nextCandidate = deactivateTarget
                ? accounts.find((a) => a.id !== deactivateTarget.id && a.status === 'AVAILABLE')
                : null;
              return (
                <>
                  <DialogTitle>{deactivateCopy.title}</DialogTitle>
                  <DialogDescription>
                    {deactivateCopy.isOverridden && deactivateCopy.description ? (
                      deactivateCopy.description
                    ) : (
                      <>
                        Bạn sắp chuyển mã QR{' '}
                        <strong>
                          {deactivateTarget?.label} ({deactivateTarget?.bankName} - {deactivateTarget?.accountNo})
                        </strong>{' '}
                        sang trạng thái <strong>Đang tắt</strong>.{' '}
                        {nextCandidate ? (
                          <span>
                            Hệ thống sẽ tự động chuyển mã{' '}
                            <strong>
                              #{nextCandidate.priority} {nextCandidate.label}
                            </strong>{' '}
                            lên trạng thái <strong>Đang dùng</strong>.
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-300 font-medium">
                            Các mã QR đang bật còn lại hiện đều đã chạm hạn mức cấu hình.
                          </span>
                        )}
                      </>
                    )}
                  </DialogDescription>
                </>
              );
            })()}
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={updateMutation.isPending}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-deactivate-primary-qr-btn"
              onClick={handleConfirmDeactivatePrimary}
              disabled={updateMutation.isPending}
            >
              Xác nhận tắt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent data-testid="payment-qr-delete-dialog">
          <DialogHeader>
            {(() => {
              const deleteCopy = resolveMessage('paymentQr.confirm.delete', {
                label: deleteTarget?.label ?? '',
                bankName: deleteTarget?.bankName ?? '',
                accountNo: deleteTarget?.accountNo ?? '',
              });
              return (
                <>
                  <DialogTitle>{deleteCopy.title}</DialogTitle>
                  <DialogDescription>
                    {deleteCopy.isOverridden && deleteCopy.description ? (
                      deleteCopy.description
                    ) : (
                      <>
                        Bạn có chắc chắn muốn xoá mã QR{' '}
                        <strong>
                          {deleteTarget?.label} ({deleteTarget?.bankName} - {deleteTarget?.accountNo})
                        </strong>
                        ? Thao tác này chỉ áp dụng cho mã QR đã tắt và chưa từng phát sinh hoá đơn.
                      </>
                    )}
                  </DialogDescription>
                </>
              );
            })()}
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-delete-payment-qr-btn"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              Xoá mã QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
