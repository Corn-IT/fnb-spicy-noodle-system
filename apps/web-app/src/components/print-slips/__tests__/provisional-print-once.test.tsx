import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider, useThermalPrinter } from '@/components/print-slips';

function PrintProvisionalButton() {
  const printer = useThermalPrinter();
  return (
    <button
      type="button"
      onClick={() =>
        printer.printProvisionalVietQr({
          orderId: 701,
          orderCode: 'HD-20261123-0001',
          orderType: 'DINE_IN',
          tableId: 5,
          takeawayNumber: null,
          tableLabel: 'Bàn 05',
          totalAmount: 60000,
          status: 'SERVING',
          items: [
            {
              name: 'Mì Bò Mỹ',
              quantity: 1,
              unitPrice: 60000,
              lineTotal: 60000,
              modifiers: [],
              note: null,
            },
          ],
        })
      }
    >
      In tạm tính
    </button>
  );
}

describe('ThermalPrintProvider — phiếu tạm tính chỉ in đúng 1 lần', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prints once and does not re-print the already printed slip when the provider re-renders', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const view = render(
      <ThermalPrintProvider>
        <PrintProvisionalButton />
      </ThermalPrintProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'In tạm tính' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(printSpy).toHaveBeenCalledTimes(1);

    // Ứng dụng thật render lại provider liên tục (query, socket, cài đặt...). Phiếu đã in vẫn được giữ
    // trên màn để xem lại; trước khi sửa, mỗi lần render lại nó tự in thêm một bản.
    for (let tick = 0; tick < 5; tick += 1) {
      view.rerender(
        <ThermalPrintProvider>
          <PrintProvisionalButton />
          <span>{`render ${tick}`}</span>
        </ThermalPrintProvider>,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
    }

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending print of a slip replaced by a newer provisional print', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    });
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const flushFrames = () =>
      act(() => {
        for (let round = 0; round < 4; round += 1) {
          const pending = [...frames.entries()];
          frames.clear();
          pending.forEach(([, cb]) => cb(performance.now()));
        }
      });

    render(
      <ThermalPrintProvider>
        <PrintProvisionalButton />
      </ThermalPrintProvider>,
    );

    const button = screen.getByRole('button', { name: 'In tạm tính' });
    fireEvent.click(button); // phiếu A: hẹn in sau 2 khung hình
    fireEvent.click(button); // phiếu B thay thế A trước khi A kịp in

    expect(cancelSpy).toHaveBeenCalled();
    flushFrames();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
