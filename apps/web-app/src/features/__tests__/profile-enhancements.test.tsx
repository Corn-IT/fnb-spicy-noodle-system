import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { ProfilePage, type JoinedUserProfile } from '@/features/profile';
import { LoginPage } from '@/features/profile/components/login-page';
import { CreateUserDialog } from '@/features/rbac/components/create-user-dialog';
import { PermissionsDrawer } from '@/features/rbac/components/permissions-drawer';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const makeProfile = (overrides: Partial<JoinedUserProfile> = {}): JoinedUserProfile => ({
  id: 2,
  username: 'cashier01',
  isSuperAdmin: false,
  permissions: UserPermissionsSchema.parse({
    pos: { view: true, checkout: true },
    invoices: { view: true },
  }),
  uiPreferences: { theme: 'light', sidebarWidth: 260, columnWidths: {}, displayScale: { perPath: {} }, navOrder: [], navGroupOrder: [], sidebarCollapsed: false },
  employee: {
    id: 12,
    fullName: 'Nguyễn Văn Anh',
    shortName: 'V.Anh',
    phone: '0901112222',
    address: '123 Lê Lợi',
    bankName: 'Vietcombank',
    bankAccountNo: '007100123456',
    bankAccountName: 'NGUYEN VAN ANH',
    avatarUrl: null,
    position: { id: 1, name: 'Thu Ngân' },
    specialty: { id: 2, name: 'Quầy Pha Chế' },
  },
  session: {
    ipAddress: '192.168.1.25',
    deviceLabel: 'Windows · Chrome',
    startedAt: '2026-11-17T08:30:00.000Z',
  },
  ...overrides,
});

