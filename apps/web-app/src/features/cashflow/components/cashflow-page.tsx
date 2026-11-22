import { type ColumnDef } from '@tanstack/react-table';
import { type DenominationsDetail, type SettlementResponse } from '@fnb/shared';
import { FileSpreadsheet, Pencil, RotateCcw, Search, Settings2, Wallet, X } from 'lucide-react';
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
  fetchCashflowSettlements,
  useCashflowPreviewQuery,
  useCashflowSettlementsQuery,
  useCompensateSettlementMutation,
  useSettleShiftMutation,
} from '@/features/cashflow/api/cashflow.api';
import { DefaultBudgetDialog } from '@/features/cashflow/components/default-budget-dialog';
import {
  calculateDenominationsTotal,
  DenominationCounterGrid,
  INITIAL_DENOMINATIONS,
} from '@/features/cashflow/components/denomination-counter-grid';
import { SettlementSummaryCard } from '@/features/cashflow/components/settlement-summary-card';
import { exportToExcel, fetchAllPaginated } from '@/lib/excel-export';
import { useCommitSearch } from '@/lib/use-commit-search';
import { useAuthStore } from '@/stores/auth.store';

export function CashflowPage() {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const [counts, setCounts] = React.useState<DenominationsDetail>(INITIAL_DENOMINATIONS);
  const [note, setNote] = React.useState<string>('');
  const [blindNoteRequired, setBlindNoteRequired] = React.useState<boolean>(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = React.useState(false);
  const [compensateTarget, setCompensateTarget] = React.useState<SettlementResponse | null>(null);
  const [compensateAmount, setCompensateAmount] = React.useState<number | null>(null);
  const [compensateNote, setCompensateNote] = React.useState('');

  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [closerKeyword, setCloserKeyword] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const commitCloserKeyword = React.useCallback((nextValue: string) => {
    setCloserKeyword(nextValue);
    setPage(1);
  }, []);
  const closerSearch = useCommitSearch(closerKeyword, commitCloserKeyword);

  const user = useAuthStore((state) => state.user);
  const canConfigBudget = Boolean(user?.isSuperAdmin || user?.permissions.cashflow?.config);
  const canSettle = Boolean(user?.isSuperAdmin || user?.permissions.cashflow?.create);
  const canCompensate = Boolean(user?.isSuperAdmin || user?.permissions.cashflow?.compensate);
  const canExport = Boolean(user?.isSuperAdmin || user?.permissions.cashflow?.export);

  const settlementsFilter = React.useMemo(
    () => ({
      page,
      limit,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      closerKeyword: closerKeyword.trim() || undefined,
    }),
    [closerKeyword, fromDate, limit, page, toDate],
  );

  const previewQuery = useCashflowPreviewQuery();
  const preview = previewQuery.data;
  const settlementsQuery = useCashflowSettlementsQuery(settlementsFilter);
  const { data: settlementsData, isLoading: isLoadingHistory } = settlementsQuery;

  const settleMutation = useSettleShiftMutation();
  const compensateMutation = useCompensateSettlementMutation();

  const actualCountedCash = React.useMemo(
    () => calculateDenominationsTotal(counts),
    [counts],
  );

  const handleUpdateCount = (key: keyof DenominationsDetail, value: number) => {
    setCounts((prev) => ({ ...prev, [key]: value }));
    setBlindNoteRequired(false);
  };

  const handleSubmitSettlement = async () => {
    if (!preview) return;
    try {
      await settleMutation.mutateAsync({
        settlementDate: preview.settlementDate,
        shiftName: 'CA_NGAY',
        actualCountedCash,
        denominationsDetail: counts,
        note: note.trim() || undefined,
      });

      notify('cashflow.settle.success', {
        variant: 'success',
        vars: { settlementDate: preview.settlementDate },
      });
      setNote('');
      setBlindNoteRequired(false);
    } catch (err) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'CASHFLOW_DISCREPANCY_NOTE_REQUIRED') {
        setBlindNoteRequired(true);
      }
      const resolvedErr = resolveErrorMessage(
        'cashflow.settle.error',
        err,
        'Vui lòng kiểm tra lại dữ liệu.',
      );
      notify('cashflow.settle.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng kiểm tra lại dữ liệu.' },
      });
    }
  };

  const handleCompensateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compensateTarget) return;
    const trimmedNote = compensateNote.trim();
    if (trimmedNote.length < 3) {
      notify('cashflow.compensate.invalidNote', { variant: 'destructive' });
      return;
    }
    if (compensateAmount === null || compensateAmount <= 0) {
      notify('cashflow.compensate.invalidAmount', { variant: 'destructive' });
      return;
    }

    try {
      const updated = await compensateMutation.mutateAsync({
        settlementId: compensateTarget.id,
        body: {
          compensationAmount: compensateAmount,
          note: trimmedNote,
        },
      });
      if (updated.discrepancyAmount === 0) {
        notify('cashflow.compensate.balancedSuccess', {
          variant: 'success',
          vars: { settlementDate: compensateTarget.settlementDate },
        });
      } else {
        notify('cashflow.compensate.partialSuccess', {
          variant: 'success',
          vars: {
            settlementDate: compensateTarget.settlementDate,
            discrepancyFormatted: `${updated.discrepancyAmount > 0 ? '+' : ''}${updated.discrepancyAmount.toLocaleString('vi-VN')}`,
          },
        });
      }
      setCompensateTarget(null);
      setCompensateAmount(null);
      setCompensateNote('');
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'cashflow.compensate.error',
        err,
        'Vui lòng thử lại sau.',
      );
      notify('cashflow.compensate.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại sau.' },
      });
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const allRows = await fetchAllPaginated((exportPage, exportLimit) =>
        fetchCashflowSettlements({
          page: exportPage,
          limit: exportLimit,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          closerKeyword: closerKeyword.trim() || undefined,
        }),
      );
      exportToExcel({
        filename: `ket-ca-dong-tien-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'DoiSoatKetCa',
        rows: allRows,
        columns: [
          { header: 'Ngày', key: 'settlementDate', width: 14 },
          { header: 'Đầu ngày', key: 'openingBudget', width: 14 },
          { header: 'Tiền mặt', key: 'totalCashSales', width: 14 },
          { header: 'Chuyển khoản', key: 'totalTransferSales', width: 14 },
          { header: 'Chi két', key: 'totalCashImports', width: 14 },
          { header: 'Lý thuyết', key: 'expectedCashInDrawer', width: 15 },
          { header: 'Thực đếm', key: 'actualCountedCash', width: 15 },
          { header: 'Chênh lệch', key: 'discrepancyAmount', width: 14 },
          {
            header: 'Trạng thái',
            value: (row) =>
              row.status === 'MATCHED' ? 'Chuẩn' : row.status === 'SURPLUS' ? 'Dư' : 'Thiếu',
            width: 12,
          },
          { header: 'Ghi chú', key: 'note', width: 28 },
          {
            header: 'Người thực hiện',
            value: (row) =>
              row.closedByName
                ? `${row.closedByName}${row.closedByUsername ? ` (${row.closedByUsername})` : ''}`
                : `Nhân viên #${row.closedBy}`,
            width: 24,
          },
        ],
      });
      notify('cashflow.exportExcelSuccess', {
        variant: 'success',
        vars: { count: allRows.length },
      });
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'cashflow.exportExcelError',
        err,
        'Vui lòng thử lại sau.',
      );
      notify('cashflow.exportExcelError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại sau.' },
      });
    } finally {
      setIsExporting(false);
    }
  };

  const historyColumns = React.useMemo<ColumnDef<SettlementResponse, unknown>[]>(
    () => [
      {
        id: 'settlementDate',
        accessorKey: 'settlementDate',
        header: 'Ngày',
        size: 108,
        cell: ({ row }) => (
          <div className="whitespace-nowrap font-semibold text-foreground tabular-nums">
            {row.original.settlementDate}
          </div>
        ),
      },
      {
        accessorKey: 'openingBudget',
        header: 'Đầu ngày',
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{row.original.openingBudget.toLocaleString('vi-VN')} đ</span>
        ),
      },
      {
        accessorKey: 'totalCashSales',
        header: 'Tiền mặt',
        size: 104,
        cell: ({ row }) => (
          <span className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums whitespace-nowrap">
            +{row.original.totalCashSales.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'totalTransferSales',
        header: 'Chuyển khoản',
        size: 112,
        cell: ({ row }) => (
          <span className="font-semibold text-sky-700 dark:text-sky-300 tabular-nums whitespace-nowrap">
            {row.original.totalTransferSales.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'totalCashImports',
        header: 'Chi két',
        size: 98,
        cell: ({ row }) => (
          <span className="font-semibold text-rose-700 dark:text-rose-300 tabular-nums whitespace-nowrap">
            -{row.original.totalCashImports.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'expectedCashInDrawer',
        header: 'Lý thuyết',
        size: 112,
        cell: ({ row }) => (
          <span className="font-bold text-foreground tabular-nums whitespace-nowrap">
            {row.original.expectedCashInDrawer.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'actualCountedCash',
        header: 'Thực đếm',
        size: 112,
        cell: ({ row }) => (
          <span className="font-bold text-price tabular-nums whitespace-nowrap">
            {row.original.actualCountedCash.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'discrepancyAmount',
        header: 'Chênh lệch',
        size: 108,
        cell: ({ row }) => {
          const diff = row.original.discrepancyAmount;
          return (
            <span
              className={
                diff === 0
                  ? 'font-semibold text-emerald-600 tabular-nums whitespace-nowrap'
                  : diff > 0
                    ? 'font-bold text-amber-600 tabular-nums whitespace-nowrap'
                    : 'font-bold text-rose-600 tabular-nums whitespace-nowrap'
              }
            >
              {diff > 0 ? '+' : ''}
              {diff.toLocaleString('vi-VN')} đ
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        size: 96,
        cell: ({ row }) => {
          const st = row.original.status;
          return (
            <Badge
              variant={
                st === 'MATCHED' ? 'success' : st === 'SURPLUS' ? 'warning' : 'destructive'
              }
            >
              {st === 'MATCHED' ? 'Chuẩn' : st === 'SURPLUS' ? 'Dư' : 'Thiếu'}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'note',
        header: 'Ghi chú',
        size: 180,
        cell: ({ row }) => (
          <div className="max-w-[180px] min-w-0">
            <TruncatedTextWithTooltip text={row.original.note} />
          </div>
        ),
      },
      {
        accessorKey: 'closedBy',
        header: 'Người thực hiện',
        size: 148,
        cell: ({ row }) => {
          const item = row.original;
          const display = item.closedByName
            ? `${item.closedByName}${item.closedByUsername ? ` (${item.closedByUsername})` : ''}`
            : `Nhân viên #${item.closedBy}`;
          return <TruncatedTextWithTooltip text={display} className="text-xs font-medium" />;
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        size: 86,
        cell: ({ row }) => {
          const item = row.original;
          if (!canCompensate || item.discrepancyAmount === 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Bù chênh lệch"
              aria-label="Bù chênh lệch"
              data-testid={`compensate-settlement-btn-${item.id}`}
              onClick={() => {
                setCompensateTarget(item);
                setCompensateAmount(Math.abs(item.discrepancyAmount));
                setCompensateNote('Bù chênh lệch kết ca');
              }}
              className="h-8 w-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          );
        },
      },
    ],
    [canCompensate],
  );

  const openingBudget = preview?.openingBudget ?? 0;
  const isBlindMode = Boolean(preview?.blindMode || preview?.expectedCashInDrawer === null);
  const totalCashSales = isBlindMode ? null : (preview?.totalCashSales ?? 0);
  const totalTransferSales = isBlindMode ? null : (preview?.totalTransferSales ?? 0);
  const totalCashImports = isBlindMode ? null : (preview?.totalCashImports ?? 0);
  const expectedCashInDrawer = isBlindMode ? null : (preview?.expectedCashInDrawer ?? 0);
  const settlementDate = preview?.settlementDate ?? '';

  const historyItems = settlementsData?.items ?? [];
  const historyTotal = settlementsData?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / limit));

  if (!preview && previewQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={previewQuery.error}
        onRetry={() => void previewQuery.refetch()}
      />
    );
  }

  return (
    <div data-testid="cashflow-page" className="space-y-5">
      {/* Thẻ Ngân sách tiền lẻ đầu ngày */}
      <PageHeader
        path="/cashflow"
        defaultTitle="Ngân sách, Dòng tiền & Đối soát Kết ca"
        className="rounded-xl border bg-card p-4 shadow-sm sm:items-center"
        titleClassName="text-lg font-bold tracking-tight text-foreground"
        subtitleClassName="text-xs text-muted-foreground"
        leadingVisual={
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-accent-text">
            <Wallet className="h-5 w-5" />
          </div>
        }
        defaultSubtitleNode={
          <>
            Ngân sách tiền lẻ mặc định đầu ca:{' '}
            <strong data-testid="current-opening-budget" className="font-mono text-sm text-price">
              {openingBudget.toLocaleString('vi-VN')} đ
            </strong>
          </>
        }
        actions={
          <>
            <AuditHistoryButton module="CASHFLOW" />
            {canConfigBudget ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-default-budget-btn"
                onClick={() => setBudgetDialogOpen(true)}
                className="font-semibold"
              >
                <Settings2 className="h-4 w-4 shrink-0" />
                <span>Sửa Ngân sách đầu ngày</span>
              </Button>
            ) : null}
            {canExport ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-cashflow-excel-btn"
                disabled={isExporting}
                onClick={handleExportExcel}
                className="font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{isExporting ? 'Đang xuất...' : 'Xuất file Excel'}</span>
              </Button>
            ) : null}
          </>
        }
      />

      {/* Khu vực Đếm tiền 9 mệnh giá & Đối soát Kết ca */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DenominationCounterGrid
          counts={counts}
          onChangeCount={handleUpdateCount}
          onReset={() => setCounts(INITIAL_DENOMINATIONS)}
        />

        <SettlementSummaryCard
          settlementDate={settlementDate}
          openingBudget={openingBudget}
          totalCashSales={totalCashSales}
          totalTransferSales={totalTransferSales}
          totalCashImports={totalCashImports}
          expectedCashInDrawer={expectedCashInDrawer}
          actualCountedCash={actualCountedCash}
          blindMode={isBlindMode}
          blindNoteRequired={blindNoteRequired}
          note={note}
          onNoteChange={setNote}
          onSubmitSettlement={handleSubmitSettlement}
          isSubmitting={settleMutation.isPending}
          canSettle={canSettle}
        />
      </div>

      {/* BaseTable Lịch sử Kết ca */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">Lịch sử Đối soát Kết ca</h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Thanh tìm kiếm nhỏ theo Người thực hiện */}
            <div ref={closerSearch.containerRef} className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                data-testid="cashflow-closer-search"
                {...closerSearch.inputProps}
                placeholder="Tìm người thực hiện..."
                className="h-8 pl-8 pr-7 text-xs"
              />
              {closerSearch.draft ? (
                <button
                  type="button"
                  title="Xoá tìm kiếm"
                  aria-label="Xoá tìm kiếm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={closerSearch.clear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* Bộ lọc ngày Từ - Đến + Nút Đặt lại ngay cạnh */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="cashflow-from-date" className="text-xs font-medium text-muted-foreground">
                Từ
              </label>
              <Input
                id="cashflow-from-date"
                data-testid="cashflow-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  setFromDate(nextFrom);
                  if (toDate && nextFrom && toDate < nextFrom) {
                    setToDate(nextFrom);
                  }
                  setPage(1);
                }}
                className="h-8 w-36 text-xs"
              />
              <label htmlFor="cashflow-to-date" className="text-xs font-medium text-muted-foreground">
                Đến
              </label>
              <Input
                id="cashflow-to-date"
                data-testid="cashflow-to-date"
                type="date"
                min={fromDate || undefined}
                value={toDate}
                onChange={(e) => {
                  const nextTo = e.target.value;
                  if (fromDate && nextTo && nextTo < fromDate) {
                    setToDate(fromDate);
                  } else {
                    setToDate(nextTo);
                  }
                  setPage(1);
                }}
                className="h-8 w-36 text-xs"
              />
              {fromDate || toDate || closerKeyword || closerSearch.draft ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Đặt lại bộ lọc"
                  aria-label="Đặt lại bộ lọc"
                  data-testid="cashflow-reset-filters-btn"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    closerSearch.clear();
                    setCloserKeyword('');
                    setPage(1);
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <BaseTable
          tableId="cashflow-settlements"
          data={historyItems}
          columns={historyColumns}
          isLoading={isLoadingHistory}
          isFetching={settlementsQuery.isFetching}
          isPlaceholderData={settlementsQuery.isPlaceholderData}
          emptyMessage="Chưa có lịch sử kết ca nào."
          pagination={{
            page,
            limit,
            total: historyTotal,
            totalPages: historyTotalPages,
            onPageChange: setPage,
            onLimitChange: (nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            },
          }}
        />
      </div>

      <DefaultBudgetDialog
        currentBudget={openingBudget}
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
      />

      <Dialog
        open={compensateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCompensateTarget(null);
            setCompensateAmount(null);
            setCompensateNote('');
          }
        }}
      >
        <DialogContent data-testid="compensate-settlement-dialog" className="sm:max-w-md">
          {compensateTarget ? (
            <form onSubmit={handleCompensateSettlement} className="space-y-4">
              <DialogHeader>
                {(() => {
                  const directionNote =
                    compensateTarget.discrepancyAmount < 0
                      ? 'cộng thêm vào thực đếm'
                      : 'trừ bớt khỏi thực đếm';
                  const discrepancyFormatted = `${
                    compensateTarget.discrepancyAmount > 0 ? '+' : ''
                  }${compensateTarget.discrepancyAmount.toLocaleString('vi-VN')}`;
                  const compensateCopy = resolveMessage('cashflow.confirm.compensate', {
                    settlementDate: compensateTarget.settlementDate,
                    discrepancyFormatted,
                    directionNote,
                  });
                  return (
                    <>
                      <DialogTitle>{compensateCopy.title}</DialogTitle>
                      <DialogDescription>
                        {compensateCopy.isOverridden && compensateCopy.description ? (
                          compensateCopy.description
                        ) : (
                          <>
                            Biên bản ngày <strong>{compensateTarget.settlementDate}</strong> hiện đang lệch{' '}
                            <strong className="text-foreground">{discrepancyFormatted} đ</strong>
                            . Nhập số tiền cần {directionNote} để điều chỉnh chênh lệch.
                          </>
                        )}
                      </DialogDescription>
                    </>
                  );
                })()}
              </DialogHeader>

              <div className="space-y-1.5">
                <label htmlFor="compensate-amount-input" className="text-xs font-semibold text-foreground">
                  Số tiền bù (VNĐ) <span className="text-destructive">*</span>
                </label>
                <CurrencyInput
                  id="compensate-amount-input"
                  data-testid="compensate-amount-input"
                  value={compensateAmount}
                  onValueChange={(_, num) => setCompensateAmount(num)}
                  suffix="đ"
                  placeholder="VD: 50.000"
                />
                {compensateAmount !== null && compensateAmount > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Chênh lệch dự kiến sau bù:{' '}
                    <strong className="font-mono text-foreground">
                      {(() => {
                        const signedDelta =
                          compensateTarget.discrepancyAmount < 0 ? compensateAmount : -compensateAmount;
                        const nextDiff =
                          Math.round((compensateTarget.discrepancyAmount + signedDelta) * 100) / 100;
                        return `${nextDiff > 0 ? '+' : ''}${nextDiff.toLocaleString('vi-VN')} đ`;
                      })()}
                    </strong>
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="compensate-note-input" className="text-xs font-semibold text-foreground">
                  Ghi chú đối soát / lý do bù <span className="text-destructive">*</span>
                </label>
                <Input
                  id="compensate-note-input"
                  data-testid="compensate-note-input"
                  value={compensateNote}
                  onChange={(e) => setCompensateNote(e.target.value)}
                  placeholder="VD: Nhân viên bù tiền thiếu cuối ngày..."
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCompensateTarget(null);
                    setCompensateAmount(null);
                    setCompensateNote('');
                  }}
                >
                  Huỷ bỏ
                </Button>
                <Button
                  type="submit"
                  data-testid="confirm-compensate-settlement-btn"
                  disabled={
                    compensateAmount === null ||
                    compensateAmount <= 0 ||
                    compensateNote.trim().length < 3 ||
                    compensateMutation.isPending
                  }
                >
                  Xác nhận bù chênh lệch
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
