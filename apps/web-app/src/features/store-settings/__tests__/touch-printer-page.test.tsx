import { UserPermissionsSchema } from '@fnb/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TouchPrinterPage } from '@/features/store-settings';
import { useAuthStore } from '@/stores/auth.store';

const mockPrintOfficialReceipt = vi.fn();
const mockKickCashDrawerNow = vi.fn();

vi.mock('@/components/print-slips', async () => {
  const actual = await vi.importActual<typeof import('@/components/print-slips')>(
    '@/components/print-slips',
  );
  return {
    ...actual,
    useThermalPrinter: () => ({
      printOfficialReceipt: mockPrintOfficialReceipt,
      kickCashDrawerNow: mockKickCashDrawerNow,
      lastPhysicalPrintResult: null,
      lastPhysicalPrintError: null,
    }),
  };
});

describe('TouchPrinterPage — Máy in & Két tiền cảm ứng', () => {
  beforeEach(() => {
    mockPrintOfficialReceipt.mockReset();
    mockKickCashDrawerNow.mockReset().mockResolvedValue({
      transport: 'RAWBT_WS',
      bytesSent: 7,
    });
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: {
        id: 2,
        employeeId: 2,
        username: 'thungan',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true, openCashDrawer: true },
        }),
      },
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('requires 2-step confirmation before kicking the cash drawer when user has pos.openCashDrawer', async () => {
    render(<TouchPrinterPage />);

    expect(screen.getByTestId('touch-printer-page')).toBeInTheDocument();
    const kickBtn = screen.getByTestId('btn-test-cash-drawer-kick');

    // Chạm lần 1: mở hộp thoại xác nhận, chưa gửi xung mở két.
    fireEvent.click(kickBtn);
    expect(await screen.findByTestId('touch-confirm-dialog')).toBeInTheDocument();
    expect(mockKickCashDrawerNow).not.toHaveBeenCalled();

    // Bấm "Quay lại" → không mở két.
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(mockKickCashDrawerNow).not.toHaveBeenCalled();

    // Mở lại và bấm xác nhận → gọi kickCashDrawerNow.
    fireEvent.click(kickBtn);
    fireEvent.click(await screen.findByTestId('touch-confirm-accept'));
    await waitFor(() => {
      expect(mockKickCashDrawerNow).toHaveBeenCalledTimes(1);
    });
  });

  it('hides the manual cash drawer button when user lacks pos.openCashDrawer and settings.update', () => {
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: {
        id: 3,
        employeeId: 3,
        username: 'thungan-nodrawer',
        fullName: 'Thu ngân không mở két',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true, openCashDrawer: false },
          settings: { view: false, update: false },
        }),
      },
    });

    render(<TouchPrinterPage />);
    expect(screen.getByTestId('btn-test-thermal-print')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-test-cash-drawer-kick')).not.toBeInTheDocument();
  });
});
