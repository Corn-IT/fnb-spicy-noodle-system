import { type KitchenStation } from '@fnb/shared';

import { STATION_META, StationLogo } from './station-logos';

export interface KitchenCancelSlipItem {
  station: KitchenStation;
  tableLabel: string;
  itemName: string;
  quantity: number;
}

export interface KitchenCancelItemSlipProps {
  orderCode?: string;
  printedAt?: string;
  slips: KitchenCancelSlipItem[];
}

export function KitchenCancelItemSlip({
  orderCode,
  printedAt,
  slips,
}: KitchenCancelItemSlipProps) {
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

  return (
    <>
      {slips.map((slip, index) => {
        const meta = STATION_META[slip.station];
        const qtyStr = String(slip.quantity).padStart(2, '0');
        const tableUpper = slip.tableLabel.toUpperCase();

        return (
          <div
            key={`${slip.station}-${slip.itemName}-${index}`}
            data-testid={`kitchen-cancel-slip-${slip.station}-${index}`}
            className="ticket-page px-3 border-b border-dashed border-black bg-white font-mono text-xs text-black"
            style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
          >
            <div className="flex flex-col items-center border-b-2 border-black pb-2 text-center">
              <StationLogo logoType={meta.logoType} className="mb-1 h-10 w-10" />
              <div className="text-sm font-bold uppercase">{meta.title}</div>
              <div className="mt-1 bg-black px-2 py-0.5 text-base font-extrabold uppercase text-white">
                PHIẾU BÁO HUỶ MÓN
              </div>
            </div>

            <div className="my-2 space-y-1 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-sm">{tableUpper}</span>
                {orderCode ? <span>Mã Đơn: {orderCode}</span> : null}
              </div>
              <div>Thời gian báo huỷ: {formattedTime}</div>
            </div>

            <div className="border-2 border-black p-2 text-center text-sm font-extrabold uppercase">
              {`PHIẾU BÁO HUỶ MÓN: ${tableUpper} - HUỶ ${qtyStr} ${slip.itemName.toUpperCase()}`}
            </div>

            <div className="mt-1.5 text-center text-[11px] font-semibold">
              Vui lòng ngưng chế biến món vừa báo huỷ trên!
            </div>
          </div>
        );
      })}
    </>
  );
}
