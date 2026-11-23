import { getVietQrBankBin } from '@fnb/shared';
import QRCode from 'qrcode';

export interface VietQrEmvOptions {
  /** Bank short code (e.g. 'VCB', 'MB', 'TCB') or 6-digit NAPAS BIN */
  bankCode: string;
  /** Destination bank account number */
  accountNo: string;
  /** Amount in VND (integer >= 0); when > 0 builds dynamic QR (01=12) */
  amount?: number;
  /** Transfer memo / addInfo (automatically normalized to ASCII) */
  memo?: string;
}

function formatTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Strips Vietnamese diacritics and unsafe symbols for NAPAS Tag 62.08 transfer memo.
 */
export function sanitizeVietQrMemo(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (ch) => (ch === 'Đ' ? 'D' : 'd'))
    .replace(/[^A-Za-z0-9 .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Computes EMVCo CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 uppercase hex digits.
 */
export function computeEmvCrc16(payloadWithTag6304: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithTag6304.length; i += 1) {
    crc ^= (payloadWithTag6304.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Builds an official NAPAS247 / EMVCo VietQR payload string (QRIBFTTA) completely offline.
 * Returns null if the bank BIN cannot be resolved or accountNo is empty.
 */
export function buildVietQrEmvPayload(options: VietQrEmvOptions): string | null {
  const bin = getVietQrBankBin(options.bankCode);
  const accountNo = options.accountNo.trim().replace(/\s+/g, '');
  if (!bin || !accountNo) return null;

  const numericAmount =
    typeof options.amount === 'number' && Number.isFinite(options.amount)
      ? Math.max(0, Math.round(options.amount))
      : 0;

  const beneficiary = formatTlv('00', bin) + formatTlv('01', accountNo);
  const merchantAccount =
    formatTlv('00', 'A000000727') +
    formatTlv('01', beneficiary) +
    formatTlv('02', 'QRIBFTTA');

  const parts: string[] = [
    formatTlv('00', '01'),
    formatTlv('01', numericAmount > 0 ? '12' : '11'),
    formatTlv('38', merchantAccount),
    formatTlv('53', '704'),
  ];

  if (numericAmount > 0) {
    parts.push(formatTlv('54', String(numericAmount)));
  }

  parts.push(formatTlv('58', 'VN'));

  const cleanMemo = options.memo ? sanitizeVietQrMemo(options.memo) : '';
  if (cleanMemo) {
    parts.push(formatTlv('62', formatTlv('08', cleanMemo)));
  }

  const withoutCrc = `${parts.join('')}6304`;
  const crc = computeEmvCrc16(withoutCrc);
  return `${withoutCrc}${crc}`;
}

/**
 * Generates a same-origin PNG Data URL (data:image/png;base64,...) for an EMVCo VietQR payload.
 * Never taints HTML5 Canvas and works 100% offline.
 */
export async function generateVietQrDataUrl(
  options: VietQrEmvOptions,
  width = 240,
): Promise<{ payload: string; dataUrl: string } | null> {
  const payload = buildVietQrEmvPayload(options);
  if (!payload) return null;

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  return { payload, dataUrl };
}
