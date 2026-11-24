import { UserPermissionsSchema, type Product } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TouchStockStatusPage } from '@/features/menu';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const MOCK_PRODUCTS: Product[] = [
  {
    id: 101,
    name: 'Mì Cay Hải Sản',
    subtitle: null,
    price: 55000,
    station: 'BEP_NAU',
    categoryId: 1,
    categoryName: 'Mì Cay',
    imageUrl: null,
    isAvailable: true,
    sortOrder: 1,
    comboItems: [],
    modifierGroups: [],
  },
  {
    id: 102,
    name: 'Khoai Tây Chiên',
    subtitle: null,
    price: 30000,
    station: 'BEP_CHIEN',
    categoryId: 2,
    categoryName: 'Ăn vặt',
    imageUrl: null,
    isAvailable: false,
    sortOrder: 2,
    comboItems: [],
    modifierGroups: [],
  },
  {
    id: 103,
    name: 'Combo Cặp Đôi',
    subtitle: null,
    price: 129000,
    station: 'COMBO',
    categoryId: 3,
    categoryName: 'Combo',
    imageUrl: null,
    isAvailable: true,
    sortOrder: 3,
    comboItems: [{ productId: 101, quantity: 2 }],
    modifierGroups: [],
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <TouchStockStatusPage />
    </QueryProvider>,
  );
}

describe('TouchStockStatusPage — Báo hết món nhanh 1 chạm', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: {
        id: 2,
        employeeId: 12,
        username: 'thungan',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true },
          menu: { view: true, update: true },
        }),
      },
    });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/menu/products') return MOCK_PRODUCTS;
      if (url.startsWith('/api/v1/mdm/lookup')) return [];
      return [];
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('filters by station, unavailable toggle, and diacritic-insensitive search', async () => {
    renderPage();
    expect(await screen.findByTestId('touch-stock-card-101')).toBeInTheDocument();
    expect(screen.getByTestId('touch-stock-card-102')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('touch-stock-only-unavailable'));
    expect(screen.queryByTestId('touch-stock-card-101')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-stock-card-102')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('touch-stock-only-unavailable'));
    fireEvent.click(screen.getByTestId('touch-stock-station-COMBO'));
    expect(screen.getByTestId('touch-stock-card-103')).toBeInTheDocument();
    expect(screen.queryByTestId('touch-stock-card-101')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('touch-stock-station-ALL'));
    fireEvent.change(screen.getByTestId('touch-stock-search-input'), {
      target: { value: 'hai san' },
    });
    expect(screen.getByTestId('touch-stock-card-101')).toBeInTheDocument();
    expect(screen.queryByTestId('touch-stock-card-102')).not.toBeInTheDocument();
  });

  it('toggles availability via PUT /api/v1/menu/products/:id and preserves comboItems for COMBO', async () => {
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(MOCK_PRODUCTS[0]);
    renderPage();

    fireEvent.click(await screen.findByTestId('touch-stock-card-101'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/menu/products/101', { isAvailable: false });
    });

    fireEvent.click(screen.getByTestId('touch-stock-card-103'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/menu/products/103', {
        isAvailable: false,
        station: 'COMBO',
        comboItems: [{ productId: 101, quantity: 2 }],
      });
    });
  });

  it('disables toggling and shows read-only notice when user lacks menu.update', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: {
        id: 3,
        employeeId: 13,
        username: 'viewer',
        fullName: 'Xem thực đơn',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true },
          menu: { view: true, update: false },
        }),
      },
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(MOCK_PRODUCTS[0]);
    renderPage();

    const card = await screen.findByTestId('touch-stock-card-101');
    expect(screen.getByTestId('touch-stock-readonly-notice')).toBeInTheDocument();
    expect(card).toBeDisabled();
    fireEvent.click(card);
    expect(putSpy).not.toHaveBeenCalled();
  });
});
