import { type ColumnDef } from '@tanstack/react-table';
import { formatTakeawayLabel, type OrderType, type PaymentMethod } from '@fnb/shared';
import { Ban, CheckCircle2, Eye, FileSpreadsheet, Pencil, ShieldCheck, XCircle } from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
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
  getTodayVietnamDate,
  type InvoiceListItem,
  type InvoiceListResponse,
  useInvoicesQuery,
  useReviewInvoicePaymentEditMutation,
  useUpdateInvoicePaymentMethodMutation,
  useVoidInvoiceMutation,
} from '@/features/invoices/api/invoices.api';
import { InvoiceDetailModal } from '@/features/invoices/components/invoice-detail-modal';
import {
  InvoiceDualFilterBar,
  type InvoiceSearchField,
} from '@/features/invoices/components/invoice-dual-filter-bar';
import { apiClient } from '@/lib/api-client';
import { exportToExcel, fetchAllPaginated } from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

function formatDateTimeCell(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

function getPaymentMethodLabel(pm: PaymentMethod | null | undefined): string {
  if (pm === 'CASH') return 'Tiền mặt';
  if (pm === 'TRANSFER') return 'Chuyển khoản';
  if (pm === 'SPLIT') return 'Kết hợp';
  return 'Chưa có';
}

export function InvoicesPage() {
  const { notify } = useAppMessages();
  const today = React.useMemo(() => getTodayVietnamDate(), []);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [fromDate, setFromDate] = React.useState(today);
  const [toDate, setToDate] = React.useState(today);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | ''>('');
  const [orderType, setOrderType] = React.useState<OrderType | ''>('');
  const [searchField, setSearchField] = React.useState<InvoiceSearchField>('order_code');
  const [keyword, setKeyword] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);

  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);
  const [editTarget, setEditTarget] = React.useState<InvoiceListItem | null>(null);
  const [reviewTarget, setReviewTarget] = React.useState<InvoiceListItem | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<InvoiceListItem | null>(null);

  const user = useAuthStore((state) => state.user);
  const canEditPayment = Boolean(user?.isSuperAdmin || user?.permissions?.invoices?.update);
  const canApprovePayment = Boolean(user?.isSuperAdmin || user?.permissions?.invoices?.approve);
  const canVoidInvoices = Boolean(user?.isSuperAdmin || user?.permissions?.invoices?.void);
  const canExportInvoices = Boolean(user?.isSuperAdmin || user?.permissions?.invoices?.export);

  const invoicesQuery = useInvoicesQuery({
    page,
    limit,
    fromDate,
    toDate,
    status: 'PAID',
    paymentMethod: paymentMethod || undefined,
    orderType: orderType || undefined,
    searchField,
    keyword: keyword.trim() || undefined,
  });
  const { data, isLoading } = invoicesQuery;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const totalPaidAmount =
    data?.summary?.totalPaidAmount ??
    items.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalCashAmount =
    data?.summary?.totalCashAmount ??
    items.reduce((sum, item) => sum + item.cashAmount, 0);
  const totalTransferAmount =
    data?.summary?.totalTransferAmount ??
    items.reduce((sum, item) => sum + item.transferAmount, 0);
  const totalDiscountAmount =
    data?.summary?.totalDiscountAmount ??
    items.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);

  const columns = React.useMemo<ColumnDef<InvoiceListItem, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 54,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'orderCode',
        header: 'Mã HĐ',
        size: 168,
        minSize: 160,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedOrderId(row.original.orderId)}
            className="pr-2 font-mono font-semibold text-accent-text hover:underline whitespace-nowrap"
          >
            {row.original.orderCode}
          </button>
        ),
      },
      {
        id: 'tableOrType',
        header: 'Bàn / Loại',
        size: 100,
        cell: ({ row }) => {
          const item = row.original;
          const label =
            item.tableLabel ??
            (item.orderType === 'TAKEAWAY' && item.takeawayNumber !== null
              ? formatTakeawayLabel(item.takeawayNumber, item.takeawayLabelFormat)
              : 'Tại bàn');
          return (
            <Badge
              variant={item.orderType === 'TAKEAWAY' ? 'info' : 'secondary'}
            >
              {label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Thời điểm',
        size: 142,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col text-xs tabular-nums whitespace-nowrap">
              <span>{formatDateTimeCell(item.createdAt)}</span>
              {item.paidAt ? (
                <span className="text-[11px] text-muted-foreground">
                  TT: {formatDateTimeCell(item.paidAt)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'subtotalAmount',
        header: 'Tiền hàng',
        size: 106,
        cell: ({ row }) => {
          const item = row.original;
          const subtotal = item.subtotalAmount ?? item.totalAmount + (item.discountAmount ?? 0);
          return (
            <span className="text-muted-foreground tabular-nums whitespace-nowrap">
              {subtotal.toLocaleString('vi-VN')} đ
            </span>
          );
        },
      },
      {
        id: 'discountAmount',
        header: 'Giảm giá',
        size: 130,
        cell: ({ row }) => {
          const item = row.original;
          const discountAmount = item.discountAmount ?? 0;
          const snap = item.discountSnapshot;
          const tag =
            snap?.kind === 'CODE'
              ? (snap.code ?? snap.name)
              : snap
                ? 'THỦ CÔNG'
                : null;
          if (discountAmount <= 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="space-y-0.5 whitespace-nowrap">
              <div className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                -{discountAmount.toLocaleString('vi-VN')} đ
              </div>
              {tag ? (
                <div className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {tag}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'totalAmount',
        header: 'Tổng tiền',
        size: 106,
        cell: ({ row }) => (
          <span className="font-bold text-foreground tabular-nums whitespace-nowrap">
            {row.original.totalAmount.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        id: 'paymentMethod',
        header: 'Phương thức',
        size: 126,
        cell: ({ row }) => {
          const item = row.original;
          const pm = item.paymentMethod;
          const pending = item.pendingPaymentEdit;
          return (
            <div className="flex flex-col items-start gap-1">
              {pm ? (
                <span
                  data-testid={`payment-badge-${item.orderId}`}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold leading-normal whitespace-nowrap text-center select-none',
                    pm === 'CASH' &&
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                    pm === 'TRANSFER' &&
                      'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
                    pm === 'SPLIT' &&
                      'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
                  )}
                >
                  {getPaymentMethodLabel(pm)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              {pending ? (
                <span
                  data-testid={`pending-payment-badge-${item.orderId}`}
                  className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  Chờ duyệt → {getPaymentMethodLabel(pending.paymentMethod)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        size: 132,
        cell: ({ row }) => {
          const item = row.original;
          const statusLabel =
            item.status === 'PAID'
              ? 'Đã thanh toán'
              : item.status === 'SERVING'
                ? 'Đang phục vụ'
                : item.status === 'PENDING'
                  ? 'Mới gọi món'
                  : item.status;
          return (
            <Badge
              variant={
                item.status === 'PAID'
                  ? 'success'
                  : item.status === 'SERVING'
                    ? 'warning'
                    : 'secondary'
              }
            >
              {statusLabel}
            </Badge>
          );
        },
      },
      {
        id: 'note',
        header: 'Ghi chú',
        size: 180,
        cell: ({ row }) => (
          <div className="max-w-[180px] min-w-0">
            <TruncatedTextWithTooltip text={row.original.note} />
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 132,
        minSize: 120,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1 whitespace-nowrap">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid={`view-invoice-btn-${item.orderId}`}
                className="h-8 w-8 active:scale-95 shrink-0"
                onClick={() => setSelectedOrderId(item.orderId)}
                title="Xem chi tiết hoá đơn"
                aria-label="Xem chi tiết hoá đơn"
              >
                <Eye className="h-4 w-4 shrink-0" />
              </Button>

              {canEditPayment && item.status === 'PAID' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid={`edit-payment-btn-${item.orderId}`}
                  className="h-8 w-8 active:scale-95 shrink-0"
                  onClick={() => setEditTarget(item)}
                  title="Chỉnh sửa phương thức thanh toán"
                  aria-label="Chỉnh sửa phương thức thanh toán"
                >
                  <Pencil className="h-4 w-4 shrink-0" />
                </Button>
              ) : null}

              {canApprovePayment && item.pendingPaymentEdit ? (
                <Button
                  type="button"
                  size="sm"
                  data-testid={`review-payment-btn-${item.orderId}`}
                  className="h-7 bg-amber-600 px-2 text-xs text-white hover:bg-amber-700 font-medium active:scale-95 shrink-0"
                  onClick={() => setReviewTarget(item)}
                  title="Duyệt hoặc từ chối yêu cầu sửa PTTT"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>Duyệt</span>
                </Button>
              ) : null}

              {canVoidInvoices && item.status === 'PAID' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid={`void-invoice-btn-${item.orderId}`}
                  className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/60 active:scale-95 shrink-0"
                  onClick={() => setVoidTarget(item)}
                  title="Huỷ hoá đơn (Void)"
                  aria-label="Huỷ hoá đơn (Void)"
                >
                  <Ban className="h-4 w-4 shrink-0" />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [page, limit, canEditPayment, canApprovePayment, canVoidInvoices],
  );

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const allRows = await fetchAllPaginated<InvoiceListItem>((targetPage, targetLimit) =>
        apiClient.get<InvoiceListResponse>('/api/v1/invoices', {
          params: {
            page: targetPage,
            limit: targetLimit,
            fromDate,
            toDate,
            status: 'PAID',
            paymentMethod: paymentMethod || undefined,
            orderType: orderType || undefined,
            searchField: keyword.trim() ? searchField : undefined,
            keyword: keyword.trim() || undefined,
          },
        }),
      );
      exportToExcel<InvoiceListItem>({
        filename: `hoa-don-${fromDate || 'all'}-${toDate || 'all'}.xlsx`,
        sheetName: 'Hoa don',
        rows: allRows,
        columns: [
          { header: 'STT', value: (_row, idx) => idx + 1, width: 8 },
          { header: 'Mã HĐ', value: (r) => r.orderCode, width: 22 },
          {
            header: 'Bàn / Loại',
            value: (r) =>
              r.tableLabel ??
              (r.orderType === 'TAKEAWAY' && r.takeawayNumber !== null
                ? formatTakeawayLabel(r.takeawayNumber, r.takeawayLabelFormat)
                : 'Tại bàn'),
            width: 16,
          },
          { header: 'Thời điểm tạo', value: (r) => formatDateTimeCell(r.createdAt), width: 22 },
          { header: 'Thời điểm TT', value: (r) => (r.paidAt ? formatDateTimeCell(r.paidAt) : ''), width: 22 },
          {
            header: 'Tiền hàng',
            value: (r) => r.subtotalAmount ?? r.totalAmount + (r.discountAmount ?? 0),
            width: 15,
          },
          { header: 'Giảm giá', value: (r) => r.discountAmount ?? 0, width: 14 },
          {
            header: 'Mã KM',
            value: (r) =>
              r.discountSnapshot?.kind === 'CODE'
                ? (r.discountSnapshot.code ?? r.discountSnapshot.name)
                : r.discountSnapshot
                  ? 'THỦ CÔNG'
                  : '',
            width: 16,
          },
          { header: 'Tổng tiền', value: (r) => r.totalAmount, width: 15 },
          { header: 'Tiền mặt', value: (r) => r.cashAmount, width: 15 },
          { header: 'Chuyển khoản', value: (r) => r.transferAmount, width: 15 },
          { header: 'Phương thức', value: (r) => getPaymentMethodLabel(r.paymentMethod), width: 16 },
          { header: 'Trạng thái', value: () => 'Đã thanh toán', width: 16 },
          { header: 'Ghi chú', value: (r) => r.note ?? '', width: 28 },
        ],
      });
      notify('invoices.exportExcelSuccess', {
        variant: 'success',
        vars: { count: allRows.length },
      });
    } catch {
      notify('invoices.exportExcelError', { variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  if (!data && invoicesQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={invoicesQuery.error}
        onRetry={() => void invoicesQuery.refetch()}
      />
    );
  }

  return (
    <div data-testid="invoices-page" className="space-y-4">
      <PageHeader
        path="/invoices"
        defaultTitle="Quản lý & Tra cứu Hoá đơn"
        defaultSubtitle="Tra cứu lịch sử hoá đơn đã thanh toán, xem chi tiết các lượt gọi bếp, in lại bill nhiệt và điều chỉnh phương thức thanh toán theo quy trình duyệt."
        titleClassName="text-xl font-bold tracking-tight text-foreground"
        subtitleClassName="text-sm text-muted-foreground"
        actions={
          <>
            <AuditHistoryButton module="INVOICES" />
            {canExportInvoices ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-invoices-excel-btn"
                onClick={() => void handleExportExcel()}
                disabled={isExporting || total === 0}
                className="font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Xuất file Excel</span>
              </Button>
            ) : null}
          </>
        }
      />

      <InvoiceDualFilterBar
        fromDate={fromDate}
        toDate={toDate}
        paymentMethod={paymentMethod}
        orderType={orderType}
        searchField={searchField}
        keyword={keyword}
        onDateRangeChange={(nextFrom, nextTo) => {
          setFromDate(nextFrom);
          setToDate(nextTo);
          setPage(1);
        }}
        onPaymentMethodChange={(nextPaymentMethod) => {
          setPaymentMethod(nextPaymentMethod);
          setPage(1);
        }}
        onOrderTypeChange={(nextOrderType) => {
          setOrderType(nextOrderType);
          setPage(1);
        }}
        onSearchFieldChange={(nextField) => {
          setSearchField(nextField);
          setPage(1);
        }}
        onKeywordChange={(nextKey) => {
          setKeyword(nextKey);
          setPage(1);
        }}
      />

      <BaseTable
        tableId="invoices"
        data={items}
        columns={columns}
        isLoading={isLoading}
        isFetching={invoicesQuery.isFetching}
        isPlaceholderData={invoicesQuery.isPlaceholderData}
        emptyMessage="Không tìm thấy hoá đơn nào trong khoảng thời gian đã chọn."
        footerSummary={
          <div
            data-testid="invoices-footer-total"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              Tổng tiền hoá đơn thanh toán trong kỳ:{' '}
              <strong className="text-base text-price">
                {totalPaidAmount.toLocaleString('vi-VN')} đ
              </strong>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Tiền mặt: {totalCashAmount.toLocaleString('vi-VN')} đ • Chuyển khoản:{' '}
              {totalTransferAmount.toLocaleString('vi-VN')} đ • Tổng giảm giá:{' '}
              {totalDiscountAmount.toLocaleString('vi-VN')} đ ({total} hoá đơn)
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

      <InvoiceDetailModal
        orderId={selectedOrderId}
        open={selectedOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      />

      <EditPaymentMethodDialog
        invoice={editTarget}
        open={editTarget !== null}
        canAutoApprove={canApprovePayment}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />

      <ReviewPaymentEditDialog
        invoice={reviewTarget}
        open={reviewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null);
        }}
      />

      <VoidInvoiceDialog
        invoice={voidTarget}
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
      />
    </div>
  );
}

interface EditPaymentMethodDialogProps {
  invoice: InvoiceListItem | null;
  open: boolean;
  canAutoApprove: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditPaymentMethodDialog({
  invoice,
  open,
  canAutoApprove,
  onOpenChange,
}: EditPaymentMethodDialogProps) {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const [method, setMethod] = React.useState<PaymentMethod>('CASH');
  const [cashAmountInput, setCashAmountInput] = React.useState('');
  const [reason, setReason] = React.useState('');
  const mutation = useUpdateInvoicePaymentMethodMutation();

  React.useEffect(() => {
    if (open && invoice) {
      setMethod(invoice.paymentMethod ?? 'CASH');
      setCashAmountInput(
        invoice.paymentMethod === 'SPLIT'
          ? String(invoice.cashAmount || Math.floor(invoice.totalAmount / 2))
          : String(Math.floor(invoice.totalAmount / 2)),
      );
      setReason('');
    }
  }, [open, invoice]);

  if (!invoice) return null;

  const parsedCash = Number(cashAmountInput) || 0;
  const computedTransfer = Math.max(0, invoice.totalAmount - parsedCash);
  const isSplitValid =
    method !== 'SPLIT' ||
    (parsedCash > 0 && computedTransfer > 0 && Math.round(parsedCash + computedTransfer) === Math.round(invoice.totalAmount));
  const isReasonValid = reason.trim().length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid || !isSplitValid) return;
    try {
      const result = await mutation.mutateAsync({
        orderId: invoice.orderId,
        body: {
          paymentMethod: method,
          cashAmount: method === 'CASH' ? invoice.totalAmount : method === 'SPLIT' ? parsedCash : 0,
          transferAmount: method === 'TRANSFER' ? invoice.totalAmount : method === 'SPLIT' ? computedTransfer : 0,
          reason: reason.trim(),
        },
      });
      notify(
        result.status === 'APPLIED'
          ? 'invoices.paymentEdit.appliedSuccess'
          : 'invoices.paymentEdit.pendingSuccess',
        {
          variant: 'success',
          vars: { orderCode: invoice.orderCode },
        },
      );
      onOpenChange(false);
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'invoices.paymentEdit.error',
        error,
        'Vui lòng thử lại sau.',
      );
      notify('invoices.paymentEdit.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại sau.' },
      });
    }
  };

  const editConfirmCopy = resolveMessage('invoices.confirm.editPaymentMethod', {
    orderCode: invoice.orderCode,
    totalAmount: invoice.totalAmount.toLocaleString('vi-VN'),
    modeNote: canAutoApprove
      ? 'Thay đổi sẽ được áp dụng ngay và tự động đồng bộ kết ca.'
      : 'Thay đổi sẽ được gửi tới tài khoản có quyền duyệt để xác nhận.',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-payment-method-dialog" className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editConfirmCopy.title}</DialogTitle>
            <DialogDescription>
              {editConfirmCopy.isOverridden && editConfirmCopy.description ? (
                editConfirmCopy.description
              ) : (
                <>
                  Hoá đơn <strong>{invoice.orderCode}</strong> — Tổng tiền:{' '}
                  <strong>{invoice.totalAmount.toLocaleString('vi-VN')} đ</strong>.{' '}
                  {canAutoApprove
                    ? 'Thay đổi sẽ được áp dụng ngay và tự động đồng bộ kết ca.'
                    : 'Thay đổi sẽ được gửi tới tài khoản có quyền duyệt để xác nhận.'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Phương thức thanh toán mới
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['CASH', 'TRANSFER', 'SPLIT'] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    data-testid={`edit-pm-option-${pm}`}
                    onClick={() => setMethod(pm)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                      method === pm
                        ? 'border-primary bg-primary/10 text-accent-text'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {getPaymentMethodLabel(pm)}
                  </button>
                ))}
              </div>
            </div>

            {method === 'SPLIT' ? (
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tiền mặt (đ)</label>
                  <CurrencyInput
                    value={cashAmountInput}
                    onValueChange={(rawDigits) => setCashAmountInput(rawDigits)}
                    placeholder="VD: 100.000"
                    suffix="đ"
                    data-testid="edit-pm-cash-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Chuyển khoản (đ)</label>
                  <Input
                    type="text"
                    readOnly
                    value={computedTransfer.toLocaleString('vi-VN')}
                    className="bg-muted font-semibold"
                  />
                </div>
                {!isSplitValid ? (
                  <p className="col-span-2 text-xs text-destructive">
                    Tiền mặt và chuyển khoản phải lớn hơn 0 và cộng lại bằng tổng hoá đơn.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="edit-pm-reason" className="text-xs font-semibold text-foreground">
                Lý do điều chỉnh <span className="text-destructive">*</span>
              </label>
              <textarea
                id="edit-pm-reason"
                data-testid="edit-pm-reason-input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Khách quét QR chuyển khoản nhưng thu ngân bấm nhầm Tiền mặt..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ bỏ
            </Button>
            <Button
              type="submit"
              data-testid="submit-edit-pm-btn"
              disabled={!isReasonValid || !isSplitValid || mutation.isPending}
            >
              {canAutoApprove ? 'Lưu thay đổi' : 'Gửi duyệt sửa PTTT'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ReviewPaymentEditDialogProps {
  invoice: InvoiceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReviewPaymentEditDialog({
  invoice,
  open,
  onOpenChange,
}: ReviewPaymentEditDialogProps) {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const [reviewNote, setReviewNote] = React.useState('');
  const reviewMutation = useReviewInvoicePaymentEditMutation();

  React.useEffect(() => {
    if (open) setReviewNote('');
  }, [open, invoice?.orderId]);

  if (!invoice || !invoice.pendingPaymentEdit) return null;
  const pending = invoice.pendingPaymentEdit;

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    try {
      await reviewMutation.mutateAsync({
        orderId: invoice.orderId,
        body: {
          decision,
          reviewNote: reviewNote.trim() || undefined,
        },
      });
      notify(
        decision === 'APPROVE'
          ? 'invoices.paymentReview.approveSuccess'
          : 'invoices.paymentReview.rejectSuccess',
        {
          variant: 'success',
          vars: { orderCode: invoice.orderCode },
        },
      );
      onOpenChange(false);
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'invoices.paymentReview.error',
        error,
        'Vui lòng thử lại sau.',
      );
      notify('invoices.paymentReview.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại sau.' },
      });
    }
  };

  const reviewConfirmCopy = resolveMessage('invoices.confirm.reviewPaymentEdit', {
    orderCode: invoice.orderCode,
    totalAmount: invoice.totalAmount.toLocaleString('vi-VN'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="review-payment-edit-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reviewConfirmCopy.title}</DialogTitle>
          <DialogDescription>
            {reviewConfirmCopy.isOverridden && reviewConfirmCopy.description ? (
              reviewConfirmCopy.description
            ) : (
              <>
                Hoá đơn <strong>{invoice.orderCode}</strong> ({invoice.totalAmount.toLocaleString('vi-VN')} đ)
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
            <div>
              <span className="text-muted-foreground">Người đề xuất: </span>
              <span className="font-semibold">
                {pending.requestedByName} ({pending.requestedByUsername})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">PTTT hiện tại: </span>
              <span className="font-semibold">{getPaymentMethodLabel(invoice.paymentMethod)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Đề xuất đổi sang: </span>
              <span className="font-bold text-accent-text">
                {getPaymentMethodLabel(pending.paymentMethod)}
              </span>
              {pending.paymentMethod === 'SPLIT'
                ? ` (${pending.cashAmount.toLocaleString('vi-VN')} đ tiền mặt + ${pending.transferAmount.toLocaleString('vi-VN')} đ chuyển khoản)`
                : ''}
            </div>
            <div>
              <span className="text-muted-foreground">Lý do: </span>
              <span className="italic">{pending.reason}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Ghi chú duyệt (tuỳ chọn)</label>
            <Input
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Nhập ghi chú đối soát..."
              data-testid="review-pm-note-input"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="destructive"
            data-testid="reject-pm-edit-btn"
            disabled={reviewMutation.isPending}
            onClick={() => void handleDecision('REJECT')}
          >
            <XCircle className="h-4 w-4" />
            <span>Từ chối</span>
          </Button>
          <Button
            type="button"
            data-testid="approve-pm-edit-btn"
            disabled={reviewMutation.isPending}
            onClick={() => void handleDecision('APPROVE')}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Duyệt thay đổi</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VoidInvoiceDialogProps {
  invoice: InvoiceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function VoidInvoiceDialog({ invoice, open, onOpenChange }: VoidInvoiceDialogProps) {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const [voidReason, setVoidReason] = React.useState('');
  const voidMutation = useVoidInvoiceMutation();

  React.useEffect(() => {
    if (open) {
      setVoidReason('');
    }
  }, [open, invoice?.orderId]);

  if (!invoice) return null;

  const trimmedReason = voidReason.trim();
  const isReasonValid = trimmedReason.length >= 10 && trimmedReason.length <= 500;

  const voidCopy = resolveMessage('invoices.confirm.voidInvoice', {
    orderCode: invoice.orderCode,
    totalAmount: invoice.totalAmount.toLocaleString('vi-VN'),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid || voidMutation.isPending) return;
    try {
      await voidMutation.mutateAsync({
        orderId: invoice.orderId,
        body: { voidReason: trimmedReason },
      });
      notify('invoices.void.success', {
        variant: 'success',
        vars: { orderCode: invoice.orderCode },
      });
      onOpenChange(false);
    } catch (err) {
      const resolvedErr = resolveErrorMessage('invoices.void.error', err, 'Không thể huỷ hoá đơn');
      notify('invoices.void.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể huỷ hoá đơn' },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="void-invoice-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{voidCopy.title}</DialogTitle>
          <DialogDescription>
            {voidCopy.isOverridden && voidCopy.description ? (
              voidCopy.description
            ) : (
              <>
                Huỷ hoá đơn <strong>{invoice.orderCode}</strong> ({invoice.totalAmount.toLocaleString('vi-VN')} đ). Thao tác này không thể hoàn tác.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="rounded-lg border border-rose-500/40 bg-rose-50/70 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            Hoá đơn sẽ chuyển sang trạng thái <strong>VOIDED</strong>, bị loại khỏi công thức Kết ca và hoàn trả lượt sử dụng mã giảm giá (nếu có).
          </div>

          <div className="space-y-1.5">
            <label htmlFor="void-invoice-reason" className="text-xs font-semibold text-foreground">
              Lý do huỷ hoá đơn (bắt buộc tối thiểu 10 ký tự) *
            </label>
            <textarea
              id="void-invoice-reason"
              data-testid="void-invoice-reason-input"
              rows={3}
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="VD: Khách phản ánh tính sai món hoặc nhập nhầm đơn thanh toán..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Tối thiểu 10 ký tự để ghi nhận lịch sử thao tác</span>
              <span className={cn(trimmedReason.length > 0 && trimmedReason.length < 10 && 'text-rose-600 font-semibold')}>
                {trimmedReason.length}/500
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={voidMutation.isPending}
            >
              Đóng
            </Button>
            <Button
              type="submit"
              variant="destructive"
              data-testid="confirm-void-invoice-btn"
              disabled={!isReasonValid || voidMutation.isPending}
            >
              <Ban className="h-4 w-4" />
              <span>{voidMutation.isPending ? 'Đang huỷ...' : 'Xác nhận Huỷ hoá đơn'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
