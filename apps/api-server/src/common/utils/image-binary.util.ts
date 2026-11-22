import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ErrorCodes } from '@fnb/shared';

export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export function detectImageMimeFromMagicBytes(buf: Buffer): SupportedImageMime | null {
  if (
    buf.byteLength >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buf.byteLength >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function decodeValidatedImageBase64(
  rawBase64: string,
  maxBytes: number,
  label: string,
): { buffer: Buffer; mime: SupportedImageMime; canonicalBase64: string } {
  const strippedBase64 = rawBase64
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
    .replace(/\s+/g, '');

  if (!strippedBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(strippedBase64)) {
    throw new BadRequestException({
      code: ErrorCodes.STORE_ASSET_INVALID_TYPE,
      message: 'Dữ liệu ảnh base64 không hợp lệ',
    });
  }

  const buffer = Buffer.from(strippedBase64, 'base64');
  const detectedMime = detectImageMimeFromMagicBytes(buffer);
  if (!detectedMime) {
    throw new BadRequestException({
      code: ErrorCodes.STORE_ASSET_INVALID_TYPE,
      message: 'Định dạng ảnh không được hỗ trợ (chỉ nhận PNG, JPEG hoặc WebP)',
    });
  }

  if (buffer.byteLength > maxBytes) {
    const limitKb = Math.round(maxBytes / 1024);
    throw new PayloadTooLargeException({
      code: ErrorCodes.STORE_ASSET_TOO_LARGE,
      message: `${label} vượt quá giới hạn dung lượng (${limitKb}KB)`,
    });
  }

  return {
    buffer,
    mime: detectedMime,
    canonicalBase64: buffer.toString('base64'),
  };
}
