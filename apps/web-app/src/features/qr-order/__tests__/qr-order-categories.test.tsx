import {
  DEFAULT_STORE_SETTINGS,
  SocketEvents,
  type PublicMenuResponse,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import * as socketClient from '@/lib/socket-client';

import { QrOrderPage } from '../components/qr-order-page';

vi.mock('@/providers/socket-provider', () => ({
  useSocket: () => ({ socket: null, status: 'disconnected' }),
}));

function makePublicSettings(): PublicStoreSettingsResponse {
  return {
    ...DEFAULT_STORE_SETTINGS,
    updatedAt: '2026-11-23T03:00:00.000Z',
    assets: { logo: null, favicon: null, qrLogo: null },
  };
}

const SAMPLE_25_CATEGORIES: NonNullable<PublicMenuResponse['categories']> = [
  { id: 1, code: 'C1', name: 'Mỳ Cay Kim Chi Hàn Quốc', stationCode: 'BEP_NAU', sortOrder: 1 },
  { id: 2, code: 'C2', name: 'Topping Mì Cay', stationCode: 'BEP_NAU', sortOrder: 2 },
  { id: 3, code: 'C3', name: 'Bánh Mì Chảo', stationCode: 'BEP_NAU', sortOrder: 3 },
  { id: 4, code: 'C4', name: 'Topoki Phô Mai', stationCode: 'BEP_NAU', sortOrder: 4 },
  { id: 5, code: 'C5', name: 'Lẩu Hàn Quốc', stationCode: 'BEP_NAU', sortOrder: 5 },
  { id: 6, code: 'C6', name: 'Đồ Gọi Thêm Lẩu', stationCode: 'BEP_NAU', sortOrder: 6 },
  { id: 7, code: 'C7', name: 'Gà Rán - Gà Tươi', stationCode: 'BEP_CHIEN', sortOrder: 7 },
  { id: 8, code: 'C8', name: 'Combo Gà Rán', stationCode: 'BEP_CHIEN', sortOrder: 8 },
  { id: 9, code: 'C9', name: 'Đồ Ăn Vặt', stationCode: 'BEP_CHIEN', sortOrder: 9 },
  { id: 10, code: 'C10', name: 'Pizza', stationCode: 'BEP_CHIEN', sortOrder: 10 },
  { id: 11, code: 'C11', name: 'Nem', stationCode: 'BEP_CHIEN', sortOrder: 11 },
  { id: 12, code: 'C12', name: 'Cơm', stationCode: 'BEP_CHIEN', sortOrder: 12 },
  { id: 13, code: 'C13', name: 'Trà Hoa Quả Tươi', stationCode: 'PHA_CHE', sortOrder: 13 },
  { id: 14, code: 'C14', name: 'Trà Trái Cây', stationCode: 'PHA_CHE', sortOrder: 14 },
  { id: 15, code: 'C15', name: 'Trà Sữa', stationCode: 'PHA_CHE', sortOrder: 15 },
  { id: 16, code: 'C16', name: 'Coffee', stationCode: 'PHA_CHE', sortOrder: 16 },
  { id: 17, code: 'C17', name: 'Sinh Tố', stationCode: 'PHA_CHE', sortOrder: 17 },
  { id: 18, code: 'C18', name: 'Nước Ép Hoa Quả', stationCode: 'PHA_CHE', sortOrder: 18 },
  { id: 19, code: 'C19', name: 'Đá Xay', stationCode: 'PHA_CHE', sortOrder: 19 },
  { id: 20, code: 'C20', name: 'Sữa Chua', stationCode: 'PHA_CHE', sortOrder: 20 },
  { id: 21, code: 'C21', name: 'Sữa Tươi', stationCode: 'PHA_CHE', sortOrder: 21 },
  { id: 22, code: 'C22', name: 'Đồ Uống Nóng', stationCode: 'PHA_CHE', sortOrder: 22 },
  { id: 23, code: 'C23', name: 'Soda Ý', stationCode: 'PHA_CHE', sortOrder: 23 },
  { id: 24, code: 'C24', name: 'Nước Ngọt - Bia - Rượu', stationCode: 'PHA_CHE', sortOrder: 24 },
  { id: 25, code: 'C25', name: 'Đồ Ăn Vặt (Quầy Nước)', stationCode: 'PHA_CHE', sortOrder: 25 },
];

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
          initialEntries={['/q/ban01-tok']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/q/:token" element={<QrOrderPage />} />
            <Route path="/qr/:token" element={<QrOrderPage />} />
          </Routes>
        </MemoryRouter>
      </StoreSettingsContext.Provider>
    </QueryClientProvider>,
  );
}

