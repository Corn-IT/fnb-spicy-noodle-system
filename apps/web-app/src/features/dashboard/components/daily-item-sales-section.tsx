import { type DashboardDailyItemSaleRow } from '@fnb/shared';
import { type ColumnDef } from '@tanstack/react-table';
import { Download, EyeOff, UtensilsCrossed } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

import {
  type DashboardFilterParams,
  formatDashboardDateVi,
  useDashboardDailyItemSales,
} from '../api/dashboard.api';

export interface DailyItemSalesSectionProps {
  id?: string;
  filter: DashboardFilterParams;
  onFilterChange: (next: DashboardFilterParams) => void;
  canExport: boolean;
  todayIso: string;
}

type SortKey = 'revenue:desc' | 'qty:desc' | 'orderCount:desc' | 'name:asc';

const STATION_LABELS: Record<string, string> = {
  BEP_NAU: 'Bếp Nấu',
  BEP_CHIEN: 'Bếp Chiên',
  PHA_CHE: 'Pha Chế',
  COMBO: 'Combo',
};

function formatStationLabel(station: string): string {
  return STATION_LABELS[station] ?? station;
}

function foldVietnameseText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function DailyItemSalesSection({
  id = 'daily-item-sales-section',
  filter,
  onFilterChange,
  canExport,
  todayIso,
}: DailyItemSalesSectionProps) {
  const { notify } = useAppMessages();
  const [stationFilter, setStationFilter] = React.useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('ALL');
  const [searchInput, setSearchInput] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('revenue:desc');

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } =
    useDashboardDailyItemSales(filter);

  const blindMode = Boolean(data?.meta.blindMode);
  const canViewSales = data ? data.meta.canViewSales : true;

  const effectiveSortKey: SortKey =
    blindMode && sortKey === 'revenue:desc' ? 'qty:desc' : sortKey;

  const stationOptions = React.useMemo(() => {
    const known = new Set<string>(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE', 'COMBO']);
    for (const s of data?.stations ?? []) known.add(s);
    for (const row of data?.items ?? []) known.add(row.station);
    return [...known];
  }, [data?.stations, data?.items]);

  const categoryOptions = React.useMemo(() => {
    if (data?.categories && data.categories.length > 0) {
      return data.categories;
    }
    const seen = new Map<number, string>();
    for (const row of data?.items ?? []) {
      if (row.categoryId !== null && row.categoryName) {
        seen.set(row.categoryId, row.categoryName);
      }
    }
    return [...seen.entries()]
      .map(([catId, name]) => ({ id: catId, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [data?.categories, data?.items]);

  const filteredItems = React.useMemo(() => {
    const rawItems = data?.items ?? [];
    const normalizedSearch = foldVietnameseText(searchInput);
    const parsedCategoryId = categoryFilter !== 'ALL' ? Number(categoryFilter) : null;

    const filtered = rawItems.filter((item) => {
      if (stationFilter !== 'ALL' && item.station !== stationFilter) {
        return false;
      }
      if (parsedCategoryId !== null && item.categoryId !== parsedCategoryId) {
        return false;
      }
      if (normalizedSearch) {
        const hayName = foldVietnameseText(item.name);
        const hayCat = foldVietnameseText(item.categoryName ?? '');
        if (!hayName.includes(normalizedSearch) && !hayCat.includes(normalizedSearch)) {
          return false;
        }
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (effectiveSortKey === 'revenue:desc') {
        return b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name, 'vi');
      }
      if (effectiveSortKey === 'qty:desc') {
        return b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name, 'vi');
      }
      if (effectiveSortKey === 'orderCount:desc') {
        return b.orderCount - a.orderCount || b.qty - a.qty || a.name.localeCompare(b.name, 'vi');
      }
      return a.name.localeCompare(b.name, 'vi');
    });

    return sorted;
  }, [data?.items, stationFilter, categoryFilter, searchInput, effectiveSortKey]);

  const isClientFiltered =
    stationFilter !== 'ALL' || categoryFilter !== 'ALL' || searchInput.trim().length > 0;

  const filteredTotals = React.useMemo(() => {
    let totalQty = 0;
    let totalRevenue = 0;
    for (const item of filteredItems) {
      totalQty += item.qty;
      totalRevenue += item.revenue;
    }
    return {
      totalProducts: filteredItems.length,
      totalQty,
      totalRevenue,
    };
  }, [filteredItems]);

  const selectedSingleDate =
    filter.preset === 'today'
      ? todayIso
      : filter.preset === 'custom' && filter.fromDate && filter.fromDate === filter.toDate
        ? filter.fromDate
        : data?.meta.fromDate && data.meta.fromDate === data.meta.toDate
          ? data.meta.fromDate
          : '';

  const handleQuickDateChange = (isoDate: string) => {
    if (!isoDate) return;
    if (isoDate === todayIso) {
      onFilterChange({ preset: 'today', fromDate: todayIso, toDate: todayIso });
      return;
    }
    onFilterChange({ preset: 'custom', fromDate: isoDate, toDate: isoDate });
  };

  const handleExportExcel = () => {
    if (!data || filteredItems.length === 0) return;
    const baseCols = [
      { header: 'STT', value: (_r: DashboardDailyItemSaleRow, idx: number) => idx + 1, width: 8 },
      { header: 'Tên món', value: (r: DashboardDailyItemSaleRow) => r.name, width: 34 },
      { header: 'Danh mục', value: (r: DashboardDailyItemSaleRow) => r.categoryName ?? 'Khác', width: 20 },
      { header: 'Bếp', value: (r: DashboardDailyItemSaleRow) => formatStationLabel(r.station), width: 16 },
      { header: 'Số lượng bán', value: (r: DashboardDailyItemSaleRow) => r.qty, width: 14 },
      { header: 'Số đơn', value: (r: DashboardDailyItemSaleRow) => r.orderCount, width: 12 },
    ];
    const moneyCols = blindMode
      ? []
      : [
          { header: 'Đơn giá TB (đ)', value: (r: DashboardDailyItemSaleRow) => r.avgUnitPrice, width: 16 },
          { header: 'Doanh thu (đ)', value: (r: DashboardDailyItemSaleRow) => r.revenue, width: 18 },
          { header: 'Tỷ trọng (%)', value: (r: DashboardDailyItemSaleRow) => r.sharePercent, width: 14 },
        ];

    exportToExcel({
      filename: `ThongKe_MonBan_${data.meta.fromDate}_${data.meta.toDate}.xlsx`,
      sheetName: 'MonBanTrongNgay',
      rows: filteredItems,
      columns: [...baseCols, ...moneyCols],
    });
    notify('dashboard.exportExcelSuccess', { variant: 'success' });
  };

  const columns = React.useMemo<ColumnDef<DashboardDailyItemSaleRow, unknown>[]>(() => {
    const list: ColumnDef<DashboardDailyItemSaleRow, unknown>[] = [
      {
        id: 'index',
        header: 'STT',
        size: 56,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Tên món',
        size: 260,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-semibold text-foreground leading-snug break-words">
              {row.original.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {row.original.categoryName ?? 'Chưa phân loại'} · {formatStationLabel(row.original.station)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'categoryName',
        header: 'Danh mục',
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.categoryName ?? 'Chưa phân loại'}
          </span>
        ),
      },
      {
        accessorKey: 'station',
        header: 'Trạm bếp',
        size: 120,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[11px] font-medium">
            {formatStationLabel(row.original.station)}
          </Badge>
        ),
      },
      {
        accessorKey: 'qty',
        header: 'Số lượng',
        size: 100,
        cell: ({ row }) => (
          <span className="font-bold text-foreground tabular-nums">
            {row.original.qty.toLocaleString('vi-VN')}
          </span>
        ),
      },
      {
        accessorKey: 'orderCount',
        header: 'Số đơn',
        size: 90,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.original.orderCount.toLocaleString('vi-VN')} đơn
          </span>
        ),
      },
    ];

    if (!blindMode) {
      list.push(
        {
          accessorKey: 'avgUnitPrice',
          header: 'Đơn giá TB',
          size: 120,
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatVnd(row.original.avgUnitPrice)}
            </span>
          ),
        },
        {
          accessorKey: 'revenue',
          header: 'Doanh thu',
          size: 140,
          cell: ({ row }) => (
            <span className="font-bold text-price tabular-nums">
              {formatVnd(row.original.revenue)}
            </span>
          ),
        },
        {
          accessorKey: 'sharePercent',
          header: 'Tỷ trọng',
          size: 120,
          cell: ({ row }) => (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {row.original.sharePercent}%
              </span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${Math.min(100, Math.max(0, row.original.sharePercent))}%` }}
                />
              </div>
            </div>
          ),
        },
      );
    }

    return list;
  }, [blindMode]);

  const periodRangeText = data
    ? data.meta.fromDate === data.meta.toDate
      ? formatDashboardDateVi(data.meta.fromDate)
      : `${formatDashboardDateVi(data.meta.fromDate)} → ${formatDashboardDateVi(data.meta.toDate)}`
    : null;

  return (
    <section
      id={id}
      data-testid="daily-item-sales-section"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-accent-text">
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                Thống kê món bán được trong ngày
              </h2>
              {blindMode ? (
                <Badge
                  variant="warning"
                  data-testid="daily-item-sales-blind-badge"
                  className="gap-1 text-[10px]"
                >
                  <EyeOff className="h-3 w-3" />
                  Ẩn doanh thu (Blind Mode)
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Tổng hợp toàn bộ món đã thanh toán (PAID) bao gồm topping/size
              {periodRangeText ? ` · Kỳ ${periodRangeText}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>Xem ngày:</span>
            <Input
              type="date"
              value={selectedSingleDate}
              max={todayIso}
              onChange={(e) => handleQuickDateChange(e.target.value)}
              data-testid="daily-item-sales-date-input"
              aria-label="Chọn ngày xem thống kê món bán được"
              className="h-8 w-auto text-xs"
            />
          </label>
          {canExport ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filteredItems.length === 0 || isLoading}
              onClick={handleExportExcel}
              data-testid="daily-item-sales-export-btn"
              className="h-8 gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất Excel món bán
            </Button>
          ) : null}
        </div>
      </div>

      {isError && !data ? (
        <SystemErrorView variant="section" error={error} onRetry={() => void refetch()} />
      ) : !canViewSales ? (
        <div
          data-testid="daily-item-sales-no-permission"
          className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground"
        >
          Tài khoản hiện tại không có quyền xem thống kê chi tiết món bán.
        </div>
      ) : (
        <BaseTable
          tableId="dashboard-daily-item-sales"
          data={filteredItems}
          columns={columns}
          isLoading={isLoading}
          isFetching={isFetching}
          isPlaceholderData={isPlaceholderData}
          emptyMessage={
            isClientFiltered
              ? 'Không có món nào khớp với bộ lọc hiện tại.'
              : 'Chưa có món nào được thanh toán trong ngày/kỳ đã chọn.'
          }
          searchPlaceholder="Tìm tên món không dấu (vd: mi cay xuc xich)..."
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          toolbarLeft={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                data-testid="daily-item-sales-station-filter"
                aria-label="Lọc theo trạm bếp"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Tất cả bếp</option>
                {stationOptions.map((st) => (
                  <option key={st} value={st}>
                    {formatStationLabel(st)}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                data-testid="daily-item-sales-category-filter"
                aria-label="Lọc theo danh mục món"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Tất cả danh mục</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          }
          toolbarRight={
            <select
              value={effectiveSortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              data-testid="daily-item-sales-sort-select"
              aria-label="Sắp xếp danh sách món bán"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {!blindMode ? <option value="revenue:desc">Doanh thu cao nhất</option> : null}
              <option value="qty:desc">Số lượng bán nhiều nhất</option>
              <option value="orderCount:desc">Nhiều đơn gọi nhất</option>
              <option value="name:asc">Tên món A → Z</option>
            </select>
          }
          renderMobileCard={(row) => (
            <div className="space-y-1.5 rounded-lg border border-border bg-background p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground break-words">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.categoryName ?? 'Chưa phân loại'} · {formatStationLabel(row.station)}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums font-bold">
                  SL: {row.qty}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
                <span className="text-muted-foreground tabular-nums">
                  {row.orderCount} đơn{!blindMode ? ` · TB ${formatVnd(row.avgUnitPrice)}` : ''}
                </span>
                {!blindMode ? (
                  <span className={cn('font-bold text-price tabular-nums')}>
                    {formatVnd(row.revenue)} ({row.sharePercent}%)
                  </span>
                ) : null}
              </div>
            </div>
          )}
          footerSummary={
            <div
              data-testid="daily-item-sales-footer"
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>
                Tổng{' '}
                <strong>{filteredTotals.totalProducts.toLocaleString('vi-VN')}</strong> mặt hàng
                {isClientFiltered && data
                  ? ` (lọc từ ${data.summary.totalProductsSold.toLocaleString('vi-VN')} mặt hàng)`
                  : ''}{' '}
                · Số lượng:{' '}
                <strong>{filteredTotals.totalQty.toLocaleString('vi-VN')}</strong> phần ·{' '}
                Tổng đơn PAID:{' '}
                <strong>{(data?.summary.totalOrders ?? 0).toLocaleString('vi-VN')}</strong> đơn
              </span>
              {!blindMode ? (
                <span>
                  Tổng doanh thu món:{' '}
                  <strong className="text-sm text-price tabular-nums">
                    {formatVnd(filteredTotals.totalRevenue)}
                  </strong>
                </span>
              ) : null}
            </div>
          }
        />
      )}
    </section>
  );
}
