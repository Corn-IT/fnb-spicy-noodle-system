import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TouchPrinterPage } from '@/features/store-settings';

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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requires 2-step confirmation before kicking the cash drawer', async () => {
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
});
