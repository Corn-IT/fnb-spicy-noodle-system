import { type MdmItem } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { type KitchenStationOption } from '@/lib/menu-sync';

import { CategoryManageDialog } from '../components/category-manage-dialog';
import { StationManageDialog } from '../components/station-manage-dialog';

const sampleCategories: MdmItem[] = [
  {
    id: 10,
    category: 'MENU_CATEGORY',
    name: 'Mì Cay Kim Chi',
    normalizedName: 'mi cay kim chi',
    isActive: true,
    metadata: { defaultStation: 'BEP_NAU', isHidden: false },
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 20,
    category: 'MENU_CATEGORY',
    name: 'Trà Sữa',
    normalizedName: 'tra sua',
    isActive: true,
    metadata: { defaultStation: 'PHA_CHE', isHidden: true },
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const sampleStations: KitchenStationOption[] = [
  {
    id: 1,
    code: 'BEP_NAU',
    name: 'Bếp Nấu',
    desc: 'Khu vực nấu mì cay',
    sortOrder: 1,
    isSystem: true,
    isHidden: false,
  },
  {
    id: 3,
    code: 'PHA_CHE',
    name: 'Pha Chế',
    desc: 'Quầy đồ uống',
    sortOrder: 3,
    isSystem: true,
    isHidden: false,
  },
  {
    id: 5,
    code: 'BEP_LAU',
    name: 'Bếp Lẩu',
    desc: 'Trạm in nhiệt (BEP_LAU)',
    sortOrder: 5,
    isSystem: false,
    isHidden: false,
  },
];

function wrapQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Menu CategoryManageDialog, StationManageDialog & menu-admin.api (Wave 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('supports CategoryManageDialog create, edit, station filter, search, toggle hide, delete conflict error, and readonly view', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 30, name: 'Đồ Uống Nóng' });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ id: 10 });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockRejectedValueOnce(new Error('Category has products')).mockResolvedValueOnce({ id: 20 });

    const { rerender } = wrapQuery(
      <CategoryManageDialog
        open
        onOpenChange={vi.fn()}
        categories={sampleCategories}
        stations={sampleStations}
        canWriteMdm
      />,
    );

    expect(screen.getByTestId('category-manage-dialog')).toBeInTheDocument();

    // Filter by PHA_CHE
    fireEvent.change(screen.getByTestId('category-filter-station-select'), { target: { value: 'PHA_CHE' } });
    expect(screen.queryByText('Mì Cay Kim Chi')).not.toBeInTheDocument();
    expect(screen.getByText('Trà Sữa')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('category-filter-station-select'), { target: { value: 'ALL' } });

    // Search diacritic-insensitive
    const searchInput = screen.getByTestId('category-search-input');
    fireEvent.change(searchInput, { target: { value: 'mi cay' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByText('Mì Cay Kim Chi')).toBeInTheDocument();
    expect(screen.queryByText('Trà Sữa')).not.toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    // Create category with empty validation check first, then valid save
    fireEvent.click(screen.getByTestId('save-menu-category-btn'));
    expect(postSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('menu-category-name-input'), { target: { value: 'Lẩu Hải Sản' } });
    fireEvent.change(screen.getByTestId('menu-category-station-select'), { target: { value: 'BEP_LAU' } });
    fireEvent.click(screen.getByTestId('save-menu-category-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/menu/categories', {
        category: 'MENU_CATEGORY',
        name: 'Lẩu Hải Sản',
        metadata: { defaultStation: 'BEP_LAU', isHidden: false },
      });
    });

    // Toggle hide category 10 -> PUT /api/v1/menu/categories/10
    fireEvent.click(screen.getByTestId('toggle-hide-category-btn-10'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/menu/categories/10',
        expect.objectContaining({ metadata: expect.objectContaining({ isHidden: true }) }),
      );
    });

    // Delete error then delete success
    fireEvent.click(screen.getByTestId('delete-category-btn-10'));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/menu/categories/10');
      expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true);
    });

    fireEvent.click(screen.getByTestId('delete-category-btn-20'));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/menu/categories/20');
    });

    // Read-only mode hides write buttons & input form
    const client = new QueryClient();
    rerender(
      <QueryClientProvider client={client}>
        <CategoryManageDialog
          open
          onOpenChange={vi.fn()}
          categories={sampleCategories}
          stations={sampleStations}
          canWriteMdm={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('save-menu-category-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-category-btn-10')).not.toBeInTheDocument();
  });

  it('supports StationManageDialog slug generation BEP_*, system station delete protection, edit & delete custom station', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 6, name: 'Bếp Nướng' });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ id: 5, name: 'Bếp Lẩu Mới' });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ id: 5 });

    wrapQuery(
      <StationManageDialog
        open
        onOpenChange={vi.fn()}
        stations={sampleStations}
        canWriteMdm
      />,
    );

    expect(screen.getByTestId('station-manage-dialog')).toBeInTheDocument();

    // Create custom station `"Bếp Nướng"` -> generates code `BEP_NUONG`
    fireEvent.change(screen.getByTestId('menu-station-name-input'), { target: { value: 'Bếp Nướng' } });
    fireEvent.change(screen.getByTestId('menu-station-desc-input'), { target: { value: 'Đồ nướng xiên que' } });
    fireEvent.click(screen.getByTestId('save-menu-station-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/menu/stations', {
        category: 'KITCHEN_STATION',
        name: 'Bếp Nướng',
        metadata: expect.objectContaining({
          code: 'BEP_NUONG',
          stationCode: 'BEP_NUONG',
          isSystem: false,
          isHidden: false,
        }),
      });
    });

    // Deleting system station BEP_NAU warns and does NOT call DELETE API
    fireEvent.click(screen.getByTestId('delete-station-btn-BEP_NAU'));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.some((t) => t.variant === 'warning')).toBe(true);

    // Edit custom station BEP_LAU
    fireEvent.click(screen.getByTestId('edit-station-btn-BEP_LAU'));
    fireEvent.change(screen.getByTestId('menu-station-name-input'), { target: { value: 'Bếp Lẩu Mới' } });
    fireEvent.click(screen.getByTestId('save-menu-station-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/menu/stations/5',
        expect.objectContaining({ name: 'Bếp Lẩu Mới' }),
      );
    });

    // Toggle hide & delete custom station
    fireEvent.click(screen.getByTestId('toggle-hide-station-btn-BEP_LAU'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/menu/stations/5',
        expect.objectContaining({ metadata: expect.objectContaining({ isHidden: true }) }),
      );
    });

    fireEvent.click(screen.getByTestId('delete-station-btn-BEP_LAU'));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/menu/stations/5');
    });
  });
});
