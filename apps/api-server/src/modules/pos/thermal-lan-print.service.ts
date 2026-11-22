import * as net from 'node:net';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  isAllowedLanPrinterHost,
  type LanEscPosPrintRequest,
  type LanEscPosPrintResponse,
} from '@fnb/shared';

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

@Injectable()
export class ThermalLanPrintService {
  async sendEscPosPayload(input: LanEscPosPrintRequest): Promise<LanEscPosPrintResponse> {
    const host = input.host.trim();
    const port = input.port ?? 9100;
    const timeoutMs = input.timeoutMs ?? 4000;

    if (!isAllowedLanPrinterHost(host)) {
      throw new BadRequestException({
        message:
          'Địa chỉ IP máy in phải nằm trong dải mạng nội bộ LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x hoặc 127.0.0.1)',
      });
    }

    const cleanBase64 = input.payloadBase64.replace(/\s+/g, '');
    if (!cleanBase64 || cleanBase64.length % 4 !== 0 || !BASE64_REGEX.test(cleanBase64)) {
      throw new BadRequestException({
        message: 'Dữ liệu lệnh in ESC/POS (Base64) không hợp lệ',
      });
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.byteLength === 0) {
      throw new BadRequestException({
        message: 'Dữ liệu lệnh in ESC/POS không được rỗng',
      });
    }

    const startedAt = Date.now();

    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        if (err) {
          socket.destroy();
          reject(err);
        } else {
          resolve();
        }
      };

      socket.setTimeout(timeoutMs);

      socket.once('timeout', () => {
        finish(new Error(`Quá thời gian phản hồi (${timeoutMs}ms)`));
      });

      socket.once('error', (err: Error) => {
        finish(err);
      });

      socket.once('close', (hadError: boolean) => {
        if (!hadError) {
          finish();
        }
      });

      socket.connect(port, host, () => {
        socket.write(buffer, (writeErr) => {
          if (writeErr) {
            finish(writeErr);
            return;
          }
          socket.end();
        });
      });
    }).catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : 'Lỗi kết nối TCP';
      throw new ServiceUnavailableException({
        message: `Không thể kết nối máy in nhiệt LAN tại ${host}:${port} (${detail}). Vui lòng kiểm tra nguồn máy in và cáp mạng RJ45.`,
      });
    });

    return {
      success: true,
      host,
      port,
      bytesSent: buffer.byteLength,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }
}
