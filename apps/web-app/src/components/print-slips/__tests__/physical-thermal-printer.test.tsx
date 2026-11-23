import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCashDrawerKickPayload,
  dispatchLanEscPosPrint,
  dispatchRawbtUsbPrint,
  encodeMonochromeRasterBands,
  encodeThermalContainerToEscPos,
  ESC_POS_COMMANDS,
  KitchenSplitSlip,
  renderTicketPageToMonochrome,
  rgbaToMonochrome1Bit,
  THERMAL_PRINTER_CONFIG_STORAGE_KEY,
  ThermalPrintProvider,
  useThermalPrinter,
  useThermalPrinterConfigStore,
} from '@/components/print-slips';
import { PrinterHardwareSettingsPanel } from '@/features/store-settings/components/printer-hardware-settings-panel';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

function countSubsequenceOccurrences(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.byteLength === 0 || haystack.byteLength < needle.byteLength) return 0;
  let count = 0;
  for (let i = 0; i <= haystack.byteLength - needle.byteLength; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.byteLength; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      count += 1;
    }
  }
  return count;
}

describe('Physical Thermal Printer Engine (iMin D3-505 + iPOS.vn iTP6 80mm ESC/POS & RJ11 Cash Drawer)', () => {
  beforeEach(() => {
    localStorage.clear();
    useThermalPrinterConfigStore.getState().resetConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('1. ESC/POS Monochrome Raster & Command Encoder (576 dots / 80mm iPOS iTP6)', () => {
    it('packs RGBA pixels into 1-bit monochrome bytes (MSB first, black=1, white=0, transparent composited over white)', () => {
      // 8x1 row: [Black, White, Black, Transparent, DarkGray, LightGray, Black, White]
      const rgba = new Uint8ClampedArray([
        0, 0, 0, 255,       // bit 7 = 1 (black)
        255, 255, 255, 255, // bit 6 = 0 (white)
        10, 10, 10, 255,    // bit 5 = 1 (black)
        0, 0, 0, 0,         // bit 4 = 0 (transparent over white paper -> white)
        40, 40, 40, 255,    // bit 3 = 1 (dark gray < 165)
        220, 220, 220, 255, // bit 2 = 0 (light gray >= 165)
        0, 0, 0, 255,       // bit 1 = 1 (black)
        255, 255, 255, 255, // bit 0 = 0 (white)
      ]);

      const mono = rgbaToMonochrome1Bit(rgba, 8, 1);
      expect(mono.byteLength).toBe(1);
      // 0b10101010 = 0xAA (170)
      expect(mono[0]).toBe(0b10101010);
    });

    it('slices monochrome bitmaps into horizontal GS v 0 bands (<= 128 rows) so iPOS iTP6 buffer never overflows', () => {
      const widthDots = 576; // 72 bytes per row
      const heightDots = 300; // Should split into 3 bands: 128 + 128 + 44 rows
      const monoBytes = new Uint8Array((widthDots / 8) * heightDots).fill(0xff);

      const encoded = encodeMonochromeRasterBands(monoBytes, widthDots, heightDots, 128);
      const gsV0Header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 72, 0]);

      // Must contain 3 GS v 0 raster band headers with widthBytes = 72 (0x48, 0x00)
      expect(countSubsequenceOccurrences(encoded, gsV0Header)).toBe(3);
      // Total size = 3 * 8-byte header + 72 * 300 data bytes
      expect(encoded.byteLength).toBe(3 * 8 + 72 * 300);
    });

    it('builds standalone RJ11 24V Cash Drawer kick payload (ESC @ + ESC p 0 50 250)', () => {
      const kick = buildCashDrawerKickPayload();
      expect(Array.from(kick)).toEqual([
        0x1b, 0x40, // ESC @
        0x1b, 0x70, 0x00, 0x32, 0xfa, // ESC p 0 50 250
      ]);
    });

    it('emits 3 separate GS V 66 0 auto-cutter commands when encoding a 3-station KitchenSplitSlip (Hard Invariant 3)', async () => {
      const { container } = render(
        <div id="thermal-print-container">
          <KitchenSplitSlip
            orderCode="HD-20261122-0088"
            tableLabel="BÀN 09"
            transferFromTable="Bàn 02"
            transferToTable="Bàn 09"
            tickets={[
              {
                station: 'BEP_NAU',
                stationTitle: 'BẾP NẤU (MÌ CAY)',
                logoType: 'CHEF_HAT_NOODLE',
                batchNo: 2,
                items: [{ name: 'Mì Cay Hải Sản', qty: 2, modifiers: ['Cấp độ 3'], note: 'Ít hành' }],
              },
              {
                station: 'BEP_CHIEN',
                stationTitle: 'BẾP CHIÊN',
                logoType: 'FRENCH_FRIES',
                batchNo: 2,
                items: [{ name: 'Khoai Tây Chiên', qty: 1, modifiers: [], note: '' }],
              },
              {
                station: 'PHA_CHE',
                stationTitle: 'QUẦY NƯỚC UỐNG',
                logoType: 'DRINK_CUP',
                batchNo: 2,
                items: [{ name: 'Trà Đào Cam Sả', qty: 2, modifiers: ['Ít đá'], note: '' }],
              },
            ]}
          />
        </div>,
      );

      const printContainer = container.querySelector('#thermal-print-container') as HTMLElement;
      expect(printContainer.querySelectorAll('.ticket-page')).toHaveLength(3);

      const escPosBytes = await encodeThermalContainerToEscPos(printContainer, {
        paperWidthDots: 576,
        kickCashDrawer: false,
      });

      // Starts with ESC @ (0x1B 0x40)
      expect(escPosBytes[0]).toBe(0x1b);
      expect(escPosBytes[1]).toBe(0x40);

      // Does not kick cash drawer for kitchen tickets
      expect(countSubsequenceOccurrences(escPosBytes, ESC_POS_COMMANDS.CASH_DRAWER_KICK)).toBe(0);

      // Emits exactly 3 paper cutter commands (GS V 66 0) — one for each kitchen station
      expect(countSubsequenceOccurrences(escPosBytes, ESC_POS_COMMANDS.AUTO_CUT_PARTIAL)).toBe(3);

      // Emits GS L 0 0 hardware left margin reset and NO ESC d 4 when feedLinesBeforeCut is 0
      expect(countSubsequenceOccurrences(escPosBytes, ESC_POS_COMMANDS.RESET_LEFT_MARGIN)).toBe(1);
      expect(countSubsequenceOccurrences(escPosBytes, ESC_POS_COMMANDS.FEED_BEFORE_CUT)).toBe(0);

      // Emits GS L with calibrated dots (3mm = 24 dots) and ESC d 2 when configured
      const calibrated = await encodeThermalContainerToEscPos(printContainer, {
        paperWidthDots: 576,
        leftMarginMm: 3,
        feedLinesBeforeCut: 2,
      });
      expect(
        countSubsequenceOccurrences(calibrated, new Uint8Array([0x1d, 0x4c, 24, 0])),
      ).toBe(1);
      expect(
        countSubsequenceOccurrences(calibrated, new Uint8Array([0x1b, 0x64, 2])),
      ).toBe(3);
    });

    it('throws a clear error when canvas getImageData fails instead of printing synthetic garbage raster', async () => {
      const mockCtx = {
        fillStyle: '#FFFFFF',
        strokeStyle: '#000000',
        lineWidth: 1,
        font: '18px monospace',
        textAlign: 'left',
        textBaseline: 'top',
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        drawImage: vi.fn(),
        measureText: (txt: string) => ({ width: txt.length * 10 }),
        fillText: vi.fn(),
        getImageData: vi.fn(() => {
          throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
        }),
      } as unknown as CanvasRenderingContext2D;

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);
      const el = document.createElement('div');
      el.className = 'ticket-page';
      el.textContent = 'Test slip';

      await expect(renderTicketPageToMonochrome(el, 576)).rejects.toThrow(
        /Không thể dựng ảnh phiếu in nhiệt/,
      );
    });

    it('renders ticket visual elements through 2D Canvas context when getContext("2d") is available', async () => {
      const fillTextCalls: string[] = [];
      const mockCtx = {
        fillStyle: '#FFFFFF',
        strokeStyle: '#000000',
        lineWidth: 1,
        font: '18px monospace',
        textAlign: 'left',
        textBaseline: 'top',
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        drawImage: vi.fn(),
        measureText: (txt: string) => ({ width: txt.length * 10 }),
        fillText: vi.fn((txt: string) => {
          fillTextCalls.push(txt);
        }),
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4).fill(255),
          width: w,
          height: h,
        })),
      } as unknown as CanvasRenderingContext2D;

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as never);

      const ticketDiv = document.createElement('div');
      ticketDiv.className = 'ticket-page';
      ticketDiv.innerHTML = `
        <div class="text-base font-extrabold">MÌ CAY SƠN BẢO</div>
        <div class="border-2 border-black">[GỌI THÊM - LƯỢT 2]</div>
        <div class="flex justify-between border-b"><span>Mì Cay Bò Mỹ</span><span>55.000 đ</span></div>
        <img data-testid="provisional-vietqr-image" alt="VietQR" width="176" height="176" />
      `;
      const img = ticketDiv.querySelector('img')!;
      Object.defineProperty(img, 'complete', { value: true });
      Object.defineProperty(img, 'naturalWidth', { value: 176 });

      const result = await renderTicketPageToMonochrome(ticketDiv, 576);
      expect(result.widthDots).toBe(576);
      expect(result.heightDots).toBeGreaterThan(100);
      expect(fillTextCalls).toContain('MÌ CAY SƠN BẢO');
      expect(fillTextCalls).toContain('[GỌI THÊM - LƯỢT 2]');
      expect(fillTextCalls).toContain('Mì Cay Bò Mỹ');
      expect(fillTextCalls).toContain('55.000 đ');
    });
  });

  describe('2. RawBT USB Bridge (ws://127.0.0.1:40213 & rawbt:base64 Intent) and LAN (:9100) Transports', () => {
    it('sends binary ESC/POS payload over RawBT local WebSocket when running on Android POS', async () => {
      const sentPayloads: Uint8Array[] = [];
      let closedWithCode: number | undefined;

      class MockWebSocket {
        static OPEN = 1;
        binaryType = 'blob';
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public url: string) {
          setTimeout(() => {
            this.onopen?.();
          }, 5);
        }
        send(data: Uint8Array) {
          sentPayloads.push(data);
        }
        close(code?: number) {
          closedWithCode = code;
        }
      }

      vi.stubGlobal('WebSocket', MockWebSocket);

      const payload = new Uint8Array([0x1b, 0x40, 0x1d, 0x56, 0x42, 0x00]);
      const res = await dispatchRawbtUsbPrint(payload, {
        wsUrl: 'ws://127.0.0.1:40213/',
        fallbackToIntent: true,
      });

      expect(res.transport).toBe('RAWBT_WS');
      expect(res.bytesSent).toBe(6);
      expect(sentPayloads).toHaveLength(1);
      expect(Array.from(sentPayloads[0]!)).toEqual([0x1b, 0x40, 0x1d, 0x56, 0x42, 0x00]);
      expect(closedWithCode).toBe(1000);
    });

    it('falls back to rawbt:base64,... Android Intent URI when RawBT WebSocket is unavailable', async () => {
      class FailingWebSocket {
        binaryType = 'blob';
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public url: string) {
          setTimeout(() => {
            this.onerror?.();
          }, 5);
        }
        send() {}
        close() {}
      }

      vi.stubGlobal('WebSocket', FailingWebSocket);

      let capturedIntentUri = '';
      const payload = new Uint8Array([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x32, 0xfa]);
      const res = await dispatchRawbtUsbPrint(payload, {
        wsUrl: 'ws://127.0.0.1:40213/',
        fallbackToIntent: true,
        onIntentUri: (uri) => {
          capturedIntentUri = uri;
        },
      });

      expect(res.transport).toBe('RAWBT_INTENT');
      expect(capturedIntentUri.startsWith('rawbt:base64,')).toBe(true);
      expect(res.rawbtUri).toBe(capturedIntentUri);
    });

    it('dispatches ESC/POS base64 payload to backend LAN endpoint POST /api/v1/pos/print/lan-escpos', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        success: true,
        host: '192.168.1.200',
        port: 9100,
        bytesSent: 7,
        durationMs: 11,
      });

      const payload = buildCashDrawerKickPayload();
      const res = await dispatchLanEscPosPrint(payload, {
        lanHost: '192.168.1.200',
        lanPort: 9100,
        lanTimeoutMs: 4000,
      });

      expect(res.transport).toBe('LAN_ESCPOS');
      expect(res.bytesSent).toBe(7);
      expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/print/lan-escpos', {
        host: '192.168.1.200',
        port: 9100,
        payloadBase64: 'G0AbcAAy+g==',
        timeoutMs: 4000,
      });
    });
  });

  describe('3. ThermalPrintProvider Multi-Driver Routing, Cash Drawer Kick & Hard Invariant 9', () => {
    it('preserves physical thermal printer device configuration in localStorage across user logout (Hard Invariant 9)', () => {
      useThermalPrinterConfigStore.getState().updateConfig({
        driver: 'RAWBT_USB',
        paperWidthDots: 576,
        cashDrawerKick: true,
        rawbtWsUrl: 'ws://127.0.0.1:40213/',
      });

      useAuthStore.getState().setAuth({
        accessToken: 'token-1',
        user: {
          id: 2,
          employeeId: 2,
          username: 'cashier01',
          fullName: 'Thu Ngân Ca Sáng',
          isSuperAdmin: false,
          permissions: {} as never,
        },
      });

      // Simulate cashier logout
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useThermalPrinterConfigStore.getState().config.driver).toBe('RAWBT_USB');
      expect(localStorage.getItem(THERMAL_PRINTER_CONFIG_STORAGE_KEY)).toContain('RAWBT_USB');
    });

    it('automatically includes ESC p (RJ11 Cash Drawer kick) when printing OFFICIAL_RECEIPT with CASH or SPLIT, but omits it for TRANSFER', async () => {
      const sentPayloads: Uint8Array[] = [];

      class MockWebSocket {
        binaryType = 'blob';
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public url: string) {
          setTimeout(() => this.onopen?.(), 2);
        }
        send(data: Uint8Array) {
          sentPayloads.push(data);
        }
        close() {}
      }

      vi.stubGlobal('WebSocket', MockWebSocket);

      useThermalPrinterConfigStore.getState().updateConfig({
        driver: 'RAWBT_USB',
        paperWidthDots: 576,
        cashDrawerKick: true,
      });

      function TestHarness() {
        const printer = useThermalPrinter();
        return (
          <div>
            <button
              type="button"
              data-testid="print-cash-btn"
              onClick={() =>
                printer.printOfficialReceipt({
                  orderCode: 'HD-CASH-01',
                  tableLabel: 'BÀN 01',
                  paymentMethod: 'CASH',
                  cashAmount: 50000,
                  transferAmount: 0,
                  totalAmount: 50000,
                  items: [
                    {
                      name: 'Mì Cay Bò',
                      quantity: 1,
                      unitPrice: 50000,
                      lineTotal: 50000,
                      modifiers: ['Cấp độ 1'],
                      note: null,
                    },
                  ],
                })
              }
            >
              In Cash
            </button>
            <button
              type="button"
              data-testid="print-transfer-btn"
              onClick={() =>
                printer.printOfficialReceipt({
                  orderCode: 'HD-QR-02',
                  tableLabel: 'BÀN 02',
                  paymentMethod: 'TRANSFER',
                  cashAmount: 0,
                  transferAmount: 60000,
                  totalAmount: 60000,
                  items: [
                    {
                      name: 'Mì Cay Hải Sản',
                      quantity: 1,
                      unitPrice: 60000,
                      lineTotal: 60000,
                      modifiers: ['Cấp độ 2'],
                      note: null,
                    },
                  ],
                })
              }
            >
              In Transfer
            </button>
          </div>
        );
      }

      render(
        <ThermalPrintProvider>
          <TestHarness />
        </ThermalPrintProvider>,
      );

      fireEvent.click(screen.getByTestId('print-cash-btn'));
      await waitFor(() => {
        expect(sentPayloads.length).toBe(1);
      });
      // CASH receipt MUST contain ESC p 0 50 250 (0x1B 0x70 0x00 0x32 0xFA) to kick Port 5 RJ11 cash drawer
      expect(
        countSubsequenceOccurrences(sentPayloads[0]!, ESC_POS_COMMANDS.CASH_DRAWER_KICK),
      ).toBe(1);

      fireEvent.click(screen.getByTestId('print-transfer-btn'));
      await waitFor(() => {
        expect(sentPayloads.length).toBe(2);
      });
      // TRANSFER receipt MUST NOT kick cash drawer
      expect(
        countSubsequenceOccurrences(sentPayloads[1]!, ESC_POS_COMMANDS.CASH_DRAWER_KICK),
      ).toBe(0);
    });
  });

  describe('4. PrinterHardwareSettingsPanel UI (Settings Tab -> Phiếu in)', () => {
    it('allows switching between BROWSER, RAWBT_USB (iMin D3-505 + iPOS iTP6), and LAN_ESCPOS, validating LAN IP, and testing print + RJ11 cash drawer kick', async () => {
      const user = userEvent.setup();
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        success: true,
        host: '192.168.1.200',
        port: 9100,
        bytesSent: 7,
        durationMs: 8,
      });

      render(
        <ThermalPrintProvider>
          <PrinterHardwareSettingsPanel />
        </ThermalPrintProvider>,
      );

      // Default is BROWSER
      expect(useThermalPrinterConfigStore.getState().config.driver).toBe('BROWSER');

      // Switch to RAWBT_USB (iMin D3-505 + iPOS iTP6 USB)
      await user.click(screen.getByTestId('printer-driver-option-RAWBT_USB'));
      expect(useThermalPrinterConfigStore.getState().config.driver).toBe('RAWBT_USB');
      expect(screen.getByTestId('printer-rawbt-usb-config-box')).toBeInTheDocument();

      // Switch to LAN_ESCPOS (Ethernet Port 9100)
      await user.click(screen.getByTestId('printer-driver-option-LAN_ESCPOS'));
      expect(useThermalPrinterConfigStore.getState().config.driver).toBe('LAN_ESCPOS');
      expect(screen.getByTestId('printer-lan-escpos-config-box')).toBeInTheDocument();

      // Enter invalid public IP -> shows SSRF/LAN validation warning
      const hostInput = screen.getByTestId('input-lan-printer-host');
      fireEvent.change(hostInput, { target: { value: '8.8.8.8' } });
      expect(screen.getByTestId('lan-printer-host-error')).toBeInTheDocument();

      // Enter valid LAN IP of iPOS iTP6
      fireEvent.change(hostInput, { target: { value: '192.168.1.200' } });
      expect(screen.queryByTestId('lan-printer-host-error')).not.toBeInTheDocument();

      // Click [Test bung két tiền (RJ11)]
      await user.click(screen.getByTestId('btn-test-cash-drawer-kick'));
      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/print/lan-escpos', {
          host: '192.168.1.200',
          port: 9100,
          payloadBase64: 'G0AbcAAy+g==',
          timeoutMs: 4000,
        });
      });
      expect(screen.getByTestId('printer-hardware-status-message')).toHaveTextContent(
        /Đã phát xung mở két tiền RJ11/i,
      );

      // Click [In phiếu kiểm tra kết nối (80mm)]
      await user.click(screen.getByTestId('btn-test-thermal-print'));
      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByTestId('printer-last-dispatch-badge')).toHaveTextContent(/LAN_ESCPOS/i);
    });
  });
});
