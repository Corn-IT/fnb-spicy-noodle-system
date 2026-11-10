import { type ColumnDef } from '@tanstack/react-table';
import { type DenominationsDetail, type SettlementResponse } from '@fnb/shared';
import { Settings2, Wallet } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import {
  useCashflowPreviewQuery,
  useCashflowSettlementsQuery,
  useSettleShiftMutation,
} from '@/features/cashflow/api/cashflow.api';
import { DefaultBudgetDialog } from '@/features/cashflow/components/default-budget-dialog';
import {
  calculateDenominationsTotal,
  DenominationCounterGrid,
  INITIAL_DENOMINATIONS,
} from '@/features/cashflow/components/denomination-counter-grid';
import { SettlementSummaryCard } from '@/features/cashflow/components/settlement-summary-card';
import { useAuthStore } from '@/stores/auth.store';

export function CashflowPage() {
  const [counts, setCounts] = React.useState<DenominationsDetail>(INITIAL_DENOMINATIONS);
  const [shiftName, setShiftName] = React.useState<string>('Ca Tối');
  const [note, setNote] = React.useState<string>('');
  const [budgetDialogOpen, setBudgetDialogOpen] = React.useState(false);

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const user = useAuthStore((state) => state.user);
  const canConfigBudget = Boolean(user?.isSuperAdmin || user?.permissions.cashflow?.config);
  const canSettle = Boolean(user?.isSuperAdmin || user?.permissions.cashflow?.create);

  const { data: preview } = useCashflowPreviewQuery();
  const { data: settlementsData, isLoading: isLoadingHistory } = useCashflowSettlementsQuery({
    page,
    limit,
  });

  const settleMutation = useSettleShiftMutation();

  React.useEffect(() => {
    if (preview?.shiftName) {
      setShiftName(preview.shiftName);
    }
  }, [preview?.shiftName]);

  const actualCountedCash = React.useMemo(
    () => calculateDenominationsTotal(counts),
    [counts],
  );

  const handleUpdateCount = (key: keyof DenominationsDetail, value: number) => {
    setCounts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmitSettlement = async () => {
    if (!preview) return;
    try {
      await settleMutation.mutateAsync({
        settlementDate: preview.settlementDate,
        shiftName,
        actualCountedCash,
        denominationsDetail: counts,
        note: note.trim() || undefined,
      });

      toast({
        title: 'Đã chốt sổ kết ca thành công',
        description: `Đã lưu biên bản kết ca ${shiftName} ngày ${preview.settlementDate}.`,
      });
      setNote('');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể kết ca',
        description: err instanceof Error ? err.message : 'Vui lòng kiểm tra lại dữ liệu.',
      });
    }
  };

  const historyColumns = React.useMemo<ColumnDef<SettlementResponse, unknown>[]>(
    () => [
      {
        id: 'dateAndShift',
        header: 'Ngày / Ca',
        size: 110,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-semibold text-foreground tabular-nums">{row.original.settlementDate}</div>
            <div className="text-xs text-muted-foreground">{row.original.shiftName}</div>
          </div>
        ),
      },
      {
        accessorKey: 'openingBudget',
        header: 'Đầu ca',
        size: 105,
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">{row.original.openingBudget.toLocaleString('vi-VN')} đ</span>
        ),
      },
      {
        accessorKey: 'totalCashSales',
        header: 'Thu TM',
        size: 105,
        cell: ({ row }) => (
          <span className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums whitespace-nowrap">
            +{row.original.totalCashSales.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'totalTransferSales',
        header: 'Thu QR (NH)',
        size: 105,
        cell: ({ row }) => (
          <span className="font-semibold text-sky-700 dark:text-sky-300 tabular-nums whitespace-nowrap">
            {row.original.totalTransferSales.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'totalCashImports',
        header: 'Chi tiền két',
        size: 105,
        cell: ({ row }) => (
          <span className="font-semibold text-rose-700 dark:text-rose-300 tabular-nums whitespace-nowrap">
            -{row.original.totalCashImports.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'expectedCashInDrawer',
        header: 'Tiền lý thuyết',
        size: 128,
        cell: ({ row }) => (
          <span className="font-bold text-foreground tabular-nums whitespace-nowrap">
            {row.original.expectedCashInDrawer.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'actualCountedCash',
        header: 'Tiền thực đếm',
        size: 128,
        cell: ({ row }) => (
          <span className="font-bold text-primary tabular-nums whitespace-nowrap">
            {row.original.actualCountedCash.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        accessorKey: 'discrepancyAmount',
        header: 'Chênh lệch',
        size: 105,
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
        header: 'Tình trạng',
        size: 110,
        cell: ({ row }) => {
          const st = row.original.status;
          return (
            <div className="space-y-0.5 min-w-0">
              <Badge
                variant={
                  st === 'MATCHED' ? 'success' : st === 'SURPLUS' ? 'warning' : 'destructive'
                }
              >
                {st === 'MATCHED' ? 'Chuẩn' : st === 'SURPLUS' ? 'Dư' : 'Thiếu'}
              </Badge>
              {row.original.note ? (
                <div className="truncate text-[11px] text-muted-foreground" title={row.original.note}>
                  {row.original.note}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'closedBy',
        header: 'Đóng ca',
        size: 85,
        cell: ({ row }) => <span className="whitespace-nowrap">User #{row.original.closedBy}</span>,
      },
    ],
    [],
  );

  const openingBudget = preview?.openingBudget ?? 0;
  const totalCashSales = preview?.totalCashSales ?? 0;
  const totalTransferSales = preview?.totalTransferSales ?? 0;
  const totalCashImports = preview?.totalCashImports ?? 0;
  const expectedCashInDrawer = preview?.expectedCashInDrawer ?? 0;
  const settlementDate = preview?.settlementDate ?? '';

  const historyItems = settlementsData?.items ?? [];
  const historyTotal = settlementsData?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / limit));

  return (
    <div data-testid="cashflow-page" className="space-y-5">
      {/* Thẻ Ngân sách tiền lẻ đầu ngày */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              Ngân sách, Dòng tiền & Đối soát Kết ca
            </h1>
            <p className="text-xs text-muted-foreground">
              Ngân sách tiền lẻ mặc định đầu ca:{' '}
              <strong data-testid="current-opening-budget" className="font-mono text-sm text-primary">
                {openingBudget.toLocaleString('vi-VN')} đ
              </strong>
            </p>
          </div>
        </div>

        {canConfigBudget ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="open-default-budget-btn"
            onClick={() => setBudgetDialogOpen(true)}
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span>Sửa Ngân sách đầu ngày</span>
          </Button>
        ) : null}
      </div>

      {/* Khu vực Đếm tiền 9 mệnh giá & Đối soát Kết ca */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DenominationCounterGrid
          counts={counts}
          onChangeCount={handleUpdateCount}
          onReset={() => setCounts(INITIAL_DENOMINATIONS)}
        />

        <SettlementSummaryCard
          settlementDate={settlementDate}
          shiftName={shiftName}
          openingBudget={openingBudget}
          totalCashSales={totalCashSales}
          totalTransferSales={totalTransferSales}
          totalCashImports={totalCashImports}
          expectedCashInDrawer={expectedCashInDrawer}
          actualCountedCash={actualCountedCash}
          note={note}
          onShiftNameChange={setShiftName}
          onNoteChange={setNote}
          onSubmitSettlement={handleSubmitSettlement}
          isSubmitting={settleMutation.isPending}
          canSettle={canSettle}
        />
      </div>

      {/* BaseTable Lịch sử Kết ca */}
      <div className="space-y-2">
        <h2 className="text-base font-bold text-foreground">Lịch sử Đối soát Kết ca</h2>
        <BaseTable
          tableId="cashflow-settlements"
          data={historyItems}
          columns={historyColumns}
          isLoading={isLoadingHistory}
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
    </div>
  );
}
