import {
  DEFAULT_STORE_SETTINGS,
  type PublicMenuResponse,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PageSkeleton } from '@/components/loading';
import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';

import { QrOrderPage } from '../components/qr-order-page';

vi.mock('@/providers/socket-provider', () => ({
  useSocket: () => ({ socket: null, status: 'disconnected' }),
}));

function makePublicSettings(): PublicStoreSettingsResponse {
  return {
    ...DEFAULT_STORE_SETTINGS,
    updatedAt: '2026-11-24T10:00:00.000Z',
    assets: { logo: null, favicon: null, qrLogo: null },
  };
}

function makeSampleMenuResponse(): PublicMenuResponse {
  return {
    orderMode: 'DINE_IN',
    table: { tableId: 1, tableName: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null },
    stations: [
      { id: 1, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 },
      { id: 2, code: 'PHA_CHE', name: 'Pha Chế', sortOrder: 2 },
    ],
    categories: [
      { id: 10, code: 'MI_CAY', name: 'Mỳ Cay Kim Chi Hàn Quốc', stationCode: 'BEP_NAU', sortOrder: 1 },
      { id: 20, code: 'TRA', name: 'Trà Trái Cây', stationCode: 'PHA_CHE', sortOrder: 2 },
      { id: 30, code: 'EMPTY', name: 'Danh mục trống', stationCode: 'BEP_NAU', sortOrder: 3 },
    ],
    activeOrder: null,
    products: [
      {
        id: 101,
        name: 'Mì Kim Chi Thập Cẩm Đặc Biệt',
        price: 55000,
        station: 'BEP_NAU',
        categoryId: 10,
        categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
        subtitle: 'Thịt bò, tôm, mực, xúc xích, cá viên',
        imageUrl: null,
        isAvailable: true,
        sortOrder: 1,
        modifierGroups: [
          {
            id: 1,
            name: 'Cấp độ cay',
            isRequired: true,
            maxSelect: 1,
            modifiers: [
              { id: 11, name: 'Cấp 1', extraPrice: 0, isAvailable: true },
              { id: 12, name: 'Cấp 3', extraPrice: 0, isAvailable: true },
            ],
          },
        ],
        comboItems: [],
      },
      {
        id: 102,
        name: 'Trà Đào Cam Sả',
        price: 30000,
        station: 'PHA_CHE',
        categoryId: 20,
        categoryName: 'Trà Trái Cây',
        subtitle: 'Size L',
        imageUrl: null,
        isAvailable: true,
        sortOrder: 2,
        modifierGroups: [],
        comboItems: [],
      },
      {
        id: 103,
        name: 'Coca-Cola Lon',
        price: 18000,
        station: 'PHA_CHE',
        categoryId: 20,
        categoryName: 'Trà Trái Cây',
        subtitle: null,
        imageUrl: null,
        isAvailable: true,
        sortOrder: 3,
        modifierGroups: [],
        comboItems: [],
      },
    ],
    updatedAt: '2026-11-24T10:00:00.000Z',
  };
}

function renderQrPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StoreSettingsContext.Provider
        value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
      >
        <MemoryRouter
          initialEntries={['/q/ban01-grid-tok']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/q/:token" element={<QrOrderPage />} />
          </Routes>
        </MemoryRouter>
      </StoreSettingsContext.Provider>
    </QueryClientProvider>,
  );
}

describe('QrOrderPage 2-column product grid layout & cart feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders a 2-column product grid across mobile, tablet, and desktop widths and spans empty state across both columns', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(makeSampleMenuResponse());

    renderQrPage();

    const grid = await screen.findByTestId('qr-product-grid');
    for (const width of [320, 360, 375, 390, 414, 430, 768, 1280]) {
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          writable: true,
          value: width,
        });
        window.dispatchEvent(new Event('resize'));
      });
      expect(grid).toHaveClass('grid', 'grid-cols-2');
      expect(grid).not.toHaveClass('grid-cols-1');
    }

    // Empty state spans both columns
    fireEvent.click(screen.getByTestId('qr-category-tab-30'));
    const emptyMessage = screen.getByText('Không tìm thấy món phù hợp');
    expect(emptyMessage.parentElement).toHaveClass('col-span-2');
  });

  it('shows compact category badges when viewing ALL and hides them when a specific subcategory is selected', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(makeSampleMenuResponse());

    renderQrPage();

    const card101 = await screen.findByTestId('qr-product-card-101');
    const badge101 = screen.getByTestId('qr-product-category-badge-101');
    expect(badge101).toHaveTextContent('Mỳ Cay Kim Chi Hàn Quốc');
    expect(badge101).toHaveClass('truncate');
    expect(within(card101).getByTestId('qr-product-modifier-hint-101')).toHaveTextContent(
      'Tuỳ chọn: Cấp độ cay',
    );
    expect(within(card101).getByText('(Thịt bò, tôm, mực, xúc xích, cá viên)')).toBeInTheDocument();
    expect(within(card101).getByRole('button', { name: 'Chọn' })).toBeInTheDocument();

    // Selecting a specific subcategory hides redundant per-card category badges
    fireEvent.click(screen.getByTestId('qr-category-tab-10'));
    expect(screen.getByTestId('qr-product-card-101')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-product-category-badge-101')).not.toBeInTheDocument();

    // Switching back to ALL restores the badge
    fireEvent.click(screen.getByTestId('qr-category-tab-ALL'));
    expect(screen.getByTestId('qr-product-category-badge-101')).toBeInTheDocument();
  });

  it('displays and aggregates in-cart quantity badges on product cards without double-adding when clicking the Chọn button', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(makeSampleMenuResponse());

    renderQrPage();

    const plainCard = await screen.findByTestId('qr-product-card-102');
    expect(screen.queryByTestId('qr-product-cart-qty-102')).not.toBeInTheDocument();

    // Clicking the Chọn button adds exactly 1 (must not double-fire card onClick)
    fireEvent.click(within(plainCard).getByRole('button', { name: 'Chọn' }));
    expect(screen.getByTestId('qr-product-cart-qty-102')).toHaveTextContent('1');
    expect(plainCard).toHaveClass('border-primary/60');

    // Clicking the card itself increments to 2
    fireEvent.click(plainCard);
    expect(screen.getByTestId('qr-product-cart-qty-102')).toHaveTextContent('2');

    // Adding two different modifier variants of product 101 aggregates total qty (1 + 2 = 3)
    fireEvent.click(screen.getByTestId('qr-product-card-101'));
    fireEvent.click(await screen.findByTestId('modifier-option-11'));
    fireEvent.click(screen.getByTestId('confirm-modifier-btn'));
    expect(screen.getByTestId('qr-product-cart-qty-101')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('qr-product-card-101'));
    fireEvent.click(await screen.findByTestId('modifier-option-12'));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
    fireEvent.click(screen.getByTestId('confirm-modifier-btn'));
    expect(screen.getByTestId('qr-product-cart-qty-101')).toHaveTextContent('3');
  });

  it('renders the QR loading skeleton as a matching 2-column card grid', () => {
    render(<PageSkeleton variant="qr" label="Đang tải thực đơn" />);

    const skeletonGrid = screen.getByTestId('page-skeleton-qr-grid');
    expect(skeletonGrid).toHaveClass('grid', 'grid-cols-2');
    expect(skeletonGrid.children).toHaveLength(6);
  });
});
