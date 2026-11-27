import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  MESSAGE_CATALOG_BY_KEY,
  StoreAssetKind,
  UserPermissionsSchema,
  type PublicStoreSettingsResponse,
  type StoreMessagesMap,
} from '@fnb/shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { StoreSettingsPage } from '@/features/store-settings';
import { STORE_SETTINGS_CACHE_KEY, STORE_SETTINGS_QUERY_KEY } from '@/hooks/use-store-settings';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import * as storeThemeUtils from '@/utils/store-theme';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

function makeServerSettings(
  overrides: Partial<PublicStoreSettingsResponse> = {},
): PublicStoreSettingsResponse {
  return {
    ...DEFAULT_STORE_SETTINGS,
    updatedAt: '2026-11-15T10:00:00.000Z',
    assets: {
      logo: null,
      favicon: null,
      qrLogo: null,
    },
    ...overrides,
  };
}

function renderStoreSettingsPage(
  initialSettings = makeServerSettings(),
  initialMessages: StoreMessagesMap = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url.startsWith('/api/v1/settings') || url.startsWith('/api/v1/public/store-settings')) {
      return initialSettings;
    }
    if (url.startsWith('/api/v1/store-messages')) {
      return {
        messages: initialMessages,
        updatedAt: '2026-11-15T10:00:00.000Z',
      };
    }
    if (url.startsWith('/api/v1/audit-logs')) {
      return { items: [], total: 0, page: 1, limit: 20 };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={routerFutureFlags}>
        <StoreSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { queryClient, getSpy, ...utils };
}

