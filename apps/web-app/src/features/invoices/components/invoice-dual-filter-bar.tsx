import { Calendar, RotateCcw, Search } from 'lucide-react';
import * as React from 'react';
import { OrderStatus, PaymentMethod } from '@fnb/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getTodayVietnamDate } from '@/features/invoices/api/invoices.api';

export type InvoiceSearchField = 'order_code' | 'table' | 'note';

export interface InvoiceDualFilterBarProps {
  fromDate: string;
  toDate: string;
  status: OrderStatus | '';
  paymentMethod: PaymentMethod | '';
  searchField: InvoiceSearchField;
  keyword: string;
  onDateRangeChange: (fromDate: string, toDate: string) => void;
  onStatusChange: (status: OrderStatus | '') => void;
  onPaymentMethodChange: (paymentMethod: PaymentMethod | '') => void;
  onSearchFieldChange: (searchField: InvoiceSearchField) => void;
  onKeywordChange: (keyword: string) => void;
}

export function InvoiceDualFilterBar({
  fromDate,
  toDate,
  status,
  paymentMethod,
  searchField,
  keyword,
  onDateRangeChange,
  onStatusChange,
  onPaymentMethodChange,
  onSearchFieldChange,
  onKeywordChange,
}: InvoiceDualFilterBarProps) {
  const today = React.useMemo(() => getTodayVietnamDate(), []);

  const setPresetRange = (preset: 'today' | 'yesterday' | 'week') => {
    const base = new Date(`${today}T00:00:00+07:00`);
    if (preset === 'today') {
      onDateRangeChange(today, today);
      return;
    }
    if (preset === 'yesterday') {
      const yesterday = new Date(base.getTime() - 24 * 60 * 60 * 1000);
      const yStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(yesterday);
      onDateRangeChange(yStr, yStr);
      return;
    }
    const weekAgo = new Date(base.getTime() - 6 * 24 * 60 * 60 * 1000);
    const wStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(weekAgo);
    onDateRangeChange(wStr, today);
  };

  const isTodaySelected = fromDate === today && toDate === today;

  return (
    <div
      data-testid="invoice-dual-filter-bar"
      className="flex w-full flex-col gap-3 rounded-xl border bg-card p-3 sm:p-3.5 shadow-sm xl:flex-row xl:items-center xl:justify-between"
    >
      {/* Bên trái: DateRangePicker (Mặc định Hôm nay) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground shrink-0">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <span className="whitespace-nowrap">Khoảng thời gian:</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant={isTodaySelected ? 'default' : 'outline'}
            size="sm"
            data-testid="preset-today-btn"
            onClick={() => setPresetRange('today')}
            className="h-8 px-2.5 text-xs whitespace-nowrap"
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="preset-yesterday-btn"
            onClick={() => setPresetRange('yesterday')}
            className="h-8 px-2.5 text-xs whitespace-nowrap"
          >
            Hôm qua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="preset-week-btn"
            onClick={() => setPresetRange('week')}
            className="h-8 px-2.5 text-xs whitespace-nowrap"
          >
            7 ngày
          </Button>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Input
            type="date"
            aria-label="Từ ngày"
            data-testid="invoice-from-date-input"
            value={fromDate}
            onChange={(e) => onDateRangeChange(e.target.value, toDate)}
            className="h-8 flex-1 sm:w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground shrink-0">→</span>
          <Input
            type="date"
            aria-label="Đến ngày"
            data-testid="invoice-to-date-input"
            value={toDate}
            onChange={(e) => onDateRangeChange(fromDate, e.target.value)}
            className="h-8 flex-1 sm:w-36 text-xs"
          />
        </div>
      </div>

      {/* Bộ lọc trạng thái, thanh toán và tiêu chí tìm kiếm được kết hợp bằng AND. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Lọc trạng thái hoá đơn"
          data-testid="invoice-status-filter"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as OrderStatus | '')}
          className="h-9 flex-1 sm:flex-none rounded-md border border-input bg-background px-2.5 py-1 text-xs sm:text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Tất cả trạng thái</option>
          <option value={OrderStatus.PENDING}>Chờ xử lý</option>
          <option value={OrderStatus.SERVING}>Đang phục vụ</option>
          <option value={OrderStatus.PAID}>Đã thanh toán</option>
          <option value={OrderStatus.VOIDED}>Đã huỷ</option>
        </select>

        <select
          aria-label="Lọc phương thức thanh toán"
          data-testid="invoice-payment-filter"
          value={paymentMethod}
          onChange={(e) => onPaymentMethodChange(e.target.value as PaymentMethod | '')}
          className="h-9 flex-1 sm:flex-none rounded-md border border-input bg-background px-2.5 py-1 text-xs sm:text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Tất cả phương thức</option>
          <option value={PaymentMethod.CASH}>Tiền mặt</option>
          <option value={PaymentMethod.TRANSFER}>Chuyển khoản</option>
          <option value={PaymentMethod.SPLIT}>Kết hợp</option>
        </select>

        <select
          aria-label="Tiêu chí tìm kiếm hoá đơn"
          data-testid="invoice-search-field-select"
          value={searchField}
          onChange={(e) => onSearchFieldChange(e.target.value as InvoiceSearchField)}
          className="h-9 w-full sm:w-auto rounded-md border border-input bg-background px-2.5 py-1 text-xs sm:text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="order_code">Mã hoá đơn</option>
          <option value="table">Số bàn</option>
          <option value="note">Ghi chú</option>
        </select>

        <div className="relative flex-1 min-w-[200px] sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="invoice-keyword-input"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={
              searchField === 'order_code'
                ? 'Nhập mã HĐ (VD: HD-2026...)'
                : searchField === 'table'
                  ? 'Nhập số bàn (VD: Bàn 05)...'
                  : 'Nhập nội dung ghi chú...'
            }
            className="pl-8 w-full h-9 text-xs sm:text-sm"
          />
        </div>

        {keyword ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onKeywordChange('')}
            title="Xoá từ khoá"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
