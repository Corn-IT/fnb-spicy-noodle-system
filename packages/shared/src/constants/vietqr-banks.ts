import { z } from 'zod';

export const VIETQR_BANKS = [
  { code: 'VPB', bin: '970432', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { code: 'VCB', bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { code: 'TCB', bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { code: 'MB', bin: '970422', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { code: 'ACB', bin: '970416', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { code: 'BIDV', bin: '970418', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { code: 'ICB', bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { code: 'VBA', bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { code: 'TPB', bin: '970423', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { code: 'STB', bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { code: 'VIB', bin: '970441', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { code: 'HDB', bin: '970437', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { code: 'SHB', bin: '970443', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { code: 'MSB', bin: '970426', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { code: 'OCB', bin: '970448', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { code: 'SEAB', bin: '970440', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { code: 'EIB', bin: '970431', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { code: 'LPB', bin: '970449', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { code: 'NAB', bin: '970428', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
  { code: 'CAKE', bin: '546034', shortName: 'CAKE by VPBank', name: 'Ngân hàng số CAKE by VPBank' },
] as const;

export type VietQrBankInfo = (typeof VIETQR_BANKS)[number];

export const VietQrBankCodeValues = [
  'VPB',
  'VCB',
  'TCB',
  'MB',
  'ACB',
  'BIDV',
  'ICB',
  'VBA',
  'TPB',
  'STB',
  'VIB',
  'HDB',
  'SHB',
  'MSB',
  'OCB',
  'SEAB',
  'EIB',
  'LPB',
  'NAB',
  'CAKE',
] as const;

export const VietQrBankCodeSchema = z.enum(VietQrBankCodeValues);
export type VietQrBankCode = z.infer<typeof VietQrBankCodeSchema>;

export function findVietQrBank(code: string): VietQrBankInfo | undefined {
  const normalized = code.trim().toUpperCase();
  return VIETQR_BANKS.find((bank) => bank.code === normalized);
}

export function getVietQrBankShortName(code: string): string {
  return findVietQrBank(code)?.shortName ?? code.trim().toUpperCase();
}

export function getVietQrBankBin(code: string): string | undefined {
  const bank = findVietQrBank(code);
  if (bank) return bank.bin;
  const trimmed = code.trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : undefined;
}
