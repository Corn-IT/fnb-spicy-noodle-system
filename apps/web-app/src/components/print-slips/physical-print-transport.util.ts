import {
  LanEscPosPrintResponseSchema,
  type LanEscPosPrintResponse,
  type ThermalPrinterDeviceConfig,
} from '@fnb/shared';
import { apiClient } from '@/lib/api-client';
import { uint8ArrayToBase64 } from './escpos-encoder.util';

export interface PhysicalPrintDispatchResult {
  transport: 'RAWBT_WS' | 'RAWBT_INTENT' | 'LAN_ESCPOS';
  bytesSent: number;
  rawbtUri?: string;
  lanResponse?: LanEscPosPrintResponse;
}

export interface RawbtDispatchOptions {
  wsUrl?: string;
  fallbackToIntent?: boolean;
  wsTimeoutMs?: number;
  onIntentUri?: (uri: string) => void;
}

/**
 * Sends raw ESC/POS binary bytes to the local RawBT WebSocket server on Android (`ws://127.0.0.1:40213/`).
 */
export function sendEscPosViaRawbtWebSocket(
  escPosBytes: Uint8Array,
  wsUrl = 'ws://127.0.0.1:40213/',
  timeoutMs = 1800,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof WebSocket === 'undefined') {
      reject(new Error('Trình duyệt không hỗ trợ WebSocket'));
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Không thể khởi tạo RawBT WebSocket'));
      return;
    }

    socket.binaryType = 'arraybuffer';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
      reject(new Error(`Quá thời gian kết nối RawBT WebSocket (${timeoutMs}ms)`));
    }, timeoutMs);

    const finalize = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    socket.onopen = () => {
      try {
        socket.send(escPosBytes);
        socket.close(1000, 'ESC/POS print job sent');
        finalize();
      } catch (sendErr) {
        finalize(
          sendErr instanceof Error ? sendErr : new Error('Lỗi gửi dữ liệu tới RawBT WebSocket'),
        );
      }
    };

    socket.onerror = () => {
      finalize(new Error('Không kết nối được RawBT WebSocket tại ' + wsUrl));
    };
  });
}

/**
 * Triggers the Android RawBT URI scheme (`rawbt:base64,...`) without unloading the POS SPA tab.
 */
export function triggerRawbtIntentUri(
  escPosBytes: Uint8Array,
  customHandler?: (uri: string) => void,
): string {
  const base64Payload = uint8ArrayToBase64(escPosBytes);
  const uri = `rawbt:base64,${base64Payload}`;

  if (customHandler) {
    customHandler(uri);
    return uri;
  }

  if (typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = uri;
    anchor.style.display = 'none';
    anchor.setAttribute('data-testid', 'rawbt-intent-trigger');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  return uri;
}

/**
 * Dispatches an ESC/POS payload to an Android USB thermal printer (`iMin D3-505` + `iPOS iTP6`)
 * via RawBT WebSocket first, falling back to `rawbt:base64,...` intent URI if enabled.
 */
export async function dispatchRawbtUsbPrint(
  escPosBytes: Uint8Array,
  options: RawbtDispatchOptions = {},
): Promise<PhysicalPrintDispatchResult> {
  const wsUrl = options.wsUrl?.trim() || 'ws://127.0.0.1:40213/';
  const fallbackToIntent = options.fallbackToIntent ?? true;
  const wsTimeoutMs = options.wsTimeoutMs ?? 1800;

  try {
    await sendEscPosViaRawbtWebSocket(escPosBytes, wsUrl, wsTimeoutMs);
    return {
      transport: 'RAWBT_WS',
      bytesSent: escPosBytes.byteLength,
    };
  } catch (wsErr) {
    if (!fallbackToIntent) {
      throw wsErr;
    }
    const rawbtUri = triggerRawbtIntentUri(escPosBytes, options.onIntentUri);
    return {
      transport: 'RAWBT_INTENT',
      bytesSent: escPosBytes.byteLength,
      rawbtUri,
    };
  }
}

/**
 * Dispatches an ESC/POS payload to a LAN Ethernet thermal printer (`Port 4 RJ45` on `iPOS iTP6`, TCP :9100)
 * through the backend `/api/v1/pos/print/lan-escpos` endpoint.
 */
export async function dispatchLanEscPosPrint(
  escPosBytes: Uint8Array,
  config: Pick<ThermalPrinterDeviceConfig, 'lanHost' | 'lanPort' | 'lanTimeoutMs'>,
): Promise<PhysicalPrintDispatchResult> {
  const payloadBase64 = uint8ArrayToBase64(escPosBytes);
  const rawResponse = await apiClient.post<unknown>('/api/v1/pos/print/lan-escpos', {
    host: config.lanHost.trim(),
    port: config.lanPort,
    payloadBase64,
    timeoutMs: config.lanTimeoutMs,
  });

  const parsed = LanEscPosPrintResponseSchema.safeParse(rawResponse);
  const lanResponse: LanEscPosPrintResponse = parsed.success
    ? parsed.data
    : {
        success: true,
        host: config.lanHost.trim(),
        port: config.lanPort,
        bytesSent: escPosBytes.byteLength,
        durationMs: 0,
      };

  return {
    transport: 'LAN_ESCPOS',
    bytesSent: lanResponse.bytesSent,
    lanResponse,
  };
}
