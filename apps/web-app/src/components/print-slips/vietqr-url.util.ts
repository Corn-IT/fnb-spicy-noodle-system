export interface VietQrUrlOptions {
  amount: number;
  orderCode: string;
  bankId?: string;
  accountNo?: string;
  accountName?: string;
}

const DEFAULT_VIETQR_BANK_ID = 'VCB';
const DEFAULT_VIETQR_ACCOUNT_NO = '1023456789';
const DEFAULT_VIETQR_ACCOUNT_NAME = 'QUAN MI CAY SON BAO';

export function buildVietQrTransferMemo(orderCode: string): string {
  const cleanCode = orderCode.trim();
  return `TT ${cleanCode}`;
}

export function buildVietQrImageUrl(options: VietQrUrlOptions): string {
  const bankId = (options.bankId || DEFAULT_VIETQR_BANK_ID).trim();
  const accountNo = (options.accountNo || DEFAULT_VIETQR_ACCOUNT_NO).trim();
  const accountName = (options.accountName || DEFAULT_VIETQR_ACCOUNT_NAME).trim();
  const numericAmount = Math.max(0, Math.round(options.amount));
  const addInfo = buildVietQrTransferMemo(options.orderCode);

  const query = new URLSearchParams({
    amount: String(numericAmount),
    addInfo,
    accountName,
  });

  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?${query.toString()}`;
}

export function buildVietQrFallbackSvgDataUrl(options: VietQrUrlOptions): string {
  const numericAmount = Math.max(0, Math.round(options.amount));
  const memo = buildVietQrTransferMemo(options.orderCode);
  const seedText = `${memo}|${numericAmount}`;

  // Generate deterministic 11x11 high-contrast matrix pattern from orderCode & amount
  const cells: string[] = [];
  for (let row = 0; row < 11; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      const isFinderTopLeft = row < 3 && col < 3;
      const isFinderTopRight = row < 3 && col >= 8;
      const isFinderBottomLeft = row >= 8 && col < 3;
      const charCode = seedText.charCodeAt((row * 11 + col) % seedText.length) || 65;
      const isDark =
        isFinderTopLeft ||
        isFinderTopRight ||
        isFinderBottomLeft ||
        (charCode + row * 7 + col * 13) % 2 === 0;
      if (isDark) {
        const x = 18 + col * 14;
        const y = 18 + row * 14;
        cells.push(`<rect x="${x}" y="${y}" width="12" height="12" fill="#000"/>`);
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 220" width="190" height="220"><rect width="190" height="220" fill="#fff" stroke="#000" stroke-width="4"/>${cells.join('')}<text x="95" y="192" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#000">${memo}</text><text x="95" y="208" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#000">${numericAmount.toLocaleString('vi-VN')} VND</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
