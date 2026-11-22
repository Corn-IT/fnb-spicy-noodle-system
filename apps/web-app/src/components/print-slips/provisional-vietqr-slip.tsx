import {
  PRINT_TEMPLATE_DEFAULTS,
  StoreAssetKind,
  type ProvisionalBillResponse,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import * as React from 'react';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';

import {
  buildVietQrFallbackSvgDataUrl,
  buildVietQrImageUrl,
  buildVietQrTransferMemo,
} from './vietqr-url.util';

const ORDER_STATUS_LABELS: Record<string, string> = {
  SERVING: 'Đang phục vụ',
  PENDING: 'Mới gọi món',
  PAID: 'Đã thanh toán',
  VOIDED: 'Đã huỷ',
  MERGED: 'Đã gộp',
};

export interface ProvisionalVietQrSlipData extends ProvisionalBillResponse {
  tableLabel?: string | null;
  cashierName?: string | null;
  createdAt?: string | null;
  printedAt?: string | null;
}

export interface ProvisionalVietQrSlipProps {
  bill: ProvisionalVietQrSlipData;
  onReadyToPrint?: () => void;
  storeSettings?: PublicStoreSettingsResponse;
}

export function ProvisionalVietQrSlip({ bill, onReadyToPrint, storeSettings }: ProvisionalVietQrSlipProps) {
  const { settings: contextSettings } = useStoreSettings();
  const activeSettings = storeSettings ?? contextSettings;
  const tpl = activeSettings.printTemplates.provisional;
  const resolvedPrintName = activeSettings.receipt.printName || activeSettings.storeName;
  const resolvedLogoUrl =
    activeSettings.receipt.showLogo && tpl.blocks.logo
      ? buildStoreAssetUrl(StoreAssetKind.LOGO, activeSettings.assets.logo)
      : null;
  const resolvedTitle = tpl.title.trim() || PRINT_TEMPLATE_DEFAULTS.provisional.title;
  const resolvedFooterNote = tpl.footerNote.trim() || activeSettings.receipt.footerNote.trim();
  const initialQrUrl = React.useMemo(() => {
    if (bill.vietQrPayload && bill.vietQrPayload.trim()) {
      return bill.vietQrPayload.trim();
    }
    if (bill.paymentAccount) {
      return buildVietQrImageUrl({
        amount: bill.totalAmount,
        orderCode: bill.orderCode,
        bankId: bill.paymentAccount.bankCode,
        accountNo: bill.paymentAccount.accountNo,
        accountName: bill.paymentAccount.accountName,
        tableLabel: bill.tableLabel,
        tableId: bill.tableId,
        orderType: bill.orderType,
        takeawayNumber: bill.takeawayNumber,
      });
    }
    return buildVietQrFallbackSvgDataUrl({
      amount: bill.totalAmount,
      orderCode: bill.orderCode,
      tableLabel: bill.tableLabel,
      tableId: bill.tableId,
      orderType: bill.orderType,
      takeawayNumber: bill.takeawayNumber,
    });
  }, [
    bill.vietQrPayload,
    bill.paymentAccount,
    bill.totalAmount,
    bill.orderCode,
    bill.tableLabel,
    bill.tableId,
    bill.orderType,
    bill.takeawayNumber,
  ]);

  const [qrSrc, setQrSrc] = React.useState<string>(initialQrUrl);
  const hasNotifiedRef = React.useRef(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    setQrSrc(initialQrUrl);
    hasNotifiedRef.current = false;
  }, [initialQrUrl]);

  const notifyReadyOnce = React.useCallback(() => {
    if (hasNotifiedRef.current) return;
    hasNotifiedRef.current = true;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onReadyToPrint?.();
        });
      });
    } else {
      onReadyToPrint?.();
    }
  }, [onReadyToPrint]);

  // Check if image is already cached/complete on mount or src change
  React.useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      notifyReadyOnce();
    }
  }, [qrSrc, notifyReadyOnce]);

  const handleImageError = React.useCallback(() => {
    const fallbackDataUrl = buildVietQrFallbackSvgDataUrl({
      amount: bill.totalAmount,
      orderCode: bill.orderCode,
      tableLabel: bill.tableLabel,
      tableId: bill.tableId,
      orderType: bill.orderType,
      takeawayNumber: bill.takeawayNumber,
    });
    if (qrSrc !== fallbackDataUrl) {
      setQrSrc(fallbackDataUrl);
    }
    notifyReadyOnce();
  }, [
    bill.totalAmount,
    bill.orderCode,
    bill.tableLabel,
    bill.tableId,
    bill.orderType,
    bill.takeawayNumber,
    qrSrc,
    notifyReadyOnce,
  ]);

  // Safety fallback timeout: if external network hangs, fall back to SVG after 3500ms
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = imgRef.current;
      if (!el || !el.complete || el.naturalWidth === 0) {
        handleImageError();
      } else {
        notifyReadyOnce();
      }
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [handleImageError, notifyReadyOnce]);

  const resolvedTableDisplay = React.useMemo(() => {
    if (bill.tableLabel) return bill.tableLabel.toUpperCase();
    if (bill.orderType === 'TAKEAWAY') {
      return `MANG VỀ #${String(bill.takeawayNumber ?? 1).padStart(2, '0')}`;
    }
    return `BÀN ${String(bill.tableId ?? 1).padStart(2, '0')}`;
  }, [bill.tableLabel, bill.orderType, bill.takeawayNumber, bill.tableId]);

  const transferMemo = buildVietQrTransferMemo(bill.orderCode, {
    tableLabel: bill.tableLabel,
    tableId: bill.tableId,
    orderType: bill.orderType,
    takeawayNumber: bill.takeawayNumber,
  });

  const resolvedStatusLabel = ORDER_STATUS_LABELS[bill.status] ?? bill.status;

  return (
    <div
      data-testid="provisional-vietqr-slip"
      className="ticket-page px-4 border-b border-dashed border-black bg-white font-mono text-xs text-black"
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      <div className="border-b-2 border-black pb-2 text-center">
        {resolvedLogoUrl ? (
          <img
            src={resolvedLogoUrl}
            alt={`Logo ${resolvedPrintName}`}
            data-testid="provisional-receipt-logo"
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
        <div className="flex items-baseline justify-between gap-2 font-bold">
          <span className="whitespace-nowrap">Số Bàn: {resolvedTableDisplay}</span>
          <span className="whitespace-nowrap text-right">Trạng thái: {resolvedStatusLabel}</span>
        </div>
        {tpl.blocks.orderCode ? (
          <div className="flex items-baseline justify-between gap-2 font-bold">
            <span className="whitespace-nowrap">Mã HĐ: {bill.orderCode}</span>
          </div>
        ) : null}
        {tpl.blocks.cashier ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">Thu ngân: {bill.cashierName || 'Thu ngân'}</span>
          </div>
        ) : null}
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

      {/* Totals */}
      <div className="mt-1.5 space-y-1 border-t-2 border-black pt-1.5">
        <div className="flex justify-between text-xs font-semibold">
          <span>TỔNG CỘNG TIỀN MÓN:</span>
          <span data-testid="provisional-subtotal-amount">
            {(
              bill.subtotalAmount ?? bill.totalAmount + (bill.discountAmount ?? 0)
            ).toLocaleString('vi-VN')}{' '}
            đ
          </span>
        </div>
        {(bill.discountAmount ?? 0) > 0 ? (
          <div data-testid="provisional-discount-line" className="flex justify-between text-xs">
            <span>
              GIẢM GIÁ (
              {bill.discountSnapshot?.kind === 'CODE'
                ? (bill.discountSnapshot.code ?? bill.discountSnapshot.name)
                : (bill.discountSnapshot?.name ?? 'THỦ CÔNG')}
              ):
            </span>
            <span>-{(bill.discountAmount ?? 0).toLocaleString('vi-VN')} đ</span>
          </div>
        ) : tpl.blocks.discountLine ? (
          <div data-testid="provisional-discount-line" className="flex justify-between text-xs">
            <span>GIẢM GIÁ (0%):</span>
            <span>0 đ</span>
          </div>
        ) : null}
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
        {tpl.blocks.bankInfo && bill.paymentAccount ? (
          <>
            <div className="mt-0.5 text-[11px] font-bold" data-testid="provisional-vietqr-bank-account">
              {bill.paymentAccount.bankName} — STK: {bill.paymentAccount.accountNo}
            </div>
            <div className="text-[11px] font-extrabold uppercase" data-testid="provisional-vietqr-account-name">
              {bill.paymentAccount.accountName}
            </div>
          </>
        ) : null}
        <img
          ref={imgRef}
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
        {resolvedFooterNote ? (
          <div
            data-testid="provisional-receipt-footer"
            className="mt-1.5 whitespace-pre-line text-[10px] font-bold uppercase"
          >
            {resolvedFooterNote}
          </div>
        ) : null}
        <div className="mt-1 text-[10px] font-semibold italic">
          Phiếu này dùng để kiểm tra món ăn. Quý khách vui lòng không dùng làm hoá đơn tài chính.
        </div>
      </div>
    </div>
  );
}
