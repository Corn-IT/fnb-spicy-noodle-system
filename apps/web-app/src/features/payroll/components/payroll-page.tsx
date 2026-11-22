import { type ColumnDef } from '@tanstack/react-table';
import {
  type PayrollConfig,
  type PayrollRow,
  type PayrollShiftType,
} from '@fnb/shared';
import { Calculator, FileSpreadsheet, Pencil, RotateCcw, Settings2 } from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { exportToExcel } from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';

import {
  usePayrollSummaryQuery,
  useUpdateEmployeePayrollMutation,
  useUpdatePayrollConfigMutation,
} from '../api/payroll.api';

function getCurrentVietnamMonthRange(): { month: string; fromDate: string; toDate: string } {
  const nowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [yStr = '2026', mStr = '11'] = nowStr.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    month: `${yStr}-${mStr}`,
    fromDate: `${yStr}-${mStr}-01`,
    toDate: `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getMonthRangeFromMonthInput(monthValue: string): { fromDate: string; toDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    fromDate: `${match[1]}-${match[2]}-01`,
    toDate: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export function PayrollPage() {
  const { notify } = useAppMessages();
  const initialRange = React.useMemo(() => getCurrentVietnamMonthRange(), []);
  const [selectedMonth, setSelectedMonth] = React.useState(initialRange.month);
  const [fromDate, setFromDate] = React.useState(initialRange.fromDate);
  const [toDate, setToDate] = React.useState(initialRange.toDate);
  const [keyword, setKeyword] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const user = useAuthStore((s) => s.user);
  const canUpdatePayroll = Boolean(user?.isSuperAdmin || user?.permissions?.payroll?.update);
  const canConfigPayroll = Boolean(user?.isSuperAdmin || user?.permissions?.payroll?.config);
  const canExportPayroll = Boolean(user?.isSuperAdmin || user?.permissions?.payroll?.export);

  const payrollQuery = usePayrollSummaryQuery({
    fromDate,
    toDate,
    keyword: keyword.trim() || undefined,
  });
  const { data, isLoading } = payrollQuery;

  const updateConfigMutation = useUpdatePayrollConfigMutation();
  const updateEmployeeMutation = useUpdateEmployeePayrollMutation();

  const [configOpen, setConfigOpen] = React.useState(false);
  const [draftConfig, setDraftConfig] = React.useState<PayrollConfig>({
    defaultBaseSalary: 7000000,
    standardFullTimeDays: 28,
    standardHoursPerDay: 12,
    defaultPartTimeHourlyRate: 25000,
  });

  const [editingRow, setEditingRow] = React.useState<PayrollRow | null>(null);
  const [editShiftType, setEditShiftType] = React.useState<PayrollShiftType>('FULL_TIME');
  const [editUseCustomRate, setEditUseCustomRate] = React.useState(false);
  const [editCustomBaseSalary, setEditCustomBaseSalary] = React.useState<number>(7000000);
  const [editCustomHourlyRate, setEditCustomHourlyRate] = React.useState<number>(25000);
  const [editFullShiftDays, setEditFullShiftDays] = React.useState<string>('');
  const [editCustomHours, setEditCustomHours] = React.useState<string>('');
  const [editBonusOrAdjustment, setEditBonusOrAdjustment] = React.useState<string>('0');
  const [editNote, setEditNote] = React.useState<string>('');

  const config: PayrollConfig = data?.config ?? {
    defaultBaseSalary: 7000000,
    standardFullTimeDays: 28,
    standardHoursPerDay: 12,
    defaultPartTimeHourlyRate: 25000,
  };

  const allItems = data?.items ?? [];
  const total = allItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pagedItems = React.useMemo(
    () => allItems.slice((page - 1) * limit, page * limit),
    [allItems, page, limit],
  );

  const openConfigDialog = () => {
    setDraftConfig({ ...config });
    setConfigOpen(true);
  };

  const handleSaveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateConfigMutation.mutateAsync(draftConfig);
      setConfigOpen(false);
      notify('payroll.config.saveSuccess', { variant: 'success' });
    } catch {
      notify('payroll.config.saveError', { variant: 'destructive' });
    }
  };

  const openEditEmployeeDialog = (row: PayrollRow) => {
    setEditingRow(row);
    setEditShiftType(row.shiftType);
    setEditUseCustomRate(row.useCustomRate);
    setEditCustomBaseSalary(row.appliedBaseSalary);
    setEditCustomHourlyRate(
      row.shiftType === 'PART_TIME' ? row.appliedHourlyRate : config.defaultPartTimeHourlyRate,
    );
    setEditFullShiftDays(
      row.fullShiftDays !== row.scheduleFullShiftDays ? String(row.fullShiftDays) : '',
    );
    setEditCustomHours(
      row.customHours !== row.scheduleCustomHours ? String(row.customHours) : '',
    );
    setEditBonusOrAdjustment(String(row.bonusOrAdjustment || 0));
    setEditNote(row.note ?? '');
  };

  const previewEditedSalary = React.useMemo(() => {
    if (!editingRow) return 0;
    const days =
      editFullShiftDays.trim() !== ''
        ? Math.max(0, Number(editFullShiftDays) || 0)
        : editingRow.scheduleFullShiftDays;
    const hours =
      editCustomHours.trim() !== ''
        ? Math.max(0, Number(editCustomHours) || 0)
        : editingRow.scheduleCustomHours;
    const bonus = Number(editBonusOrAdjustment) || 0;

    if (editShiftType === 'FULL_TIME') {
      const baseSalary = editUseCustomRate ? editCustomBaseSalary : config.defaultBaseSalary;
      const dailyRate = baseSalary / config.standardFullTimeDays;
      const hourlyRate = dailyRate / config.standardHoursPerDay;
      return Math.round(days * dailyRate + hours * hourlyRate + bonus);
    }
    const ptRate = editUseCustomRate ? editCustomHourlyRate : config.defaultPartTimeHourlyRate;
    return Math.round(hours * ptRate + days * config.standardHoursPerDay * ptRate + bonus);
  }, [
    editingRow,
    editFullShiftDays,
    editCustomHours,
    editBonusOrAdjustment,
    editShiftType,
    editUseCustomRate,
    editCustomBaseSalary,
    editCustomHourlyRate,
    config,
  ]);

  const handleSaveEmployeePayroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingRow) return;

    const parsedOverrideDays =
      editFullShiftDays.trim() === '' ? null : Math.max(0, Number(editFullShiftDays));
    const parsedOverrideHours =
      editCustomHours.trim() === '' ? null : Math.max(0, Number(editCustomHours));
    const parsedBonus = Number(editBonusOrAdjustment) || 0;

    try {
      await updateEmployeeMutation.mutateAsync({
        employeeId: editingRow.employeeId,
        body: {
          fromDate,
          toDate,
          shiftType: editShiftType,
          useCustomRate: editUseCustomRate,
          customBaseSalary: editUseCustomRate && editShiftType === 'FULL_TIME' ? editCustomBaseSalary : null,
          customHourlyRate: editUseCustomRate && editShiftType === 'PART_TIME' ? editCustomHourlyRate : null,
          overrideFullShiftDays: parsedOverrideDays,
          overrideCustomHours: parsedOverrideHours,
          bonusOrAdjustment: parsedBonus,
          note: editNote.trim() || null,
        },
      });
      setEditingRow(null);
      notify('payroll.employee.updateSuccess', {
        variant: 'success',
        vars: { fullName: editingRow.fullName },
      });
    } catch {
      notify('payroll.employee.updateError', { variant: 'destructive' });
    }
  };

  const handleExportExcel = () => {
    exportToExcel<PayrollRow>({
      filename: `bang-tinh-luong-${fromDate}-${toDate}.xlsx`,
      sheetName: 'BangTinhLuong',
      rows: allItems,
      columns: [
        { header: 'STT', value: (_row, idx) => idx + 1, width: 8 },
        { header: 'Tên nhân viên', value: (r) => `${r.fullName} (${r.shortName})`, width: 28 },
        {
          header: 'Ca làm',
          value: (r) => (r.shiftType === 'FULL_TIME' ? 'Full-time' : 'Part-time'),
          width: 14,
        },
        { header: 'Full ca (ngày)', value: (r) => r.fullShiftDays, width: 16 },
        { header: 'Giờ lẻ (giờ)', value: (r) => r.customHours, width: 16 },
        { header: 'Tiền lương', value: (r) => r.totalSalary, width: 18 },
      ],
    });
    notify('payroll.exportExcelSuccess', {
      variant: 'success',
      vars: { fromDate, toDate },
    });
  };

  const columns = React.useMemo<ColumnDef<PayrollRow, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 52,
        enableResizing: false,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'fullName',
        header: 'Tên nhân viên',
        size: 210,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{row.original.fullName}</span>
            <Badge
              variant="secondary"
              className="w-fit text-xs"
              data-testid={`payroll-short-name-${row.original.employeeId}`}
            >
              {row.original.shortName}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'shiftType',
        header: 'Ca làm',
        size: 130,
        cell: ({ row }) => (
          <Badge
            variant={row.original.shiftType === 'FULL_TIME' ? 'default' : 'outline'}
            className="whitespace-nowrap"
          >
            {row.original.shiftType === 'FULL_TIME' ? 'Full-time' : 'Part-time'}
          </Badge>
        ),
      },
      {
        accessorKey: 'fullShiftDays',
        header: 'Full ca',
        size: 130,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold tabular-nums">
              {formatHours(row.original.fullShiftDays)} ngày
            </span>
            {row.original.fullShiftDays !== row.original.scheduleFullShiftDays ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                Bảng công: {formatHours(row.original.scheduleFullShiftDays)} ngày
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'customHours',
        header: 'Giờ lẻ',
        size: 130,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold tabular-nums">
              {formatHours(row.original.customHours)} giờ
            </span>
            {row.original.customHours !== row.original.scheduleCustomHours ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                Bảng công: {formatHours(row.original.scheduleCustomHours)} giờ
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'totalSalary',
        header: 'Tiền lương',
        size: 200,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-bold text-price tabular-nums">
                {r.totalSalary.toLocaleString('vi-VN')} đ
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {r.shiftType === 'FULL_TIME'
                  ? `CB ${r.appliedBaseSalary.toLocaleString('vi-VN')}đ / ${config.standardFullTimeDays} ngày`
                  : `${r.appliedHourlyRate.toLocaleString('vi-VN')} đ/giờ`}
                {r.bonusOrAdjustment !== 0
                  ? ` • Đ/c ${r.bonusOrAdjustment > 0 ? '+' : ''}${r.bonusOrAdjustment.toLocaleString('vi-VN')}đ`
                  : ''}
              </span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 120,
        enableResizing: false,
        cell: ({ row }) =>
          canUpdatePayroll ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 font-medium"
              data-testid={`edit-payroll-btn-${row.original.employeeId}`}
              onClick={() => openEditEmployeeDialog(row.original)}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Chỉnh sửa</span>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Chỉ xem</span>
          ),
      },
    ],
    [page, limit, canUpdatePayroll, config.standardFullTimeDays],
  );

  const previewDailyRate = Math.round(config.defaultBaseSalary / config.standardFullTimeDays);
  const previewFullTimeHourlyRate = Math.round(previewDailyRate / config.standardHoursPerDay);

  if (!data && payrollQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={payrollQuery.error}
        onRetry={() => void payrollQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="payroll-page">
      <PageHeader
        path="/payroll"
        defaultTitle="Bảng tính lương"
        icon={<Calculator className="h-5 w-5 text-accent-text" />}
        defaultSubtitleNode={
          <>
            Liên kết tự động từ Bảng tính ngày công: Full-time = (Lương CB / {config.standardFullTimeDays} ngày) + (Giờ lẻ × Ngày công / {config.standardHoursPerDay} giờ); Part-time = Giờ × {config.defaultPartTimeHourlyRate.toLocaleString('vi-VN')} đ/giờ.
          </>
        }
        actions={
          <>
            <AuditHistoryButton module="PAYROLL" />
            {canConfigPayroll ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-payroll-config-btn"
                onClick={openConfigDialog}
                className="font-semibold"
              >
                <Settings2 className="h-4 w-4 shrink-0 text-accent-text" />
                <span>Cấu hình tính lương</span>
              </Button>
            ) : null}
            {canExportPayroll ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-payroll-excel-btn"
                onClick={handleExportExcel}
                disabled={allItems.length === 0}
                className="font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Xuất file Excel</span>
              </Button>
            ) : null}
          </>
        }
      />

      <BaseTable
        tableId="payroll"
        data={pagedItems}
        columns={columns}
        isLoading={isLoading}
        isFetching={payrollQuery.isFetching}
        isPlaceholderData={payrollQuery.isPlaceholderData}
        searchValue={keyword}
        onSearchChange={(val) => {
          setKeyword(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo tên nhân viên..."
        emptyMessage="Không có nhân viên nào phù hợp."
        toolbarLeft={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Tháng:</span>
              <Input
                type="month"
                value={selectedMonth}
                data-testid="payroll-month-input"
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMonth(val);
                  const range = getMonthRangeFromMonthInput(val);
                  if (range) {
                    setFromDate(range.fromDate);
                    setToDate(range.toDate);
                    setPage(1);
                  }
                }}
                className="h-8 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Từ ngày:</span>
              <Input
                type="date"
                value={fromDate}
                data-testid="payroll-from-date"
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Đến ngày:</span>
              <Input
                type="date"
                value={toDate}
                data-testid="payroll-to-date"
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-36 text-xs"
              />
            </div>
          </div>
        }
        footerSummary={
          <div
            data-testid="payroll-footer-total"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              Tổng quỹ lương thực nhận trong kỳ:{' '}
              <strong className="text-base text-price">
                {(data?.summary.totalSalary ?? 0).toLocaleString('vi-VN')} đ
              </strong>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Tổng cộng: {formatHours(data?.summary.totalFullShiftDays ?? 0)} ngày Full ca •{' '}
              {formatHours(data?.summary.totalCustomHours ?? 0)} giờ lẻ ({data?.summary.totalEmployees ?? 0} nhân sự)
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

      {/* Dialog Cấu hình Công thức Tính lương */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="payroll-config-dialog">
          <form onSubmit={(e) => void handleSaveConfig(e)}>
            <DialogHeader>
              <DialogTitle>Cấu hình Công thức Bảng tính lương</DialogTitle>
              <DialogDescription>
                Điều chỉnh động các thông số tính công cho nhân viên Full-time và Part-time.
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Lương cơ bản Full-time mặc định (VNĐ)
                </label>
                <CurrencyInput
                  value={draftConfig.defaultBaseSalary}
                  onValueChange={(_raw, val) =>
                    setDraftConfig((prev) => ({ ...prev, defaultBaseSalary: val ?? 0 }))
                  }
                  data-testid="payroll-cfg-base-salary"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Số ngày chuẩn Full-time (mặc định 28)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={draftConfig.standardFullTimeDays}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        standardFullTimeDays: Math.max(1, Math.min(31, Number(e.target.value) || 28)),
                      }))
                    }
                    data-testid="payroll-cfg-standard-days"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Số giờ quy đổi / 1 ngày Full ca (mặc định 12)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min={1}
                    max={24}
                    value={draftConfig.standardHoursPerDay}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        standardHoursPerDay: Math.max(1, Math.min(24, Number(e.target.value) || 12)),
                      }))
                    }
                    data-testid="payroll-cfg-standard-hours"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Lương theo giờ Part-time mặc định (VNĐ/giờ)
                </label>
                <CurrencyInput
                  value={draftConfig.defaultPartTimeHourlyRate}
                  onValueChange={(_raw, val) =>
                    setDraftConfig((prev) => ({ ...prev, defaultPartTimeHourlyRate: val ?? 0 }))
                  }
                  data-testid="payroll-cfg-parttime-rate"
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-semibold text-foreground">Xem trước quy đổi hiện tại:</div>
                <div>
                  • 1 ngày Full ca (Full-time) ≈{' '}
                  <strong>
                    {Math.round(
                      draftConfig.defaultBaseSalary / draftConfig.standardFullTimeDays,
                    ).toLocaleString('vi-VN')}{' '}
                    đ
                  </strong>
                  {' '}(mức mặc định hiện tại: {previewDailyRate.toLocaleString('vi-VN')} đ)
                </div>
                <div>
                  • 1 giờ lẻ (Full-time) ≈{' '}
                  <strong>
                    {Math.round(
                      draftConfig.defaultBaseSalary /
                        draftConfig.standardFullTimeDays /
                        draftConfig.standardHoursPerDay,
                    ).toLocaleString('vi-VN')}{' '}
                    đ/giờ
                  </strong>
                  {' '}(mức mặc định hiện tại: {previewFullTimeHourlyRate.toLocaleString('vi-VN')} đ/giờ)
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setConfigOpen(false)}>
                Huỷ bỏ
              </Button>
              <Button
                type="submit"
                data-testid="save-payroll-config-btn"
                disabled={updateConfigMutation.isPending}
              >
                Lưu cấu hình
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Chỉnh sửa Bảng lương từng nhân viên */}
      <Dialog open={editingRow !== null} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="edit-employee-payroll-dialog">
          <form onSubmit={(e) => void handleSaveEmployeePayroll(e)}>
            <DialogHeader>
              <DialogTitle>
                Chỉnh sửa lương: {editingRow?.fullName} ({editingRow?.shortName})
              </DialogTitle>
              <DialogDescription>
                Kỳ tính lương: {fromDate} → {toDate}. Tuỳ chỉnh ca làm, mức lương riêng hoặc điều chỉnh ngày công/giờ lẻ thực tế.
              </DialogDescription>
            </DialogHeader>
            {editingRow ? (
              <div className="my-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Ca làm chính</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={editShiftType === 'FULL_TIME' ? 'default' : 'outline'}
                      size="sm"
                      data-testid="edit-payroll-shift-fulltime"
                      onClick={() => setEditShiftType('FULL_TIME')}
                    >
                      Full-time
                    </Button>
                    <Button
                      type="button"
                      variant={editShiftType === 'PART_TIME' ? 'default' : 'outline'}
                      size="sm"
                      data-testid="edit-payroll-shift-parttime"
                      onClick={() => setEditShiftType('PART_TIME')}
                    >
                      Part-time
                    </Button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/20 p-2.5 text-xs font-semibold select-none">
                  <Checkbox
                    checked={editUseCustomRate}
                    onCheckedChange={(checked) => setEditUseCustomRate(Boolean(checked))}
                    data-testid="edit-payroll-custom-rate-toggle"
                  />
                  <span>Áp dụng mức lương riêng cho nhân viên này</span>
                </label>

                {editUseCustomRate ? (
                  editShiftType === 'FULL_TIME' ? (
                    <div>
                      <label className="mb-1 block text-xs font-semibold">
                        Lương cơ bản riêng của nhân viên (VNĐ)
                      </label>
                      <CurrencyInput
                        value={editCustomBaseSalary}
                        onValueChange={(_raw, val) => setEditCustomBaseSalary(val ?? 0)}
                        data-testid="edit-payroll-custom-base-salary"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs font-semibold">
                        Lương theo giờ riêng của nhân viên (VNĐ/giờ)
                      </label>
                      <CurrencyInput
                        value={editCustomHourlyRate}
                        onValueChange={(_raw, val) => setEditCustomHourlyRate(val ?? 0)}
                        data-testid="edit-payroll-custom-hourly-rate"
                      />
                    </div>
                  )
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold">Full ca (ngày)</label>
                      <button
                        type="button"
                        onClick={() => setEditFullShiftDays('')}
                        className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Theo bảng công ({formatHours(editingRow.scheduleFullShiftDays)})</span>
                      </button>
                    </div>
                    <Input
                      type="number"
                      step="0.5"
                      min={0}
                      placeholder={String(editingRow.scheduleFullShiftDays)}
                      value={editFullShiftDays}
                      onChange={(e) => setEditFullShiftDays(e.target.value)}
                      data-testid="edit-payroll-full-days"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold">Giờ lẻ (giờ)</label>
                      <button
                        type="button"
                        onClick={() => setEditCustomHours('')}
                        className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Theo bảng công ({formatHours(editingRow.scheduleCustomHours)})</span>
                      </button>
                    </div>
                    <Input
                      type="number"
                      step="0.25"
                      min={0}
                      placeholder={String(editingRow.scheduleCustomHours)}
                      value={editCustomHours}
                      onChange={(e) => setEditCustomHours(e.target.value)}
                      data-testid="edit-payroll-custom-hours"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">
                      Thưởng / Phụ cấp / Trừ (VNĐ)
                    </label>
                    <Input
                      type="number"
                      value={editBonusOrAdjustment}
                      onChange={(e) => setEditBonusOrAdjustment(e.target.value)}
                      data-testid="edit-payroll-adjustment"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Ghi chú</label>
                    <Input
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="VD: Thưởng chuyên cần..."
                      data-testid="edit-payroll-note"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-primary/5 p-3 text-sm">
                  <span className="font-medium">Tiền lương dự kiến sau chỉnh sửa:</span>
                  <strong className="text-base text-price tabular-nums">
                    {previewEditedSalary.toLocaleString('vi-VN')} đ
                  </strong>
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEditingRow(null)}>
                Huỷ bỏ
              </Button>
              <Button
                type="submit"
                data-testid="save-employee-payroll-btn"
                disabled={updateEmployeeMutation.isPending}
              >
                Lưu bảng lương
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