describe('QrOrderPage level-2 subcategories responsive & filtering behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should render all 25 level-2 subcategories with wrap layout (no flex-nowrap or horizontal collapse) across mobile, tablet, and desktop viewport sizes', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      orderMode: 'DINE_IN',
      table: { tableId: 1, tableName: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null },
      stations: [
        { id: 1, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 },
        { id: 2, code: 'BEP_CHIEN', name: 'Bếp Chiên', sortOrder: 2 },
        { id: 3, code: 'PHA_CHE', name: 'Pha Chế', sortOrder: 3 },
      ],
      categories: SAMPLE_25_CATEGORIES,
      activeOrder: null,
      products: [
        {
          id: 101,
          name: 'Mì Bò Mỹ',
          price: 45000,
          station: 'BEP_NAU',
          categoryId: 1,
          categoryName: 'Mỳ Cay Kim Chi Hàn Quốc',
          subtitle: null,
          imageUrl: null,
          isAvailable: true,
          sortOrder: 1,
          modifierGroups: [],
          comboItems: [],
        },
        {
          id: 102,
          name: 'Gà Rán Cay',
          price: 40000,
          station: 'BEP_CHIEN',
          categoryId: 7,
          categoryName: 'Gà Rán - Gà Tươi',
          subtitle: null,
          imageUrl: null,
          isAvailable: true,
          sortOrder: 2,
          modifierGroups: [],
          comboItems: [],
        },
        {
          id: 103,
          name: 'Trà Sữa Matcha',
          price: 30000,
          station: 'PHA_CHE',
          categoryId: 15,
          categoryName: 'Trà Sữa',
          subtitle: null,
          imageUrl: null,
          isAvailable: true,
          sortOrder: 3,
          modifierGroups: [],
          comboItems: [],
        },
      ],
      updatedAt: '2026-11-23T03:00:00.000Z',
    } satisfies PublicMenuResponse);

    renderQrPage();

    const categoryBar = await screen.findByTestId('qr-category-bar');
    const stationBar = screen.getByTestId('qr-station-bar');

    for (const width of [320, 375, 390, 640, 768, 1024, 1280]) {
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          writable: true,
          value: width,
        });
        window.dispatchEvent(new Event('resize'));
      });

      expect(stationBar).toHaveClass('flex-wrap');
      expect(stationBar).not.toHaveClass('flex-nowrap');
      expect(stationBar).not.toHaveClass('overflow-x-auto');

      expect(categoryBar).toHaveClass('flex-wrap');
      expect(categoryBar).not.toHaveClass('flex-nowrap');
      expect(categoryBar).not.toHaveClass('overflow-x-auto');

      expect(within(categoryBar).getByTestId('qr-category-tab-ALL')).toHaveTextContent(
        'Tất cả danh mục (25)',
      );
      for (const cat of SAMPLE_25_CATEGORIES) {
        const pill = within(categoryBar).getByTestId(`qr-category-tab-${cat.id}`);
        expect(pill).toBeVisible();
        expect(pill).toHaveTextContent(cat.name);
        expect(pill).not.toHaveClass('whitespace-nowrap');
        expect(pill).toHaveClass('max-w-full', 'break-words');
      }
    }
  });

  it('should include categories with null stationCode used by station products, exclude hidden-station orphan categories, and reset stale active filter on realtime menu update', async () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      connected: true,
      connect: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
      }),
      off: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);

    let hideBeverageCategory = false;

    vi.spyOn(apiClient, 'get').mockImplementation(async () => ({
      orderMode: 'DINE_IN',
      table: { tableId: 1, tableName: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null },
      stations: [
        { id: 1, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 },
        { id: 2, code: 'PHA_CHE', name: 'Pha Chế', sortOrder: 2 },
      ],
      categories: [
        { id: 10, code: 'MI_CAY', name: 'Mì Cay', stationCode: 'BEP_NAU', sortOrder: 1 },
        ...(hideBeverageCategory
          ? []
          : [{ id: 20, code: 'TRA_DAO', name: 'Trà Trái Cây', stationCode: null, sortOrder: 2 }]),
        // Category belongs to a hidden station (BEP_CHIEN absent from stations) and has no visible products
        { id: 30, code: 'HIDDEN_CAT', name: 'Đồ Chiên Ẩn', stationCode: 'BEP_CHIEN', sortOrder: 3 },
      ],
      activeOrder: null,
      products: [
        {
          id: 1,
          name: 'Mì Bò',
          price: 45000,
          station: 'BEP_NAU',
          categoryId: 10,
          categoryName: 'Mì Cay',
          subtitle: null,
          imageUrl: null,
          isAvailable: true,
          sortOrder: 1,
          modifierGroups: [],
          comboItems: [],
        },
        ...(hideBeverageCategory
          ? []
          : [
              {
                id: 2,
                name: 'Trà Đào Cam Sả',
                price: 30000,
                station: 'PHA_CHE' as const,
                categoryId: 20,
                categoryName: 'Trà Trái Cây',
                subtitle: null,
                imageUrl: null,
                isAvailable: true,
                sortOrder: 2,
                modifierGroups: [],
                comboItems: [],
              },
            ]),
      ],
      updatedAt: '2026-11-23T03:00:00.000Z',
    }));

    renderQrPage();

    await screen.findByTestId('qr-category-tab-10');
    // Hidden-station orphan category must NOT appear
    expect(screen.queryByTestId('qr-category-tab-30')).not.toBeInTheDocument();
    // Category with stationCode: null appears under ALL and under PHA_CHE because Trà Đào uses it
    expect(screen.getByTestId('qr-category-tab-20')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('qr-station-tab-PHA_CHE'));
    expect(screen.getByTestId('qr-category-tab-20')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-category-tab-10')).not.toBeInTheDocument();

    // Select subcategory 20, switch back to ALL, and confirm toggle behavior
    fireEvent.click(screen.getByTestId('qr-station-tab-ALL'));
    const cat20 = screen.getByTestId('qr-category-tab-20');
    fireEvent.click(cat20);
    expect(cat20).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('qr-product-card-2')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-product-card-1')).not.toBeInTheDocument();

    // Realtime menu update hides category 20 -> active filter falls back to ALL instead of showing empty menu
    hideBeverageCategory = true;
    await act(async () => {
      for (const h of listeners.get(SocketEvents.MENU_UPDATED) ?? []) {
        h();
      }
    });

    await waitFor(() => {
      expect(screen.queryByTestId('qr-category-tab-20')).not.toBeInTheDocument();
      expect(screen.getByTestId('qr-product-card-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('qr-category-tab-ALL')).toHaveAttribute('aria-pressed', 'true');
  });

  it('should allow resetting an empty subcategory selection or search query from the empty menu state', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      orderMode: 'DINE_IN',
      table: { tableId: 1, tableName: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null },
      stations: [{ id: 1, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 }],
      categories: [
        { id: 10, code: 'MI_CAY', name: 'Mì Cay', stationCode: 'BEP_NAU', sortOrder: 1 },
        { id: 11, code: 'LAU', name: 'Lẩu Mới', stationCode: 'BEP_NAU', sortOrder: 2 },
      ],
      activeOrder: null,
      products: [
        {
          id: 1,
          name: 'Mì Bò',
          price: 45000,
          station: 'BEP_NAU',
          categoryId: 10,
          categoryName: 'Mì Cay',
          subtitle: null,
          imageUrl: null,
          isAvailable: true,
          sortOrder: 1,
          modifierGroups: [],
          comboItems: [],
        },
      ],
      updatedAt: '2026-11-23T03:00:00.000Z',
    });

    renderQrPage();

    const emptyCatTab = await screen.findByTestId('qr-category-tab-11');
    fireEvent.click(emptyCatTab);
    expect(screen.getByText('Không tìm thấy món phù hợp')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả danh mục' }));
    expect(screen.getByTestId('qr-product-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('qr-category-tab-ALL')).toHaveAttribute('aria-pressed', 'true');
  });
});
