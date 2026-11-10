import { type PaymentMethod } from '@fnb/shared';

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
  totalAmount: number;
  items: OfficialReceiptItem[];
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'TIỀN MẶT (CASH)',
  TRANSFER: 'CHUYỂN KHOẢN QR (TRANSFER)',
  SPLIT: 'HỖN HỢP TIỀN MẶT + QR (SPLIT)',
};

export function OfficialReceiptSlip({
  orderCode,
  tableLabel,
  cashierName,
  paidAt,
  paymentMethod,
  cashAmount,
  transferAmount,
  totalAmount,
  items,
}: OfficialReceiptSlipProps) {
  const formattedPaidAt =
    paidAt ||
    new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());

  return (
    <div
      data-testid="official-receipt-slip"
      className="ticket-page px-3 border-b border-dashed border-black bg-white font-mono text-xs text-black"
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      <div className="border-b-2 border-black pb-2 text-center">
        <div className="text-sm font-extrabold uppercase">QUÁN MÌ CAY SƠN BẢO</div>
        <div className="text-[10px]">ĐC: 123 Đường Số 8, Linh Xuân, TP. Thủ Đức</div>
        <div className="mt-1 text-base font-extrabold uppercase">
          HOÁ ĐƠN THANH TOÁN (PAID)
        </div>
      </div>

      <div className="my-1.5 space-y-0.5 border-b border-dashed border-black pb-1.5 text-[11px]">
        <div className="flex justify-between font-bold">
          <span>Số HĐ: {orderCode}</span>
          <span>Bàn: {tableLabel.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Ngày: {formattedPaidAt}</span>
          <span>Thu ngân: {cashierName || 'Thu ngân'}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Phương thức thanh toán:</span>
          <span data-testid="official-receipt-payment-method">
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
                {item.modifiers.length > 0 ? (
                  <div className="pl-2 text-[11px]">+ {item.modifiers.join(', ')}</div>
                ) : null}
                <div className="flex justify-between text-[11px]">
                  <span>
                    {item.quantity} x {item.unitPrice.toLocaleString('vi-VN')}
                  </span>
                  <span className="font-bold">{item.lineTotal.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Payment Breakdown */}
      <div className="space-y-1 border-t-2 border-black pt-1.5">
        <div className="flex justify-between text-sm font-extrabold">
          <span>TỔNG TIỀN THANH TOÁN:</span>
          <span data-testid="official-receipt-total-amount">
            {totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>

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

      <div className="mt-2 border-t border-dashed border-black pt-2 text-center text-xs font-extrabold uppercase">
        CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!
      </div>
    </div>
  );
}
