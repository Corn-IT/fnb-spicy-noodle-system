import { z } from 'zod';

export const VIETQR_BANKS = [
  { code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { code: 'MB', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { code: 'ICB', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { code: 'NAB', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
  { code: 'CAKE', shortName: 'CAKE by VPBank', name: 'Ngân hàng số CAKE by VPBank' },
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
