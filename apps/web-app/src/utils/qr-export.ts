import QRCode from 'qrcode';

export interface QrCardPngParams {
  qrUrl: string;
  title: string;
  storeName: string;
  subtitle?: string;
}

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Chuẩn hóa nhãn bàn/thẻ thành tên file an toàn (không dấu, kebab-case).
 */
export function sanitizeQrFilename(label: string): string {
  const ascii = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'qr-code';
}

/**
 * Tạo ảnh thẻ QR dạng PNG độ phân giải cao (tên quán + tên bàn + hướng dẫn + mã QR sắc nét).
 */
export async function renderQrCardPngBlob(params: QrCardPngParams): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas PNG export is only available in browser environments');
  }

  const width = 720;
  const height = 900;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot acquire 2D canvas context for QR export');
  }

  // White card backdrop + subtle border
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Top accent strip
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(20, 20, width - 40, 14);

  // Store name
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#64748B';
  ctx.font = '700 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText((params.storeName || 'Quán Mì Cay').trim().toUpperCase(), width / 2, 86, width - 96);

  // Table / Takeaway main title
  ctx.fillStyle = '#0F172A';
  ctx.font = '800 54px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(params.title.trim(), width / 2, 152, width - 96);

  // Subtitle instruction
  ctx.fillStyle = '#EA580C';
  ctx.font = '600 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    params.subtitle?.trim() || 'Quét mã QR để xem thực đơn & đặt món',
    width / 2,
    208,
    width - 96,
  );

  // Render crisp QR code onto temporary canvas then compose onto card
  const qrSize = 480;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, params.qrUrl, {
    width: qrSize,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });

  const qrX = (width - qrSize) / 2;
  const qrY = 248;
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Footer instructions
  ctx.fillStyle = '#334155';
  ctx.font = '600 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Mở Camera hoặc truy cập nhanh:', width / 2, 780, width - 96);

  ctx.fillStyle = '#475569';
  ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const cleanDisplayUrl = params.qrUrl.replace(/^https?:\/\//i, '');
  const shortUrl = cleanDisplayUrl.length > 56 ? `${cleanDisplayUrl.slice(0, 53)}...` : cleanDisplayUrl;
  ctx.fillText(shortUrl, width / 2, 826, width - 96);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Không thể xuất file ảnh PNG từ trình duyệt'));
      },
      'image/png',
      1,
    );
  });
}

/**
 * Đóng gói nhiều file ảnh vào một file .zip chuẩn PKZIP (STORE không nén, zero dependencies).
 */
export function createStoredZipBlob(entries: ZipEntryInput[], now: Date = new Date()): Blob {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = getDosDateTime(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = computeCrc32(data);

    // Local File Header (30 bytes + filenameBytes.length)
    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed: 2.0
    localView.setUint16(6, 0x0800, true); // UTF-8 filename flag
    localView.setUint16(8, 0, true); // compression: STORE (0)
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, filenameBytes.length, true);
    localView.setUint16(28, 0, true); // extra field len
    localHeader.set(filenameBytes, 30);

    localParts.push(localHeader, data);

    // Central Directory File Header (46 bytes + filenameBytes.length)
    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true); // UTF-8 filename flag
    centralView.setUint16(10, 0, true); // compression: STORE
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, filenameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk start
    centralView.setUint16(36, 0, true); // internal attrs
    centralView.setUint32(38, 0, true); // external attrs
    centralView.setUint32(42, offset, true); // local header offset
    centralHeader.set(filenameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // central dir start disk
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirectorySize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true); // comment length

  const blobParts: BlobPart[] = [
    ...localParts.map((part) => new Uint8Array(part)),
    ...centralParts.map((part) => new Uint8Array(part)),
    new Uint8Array(eocd),
  ];
  return new Blob(blobParts, { type: 'application/zip' });
}

/**
 * Kích hoạt tải file xuống trình duyệt và giải phóng Object URL an toàn.
 */
export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
