import { type ProvisionalBillResponse } from '@fnb/shared';
import * as React from 'react';

import {
  buildVietQrFallbackSvgDataUrl,
  buildVietQrImageUrl,
  buildVietQrTransferMemo,
} from './vietqr-url.util';

export interface ProvisionalVietQrSlipData extends ProvisionalBillResponse {
  tableLabel?: string | null;
  cashierName?: string | null;
  createdAt?: string | null;
  printedAt?: string | null;
}

export interface ProvisionalVietQrSlipProps {
  bill: ProvisionalVietQrSlipData;
  onReadyToPrint?: () => void;
}

export function ProvisionalVietQrSlip({ bill, onReadyToPrint }: ProvisionalVietQrSlipProps) {
  const initialQrUrl = React.useMemo(() => {
    if (bill.vietQrPayload && bill.vietQrPayload.trim()) {
      return bill.vietQrPayload.trim();
    }
    return buildVietQrImageUrl({
      amount: bill.totalAmount,
      orderCode: bill.orderCode,
    });
  }, [bill.vietQrPayload, bill.totalAmount, bill.orderCode]);

  const [qrSrc, setQrSrc] = React.useState<string>(initialQrUrl);
  const hasNotifiedRef = React.useRef(false);

  React.useEffect(() => {
    setQrSrc(initialQrUrl);
    hasNotifiedRef.current = false;
  }, [initialQrUrl]);

  const notifyReadyOnce = React.useCallback(() => {
    if (hasNotifiedRef.current) return;
    hasNotifiedRef.current = true;
    onReadyToPrint?.();
  }, [onReadyToPrint]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      notifyReadyOnce();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [notifyReadyOnce]);

  const handleImageError = () => {
    const fallbackDataUrl = buildVietQrFallbackSvgDataUrl({
      amount: bill.totalAmount,
      orderCode: bill.orderCode,
    });
    if (qrSrc !== fallbackDataUrl) {
      setQrSrc(fallbackDataUrl);
    }
    notifyReadyOnce();
  };

  const resolvedTableDisplay = React.useMemo(() => {
    if (bill.tableLabel) return bill.tableLabel.toUpperCase();
    if (bill.orderType === 'TAKEAWAY') {
      return `MANG VỀ #${String(bill.takeawayNumber ?? 1).padStart(2, '0')}`;
    }
    return `BÀN ${String(bill.tableId ?? 1).padStart(2, '0')}`;
  }, [bill.tableLabel, bill.orderType, bill.takeawayNumber, bill.tableId]);

  const transferMemo = buildVietQrTransferMemo(bill.orderCode);

  return (
    <div
      data-testid="provisional-vietqr-slip"
      className="ticket-page px-3 border-b border-dashed border-black bg-white font-mono text-xs text-black"
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      <div className="border-b-2 border-black pb-2 text-center">
        <div className="text-sm font-extrabold uppercase">QUÁN MÌ CAY SƠN BẢO</div>
        <div className="text-[10px]">ĐC: 123 Đường Số 8, Linh Xuân, TP. Thủ Đức</div>
        <div className="mt-1 text-base font-extrabold uppercase">PHIẾU TẠM TÍNH</div>
      </div>

      <div className="my-1.5 space-y-0.5 border-b border-dashed border-black pb-1.5 text-[11px]">
        <div className="flex justify-between font-bold">
          <span>Số Bàn: {resolvedTableDisplay}</span>
          <span>Mã HĐ: {bill.orderCode}</span>
        </div>
        <div className="flex justify-between">
          <span>Thu ngân: {bill.cashierName || 'Thu ngân'}</span>
          <span>Trạng thái: {bill.status}</span>
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex justify-between border-b border-black pb-1 text-[11px] font-bold">
          <span>Tên món</span>
          <span>SL x Đ.Giá = T.Tiền</span>
        </div>

        <div className="divide-y divide-dashed divide-black">
          {bill.items.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="py-1">
              <div className="font-bold">{item.name}</div>
              {item.modifiers.length > 0 ? (
                <div className="pl-2 text-[11px]">+ {item.modifiers.join(', ')}</div>
              ) : null}
              {item.note ? <div className="pl-2 text-[11px] italic">Ghi chú: {item.note}</div> : null}
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

      {/* Totals */}
      <div className="mt-1.5 space-y-1 border-t-2 border-black pt-1.5">
        <div className="flex justify-between text-xs font-semibold">
          <span>TỔNG CỘNG TIỀN MÓN:</span>
          <span>{bill.totalAmount.toLocaleString('vi-VN')} đ</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>GIẢM GIÁ (0%):</span>
          <span>0 đ</span>
        </div>
        <div className="flex justify-between border-t border-dashed border-black pt-1 text-sm font-extrabold">
          <span>TỔNG THANH TOÁN:</span>
          <span data-testid="provisional-total-amount">
            {bill.totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>
      </div>

      {/* Dynamic VietQR Napas247 Section */}
      <div className="mt-2 flex flex-col items-center border-t border-dashed border-black pt-2 text-center">
        <div className="text-[11px] font-extrabold uppercase">
          QUÉT MÃ VIETQR ĐỂ CHUYỂN KHOẢN TỰ ĐỘNG
        </div>
        <img
          data-testid="provisional-vietqr-image"
          src={qrSrc}
          alt={`VietQR ${transferMemo}`}
          onLoad={notifyReadyOnce}
          onError={handleImageError}
          className="my-1.5 h-44 w-44 object-contain"
        />
        <div className="text-[11px] font-bold">
          Nội dung CK: <span className="underline">{transferMemo}</span>
        </div>
        <div className="mt-1.5 text-[10px] font-semibold italic">
          Phiếu này dùng để kiểm tra món ăn. Quý khách vui lòng không dùng làm hoá đơn tài chính.
        </div>
      </div>
    </div>
  );
}
