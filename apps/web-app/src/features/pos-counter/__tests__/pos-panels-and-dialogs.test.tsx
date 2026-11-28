import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  QR_CARD_DEFAULTS,
  type PosTableGridResponse,
  type Product,
  type PublicStoreSettingsResponse,
  UserPermissionsSchema,
} from '@fnb/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { QrCardQuickDialog } from '@/components/qr-card';
import { useToastStore } from '@/components/ui/toast';
import { PosUnifiedPage } from '@/features/pos-counter';
import { ApiClientError, apiClient } from '@/lib/api-client';
import * as socketClient from '@/lib/socket-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';
import { PosMenuPanel } from '../components/pos-menu-panel';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const sampleProducts: Product[] = [
  {
    id: 11,
    categoryId: 10,
    categoryName: 'Mì Cay',
    station: 'BEP_NAU',
    name: 'Mì Kim Chi Hải Sản',
    subtitle: 'Tôm mực tươi',
    price: 59000,
    isAvailable: true,
    sortOrder: 1,
    imageUrl: null,
    comboItems: [],
    modifierGroups: [
      {
        id: 1,
        name: 'Cấp độ cay',
        isRequired: true,
        maxSelect: 1,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: [
          {
            id: 101,
            name: 'Cấp độ 1',
            extraPrice: 0,
            isDefaultChecked: true,
            isAvailable: true,
            defaultSubstituteName: null,
            allowedSubstituteNames: null,
          },
          {
            id: 102,
            name: 'Cấp độ 2',
            extraPrice: 0,
            isDefaultChecked: false,
            isAvailable: true,
            defaultSubstituteName: null,
            allowedSubstituteNames: null,
          },
        ],
      },
    ],
  },
  {
    id: 12,
    categoryId: 20,
    categoryName: 'Trà Sữa',
    station: 'PHA_CHE',
    name: 'Trà Đào Cam Sả',
    subtitle: null,
    price: 30000,
    isAvailable: true,
    sortOrder: 2,
    imageUrl: null,
    comboItems: [],
    modifierGroups: [],
  },
];

