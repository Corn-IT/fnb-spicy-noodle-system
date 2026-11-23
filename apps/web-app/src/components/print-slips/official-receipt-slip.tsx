import {
  PRINT_TEMPLATE_DEFAULTS,
  StoreAssetKind,
  type PaymentMethod,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';
import {
  getThermalSlipRootStyle,
  resolvePricedModifiers,
  resolveThermalFontSizePt,
} from './print-template.util';

export interface OfficialReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: string[];
  pricedModifiers?: string[];
  note: string | null;
}

export interface OfficialReceiptSlipProps {
  orderCode: string;
  tableLabel: string;
  cashierName?: string | null;
  paidAt?: string | null;
  paymentMethod: PaymentMethod;
  cashAmount: number;
  transferAmount: number;
  subtotalAmount?: number;
  discountAmount?: number;
  discountLabel?: string | null;
  totalAmount: number;
  items: OfficialReceiptItem[];
  storeSettings?: PublicStoreSettingsResponse;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'TIỀN MẶT (CASH)',
  TRANSFER: 'CHUYỂN KHOẢN QR (TRANSFER)',
  SPLIT: 'HỖN HỢP TIỀN MẶT + QR (SPLIT)',
};

function formatReceiptPaidAt(paidAt?: string | null): string {
  if (paidAt && paidAt.trim()) {
    const trimmed = paidAt.trim();
    const isIsoTimestamp = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(trimmed);
    if (!isIsoTimestamp) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(parsed);
    }
    return trimmed;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

export function OfficialReceiptSlip({
  orderCode,
  tableLabel,
  cashierName,
  paidAt,
  paymentMethod,
  cashAmount,
  transferAmount,
  subtotalAmount,
  discountAmount = 0,
  discountLabel,
  totalAmount,
  items,
  storeSettings,
}: OfficialReceiptSlipProps) {
  const { settings: contextSettings } = useStoreSettings();
  const activeSettings = storeSettings ?? contextSettings;
  const tpl = activeSettings.printTemplates.official;
  const fontSizePt = resolveThermalFontSizePt(tpl.fontSizePt);
  const resolvedPrintName = activeSettings.receipt.printName || activeSettings.storeName;
  const resolvedLogoUrl =
    activeSettings.receipt.showLogo && tpl.blocks.logo
      ? buildStoreAssetUrl(StoreAssetKind.LOGO, activeSettings.assets.logo)
      : null;
  const resolvedTitle = tpl.title.trim() || PRINT_TEMPLATE_DEFAULTS.official.title;
  const resolvedFooterNote =
    tpl.footerNote.trim() ||
    activeSettings.receipt.footerNote.trim() ||
    PRINT_TEMPLATE_DEFAULTS.official.footerNoteFallback;

  const formattedPaidAt = formatReceiptPaidAt(paidAt);

  return (
    <div
      data-testid="official-receipt-slip"
      data-font-size-pt={fontSizePt}
      className="ticket-page break-words bg-white px-0 py-0 font-mono text-black"
      style={getThermalSlipRootStyle(fontSizePt)}
    >
      <div className="border-b-2 border-black pb-1 text-center">
        {resolvedLogoUrl ? (
          <img
            src={resolvedLogoUrl}
            alt={`Logo ${resolvedPrintName}`}
            data-testid="official-receipt-logo"
            className="mx-auto mb-0.5 h-9 w-9 object-contain grayscale"
          />
        ) : null}
        <div
          data-print-kind="heading"
          data-print-scale="1.2"
          className="font-extrabold uppercase"
          style={{ fontSize: '1.2em' }}
        >
          {resolvedPrintName}
        </div>
        {tpl.blocks.address && activeSettings.receipt.address ? (
          <div
            data-print-kind="text"
            data-print-scale="0.85"
            data-print-align="center"
            style={{ fontSize: '0.85em' }}
          >
            {activeSettings.receipt.address}
          </div>
        ) : null}
        {tpl.blocks.phone && activeSettings.receipt.phone ? (
          <div
            data-print-kind="text"
            data-print-scale="0.85"
            data-print-align="center"
            style={{ fontSize: '0.85em' }}
          >
            ĐT: {activeSettings.receipt.phone}
          </div>
        ) : null}
        <div
          data-print-kind="heading"
          data-print-scale="1.4"
          className="mt-0.5 font-extrabold uppercase"
          style={{ fontSize: '1.4em' }}
        >
          {resolvedTitle}
        </div>
      </div>

      <div data-print-kind="divider" className="hidden" />

      <div className="my-1 space-y-0.5 border-b border-dashed border-black pb-1" style={{ fontSize: '0.9em' }}>
        <div data-print-kind="pair" data-print-scale="0.9" data-print-bold className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-bold">
          {tpl.blocks.orderCode ? <span>Số HĐ: {orderCode}</span> : <span />}
          <span>Bàn: {tableLabel.toUpperCase()}</span>
        </div>
        <div data-print-kind="pair" data-print-scale="0.9" className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span>Ngày: {formattedPaidAt}</span>
          {tpl.blocks.cashier ? <span>Thu ngân: {cashierName || 'Thu ngân'}</span> : <span />}
        </div>
        <div data-print-kind="pair" data-print-scale="0.9" data-print-bold className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-bold">
          <span>Phương thức thanh toán:</span>
          <span className="text-right" data-testid="official-receipt-payment-method">
            {PAYMENT_METHOD_LABELS[paymentMethod]}
          </span>
        </div>
      </div>

      {/* Bordered 3-column Items Table: Tên món | SL | T.Tiền */}
      {items.length > 0 ? (
        <table
          data-testid="official-items-table"
          data-print-kind="table"
          className="mb-1 w-full border-collapse border border-black text-black"
        >
          <thead>
            <tr>
              <th
                data-print-col-width="62"
                data-print-align="left"
                className="border border-black px-1 py-0.5 text-left font-bold"
              >
                Tên món
              </th>
              <th
                data-print-col-width="12"
                data-print-align="center"
                className="border border-black px-1 py-0.5 text-center font-bold"
              >
                SL
              </th>
              <th
                data-print-col-width="26"
                data-print-align="right"
                className="border border-black px-1 py-0.5 text-right font-bold"
              >
                T.Tiền
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pricedMods = tpl.blocks.itemModifiers
                ? resolvePricedModifiers(item.modifiers, item.pricedModifiers)
                : [];
              return (
                <tr key={`${item.name}-${idx}`}>
                  <td data-print-align="left" className="border border-black px-1 py-0.5 align-top">
                    <div data-print-bold className="font-bold">
                      {idx + 1}. {item.name}
                    </div>
                    {pricedMods.map((mod, mIdx) => (
                      <div
                        key={`${mod}-${mIdx}`}
                        data-print-scale="0.85"
                        className="pl-1.5"
                        style={{ fontSize: '0.85em' }}
                      >
                        + {mod}
                      </div>
                    ))}
                  </td>
                  <td data-print-align="center" className="border border-black px-1 py-0.5 text-center align-top font-semibold">
                    {item.quantity}
                  </td>
                  <td data-print-align="right" className="border border-black px-1 py-0.5 text-right align-top font-bold whitespace-nowrap">
                    {item.lineTotal.toLocaleString('vi-VN')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {/* Payment Breakdown */}
      <div className="space-y-0.5 border-t-2 border-black pt-1">
        {discountAmount > 0 ? (
          <>
            <div data-print-kind="pair" data-print-bold className="flex justify-between font-semibold">
              <span>TỔNG CỘNG TIỀN MÓN:</span>
              <span data-testid="official-receipt-subtotal-amount">
                {(subtotalAmount ?? totalAmount + discountAmount).toLocaleString('vi-VN')} đ
              </span>
            </div>
            <div data-testid="official-receipt-discount-line" data-print-kind="pair" className="flex justify-between">
              <span>GIẢM GIÁ ({discountLabel?.trim() || 'THỦ CÔNG'}):</span>
              <span>-{discountAmount.toLocaleString('vi-VN')} đ</span>
            </div>
          </>
        ) : null}
        <div
          data-print-kind="pair"
          data-print-scale="1.15"
          data-print-bold
          className="flex justify-between font-extrabold"
          style={{ fontSize: '1.15em' }}
        >
          <span>TỔNG TIỀN THANH TOÁN:</span>
          <span data-testid="official-receipt-total-amount">
            {totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>

        {tpl.blocks.paymentBreakdown ? (
          <div data-testid="official-receipt-payment-breakdown" className="space-y-0.5" style={{ fontSize: '0.9em' }}>
            <div data-print-kind="pair" data-print-scale="0.9" className="flex justify-between font-semibold">
              <span>Tiền mặt (CASH):</span>
              <span data-testid="official-receipt-cash-amount">
                {cashAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>

            <div data-print-kind="pair" data-print-scale="0.9" className="flex justify-between font-semibold">
              <span>Chuyển khoản QR (TRANSFER):</span>
              <span data-testid="official-receipt-transfer-amount">
                {transferAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div data-print-kind="divider" className="hidden" />

      <div
        data-testid="official-receipt-footer"
        data-print-kind="text"
        data-print-scale="0.9"
        data-print-align="center"
        data-print-bold
        className="mt-1 whitespace-pre-line border-t border-dashed border-black pt-1 text-center font-extrabold uppercase"
        style={{ fontSize: '0.9em' }}
      >
        {resolvedFooterNote}
      </div>
    </div>
  );
}
