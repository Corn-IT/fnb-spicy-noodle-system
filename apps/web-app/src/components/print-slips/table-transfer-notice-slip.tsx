import { type KitchenStation } from '@fnb/shared';

import { STATION_META } from './station-logos';

export interface TableTransferNoticeSlipProps {
  orderCode: string;
  fromLabel: string;
  toLabel: string;
  affectedStations: KitchenStation[];
  printedAt?: string;
}

export function TableTransferNoticeSlip({
  orderCode,
  fromLabel,
  toLabel,
  affectedStations,
  printedAt,
}: TableTransferNoticeSlipProps) {
  const formattedTime =
    printedAt ||
    new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());

  const stationLabels =
    affectedStations.length > 0
      ? affectedStations.map((st) => STATION_META[st]?.title ?? st).join(', ')
      : 'TẤT CẢ CÁC TRẠM BẾP';

  const normalizedFrom = fromLabel.toUpperCase();
  const normalizedTo = toLabel.toUpperCase();

  return (
    <div
      data-testid="table-transfer-notice-slip"
      className="ticket-page px-3 border-b border-dashed border-black bg-white font-mono text-xs text-black"
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      <div className="border-b-2 border-black pb-2 text-center">
        <div className="text-base font-extrabold uppercase">⚠️ THÔNG BÁO ĐỔI BÀN ⚠️</div>
      </div>

      <div className="my-2 space-y-1.5 text-xs">
        <div className="font-bold">ĐƠN HÀNG: {orderCode}</div>
        <div className="border-2 border-black p-2 text-center text-sm font-extrabold uppercase">
          <div>CHUYỂN TỪ: {`>>> ${normalizedFrom} <<<`}</div>
          <div className="mt-1">SANG BÀN: {`>>> ${normalizedTo} <<<`}</div>
        </div>
        <div>Thời gian: {formattedTime}</div>
        <div className="font-bold">Trạm ảnh hưởng: {stationLabels}</div>
      </div>

      <div className="border-t border-dashed border-black pt-1.5 text-center text-xs font-bold">
        LƯU Ý: Các món đang chế biến của {normalizedFrom} vui lòng bưng qua {normalizedTo}!
      </div>
    </div>
  );
}
