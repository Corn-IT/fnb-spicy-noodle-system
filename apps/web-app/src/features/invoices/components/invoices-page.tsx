import { type ColumnDef } from '@tanstack/react-table';
import { type OrderStatus, type PaymentMethod } from '@fnb/shared';
import { Ban, Eye } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getTodayVietnamDate,
  type InvoiceListItem,
  useInvoicesQuery,
} from '@/features/invoices/api/invoices.api';
import { InvoiceDetailModal } from '@/features/invoices/components/invoice-detail-modal';
import {
  InvoiceDualFilterBar,
  type InvoiceSearchField,
} from '@/features/invoices/components/invoice-dual-filter-bar';
import { VoidInvoiceDialog } from '@/features/invoices/components/void-invoice-dialog';
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

export function InvoicesPage() {
  const today = React.useMemo(() => getTodayVietnamDate(), []);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [fromDate, setFromDate] = React.useState(today);
  const [toDate, setToDate] = React.useState(today);
  const [status, setStatus] = React.useState<OrderStatus | ''>('');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | ''>('');
  const [searchField, setSearchField] = React.useState<InvoiceSearchField>('order_code');
  const [keyword, setKeyword] = React.useState('');

  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<InvoiceListItem | null>(null);

  const user = useAuthStore((state) => state.user);
  const canVoidInvoice = Boolean(user?.isSuperAdmin);

  const { data, isLoading } = useInvoicesQuery({
    page,
    limit,
    fromDate,
    toDate,
    status: status || undefined,
    paymentMethod: paymentMethod || undefined,
    searchField,
    keyword: keyword.trim() || undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const columns = React.useMemo<ColumnDef<InvoiceListItem, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 48,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'orderCode',
        header: 'Mã HĐ',
        size: 146,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedOrderId(row.original.orderId)}
            className="font-mono font-semibold text-primary hover:underline whitespace-nowrap"
          >
            {row.original.orderCode}
          </button>
        ),
      },
      {
        id: 'tableOrType',
        header: 'Bàn / Loại',
        size: 112,
        cell: ({ row }) => {
          const item = row.original;
          const label =
            item.tableLabel ??
            (item.orderType === 'TAKEAWAY' && item.takeawayNumber !== null
              ? `Mang về #${String(item.takeawayNumber).padStart(2, '0')}`
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
        header: 'Thời điểm tạo',
        size: 146,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{formatDateTimeCell(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'amountAndPayment',
        header: 'Tổng tiền & PTTT',
        size: 168,
        cell: ({ row }) => {
          const item = row.original;
          const pm = item.paymentMethod;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-bold text-foreground tabular-nums">
                {item.totalAmount.toLocaleString('vi-VN')} đ
              </span>
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
                  {pm}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'noteAndStatus',
        header: 'Trạng thái & Ghi chú',
        size: 174,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                variant={
                  item.status === 'PAID'
                    ? 'success'
                    : item.status === 'VOIDED'
                      ? 'destructive'
                      : item.status === 'SERVING'
                        ? 'warning'
                        : 'secondary'
                }
              >
                {item.status}
              </Badge>
              {item.note ? (
                <span className="truncate text-xs text-muted-foreground" title={item.note}>
                  {item.note}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 240,
        minSize: 230,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid={`view-invoice-btn-${item.orderId}`}
                className="font-medium active:scale-95 shrink-0"
                onClick={() => setSelectedOrderId(item.orderId)}
                title="Xem chi tiết & In lại hoá đơn"
              >
                <Eye className="h-3.5 w-3.5 shrink-0" />
                <span>Chi tiết</span>
              </Button>

              {canVoidInvoice && item.status === 'PAID' ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  data-testid={`void-invoice-btn-${item.orderId}`}
                  className="font-medium active:scale-95 shrink-0"
                  onClick={() => setVoidTarget(item)}
                >
                  <Ban className="h-3.5 w-3.5 shrink-0" />
                  <span>Huỷ đơn (Void)</span>
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [page, limit, canVoidInvoice],
  );

  return (
    <div data-testid="invoices-page" className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Quản lý & Tra cứu Hoá đơn
        </h1>
        <p className="text-sm text-muted-foreground">
          Tra cứu lịch sử hoá đơn theo bộ lọc kép, xem chi tiết các lượt gọi bếp, in lại bill nhiệt
          và huỷ đơn ngoại lệ.
        </p>
      </div>

      <InvoiceDualFilterBar
        fromDate={fromDate}
        toDate={toDate}
        status={status}
        paymentMethod={paymentMethod}
        searchField={searchField}
        keyword={keyword}
        onDateRangeChange={(nextFrom, nextTo) => {
          setFromDate(nextFrom);
          setToDate(nextTo);
          setPage(1);
        }}
        onStatusChange={(nextStatus) => {
          setStatus(nextStatus);
          setPage(1);
        }}
        onPaymentMethodChange={(nextPaymentMethod) => {
          setPaymentMethod(nextPaymentMethod);
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
        emptyMessage="Không tìm thấy hoá đơn nào trong khoảng thời gian đã chọn."
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
