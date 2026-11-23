import { describe, expect, it } from 'vitest';

import {
  buildVietQrEmvPayload,
  computeEmvCrc16,
  generateVietQrDataUrl,
  sanitizeVietQrMemo,
} from '../vietqr-emv.util';

describe('vietqr-emv.util (offline NAPAS247 EMVCo VietQR)', () => {
  it('computes standard EMVCo CRC-16/CCITT-FALSE check value (123456789 -> 29B1)', () => {
    expect(computeEmvCrc16('123456789')).toBe('29B1');
  });

  it('builds valid dynamic EMVCo VietQR payload with NAPAS GUID, BIN, account, amount, VND 704, memo, and CRC', () => {
    const payload = buildVietQrEmvPayload({
      bankCode: 'VCB',
      accountNo: '1012345678',
      amount: 310000,
      memo: 'TT B02 HD-20261122-0015',
    });

    expect(payload).not.toBeNull();
    expect(payload).toContain('000201');
    expect(payload).toContain('010212'); // dynamic
    expect(payload).toContain('A000000727'); // NAPAS GUID
    expect(payload).toContain('970436'); // VCB BIN
    expect(payload).toContain('1012345678');
    expect(payload).toContain('QRIBFTTA');
    expect(payload).toContain('5303704'); // VND
    expect(payload).toContain('5406310000');
    expect(payload).toContain('5802VN');
    expect(payload).toContain('0823TT B02 HD-20261122-0015');

    // Verify trailing CRC16 matches recomputation
    const bodyWithoutCrc = payload!.slice(0, -4);
    const crc = payload!.slice(-4);
    expect(crc).toBe(computeEmvCrc16(bodyWithoutCrc));
  });

  it('builds static QR (01=11) without tag 54 when amount is 0 and normalizes Vietnamese memo', () => {
    expect(sanitizeVietQrMemo('Thanh toán Bàn 02 — ĐẶC BIỆT!')).toBe('Thanh toan Ban 02 DAC BIET');

    const payload = buildVietQrEmvPayload({
      bankCode: 'MB',
      accountNo: '0967622716',
      amount: 0,
      memo: 'Mì cay Bàn 01',
    });
    expect(payload).toContain('010211');
    expect(payload).toContain('970422');
    expect(payload).not.toContain('5401');
    expect(payload).toContain('Mi cay Ban 01');
  });

  it('returns null for unknown bank code or empty account number', () => {
    expect(buildVietQrEmvPayload({ bankCode: 'UNKNOWN', accountNo: '123456' })).toBeNull();
    expect(buildVietQrEmvPayload({ bankCode: 'VCB', accountNo: '   ' })).toBeNull();
  });

  it('generates a same-origin PNG data URL offline', async () => {
    const res = await generateVietQrDataUrl({
      bankCode: 'TCB',
      accountNo: '19031234567890',
      amount: 125000,
      memo: 'TT B05 HD-001',
    });
    expect(res).not.toBeNull();
    expect(res!.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(res!.payload).toContain('970407');
  });
});
