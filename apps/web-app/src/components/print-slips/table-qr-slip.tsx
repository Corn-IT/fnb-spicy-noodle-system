import { QR_CARD_DEFAULTS } from '@fnb/shared';
import * as React from 'react';

export interface TableQrSlipProps {
  tableName: string;
  qrUrl: string;
  qrImageDataUrl: string;
  storeName?: string;
  headline?: string;
  subtitle?: string;
  footerText?: string;
  showLinkText?: boolean;
  logoUrl?: string | null;
  onReadyToPrint?: () => void;
}

export function TableQrSlip({
  tableName,
  qrUrl,
  qrImageDataUrl,
  storeName,
  headline,
  subtitle,
  footerText,
  showLinkText = true,
  logoUrl,
  onReadyToPrint,
}: TableQrSlipProps) {
  const [hideLogo, setHideLogo] = React.useState(false);
  const logoRef = React.useRef<HTMLImageElement | null>(null);
  const notifiedRef = React.useRef(false);

  const effectiveLogoUrl = !hideLogo && logoUrl ? logoUrl : null;

  React.useEffect(() => {
    setHideLogo(false);
    notifiedRef.current = false;
  }, [logoUrl]);

  const notifyReadyOnce = React.useCallback(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onReadyToPrint?.();
  }, [onReadyToPrint]);

  React.useEffect(() => {
    if (!onReadyToPrint) return;
    if (!effectiveLogoUrl) {
      notifyReadyOnce();
      return;
    }
    const img = logoRef.current;
    if (img && img.complete) {
      if (img.naturalWidth === 0) {
        setHideLogo(true);
      }
      notifyReadyOnce();
      return;
    }
    const timer = window.setTimeout(() => {
      const current = logoRef.current;
      if (!current || !current.complete || current.naturalWidth === 0) {
        setHideLogo(true);
      }
      notifyReadyOnce();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [effectiveLogoUrl, notifyReadyOnce, onReadyToPrint]);

  const resolvedHeadline = headline?.trim() || QR_CARD_DEFAULTS.tableHeadline;
  const resolvedSubtitle = subtitle?.trim();
  const resolvedFooter = footerText?.trim() || QR_CARD_DEFAULTS.footerText;

  return (
    <div
      data-testid="thermal-table-qr-print-slip"
      className="ticket-page flex flex-col items-center bg-white px-4 py-3 text-center font-mono text-black"
    >
      {effectiveLogoUrl ? (
        <img
          ref={logoRef}
          src={effectiveLogoUrl}
          alt={`Logo ${storeName || tableName}`}
          data-testid="thermal-table-qr-logo"
          onLoad={notifyReadyOnce}
          onError={() => {
            setHideLogo(true);
            notifyReadyOnce();
          }}
          className="mb-1.5 h-10 w-10 object-contain grayscale"
        />
      ) : null}
      {storeName ? (
        <div className="mb-1 text-xs font-bold uppercase tracking-wide">{storeName}</div>
      ) : null}
      <div className="text-xs font-bold uppercase tracking-wider">{resolvedHeadline}</div>
      <div className="my-1.5 text-xl font-extrabold uppercase">{tableName}</div>
      {resolvedSubtitle ? (
        <div className="mb-1 text-[10px] font-medium text-neutral-700">{resolvedSubtitle}</div>
      ) : null}
      {qrImageDataUrl ? (
        <img
          src={qrImageDataUrl}
          alt={`Mã QR ${tableName}`}
          className="my-2 h-44 w-44 border border-black p-1"
        />
      ) : null}
      {showLinkText ? (
        <div className="mt-1 break-all text-[9px] text-neutral-700">{qrUrl}</div>
      ) : null}
      <div className="mt-2 border-t border-dashed border-black pt-1.5 text-[10px] font-semibold">
        {resolvedFooter}
      </div>
    </div>
  );
}
