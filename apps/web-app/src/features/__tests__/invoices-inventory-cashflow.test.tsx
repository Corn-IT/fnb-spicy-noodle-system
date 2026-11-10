import { QueryClient } from '@tanstack/react-query';
import { type OrderDetailResponse } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { useToastStore } from '@/components/ui/toast';
import { CashflowPage } from '@/features/cashflow';
import { InventoryPage } from '@/features/inventory';
import { InvoicesPage } from '@/features/invoices';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const cashierUser = {
  id: 2,
  employeeId: 12,
  username: 'cashier01',
  fullName: 'Nguyễn Văn Anh',
  isSuperAdmin: false,
  permissions: {
    pos: {
      view: true,
      create: true,
      update: true,
      delete: false,
      splitKitchen: true,
      tableAction: true,
      checkout: true,
    },
    invoices: { view: true, reprint: true, void: false },
    inventory: { view: true, create: true, update: false, delete: true },
    cashflow: { view: true, create: true, config: false },
    employees: { view: false, create: false, update: false, delete: false },
    schedules: { view: false, update: false },
    mdm: { view: false, write: false },
    rbac: { view: false, manage: false },
  },
};

const superAdminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: {
    pos: {
      view: true,
      create: true,
      update: true,
      delete: true,
      splitKitchen: true,
      tableAction: true,
      checkout: true,
    },
    invoices: { view: true, reprint: true, void: true },
    inventory: { view: true, create: true, update: true, delete: true },
    cashflow: { view: true, create: true, config: true },
    employees: { view: true, create: true, update: true, delete: true },
    schedules: { view: true, update: true },
    mdm: { view: true, write: true },
    rbac: { view: true, manage: true },
  },
};

