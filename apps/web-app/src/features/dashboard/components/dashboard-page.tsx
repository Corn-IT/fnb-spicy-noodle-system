import { type DashboardOverviewResponse, type DashboardPreset } from '@fnb/shared';
import { Download, EyeOff, LayoutDashboard, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { exportToExcel } from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

import {
  type DashboardFilterParams,
  formatDashboardDateVi,
  formatDashboardTimeVi,
  getDashboardCustomRangeError,
  useDashboardOverview,
} from '../api/dashboard.api';
import { DashboardAlertsStrip } from './dashboard-alerts-strip';
import { DashboardChartsRow } from './dashboard-charts-row';
import { DashboardInsightsRow } from './dashboard-insights-row';
import { DashboardKpiGrid } from './dashboard-kpi-grid';
import { DashboardOperationsRow } from './dashboard-operations-row';

interface PresetOption {
  value: DashboardPreset;
  label: string;
}

const PRESET_OPTIONS: readonly PresetOption[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: '7d', label: '7 ngày' },
  { value: 'month', label: 'Tháng này' },
  { value: 'custom', label: 'Tuỳ chọn' },
];

function getTodayVietnamIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface ExportSummaryRow {
  section: string;
  metric: string;
  value: string;
  note: string;
}

function buildDashboardExportRows(data: DashboardOverviewResponse): ExportSummaryRow[] {
  const rows: ExportSummaryRow[] = [];
  const { revenue, cashDrawer, transfer, inventory, profit, openOrders } = data.kpis;

  if (revenue) {
    rows.push({
      section: 'Tổng quan KPI',
      metric: 'Doanh thu thuần (PAID)',
      value: formatVnd(revenue.netPaidAmount),
      note: `${revenue.paidOrderCount} đơn · TB ${formatVnd(revenue.averageOrderValue)}/đơn`,
    });
  }
  if (cashDrawer) {
    rows.push({
      section: 'Két tiền mặt (Invariant 6)',
      metric: 'Tiền mặt dự kiến trong két',
      value: cashDrawer.blindMode ? 'Ẩn (Blind Mode)' : formatVnd(cashDrawer.expectedCashInDrawer),
      note: `Ngân sách đầu ca: ${formatVnd(cashDrawer.openingBudget)}`,
    });
  }
  if (transfer) {
    rows.push({
      section: 'Tổng quan KPI',
      metric: 'Doanh thu Chuyển khoản VietQR',
      value: formatVnd(transfer.totalTransferSales),
      note: `${transfer.transferOrderCount} CK + ${transfer.splitOrderCount} SPLIT (${transfer.sharePercent}%)`,
    });
  }
  if (inventory) {
    rows.push({
      section: 'Tổng quan KPI',
      metric: 'Chi phí Nhập hàng',
      value: formatVnd(inventory.totalImportCost),
      note: `Từ két: ${formatVnd(inventory.cashDrawerImportCost)} · Ngoài két: ${formatVnd(inventory.externalImportCost)}`,
    });
  }
  if (profit) {
    rows.push({
      section: 'Tổng quan KPI',
      metric: 'Lãi ròng ước tính',
      value: formatVnd(profit.netOperatingProfit ?? profit.grossProfitAfterInventory, {
        signed: true,
      }),
      note: profit.marginPercent !== null ? `Biên lợi nhuận ${profit.marginPercent}%` : 'Sau nhập hàng',
    });
  }
  if (openOrders) {
    rows.push({
      section: 'Vận hành trực tiếp',
      metric: 'Bàn đang phục vụ / Tổng bàn',
      value: `${openOrders.occupiedTableCount + openOrders.pendingTableCount}/${openOrders.totalPhysicalTables}`,
      note: `${openOrders.pendingTableCount} chờ QR · ${openOrders.takeawayOpenCount} Mang về`,
    });
  }

  if (data.revenueSeries && data.meta.scope.canViewProfit) {
    for (const bucket of data.revenueSeries.buckets) {
      if (bucket.totalSales <= 0 && bucket.orderCount === 0) continue;
      rows.push({
        section: 'Biểu đồ theo khung thời gian',
        metric: bucket.label,
        value: formatVnd(bucket.totalSales),
        note: `${bucket.orderCount} đơn · TM ${formatVnd(bucket.cashSales)} · CK ${formatVnd(bucket.transferSales)}`,
      });
    }
  }

  if (data.topProducts) {
    for (const item of data.topProducts.items.slice(0, 15)) {
      rows.push({
        section: 'Top món bán chạy',
        metric: `${item.name} (${item.station})`,
        value: `${item.qty} phần`,
        note: data.meta.scope.canViewProfit ? formatVnd(item.revenue) : `${item.sharePercent}%`,
      });
    }
  }

  return rows;
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { notify } = useAppMessages();
  const todayIso = React.useMemo(() => getTodayVietnamIso(), []);

  const [filter, setFilter] = React.useState<DashboardFilterParams>({
    preset: 'today',
    fromDate: todayIso,
    toDate: todayIso,
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useDashboardOverview(filter);

  const canExport = Boolean(user?.isSuperAdmin || user?.permissions?.dashboard?.export);
  const customRangeError = getDashboardCustomRangeError(filter);

  const handlePresetChange = (preset: DashboardPreset) => {
    if (preset === 'custom') {
      setFilter((prev) => ({
        preset: 'custom',
        fromDate: prev.fromDate || todayIso,
        toDate: prev.toDate || todayIso,
      }));
      return;
    }
    setFilter({ preset });
  };

  const handleExportExcel = () => {
    if (!data) return;
    const rows = buildDashboardExportRows(data);
    exportToExcel({
      filename: `BaoCao_TongQuan_${data.meta.fromDate}_${data.meta.toDate}.xlsx`,
      sheetName: 'TongQuanDashboard',
      rows,
      columns: [
        { header: 'Phân nhóm', key: 'section', width: 26 },
        { header: 'Chỉ tiêu / Mục', key: 'metric', width: 32 },
        { header: 'Giá trị', key: 'value', width: 22 },
        { header: 'Chi tiết / Ghi chú', key: 'note', width: 42 },
      ],
    });
    notify('dashboard.exportExcelSuccess', { variant: 'success' });
  };

  const periodLabel = data
    ? data.meta.fromDate === data.meta.toDate
      ? formatDashboardDateVi(data.meta.fromDate)
      : `${formatDashboardDateVi(data.meta.fromDate)} → ${formatDashboardDateVi(data.meta.toDate)}`
    : 'Đang tải...';

  return (
    <div className="space-y-4" data-testid="dashboard-page">
      <PageHeader
        path="/dashboard"
        icon={<LayoutDashboard className="h-5 w-5" />}
        className="sm:flex-col xl:flex-row xl:items-start xl:justify-between"
        defaultSubtitleNode={
          <span className="flex flex-wrap items-center gap-2">
            <span>Kỳ dữ liệu: <strong>{periodLabel}</strong></span>
            {data ? (
              <span className="text-muted-foreground">
                · Cập nhật lúc {formatDashboardTimeVi(data.meta.generatedAt)}
              </span>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Preset Switcher */}
            <div
              role="tablist"
              aria-label="Chọn khoảng thời gian Dashboard"
              className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5"
            >
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={filter.preset === opt.value}
                  onClick={() => handlePresetChange(opt.value)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filter.preset === opt.value
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {filter.preset === 'custom' ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="Từ ngày"
                  value={filter.fromDate ?? todayIso}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      preset: 'custom',
                      fromDate: e.target.value,
                    }))
                  }
                  className="h-8 w-36 text-xs"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="date"
                  aria-label="Đến ngày"
                  value={filter.toDate ?? todayIso}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      preset: 'custom',
                      toDate: e.target.value,
                    }))
                  }
                  className="h-8 w-36 text-xs"
                />
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Làm mới
            </Button>

            {canExport ? (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleExportExcel}
                disabled={!data}
                className="h-8 gap-1.5 text-xs"
                data-testid="dashboard-export-btn"
              >
                <Download className="h-3.5 w-3.5" />
                Xuất Excel
              </Button>
            ) : null}
          </div>
        }
      />

      {customRangeError ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
          {customRangeError}
        </div>
      ) : null}

      {/* Blind Settlement Mode RBAC Indicator Banner */}
      {data && data.kpis.cashDrawer?.blindMode ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-50/70 px-3.5 py-2 text-xs dark:border-amber-800/70 dark:bg-amber-950/30"
          data-testid="dashboard-blind-mode-banner"
        >
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <EyeOff className="h-4 w-4 shrink-0" />
            <span>
              <strong>Chế độ Bảo mật Thu ngân (Blind Mode):</strong> Doanh thu tổng, tiền két dự kiến, lãi gộp & quỹ lương được ẩn để đảm bảo nguyên tắc kết ca mù.
            </span>
          </div>
          <Badge variant="warning" className="text-[10px]">
            RBAC Scoped
          </Badge>
        </div>
      ) : null}

      {isError && !data ? (
        <SystemErrorView variant="section" error={error} onRetry={() => void refetch()} />
      ) : isLoading && !data ? (
        <div className="space-y-4" data-testid="dashboard-loading-skeleton">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="h-32 animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/40 xl:col-span-8" />
            <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/40 xl:col-span-4" />
          </div>
        </div>
      ) : data ? (
        <>
          <DashboardAlertsStrip alerts={data.alerts} />
          <DashboardKpiGrid data={data} />
          <DashboardChartsRow data={data} />
          <DashboardOperationsRow data={data} />
          <DashboardInsightsRow data={data} />
        </>
      ) : null}
    </div>
  );
}
