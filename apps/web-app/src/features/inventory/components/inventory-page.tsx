import { type ColumnDef } from '@tanstack/react-table';
import { Calendar, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { TruncatedTextWithTooltip } from '@/components/ui/truncated-text-with-tooltip';
import {
  getBusinessDateIso,
  type InventoryImportListResponse,
  type InventoryImportRecord,
  useDeleteInventoryImportMutation,
  useInventoryImportsQuery,
} from '@/features/inventory/api/inventory.api';
import { EditInventoryImportDialog } from '@/features/inventory/components/edit-inventory-import-dialog';
import { InventoryImportDrawer } from '@/features/inventory/components/inventory-import-drawer';
import { apiClient } from '@/lib/api-client';
import { exportToExcel, fetchAllPaginated } from '@/lib/excel-export';
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
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const todayIso = React.useMemo(() => getBusinessDateIso(), []);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [fromDate, setFromDate] = React.useState<string>('');
  const [toDate, setToDate] = React.useState<string>('');
  const [keyword, setKeyword] = React.useState('');

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<InventoryImportRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<InventoryImportRecord | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);

  const user = useAuthStore((state) => state.user);
  const canCreateImport = Boolean(user?.isSuperAdmin || user?.permissions.inventory?.create);
  const canUpdateImport = Boolean(user?.isSuperAdmin || user?.permissions.inventory?.update);
  const canDeleteAnyShift = Boolean(user?.isSuperAdmin || user?.permissions.inventory?.update);
  const canExportInventory = Boolean(user?.isSuperAdmin || user?.permissions.inventory?.export);

  const importsQuery = useInventoryImportsQuery({
    page,
    limit,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    keyword: keyword.trim() || undefined,
  });
  const { data, isLoading } = importsQuery;

  const deleteMutation = useDeleteInventoryImportMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const totalImportCost = data?.summary.totalImportCost ?? 0;

  const isSameDayRecord = React.useCallback(
    (record: InventoryImportRecord) => {
      const createdDate = record.createdAt ? new Date(record.createdAt) : null;
      const recordDay =
        createdDate && !Number.isNaN(createdDate.getTime())
          ? getBusinessDateIso(createdDate)
          : record.importDate.slice(0, 10);
      return recordDay === todayIso;
    },
    [todayIso],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      notify('inventory.delete.success', {
        vars: { itemName: deleteTarget.itemNameSnapshot },
      });
      setDeleteTarget(null);
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'inventory.delete.error',
        err,
        'Vui lòng thử lại.',
      );
      notify('inventory.delete.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    }
  };

  // 9+1 cột: thêm nhà cung cấp để truy ngược nguồn nhập hàng.
  const columns = React.useMemo<ColumnDef<InventoryImportRecord, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 54,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'importDate',
        header: 'Ngày nhập',
        size: 108,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{formatDateVi(row.original.importDate)}</span>
        ),
      },
      {
        accessorKey: 'itemNameSnapshot',
        header: 'Tên món hàng',
        size: 145,
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">{row.original.itemNameSnapshot}</span>
        ),
      },
      {
        accessorKey: 'supplierNameSnapshot',
        header: 'Nhà cung cấp',
        size: 130,
        cell: ({ row }) => row.original.supplierNameSnapshot || '—',
      },
      {
        accessorKey: 'unitName',
        header: 'ĐVT',
        size: 60,
      },
      {
        accessorKey: 'unitPrice',
        header: 'Đơn giá',
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{row.original.unitPrice.toLocaleString('vi-VN')} đ</span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: 'SL',
        size: 56,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.quantity.toLocaleString('vi-VN')}</span>
        ),
      },
      {
        accessorKey: 'totalCost',
        header: 'Thành tiền',
        size: 108,
        cell: ({ row }) => (
          <span className="font-bold text-price tabular-nums whitespace-nowrap">
            {row.original.totalCost.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        id: 'paymentSource',
        header: 'Nguồn tiền',
        size: 112,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <Badge
              variant={item.paymentSource === 'CASH_DRAWER' ? 'warning' : 'info'}
              data-testid={`import-source-badge-${item.id}`}
            >
              {item.paymentSource === 'CASH_DRAWER' ? 'Tiền két' : 'Quỹ ngoài'}
            </Badge>
          );
        },
      },
      {
        id: 'note',
        header: 'Ghi chú',
        size: 170,
        cell: ({ row }) => <TruncatedTextWithTooltip text={row.original.note} className="text-xs" />,
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 100,
        cell: ({ row }) => {
          const item = row.original;
          const allowedToDelete =
            Boolean(user?.isSuperAdmin || user?.permissions.inventory?.delete) &&
            (canDeleteAnyShift || isSameDayRecord(item));

          return (
            <div className="flex items-center gap-1">
              {canUpdateImport ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid={`edit-import-btn-${item.id}`}
                  className="h-8 w-8"
                  onClick={() => setEditTarget(item)}
                  title="Chỉnh sửa phiếu nhập"
                  aria-label="Chỉnh sửa phiếu nhập"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid={`delete-import-btn-${item.id}`}
                className="h-8 w-8"
                disabled={!allowedToDelete}
                onClick={() => setDeleteTarget(item)}
                title={
                  allowedToDelete
                    ? 'Xoá mềm phiếu nhập'
                    : 'Thu ngân chỉ được xoá phiếu nhập trong ca hiện tại'
                }
                aria-label="Xoá phiếu nhập"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [page, limit, user, canUpdateImport, canDeleteAnyShift, isSameDayRecord],
  );

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const allRows = await fetchAllPaginated<InventoryImportRecord>((targetPage, targetLimit) =>
        apiClient.get<InventoryImportListResponse>('/api/v1/inventory-imports', {
          params: {
            page: targetPage,
            limit: targetLimit,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            keyword: keyword.trim() || undefined,
          },
        }),
      );
      exportToExcel<InventoryImportRecord>({
        filename: `nhap-hang-${fromDate || 'all'}-${toDate || 'all'}.xlsx`,
        sheetName: 'Nhap hang',
        rows: allRows,
        columns: [
          { header: 'STT', value: (_row, idx) => idx + 1, width: 8 },
          { header: 'Ngày nhập', value: (r) => formatDateVi(r.importDate), width: 14 },
          { header: 'Tên món hàng', value: (r) => r.itemNameSnapshot, width: 26 },
          { header: 'Nhà cung cấp', value: (r) => r.supplierNameSnapshot ?? '', width: 24 },
          { header: 'ĐVT', value: (r) => r.unitName, width: 10 },
          { header: 'Đơn giá', value: (r) => r.unitPrice, width: 14 },
          { header: 'Số lượng', value: (r) => r.quantity, width: 12 },
          { header: 'Thành tiền', value: (r) => r.totalCost, width: 15 },
          {
            header: 'Nguồn tiền',
            value: (r) => (r.paymentSource === 'CASH_DRAWER' ? 'Tiền két' : 'Quỹ ngoài'),
            width: 14,
          },
          { header: 'Ghi chú', value: (r) => r.note ?? '', width: 30 },
        ],
      });
      notify('inventory.exportExcelSuccess', {
        variant: 'success',
        vars: { count: allRows.length },
      });
    } catch {
      notify('inventory.exportExcelError', { variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  if (!data && importsQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={importsQuery.error}
        onRetry={() => void importsQuery.refetch()}
      />
    );
  }

  return (
    <div data-testid="inventory-page" className="space-y-4">
      <PageHeader
        path="/inventory"
        defaultTitle="Quản lý Nhập hàng Nguyên vật liệu"
        defaultSubtitle="Tra cứu lịch sử nhập kho và mở Drawer bên phải để nhập hàng liên kết tự động với Master Data."
        titleClassName="text-xl font-bold tracking-tight text-foreground"
        subtitleClassName="text-sm text-muted-foreground"
        actions={
          <>
            <AuditHistoryButton module="INVENTORY" />
            {canExportInventory ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-inventory-excel-btn"
                onClick={() => void handleExportExcel()}
                disabled={isExporting || total === 0}
                className="font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Xuất file Excel</span>
              </Button>
            ) : null}
            {canCreateImport ? (
              <Button
                type="button"
                size="sm"
                data-testid="open-import-drawer-btn"
                onClick={() => setDrawerOpen(true)}
                className="font-bold shadow-xs active:scale-[0.98]"
              >
                <span>Thêm phiếu nhập</span>
              </Button>
            ) : null}
          </>
        }
      />

      <BaseTable
        tableId="inventory"
        data={items}
        columns={columns}
        isLoading={isLoading}
        isFetching={importsQuery.isFetching}
        isPlaceholderData={importsQuery.isPlaceholderData}
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
              <Calendar className="h-4 w-4 text-accent-text" />
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
              className="h-8 w-36 touch-ui:w-44 text-xs"
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
              className="h-8 w-36 touch-ui:w-44 text-xs"
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
              <strong className="text-base text-price">
                {totalImportCost.toLocaleString('vi-VN')} đ
              </strong>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Tiền két:{' '}
              {(data?.summary.totalCashDrawerCost ?? 0).toLocaleString('vi-VN')} đ • Quỹ ngoài:{' '}
              {(data?.summary.totalExternalCost ?? 0).toLocaleString('vi-VN')} đ
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

      <EditInventoryImportDialog
        record={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent data-testid="delete-import-confirm-dialog" className="max-w-md">
          <DialogHeader>
            {(() => {
              const deleteCopy = resolveMessage('inventory.confirm.delete', {
                itemName: deleteTarget?.itemNameSnapshot ?? '',
                totalCost: (deleteTarget?.totalCost ?? 0).toLocaleString('vi-VN'),
              });
              return (
                <>
                  <DialogTitle>{deleteCopy.title}</DialogTitle>
                  <DialogDescription>
                    {deleteCopy.isOverridden && deleteCopy.description ? (
                      deleteCopy.description
                    ) : (
                      <>
                        Bạn có chắc chắn muốn xoá dòng nhập{' '}
                        <strong className="text-foreground">{deleteTarget?.itemNameSnapshot}</strong> (
                        {deleteTarget?.totalCost.toLocaleString('vi-VN')} đ)?
                      </>
                    )}
                  </DialogDescription>
                </>
              );
            })()}
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
