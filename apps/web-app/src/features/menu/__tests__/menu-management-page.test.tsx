import { defaultUserPermissions, type Product } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';

import { MenuManagementPage } from '../components/menu-management-page';

const sampleProducts: Product[] = [
  {
    id: 1,
    categoryId: 10,
    categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
    station: 'BEP_NAU',
    name: 'Mì Xúc Xích',
    subtitle: 'Cay nhẹ',
    price: 40000,
    isAvailable: true,
    sortOrder: 1,
    imageUrl: null,
    modifierGroups: [],
    comboItems: [],
  },
  {
    id: 2,
    categoryId: 20,
    categoryName: 'Trà Trái Cây',
    station: 'PHA_CHE',
    name: 'Trà Đào Cam Sả',
    subtitle: null,
    price: 30000,
    isAvailable: true,
    sortOrder: 2,
    imageUrl: null,
    modifierGroups: [],
    comboItems: [],
  },
];

const updateProductMutateAsync = vi.fn(async (arg: { id: number; body?: Record<string, unknown> }) => ({
  id: arg.id,
  ...(arg.body ?? {}),
}));
const deleteProductMutateAsync = vi.fn(async (id: number) => ({
  deleted: true,
  softDisabled: false,
  id,
}));

vi.mock('@/lib/excel-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/excel-export')>();
  return {
    ...actual,
    exportToExcel: vi.fn(),
  };
});

vi.mock('../api/menu-admin.api', () => ({
  useMenuProductsQuery: () => ({
    data: sampleProducts,
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMenuCategoriesQuery: () => ({
    data: [
      { id: 10, category: 'MENU_CATEGORY', name: 'Mỳ Cay Kim Chi Hàn Quốc', normalizedName: 'my cay kim chi han quoc', isActive: true, metadata: { defaultStation: 'BEP_NAU' } },
      { id: 20, category: 'MENU_CATEGORY', name: 'Trà Trái Cây', normalizedName: 'tra trai cay', isActive: true, metadata: { defaultStation: 'PHA_CHE' } },
    ],
  }),
  useMenuStationsQuery: () => ({
    data: [
      { id: 1, category: 'KITCHEN_STATION', name: 'Bếp Nấu', normalizedName: 'bep nau', isActive: true, metadata: { code: 'BEP_NAU' } },
      { id: 2, category: 'KITCHEN_STATION', name: 'Pha Chế', normalizedName: 'pha che', isActive: true, metadata: { code: 'PHA_CHE' } },
    ],
  }),
  useUpdateProductMutation: () => ({ mutateAsync: updateProductMutateAsync, isPending: false }),
  useDeleteProductMutation: () => ({ mutateAsync: deleteProductMutateAsync, isPending: false }),
  useImportMenuExcelMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateProductMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateMenuCategoryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMenuCategoryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMenuCategoryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateMenuStationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMenuStationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMenuStationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderMenuPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MenuManagementPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MenuManagementPage regressions', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-token',
      user: {
        id: 2,
        employeeId: 2,
        username: 'thungan',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: {
          ...defaultUserPermissions,
          menu: {
            view: true,
            create: false,
            update: true,
            delete: false,
            manageStations: false,
            manageCategories: false,
            import: false,
            export: false,
          },
        },
      },
    });
  });

  it('hides Excel import button for users who only have menu.update without menu.import', () => {
    renderMenuPage();
    expect(screen.queryByTestId('import-menu-excel-btn')).not.toBeInTheDocument();

    act(() => {
      useAuthStore.setState((state) => ({
        ...state,
        user: state.user
          ? {
              ...state.user,
              permissions: {
                ...state.user.permissions,
                menu: { ...state.user.permissions.menu, import: true },
              },
            }
          : null,
      }));
    });

    expect(screen.getByTestId('import-menu-excel-btn')).toBeInTheDocument();
  });

  it('matches Vietnamese product names without diacritics in menu keyword filter', () => {
    renderMenuPage();
    const searchInput = screen.getByPlaceholderText('Tìm món ăn, mô tả, danh mục...');
    fireEvent.change(searchInput, { target: { value: 'mi xuc xich' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(screen.getByText('Mì Xúc Xích')).toBeInTheDocument();
    expect(screen.queryByText('Trà Đào Cam Sả')).not.toBeInTheDocument();
  });

  it('filters by station/category, toggles availability, opens station/category/product dialogs, deletes product, and exports Excel', async () => {
    updateProductMutateAsync.mockClear();
    deleteProductMutateAsync.mockClear();

    useAuthStore.setState({
      accessToken: 'tok',
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Chủ quán',
        isSuperAdmin: true,
        permissions: defaultUserPermissions,
      },
    });

    renderMenuPage();

    // Filter by station BEP_NAU -> hides Pha chế
    fireEvent.click(screen.getByTestId('menu-filter-station-BEP_NAU'));
    expect(screen.getByText('Mì Xúc Xích')).toBeInTheDocument();
    expect(screen.queryByText('Trà Đào Cam Sả')).not.toBeInTheDocument();

    // Reset ALL, then filter by category 20 -> shows Trà Đào Cam Sả
    fireEvent.click(screen.getByTestId('menu-filter-station-ALL'));
    fireEvent.click(screen.getByTestId('menu-filter-category-20'));
    expect(screen.getByText('Trà Đào Cam Sả')).toBeInTheDocument();
    expect(screen.queryByText('Mì Xúc Xích')).not.toBeInTheDocument();

    // Reset ALL and toggle product availability
    fireEvent.click(screen.getByTestId('menu-filter-station-ALL'));
    const statusButtons = screen.getAllByTitle('Bấm để Ẩn / Hiện món ăn trên POS & QR');
    await act(async () => {
      fireEvent.click(statusButtons[0]!);
    });
    expect(updateProductMutateAsync).toHaveBeenCalledWith({ id: 1, body: { isAvailable: false } });

    // Open station manager, category manager, create & edit product drawers
    fireEvent.click(screen.getByTestId('open-station-manager-btn'));
    fireEvent.click(screen.getByTestId('open-category-manager-btn'));
    fireEvent.click(screen.getByTestId('create-product-btn'));
    fireEvent.click(screen.getByTestId('edit-product-btn-1'));

    // Export Excel
    fireEvent.click(screen.getByTestId('export-menu-excel-btn'));

    // Delete product confirm flow
    fireEvent.click(screen.getByTestId('delete-product-btn-1'));
    expect(screen.getByTestId('delete-product-dialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-delete-product-btn'));
    });
    expect(deleteProductMutateAsync).toHaveBeenCalledWith(1);
  });
});
