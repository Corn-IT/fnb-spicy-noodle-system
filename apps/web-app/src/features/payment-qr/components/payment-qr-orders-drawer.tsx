import { type PaymentAccount } from '@fnb/shared';
import { Calendar, FileText, QrCode } from 'lucide-react';
import * as React from 'react';

import { DrawerTableSkeleton } from '@/components/loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

import {
  getTodayVietnamDateString,
  usePaymentAccountOrdersQuery,
} from '../api/payment-qr.api';

function formatPaidDateTime(iso: string): string {
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

export interface PaymentQrOrdersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: PaymentAccount | null;
}

export function PaymentQrOrdersDrawer({
  open,
  onOpenChange,
  account,
}: PaymentQrOrdersDrawerProps) {
  const today = React.useMemo(() => getTodayVietnamDateString(), []);
  const [page, setPage] = React.useState(1);
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setPage(1);
      setFromDate('');
      setToDate('');
    }
  }, [open, account?.id]);

  const ordersQuery = usePaymentAccountOrdersQuery(
    open && account ? account.id : null,
    {
      page,
      limit: 20,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    },
  );
  const { data, isLoading, isFetching, isPlaceholderData } = ordersQuery;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalTransferAmount = data?.totalTransferAmount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex h-full w-full max-w-2xl sm:max-w-3xl flex-col overflow-hidden"
        data-testid="payment-qr-orders-drawer"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-accent-text" />
            <span>
              Hoá đơn chuyển khoản — {account?.label ?? ''}
            </span>
          </SheetTitle>
          <SheetDescription>
            {account
              ? `${account.bankName} (${account.bankCode}) • STK: ${account.accountNo} • ${account.accountName}`
              : 'Danh sách các hoá đơn đã thanh toán qua mã QR này'}
          </SheetDescription>
        </SheetHeader>

        {/* Summary Cards */}
        {account ? (
          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="text-[11px] font-medium text-muted-foreground">Đã thu Hôm nay</div>
              <div className="mt-0.5 text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {account.usedDay.toLocaleString('vi-VN')} đ
              </div>
              <div className="text-[10px] text-muted-foreground">
                HM: {account.dailyLimit ? `${account.dailyLimit.toLocaleString('vi-VN')} đ` : 'Không giới hạn'}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="text-[11px] font-medium text-muted-foreground">Đã thu Tháng này</div>
              <div className="mt-0.5 text-sm font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                {account.usedMonth.toLocaleString('vi-VN')} đ
              </div>
              <div className="text-[10px] text-muted-foreground">
                HM: {account.monthlyLimit ? `${account.monthlyLimit.toLocaleString('vi-VN')} đ` : 'Không giới hạn'}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="text-[11px] font-medium text-muted-foreground">Đã thu Năm nay</div>
              <div className="mt-0.5 text-sm font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
                {account.usedYear.toLocaleString('vi-VN')} đ
              </div>
              <div className="text-[10px] text-muted-foreground">
                HM: {account.yearlyLimit ? `${account.yearlyLimit.toLocaleString('vi-VN')} đ` : 'Không giới hạn'}
              </div>
            </div>
          </div>
        ) : null}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-2.5 shrink-0">
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Từ ngày</span>
            </label>
            <Input
              type="date"
              data-testid="payment-qr-orders-from-date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Đến ngày</span>
            </label>
            <Input
              type="date"
              data-testid="payment-qr-orders-to-date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setFromDate(today);
              setToDate(today);
              setPage(1);
            }}
          >
            Hôm nay
          </Button>
          {(fromDate || toDate) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setPage(1);
              }}
            >
              Tất cả thời gian
            </Button>
          ) : null}
          <div className="ml-auto text-right">
            <div className="text-[11px] text-muted-foreground">
              Tổng tiền CK ({total} đơn):
            </div>
            <div
              data-testid="payment-qr-orders-total-transfer"
              className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums"
            >
              {totalTransferAmount.toLocaleString('vi-VN')} đ
            </div>
          </div>
        </div>

        {/* Orders List */}
        <div className="relative flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card">
          {!isLoading && (isFetching || isPlaceholderData) ? (
            <div
              aria-hidden="true"
              className="pointer-events-none sticky top-0 z-20 h-0.5 w-full overflow-hidden bg-primary/15"
            >
              <div className="animate-top-progress h-full w-1/2 rounded-r-full bg-primary" />
            </div>
          ) : null}
          {isLoading ? (
            <DrawerTableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Chưa có hoá đơn chuyển khoản nào gắn với mã QR này trong khoảng thời gian đã chọn.
            </div>
          ) : (
            <table
              className={cn(
                'w-full border-collapse text-left text-xs transition-opacity duration-150',
                (isFetching || isPlaceholderData) && 'opacity-65',
              )}
            >
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-xs border-b border-border text-[11px] font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5">Mã HĐ</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Bàn / Hình thức</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Phương thức</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Tiền CK (Tính HM)</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Tổng HĐ</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Thời gian TT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((order) => (
                  <tr key={order.orderId} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-accent-text" />
                        <span>{order.orderCode}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                      {order.tableLabel ?? 'Mang về'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge
                        variant={order.paymentMethod === 'SPLIT' ? 'warning' : 'success'}
                        className="text-[10px] whitespace-nowrap"
                      >
                        {order.paymentMethod === 'SPLIT' ? 'Kết hợp' : 'Chuyển khoản'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {order.transferAmount.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-muted-foreground tabular-nums">
                      {order.totalAmount.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                      {formatPaidDateTime(order.paidAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t pt-2 text-xs shrink-0">
            <span className="text-muted-foreground">
              Trang {page} / {totalPages} ({total} hoá đơn)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
