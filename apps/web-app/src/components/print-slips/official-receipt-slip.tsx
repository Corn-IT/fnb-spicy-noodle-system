import {
  PRINT_TEMPLATE_DEFAULTS,
  StoreAssetKind,
  type PaymentMethod,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';

export interface OfficialReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: string[];
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
      className="ticket-page break-words border-b border-dashed border-black bg-white px-4 font-mono text-xs text-black"
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      <div className="border-b-2 border-black pb-2 text-center">
        {resolvedLogoUrl ? (
          <img
            src={resolvedLogoUrl}
            alt={`Logo ${resolvedPrintName}`}
            data-testid="official-receipt-logo"
            className="mx-auto mb-1 h-10 w-10 object-contain grayscale"
          />
        ) : null}
        <div className="text-sm font-extrabold uppercase">{resolvedPrintName}</div>
        {tpl.blocks.address && activeSettings.receipt.address ? (
          <div className="text-[10px]">{activeSettings.receipt.address}</div>
        ) : null}
        {tpl.blocks.phone && activeSettings.receipt.phone ? (
          <div className="text-[10px]">ĐT: {activeSettings.receipt.phone}</div>
        ) : null}
        <div className="mt-1 text-base font-extrabold uppercase">{resolvedTitle}</div>
      </div>

      <div className="my-1.5 space-y-0.5 border-b border-dashed border-black pb-1.5 text-[11px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-bold">
          {tpl.blocks.orderCode ? <span>Số HĐ: {orderCode}</span> : <span />}
          <span>Bàn: {tableLabel.toUpperCase()}</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span>Ngày: {formattedPaidAt}</span>
          {tpl.blocks.cashier ? <span>Thu ngân: {cashierName || 'Thu ngân'}</span> : null}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-bold">
          <span>Phương thức thanh toán:</span>
          <span className="text-right" data-testid="official-receipt-payment-method">
            {PAYMENT_METHOD_LABELS[paymentMethod]}
          </span>
        </div>
      </div>

      {/* Items */}
      {items.length > 0 ? (
        <div className="mb-1.5">
          <div className="flex justify-between border-b border-black pb-1 text-[11px] font-bold">
            <span>Tên món</span>
            <span>SL x Đ.Giá = T.Tiền</span>
          </div>
          <div className="divide-y divide-dashed divide-black">
            {items.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="py-1">
                <div className="font-bold">{item.name}</div>
                {tpl.blocks.itemModifiers && item.modifiers.length > 0 ? (
                  <div className="pl-2 text-[11px]">+ {item.modifiers.join(', ')}</div>
                ) : null}
                <div className="flex justify-between text-[11px]">
                  <span>
                    {item.quantity} x {item.unitPrice.toLocaleString('vi-VN')}
                  </span>
                  <span className="font-bold">{item.lineTotal.toLocaleString('vi-VN')} đ</span>
                </div>
                {tpl.blocks.itemNotes && item.note && item.note.trim() ? (
                  <div className="mt-0.5 pl-2 text-[11px] italic font-semibold">
                    Ghi chú: {item.note.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Payment Breakdown */}
      <div className="space-y-1 border-t-2 border-black pt-1.5">
        {discountAmount > 0 ? (
          <>
            <div className="flex justify-between text-xs font-semibold">
              <span>TỔNG CỘNG TIỀN MÓN:</span>
              <span data-testid="official-receipt-subtotal-amount">
                {(subtotalAmount ?? totalAmount + discountAmount).toLocaleString('vi-VN')} đ
              </span>
            </div>
            <div data-testid="official-receipt-discount-line" className="flex justify-between text-xs">
              <span>GIẢM GIÁ ({discountLabel?.trim() || 'THỦ CÔNG'}):</span>
              <span>-{discountAmount.toLocaleString('vi-VN')} đ</span>
            </div>
          </>
        ) : null}
        <div className="flex justify-between text-sm font-extrabold">
          <span>TỔNG TIỀN THANH TOÁN:</span>
          <span data-testid="official-receipt-total-amount">
            {totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>

        {tpl.blocks.paymentBreakdown ? (
          <div data-testid="official-receipt-payment-breakdown" className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold">
              <span>Tiền mặt (CASH):</span>
              <span data-testid="official-receipt-cash-amount">
                {cashAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>

            <div className="flex justify-between text-[11px] font-semibold">
              <span>Chuyển khoản QR (TRANSFER):</span>
              <span data-testid="official-receipt-transfer-amount">
                {transferAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div
        data-testid="official-receipt-footer"
        className="mt-2 whitespace-pre-line border-t border-dashed border-black pt-2 text-center text-xs font-extrabold uppercase"
      >
        {resolvedFooterNote}
      </div>
    </div>
  );
}