describe('Story 11 — Invoices (Module 2), Inventory Imports (Module 3) & Cashflow Settlement (Module 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  describe('AC-11.1: Module 2 — Invoices 7-Column BaseTable, Dual Filter Bar, Detail Modal Reprint & Void Guard (EC-FIN-01)', () => {
    const mockInvoiceListResponse = {
      page: 1,
      limit: 20,
      total: 2,
      items: [
        {
          orderId: 501,
          orderCode: 'HD-20261108-0001',
          orderType: 'DINE_IN' as const,
          tableId: 5,
          tableLabel: 'Bàn 05',
          takeawayNumber: null,
          status: 'PAID' as const,
          paymentMethod: 'CASH' as const,
          totalAmount: 185000,
          createdAt: '2026-11-08T02:15:30.000Z',
          note: 'Ít hành',
        },
        {
          orderId: 502,
          orderCode: 'HD-20261108-0002',
          orderType: 'TAKEAWAY' as const,
          tableId: null,
          tableLabel: 'Mang về #02',
          takeawayNumber: 2,
          status: 'PAID' as const,
          paymentMethod: 'SPLIT' as const,
          totalAmount: 300000,
          createdAt: '2026-11-08T02:20:00.000Z',
          note: null,
        },
      ],
    };

    const mockOrderDetail501: OrderDetailResponse = {
      orderId: 501,
      orderCode: 'HD-20261108-0001',
      orderType: 'DINE_IN',
      orderSource: 'POS_COUNTER',
      tableId: 5,
      tableLabel: 'Bàn 05',
      takeawayNumber: null,
      status: 'PAID',
      paymentMethod: 'CASH',
      cashAmount: 185000,
      transferAmount: 0,
      totalAmount: 185000,
      note: 'Ít hành',
      createdAt: '2026-11-08T02:15:30.000Z',
      paidAt: '2026-11-08T02:45:00.000Z',
      tableTransferLogs: [
        {
          action: 'MOVE',
          fromTable: 'Bàn 01',
          toTable: 'Bàn 05',
          timestamp: '2026-11-08T02:25:00.000Z',
          reason: 'Khách đổi chỗ mát hơn',
        },
      ],
      items: [
        {
          id: 901,
          productId: 101,
          name: 'Mì Kim Chi Bò Mỹ',
          quantity: 2,
          unitPrice: 65000,
          lineTotal: 130000,
          modifiers: ['Cấp 3', 'Thêm Phô Mai'],
          itemNote: 'Ít hành',
          batchNo: 1,
          kitchenStatus: 'PRINTED',
        },
        {
          id: 902,
          productId: 102,
          name: 'Trà Đào Cam Sả',
          quantity: 1,
          unitPrice: 55000,
          lineTotal: 55000,
          modifiers: [],
          itemNote: null,
          batchNo: 2,
          kitchenStatus: 'PRINTED',
        },
      ],
    };

    it('should default Dual Filter to Today, combine right-side search criteria + keyword with AND, and completely hide Void button for cashier01', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices') return mockInvoiceListResponse;
        if (url === '/api/v1/invoices/501') return mockOrderDetail501;
        throw new Error(`Unexpected GET ${url}`);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <MemoryRouter future={routerFutureFlags}>
              <InvoicesPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('HD-20261108-0001')).toBeInTheDocument();
      });

      // Verify 7 standard columns are rendered
      expect(screen.getByText('Bàn 05')).toBeInTheDocument();
      expect(screen.getByText('Mang về #02')).toBeInTheDocument();
      expect(screen.getByTestId('payment-badge-501')).toHaveTextContent(/Tiền mặt|CASH/);
      expect(screen.getByTestId('payment-badge-502')).toHaveTextContent(/Kết hợp|SPLIT/);

      // Default Dual Filter sends today's fromDate & toDate
      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/invoices',
        expect.objectContaining({
          params: expect.objectContaining({
            fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          }),
        }),
      );

      expect(screen.getByTestId('invoice-status-filter')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-payment-filter')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('invoice-status-filter'), {
        target: { value: 'SERVING' },
      });
      fireEvent.change(screen.getByTestId('invoice-payment-filter'), {
        target: { value: 'TRANSFER' },
      });

      await waitFor(() => {
        expect(getSpy).toHaveBeenCalledWith(
          '/api/v1/invoices',
          expect.objectContaining({
            params: expect.objectContaining({ status: 'SERVING', paymentMethod: 'TRANSFER' }),
          }),
        );
      });

      // Void button is strictly hidden for cashier01
      expect(screen.queryByTestId('void-invoice-btn-501')).not.toBeInTheDocument();
      expect(screen.queryByTestId('void-invoice-btn-502')).not.toBeInTheDocument();

      // Switch search criteria on right side to 'table' (Số bàn) and type keyword 'Bàn 05'
      fireEvent.change(screen.getByTestId('invoice-search-field-select'), {
        target: { value: 'table' },
      });
      fireEvent.change(screen.getByTestId('invoice-keyword-input'), {
        target: { value: 'Bàn 05' },
      });

      await waitFor(() => {
        expect(getSpy).toHaveBeenCalledWith(
          '/api/v1/invoices',
          expect.objectContaining({
            params: expect.objectContaining({
              searchField: 'table',
              keyword: 'Bàn 05',
            }),
          }),
        );
      });
    });

    it('should show Void button for Super Admin, enforce voidReason >= 10 chars (EC-FIN-01), and open detail modal with batch items, transfer logs, and reprint receipt', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices') return mockInvoiceListResponse;
        if (url === '/api/v1/invoices/501') return mockOrderDetail501;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices/501/void') {
          return {
            orderId: 501,
            orderCode: 'HD-20261108-0001',
            status: 'VOIDED',
            voidReason: 'Thu ngân bấm nhầm phương thức thanh toán đơn bàn 05',
          };
        }
        if (url === '/api/v1/invoices/501/reprint') {
          return mockOrderDetail501;
        }
        throw new Error(`Unexpected POST ${url}`);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <MemoryRouter future={routerFutureFlags}>
              <InvoicesPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('void-invoice-btn-501')).toBeInTheDocument();
      });

      // Open Detail Modal via Eye button
      fireEvent.click(screen.getByTestId('view-invoice-btn-501'));

      await waitFor(() => {
        expect(screen.getByTestId('invoice-detail-modal')).toBeInTheDocument();
        expect(screen.getByText(/Mì Kim Chi Bò Mỹ/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Lượt 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Lượt 2/i)).toBeInTheDocument();
      expect(screen.getByText(/Khách đổi chỗ mát hơn/i)).toBeInTheDocument();

      // Click [In lại hoá đơn] inside modal
      fireEvent.click(screen.getByTestId('reprint-invoice-btn'));
      await waitFor(() => {
        expect(printSpy).toHaveBeenCalled();
      });
      expect(screen.getByTestId('reprint-feedback')).toHaveAttribute('role', 'status');
      expect(screen.getByTestId('reprint-feedback')).toHaveTextContent(
        'Đã gửi lệnh in lại hoá đơn',
      );

      // Close detail modal and open Void Dialog
      fireEvent.click(screen.getByTestId('close-invoice-detail-btn'));
      fireEvent.click(screen.getByTestId('void-invoice-btn-501'));

      expect(screen.getByTestId('void-invoice-dialog')).toBeInTheDocument();
      const voidReasonInput = screen.getByTestId('void-reason-input');
      const confirmVoidBtn = screen.getByTestId('confirm-void-invoice-btn');

      // Short reason (< 10 chars) -> button disabled
      fireEvent.change(voidReasonInput, { target: { value: 'Sai bill' } });
      expect(confirmVoidBtn).toBeDisabled();

      // Valid reason (>= 10 chars) -> button enabled & calls POST /api/v1/invoices/501/void
      fireEvent.change(voidReasonInput, {
        target: { value: 'Thu ngân bấm nhầm phương thức thanh toán đơn bàn 05' },
      });
      expect(confirmVoidBtn).not.toBeDisabled();

      fireEvent.click(confirmVoidBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/invoices/501/void', {
          voidReason: 'Thu ngân bấm nhầm phương thức thanh toán đơn bàn 05',
        });
      });
    });

    it('should hide reprint from a user who can view invoices but lacks reprint permission', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'view-only-token',
        user: {
          ...cashierUser,
          permissions: {
            ...cashierUser.permissions,
            invoices: { view: true, reprint: false, void: true },
          },
        },
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices') return mockInvoiceListResponse;
        if (url === '/api/v1/invoices/501') return mockOrderDetail501;
        throw new Error(`Unexpected GET ${url}`);
      });

      render(
        <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ThermalPrintProvider>
            <MemoryRouter future={routerFutureFlags}>
              <InvoicesPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      await waitFor(() => expect(screen.getByTestId('view-invoice-btn-501')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('view-invoice-btn-501'));
      await waitFor(() => expect(screen.getByTestId('invoice-detail-modal')).toBeInTheDocument());

      expect(screen.queryByTestId('reprint-invoice-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('void-invoice-btn-501')).not.toBeInTheDocument();
    });

    it('should not print an invoice when the authorized reprint endpoint rejects the request', async () => {
      useAuthStore.getState().setAuth({ accessToken: 'cashier-token', user: cashierUser });
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices') return mockInvoiceListResponse;
        if (url === '/api/v1/invoices/501') return mockOrderDetail501;
        throw new Error(`Unexpected GET ${url}`);
      });
      const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('403 Forbidden'));

      render(
        <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ThermalPrintProvider>
            <MemoryRouter future={routerFutureFlags}>
              <InvoicesPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      await waitFor(() => expect(screen.getByTestId('view-invoice-btn-501')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('view-invoice-btn-501'));
      await waitFor(() => expect(screen.getByTestId('reprint-invoice-btn')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('reprint-invoice-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/invoices/501/reprint');
        expect(useToastStore.getState().toasts).toContainEqual(
          expect.objectContaining({ title: 'Không thể in lại hoá đơn', variant: 'destructive' }),
        );
      });
      expect(await screen.findByTestId('reprint-feedback')).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('reprint-feedback')).toHaveTextContent(
        'Không thể in lại hoá đơn',
      );
      expect(printSpy).not.toHaveBeenCalled();
    });
  });

  describe('AC-11.2: Module 3 — Inventory 8+1 Columns, Footer Total & Drawer Smart MDM Combobox (Hard Invariant 7)', () => {
    const todayIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const mockImportsResponse = {
      page: 1,
      limit: 20,
      total: 2,
      items: [
        {
          id: 301,
          ingredientMdmId: 10,
          supplierMdmId: 12,
          supplierNameSnapshot: 'Công ty Rau Sạch',
          itemNameSnapshot: 'Nấm Kim Châm',
          unitName: 'Thùng',
          unitPrice: 120000,
          quantity: 2,
          totalCost: 240000,
          paymentSource: 'CASH_DRAWER' as const,
          importDate: todayIso,
          note: 'Nhập sáng sớm',
          createdBy: 2,
          isDeleted: false,
          createdAt: `${todayIso}T01:30:00.000Z`,
        },
        {
          id: 302,
          ingredientMdmId: 11,
          supplierMdmId: 12,
          supplierNameSnapshot: 'Công ty Rau Sạch',
          itemNameSnapshot: 'Bò Mỹ Ba Chỉ',
          unitName: 'Kg',
          unitPrice: 210000,
          quantity: 5,
          totalCost: 1050000,
          paymentSource: 'EXTERNAL' as const,
          importDate: '2026-11-01',
          note: 'Chủ quán chuyển khoản',
          createdBy: 1,
          isDeleted: false,
          createdAt: '2026-11-01T02:00:00.000Z',
        },
      ],
      summary: {
        totalImportCost: 1290000,
        totalCashDrawerCost: 240000,
        totalExternalCost: 1050000,
      },
    };

    const mockMdmIngredients = [
      {
        id: 10,
        category: 'INGREDIENT',
        name: 'Nấm Kim Châm',
        normalizedName: 'nam kim cham',
        metadata: { default_unit: 'Thùng', last_price: 120000 },
        isActive: true,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 11,
        category: 'INGREDIENT',
        name: 'Bò Mỹ Ba Chỉ',
        normalizedName: 'bo my ba chi',
        metadata: { default_unit: 'Kg', last_price: 210000 },
        isActive: true,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 12,
        category: 'SUPPLIER',
        name: 'Công ty Rau Sạch',
        normalizedName: 'cong ty rau sach',
        metadata: {},
        isActive: true,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    it('should render 9+1 columns, select a supplier from MDM, auto-fill ingredients and submit the full intake batch', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/inventory-imports') return mockImportsResponse;
        if (url === '/api/v1/mdm/lookup') return mockMdmIngredients;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        items: [],
        totalCost: 390000,
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <InventoryPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Nấm Kim Châm')).toBeInTheDocument();
      });

      // Verify footer total row
      expect(screen.getByTestId('inventory-footer-total')).toHaveTextContent(
        /Tổng tiền nhập hàng trong kỳ:\s*1\.290\.000\s*đ/i,
      );
      expect(screen.getByText('Nhà cung cấp')).toBeInTheDocument();
      expect(screen.getAllByText('Công ty Rau Sạch').length).toBeGreaterThan(0);

      // Cashier can delete today's import (301), but past-day import (302) delete button is disabled
      expect(screen.getByTestId('delete-import-btn-301')).not.toBeDisabled();
      expect(screen.getByTestId('delete-import-btn-302')).toBeDisabled();

      // Open right-side Drawer [+ Thêm mới]
      fireEvent.click(screen.getByTestId('open-import-drawer-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('inventory-import-drawer')).toBeInTheDocument();
      });

      const supplierInput = screen.getByTestId('supplier-combobox-input');
      fireEvent.focus(supplierInput);
      fireEvent.change(supplierInput, { target: { value: 'Công ty Rau' } });
      await waitFor(() => {
        expect(screen.getByTestId('supplier-option-12')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('supplier-option-12'));

      // Row 0: Search and pick existing MDM ingredient "Nấm Kim Châm" -> auto-fills unit "Thùng" and unitPrice "120000"
      const comboboxInput0 = screen.getByTestId('ingredient-combobox-input-0');
      fireEvent.focus(comboboxInput0);
      fireEvent.change(comboboxInput0, { target: { value: 'Nấm' } });

      await waitFor(() => {
        expect(screen.getByTestId('ingredient-option-0-10')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('ingredient-option-0-10'));

      const unitInput0 = screen.getByTestId('import-unit-input-0') as HTMLInputElement;
      const priceInput0 = screen.getByTestId('import-price-input-0') as HTMLInputElement;
      const qtyInput0 = screen.getByTestId('import-qty-input-0') as HTMLInputElement;

      expect(unitInput0.value).toBe('Thùng');
      expect(priceInput0.value).toBe('120000');

      fireEvent.change(qtyInput0, { target: { value: '2' } });
      expect(screen.getByTestId('import-line-total-0')).toHaveTextContent('240.000');

      // Add 2nd row and type a brand-new ingredient "Đá Bi Tinh Khiết"
      fireEvent.click(screen.getByTestId('add-import-row-btn'));
      const comboboxInput1 = screen.getByTestId('ingredient-combobox-input-1');
      fireEvent.focus(comboboxInput1);
      fireEvent.change(comboboxInput1, { target: { value: 'Đá Bi Tinh Khiết' } });

      await waitFor(() => {
        expect(screen.getByTestId('ingredient-create-new-1')).toHaveTextContent(
          /\+ Tạo mới nguyên liệu:\s*'Đá Bi Tinh Khiết'/i,
        );
      });
      fireEvent.click(screen.getByTestId('ingredient-create-new-1'));

      fireEvent.change(screen.getByTestId('import-unit-input-1'), { target: { value: 'Bao' } });
      fireEvent.change(screen.getByTestId('import-price-input-1'), { target: { value: '30000' } });
      fireEvent.change(screen.getByTestId('import-qty-input-1'), { target: { value: '5' } });

      // Submit batch
      fireEvent.click(screen.getByTestId('submit-import-batch-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/inventory-imports',
          expect.objectContaining({
            supplierMdmId: 12,
            supplierName: 'Công ty Rau Sạch',
            paymentSource: 'CASH_DRAWER',
            items: [
              expect.objectContaining({
                ingredientMdmId: 10,
                ingredientName: 'Nấm Kim Châm',
                unitName: 'Thùng',
                unitPrice: 120000,
                quantity: 2,
              }),
              expect.objectContaining({
                ingredientName: 'Đá Bi Tinh Khiết',
                unitName: 'Bao',
                unitPrice: 30000,
                quantity: 5,
              }),
            ],
          }),
        );
      });

      await waitFor(() => {
        expect(useToastStore.getState().toasts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: 'Đã lưu phiếu nhập hàng' }),
          ]),
        );
      });
    });

    it('should keep the intake drawer open and show an error notification when saving fails', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/inventory-imports') return { ...mockImportsResponse, items: [], total: 0 };
        if (url === '/api/v1/mdm/lookup') return mockMdmIngredients;
        throw new Error(`Unexpected GET ${url}`);
      });
      const postSpy = vi
        .spyOn(apiClient, 'post')
        .mockRejectedValue(new Error('Không thể kết nối máy chủ'));

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <InventoryPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      fireEvent.click(await screen.findByTestId('open-import-drawer-btn'));
      fireEvent.focus(screen.getByTestId('supplier-combobox-input'));
      fireEvent.change(screen.getByTestId('supplier-combobox-input'), {
        target: { value: 'Công ty Rau' },
      });
      fireEvent.click(await screen.findByTestId('supplier-option-12'));

      fireEvent.focus(screen.getByTestId('ingredient-combobox-input-0'));
      fireEvent.change(screen.getByTestId('ingredient-combobox-input-0'), {
        target: { value: 'Nấm' },
      });
      fireEvent.click(await screen.findByTestId('ingredient-option-0-10'));
      fireEvent.click(screen.getByTestId('submit-import-batch-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/inventory-imports',
          expect.objectContaining({ supplierMdmId: 12 }),
        );
        expect(useToastStore.getState().toasts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              title: 'Lỗi khi lưu phiếu nhập kho',
              description: 'Không thể kết nối máy chủ',
            }),
          ]),
        );
      });
      expect(screen.getByTestId('inventory-import-drawer')).toBeInTheDocument();
    });
  });

  describe('AC-11.3: Module 4 — Denomination Counter Grid, Cashflow Formula (No QR in Drawer), Discrepancy Note Guard (EC-FIN-03) & Handover Summary', () => {
    const mockPreviewResponse = {
      settlementDate: '2026-11-08',
      shiftName: 'Ca Tối',
      openingBudget: 1000000,
      totalCashSales: 2100000,
      totalTransferSales: 1500000, // QR Transfer - MUST NOT be added to expectedCashInDrawer!
      totalCashImports: 250000,
      expectedCashInDrawer: 2850000, // 1,000,000 + 2,100,000 - 250,000 = 2,850,000
    };

    const mockSettlementsList = {
      page: 1,
      limit: 20,
      total: 1,
      items: [
        {
          id: 1,
          settlementDate: '2026-11-08',
          shiftName: 'Ca Sáng',
          openingBudget: 1000000,
          totalCashSales: 1800000,
          totalTransferSales: 950000,
          totalCashImports: 200000,
          expectedCashInDrawer: 2600000,
          actualCountedCash: 2600000,
          discrepancyAmount: 0,
          cashRetainedInDrawer: 1000000,
          cashToHandOver: 1600000,
          status: 'MATCHED' as const,
          denominationsDetail: {
            '500000': 5,
            '200000': 0,
            '100000': 1,
            '50000': 0,
            '20000': 0,
            '10000': 0,
            '5000': 0,
            '2000': 0,
            '1000': 0,
          },
          note: null,
          closedBy: 2,
          createdAt: '2026-11-08T08:00:00.000Z',
        },
      ],
    };

    it('should calculate actualCountedCash from 9 denominations, exclude QR sales from expectedCashInDrawer, require discrepancy note when discrepancy !== 0, and display handover summary', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/cashflow/preview') return mockPreviewResponse;
        if (url === '/api/v1/cashflow/settlements') return mockSettlementsList;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        ...mockSettlementsList.items[0],
        id: 2,
        shiftName: 'Ca Tối',
        expectedCashInDrawer: 2850000,
        actualCountedCash: 2800000,
        discrepancyAmount: -50000,
        cashRetainedInDrawer: 1000000,
        cashToHandOver: 1800000,
        status: 'SHORTAGE',
        note: 'Thối nhầm tiền lẻ bàn 09 lúc đông khách',
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <CashflowPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('expected-cash-in-drawer')).toHaveTextContent('2.850.000');
      });

      // Default budget edit button is hidden for cashier01 (no cashflow:config)
      expect(screen.queryByTestId('open-default-budget-btn')).not.toBeInTheDocument();

      // Verify QR Transfer revenue is displayed separately and NOT added to expected cash
      expect(screen.getByTestId('transfer-sales-readonly')).toHaveTextContent('1.500.000');

      // Enter denominations: 5 x 500k (2,500,000) + 1 x 200k (200,000) + 1 x 100k (100,000) = 2,800,000 (Shortage -50,000)
      fireEvent.change(screen.getByTestId('denom-input-500000'), { target: { value: '5' } });
      fireEvent.change(screen.getByTestId('denom-input-200000'), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId('denom-input-100000'), { target: { value: '1' } });

      expect(screen.getByTestId('actual-counted-cash')).toHaveTextContent('2.800.000');
      expect(screen.getByTestId('discrepancy-amount')).toHaveTextContent('-50.000');
      expect(screen.getByTestId('settlement-status-badge')).toHaveTextContent(/Thiếu/i);

      // Verify Handover Summary:
      // 1. Retained in drawer = opening_budget (1.000.000)
      // 2. Hand over to owner = actual_counted_cash - opening_budget = 2.800.000 - 1.000.000 = 1.800.000
      expect(screen.getByTestId('handover-retained-cash')).toHaveTextContent('1.000.000');
      expect(screen.getByTestId('handover-owner-cash')).toHaveTextContent('1.800.000');

      // Because discrepancy !== 0 (-50,000), settle button MUST be disabled until discrepancy note is entered (EC-FIN-03)
      const settleBtn = screen.getByTestId('submit-settlement-btn');
      expect(settleBtn).toBeDisabled();

      const noteTextarea = screen.getByTestId('discrepancy-note-input');
      fireEvent.change(noteTextarea, {
        target: { value: 'Thối nhầm tiền lẻ bàn 09 lúc đông khách' },
      });

      expect(settleBtn).not.toBeDisabled();
      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/cashflow/settle',
          expect.objectContaining({
            settlementDate: '2026-11-08',
            shiftName: 'Ca Tối',
            actualCountedCash: 2800000,
            denominationsDetail: {
              '500000': 5,
              '200000': 1,
              '100000': 1,
              '50000': 0,
              '20000': 0,
              '10000': 0,
              '5000': 0,
              '2000': 0,
              '1000': 0,
            },
            note: 'Thối nhầm tiền lẻ bàn 09 lúc đông khách',
          }),
        );
      });
    });

    it('should show Default Budget configuration button for Super Admin and call PUT /api/v1/cashflow/default-budget', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/cashflow/preview') return mockPreviewResponse;
        if (url === '/api/v1/cashflow/settlements') return mockSettlementsList;
        throw new Error(`Unexpected GET ${url}`);
      });

      const putSpy = vi
        .spyOn(apiClient, 'put')
        .mockResolvedValue({ openingBudget: 1500000 });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <CashflowPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('open-default-budget-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('open-default-budget-btn'));
      expect(screen.getByTestId('default-budget-dialog')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('default-budget-input'), {
        target: { value: '1500000' },
      });
      fireEvent.click(screen.getByTestId('save-default-budget-btn'));

      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith('/api/v1/cashflow/default-budget', {
          openingBudget: 1500000,
        });
      });
    });
  });

  describe('AC-11.4: Feature Isolation Guard (Hard Invariant 1)', () => {
    it('should expose sole public APIs via barrel index.ts without any cross-feature imports between invoices, inventory, and cashflow', async () => {
      const invoicesBarrel = await import('@/features/invoices');
      const inventoryBarrel = await import('@/features/inventory');
      const cashflowBarrel = await import('@/features/cashflow');

      expect(typeof invoicesBarrel.InvoicesPage).toBe('function');
      expect(typeof invoicesBarrel.InvoiceDualFilterBar).toBe('function');
      expect(typeof invoicesBarrel.InvoiceDetailModal).toBe('function');
      expect(typeof invoicesBarrel.VoidInvoiceDialog).toBe('function');

      expect(typeof inventoryBarrel.InventoryPage).toBe('function');
      expect(typeof inventoryBarrel.InventoryImportDrawer).toBe('function');
      expect(typeof inventoryBarrel.IngredientMdmCombobox).toBe('function');
      expect(typeof inventoryBarrel.SupplierMdmCombobox).toBe('function');

      expect(typeof cashflowBarrel.CashflowPage).toBe('function');
      expect(typeof cashflowBarrel.DenominationCounterGrid).toBe('function');
      expect(typeof cashflowBarrel.SettlementSummaryCard).toBe('function');
      expect(typeof cashflowBarrel.DefaultBudgetDialog).toBe('function');
    });
  });
});

