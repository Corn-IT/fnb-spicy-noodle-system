import { formatTakeawayShortCode, type TakeawayLabelFormat } from '@fnb/shared';

export interface VietQrTableOptions {
  tableLabel?: string | null;
  tableId?: number | null;
  orderType?: string | null;
  takeawayNumber?: number | null;
  takeawayLabelFormat?: TakeawayLabelFormat | null;
}

export interface VietQrFallbackOptions extends VietQrTableOptions {
  amount: number;
  orderCode: string;
}

export interface VietQrUrlOptions extends VietQrFallbackOptions {
  bankId: string;
  accountNo: string;
  accountName: string;
}

export function formatTableOrTakeawayShortCode(
  options?: VietQrTableOptions | string | null,
): string {
  if (!options) return '';
  if (typeof options === 'string') {
    const digits = options.match(/\d+/);
    return digits ? `B${digits[0].padStart(2, '0')}` : options.replace(/\s+/g, '').toUpperCase();
  }
  if (options.orderType === 'TAKEAWAY' || options.takeawayNumber) {
    if (options.takeawayLabelFormat) {
      return formatTakeawayShortCode(options.takeawayNumber ?? 1, options.takeawayLabelFormat);
    }
    if (options.tableLabel && options.tableLabel.trim()) {
      const hashMatch = /#([A-Za-z0-9]+)/.exec(options.tableLabel.trim());
      if (hashMatch?.[1]) {
        return `MV${hashMatch[1].toUpperCase()}`;
      }
    }
    return formatTakeawayShortCode(options.takeawayNumber ?? 1, 'NUMBER');
  }
  if (options.tableLabel && options.tableLabel.trim()) {
    const label = options.tableLabel.trim();
    const digits = label.match(/\d+/);
    if (digits) {
      return `B${digits[0].padStart(2, '0')}`;
    }
    return label.replace(/\s+/g, '').toUpperCase();
  }
  if (options.tableId != null) {
    return `B${String(options.tableId).padStart(2, '0')}`;
  }
  return '';
}

export function buildVietQrTransferMemo(
  orderCode: string,
  tableInfo?: VietQrTableOptions | string | null,
): string {
  const cleanCode = orderCode.trim();
  const tableCode = formatTableOrTakeawayShortCode(tableInfo);
  if (tableCode) {
    return `TT ${tableCode} ${cleanCode}`;
  }
  return `TT ${cleanCode}`;
}

export function buildVietQrImageUrl(options: VietQrUrlOptions): string {
  const bankId = options.bankId.trim();
  const accountNo = options.accountNo.trim();
  const accountName = options.accountName.trim();
  const numericAmount = Math.max(0, Math.round(options.amount));
  const addInfo = buildVietQrTransferMemo(options.orderCode, {
    tableLabel: options.tableLabel,
    tableId: options.tableId,
    orderType: options.orderType,
    takeawayNumber: options.takeawayNumber,
    takeawayLabelFormat: options.takeawayLabelFormat,
  });

  const query = new URLSearchParams({
    amount: String(numericAmount),
    addInfo,
    accountName,
  });

  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?${query.toString()}`;
}

export function buildVietQrFallbackSvgDataUrl(options: VietQrFallbackOptions): string {
  const numericAmount = Math.max(0, Math.round(options.amount));
  const memo = buildVietQrTransferMemo(options.orderCode, {
    tableLabel: options.tableLabel,
    tableId: options.tableId,
    orderType: options.orderType,
    takeawayNumber: options.takeawayNumber,
    takeawayLabelFormat: options.takeawayLabelFormat,
  });
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