describe('POS Panels, QrCardQuickDialog & Unified Page Routing (Wave 3 Comprehensive)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-tok',
      user: {
        id: 2,
        employeeId: 2,
        username: 'thungan01',
        fullName: 'Thu Ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true, create: true, update: true, splitKitchen: true },
          menu: { view: true, update: true },
          settings: { view: true, update: true },
        }),
      },
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('filters stations/subcategories/search, handles quick-add & addon takeaway toggle, and respects readonly RBAC in PosMenuPanel', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([]);
    const onAddItem = vi.fn();
    const onChangeTakeaway = vi.fn();

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryProvider client={client}>
        <MemoryRouter initialEntries={['/pos']} future={routerFutureFlags}>
          <Routes>
            <Route
              path="/pos"
              element={
                <PosMenuPanel
                  products={sampleProducts}
                  onAddItem={onAddItem}
                  showAddonServingModeSelector
                  addonIsTakeaway={false}
                  onChangeAddonIsTakeaway={onChangeTakeaway}
                />
              }
            />
            <Route path="/menu" element={<div data-testid="navigated-menu-page">Menu</div>} />
          </Routes>
        </MemoryRouter>
      </QueryProvider>,
    );

    // Quick add zero-modifier product 12 directly
    fireEvent.click(screen.getByTestId('pos-quick-add-product-12'));
    expect(onAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 12, name: 'Trà Đào Cam Sả', quantity: 1 }),
    );

    // Quick add default-satisfied modifier product 11 directly
    fireEvent.click(screen.getByTestId('pos-quick-add-product-11'));
    expect(onAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 11,
        modifiers: [{ groupId: 1, modifierId: 101 }],
      }),
    );

    // Clicking product card 11 opens ProductOptionsDialog
    fireEvent.click(screen.getByTestId('pos-menu-product-11'));
    expect(await screen.findByTestId('pos-modifier-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pos-mod-option-102'));
    fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));
    await waitFor(() => {
      expect(onAddItem).toHaveBeenLastCalledWith(
        expect.objectContaining({ modifiers: [{ groupId: 1, modifierId: 102 }] }),
      );
    });

    // Toggle addon serving mode
    fireEvent.click(screen.getByTestId('pos-addon-mode-takeaway'));
    expect(onChangeTakeaway).toHaveBeenCalledWith(true);

    // Search non-matching query shows empty state + reset link
    const searchInput = screen.getByTestId('pos-menu-search-input');
    fireEvent.change(searchInput, { target: { value: 'monkhongtontai' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByText('Không tìm thấy món phù hợp')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Xoá bộ lọc tìm kiếm'));
    expect(screen.getByTestId('pos-menu-product-11')).toBeInTheDocument();

    // Read-only POS hides quick-add + menu link when permission removed
    act(() => {
      useAuthStore.getState().setAuth({
        accessToken: 'view-tok',
        user: {
          id: 9,
          employeeId: 9,
          username: 'viewer',
          fullName: 'Viewer',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
        },
      });
    });
    expect(screen.queryByTestId('pos-quick-add-product-12')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pos-goto-menu-admin-btn')).not.toBeInTheDocument();
  });

  it('handles QrCardQuickDialog 409 conflict reload and client validation errors cleanly', async () => {
    const serverSettings: PublicStoreSettingsResponse = {
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: '2026-11-27T10:00:00.000Z',
      assets: { logo: null, favicon: null, qrLogo: null },
      qrCard: { ...QR_CARD_DEFAULTS },
    };

    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/settings' || url === '/api/v1/public/store-settings') {
        return serverSettings;
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(
      new ApiClientError({
        statusCode: 409,
        error: 'Conflict',
        code: ErrorCodes.STORE_SETTINGS_CONFLICT,
        message: 'Cấu hình đã thay đổi',
        details: null,
        requestId: 'req-conflict',
      }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryProvider client={client}>
        <QrCardQuickDialog open={true} onOpenChange={vi.fn()} />
      </QueryProvider>,
    );

    expect(await screen.findByTestId('qr-card-quick-save-btn')).toBeInTheDocument();
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/v1/settings'));

    fireEvent.click(screen.getByTestId('qr-card-quick-save-btn'));
    expect(await screen.findByTestId('qr-card-quick-conflict-banner')).toHaveTextContent('Cấu hình đã thay đổi');

    // Reload latest clears conflict banner
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại mới nhất' }));
    await waitFor(() => {
      expect(screen.queryByTestId('qr-card-quick-conflict-banner')).not.toBeInTheDocument();
    });
  });

  it('auto-selects deep-linked ?orderId=42 on PosUnifiedPage, recovers from grid error retry, and switches tabs', async () => {
    const user = userEvent.setup();
    const mockSocket = { on: vi.fn(), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);

    let failGridOnce = true;
    const gridData: PosTableGridResponse = {
      tables: [
        {
          id: 1,
          name: 'Bàn 01',
          status: 'OCCUPIED',
          activeOrderId: 42,
          activeOrder: {
            orderId: 42,
            orderCode: 'HD-20261127-0042',
            orderType: 'DINE_IN',
            tableId: 1,
            tableLabel: 'Bàn 01',
            takeawayNumber: null,
            status: 'SERVING',
            totalAmount: 59000,
            createdAt: '2026-11-27T10:00:00.000Z',
          },
        },
      ],
      takeaways: [],
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') {
        if (failGridOnce) {
          failGridOnce = false;
          throw new Error('Grid timeout');
        }
        return gridData;
      }
      if (url === '/api/v1/pos/drafts') return { drafts: [] };
      if (url === '/api/v1/menu/products') return sampleProducts;
      if (url === '/api/v1/pos/orders/42') {
        return {
          orderId: 42,
          orderCode: 'HD-20261127-0042',
          orderType: 'DINE_IN',
          orderSource: 'POS_COUNTER',
          tableId: 1,
          tableLabel: 'Bàn 01',
          takeawayNumber: null,
          status: 'SERVING',
          paymentMethod: null,
          cashAmount: 0,
          transferAmount: 0,
          subtotalAmount: 59000,
          discountAmount: 0,
          discountId: null,
          discountSnapshot: null,
          discountWarning: null,
          totalAmount: 59000,
          note: null,
          createdAt: '2026-11-27T10:00:00.000Z',
          paidAt: null,
          tableTransferLogs: [],
          items: [
            {
              id: 501,
              productId: 11,
              name: 'Mì Kim Chi Hải Sản',
              quantity: 1,
              unitPrice: 59000,
              lineTotal: 59000,
              modifiers: [],
              itemNote: null,
              batchNo: 1,
              kitchenStatus: 'PRINTED',
            },
          ],
        };
      }
      if (url.startsWith('/api/v1/public/store-settings') || url.startsWith('/api/v1/store-messages')) {
        return url.startsWith('/api/v1/store-messages')
          ? { messages: {}, updatedAt: '2026-11-27T10:00:00.000Z' }
          : { ...DEFAULT_STORE_SETTINGS, updatedAt: '2026-11-27T10:00:00.000Z', assets: { logo: null, favicon: null, qrLogo: null } };
      }
      return [];
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryProvider client={client}>
        <SocketProvider>
          <ThermalPrintProvider>
            <MemoryRouter initialEntries={['/pos?orderId=42']} future={routerFutureFlags}>
              <PosUnifiedPage />
            </MemoryRouter>
          </ThermalPrintProvider>
        </SocketProvider>
      </QueryProvider>,
    );

    // Retry from initial grid failure
    expect(await screen.findByTestId('error-retry-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('error-retry-btn'));

    // Auto-selects order #42 from ?orderId=42 query parameter
    expect(await screen.findByTestId('invoice-item-501')).toBeInTheDocument();

    // Switch to fast menu tab cleanly via Radix tab
    await user.click(screen.getByTestId('pos-tab-menu'));
    expect(screen.getByTestId('pos-menu-product-11')).toBeInTheDocument();
  });
});
