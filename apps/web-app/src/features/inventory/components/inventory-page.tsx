import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  getBusinessDateIso,
  type InventoryImportRecord,
  useDeleteInventoryImportMutation,
  useInventoryImportsQuery,
} from '@/features/inventory/api/inventory.api';
import { InventoryImportDrawer } from '@/features/inventory/components/inventory-import-drawer';
import { useAuthStore } from '@/stores/auth.store';

function formatDateVi(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function InventoryPage() {
  const todayIso = React.useMemo(() => getBusinessDateIso(), []);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [fromDate, setFromDate] = React.useState<string>('');
  const [toDate, setToDate] = React.useState<string>('');
  const [keyword, setKeyword] = React.useState('');

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<InventoryImportRecord | null>(null);

  const user = useAuthStore((state) => state.user);
  const canCreateImport = Boolean(user?.isSuperAdmin || user?.permissions.inventory?.create);
  const canDeleteAnyShift = Boolean(user?.isSuperAdmin || user?.permissions.inventory?.update);

  const { data, isLoading } = useInventoryImportsQuery({
    page,
    limit,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    keyword: keyword.trim() || undefined,
  });

  const deleteMutation = useDeleteInventoryImportMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const totalImportCost = data?.summary.totalImportCost ?? 0;

  const isSameDayRecord = React.useCallback(
    (record: InventoryImportRecord) => {
      const recordDay = record.importDate.slice(0, 10);
      return recordDay === todayIso;
    },
    [todayIso],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({
        title: 'Đã xoá phiếu nhập hàng',
        description: `Đã xoá mềm dòng nhập "${deleteTarget.itemNameSnapshot}".`,
      });
      setDeleteTarget(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể xoá phiếu nhập',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    }
  };

  // 9+1 cột: thêm nhà cung cấp để truy ngược nguồn nhập hàng.
  const columns = React.useMemo<ColumnDef<InventoryImportRecord, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 52,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'importDate',
        header: 'Ngày nhập',
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{formatDateVi(row.original.importDate)}</span>
        ),
      },
      {
        accessorKey: 'itemNameSnapshot',
        header: 'Tên món hàng',
        size: 155,
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">{row.original.itemNameSnapshot}</span>
        ),
      },
      {
        accessorKey: 'supplierNameSnapshot',
        header: 'Nhà cung cấp',
        size: 145,
        cell: ({ row }) => row.original.supplierNameSnapshot || '—',
      },
      {
        accessorKey: 'unitName',
        header: 'ĐVT',
        size: 65,
      },
      {
        accessorKey: 'unitPrice',
        header: 'Đơn giá',
        size: 105,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{row.original.unitPrice.toLocaleString('vi-VN')} đ</span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: 'SL',
        size: 68,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.quantity.toLocaleString('vi-VN')}</span>
        ),
      },
      {
        accessorKey: 'totalCost',
        header: 'Thành tiền',
        size: 115,
        cell: ({ row }) => (
          <span className="font-bold text-primary tabular-nums whitespace-nowrap">
            {row.original.totalCost.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        id: 'paymentSourceAndNote',
        header: 'Nguồn tiền & Ghi chú',
        size: 230,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col items-start gap-1 min-w-0">
              <Badge
                variant={item.paymentSource === 'CASH_DRAWER' ? 'warning' : 'info'}
                data-testid={`import-source-badge-${item.id}`}
              >
                {item.paymentSource === 'CASH_DRAWER' ? 'CASH_DRAWER (Tiền két)' : 'EXTERNAL (Quỹ ngoài)'}
              </Badge>
              {item.note ? (
                <span className="truncate max-w-full text-xs text-muted-foreground" title={item.note}>
                  {item.note}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Xoá',
        size: 65,
        cell: ({ row }) => {
          const item = row.original;
          const allowedToDelete =
            Boolean(user?.isSuperAdmin || user?.permissions.inventory?.delete) &&
            (canDeleteAnyShift || isSameDayRecord(item));

          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid={`delete-import-btn-${item.id}`}
              disabled={!allowedToDelete}
              onClick={() => setDeleteTarget(item)}
              title={
                allowedToDelete
                  ? 'Xoá mềm phiếu nhập'
                  : 'Thu ngân chỉ được xoá phiếu nhập trong ca hiện tại'
              }
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          );
        },
      },
    ],
    [page, limit, user, canDeleteAnyShift, isSameDayRecord],
  );

  return (
    <div data-testid="inventory-page" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Quản lý Nhập hàng Nguyên vật liệu
          </h1>
          <p className="text-sm text-muted-foreground">
            Tra cứu lịch sử nhập kho và mở Drawer bên phải để nhập hàng liên kết tự động với Master
            Data (MDM).
          </p>
        </div>

        {canCreateImport ? (
          <Button
            type="button"
            data-testid="open-import-drawer-btn"
            onClick={() => setDrawerOpen(true)}
            className="font-bold shadow-xs active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Thêm phiếu nhập</span>
          </Button>
        ) : null}
      </div>

      <BaseTable
        tableId="inventory"
        data={items}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Chưa có phiếu nhập hàng nào trong kỳ."
        searchPlaceholder="Lọc lịch sử theo tên nguyên liệu..."
        searchValue={keyword}
        onSearchChange={(val) => {
          setKeyword(val);
          setPage(1);
        }}
        toolbarLeft={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              <span>Kỳ nhập:</span>
            </div>
            <Input
              type="date"
              aria-label="Từ ngày nhập"
              data-testid="inventory-history-from-date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              aria-label="Đến ngày nhập"
              data-testid="inventory-history-to-date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
          </div>
        }
        footerSummary={
          <div
            data-testid="inventory-footer-total"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              Tổng tiền nhập hàng trong kỳ:{' '}
              <strong className="text-base text-primary">
                {totalImportCost.toLocaleString('vi-VN')} đ
              </strong>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Tiền két (CASH_DRAWER):{' '}
              {(data?.summary.totalCashDrawerCost ?? 0).toLocaleString('vi-VN')} đ • Quỹ ngoài
              (EXTERNAL): {(data?.summary.totalExternalCost ?? 0).toLocaleString('vi-VN')} đ
            </span>
          </div>
        }
        pagination={{
          page,
          limit,
          total,
          totalPages,
          onPageChange: setPage,
          onLimitChange: (nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
          },
        }}
      />

      <InventoryImportDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent data-testid="delete-import-confirm-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá phiếu nhập hàng</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xoá dòng nhập{' '}
              <strong className="text-foreground">{deleteTarget?.itemNameSnapshot}</strong> (
              {deleteTarget?.totalCost.toLocaleString('vi-VN')} đ)?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-delete-import-btn"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
            >
              Xác nhận xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