describe('StoreSettingsPage (Story 14)', () => {
  beforeEach(() => {
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({
          settings: { view: true, update: true },
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 7 configuration tabs and AuditHistoryButton for SETTINGS', async () => {
    renderStoreSettingsPage();

    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    expect(screen.getByRole('tab', { name: /Thông tin quán/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Logo & Favicon/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Giao diện/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Trang khách QR/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Phiếu in/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Menu & Tiêu đề trang/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Thông báo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lịch sử thao tác/i })).toBeInTheDocument();
  });

  it('validates empty storeName and invalid hex brandColor before submitting', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(apiClient, 'put');
    renderStoreSettingsPage();

    expect(useAuthStore.getState().user?.isSuperAdmin).toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    const storeNameInput = await screen.findByTestId('input-store-name');
    fireEvent.change(storeNameInput, { target: { value: '   ' } });
    await user.click(screen.getByTestId('store-settings-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('store-settings-validation-error')).toHaveTextContent(
        /Tên cửa hàng không được để trống/i,
      );
    });
    expect(putSpy).not.toHaveBeenCalled();

    fireEvent.change(storeNameInput, { target: { value: 'Mì Cay Mới' } });
    await user.click(screen.getByRole('tab', { name: /Giao diện/i }));

    const hexInput = await screen.findByTestId('input-brand-color-hex');
    fireEvent.change(hexInput, { target: { value: '#ZZZ' } });
    await user.click(screen.getByTestId('store-settings-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('store-settings-validation-error')).toHaveTextContent(/#RRGGBB/i);
    });
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('rejects SVG upload on client and handles valid asset upload and delete immediately', async () => {
    const user = userEvent.setup();
    const serverAfterUpload = makeServerSettings({
      updatedAt: '2026-11-15T11:00:00.000Z',
      assets: { logo: '2026-11-15T11:00:00.000Z', favicon: null, qrLogo: null },
    });
    const serverAfterDelete = makeServerSettings({
      updatedAt: '2026-11-15T11:05:00.000Z',
      assets: { logo: null, favicon: null, qrLogo: null },
    });

    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(serverAfterUpload);
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValueOnce(serverAfterDelete);
    const resizeSpy = vi
      .spyOn(storeThemeUtils, 'resizeImageFileToUploadPayload')
      .mockImplementation(async (file, kind) => {
        storeThemeUtils.validateClientImageFile(file);
        return { mime: kind === StoreAssetKind.FAVICON ? 'image/png' : 'image/webp', base64: 'AAAA' };
      });

    const { queryClient } = renderStoreSettingsPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('tab', { name: /Logo & Favicon/i }));

    const logoInput = (await screen.findByTestId('asset-file-input-logo')) as HTMLInputElement;
    const svgFile = new File(['<svg></svg>'], 'evil.svg', { type: 'image/svg+xml' });
    fireEvent.change(logoInput, { target: { files: [svgFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('asset-error-logo')).toHaveTextContent(/SVG/i);
    });
    expect(putSpy).not.toHaveBeenCalled();

    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    });
    fireEvent.change(logoInput, { target: { files: [pngFile] } });

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/settings/assets/logo', {
        mime: 'image/webp',
        base64: 'AAAA',
      });
    });
    expect(resizeSpy).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORE_SETTINGS_CACHE_KEY)!).assets.logo).toBe(
      '2026-11-15T11:00:00.000Z',
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: STORE_SETTINGS_QUERY_KEY });

    const deleteLogoBtn = await screen.findByTestId('asset-delete-btn-logo');
    await user.click(deleteLogoBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/settings/assets/logo');
    });
    expect(JSON.parse(localStorage.getItem(STORE_SETTINGS_CACHE_KEY)!).assets.logo).toBeNull();
  });

  it('edits navLabels and clears key when clicking restore default', async () => {
    const user = userEvent.setup();
    const initial = makeServerSettings({
      navLabels: { '/invoices': 'Sổ Hoá Đơn' },
    });
    const saved = makeServerSettings({
      updatedAt: '2026-11-15T12:00:00.000Z',
      navLabels: { '/pos': 'Quầy Thu Ngân' },
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(saved);

    renderStoreSettingsPage(initial);
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(await screen.findByRole('tab', { name: /Menu & Tiêu đề trang/i }));

    const posInput = await screen.findByTestId('nav-label-input-/pos');
    fireEvent.change(posInput, { target: { value: 'Quầy Thu Ngân' } });

    const resetInvoicesBtn = await screen.findByTestId('nav-label-reset-/invoices');
    await user.click(resetInvoicesBtn);

    await user.click(screen.getByTestId('store-settings-save-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          navLabels: { '/pos': 'Quầy Thu Ngân' },
        }),
      );
    });
  });

  it('updates live OfficialReceiptSlip preview in Phiếu in tab when editing header, footer, and showLogo', async () => {
    const user = userEvent.setup();
    const initial = makeServerSettings({
      assets: { logo: '2026-11-15T10:00:00.000Z', favicon: null, qrLogo: null },
      receipt: {
        printName: 'QUÁN A',
        address: 'Số 1 Đường X',
        phone: '0901',
        footerNote: 'Dòng A\nDòng B',
        showLogo: false,
      },
    });
    renderStoreSettingsPage(initial);

    await user.click(await screen.findByRole('tab', { name: /Phiếu in/i }));

    const preview = await screen.findByTestId('receipt-live-preview');
    expect(preview).toHaveTextContent('QUÁN A');
    expect(screen.queryByTestId('official-receipt-logo')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-receipt-print-name'), {
      target: { value: 'QUÁN MỚI LIVE' },
    });
    fireEvent.change(screen.getByTestId('input-receipt-footer-note'), {
      target: { value: 'Hẹn gặp lại\nHotline: 1900' },
    });
    await user.click(screen.getByTestId('checkbox-receipt-show-logo'));

    expect(preview).toHaveTextContent('QUÁN MỚI LIVE');
    expect(preview).toHaveTextContent('Hẹn gặp lại');
    expect(preview).toHaveTextContent('Hotline: 1900');
    expect(screen.getByTestId('official-receipt-logo')).toBeInTheDocument();
  });

  it('shows 409 conflict banner on optimistic concurrency error and reloads server config (AC-14.6)', async () => {
    const user = userEvent.setup();
    const initial = makeServerSettings({
      storeName: 'Tên Cũ',
      updatedAt: '2026-11-15T10:00:00.000Z',
    });
    const fresher = makeServerSettings({
      storeName: 'Tên Từ Người Khác',
      updatedAt: '2026-11-15T10:30:00.000Z',
    });

    const putSpy = vi.spyOn(apiClient, 'put').mockRejectedValueOnce(
      new ApiClientError({
        statusCode: 409,
        error: 'Conflict',
        code: ErrorCodes.STORE_SETTINGS_CONFLICT,
        message: 'Cấu hình đã bị người khác thay đổi, tải lại?',
      }),
    );

    const { getSpy, queryClient } = renderStoreSettingsPage(initial);
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    const nameInput = await screen.findByTestId('input-store-name');
    fireEvent.change(nameInput, { target: { value: 'Tên Của Tôi' } });
    act(() => { queryClient.setQueryData(['admin-store-settings'], fresher); });
    expect(nameInput).toHaveValue('Tên Của Tôi');
    await user.click(screen.getByTestId('store-settings-save-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/settings', expect.objectContaining({ expectedUpdatedAt: initial.updatedAt, storeName: 'Tên Của Tôi' }));
      expect(screen.getByTestId('store-settings-conflict-banner')).toHaveTextContent(
        /Cấu hình đã bị người khác thay đổi, tải lại\?/i,
      );
    });

    getSpy.mockResolvedValue(fresher);
    await user.click(screen.getByTestId('store-settings-conflict-reload-btn'));

    await waitFor(() => {
      expect((screen.getByTestId('input-store-name') as HTMLInputElement).value).toBe(
        'Tên Từ Người Khác',
      );
    });
    expect(screen.queryByTestId('store-settings-conflict-banner')).not.toBeInTheDocument();
  });

  it('renders script strings as safe plain text and enforces read-only mode without update permission (AC-14.12)', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'viewer-token',
      user: {
        id: 2,
        employeeId: 2,
        username: 'viewer01',
        fullName: 'Nhân viên Xem',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          settings: { view: true, update: false },
        }),
      },
    });

    const xss = '<script>alert(1)</script>';
    const { container } = renderStoreSettingsPage(
      makeServerSettings({
        storeName: xss,
        receipt: { ...DEFAULT_STORE_SETTINGS.receipt, printName: xss },
      }),
    );

    await waitFor(() => {
      expect((screen.getByTestId('input-store-name') as HTMLInputElement).value).toBe(xss);
    });
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByTestId('store-settings-save-btn')).toBeDisabled();
    await userEvent.click(screen.getByRole('tab', { name: /Phiếu in/i }));
    expect(await screen.findByTestId('print-font-family-official')).toBeDisabled();
  });

  it('configures primaryTextColor, accentTextColor and priceColor Light/Dark overrides, WCAG warning, and auto dark mode (Story 15)', async () => {
    const user = userEvent.setup();
    const saved = makeServerSettings({
      updatedAt: '2026-11-15T12:15:00.000Z',
      primaryTextColor: { light: '#FFFFFF', dark: '#FFFFFF' },
      accentTextColor: { light: '#FDE047', dark: '#60A5FA' },
      priceColor: { light: '#0D9488', dark: null },
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(saved);

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Giao diện/i }));

    await user.click(screen.getByTestId('primary-text-mode-custom'));
    expect(screen.getByTestId('input-primary-text-light-hex')).toHaveValue('#FFFFFF');
    expect(screen.getByTestId('primary-text-dark-auto-badge')).toHaveTextContent(/Giống chế độ Sáng/);
    expect(screen.getByTestId('theme-preview-dark-primary-btn')).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    });
    expect(screen.getByTestId('theme-preview-dark-nav-pill')).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    });
    fireEvent.change(screen.getByTestId('input-primary-text-dark-hex'), {
      target: { value: '#FFFFFF' },
    });

    await user.click(screen.getByTestId('accent-text-mode-custom'));
    const accentLightInput = screen.getByTestId('input-accent-text-light-hex');
    fireEvent.change(accentLightInput, { target: { value: '#FDE047' } });

    expect(screen.getByTestId('accent-text-light-wcag-warning')).toBeInTheDocument();
    expect(screen.getByTestId('accent-text-dark-auto-badge')).toHaveTextContent(/\+4%/);

    const accentDarkInput = screen.getByTestId('input-accent-text-dark-hex');
    fireEvent.change(accentDarkInput, { target: { value: '#60A5FA' } });
    expect(screen.getByTestId('accent-text-dark-auto-btn')).toBeInTheDocument();

    await user.click(screen.getByTestId('price-mode-custom'));
    fireEvent.change(screen.getByTestId('input-price-light-hex'), {
      target: { value: '#0D9488' },
    });
    expect(screen.getByTestId('theme-preview-light-price')).toHaveStyle({
      color: 'rgb(13, 148, 136)',
    });

    const saveBtn = screen.getByTestId('store-settings-save-btn');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          primaryTextColor: { light: '#FFFFFF', dark: '#FFFFFF' },
          accentTextColor: { light: '#FDE047', dark: '#60A5FA' },
          priceColor: { light: '#0D9488', dark: null },
        }),
      );
    });
  });

  it('edits pageHeaders title and subtitle per route and clears both on row reset (Story 15)', async () => {
    const user = userEvent.setup();
    const initial = makeServerSettings({
      navLabels: { '/invoices': 'Sổ Hoá Đơn' },
      pageHeaders: {
        '/invoices': { title: 'Tiêu đề Cũ', subtitle: 'Mô tả Cũ' },
      },
    });
    const saved = makeServerSettings({
      updatedAt: '2026-11-15T12:20:00.000Z',
      navLabels: { '/pos': 'Quầy Thu Ngân' },
      pageHeaders: {
        '/pos': { title: 'Quầy Bán Hàng Mì Cay', subtitle: 'Tạo đơn nhanh & Tách bếp' },
      },
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(saved);

    renderStoreSettingsPage(initial);
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Menu & Tiêu đề trang/i }));

    fireEvent.change(screen.getByTestId('nav-label-input-/pos'), {
      target: { value: 'Quầy Thu Ngân' },
    });
    fireEvent.change(screen.getByTestId('page-title-input-/pos'), {
      target: { value: 'Quầy Bán Hàng Mì Cay' },
    });
    fireEvent.change(screen.getByTestId('page-subtitle-input-/pos'), {
      target: { value: 'Tạo đơn nhanh & Tách bếp' },
    });

    await user.click(screen.getByTestId('nav-label-reset-/invoices'));
    await user.click(screen.getByTestId('store-settings-save-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          navLabels: { '/pos': 'Quầy Thu Ngân' },
          pageHeaders: {
            '/pos': { title: 'Quầy Bán Hàng Mì Cay', subtitle: 'Tạo đơn nhanh & Tách bếp' },
          },
        }),
      );
    });
  });

  it('switches across all 5 thermal print templates, live-updates 80mm previews, enforces locked invariants, resets single template, and saves printTemplates (Story 16)', async () => {
    const user = userEvent.setup();
    const saved = makeServerSettings({
      updatedAt: '2026-11-15T12:30:00.000Z',
      printTemplates: {
        ...DEFAULT_STORE_SETTINGS.printTemplates,
        provisional: {
          fontFamily: 'roboto',
          title: 'PHIẾU TẠM BÀN',
          footerNote: '',
          fontSizePt: 8,
          blocks: {
            ...DEFAULT_STORE_SETTINGS.printTemplates.provisional.blocks,
            discountLine: true,
            bankInfo: false,
          },
        },
        kitchen: {
          ...DEFAULT_STORE_SETTINGS.printTemplates.kitchen,
          fontSizePt: 10,
        },
        tableTransfer: {
          ...DEFAULT_STORE_SETTINGS.printTemplates.tableTransfer,
          footerNote: 'Đưa từ {fromTable} qua {toTable} gấp!',
        },
      },
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(saved);

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Phiếu in/i }));

    // Default Official breakdown visible, then hide paymentBreakdown
    const preview = screen.getByTestId('receipt-live-preview');
    expect(preview).toHaveAttribute('data-preview-template', 'official');
    expect(screen.getByTestId('official-receipt-payment-breakdown')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('print-font-family-official'), { key: 'Enter' });
    await user.click(screen.getByRole('option', { name: 'Be Vietnam Pro' }));
    expect(preview.querySelector('[data-thermal-font]')).toHaveAttribute('data-thermal-font', 'be-vietnam-pro');


    // Switch to Provisional + VietQR
    await user.click(screen.getByTestId('print-template-tab-provisional'));
    expect(preview).toHaveAttribute('data-preview-template', 'provisional');
    expect(screen.getByTestId('print-font-family-provisional')).toHaveTextContent('Roboto');
    expect(screen.queryByTestId('provisional-discount-line')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('input-print-title-provisional'), {
      target: { value: 'PHIẾU TẠM BÀN' },
    });
    await user.click(screen.getByTestId('print-block-provisional-discountLine'));
    await user.click(screen.getByTestId('print-block-provisional-bankInfo'));
    expect(screen.getByText('PHIẾU TẠM BÀN')).toBeInTheDocument();
    expect(screen.getByTestId('provisional-discount-line')).toBeInTheDocument();
    expect(screen.queryByTestId('provisional-vietqr-bank-account')).not.toBeInTheDocument();
    // Hard Invariant 4: VietQR image cannot be turned off
    expect(await screen.findByTestId('provisional-vietqr-image')).toBeInTheDocument();

    // Switch to Kitchen split (previewed 1 station at a time across Bếp Nấu / Bếp Chiên / Quầy Nước)
    await user.click(screen.getByTestId('print-template-tab-kitchen'));
    expect(preview).toHaveAttribute('data-preview-template', 'kitchen');
    await user.click(screen.getByTestId('print-fontsize-preset-kitchen-10'));
    expect(screen.getByTestId('kitchen-ticket-page-BEP_NAU')).toHaveAttribute('data-font-size-pt', '10');
    expect(screen.queryByTestId('kitchen-ticket-page-BEP_CHIEN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kitchen-ticket-page-PHA_CHE')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('kitchen-preview-station-BEP_CHIEN'));
    expect(screen.getByTestId('kitchen-ticket-page-BEP_CHIEN')).toHaveAttribute('data-font-size-pt', '10');
    expect(screen.queryByTestId('kitchen-ticket-page-BEP_NAU')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('kitchen-preview-station-PHA_CHE'));
    expect(screen.getByTestId('kitchen-ticket-page-PHA_CHE')).toHaveAttribute('data-font-size-pt', '10');
    expect(screen.queryByTestId('kitchen-ticket-page-BEP_CHIEN')).not.toBeInTheDocument();

    // Switch to Kitchen cancel & test per-template reset
    await user.click(screen.getByTestId('print-template-tab-kitchenCancel'));
    expect(preview).toHaveAttribute('data-preview-template', 'kitchenCancel');
    fireEvent.keyDown(screen.getByTestId('print-font-family-kitchenCancel'), { key: 'Enter' });
    await user.click(screen.getByRole('option', { name: /^Serif$/ }));

    fireEvent.change(screen.getByTestId('input-print-title-kitchenCancel'), {
      target: { value: 'HUỶ ĐỒ GẤP' },
    });
    expect(preview).toHaveTextContent('HUỶ ĐỒ GẤP');
    await user.click(screen.getByTestId('reset-print-template-kitchenCancel'));
    expect(preview).toHaveTextContent('PHIẾU BÁO HUỶ MÓN');

    // Switch to Table transfer & test {fromTable} -> {toTable}
    await user.click(screen.getByTestId('print-template-tab-tableTransfer'));
    expect(preview).toHaveAttribute('data-preview-template', 'tableTransfer');
    fireEvent.change(screen.getByTestId('input-print-footer-tableTransfer'), {
      target: { value: 'Đưa từ {fromTable} qua {toTable} gấp!' },
    });
    expect(screen.getByTestId('table-transfer-footer')).toHaveTextContent(
      'Đưa từ BÀN 03 qua BÀN 08 gấp!',
    );

    await user.click(screen.getByTestId('store-settings-save-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          printTemplates: expect.objectContaining({
            official: expect.objectContaining({ fontFamily: 'be-vietnam-pro' }),
            provisional: expect.objectContaining({
              title: 'PHIẾU TẠM BÀN',
              blocks: expect.objectContaining({ discountLine: true, bankInfo: false }),
            }),
            kitchen: expect.objectContaining({ fontSizePt: 10 }),
            kitchenCancel: DEFAULT_STORE_SETTINGS.printTemplates.kitchenCancel,
            tableTransfer: expect.objectContaining({
              footerNote: 'Đưa từ {fromTable} qua {toTable} gấp!',
            }),
          }),
        }),
      );
    });
  });

  it('syncs QR_CUSTOMER message overrides between Trang khách QR tab and Thông báo tab, previews toast, and saves sparse map (Story 17)', async () => {
    const user = userEvent.setup();
    const customNotice = 'Đổi bàn xin báo lễ tân tại quầy giúp quán ạ!';
    const saved = makeServerSettings({
      updatedAt: '2026-11-15T13:00:00.000Z',
      qrMessages: {
        'qr.banner.tableMoveNotice': { title: customNotice },
      },
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(saved);

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Trang khách QR/i }));
    expect(screen.getByTestId('message-editor-QR_CUSTOMER')).toBeInTheDocument();

    const qrBannerInput = screen.getByTestId(
      'msg-title-input-qr.banner.tableMoveNotice',
    ) as HTMLInputElement;
    fireEvent.change(qrBannerInput, { target: { value: customNotice } });

    await user.click(screen.getByTestId('msg-preview-qr.banner.tableMoveNotice'));
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe(customNotice);

    await user.click(screen.getByRole('tab', { name: /Thông báo/i }));
    expect(screen.getByTestId('message-catalog-editor')).toBeInTheDocument();
    expect(
      screen.getByTestId('msg-title-input-qr.banner.tableMoveNotice'),
    ).toHaveValue(customNotice);

    await user.click(screen.getByTestId('store-settings-save-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          messages: {
            'qr.banner.tableMoveNotice': { title: customNotice },
          },
        }),
      );
    });
  });

  it('blocks save on invalid {var} placeholder, inserts allowed {var} chip, resets single item, and renders XSS input safely as plain text (Story 17)', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(apiClient, 'put');
    const defaultSubmitTitle = MESSAGE_CATALOG_BY_KEY.get('qr.order.submitSuccess')!.defaultTitle;

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Thông báo/i }));

    const submitTitleInput = screen.getByTestId(
      'msg-title-input-qr.order.submitSuccess',
    ) as HTMLInputElement;

    // 1. Invalid placeholder blocks save and shows inline error + summary banner
    fireEvent.change(submitTitleInput, {
      target: { value: 'Đơn {invalidVar} tại {tableLabel}' },
    });
    expect(screen.getByTestId('msg-error-qr.order.submitSuccess')).toHaveTextContent(/\{invalidVar\}/);
    expect(screen.getByTestId('store-settings-messages-validation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('store-settings-save-btn')).toBeDisabled();
    expect(putSpy).not.toHaveBeenCalled();

    // 2. Replace with plain prefix and click {var} chip to insert {batchNo}
    fireEvent.change(submitTitleInput, { target: { value: 'Đơn lượt ' } });
    await user.click(screen.getByTestId('msg-var-qr.order.submitSuccess-batchNo'));
    expect(submitTitleInput.value).toContain('{batchNo}');
    expect(screen.queryByTestId('msg-error-qr.order.submitSuccess')).not.toBeInTheDocument();
    expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();

    // 3. Click single-item reset restores catalog default
    await user.click(screen.getByTestId('msg-reset-qr.order.submitSuccess'));
    expect(submitTitleInput).toHaveValue(defaultSubmitTitle);

    // 4. XSS string stays literal text and never injects executable <script> DOM
    const xssPayload = '<script>window.__xss=1</script> Cảnh báo mới';
    fireEvent.change(screen.getByTestId('msg-title-input-qr.banner.tableMoveNotice'), {
      target: { value: xssPayload },
    });
    await user.click(screen.getByTestId('msg-preview-qr.banner.tableMoveNotice'));
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe(xssPayload);
    expect(document.querySelector('script')).toBeNull();
  });

  it('edits navGroupLabels, reorders groups & routes synchronously inside Menu & Tiêu đề trang tab, submits payload, and resets structure', async () => {
    const user = userEvent.setup();
    const saved = makeServerSettings({
      updatedAt: '2026-11-15T13:00:00.000Z',
      navGroupLabels: { sales: 'Quầy Bán & Ưu Đãi' },
      navGroupOrder: ['finance', 'sales', 'hr', 'system'],
      navOrder: [
        '/discounts',
        '/pos',
        '/menu',
        '/invoices',
        '/cashflow',
        '/payment-qr',
        '/inventory',
        '/employees',
        '/schedules',
        '/payroll',
        '/master-data',
        '/rbac',
        '/settings',
      ],
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(saved);

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Menu & Tiêu đề trang/i }));

    // Initial group order: sales, finance, hr, system
    const getGroupOrderInDom = () =>
      Array.from(document.querySelectorAll('[data-testid^="nav-group-card-"]'))
        .map((el) => el.getAttribute('data-testid'))
        .filter((id) => id !== 'nav-group-card-standalone');

    expect(getGroupOrderInDom()).toEqual([
      'nav-group-card-sales',
      'nav-group-card-finance',
      'nav-group-card-hr',
      'nav-group-card-system',
    ]);
    expect(screen.getByTestId('nav-group-card-standalone')).toBeInTheDocument();

    // Edit sales group label
    fireEvent.change(screen.getByTestId('nav-group-label-input-sales'), {
      target: { value: 'Quầy Bán & Ưu Đãi' },
    });

    // Move finance up -> finance moves before sales synchronously
    await user.click(screen.getByTestId('nav-group-move-up-finance'));
    expect(getGroupOrderInDom()).toEqual([
      'nav-group-card-finance',
      'nav-group-card-sales',
      'nav-group-card-hr',
      'nav-group-card-system',
    ]);

    // Move /discounts up twice inside sales -> /discounts, /pos, /menu, /invoices
    await user.click(screen.getByTestId('nav-move-up-/discounts'));
    await user.click(screen.getByTestId('nav-move-up-/discounts'));

    const salesRoutesInDom = Array.from(
      screen.getByTestId('nav-group-card-sales').querySelectorAll('[data-testid^="nav-route-row-"]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(salesRoutesInDom).toEqual([
      'nav-route-row-/discounts',
      'nav-route-row-/pos',
      'nav-route-row-/menu',
      'nav-route-row-/invoices',
    ]);

    await user.click(screen.getByTestId('store-settings-save-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          navGroupLabels: { sales: 'Quầy Bán & Ưu Đãi' },
          navGroupOrder: ['finance', 'sales', 'hr', 'system'],
          navOrder: expect.arrayContaining(['/discounts', '/pos', '/menu', '/invoices']),
        }),
      );
    });

    const submittedPayload = putSpy.mock.calls[0]?.[1] as { navOrder: string[] };
    expect(submittedPayload.navOrder.slice(0, 4)).toEqual([
      '/discounts',
      '/pos',
      '/menu',
      '/invoices',
    ]);

    // Global reset structure restores original order & clears group labels
    await user.click(screen.getByTestId('nav-reset-structure-btn'));
    expect(getGroupOrderInDom()).toEqual([
      'nav-group-card-sales',
      'nav-group-card-finance',
      'nav-group-card-hr',
      'nav-group-card-system',
    ]);
    expect(screen.getByTestId('nav-group-label-input-sales')).toHaveValue('');
  });

  it('customizes qrCard copy, accent color, showLogo/showLinkText toggles with live PNG/80mm preview and saves to settings API', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => {
      const savedFields = { ...(body as Record<string, unknown>) };
      delete savedFields.expectedUpdatedAt;
      delete savedFields.messages;
      return {
        ...makeServerSettings(),
        ...(savedFields as Partial<PublicStoreSettingsResponse>),
        updatedAt: '2026-11-22T11:00:00.000Z',
      };
    });

    renderStoreSettingsPage(
      makeServerSettings({
        brandColor: '#059669',
        assets: { logo: 'v-logo', favicon: null, qrLogo: 'v-qr-logo' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    await user.click(screen.getByRole('tab', { name: /Trang khách QR/i }));
    expect(screen.getByTestId('qr-card-customizer')).toBeInTheDocument();

    const tableSubtitleInput = screen.getByTestId('input-qr-card-table-subtitle');
    fireEvent.change(tableSubtitleInput, { target: { value: 'Quét gọi món tại chỗ cực nhanh' } });
    fireEvent.change(screen.getByTestId('input-qr-card-takeaway-title'), {
      target: { value: 'Đặt Mang Về Online' },
    });
    fireEvent.change(screen.getByTestId('input-qr-card-footer-text'), {
      target: { value: 'Mở Zalo quét hoặc gõ link:' },
    });

    await user.click(screen.getByTestId('qr-card-use-brand-color-btn'));
    expect(screen.getByTestId('input-qr-card-accent-color')).toHaveValue('#059669');

    await user.click(screen.getByTestId('checkbox-qr-card-show-logo'));
    expect(screen.getByTestId('qr-preview-logo-img')).toBeInTheDocument();

    expect(screen.getByTestId('qr-preview-link-text')).toHaveTextContent('/q/ban01-zry8');
    await user.click(screen.getByTestId('checkbox-qr-card-show-link'));
    expect(screen.queryByTestId('qr-preview-link-text')).not.toBeInTheDocument();

    // Verify Takeaway + 80mm slip live preview toggle
    await user.click(screen.getByTestId('qr-preview-scope-takeaway'));
    await user.click(screen.getByTestId('qr-preview-format-thermal'));
    expect(screen.getByTestId('qr-card-live-preview-thermal')).toHaveTextContent('Đặt Mang Về Online');
    expect(screen.getByTestId('qr-card-live-preview-thermal')).toHaveTextContent(
      'Mở Zalo quét hoặc gõ link:',
    );
    expect(screen.queryByTestId('qr-preview-thermal-link-text')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('store-settings-save-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          qrCard: expect.objectContaining({
            tableSubtitle: 'Quét gọi món tại chỗ cực nhanh',
            takeawayTitle: 'Đặt Mang Về Online',
            footerText: 'Mở Zalo quét hoặc gõ link:',
            accentColor: '#059669',
            showLogo: true,
            showLinkText: false,
          }),
        }),
      );
    });
  });

  it('switches takeawayLabelFormat between NUMBER and LETTER, shows cycle preview, and persists to API', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(
      makeServerSettings({
        updatedAt: '2026-11-27T09:00:00.000Z',
        takeawayLabelFormat: 'LETTER',
      }),
    );

    renderStoreSettingsPage(makeServerSettings({ takeawayLabelFormat: 'NUMBER' }));
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    const letterBtn = screen.getByTestId('takeaway-format-letter');
    const numberBtn = screen.getByTestId('takeaway-format-number');
    expect(numberBtn).toHaveAttribute('aria-pressed', 'true');
    expect(letterBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(letterBtn);
    expect(letterBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('settings-takeaway-format-section')).toHaveTextContent('#A → #D');

    await user.click(screen.getByTestId('store-settings-save-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          takeawayLabelFormat: 'LETTER',
        }),
      );
    });
  });

  it('hides cash drawer kick button on Settings Hardware tab for read-only settings.view users and shows it when pos.openCashDrawer is granted', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setAuth({
      accessToken: 'viewer-token',
      user: {
        id: 8,
        employeeId: 8,
        username: 'adminview',
        fullName: 'Quản lý chỉ xem',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          settings: { view: true, update: false },
          pos: { openCashDrawer: false },
        }),
      },
    });

    const firstRender = renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('input-store-name')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Phiếu in/i }));
    expect(await screen.findByTestId('printer-hardware-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('btn-test-thermal-print')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-test-cash-drawer-kick')).not.toBeInTheDocument();
    firstRender.unmount();

    // Now grant pos.openCashDrawer explicitly while settings.update stays false
    useAuthStore.getState().setAuth({
      accessToken: 'drawer-token',
      user: {
        id: 12,
        employeeId: 12,
        username: 'cashier_drawer',
        fullName: 'Thu Ngân Két',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          settings: { view: true, update: false },
          pos: { openCashDrawer: true },
        }),
      },
    });

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('input-store-name')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /Phiếu in/i }));
    expect(await screen.findByTestId('btn-test-cash-drawer-kick')).toBeInTheDocument();
  });

  it('configures DisplayScalePanel global/QR/perPath overrides, resets to 100%, and customizes kitchen thermal font size warning (>12pt)', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(
      makeServerSettings({
        updatedAt: '2026-11-27T11:30:00.000Z',
        displayScale: {
          globalPercent: 125,
          qrOrderPercent: 110,
          perPath: { '/pos': 140 },
        },
      }),
    );

    renderStoreSettingsPage();
    await waitFor(() => {
      expect(screen.getByTestId('store-settings-save-btn')).toBeEnabled();
    });

    // Switch to Menu & Tiêu đề trang -> configure DisplayScalePanel
    await user.click(screen.getByRole('tab', { name: /Menu & Tiêu đề trang/i }));
    expect(screen.getByTestId('display-scale-panel')).toBeInTheDocument();

    await user.click(screen.getByTestId('display-scale-global-preset-125'));
    expect(screen.getByTestId('display-scale-global-value')).toHaveTextContent('125%');

    fireEvent.change(screen.getByTestId('display-scale-qr-select'), { target: { value: '110' } });
    fireEvent.change(screen.getByTestId('display-scale-path-pos'), { target: { value: '140' } });

    await user.click(screen.getByTestId('store-settings-save-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/settings',
        expect.objectContaining({
          displayScale: {
            globalPercent: 125,
            qrOrderPercent: 110,
            perPath: { '/pos': 140 },
          },
        }),
      );
    });

    // Reset reverts everything back to 100% and empty perPath
    await user.click(screen.getByTestId('btn-reset-display-scale'));
    expect(screen.getByTestId('display-scale-global-value')).toHaveTextContent('100%');
    expect(screen.getByTestId('display-scale-qr-select')).toHaveValue('100');

    // Switch to Phiếu in & Phần cứng -> verify out-of-range kitchen font size clamp warning & preset/reset
    await user.click(screen.getByRole('tab', { name: /Phiếu in/i }));
    await user.click(screen.getByTestId('print-template-tab-kitchen'));
    const fontInput = screen.getByTestId('print-fontsize-input-kitchen');
    fireEvent.change(fontInput, { target: { value: '99' } });
    fireEvent.blur(fontInput);
    expect(screen.getByTestId('print-fontsize-warning-kitchen')).toHaveTextContent(
      /Đã giới hạn về cỡ tối đa/,
    );

    await user.click(screen.getByTestId('print-fontsize-preset-kitchen-14'));
    expect(screen.queryByTestId('print-fontsize-warning-kitchen')).not.toBeInTheDocument();
    expect(fontInput).toHaveValue(14);

    await user.click(screen.getByTestId('reset-print-template-kitchen'));
    expect(fontInput).not.toHaveValue(14);
  });
});
