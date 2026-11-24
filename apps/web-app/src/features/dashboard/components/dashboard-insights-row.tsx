import { type DashboardOverviewResponse, type ProductStation } from '@fnb/shared';
import {
  Activity,
  Award,
  CalendarClock,
  FileSpreadsheet,
  PackageCheck,
  ReceiptText,
  ShieldAlert,
  Tag,
} from 'lucide-react';
import * as React from 'react';
import { useTouchAwareNavigate } from '@/components/touch-shell';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

import { formatDashboardDateVi, formatDashboardTimeVi } from '../api/dashboard.api';

interface DashboardInsightsRowProps {
  data: DashboardOverviewResponse;
}

type StationFilter = 'ALL' | ProductStation;

const STATION_TABS: ReadonlyArray<{ key: StationFilter; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'BEP_NAU', label: 'Bếp Nấu' },
  { key: 'BEP_CHIEN', label: 'Bếp Chiên' },
  { key: 'PHA_CHE', label: 'Pha Chế' },
  { key: 'COMBO', label: 'Combo' },
];

export function DashboardInsightsRow({ data }: DashboardInsightsRowProps) {
  const navigate = useTouchAwareNavigate();
  const [stationTab, setStationTab] = React.useState<StationFilter>('ALL');

  const canViewProfit = data.meta.scope.canViewProfit;
  const topProducts = data.topProducts;
  const discountsAndRisk = data.discountsAndRisk;
  const staffing = data.staffing;

  const filteredTopItems = React.useMemo(() => {
    if (!topProducts) return [];
    const list =
      stationTab === 'ALL'
        ? topProducts.items
        : topProducts.items.filter((item) => item.station === stationTab);
    return list.slice(0, 6);
  }, [topProducts, stationTab]);

  const maxItemQty = React.useMemo(
    () => Math.max(1, ...filteredTopItems.map((i) => i.qty)),
    [filteredTopItems],
  );

  return (
    <div className="space-y-4">
      {/* Row 4: Top Selling Items + Discount & Risk Control + Shift Staffing */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Top Products & Modifiers (5 cols) */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-300">
                <Award className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Top Món Bán Chạy & Toppings</h2>
                <p className="text-xs text-muted-foreground">Theo số lượng đã thanh toán trong kỳ</p>
              </div>
            </div>
          </div>

          {/* Station Filter Tabs */}
          <div className="mb-3 flex flex-wrap gap-1">
            {STATION_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStationTab(tab.key)}
                className={cn(
                  'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                  stationTab === tab.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!topProducts ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              Không có quyền xem thống kê món bán chạy.
            </p>
          ) : filteredTopItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              Chưa có món nào thuộc nhóm này trong kỳ đã chọn.
            </p>
          ) : (
            <div className="space-y-2.5" data-testid="dashboard-top-products">
              {filteredTopItems.map((item, idx) => (
                <div key={item.productId} className="space-y-1">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="font-medium leading-snug text-foreground break-words">
                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      <strong className="text-foreground">{item.qty}</strong> phần
                      {canViewProfit ? ` · ${formatVnd(item.revenue)}` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${(item.qty / maxItemQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top Paid Toppings / Modifiers */}
          {topProducts && topProducts.topModifiers.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Toppings / Tuỳ chọn gọi kèm nhiều nhất
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topProducts.topModifiers.slice(0, 6).map((mod) => (
                  <Badge key={mod.name} variant="secondary" className="text-[11px] font-normal">
                    {mod.name} · <strong className="ml-1">{mod.qty}</strong>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Discount & Operational Risk Exceptions (4 cols) */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-4">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-700 dark:text-orange-300">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Khuyến mãi & Kiểm soát Rủi ro</h2>
                  <p className="text-xs text-muted-foreground">Mã giảm giá, huỷ hoá đơn & đổi bàn</p>
                </div>
              </div>
            </div>

            {!discountsAndRisk ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                Cần quyền Hoá đơn / POS để xem thống kê rủi ro & khuyến mãi.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Risk summary counters */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border/80 bg-muted/25 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Huỷ VOIDED</p>
                    <p
                      className={cn(
                        'text-sm font-bold',
                        discountsAndRisk.voidedOrderCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground',
                      )}
                    >
                      {discountsAndRisk.voidedOrderCount} đơn
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/25 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Huỷ sau in bếp</p>
                    <p
                      className={cn(
                        'text-sm font-bold',
                        discountsAndRisk.cancelledPrintedItemCount > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-foreground',
                      )}
                    >
                      {discountsAndRisk.cancelledPrintedItemCount} món
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/25 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Đổi / Gộp bàn</p>
                    <p className="text-sm font-bold text-foreground">
                      {discountsAndRisk.tableTransferCounts.move +
                        discountsAndRisk.tableTransferCounts.merge +
                        discountsAndRisk.tableTransferCounts.swap}{' '}
                      lần
                    </p>
                  </div>
                </div>

                {/* Discount Summary */}
                <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/15 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Tag className="h-3.5 w-3.5 text-amber-500" />
                      Tổng chiết khấu kỳ
                    </span>
                    <span className="font-bold text-foreground">
                      {canViewProfit ? formatVnd(discountsAndRisk.totalDiscountAmount) : 'Ẩn số tiền'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Giảm tay trực tiếp: {discountsAndRisk.manualDiscountCount} đơn</span>
                    {canViewProfit ? <span>{formatVnd(discountsAndRisk.manualDiscountAmount)}</span> : null}
                  </div>
                  {discountsAndRisk.codeDiscountStats.slice(0, 3).map((d) => (
                    <div
                      key={d.discountId}
                      className="flex items-center justify-between text-[11px] text-muted-foreground"
                    >
                      <span className="truncate">
                        <Badge variant="outline" className="mr-1 px-1 py-0 text-[10px]">
                          {d.code}
                        </Badge>
                        {d.usedCountInPeriod} lượt kỳ này
                      </span>
                      <span className="shrink-0">
                        {d.usageLimit ? `${d.totalUsedCount}/${d.usageLimit}` : `${d.totalUsedCount} tổng`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Latest Cash Drawer Settlement Pill */}
          {data.kpis.cashDrawer?.latestSettlement ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-foreground">
                  Kết ca gần nhất ({formatDashboardDateVi(data.kpis.cashDrawer.latestSettlement.settlementDate)})
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {data.kpis.cashDrawer.latestSettlement.shiftName}
                  {!data.kpis.cashDrawer.blindMode
                    ? ` · Thực đếm ${formatVnd(data.kpis.cashDrawer.latestSettlement.actualCountedCash)}`
                    : ''}
                </p>
              </div>
              <Badge
                variant={
                  data.kpis.cashDrawer.latestSettlement.status === 'MATCHED'
                    ? 'success'
                    : data.kpis.cashDrawer.latestSettlement.status === 'SHORTAGE'
                      ? 'destructive'
                      : 'warning'
                }
                className="text-[10px]"
              >
                {data.kpis.cashDrawer.latestSettlement.status}
              </Badge>
            </div>
          ) : null}
        </div>

        {/* Today's Shift Staffing & Payroll Summary (3 cols) */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-3">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Ca làm {staffing?.todayWeekdayLabel ?? 'Hôm nay'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {staffing ? `${staffing.totalScheduledEmployees} lượt xếp ca` : 'Lịch tuần'}
                  </p>
                </div>
              </div>
              {data.meta.scope.canSchedules ? (
                <button
                  type="button"
                  onClick={() => navigate('/schedules')}
                  className="text-[11px] font-medium text-accent-text hover:underline"
                >
                  Lịch →
                </button>
              ) : null}
            </div>

            {!staffing ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                Chưa có quyền Lịch tuần để xem nhân sự trực ca.
              </p>
            ) : staffing.shifts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                Chưa phân công nhân viên cho hôm nay.
              </p>
            ) : (
              <div className="space-y-2.5" data-testid="dashboard-staffing-shifts">
                {staffing.shifts.map((slot) => (
                  <div key={slot.timeSlot} className="rounded-lg border border-border/70 bg-muted/20 p-2">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-foreground">
                      <span>Ca {slot.timeSlot}</span>
                      <span className="text-muted-foreground">{slot.employees.length} NV</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {slot.employees.map((emp) => (
                        <Badge key={`${slot.timeSlot}-${emp.id}`} variant="secondary" className="text-[10px]">
                          {emp.shortName}
                          {emp.specialtyName ? ` (${emp.specialtyName})` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {staffing?.payrollSummary ? (
            <div
              className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs"
              data-testid="dashboard-payroll-summary"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-muted-foreground">Quỹ lương ước tính kỳ</span>
                <button
                  type="button"
                  onClick={() => navigate('/payroll')}
                  className="text-[11px] font-medium text-accent-text hover:underline"
                >
                  Bảng lương →
                </button>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">
                {formatVnd(staffing.payrollSummary.totalSalary)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {staffing.payrollSummary.totalEmployees} NV · {staffing.payrollSummary.totalFullShiftDays} ngày công +{' '}
                {staffing.payrollSummary.totalCustomHours}h
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Row 5: Inventory Imports + Recent Paid Invoices + Audit Log Stream */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Recent Inventory Imports */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <PackageCheck className="h-4 w-4 text-orange-500" />
              Phiếu Nhập Kho gần đây
            </span>
            {data.meta.scope.canInventory ? (
              <button
                type="button"
                onClick={() => navigate('/inventory')}
                className="text-xs font-medium text-accent-text hover:underline"
              >
                Kho hàng →
              </button>
            ) : null}
          </div>

          {data.recentInventoryImports.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {data.meta.scope.canInventory
                ? 'Không có phiếu nhập kho trong khoảng ngày đã chọn.'
                : 'Không có quyền xem phiếu nhập kho.'}
            </p>
          ) : (
            <div className="divide-y divide-border/60 text-xs">
              {data.recentInventoryImports.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug text-foreground break-words">
                      {imp.itemName} ({imp.quantity} {imp.unitName})
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground break-words">
                      {imp.supplierName ?? 'NCC lẻ'} · {formatDashboardDateVi(imp.importDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-foreground">{formatVnd(imp.totalCost)}</p>
                    <Badge
                      variant={imp.paymentSource === 'CASH_DRAWER' ? 'warning' : 'secondary'}
                      className="mt-0.5 px-1.5 py-0 text-[9px]"
                    >
                      {imp.paymentSource === 'CASH_DRAWER' ? 'Từ két' : 'Quỹ ngoài'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Paid Invoices */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <ReceiptText className="h-4 w-4 text-accent-text" />
              Hoá đơn Thanh toán gần nhất
            </span>
            {data.meta.scope.canInvoices ? (
              <button
                type="button"
                onClick={() => navigate('/invoices')}
                className="text-xs font-medium text-accent-text hover:underline"
              >
                Hoá đơn →
              </button>
            ) : null}
          </div>

          {!canViewProfit ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              <FileSpreadsheet className="mx-auto mb-1.5 h-4 w-4" />
              Danh sách tổng tiền hoá đơn được ẩn khi bật Blind Mode. Mở tab Hoá đơn để tra cứu in lại.
            </div>
          ) : data.recentInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có hoá đơn PAID trong khoảng ngày này.</p>
          ) : (
            <div className="divide-y divide-border/60 text-xs">
              {data.recentInvoices.map((inv) => (
                <div key={inv.orderId} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground">{inv.orderCode}</span>
                      <Badge variant="outline" className="px-1 py-0 text-[9px]">
                        {inv.orderType === 'TAKEAWAY' ? `MV #${inv.takeawayNumber ?? '?'}` : inv.tableLabel ?? 'Bàn'}
                      </Badge>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground break-words">
                      {formatDashboardTimeVi(inv.paidAt)} · {inv.orderSource}
                      {inv.paymentAccountLabel ? ` · ${inv.paymentAccountLabel}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-price">{formatVnd(inv.totalAmount)}</p>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {inv.paymentMethod ?? 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Realtime Audit Log Stream */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4 text-sky-500" />
              Nhật ký Hệ thống gần đây
            </span>
            <span className="text-[11px] text-muted-foreground">Theo phạm vi RBAC</span>
          </div>

          {data.recentAuditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Không có nhật ký nào trong phạm vi quyền của bạn.</p>
          ) : (
            <div className="divide-y divide-border/60 text-xs" data-testid="dashboard-audit-logs">
              {data.recentAuditLogs.map((log) => (
                <div key={log.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                        {log.module}
                      </Badge>
                      <span className="font-semibold leading-snug text-foreground break-words">{log.action}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDashboardTimeVi(log.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground break-words">
                    {log.actorFullName} — {log.summary}
                    {log.ipAddress ? ` · IP ${log.ipAddress}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
