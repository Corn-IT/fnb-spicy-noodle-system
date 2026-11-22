import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createStoredZipBlob,
  downloadBlobFile,
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
});
