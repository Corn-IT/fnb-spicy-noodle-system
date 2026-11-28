import { UserPermissionsSchema, type MdmItem } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { MasterDataPage } from '@/features/master-data';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const adminUser = {
  id: 1,
  employeeId: 1,
  username: 'admin',
  fullName: 'Quản Lý',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    mdm: { view: true, create: true, update: true, delete: true },
  }),
};

const mdmViewerUser = {
  id: 3,
  employeeId: 3,
  username: 'viewer',
  fullName: 'Nhân viên Xem MDM',
  isSuperAdmin: false,
  permissions: UserPermissionsSchema.parse({
    mdm: { view: true, create: false, update: false, delete: false },
  }),
};

const sampleStations: MdmItem[] = [
  {
    id: 101,
    category: 'KITCHEN_STATION',
    name: 'Bếp nấu',
    normalizedName: 'bep nau',
    metadata: { code: 'BEP_NAU', sortOrder: 1, isSystem: true, isHidden: false },
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 102,
    category: 'KITCHEN_STATION',
    name: 'Bếp Lẩu Custom',
    normalizedName: 'bep lau custom',
    metadata: { code: 'BEP_LAU', sortOrder: 5, isSystem: false, isHidden: false },
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

function renderMdmPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={routerFutureFlags}>
        <MasterDataPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MasterDataPage (Wave 2 Comprehensive)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({ accessToken: 'tok', user: adminUser });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('recovers from API list failure via SystemErrorView Retry and hides write buttons in read-only mode', async () => {
    useAuthStore.getState().setAuth({ accessToken: 'viewer', user: mdmViewerUser });

    let failOnce = true;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/mdm/lookup') return sampleStations;
      if (url === '/api/v1/mdm') {
        if (failOnce) {
          failOnce = false;
          throw new Error('Backend error');
        }
        return {
          page: 1,
          limit: 20,
          total: 1,
          items: [
            {
              id: 1,
              category: 'POSITION',
              name: 'Thu Ngân',
              normalizedName: 'thu ngan',
              metadata: {},
              isActive: true,
              createdAt: '2026-11-01T00:00:00.000Z',
            },
          ],
        };
      }
      if (url.startsWith('/api/v1/audit-logs')) return { items: [], total: 0, page: 1, limit: 20 };
      return {};
    });

    renderMdmPage();

    expect(await screen.findByTestId('error-retry-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('error-retry-btn'));

    expect(await screen.findByText('Thu Ngân')).toBeInTheDocument();
    expect(screen.queryByTestId('create-mdm-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-mdm-btn-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-mdm-btn-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toggle-mdm-status-1')).not.toBeInTheDocument();
  });

  it('validates client fields and supports dynamic BEP_* stations in MENU_CATEGORY tab plus INGREDIENT metadata & delete confirm', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, opts?: { params?: { category?: string } }) => {
      if (url === '/api/v1/mdm/lookup') return sampleStations;
      if (url === '/api/v1/mdm') {
        const cat = opts?.params?.category;
        if (cat === 'MENU_CATEGORY') {
          return {
            page: 1,
            limit: 20,
            total: 1,
            items: [
              {
                id: 11,
                category: 'MENU_CATEGORY',
                name: 'Lẩu Kim Chi',
                normalizedName: 'lau kim chi',
                metadata: { defaultStation: 'BEP_LAU', sortOrder: 2, isHidden: false },
                isActive: true,
                createdAt: '2026-11-01T00:00:00.000Z',
              },
            ],
          };
        }
        if (cat === 'INGREDIENT') {
          return {
            page: 1,
            limit: 20,
            total: 1,
            items: [
              {
                id: 21,
                category: 'INGREDIENT',
                name: 'Ba Chỉ Bò',
                normalizedName: 'ba chi bo',
                metadata: { default_unit: 'Kg', last_price: 185000, description: 'Thịt bò Mỹ' },
                isActive: true,
                createdAt: '2026-11-01T00:00:00.000Z',
              },
            ],
          };
        }
        return { page: 1, limit: 20, total: 0, items: [] };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 99 });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ id: 21, isActive: false });

    const user = userEvent.setup();
    renderMdmPage();

    // Switch to MENU_CATEGORY -> friendly custom station name `Bếp Lẩu Custom` rendered cleanly
    await user.click(screen.getByTestId('mdm-tab-MENU_CATEGORY'));
    expect(await screen.findByText('Lẩu Kim Chi')).toBeInTheDocument();
    expect(screen.getByText('Bếp Lẩu Custom')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('create-mdm-btn'));
    expect(await screen.findByTestId('mdm-upsert-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('mdm-station-btn-BEP_LAU')).toHaveTextContent('Bếp Lẩu Custom');

    // Negative sortOrder blocked on client
    fireEvent.change(screen.getByTestId('mdm-name-input'), { target: { value: 'Lẩu Thái' } });
    fireEvent.click(screen.getByTestId('mdm-station-btn-BEP_LAU'));
    fireEvent.change(screen.getByTestId('mdm-sort-order-input'), { target: { value: '-1' } });
    fireEvent.click(screen.getByTestId('submit-mdm-btn'));
    expect(screen.getByTestId('mdm-form-error')).toHaveTextContent('Thứ tự hiển thị phải là số nguyên không âm.');

    // Fix sortOrder and submit with custom BEP_LAU station
    fireEvent.change(screen.getByTestId('mdm-sort-order-input'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('submit-mdm-btn'));
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/mdm',
        expect.objectContaining({
          category: 'MENU_CATEGORY',
          name: 'Lẩu Thái',
          normalizedName: 'lau thai',
          metadata: expect.objectContaining({ defaultStation: 'BEP_LAU', sortOrder: 3 }),
        }),
      );
    });

    // Switch to INGREDIENT tab -> test negative price validation & delete confirmation dialog
    await user.click(screen.getByTestId('mdm-tab-INGREDIENT'));
    expect(await screen.findByText('Ba Chỉ Bò')).toBeInTheDocument();
    expect(screen.getByText(/ĐVT:\s*Kg/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('create-mdm-btn'));
    fireEvent.change(screen.getByTestId('mdm-name-input'), { target: { value: 'Tôm Sú' } });
    fireEvent.change(screen.getByTestId('mdm-last-price-input'), { target: { value: '-500' } });
    fireEvent.click(screen.getByTestId('submit-mdm-btn'));
    expect(screen.getByTestId('mdm-form-error')).toHaveTextContent('Đơn giá tham khảo phải lớn hơn hoặc bằng 0.');

    fireEvent.change(screen.getByTestId('mdm-default-unit-input'), { target: { value: 'Kg' } });
    fireEvent.change(screen.getByTestId('mdm-last-price-input'), { target: { value: '220000' } });
    fireEvent.click(screen.getByTestId('submit-mdm-btn'));
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/mdm',
        expect.objectContaining({
          category: 'INGREDIENT',
          name: 'Tôm Sú',
          metadata: expect.objectContaining({ default_unit: 'Kg', last_price: 220000 }),
        }),
      );
    });

    fireEvent.click(screen.getByTestId('delete-mdm-btn-21'));
    expect(await screen.findByTestId('delete-mdm-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-delete-mdm-btn'));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/mdm/21');
    });

    // Edit existing record + sync normalized name + toggle status
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({ id: 21, name: 'Ba Chỉ Bò Mỹ' });

    await user.click(screen.getByTestId('edit-mdm-btn-21'));
    expect(await screen.findByTestId('mdm-upsert-dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mdm-name-input'), { target: { value: 'Ba Chỉ Bò Mỹ' } });
    fireEvent.click(screen.getByTestId('mdm-sync-normalized-btn'));
    fireEvent.click(screen.getByTestId('submit-mdm-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/mdm/21', expect.objectContaining({ name: 'Ba Chỉ Bò Mỹ' }));
    });

    await user.click(screen.getByTestId('toggle-mdm-status-21'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/mdm/21', { isActive: false });
    });
  });
});
