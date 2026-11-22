import { QueryClient } from '@tanstack/react-query';
import { type OrderDetailResponse, UserPermissionsSchema } from '@fnb/shared';
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
  permissions: UserPermissionsSchema.parse({
    pos: {
      view: true,
      create: true,
      update: true,
      splitKitchen: true,
      tableAction: true,
      checkout: true,
    },
    invoices: { view: true, reprint: true },
    inventory: { view: true, create: true, delete: true },
    cashflow: { view: true, create: true },
  }),
};

const superAdminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    pos: {
      view: true,
      create: true,
      update: true,
      delete: true,
      splitKitchen: true,
      tableAction: true,
      checkout: true,
      qrSecurity: true,
    },
    menu: { view: true, create: true, update: true, delete: true, export: true },
    invoices: { view: true, reprint: true, update: true, approve: true, export: true },
    inventory: { view: true, create: true, update: true, delete: true, export: true },
    cashflow: { view: true, create: true, compensate: true, config: true, export: true },
    employees: { view: true, create: true, update: true, delete: true, export: true },
    schedules: { view: true, create: true, update: true, delete: true, export: true },
    mdm: { view: true, create: true, update: true, delete: true },
    rbac: { view: true, create: true, update: true, resetPassword: true },
  }),
};

describe('Story 11 — Invoices (Module 2), Inventory Imports (Module 3) & Cashflow Settlement (Module 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  describe('AC-11.1: Module 2 — Invoices Split Columns, Dual Filter Bar, Detail Modal Reprint & Payment Method Edit/Approval', () => {
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
          cashAmount: 185000,
          transferAmount: 0,
          totalAmount: 185000,
          pendingPaymentEdit: null,
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
          cashAmount: 100000,
          transferAmount: 200000,
          totalAmount: 300000,
          pendingPaymentEdit: null,
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

    it('should default Dual Filter to Today, combine right-side search criteria + keyword with AND, render split Tổng tiền & Phương thức columns, and hide Void/Delete/Edit/Approve actions from cashier01', async () => {
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

      // Verify split Tổng tiền & Phương thức columns and zero Void/Delete UI
      expect(screen.getByText('Tổng tiền')).toBeInTheDocument();
      expect(screen.getByText('Phương thức')).toBeInTheDocument();
      expect(screen.getByText('Bàn 05')).toBeInTheDocument();
      expect(screen.getByText('Mang về #02')).toBeInTheDocument();
      expect(screen.getByTestId('payment-badge-501')).toHaveTextContent(/Tiền mặt/);
      expect(screen.getByTestId('payment-badge-502')).toHaveTextContent(/Kết hợp/);

      // Default query sends status='PAID' and today's fromDate & toDate; status dropdown is hidden
      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/invoices',
        expect.objectContaining({
          params: expect.objectContaining({
            status: 'PAID',
            fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          }),
        }),
      );

      expect(screen.queryByTestId('invoice-status-filter')).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Đã huỷ/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('invoice-payment-filter')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('invoice-payment-filter'), {
        target: { value: 'TRANSFER' },
      });

      await waitFor(() => {
        expect(getSpy).toHaveBeenCalledWith(
          '/api/v1/invoices',
          expect.objectContaining({
            params: expect.objectContaining({ status: 'PAID', paymentMethod: 'TRANSFER' }),
          }),
        );
      });

      // Edit/Approve/Void buttons are absent for cashier01 without update/approve permissions
      expect(screen.queryByTestId('void-invoice-btn-501')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-payment-btn-501')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-payment-btn-502')).not.toBeInTheDocument();

      // Switch search criteria on right side to 'table' (Số bàn) and type keyword 'Bàn 05'
      // Verify typing does not query before Enter/Blur, then commit via Enter.
      fireEvent.change(screen.getByTestId('invoice-search-field-select'), {
        target: { value: 'table' },
      });
      const keywordInput = screen.getByTestId('invoice-keyword-input');
      fireEvent.change(keywordInput, {
        target: { value: 'Bàn 05' },
      });
      expect(getSpy).not.toHaveBeenCalledWith(
        '/api/v1/invoices',
        expect.objectContaining({
          params: expect.objectContaining({
            keyword: 'Bàn 05',
          }),
        }),
      );
      fireEvent.keyDown(keywordInput, { key: 'Enter', code: 'Enter' });

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

    it('should allow an employee with invoices:update to request a PTTT edit and allow an approver with invoices:approve to approve it, plus open detail modal and reprint receipt', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'staff-edit-token',
        user: {
          ...cashierUser,
          permissions: {
            ...cashierUser.permissions,
            invoices: { ...cashierUser.permissions.invoices, view: true, reprint: true, update: true },
          },
        },
      });

      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      const listWithPending = {
        ...mockInvoiceListResponse,
        items: [
          {
            ...mockInvoiceListResponse.items[0],
            pendingPaymentEdit: {
              paymentMethod: 'TRANSFER' as const,
              cashAmount: 0,
              transferAmount: 185000,
              reason: 'Thu ngân bấm nhầm tiền mặt thay vì chuyển khoản QR',
              requestedById: 2,
              requestedByName: 'Nguyễn Thu Ngân',
              requestedByUsername: 'cashier01',
              requestedAt: '2026-11-08T03:00:00.000Z',
            },
          },
          mockInvoiceListResponse.items[1],
        ],
      };

      let listCallCount = 0;
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices') {
          listCallCount += 1;
          return listCallCount <= 1 ? mockInvoiceListResponse : listWithPending;
        }
        if (url === '/api/v1/invoices/501') return mockOrderDetail501;
        throw new Error(`Unexpected GET ${url}`);
      });

      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
        orderId: 501,
        orderCode: 'HD-20261108-0001',
        status: 'PENDING_APPROVAL',
        pendingPaymentEdit: listWithPending.items[0].pendingPaymentEdit,
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices/501/reprint') {
          return mockOrderDetail501;
        }
        if (url === '/api/v1/invoices/501/payment-method/review') {
          return {
            orderId: 501,
            orderCode: 'HD-20261108-0001',
            status: 'APPROVED',
            paymentMethod: 'TRANSFER',
            cashAmount: 0,
            transferAmount: 185000,
            syncedSettlementIds: [1],
          };
        }
        throw new Error(`Unexpected POST ${url}`);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const view = render(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <MemoryRouter future={routerFutureFlags}>
              <InvoicesPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-payment-btn-501')).toBeInTheDocument();
      });

      // Open Detail Modal via Eye button and reprint
      fireEvent.click(screen.getByTestId('view-invoice-btn-501'));
      await waitFor(() => {
        expect(screen.getByTestId('invoice-detail-modal')).toBeInTheDocument();
        expect(screen.getByText(/Mì Kim Chi Bò Mỹ/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Lượt 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Lượt 2/i)).toBeInTheDocument();
      expect(screen.getByText(/Khách đổi chỗ mát hơn/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('reprint-invoice-btn'));
      await waitFor(() => {
        expect(printSpy).toHaveBeenCalled();
      });
      expect(screen.getByTestId('reprint-feedback')).toHaveTextContent('Đã gửi lệnh in lại hoá đơn');

      fireEvent.click(screen.getByTestId('close-invoice-detail-btn'));

      // Employee opens Edit PTTT dialog on 501, switches to TRANSFER, enters reason & submits
      fireEvent.click(screen.getByTestId('edit-payment-btn-501'));
      expect(screen.getByTestId('edit-payment-method-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('edit-pm-option-TRANSFER'));
      fireEvent.change(screen.getByTestId('edit-pm-reason-input'), {
        target: { value: 'Thu ngân bấm nhầm tiền mặt thay vì chuyển khoản QR' },
      });
      fireEvent.click(screen.getByTestId('submit-edit-pm-btn'));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith(
          '/api/v1/invoices/501/payment-method',
          expect.objectContaining({
            paymentMethod: 'TRANSFER',
            reason: 'Thu ngân bấm nhầm tiền mặt thay vì chuyển khoản QR',
          }),
        );
      });

      // Switch to approver (Super Admin) to approve pending request
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });
      view.rerender(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <MemoryRouter future={routerFutureFlags}>
              <InvoicesPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('review-payment-btn-501')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('review-payment-btn-501'));
      expect(screen.getByTestId('review-payment-edit-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('approve-pm-edit-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/invoices/501/payment-method/review',
          expect.objectContaining({
            decision: 'APPROVE',
          }),
        );
      });
    });

    it('should hide reprint from a user who can view invoices but lacks reprint permission', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'view-only-token',
        user: {
          ...cashierUser,
          permissions: {
            ...cashierUser.permissions,
            invoices: { ...cashierUser.permissions.invoices, view: true, reprint: false },
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
      expect(screen.queryByTestId('edit-payment-btn-501')).not.toBeInTheDocument();
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

    it('should allow Super Admin to void a paid invoice with a reason >= 10 characters', async () => {
      useAuthStore.getState().setAuth({ accessToken: 'super-token', user: superAdminUser });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/invoices') return mockInvoiceListResponse;
        throw new Error(`Unexpected GET ${url}`);
      });
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        orderId: 501,
        orderCode: 'HD-20261108-0001',
        status: 'VOIDED',
        voidReason: 'Khách báo huỷ đơn nhập nhầm bàn',
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

      await waitFor(() => expect(screen.getByTestId('void-invoice-btn-501')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('void-invoice-btn-501'));

      expect(await screen.findByTestId('void-invoice-dialog')).toBeInTheDocument();
      const submitBtn = screen.getByTestId('confirm-void-invoice-btn');
      expect(submitBtn).toBeDisabled();

      fireEvent.change(screen.getByTestId('void-invoice-reason-input'), {
        target: { value: 'Quá ngắn' },
      });
      expect(submitBtn).toBeDisabled();

      fireEvent.change(screen.getByTestId('void-invoice-reason-input'), {
        target: { value: 'Khách báo huỷ đơn nhập nhầm bàn' },
      });
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/invoices/501/void', {
          voidReason: 'Khách báo huỷ đơn nhập nhầm bàn',
        });
      });
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
      expect(priceInput0.value).toBe('');
      expect(qtyInput0.value).toBe('');

      fireEvent.change(priceInput0, { target: { value: '120000' } });
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

      // Add 3rd row and leave it completely empty -> should be ignored on submit
      fireEvent.click(screen.getByTestId('add-import-row-btn'));

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
      fireEvent.change(screen.getByTestId('import-price-input-0'), {
        target: { value: '45000' },
      });
      fireEvent.change(screen.getByTestId('import-qty-input-0'), {
        target: { value: '2' },
      });
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
            shiftName: 'CA_NGAY',
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

    it('should allow compensating non-zero discrepancy settlements and hide raw technical keys in Cashflow UI', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          ...cashierUser,
          permissions: {
            ...cashierUser.permissions,
            cashflow: { ...cashierUser.permissions.cashflow, compensate: true },
          },
        },
      });

      const settlementsWithShortage = {
        page: 1,
        limit: 20,
        total: 2,
        items: [
          mockSettlementsList.items[0],
          {
            ...mockSettlementsList.items[0],
            id: 2,
            shiftName: 'Ca Tối',
            actualCountedCash: 2550000,
            discrepancyAmount: -50000,
            cashToHandOver: 1550000,
            status: 'SHORTAGE' as const,
            closedByName: 'Nguyễn Thu Ngân',
            closedByUsername: 'cashier01',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/cashflow/preview') return mockPreviewResponse;
        if (url === '/api/v1/cashflow/settlements') return settlementsWithShortage;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        ...settlementsWithShortage.items[1],
        actualCountedCash: 2600000,
        discrepancyAmount: 0,
        cashToHandOver: 1600000,
        status: 'MATCHED',
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
        expect(screen.getByTestId('compensate-settlement-btn-2')).toBeInTheDocument();
      });

      // Matched record (id=1, discrepancy=0) must NOT show Bù chênh lệch button
      expect(screen.queryByTestId('compensate-settlement-btn-1')).not.toBeInTheDocument();

      // Raw backend keys must not be shown
      expect(screen.queryByText(/\(opening_budget\)|\(CASH_DRAWER\)|\(expected_cash\)|\(MATCHED\)|\(SHORTAGE\)/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('compensate-settlement-btn-2'));
      expect(screen.getByTestId('compensate-settlement-dialog')).toBeInTheDocument();

      const amountInput = screen.getByTestId('compensate-amount-input') as HTMLInputElement;
      expect(amountInput.value).toBe('50.000');

      fireEvent.change(amountInput, {
        target: { value: '30000' },
      });
      fireEvent.change(screen.getByTestId('compensate-note-input'), {
        target: { value: 'Thu ngân đã nộp bù 30.000đ tiền mặt vào két' },
      });
      fireEvent.click(screen.getByTestId('confirm-compensate-settlement-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/cashflow/settlements/2/compensate', {
          compensationAmount: 30000,
          note: 'Thu ngân đã nộp bù 30.000đ tiền mặt vào két',
        });
      });
    });

    it('should enforce Blind Settlement mode for non-SuperAdmin by hiding theoretical numbers and prompting for note when discrepancy occurs', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/cashflow/preview') {
          return {
            settlementDate: '2026-11-17',
            shiftName: 'CA_NGAY',
            blindMode: true,
            openingBudget: 1000000,
            totalCashSales: null,
            totalTransferSales: null,
            totalCashImports: null,
            expectedCashInDrawer: null,
          };
        }
        if (url === '/api/v1/cashflow/settlements') return mockSettlementsList;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi
        .spyOn(apiClient, 'post')
        .mockRejectedValueOnce({
          code: 'CASHFLOW_DISCREPANCY_NOTE_REQUIRED',
          message: 'Vui lòng nhập ghi chú giải trình khi tiền thực đếm chênh lệch với tiền lý thuyết',
        })
        .mockResolvedValueOnce(mockSettlementsList.items[0]);

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
        expect(screen.getByTestId('blind-settlement-banner')).toBeInTheDocument();
      });

      // Theoretical figures must be hidden in blind mode
      expect(screen.queryByTestId('expected-cash-in-drawer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cash-sales-amount')).not.toBeInTheDocument();
      expect(screen.queryByTestId('discrepancy-amount')).not.toBeInTheDocument();

      // First submit without note -> backend returns 422 CASHFLOW_DISCREPANCY_NOTE_REQUIRED
      fireEvent.click(screen.getByTestId('submit-settlement-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('blind-discrepancy-prompt')).toBeInTheDocument();
      });
      expect(screen.getByTestId('submit-settlement-btn')).toBeDisabled();

      // Enter explanation note -> button unlocks and submits
      fireEvent.change(screen.getByTestId('discrepancy-note-input'), {
        target: { value: 'Đếm thiếu tờ 50k trong ngăn kéo' },
      });
      expect(screen.getByTestId('submit-settlement-btn')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('submit-settlement-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(2);
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

