import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  DEFAULT_STORE_SETTINGS,
  UserPermissionsSchema,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { CommandPalette } from '@/components/layout/command-palette';
import { ResizableSidebar } from '@/components/layout/resizable-sidebar';
import { StoreBrandLogo } from '@/components/store-brand-logo';
import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

function makeSettings(overrides: Partial<PublicStoreSettingsResponse> = {}): PublicStoreSettingsResponse {
  return {
    ...DEFAULT_STORE_SETTINGS,
    updatedAt: '2026-11-15T10:00:00.000Z',
    assets: { logo: null, favicon: null, qrLogo: null },
    ...overrides,
  };
}

function renderWithProviders(
  ui: React.ReactElement,
  settings: PublicStoreSettingsResponse,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StoreSettingsContext.Provider value={{ settings }}>
        <MemoryRouter future={routerFutureFlags}>{ui}</MemoryRouter>
      </StoreSettingsContext.Provider>
    </QueryClientProvider>,
  );
}

describe('Store Branding Shell Integration (AC-14.4, AC-14.10, AC-14.12)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiPreferencesStore.getState().setSidebarCollapsed(false);
    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
  });

  it('reflects dynamic storeName, subtitle, navLabels in ResizableSidebar and CommandPalette', () => {
    const custom = makeSettings({
      storeName: 'Mì Cay Seoul 88',
      subtitle: 'Chi nhánh Cầu Giấy',
      navLabels: {
        '/pos': 'Quầy Order Nhanh',
        '/settings': 'Thiết lập Thương hiệu',
      },
    });

    renderWithProviders(
      <>
        <ResizableSidebar />
        <CommandPalette open={true} onOpenChange={() => {}} />
      </>,
      custom,
    );

    expect(screen.getByText('Mì Cay Seoul 88')).toBeInTheDocument();
    expect(screen.getByText('Chi nhánh Cầu Giấy')).toBeInTheDocument();
    expect(screen.getAllByText('Quầy Order Nhanh').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Thiết lập Thương hiệu').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Ăn Vặt Tran')).not.toBeInTheDocument();
  });

  it('renders store initials badge when logo asset is null and falls back to initials on image error', () => {
    const { container, rerender } = render(
      <StoreBrandLogo src={null} storeName="Mì Cay Seoul" testId="brand-logo" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('brand-logo')).toHaveTextContent('MS');

    rerender(
      <StoreBrandLogo
        src="/api/v1/public/store-assets/logo?v=2026"
        storeName="Mì Cay Seoul"
        testId="brand-logo"
      />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('/api/v1/public/store-assets/logo?v=2026');

    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('brand-logo')).toHaveTextContent('MS');
  });

  it('renders XSS script payloads in storeName and subtitle as inert plain text (AC-14.12)', () => {
    const xssPayload = '<script>alert(1)</script>';
    const malicious = makeSettings({
      storeName: xssPayload,
      subtitle: '<img src=x onerror=alert(2)>',
    });

    const { container } = renderWithProviders(<ResizableSidebar />, malicious);

    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByTestId('sidebar-brand')).toHaveTextContent(xssPayload);
    expect(screen.getByTestId('sidebar-brand')).toHaveTextContent('<img src=x onerror=alert(2)>');
  });

  it('reorders sidebar groups and routes and renders custom navGroupLabels in Sidebar and CommandPalette', () => {
    const custom = makeSettings({
      navGroupLabels: {
        sales: 'Quầy Bán & Ưu Đãi',
        finance: 'Tiền & Kho Vận',
      },
      navGroupOrder: ['finance', 'sales', 'system', 'hr'],
      navOrder: ['/discounts', '/pos', '/menu', '/invoices'],
    });

    const { container } = renderWithProviders(
      <>
        <ResizableSidebar />
        <CommandPalette open={true} onOpenChange={() => {}} />
      </>,
      custom,
    );

    const nav = container.querySelector('nav[aria-label="Điều hướng chính"]')!;
    const groupContainers = Array.from(nav.querySelectorAll('[data-testid^="sidebar-group-"]'));
    expect(groupContainers.map((el) => el.getAttribute('data-testid'))).toEqual([
      'sidebar-group-finance',
      'sidebar-group-sales',
      'sidebar-group-system',
      'sidebar-group-hr',
    ]);

    expect(screen.getAllByText('Quầy Bán & Ưu Đãi').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Tiền & Kho Vận').length).toBeGreaterThanOrEqual(2);

    const salesLinks = Array.from(
      nav.querySelectorAll('[data-testid="sidebar-group-sales"] a'),
    ).map((a) => a.getAttribute('href'));
    expect(salesLinks).toEqual(['/discounts', '/pos', '/menu', '/invoices']);
  });
});
