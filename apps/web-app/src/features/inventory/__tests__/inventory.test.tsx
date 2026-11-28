import { QueryClient } from '@tanstack/react-query';
import {
  MdmCategory,
  type InventoryImportListResponse,
  type InventoryImportRecord,
  PaymentSource,
  UserPermissionsSchema,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { InventoryPage } from '@/features/inventory';
import { getBusinessDateIso } from '@/features/inventory/api/inventory.api';
import * as excelExport from '@/lib/excel-export';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const managerUser = {
  id: 1,
  employeeId: 1,
  username: 'manager',
  fullName: 'Quản Lý Kho',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    inventory: { view: true, create: true, update: true, delete: true, export: true },
  }),
};

const cashierUser = {
  id: 2,
  employeeId: 12,
  username: 'cashier01',
  fullName: 'Thu Ngân',
  isSuperAdmin: false,
  permissions: UserPermissionsSchema.parse({
    inventory: { view: true, create: true, update: false, delete: true, export: true },
  }),
};

function renderInventory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter future={routerFutureFlags}>
        <InventoryPage />
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('Wave 5 — InventoryPage, InventoryImportDrawer, EditInventoryImportDialog & MDM Comboboxes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({ accessToken: 'token', user: managerUser });
  });

  it('exercises InventoryImportDrawer add/remove lines, MDM combobox selection & new supplier, validation, and EditInventoryImportDialog', async () => {
    const todayIso = getBusinessDateIso();
    const record1: InventoryImportRecord = {
      id: 101,
      ingredientMdmId: 11,
      supplierMdmId: 21,
      supplierNameSnapshot: 'Công Ty Rau Sạch',
      itemNameSnapshot: 'Cải Thảo',
      unitName: 'Kg',
      unitPrice: 25000,
      quantity: 4,
      totalCost: 100000,
      paymentSource: PaymentSource.CASH_DRAWER,
      importDate: todayIso,
      note: 'Đầu ca sáng',
      createdBy: 1,
      isDeleted: false,
      createdAt: `${todayIso}T03:00:00.000Z`,
    };

    const listResp: InventoryImportListResponse = {
      page: 1,
      limit: 20,
      total: 1,
      items: [record1],
      summary: { totalImportCost: 100000, totalCashDrawerCost: 100000, totalExternalCost: 0 },
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, opts?: { params?: Record<string, unknown> }) => {
      if (url === '/api/v1/inventory-imports') return listResp;
      if (url === '/api/v1/mdm/lookup') {
        if (opts?.params?.category === MdmCategory.SUPPLIER) {
          return [
            {
              id: 21,
              category: MdmCategory.SUPPLIER,
              name: 'Công Ty Rau Sạch',
              normalizedName: 'cong ty rau sach',
              metadata: {},
              isActive: true,
              createdAt: '2026-11-01T00:00:00.000Z',
            },
          ];
        }
        return [
          {
            id: 11,
            category: MdmCategory.INGREDIENT,
            name: 'Ba Chỉ Bò Mỹ',
            normalizedName: 'ba chi bo my',
            metadata: { default_unit: 'Kg', last_price: 185000 },
            isActive: true,
            createdAt: '2026-11-01T00:00:00.000Z',
          },
        ];
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ items: [record1], totalCost: 100000 });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ ...record1, totalCost: 120000 });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ ...record1, isDeleted: true });
    const exportSpy = vi.spyOn(excelExport, 'exportToExcel').mockImplementation(() => {});

    renderInventory();
    await waitFor(() => expect(screen.getByText('Cải Thảo')).toBeInTheDocument());
    expect(screen.getByTestId('inventory-footer-total')).toHaveTextContent('100.000 đ');

    // EditInventoryImportDialog flow
    fireEvent.click(screen.getByTestId('edit-import-btn-101'));
    await waitFor(() => expect(screen.getByTestId('edit-import-dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Quỹ ngoài' }));
    fireEvent.change(screen.getByTestId('edit-import-unit-input'), { target: { value: 'Thùng' } });
    fireEvent.change(screen.getByTestId('edit-import-price-input'), { target: { value: '60000' } });
    fireEvent.change(screen.getByTestId('edit-import-qty-input'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('edit-import-note-input'), { target: { value: 'Đã đổi sang quỹ ngoài' } });
    fireEvent.click(screen.getByTestId('confirm-edit-import-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/inventory-imports/101',
        expect.objectContaining({
          unitName: 'Thùng',
          unitPrice: 60000,
          quantity: 2,
          paymentSource: PaymentSource.EXTERNAL,
        }),
      );
    });

    // Open InventoryImportDrawer, add & remove line, select MDM supplier & ingredient
    fireEvent.click(screen.getByTestId('open-import-drawer-btn'));
    await waitFor(() => expect(screen.getByTestId('inventory-import-drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-import-row-btn'));
    expect(screen.getByTestId('import-line-row-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('remove-import-row-btn-1'));
    expect(screen.queryByTestId('import-line-row-1')).not.toBeInTheDocument();

    const supInput = screen.getByTestId('supplier-combobox-input');
    fireEvent.focus(supInput);
    await waitFor(() => expect(screen.getByTestId('supplier-option-21')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('supplier-option-21'));

    const ingInput = screen.getByTestId('ingredient-combobox-input-0');
    fireEvent.focus(ingInput);
    await waitFor(() => expect(screen.getByTestId('ingredient-option-0-11')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('ingredient-option-0-11'));

    fireEvent.change(screen.getByTestId('import-price-input-0'), { target: { value: '185000' } });
    fireEvent.change(screen.getByTestId('import-qty-input-0'), { target: { value: '2' } });
    expect(screen.getByTestId('import-drawer-batch-total')).toHaveTextContent('370.000 đ');

    fireEvent.click(screen.getByTestId('payment-source-EXTERNAL'));
    fireEvent.click(screen.getByTestId('submit-import-batch-btn'));
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/inventory-imports',
        expect.objectContaining({ paymentSource: PaymentSource.EXTERNAL, supplierMdmId: 21 }),
      );
    });

    // Excel export & soft delete
    fireEvent.click(screen.getByTestId('export-inventory-excel-btn'));
    await waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('delete-import-btn-101'));
    await waitFor(() => expect(screen.getByTestId('delete-import-confirm-dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-delete-import-btn'));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/v1/inventory-imports/101'));
  });

  it('enforces createdAt-based same-day delete restriction for cashiers and supports error retry', async () => {
    useAuthStore.getState().setAuth({ accessToken: 'token', user: cashierUser });
    const todayIso = getBusinessDateIso();
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('Inventory API error'));
    renderInventory();
    await waitFor(() => expect(screen.getByTestId('system-error-view')).toBeInTheDocument());

    getSpy.mockResolvedValue({
      page: 1,
      limit: 20,
      total: 2,
      items: [
        {
          id: 201,
          ingredientMdmId: 11,
          supplierMdmId: 21,
          supplierNameSnapshot: 'NCC',
          itemNameSnapshot: 'Tạo hôm nay (lùi ngày nhập)',
          unitName: 'Kg',
          unitPrice: 50000,
          quantity: 1,
          totalCost: 50000,
          paymentSource: PaymentSource.CASH_DRAWER,
          importDate: yesterdayDate.slice(0, 10),
          note: null,
          createdBy: 2,
          isDeleted: false,
          createdAt: new Date().toISOString(), // Created TODAY -> cashier CAN delete despite backdated importDate
        },
        {
          id: 202,
          ingredientMdmId: 11,
          supplierMdmId: 21,
          supplierNameSnapshot: 'NCC',
          itemNameSnapshot: 'Tạo hôm qua (gán ngày hôm nay)',
          unitName: 'Kg',
          unitPrice: 50000,
          quantity: 1,
          totalCost: 50000,
          paymentSource: PaymentSource.CASH_DRAWER,
          importDate: todayIso,
          note: null,
          createdBy: 2,
          isDeleted: false,
          createdAt: yesterdayDate, // Created YESTERDAY -> cashier DISABLED from deleting
        },
      ],
      summary: { totalImportCost: 100000, totalCashDrawerCost: 100000, totalExternalCost: 0 },
    });

    fireEvent.click(screen.getByTestId('error-retry-btn'));
    await waitFor(() => expect(screen.getByTestId('delete-import-btn-201')).toBeInTheDocument());

    expect(screen.getByTestId('delete-import-btn-201')).not.toBeDisabled();
    expect(screen.getByTestId('delete-import-btn-202')).toBeDisabled();
    expect(screen.queryByTestId('edit-import-btn-201')).not.toBeInTheDocument();
  });
});
