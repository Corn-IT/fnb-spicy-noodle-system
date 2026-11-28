import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createStoredZipBlob,
  downloadBlobFile,
  isLocalhostOrPrivateHost,
  preloadQrCardLogo,
  renderQrCardPngBlob,
  sanitizeQrFilename,
} from '../qr-export';

describe('qr-export (PNG QR Card rendering, filename sanitization & pure-JS ZIP archive)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes Vietnamese diacritics and symbols into clean kebab-case filenames', () => {
    expect(sanitizeQrFilename('Bàn 05 - Tầng 1')).toBe('ban-05-tang-1');
    expect(sanitizeQrFilename('Đơn Mang Về #01')).toBe('don-mang-ve-01');
    expect(sanitizeQrFilename('   ---   ')).toBe('qr-code');
  });

  it('builds a valid PKZIP (STORE) archive containing UTF-8 filenames, CRC32 checksums, and EOCD metadata', async () => {
    const file1 = new TextEncoder().encode('PNG-MOCK-1');
    const file2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

    const zipBlob = createStoredZipBlob(
      [
        { name: 'qr-ban-01.png', data: file1 },
        { name: 'qr-mang-ve.png', data: file2 },
      ],
      new Date('2026-11-22T12:00:00.000Z'),
    );

    expect(zipBlob.type).toBe('application/zip');
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(zipBlob);
    });
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Local File Header signature PK\x03\x04
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // Method 0 (STORE) and UTF-8 flag bit 11 (0x0800)
    expect(view.getUint16(6, true)).toBe(0x0800);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(22, true)).toBe(file1.length);

    // End of Central Directory (last 22 bytes)
    const eocdOffset = bytes.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(2);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);

    // Central Directory first header signature PK\x01\x02
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
  });

  it('renders high-resolution QR Card PNG with storeName & table title and triggers browser download cleanup', async () => {
    const fillTextCalls: string[] = [];
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      textAlign: '',
      textBaseline: '',
      font: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn((text: string) => {
        fillTextCalls.push(text);
      }),
      drawImage: vi.fn(),
    };

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => mockCtx as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof origGetContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }));
    }) as unknown as typeof origToBlob;
    const qrCanvasSpy = vi.spyOn(QRCode, 'toCanvas').mockResolvedValue(undefined as never);

    try {
      const pngBlob = await renderQrCardPngBlob({
        qrUrl: 'https://pos.local/qr/abc',
        title: 'Bàn 05',
        storeName: 'Mì Cay Sasin',
        subtitle: 'Quét mã QR để gọi món tại bàn',
      });

      expect(pngBlob.type).toBe('image/png');
      expect(qrCanvasSpy).toHaveBeenCalledWith(
        expect.anything(),
        'https://pos.local/qr/abc',
        expect.objectContaining({ width: 480 }),
      );
      expect(fillTextCalls).toEqual(
        expect.arrayContaining([
          'MÌ CAY SASIN',
          'Bàn 05',
          'Quét mã QR để gọi món tại bàn',
          'pos.local/qr/abc',
        ]),
      );

      const origCreateUrl = URL.createObjectURL;
      const origRevokeUrl = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:qr-test');
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      try {
        vi.useFakeTimers();
        downloadBlobFile(pngBlob, 'qr-ban-05.png');
        expect(URL.createObjectURL).toHaveBeenCalledWith(pngBlob);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1000);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr-test');
      } finally {
        vi.useRealTimers();
        URL.createObjectURL = origCreateUrl;
        URL.revokeObjectURL = origRevokeUrl;
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    }
  });

  it('supports custom accentColor, custom footerText, logo header drawing, hiding link text, and local host detection', async () => {
    expect(isLocalhostOrPrivateHost('http://localhost:5173')).toBe(true);
    expect(isLocalhostOrPrivateHost('http://192.168.1.50:5173')).toBe(true);
    expect(isLocalhostOrPrivateHost('https://pos.micay.vn')).toBe(false);

    const fillTextCalls: string[] = [];
    const fillStylesUsed: string[] = [];
    const mockCtx = {
      _fillStyle: '',
      get fillStyle() {
        return this._fillStyle;
      },
      set fillStyle(val: string) {
        this._fillStyle = val;
        fillStylesUsed.push(val);
      },
      strokeStyle: '',
      lineWidth: 0,
      textAlign: '',
      textBaseline: '',
      font: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn((text: string) => {
        fillTextCalls.push(text);
      }),
      drawImage: vi.fn(),
    };

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => mockCtx as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof origGetContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }));
    }) as unknown as typeof origToBlob;
    vi.spyOn(QRCode, 'toCanvas').mockResolvedValue(undefined as never);

    try {
      const mockLogo = { width: 120, height: 60 } as unknown as CanvasImageSource;
      const pngBlob = await renderQrCardPngBlob({
        qrUrl: 'https://pos.micay.vn/q/ban05-k7m9',
        title: 'Bàn 05',
        storeName: 'Mì Cay Sasin',
        subtitle: 'Quét gọi món không cần chờ',
        footerText: 'Quét bằng Camera hoặc Zalo',
        accentColor: '#2563eb',
        showLinkText: false,
        preloadedLogoImage: mockLogo,
      });

      expect(pngBlob.type).toBe('image/png');
      expect(fillStylesUsed).toContain('#2563EB');
      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockLogo, expect.any(Number), expect.any(Number), 56, 28);
      expect(fillTextCalls).toContain('Quét gọi món không cần chờ');
      expect(fillTextCalls).toContain('Quét bằng Camera hoặc Zalo');
      expect(fillTextCalls).not.toContain('pos.micay.vn/q/ban05-k7m9');
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    }
  });

  it('handles preloadQrCardLogo states, tainted canvas logo retry, missing 2d context, and private IP detection', async () => {
    expect(isLocalhostOrPrivateHost('http://10.0.0.15:8080')).toBe(true);
    expect(isLocalhostOrPrivateHost('http://172.16.4.1/qr')).toBe(true);
    expect(isLocalhostOrPrivateHost('http://172.31.255.1/qr')).toBe(true);
    expect(isLocalhostOrPrivateHost('http://172.15.0.1/qr')).toBe(false);
    expect(isLocalhostOrPrivateHost('not-a-valid-url')).toBe(false);

    await expect(preloadQrCardLogo(null)).resolves.toBeNull();
    await expect(preloadQrCardLogo('')).resolves.toBeNull();

    const OriginalImage = globalThis.Image;
    try {
      class MockSuccessImage {
        crossOrigin = '';
        naturalWidth = 64;
        width = 64;
        height = 32;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
      globalThis.Image = MockSuccessImage as unknown as typeof Image;
      const loaded = await preloadQrCardLogo('https://pos.local/logo.png');
      expect(loaded).not.toBeNull();

      class MockZeroAndErrorImage {
        crossOrigin = '';
        naturalWidth = 0;
        width = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(value: string) {
          queueMicrotask(() => {
            if (value.includes('err')) this.onerror?.();
            else this.onload?.();
          });
        }
      }
      globalThis.Image = MockZeroAndErrorImage as unknown as typeof Image;
      await expect(preloadQrCardLogo('https://pos.local/empty.png')).resolves.toBeNull();
      await expect(preloadQrCardLogo('https://pos.local/err.png')).resolves.toBeNull();
    } finally {
      globalThis.Image = OriginalImage;
    }

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    try {
      HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof origGetContext;
      await expect(
        renderQrCardPngBlob({ qrUrl: 'https://pos.local/qr/1', title: 'Bàn 1', storeName: 'Quán' }),
      ).rejects.toThrow('Cannot acquire 2D canvas context');

      const mockCtx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        textAlign: '',
        textBaseline: '',
        font: '',
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
      };
      HTMLCanvasElement.prototype.getContext = vi.fn(
        () => mockCtx as unknown as CanvasRenderingContext2D,
      ) as unknown as typeof origGetContext;
      vi.spyOn(QRCode, 'toCanvas').mockResolvedValue(undefined as never);

      // Simulate SecurityError on tainted canvas export with logo -> retries cleanly without logo
      let callCount = 0;
      HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
        callCount += 1;
        if (callCount === 1) throw new Error('Tainted canvas');
        cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
      }) as unknown as typeof origToBlob;

      const retried = await renderQrCardPngBlob({
        qrUrl: 'https://pos.local/qr/1',
        title: 'Bàn 1',
        storeName: 'Quán',
        preloadedLogoImage: { width: 100, height: 50 } as unknown as CanvasImageSource,
      });
      expect(retried.size).toBe(3);
      expect(callCount).toBe(2);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    }
  });
});
