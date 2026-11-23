import {
  PRINT_TEMPLATE_DEFAULTS,
  StoreAssetKind,
  type ProvisionalBillResponse,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';
import * as React from 'react';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';

import {
  getThermalSlipRootStyle,
  resolvePricedModifiers,
  resolveThermalFontSizePt,
} from './print-template.util';
import { generateVietQrDataUrl } from './vietqr-emv.util';
import { buildVietQrTransferMemo } from './vietqr-url.util';

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
  const fontSizePt = resolveThermalFontSizePt(tpl.fontSizePt);
  const resolvedPrintName = activeSettings.receipt.printName || activeSettings.storeName;
  const resolvedLogoUrl =
    activeSettings.receipt.showLogo && tpl.blocks.logo
      ? buildStoreAssetUrl(StoreAssetKind.LOGO, activeSettings.assets.logo)
      : null;
  const resolvedTitle = tpl.title.trim() || PRINT_TEMPLATE_DEFAULTS.provisional.title;
  const resolvedFooterNote = tpl.footerNote.trim() || activeSettings.receipt.footerNote.trim();

  const transferMemo = React.useMemo(
    () =>
      buildVietQrTransferMemo(bill.orderCode, {
        tableLabel: bill.tableLabel,
        tableId: bill.tableId,
        orderType: bill.orderType,
        takeawayNumber: bill.takeawayNumber,
      }),
    [bill.orderCode, bill.tableLabel, bill.tableId, bill.orderType, bill.takeawayNumber],
  );

  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [qrUnavailable, setQrUnavailable] = React.useState<boolean>(!bill.paymentAccount);
  const hasNotifiedRef = React.useRef(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

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

  React.useEffect(() => {
    let cancelled = false;
    hasNotifiedRef.current = false;

    if (!bill.paymentAccount) {
      setQrDataUrl(null);
      setQrUnavailable(true);
      notifyReadyOnce();
      return;
    }

    setQrUnavailable(false);
    void generateVietQrDataUrl({
      bankCode: bill.paymentAccount.bankCode,
      accountNo: bill.paymentAccount.accountNo,
      amount: bill.totalAmount,
      memo: transferMemo,
    })
      .then((res) => {
        if (cancelled) return;
        if (res?.dataUrl) {
          setQrDataUrl(res.dataUrl);
          setQrUnavailable(false);
        } else {
          setQrDataUrl(null);
          setQrUnavailable(true);
          notifyReadyOnce();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setQrDataUrl(null);
        setQrUnavailable(true);
        notifyReadyOnce();
      });

    return () => {
      cancelled = true;
    };
  }, [
    bill.paymentAccount,
    bill.totalAmount,
    transferMemo,
    notifyReadyOnce,
  ]);

  React.useEffect(() => {
    const el = imgRef.current;
    if (qrDataUrl && el && el.complete && el.naturalWidth > 0) {
      notifyReadyOnce();
    }
  }, [qrDataUrl, notifyReadyOnce]);

  const resolvedTableDisplay = React.useMemo(() => {
    if (bill.tableLabel) return bill.tableLabel.toUpperCase();
    if (bill.orderType === 'TAKEAWAY') {
      return `MANG VỀ #${String(bill.takeawayNumber ?? 1).padStart(2, '0')}`;
    }
    return `BÀN ${String(bill.tableId ?? 1).padStart(2, '0')}`;
  }, [bill.tableLabel, bill.orderType, bill.takeawayNumber, bill.tableId]);

  const resolvedStatusLabel = ORDER_STATUS_LABELS[bill.status] ?? bill.status;

  return (
    <div
      data-testid="provisional-vietqr-slip"
      data-font-size-pt={fontSizePt}
      className="ticket-page break-words bg-white px-0 py-0 font-mono text-black"
      style={getThermalSlipRootStyle(fontSizePt)}
    >
      <div className="border-b-2 border-black pb-1 text-center">
        {resolvedLogoUrl ? (
          <img
            src={resolvedLogoUrl}
            alt={`Logo ${resolvedPrintName}`}
            data-testid="provisional-receipt-logo"
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
        <div data-print-kind="pair" data-print-scale="0.9" data-print-bold className="flex items-baseline justify-between gap-2 font-bold">
          <span className="whitespace-nowrap">Số Bàn: {resolvedTableDisplay}</span>
          <span className="whitespace-nowrap text-right">Trạng thái: {resolvedStatusLabel}</span>
        </div>
        {tpl.blocks.orderCode ? (
          <div data-print-kind="text" data-print-scale="0.9" data-print-bold className="font-bold">
            Mã HĐ: {bill.orderCode}
          </div>
        ) : null}
        {tpl.blocks.cashier ? (
          <div data-print-kind="text" data-print-scale="0.9" className="truncate">
            Thu ngân: {bill.cashierName || 'Thu ngân'}
          </div>
        ) : null}
      </div>

      {/* Bordered 3-column Items Table: Tên món | SL | T.Tiền */}
      <table
        data-testid="provisional-items-table"
        data-print-kind="table"
        className="w-full border-collapse border border-black text-black"
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
          {bill.items.map((item, idx) => {
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

      {/* Totals */}
      <div className="mt-1 space-y-0.5 border-t-2 border-black pt-1">
        <div data-print-kind="pair" data-print-bold className="flex justify-between font-semibold">
          <span>TỔNG CỘNG TIỀN MÓN:</span>
          <span data-testid="provisional-subtotal-amount">
            {(
              bill.subtotalAmount ?? bill.totalAmount + (bill.discountAmount ?? 0)
            ).toLocaleString('vi-VN')}{' '}
            đ
          </span>
        </div>
        {(bill.discountAmount ?? 0) > 0 ? (
          <div data-testid="provisional-discount-line" data-print-kind="pair" className="flex justify-between">
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
          <div data-testid="provisional-discount-line" data-print-kind="pair" className="flex justify-between">
            <span>GIẢM GIÁ (0%):</span>
            <span>0 đ</span>
          </div>
        ) : null}
        <div
          data-print-kind="pair"
          data-print-scale="1.15"
          data-print-bold
          className="flex justify-between border-t border-dashed border-black pt-0.5 font-extrabold"
          style={{ fontSize: '1.15em' }}
        >
          <span>TỔNG THANH TOÁN:</span>
          <span data-testid="provisional-total-amount">
            {bill.totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>
      </div>

      <div data-print-kind="divider" className="hidden" />

      {/* Offline Dynamic EMVCo VietQR Napas247 Section */}
      <div className="mt-1 flex flex-col items-center border-t border-dashed border-black pt-1 text-center">
        {qrUnavailable ? (
          <div
            data-testid="provisional-qr-unconfigured"
            data-print-kind="text"
            data-print-align="center"
            data-print-bold
            className="py-1 font-bold"
          >
            Chưa cấu hình tài khoản nhận tiền
          </div>
        ) : (
          <>
            <div
              data-print-kind="text"
              data-print-scale="0.9"
              data-print-align="center"
              data-print-bold
              className="font-extrabold uppercase"
              style={{ fontSize: '0.9em' }}
            >
              QUÉT MÃ VIETQR ĐỂ CHUYỂN KHOẢN TỰ ĐỘNG
            </div>
            {tpl.blocks.bankInfo && bill.paymentAccount ? (
              <>
                <div
                  data-testid="provisional-vietqr-bank-account"
                  data-print-kind="text"
                  data-print-scale="0.9"
                  data-print-align="center"
                  data-print-bold
                  className="font-bold"
                  style={{ fontSize: '0.9em' }}
                >
                  {bill.paymentAccount.bankName} — STK: {bill.paymentAccount.accountNo}
                </div>
                <div
                  data-testid="provisional-vietqr-account-name"
                  data-print-kind="text"
                  data-print-scale="0.9"
                  data-print-align="center"
                  data-print-bold
                  className="font-extrabold uppercase"
                  style={{ fontSize: '0.9em' }}
                >
                  {bill.paymentAccount.accountName}
                </div>
              </>
            ) : null}
            {qrDataUrl ? (
              <img
                ref={imgRef}
                data-testid="provisional-vietqr-image"
                data-print-kind="qr"
                src={qrDataUrl}
                alt={`VietQR ${transferMemo}`}
                onLoad={notifyReadyOnce}
                className="my-1 h-40 w-40 object-contain"
              />
            ) : null}
            <div
              data-print-kind="text"
              data-print-scale="0.9"
              data-print-align="center"
              data-print-bold
              className="font-bold"
              style={{ fontSize: '0.9em' }}
            >
              Nội dung CK: <span className="underline">{transferMemo}</span>
            </div>
          </>
        )}
        {resolvedFooterNote ? (
          <div
            data-testid="provisional-receipt-footer"
            data-print-kind="text"
            data-print-scale="0.85"
            data-print-align="center"
            data-print-bold
            className="mt-1 whitespace-pre-line font-bold uppercase"
            style={{ fontSize: '0.85em' }}
          >
            {resolvedFooterNote}
          </div>
        ) : null}
        <div
          data-print-kind="text"
          data-print-scale="0.8"
          data-print-align="center"
          className="mt-0.5 font-semibold italic"
          style={{ fontSize: '0.8em' }}
        >
          Phiếu này dùng để kiểm tra món ăn. Quý khách vui lòng không dùng làm hoá đơn tài chính.
        </div>
      </div>
    </div>
  );
}