describe('Profile Enhancements: Password Eye Toggle, Avatar Crop/Upload, Session & Permissions & Non-Disruptive Password Rotation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  it('toggles password visibility across ProfilePage, LoginPage, CreateUserDialog, and PermissionsDrawer without submitting forms', async () => {
    // 1) LoginPage password eye toggle
    const { unmount: unmountLogin } = render(
      <QueryProvider client={new QueryClient()}>
        <MemoryRouter future={routerFutureFlags}>
          <LoginPage />
        </MemoryRouter>
      </QueryProvider>,
    );
    const loginPwdInput = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    const loginToggleBtn = screen.getByTestId('toggle-login-password');
    expect(loginPwdInput.type).toBe('password');
    fireEvent.click(loginToggleBtn);
    expect(loginPwdInput.type).toBe('text');
    expect(loginToggleBtn).toHaveAttribute('aria-label', 'Ẩn mật khẩu');
    fireEvent.click(loginToggleBtn);
    expect(loginPwdInput.type).toBe('password');
    unmountLogin();

    // 2) CreateUserDialog & PermissionsDrawer toggles
    vi.spyOn(apiClient, 'get').mockResolvedValue([]);
    const { unmount: unmountCreate } = render(
      <QueryProvider client={new QueryClient()}>
        <CreateUserDialog open onOpenChange={vi.fn()} />
      </QueryProvider>,
    );
    const createPwd = screen.getByTestId('create-user-password-input') as HTMLInputElement;
    expect(createPwd.type).toBe('password');
    fireEvent.click(screen.getByTestId('toggle-create-user-password'));
    expect(createPwd.type).toBe('text');
    unmountCreate();

    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán Sơn Bảo',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });

    const { unmount: unmountDrawer } = render(
      <QueryProvider client={new QueryClient()}>
        <PermissionsDrawer
          open
          onOpenChange={vi.fn()}
          user={{
            id: 2,
            employeeId: 12,
            username: 'cashier01',
            isSuperAdmin: false,
            isActive: true,
            permissions: UserPermissionsSchema.parse({}),
            uiPreferences: { theme: 'light', sidebarWidth: 260, columnWidths: {}, displayScale: { perPath: {} }, navOrder: [], navGroupOrder: [], sidebarCollapsed: false },
            employee: {
              id: 12,
              fullName: 'Nguyễn Văn Anh',
              shortName: 'V.Anh',
              avatarUrl: null,
              position: null,
              specialty: null,
            },
          }}
        />
      </QueryProvider>,
    );
    const resetPwd = screen.getByTestId('reset-password-input') as HTMLInputElement;
    const resetConfirmPwd = screen.getByTestId('reset-password-confirm-input') as HTMLInputElement;
    expect(resetPwd.type).toBe('password');
    expect(resetConfirmPwd.type).toBe('password');
    fireEvent.click(screen.getByTestId('toggle-reset-password'));
    fireEvent.click(screen.getByTestId('toggle-reset-confirm-password'));
    expect(resetPwd.type).toBe('text');
    expect(resetConfirmPwd.type).toBe('text');
    unmountDrawer();
  });

  it('displays current session info & granted module permissions and rotates accessToken in store on self changePassword without kicking user', async () => {
    const profile = makeProfile();
    useAuthStore.getState().setAuth({
      accessToken: 'initial-token',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Nguyễn Văn Anh',
        isSuperAdmin: false,
        permissions: profile.permissions,
      },
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(profile);
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({
      message: 'Đổi mật khẩu thành công',
      accessToken: 'rotated-session-token',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: profile.permissions,
        uiPreferences: profile.uiPreferences,
        employee: {
          fullName: 'Nguyễn Văn Anh',
          shortName: 'V.Anh',
          avatarUrl: null,
          position: { id: 1, name: 'Thu Ngân' },
          specialty: { id: 2, name: 'Quầy Pha Chế' },
        },
      },
    });

    render(
      <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter future={routerFutureFlags}>
          <ProfilePage />
        </MemoryRouter>
      </QueryProvider>,
    );

    const sessionCard = await screen.findByTestId('profile-session-permissions-card');
    expect(sessionCard).toHaveTextContent('@cashier01');
    expect(sessionCard).toHaveTextContent('Windows · Chrome');
    expect(sessionCard).toHaveTextContent('192.168.1.25');
    expect(sessionCard).toHaveTextContent('Bán hàng POS');
    expect(sessionCard).toHaveTextContent('Thanh toán');
    expect(sessionCard).toHaveTextContent('Quản lý Hoá đơn');

    // Password toggles on all 3 inputs work cleanly
    const curPwd = screen.getByTestId('profile-current-password') as HTMLInputElement;
    const newPwd = screen.getByTestId('profile-new-password') as HTMLInputElement;
    const cfmPwd = screen.getByTestId('profile-confirm-password') as HTMLInputElement;
    fireEvent.click(screen.getByTestId('toggle-profile-current-password'));
    fireEvent.click(screen.getByTestId('toggle-profile-new-password'));
    fireEvent.click(screen.getByTestId('toggle-profile-confirm-password'));
    expect(curPwd.type).toBe('text');
    expect(newPwd.type).toBe('text');
    expect(cfmPwd.type).toBe('text');

    fireEvent.change(curPwd, { target: { value: 'OldPass@123' } });
    fireEvent.change(newPwd, { target: { value: 'NewPass@123' } });
    fireEvent.change(cfmPwd, { target: { value: 'NewPass@123' } });
    fireEvent.click(screen.getByTestId('change-password-submit'));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/v1/profile/password', {
        currentPassword: 'OldPass@123',
        newPassword: 'NewPass@123',
        confirmPassword: 'NewPass@123',
      }),
    );
    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe('rotated-session-token'),
    );
    expect(useAuthStore.getState().user?.username).toBe('cashier01');
    expect(curPwd.value).toBe('');
    expect(newPwd.value).toBe('');
  });

  it('validates file type, crops/uploads avatar via Canvas to PUT /api/v1/profile/avatar, syncs authStore, and deletes avatar via DELETE', async () => {
    const initialProfile = makeProfile();
    const uploadedProfile = makeProfile({
      employee: {
        ...initialProfile.employee,
        avatarUrl: '/api/v1/public/avatars/12?v=2026-11-17T12:00:00Z',
      },
    });
    const deletedProfile = makeProfile({
      employee: {
        ...initialProfile.employee,
        avatarUrl: null,
      },
    });

    useAuthStore.getState().setAuth({
      accessToken: 'live-token',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Nguyễn Văn Anh',
        avatarUrl: null,
        isSuperAdmin: false,
        permissions: initialProfile.permissions,
      },
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(initialProfile);
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(uploadedProfile);
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValueOnce(deletedProfile);

    // Mock ObjectURL & HTMLCanvasElement in jsdom
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-avatar-url');
    URL.revokeObjectURL = vi.fn();

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToDataUrl = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    })) as unknown as typeof origGetContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/webp;base64,ZmFrZWNyb3BwZWRhdmF0YXI=');

    try {
      render(
        <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter future={routerFutureFlags}>
            <ProfilePage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await screen.findByTestId('profile-avatar-initials');
      const fileInput = screen.getByTestId('profile-avatar-file-input');

      // Invalid MIME type rejected cleanly on client
      const badFile = new File(['hello'], 'doc.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [badFile] } });
      expect(await screen.findByTestId('profile-avatar-error')).toHaveTextContent(
        'Chỉ hỗ trợ tệp ảnh định dạng PNG, JPEG hoặc WebP.',
      );

      // Valid PNG opens crop dialog
      const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'face.png', {
        type: 'image/png',
      });
      fireEvent.change(fileInput, { target: { files: [pngFile] } });

      const cropDialog = await screen.findByTestId('avatar-crop-dialog');
      const previewImg = cropDialog.querySelector('img[alt="Xem trước ảnh cắt"]') as HTMLImageElement;
      expect(previewImg).toBeTruthy();

      // Simulate image load dimensions so Save becomes enabled
      Object.defineProperty(previewImg, 'naturalWidth', { value: 600 });
      Object.defineProperty(previewImg, 'naturalHeight', { value: 400 });
      fireEvent.load(previewImg);

      fireEvent.change(screen.getByTestId('avatar-crop-zoom-slider'), { target: { value: '1.5' } });
      fireEvent.click(screen.getByTestId('avatar-crop-save-btn'));

      await waitFor(() =>
        expect(putSpy).toHaveBeenCalledWith('/api/v1/profile/avatar', {
          mime: 'image/webp',
          base64: 'ZmFrZWNyb3BwZWRhdmF0YXI=',
        }),
      );

      await waitFor(() =>
        expect(useAuthStore.getState().user?.avatarUrl).toBe(
          '/api/v1/public/avatars/12?v=2026-11-17T12:00:00Z',
        ),
      );
      expect(await screen.findByTestId('profile-avatar-img')).toHaveAttribute(
        'src',
        expect.stringContaining('/api/v1/public/avatars/12?v=2026-11-17T12:00:00Z'),
      );

      // Now delete avatar cleanly back to initials
      fireEvent.click(screen.getByTestId('profile-avatar-delete-btn'));
      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/api/v1/profile/avatar'));
      await waitFor(() => expect(useAuthStore.getState().user?.avatarUrl).toBeNull());
      expect(await screen.findByTestId('profile-avatar-initials')).toHaveTextContent('VA');
    } finally {
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toDataURL = origToDataUrl;
    }
  });

  it('auto-updates avatar initials preview, shortName badge, and invalidates schedules/payroll caches when fullName changes', async () => {
    const initial = makeProfile();
    const updated = makeProfile({
      employee: {
        ...initial.employee,
        fullName: 'Phạm Hoàng Quân',
        shortName: 'H.Quân',
      },
    });

    useAuthStore.getState().setAuth({
      accessToken: 'live-token',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Nguyễn Văn Anh',
        avatarUrl: null,
        isSuperAdmin: false,
        permissions: initial.permissions,
      },
    });

    vi.spyOn(apiClient, 'get').mockResolvedValue(initial);
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(updated);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryProvider client={queryClient}>
        <MemoryRouter future={routerFutureFlags}>
          <ProfilePage />
        </MemoryRouter>
      </QueryProvider>,
    );

    expect(await screen.findByTestId('profile-short-name')).toHaveTextContent('V.Anh');
    expect(screen.getByTestId('profile-avatar-initials')).toHaveTextContent('VA');

    const fullNameInput = screen.getByLabelText('Họ và tên nhân viên');
    fireEvent.change(fullNameInput, { target: { value: 'Phạm Hoàng Quân' } });
    expect(screen.getByTestId('profile-avatar-initials')).toHaveTextContent('HQ');

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi Hồ sơ/i }));

    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/profile',
        expect.objectContaining({ fullName: 'Phạm Hoàng Quân' }),
      ),
    );
    expect(await screen.findByTestId('profile-short-name')).toHaveTextContent('H.Quân');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['schedules'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['payroll'] });
  });
});
