import { QueryClient } from '@tanstack/react-query';
import { SettlementStatus, UserPermissionsSchema } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { CashflowPage } from '@/features/cashflow';
import * as excelExport from '@/lib/excel-export';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const superAdminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    cashflow: { view: true, create: true, compensate: true, config: true, export: true },
  }),
};

const blindCashierUser = {
  id: 2,
  employeeId: 2,
  username: 'cashier01',
  fullName: 'Thu Ngân Ca Tối',
  isSuperAdmin: false,
  permissions: UserPermissionsSchema.parse({
    cashflow: { view: true, create: true, compensate: false, config: false, export: false },
  }),
};

function renderCashflow() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter future={routerFutureFlags}>
        <CashflowPage />
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('Wave 5 — CashflowPage, 9-Denomination Counter, Blind Mode, Default Budget & Compensate Modal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({ accessToken: 'token', user: superAdminUser });
  });

  it('exercises 9-denomination grid, SuperAdmin preview formulas, DefaultBudgetDialog, SURPLUS CompensateSettlementDialog & Excel export', async () => {
    const surplusSettlement = {
      id: 77,
      settlementDate: '2026-11-26',
      shiftName: 'CA_NGAY',
      openingBudget: 1000000,
      totalCashSales: 500000,
      totalTransferSales: 200000,
      totalCashImports: 100000,
      expectedCashInDrawer: 1400000,
      actualCountedCash: 1500000,
      discrepancyAmount: 100000,
      cashRetainedInDrawer: 1000000,
      cashToHandOver: 500000,
      status: SettlementStatus.SURPLUS,
      denominationsDetail: {
        '500000': 3, '200000': 0, '100000': 0, '50000': 0, '20000': 0,
        '10000': 0, '5000': 0, '2000': 0, '1000': 0,
      },
      note: 'Dư tiền ca trước',
      closedBy: 1,
      closedByName: 'Chủ Quán',
      closedByUsername: 'superadmin',
      createdAt: '2026-11-26T15:00:00.000Z',
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/cashflow/preview') {
        return {
          settlementDate: '2026-11-27',
          shiftName: 'CA_NGAY',
          blindMode: false,
          openingBudget: 1000000,
          totalCashSales: 500000,
          totalTransferSales: 300000,
          totalCashImports: 100000,
          expectedCashInDrawer: 1400000,
        };
      }
      if (url === '/api/v1/cashflow/settlements') {
        return { page: 1, limit: 20, total: 1, items: [surplusSettlement] };
      }
      return {};
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ openingBudget: 1200000 });
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url.endsWith('/compensate')) {
        return { ...surplusSettlement, actualCountedCash: 1400000, discrepancyAmount: 0, status: SettlementStatus.MATCHED };
      }
      return surplusSettlement;
    });
    const exportSpy = vi.spyOn(excelExport, 'exportToExcel').mockImplementation(() => {});

    renderCashflow();
    await waitFor(() =>
      expect(screen.getByTestId('expected-cash-in-drawer')).toHaveTextContent('1.400.000 đ'),
    );
    expect(screen.getByTestId('cash-sales-amount')).toHaveTextContent('500.000 đ');
    expect(screen.getByTestId('cash-imports-amount')).toHaveTextContent('100.000 đ');

    // Count 2 x 500k + 2 x 200k = 1.400.000 đ -> discrepancy 0 (MATCHED)
    fireEvent.change(screen.getByTestId('denom-input-500000'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('denom-input-200000'), { target: { value: '2' } });
    expect(screen.getByTestId('actual-counted-cash')).toHaveTextContent('1.400.000 đ');
    expect(screen.getByTestId('discrepancy-amount')).toHaveTextContent('0 đ');
    expect(screen.getByTestId('settlement-status-badge')).toHaveTextContent('Chuẩn');
    expect(screen.getByTestId('handover-owner-cash')).toHaveTextContent('400.000 đ');

    // Open DefaultBudgetDialog & save new opening budget
    fireEvent.click(screen.getByTestId('open-default-budget-btn'));
    await waitFor(() => expect(screen.getByTestId('default-budget-dialog')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('default-budget-input'), { target: { value: '1200000' } });
    fireEvent.click(screen.getByTestId('save-default-budget-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/cashflow/default-budget', { openingBudget: 1200000 });
    });

    // Date filters & reset
    const fromDate = screen.getByTestId('cashflow-from-date') as HTMLInputElement;
    const toDate = screen.getByTestId('cashflow-to-date') as HTMLInputElement;
    fireEvent.change(fromDate, { target: { value: '2026-11-20' } });
    fireEvent.change(toDate, { target: { value: '2026-11-15' } });
    expect(toDate.value).toBe('2026-11-20');
    fireEvent.click(screen.getByTestId('cashflow-reset-filters-btn'));
    expect(fromDate.value).toBe('');

    // Open SURPLUS CompensateSettlementDialog -> note < 3 disables confirm -> valid compensation submits
    fireEvent.click(screen.getByTestId('compensate-settlement-btn-77'));
    await waitFor(() => expect(screen.getByTestId('compensate-settlement-dialog')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('compensate-amount-input'), { target: { value: '100000' } });
    fireEvent.change(screen.getByTestId('compensate-note-input'), { target: { value: 'ok' } });
    expect(screen.getByTestId('confirm-compensate-settlement-btn')).toBeDisabled();

    fireEvent.change(screen.getByTestId('compensate-note-input'), { target: { value: 'Rút thừa về quỹ công ty' } });
    fireEvent.click(screen.getByTestId('confirm-compensate-settlement-btn'));
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/cashflow/settlements/77/compensate', {
        compensationAmount: 100000,
        note: 'Rút thừa về quỹ công ty',
      });
    });

    // Export Excel
    fireEvent.click(screen.getByTestId('export-cashflow-excel-btn'));
    await waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1));
  });

  it('hides theoretical figures in Blind Mode for non-SuperAdmin and enforces discrepancy note prompt after 422 CASHFLOW_DISCREPANCY_NOTE_REQUIRED', async () => {
    useAuthStore.getState().setAuth({ accessToken: 'token', user: blindCashierUser });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/cashflow/preview') {
        return {
          settlementDate: '2026-11-27',
          shiftName: 'CA_NGAY',
          blindMode: true,
          openingBudget: 1000000,
          totalCashSales: null,
          totalTransferSales: null,
          totalCashImports: null,
          expectedCashInDrawer: null,
        };
      }
      if (url === '/api/v1/cashflow/settlements') {
        return { page: 1, limit: 20, total: 0, items: [] };
      }
      return {};
    });

    const settleSpy = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValueOnce(
        Object.assign(new Error('Vui lòng nhập ghi chú giải trình khi tiền thực đếm chênh lệch'), {
          status: 422,
          code: 'CASHFLOW_DISCREPANCY_NOTE_REQUIRED',
        }),
      )
      .mockResolvedValueOnce({ id: 99, status: SettlementStatus.SHORTAGE, discrepancyAmount: -50000 });

    renderCashflow();
    await waitFor(() => expect(screen.getByTestId('blind-settlement-badge')).toBeInTheDocument());
    expect(screen.getByTestId('blind-settlement-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('expected-cash-in-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-default-budget-btn')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('denom-input-500000'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('submit-settlement-btn'));

    await waitFor(() => expect(screen.getByTestId('blind-discrepancy-prompt')).toBeInTheDocument());
    expect(screen.getByTestId('submit-settlement-btn')).toBeDisabled();

    fireEvent.change(screen.getByTestId('discrepancy-note-input'), {
      target: { value: 'Khách đưa thiếu 50k đã báo lại quản lý' },
    });
    expect(screen.getByTestId('submit-settlement-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('submit-settlement-btn'));

    await waitFor(() => expect(settleSpy).toHaveBeenCalledTimes(2));
  });
});
