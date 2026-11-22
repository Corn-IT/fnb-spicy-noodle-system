import {
  type CreateDiscountInput,
  type DiscountRecord,
  type DiscountScope,
  type DiscountStatusFilter,
  type UpdateDiscountInput,
} from '@fnb/shared';
import { type ColumnDef } from '@tanstack/react-table';
import { Archive, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

import {
  useCreateDiscountMutation,
  useDeleteDiscountMutation,
  useDiscountsQuery,
  useToggleDiscountStatusMutation,
  useUpdateDiscountMutation,
} from '../api/discounts.api';
import { DiscountFormDrawer } from './discount-form-drawer';

const SCOPE_LABELS: Record<DiscountScope, string> = {
  ORDER: 'Tổng hoá đơn',
  CATEGORY: 'Danh mục',
  PRODUCT: 'Món cụ thể',
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
  7: 'CN',
};

function resolveDiscountRowState(
  record: DiscountRecord,
  now = Date.now(),
): {
  label: string;
  variant: 'success' | 'warning' | 'outline' | 'destructive';
  isExpired: boolean;
  isExhausted: boolean;
  isLiveActive: boolean;
  canToggleStatus: boolean;
} {
  if (record.isArchived) {
    return {
      label: 'Đã lưu trữ',
      variant: 'outline',
      isExpired: false,
      isExhausted: false,
      isLiveActive: false,
      canToggleStatus: false,
    };
  }
  const isExpired = Boolean(record.endsAt && new Date(record.endsAt).getTime() < now);
  if (isExpired) {
    return {
      label: 'Hết hạn',
      variant: 'warning',
      isExpired: true,
      isExhausted: false,
      isLiveActive: false,
      canToggleStatus: false,
    };
  }
  const isExhausted = record.usageLimit !== null && record.usedCount >= record.usageLimit;
  if (isExhausted) {
    return {
      label: 'Hết lượt',
      variant: 'warning',
      isExpired: false,
      isExhausted: true,
      isLiveActive: false,
      canToggleStatus: false,
    };
  }
  if (!record.isActive) {
    return {
      label: 'Đang tắt',
      variant: 'outline',
      isExpired: false,
      isExhausted: false,
      isLiveActive: false,
      canToggleStatus: true,
    };
  }
  if (record.startsAt && new Date(record.startsAt).getTime() > now) {
    return {
      label: 'Chờ mở',
      variant: 'warning',
      isExpired: false,
      isExhausted: false,
      isLiveActive: true,
      canToggleStatus: true,
    };
  }
  return {
    label: 'Đang chạy',
    variant: 'success',
    isExpired: false,
    isExhausted: false,
    isLiveActive: true,
    canToggleStatus: true,
  };
}

function formatDiscountValueCell(record: DiscountRecord): string {
  if (record.valueType === 'PERCENT') {
    const capText =
      record.maxDiscountAmount !== null
        ? ` (tối đa ${record.maxDiscountAmount.toLocaleString('vi-VN')} đ)`
        : '';
    return `Giảm ${record.value}%${capText}`;
  }
  const perUnitSuffix = record.scope === 'ORDER' ? '' : ' / phần';
  return `Giảm ${record.value.toLocaleString('vi-VN')} đ${perUnitSuffix}`;
}

export function DiscountsPage() {
  const { notify, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canCreate = Boolean(user?.isSuperAdmin || user?.permissions?.discounts?.create);
  const canUpdate = Boolean(user?.isSuperAdmin || user?.permissions?.discounts?.update);
  const canDelete = Boolean(user?.isSuperAdmin || user?.permissions?.discounts?.delete);

  const [statusFilter, setStatusFilter] = React.useState<DiscountStatusFilter>('all');
  const [scopeFilter, setScopeFilter] = React.useState<DiscountScope | 'ALL'>('ALL');
  const [keyword, setKeyword] = React.useState('');

  const discountsQuery = useDiscountsQuery({
    page: 1,
    limit: 50,
    status: statusFilter,
    scope: scopeFilter === 'ALL' ? undefined : scopeFilter,
    keyword: keyword.trim() ? keyword.trim() : undefined,
  });
  const { data, isLoading } = discountsQuery;

  const createMutation = useCreateDiscountMutation();
  const updateMutation = useUpdateDiscountMutation();
  const toggleStatusMutation = useToggleDiscountStatusMutation();
  const deleteMutation = useDeleteDiscountMutation();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingDiscount, setEditingDiscount] = React.useState<DiscountRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<DiscountRecord | null>(null);

  const items = data?.items ?? [];

  const handleOpenCreate = React.useCallback(() => {
    setEditingDiscount(null);
    setFormOpen(true);
  }, []);

  const handleOpenEdit = React.useCallback((record: DiscountRecord) => {
    const rowState = resolveDiscountRowState(record);
    if (record.isArchived || rowState.isLiveActive) return;
    setEditingDiscount(record);
    setFormOpen(true);
  }, []);

  const handleSubmitCreate = async (payload: CreateDiscountInput) => {
    try {
      await createMutation.mutateAsync(payload);
      setFormOpen(false);
      notify('discounts.createSuccess', {
        variant: 'success',
        vars: { code: payload.code },
      });
    } catch (error) {
      const resolved = resolveErrorMessage(
        'discounts.createError',
        error,
        'Vui lòng kiểm tra lại dữ liệu',
      );
      notify('discounts.createError', {
        variant: 'destructive',
        vars: { reason: resolved.description ?? 'Vui lòng kiểm tra lại dữ liệu' },
      });
    }
  };

  const handleSubmitUpdate = async (id: number, payload: UpdateDiscountInput) => {
    try {
      await updateMutation.mutateAsync({ id, payload });
      setFormOpen(false);
      notify('discounts.updateSuccess', {
        variant: 'success',
        vars: { code: payload.code },
      });
    } catch (error) {
      const resolved = resolveErrorMessage('discounts.updateError', error, 'Vui lòng thử lại');
      notify('discounts.updateError', {
        variant: 'destructive',
        vars: { reason: resolved.description ?? 'Vui lòng thử lại' },
      });
    }
  };

  const handleToggleActive = React.useCallback(
    async (record: DiscountRecord) => {
      try {
        await toggleStatusMutation.mutateAsync({
          id: record.id,
          isActive: !record.isActive,
        });
        notify('discounts.toggleSuccess', {
          variant: 'success',
          vars: {
            message: record.isActive
              ? `Đã tạm tắt mã ${record.code}`
              : `Đã kích hoạt lại mã ${record.code}`,
          },
        });
      } catch (error) {
        const resolved = resolveErrorMessage('discounts.toggleError', error, 'Vui lòng thử lại');
        notify('discounts.toggleError', {
          variant: 'destructive',
          vars: { reason: resolved.description ?? 'Vui lòng thử lại' },
        });
      }
    },
    [notify, resolveErrorMessage, toggleStatusMutation],
  );

  const handleConfirmDeleteOrArchive = async () => {
    if (!archiveTarget) return;
    try {
      const res = await deleteMutation.mutateAsync(archiveTarget.id);
      setArchiveTarget(null);
      notify('discounts.deleteSuccess', {
        variant: 'success',
        vars: {
          message: res.archived
            ? `Đã lưu trữ mã ${archiveTarget.code}`
            : `Đã xoá mã ${archiveTarget.code}`,
        },
      });
    } catch (error) {
      const resolved = resolveErrorMessage('discounts.deleteError', error, 'Vui lòng thử lại');
      notify('discounts.deleteError', {
        variant: 'destructive',
        vars: { reason: resolved.description ?? 'Vui lòng thử lại' },
      });
    }
  };

  const columns = React.useMemo<ColumnDef<DiscountRecord>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Mã giảm giá',
        size: 132,
        minSize: 112,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-accent-text">
                <Tag className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={item.code}>
                  {item.code}
                </span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground" title={item.name}>
                {item.name}
              </div>
            </div>
          );
        },
      },
      {
        id: 'valueRule',
        header: 'Mức giảm',
        size: 152,
        minSize: 130,
        cell: ({ row }) => {
          const item = row.original;
          const valueText = formatDiscountValueCell(item);
          return (
            <div className="min-w-0 space-y-0.5 text-xs">
              <div className="truncate font-semibold text-foreground" title={valueText}>
                {valueText}
              </div>
              {item.minOrderAmount !== null ? (
                <div
                  className="truncate text-[11px] text-muted-foreground"
                  title={`Đơn tối thiểu: ${item.minOrderAmount.toLocaleString('vi-VN')} đ`}
                >
                  Đơn tối thiểu: {item.minOrderAmount.toLocaleString('vi-VN')} đ
                </div>
              ) : (
                <div className="truncate text-[11px] text-muted-foreground">Không yêu cầu đơn tối thiểu</div>
              )}
            </div>
          );
        },
      },
      {
        id: 'scope',
        header: 'Phạm vi',
        size: 126,
        minSize: 108,
        cell: ({ row }) => {
          const item = row.original;
          const targetNames = item.targets
            .map((t) => t.categoryName ?? t.productName)
            .filter((v): v is string => Boolean(v));
          return (
            <div className="min-w-0 space-y-0.5 text-xs">
              <Badge variant="secondary" className="text-[11px]">
                {SCOPE_LABELS[item.scope]}
              </Badge>
              {targetNames.length > 0 ? (
                <div
                  className="truncate text-[11px] text-muted-foreground"
                  title={targetNames.join(', ')}
                >
                  {targetNames.slice(0, 2).join(', ')}
                  {targetNames.length > 2 ? ` +${targetNames.length - 2}` : ''}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'schedule',
        header: 'Thời gian',
        size: 132,
        minSize: 112,
        cell: ({ row }) => {
          const item = row.original;
          const days = item.activeWeekdays.map((d) => WEEKDAY_LABELS[d] ?? `T${d}`).join(', ');
          const hours =
            item.timeWindowStart && item.timeWindowEnd
              ? `${item.timeWindowStart}–${item.timeWindowEnd}`
              : null;
          const expiryText = item.endsAt
            ? `Hạn: ${new Date(item.endsAt).toLocaleString('vi-VN')}`
            : 'Không giới hạn ngày';
          return (
            <div className="min-w-0 space-y-0.5 text-[11px] text-muted-foreground">
              <div className="truncate" title={expiryText}>
                {expiryText}
              </div>
              {hours ? (
                <div className="truncate font-medium text-foreground">Giờ: {hours}</div>
              ) : null}
              {days ? (
                <div className="truncate" title={`Thứ: ${days}`}>
                  Thứ: {days}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'usage',
        header: 'Lượt dùng',
        size: 96,
        minSize: 84,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div data-testid={`discount-usage-${item.id}`} className="min-w-0 space-y-0.5 text-xs tabular-nums">
              <div className="font-bold text-foreground">
                {item.usedCount} / {item.usageLimit ?? '∞'}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {item.remainingCount !== null ? `Còn ${item.remainingCount}` : 'Không giới hạn'}
              </div>
            </div>
          );
        },
      },
      {
        id: 'totalDiscountedAmount',
        header: 'Tổng đã giảm',
        size: 108,
        minSize: 96,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div
              data-testid={`discount-total-amount-${item.id}`}
              className="whitespace-nowrap text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums"
            >
              {item.totalDiscountedAmount.toLocaleString('vi-VN')} đ
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        size: 106,
        minSize: 96,
        cell: ({ row }) => {
          const item = row.original;
          const rowState = resolveDiscountRowState(item);

          if (!canUpdate || item.isArchived) {
            return (
              <Tooltip
                content={
                  item.isArchived
                    ? 'Mã đã lưu trữ vĩnh viễn để bảo toàn lịch sử đối soát'
                    : undefined
                }
                disabled={item.isArchived}
              >
                <Badge variant={rowState.variant} className="text-[11px]">
                  {rowState.label}
                </Badge>
              </Tooltip>
            );
          }

          const statusTitle = rowState.isExpired
            ? 'Mã đã hết hạn — bấm Sửa để gia hạn trước khi bật lại'
            : rowState.isExhausted
              ? 'Mã đã hết lượt dùng — bấm Sửa để tăng giới hạn lượt trước khi bật lại'
              : item.isActive
                ? 'Bấm để tạm tắt mã (cần tắt trước khi sửa hoặc xoá)'
                : 'Bấm để kích hoạt lại mã giảm giá';

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Tooltip
                content={statusTitle}
                disabled={!rowState.canToggleStatus || toggleStatusMutation.isPending}
              >
                <button
                  type="button"
                  data-testid={`toggle-discount-${item.id}`}
                  aria-label={
                    rowState.canToggleStatus
                      ? item.isActive
                        ? `Tạm tắt mã ${item.code}`
                        : `Kích hoạt lại mã ${item.code}`
                      : statusTitle
                  }
                  disabled={!rowState.canToggleStatus || toggleStatusMutation.isPending}
                  onClick={() => void handleToggleActive(item)}
                  className={cn(
                    'inline-flex rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    rowState.canToggleStatus && !toggleStatusMutation.isPending
                      ? 'cursor-pointer hover:brightness-95 active:scale-[0.98]'
                      : 'pointer-events-none opacity-80',
                  )}
                >
                  <Badge variant={rowState.variant} className="pointer-events-none text-[11px]">
                    {rowState.label}
                  </Badge>
                </button>
              </Tooltip>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 88,
        minSize: 82,
        enableResizing: false,
        cell: ({ row }) => {
          const item = row.original;
          const rowState = resolveDiscountRowState(item);
          const editDisabled = item.isArchived || rowState.isLiveActive;
          const deleteDisabled =
            item.isArchived || rowState.isLiveActive || deleteMutation.isPending;
          const isArchiveAction = item.usedCount > 0;

          const editTitle = item.isArchived
            ? 'Mã đã lưu trữ không thể chỉnh sửa'
            : rowState.isLiveActive
              ? 'Mã đang kích hoạt. Hãy bấm cột Trạng thái để tạm tắt trước khi chỉnh sửa'
              : 'Chỉnh sửa mã giảm giá';

          const deleteTitle = item.isArchived
            ? 'Mã đã được lưu trữ vĩnh viễn để bảo toàn lịch sử hoá đơn'
            : rowState.isLiveActive
              ? `Mã đang kích hoạt. Hãy bấm cột Trạng thái để tạm tắt trước khi ${
                  isArchiveAction ? 'lưu trữ' : 'xoá'
                }`
              : isArchiveAction
                ? 'Lưu trữ mã đã phát sinh lượt dùng (bảo toàn lịch sử)'
                : 'Xoá vĩnh viễn mã giảm giá';

          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {canUpdate ? (
                <Tooltip content={editTitle} disabled={editDisabled}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    data-testid={`edit-discount-${item.id}`}
                    aria-label={editTitle}
                    disabled={editDisabled}
                    onClick={() => handleOpenEdit(item)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              ) : null}
              {canDelete ? (
                <Tooltip content={deleteTitle} disabled={deleteDisabled}>
                  <Button
                    type="button"
                    variant={isArchiveAction ? 'outline' : 'destructive'}
                    size="sm"
                    className={cn(
                      'h-7 px-2 text-xs',
                      isArchiveAction &&
                        !deleteDisabled &&
                        'border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
                    )}
                    data-testid={`delete-discount-${item.id}`}
                    aria-label={deleteTitle}
                    disabled={deleteDisabled}
                    onClick={() => setArchiveTarget(item)}
                  >
                    {isArchiveAction ? (
                      <Archive className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      canUpdate,
      canDelete,
      toggleStatusMutation.isPending,
      deleteMutation.isPending,
      handleToggleActive,
      handleOpenEdit,
    ],
  );

  if (!data && discountsQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={discountsQuery.error}
        onRetry={() => void discountsQuery.refetch()}
      />
    );
  }

  return (
    <div
      data-testid="discounts-page"
      className="flex min-w-0 flex-col gap-4"
    >
      <PageHeader
        path="/discounts"
        defaultTitle="Quản lý Mã giảm giá"
        defaultSubtitle="Thiết lập mã khuyến mãi động theo %, tiền mặt cho toàn đơn, danh mục hoặc món cụ thể."
        className="shrink-0"
        actions={
          <>
            <AuditHistoryButton module="DISCOUNTS" label="Lịch sử giảm giá" />
            {canCreate ? (
              <Button
                type="button"
                size="sm"
                data-testid="create-discount-btn"
                onClick={handleOpenCreate}
                className="font-semibold"
              >
                <Plus className="mr-1 h-4 w-4" />
                Tạo mã giảm giá
              </Button>
            ) : null}
          </>
        }
      />

      <BaseTable
        tableId="discounts"
        data={items}
        columns={columns}
        isLoading={isLoading}
        isFetching={discountsQuery.isFetching}
        isPlaceholderData={discountsQuery.isPlaceholderData}
        emptyMessage="Chưa có mã giảm giá nào."
        searchPlaceholder="Tìm mã hoặc tên chương trình..."
        searchValue={keyword}
        onSearchChange={setKeyword}
        toolbarLeft={
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'all', label: 'Tất cả' },
                { key: 'active', label: 'Đang chạy' },
                { key: 'inactive', label: 'Đang tắt' },
                { key: 'expired', label: 'Hết hạn' },
                { key: 'archived', label: 'Lưu trữ' },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.key}
                type="button"
                size="sm"
                variant={statusFilter === tab.key ? 'default' : 'outline'}
                className="h-8 whitespace-nowrap px-2.5 text-xs font-semibold"
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        }
        toolbarRight={
          <Select
            value={scopeFilter}
            onValueChange={(value) => setScopeFilter(value as DiscountScope | 'ALL')}
          >
            <SelectTrigger
              aria-label="Lọc theo phạm vi"
              data-testid="discounts-scope-filter"
              className="h-9 w-full shrink-0 text-xs font-medium sm:w-[144px]"
            >
              <SelectValue placeholder="Mọi phạm vi" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="ALL">Mọi phạm vi</SelectItem>
              <SelectItem value="ORDER">Tổng hoá đơn</SelectItem>
              <SelectItem value="CATEGORY">Danh mục</SelectItem>
              <SelectItem value="PRODUCT">Món cụ thể</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <DiscountFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        editingDiscount={editingDiscount}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmitCreate={handleSubmitCreate}
        onSubmitUpdate={handleSubmitUpdate}
      />

      <Dialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <DialogContent data-testid="discount-delete-dialog">
          <DialogHeader>
            <DialogTitle>
              {archiveTarget && archiveTarget.usedCount > 0
                ? `Lưu trữ mã ${archiveTarget.code}?`
                : `Xoá mã ${archiveTarget?.code ?? ''}?`}
            </DialogTitle>
            <DialogDescription>
              {archiveTarget && archiveTarget.usedCount > 0
                ? `Mã đã có ${archiveTarget.usedCount} lượt áp dụng trên hoá đơn thanh toán nên hệ thống sẽ lưu trữ & tắt kích hoạt để bảo toàn lịch sử doanh thu.`
                : 'Mã chưa phát sinh hoá đơn nên sẽ được xoá vĩnh viễn khỏi danh sách.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setArchiveTarget(null)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-delete-discount-btn"
              disabled={deleteMutation.isPending}
              onClick={() => void handleConfirmDeleteOrArchive()}
            >
              {deleteMutation.isPending ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
