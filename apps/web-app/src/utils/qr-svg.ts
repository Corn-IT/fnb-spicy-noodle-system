import QRCode from 'qrcode';

/**
 * Sinh chuỗi Data URL ảnh SVG mã QR chuẩn ISO/IEC 18004 hoàn toàn offline trên trình duyệt
 * (không gọi dịch vụ bên thứ ba, in nhiệt 80mm sắc nét ở mọi độ phân giải).
 */
export async function generateOfflineQrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
