import { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { DEFAULT_STORE_SETTINGS, StoreAssetKind } from '@fnb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStoreAssetUrl,
  readCachedStoreSettings,
  resolveNavGroupLabel,
  resolvePageHeader,
  sortNavGroups,
  sortNavRoutes,
  STORE_SETTINGS_CACHE_KEY,
  writeCachedStoreSettings,
} from '../use-store-settings';
import { StoreSettingsProvider } from '@/providers/store-settings-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { QueryProvider } from '@/providers/query-provider';

const mockPublicSettings = {
  ...DEFAULT_STORE_SETTINGS,
  storeName: 'Mì Cay Seoul',
  subtitle: 'Cay xé lưỡi 7 cấp độ',
  description: 'Mì cay chuẩn vị Hàn Quốc',
  brandColor: '#FACC15',
  defaultTheme: 'dark' as const,
  navLabels: { '/pos': 'Bán hàng' },
  updatedAt: '2026-11-15T10:00:00.000Z',
  assets: {
    logo: 'v-logo-1',
    favicon: 'v-fav-1',
    qrLogo: null,
  },
  qrMessages: {},
};

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => mockPublicSettings),
  },
}));

describe('useStoreSettings & StoreSettingsProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.title = 'POS';
    document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((el) => el.remove());
  });

  it('builds asset URLs safely and persists store_settings_cache in localStorage', () => {
    expect(buildStoreAssetUrl(StoreAssetKind.LOGO, null)).toBeNull();
    expect(buildStoreAssetUrl(StoreAssetKind.LOGO, '2026-11-15T10:00:00.000Z', 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/v1/public/store-assets/logo?v=2026-11-15T10%3A00%3A00.000Z',
    );

    writeCachedStoreSettings(mockPublicSettings);
    expect(readCachedStoreSettings()?.storeName).toBe('Mì Cay Seoul');
    expect(localStorage.getItem(STORE_SETTINGS_CACHE_KEY)).toContain('Mì Cay Seoul');
  });

  it('hydrates document title with navLabels, updates favicon/meta description, and applies brandColor CSS variables', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryProvider client={queryClient}>
        <ThemeProvider>
          <StoreSettingsProvider currentPath="/pos" defaultPageTitle="Bán hàng POS">
            <div data-testid="child">OK</div>
          </StoreSettingsProvider>
        </ThemeProvider>
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe('Bán hàng · Mì Cay Seoul');
    });

    const iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(iconLink?.getAttribute('href')).toContain('/api/v1/public/store-assets/favicon?v=v-fav-1');

    const metaDesc = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    expect(metaDesc?.getAttribute('content')).toBe('Mì cay chuẩn vị Hàn Quốc');

    expect(document.documentElement.style.getPropertyValue('--primary')).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--primary-foreground')).toBeTruthy();
  });

  it('preserves existing route document.title when mounted without route props', async () => {
    document.title = 'Quản trị Thực đơn · Mì Cay Seoul';
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryProvider client={queryClient}>
        <ThemeProvider>
          <StoreSettingsProvider>
            <div data-testid="root-child">OK</div>
          </StoreSettingsProvider>
        </ThemeProvider>
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--primary')).toBeTruthy();
    });

    expect(document.title).toBe('Quản trị Thực đơn · Mì Cay Seoul');
  });

  it('migrates legacy v1 cached store settings cleanly and rejects corrupted cache (AC-15.1)', () => {
    localStorage.setItem(
      STORE_SETTINGS_CACHE_KEY,
      JSON.stringify({
        storeName: 'Mì Cay Test',
        subtitle: 'Sub v1',
        description: 'Desc v1',
        brandColor: '#059669',
        defaultTheme: 'dark',
        qr: { storeName: 'QR', subtitle: '', welcomeMessage: '', theme: 'system' },
        receipt: { printName: 'TEST', address: '', phone: '', footerNote: '', showLogo: false },
        navLabels: { '/pos': 'Thu ngân' },
        updatedAt: '2026-11-15T06:00:00.000Z',
        assets: { logo: null, favicon: null, qrLogo: null },
      }),
    );

    const cached = readCachedStoreSettings();
    expect(cached).toBeDefined();
    expect(cached?.storeName).toBe('Mì Cay Test');
    expect(cached?.brandColor).toBe('#059669');
    expect(cached?.primaryTextColor).toEqual({ light: null, dark: null });
    expect(cached?.accentTextColor).toEqual({ light: null, dark: null });
    expect(cached?.priceColor).toEqual({ light: null, dark: null });
    expect(cached?.pageHeaders).toEqual({});

    localStorage.setItem(
      STORE_SETTINGS_CACHE_KEY,
      JSON.stringify({
        storeName: 'Bad',
        brandColor: 'invalid-hex',
        assets: { logo: null, favicon: null, qrLogo: null },
        updatedAt: null,
      }),
    );
    expect(readCachedStoreSettings()).toBeUndefined();
  });

  it('resolves custom page header title/subtitle without altering navLabels document title (AC-15.6)', () => {
    const defaults = { title: 'Cài đặt Cửa hàng', subtitle: 'Mô tả mặc định' };

    expect(resolvePageHeader('/settings', defaults, undefined)).toEqual({
      title: 'Cài đặt Cửa hàng',
      subtitle: 'Mô tả mặc định',
      hasCustomTitle: false,
      hasCustomSubtitle: false,
      isCustomized: false,
    });

    expect(
      resolvePageHeader('/settings', defaults, {
        '/settings': { title: '  Thiết lập Quán  ', subtitle: '' },
      }),
    ).toEqual({
      title: 'Thiết lập Quán',
      subtitle: 'Mô tả mặc định',
      hasCustomTitle: true,
      hasCustomSubtitle: false,
      isCustomized: true,
    });
  });

  it('resolves custom nav group labels and stably sorts groups and routes with partial custom order', () => {
    expect(resolveNavGroupLabel('sales', 'Bán hàng & Khuyến mãi', { sales: '  Quầy Order  ' })).toBe(
      'Quầy Order',
    );
    expect(resolveNavGroupLabel('hr', 'Nhân sự & Tiền lương', { hr: '   ' })).toBe(
      'Nhân sự & Tiền lương',
    );

    const groups = [
      { key: 'sales', label: 'A' },
      { key: 'finance', label: 'B' },
      { key: 'hr', label: 'C' },
      { key: 'system', label: 'D' },
    ];
    expect(sortNavGroups(groups, ['system', 'hr']).map((g) => g.key)).toEqual([
      'system',
      'hr',
      'sales',
      'finance',
    ]);

    const routes = [
      { path: '/pos', label: 'POS' },
      { path: '/menu', label: 'Menu' },
      { path: '/discounts', label: 'Discounts' },
      { path: '/invoices', label: 'Invoices' },
    ];
    expect(sortNavRoutes(routes, ['/discounts', '/pos', '/discounts']).map((r) => r.path)).toEqual([
      '/discounts',
      '/pos',
      '/menu',
      '/invoices',
    ]);
  });
});
