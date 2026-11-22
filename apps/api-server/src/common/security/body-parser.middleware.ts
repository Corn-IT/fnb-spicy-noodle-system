import { PayloadTooLargeException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';

const DEFAULT_JSON_LIMIT_BYTES = 100 * 1024;
const ASSET_JSON_LIMIT_BYTES = 1024 * 1024;

export function createScopedJsonBodyParserOptions() {
  return {
    limit: '1mb',
    verify: (req: IncomingMessage, _res: unknown, buf: Buffer): void => {
      const rawUrl = (req as { originalUrl?: string; url?: string }).originalUrl ?? req.url ?? '';
      const cleanPath = rawUrl.split('?')[0] ?? '';
      const isAssetUpload =
        req.method === 'PUT' &&
        (cleanPath.startsWith('/api/v1/settings/assets/') || cleanPath === '/api/v1/profile/avatar');
      const limit = isAssetUpload ? ASSET_JSON_LIMIT_BYTES : DEFAULT_JSON_LIMIT_BYTES;

      if (buf.byteLength > limit) {
        const error = new PayloadTooLargeException('Dữ liệu gửi lên vượt quá dung lượng cho phép');
        (error as unknown as { status?: number; statusCode?: number }).status = 413;
        (error as unknown as { status?: number; statusCode?: number }).statusCode = 413;
        throw error;
      }
    },
  };
}
