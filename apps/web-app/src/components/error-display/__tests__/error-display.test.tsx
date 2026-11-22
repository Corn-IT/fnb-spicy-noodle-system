import { HTTP_ERROR_CATALOG, UserPermissionsSchema } from '@fnb/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppShellRouteErrorElement,
  ErrorGalleryDialog,
  NotFoundPage,
  normalizeClientError,
  resolveStaffHomeDestination,
  RootRouteErrorElement,
  SystemErrorView,
} from '@/components/error-display';
import { RbacRouteGuard } from '@/components/layout/rbac-route-guard';
import { LoginPage } from '@/features/profile';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { QueryProvider, queryClient } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/components/ui/toast';

function renderWithQueryAndRouter(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  return render(
    <QueryProvider>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {ui}
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('System Error Display & Recovery Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.getState().clearAuth();
    useToastStore.getState().clearToasts();
  });

  it('normalizes every HTTP error code, Zod fieldErrors (422), 429 retryAfter, proxy HTML, chunk load, and network errors without leaking stacks', () => {
    const err422 = new ApiClientError({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Dữ liệu không hợp lệ',
      code: 'VALIDATION_FAILED',
      details: {
        fieldErrors: {
          orderType: ['Phải là DINE_IN hoặc TAKEAWAY'],
          items: ['Cần tối thiểu 1 món'],
        },
      },
      requestId: '11111111-1111-4111-8111-111111111111',
    });

    const normalized422 = normalizeClientError(err422, { path: '/pos' });
    expect(normalized422.key).toBe('422');
    expect(normalized422.requestId).toBe('11111111-1111-4111-8111-111111111111');
    expect(normalized422.fieldErrors).toEqual([
      { field: 'orderType', messages: ['Phải là DINE_IN hoặc TAKEAWAY'] },
      { field: 'items', messages: ['Cần tối thiểu 1 món'] },
    ]);

    const err429 = new ApiClientError({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Thao tác quá nhanh',
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfterSeconds: 12 },
    });
    const normalized429 = normalizeClientError(err429);
    expect(normalized429.key).toBe('429');
    expect(normalized429.reason).toContain('12 giây');

    const chunkErr = new TypeError('Failed to fetch dynamically imported module: https://pos.vn/assets/pos.js');
    expect(normalizeClientError(chunkErr).key).toBe('CHUNK_LOAD_ERROR');

    const networkErr = new ApiClientError({
      statusCode: 0,
      error: 'Network Error',
      code: 'NETWORK_ERROR',
      message: 'Mất kết nối tới máy chủ',
    });
    expect(normalizeClientError(networkErr).key).toBe('NETWORK_ERROR');

    const runtimeErr = new Error('Sensitive stack token secret');
    runtimeErr.stack = 'Error: secret\n at InternalDb.query (prisma.ts:44)';
    const normalizedCrash = normalizeClientError(runtimeErr);
    expect(normalizedCrash.key).toBe('RUNTIME_CRASH');
    expect(normalizedCrash.reason).not.toContain('InternalDb.query');
  });

  it('parses non-JSON 502 Caddy/Proxy HTML responses into crisp Vietnamese ApiClientError with X-Request-Id header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: {
          'Content-Type': 'text/html',
          'X-Request-Id': '22222222-2222-4222-8222-222222222222',
        },
      }),
    );

    await expect(apiClient.get('/api/v1/pos/tables')).rejects.toMatchObject({
      statusCode: 502,
      requestId: '22222222-2222-4222-8222-222222222222',
      message: expect.stringContaining('502'),
    });
  });

  it('renders 2-layer SystemErrorView with collapsible Technical Details & clipboard trace copy without leaking stack trace', () => {
    const clipboardMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardMock },
      configurable: true,
    });

    const err = new ApiClientError({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Lỗi kết nối cơ sở dữ liệu',
      requestId: '33333333-3333-4333-8333-333333333333',
    });

    const onRetry = vi.fn();
    renderWithQueryAndRouter(<SystemErrorView error={err} onRetry={onRetry} />, ['/invoices']);

    expect(screen.getByTestId('error-status-badge')).toHaveTextContent('500 Internal Server Error');
    expect(screen.getByText('Vì sao lỗi này xảy ra?')).toBeInTheDocument();
    expect(screen.getByText('Hướng dẫn xử lý & Quay lại')).toBeInTheDocument();
    expect(screen.queryByTestId('error-tech-details-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('error-tech-details-toggle'));
    const panel = screen.getByTestId('error-tech-details-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('33333333-3333-4333-8333-333333333333');
    expect(panel).toHaveTextContent('/invoices');

    fireEvent.click(screen.getByTestId('error-copy-trace-btn'));
    expect(clipboardMock).toHaveBeenCalledWith(
      expect.stringContaining('33333333-3333-4333-8333-333333333333'),
    );

    fireEvent.click(screen.getByTestId('error-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('resolves smart home routes by role permissions cleanly on 403 Forbidden without clearing auth', () => {
    const cashierPerms = UserPermissionsSchema.parse({
      pos: { view: true },
    });
    const invoiceOnlyPerms = UserPermissionsSchema.parse({
      invoices: { view: true },
    });
    const emptyPerms = UserPermissionsSchema.parse({});

    expect(
      resolveStaffHomeDestination({
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: cashierPerms,
      }).path,
    ).toBe('/pos');

    expect(
      resolveStaffHomeDestination({
        id: 3,
        employeeId: 13,
        username: 'auditor',
        isSuperAdmin: false,
        permissions: invoiceOnlyPerms,
      }).path,
    ).toBe('/invoices');

    expect(
      resolveStaffHomeDestination({
        id: 4,
        employeeId: 14,
        username: 'minimal',
        isSuperAdmin: false,
        permissions: emptyPerms,
      }).path,
    ).toBe('/profile');

    useAuthStore.getState().setAuth({
      accessToken: 'cashier-tok',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: cashierPerms,
      },
    });

    renderWithQueryAndRouter(
      <Routes>
        <Route
          path="/rbac"
          element={
            <RbacRouteGuard module="rbac">
              <div>Secret RBAC</div>
            </RbacRouteGuard>
          }
        />
        <Route path="/pos" element={<h1>Màn hình POS</h1>} />
      </Routes>,
      ['/rbac'],
    );

    expect(screen.getByTestId('rbac-forbidden-screen')).toBeInTheDocument();
    expect(screen.getByText('@cashier01')).toBeInTheDocument();
    expect(screen.getByTestId('error-home-btn')).toHaveTextContent('Về Bán hàng POS');

    fireEvent.click(screen.getByTestId('error-home-btn'));
    expect(screen.getByRole('heading', { name: 'Màn hình POS' })).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('cashier-tok');
  });

  it('isolates QR Guest error screens cleanly without exposing staff links', () => {
    renderWithQueryAndRouter(<NotFoundPage variant="guest" />, ['/qr/']);

    expect(screen.getByTestId('not-found-page')).toHaveAttribute('data-error-key', '404');
    expect(screen.getByTestId('error-retry-btn')).toHaveTextContent('Tải lại thực đơn');
    expect(screen.queryByTestId('error-home-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-back-btn')).not.toBeInTheDocument();
  });

  it('handles 404 wildcard routes and child route chunk crashes inside RouterProvider', async () => {
    function BrokenPage(): React.ReactElement {
      throw new TypeError('Failed to fetch dynamically imported module: chunk-123.js');
    }

    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <RootRouteErrorElement />,
          children: [
            {
              errorElement: <AppShellRouteErrorElement />,
              children: [
                { path: 'broken', element: <BrokenPage /> },
                { path: '*', element: <NotFoundPage variant="section" /> },
              ],
            },
          ],
        },
      ],
      {
        initialEntries: ['/duong-dan-sai-404'],
        future: { v7_relativeSplatPath: true },
      },
    );

    render(
      <QueryProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </QueryProvider>,
    );

    expect(await screen.findByTestId('not-found-page')).toHaveAttribute('data-error-key', '404');
    expect(screen.getByText(/Không tìm thấy trang hoặc dữ liệu/i)).toBeInTheDocument();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await router.navigate('/broken');
    });
    errSpy.mockRestore();
    await waitFor(() => {
      expect(screen.getByTestId('route-error-section')).toHaveAttribute(
        'data-error-key',
        'CHUNK_LOAD_ERROR',
      );
    });
    expect(screen.getByTestId('error-retry-btn')).toHaveTextContent('Tải lại trang mới');
  });

  it('displays explicit 401 reason banner on LoginPage when redirected from protected route or expired session', () => {
    render(
      <QueryProvider>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/login',
              state: { authNotice: 'SESSION_EXPIRED', from: { pathname: '/invoices' } },
            },
          ]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <LoginPage />
        </MemoryRouter>
      </QueryProvider>,
    );

    const banner = screen.getByTestId('login-401-notice');
    expect(banner).toHaveTextContent('401 — Phiên đăng nhập đã hết hạn hoặc bị thu hồi');
  });

  it('allows previewing all 18 HTTP/System error screens and Guest/Staff modes in ErrorGalleryDialog', () => {
    renderWithQueryAndRouter(
      <ErrorGalleryDialog open onOpenChange={() => {}} />,
      ['/settings'],
    );

    expect(screen.getByTestId('error-gallery-dialog')).toBeInTheDocument();
    for (const entry of HTTP_ERROR_CATALOG) {
      expect(screen.getByTestId(`error-gallery-chip-${entry.key}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('error-gallery-chip-502'));
    expect(screen.getByTestId('error-gallery-preview-card')).toHaveAttribute(
      'data-error-key',
      '502',
    );
    expect(screen.getByText('502 Bad Gateway')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('error-gallery-audience-guest'));
    expect(screen.getByTestId('error-gallery-preview-card')).toHaveTextContent(
      'Máy chủ quán đang khởi động lại',
    );
  });

  it('preserves cached data and dispatches destructive toast when background QueryCache refetch fails', async () => {
    queryClient.setQueryData(['test-bg-fail'], { ok: true });
    const existingQuery = queryClient.getQueryCache().find({ queryKey: ['test-bg-fail'] });
    expect(existingQuery).toBeDefined();

    const onError = queryClient.getQueryCache().config.onError;
    onError?.(
      new ApiClientError({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Hệ thống đang bảo trì',
      }),
      existingQuery as never,
    );

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.description?.includes('vẫn được giữ nguyên'))).toBe(true);
  });
});
