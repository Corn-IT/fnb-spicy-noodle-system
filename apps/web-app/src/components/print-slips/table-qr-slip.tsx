export interface TableQrSlipProps {
  tableName: string;
  qrUrl: string;
  qrImageDataUrl: string;
  storeName?: string;
}

export function TableQrSlip({
  tableName,
  qrUrl,
  qrImageDataUrl,
  storeName,
}: TableQrSlipProps) {
  return (
    <div
      data-testid="thermal-table-qr-print-slip"
      className="ticket-page flex flex-col items-center bg-white px-4 py-3 text-center font-mono text-black"
    >
      {storeName ? (
        <div className="mb-1 text-xs font-bold uppercase tracking-wide">{storeName}</div>
      ) : null}
      <div className="text-xs font-bold uppercase tracking-wider">
        QUÉT MÃ QR ĐẶT MÓN TẠI BÀN
      </div>
      <div className="my-1.5 text-xl font-extrabold uppercase">{tableName}</div>
      {qrImageDataUrl ? (
        <img
          src={qrImageDataUrl}
          alt={`Mã QR ${tableName}`}
          className="my-2 h-44 w-44 border border-black p-1"
        />
      ) : null}
      <div className="mt-1 break-all text-[9px] text-neutral-700">{qrUrl}</div>
      <div className="mt-2 border-t border-dashed border-black pt-1.5 text-[10px] font-semibold">
        Mở Camera hoặc Zalo để quét mã gọi món nhanh
      </div>
    </div>
  );
}
