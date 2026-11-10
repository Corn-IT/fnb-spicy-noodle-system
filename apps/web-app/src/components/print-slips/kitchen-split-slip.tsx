import { type OrderType, type SplitKitchenResponse } from '@fnb/shared';
import * as React from 'react';

import { STATION_META, StationLogo, type StationLogoType } from './station-logos';

export interface KitchenSplitSlipProps {
  orderCode: string;
  orderType?: OrderType;
  tableLabel?: string | null;
  takeawayNumber?: number | null;
  printedAt?: string;
  orderNote?: string | null;
  transferFromTable?: string | null;
  transferToTable?: string | null;
  isReprint?: boolean;
  tickets: SplitKitchenResponse['tickets'];
}

function classifyModifiers(modifiers: string[]): {
  spicyLevels: string[];
  toppings: string[];
} {
  const spicyLevels: string[] = [];
  const toppings: string[] = [];

  for (const mod of modifiers) {
    if (/cấp/i.test(mod)) {
      spicyLevels.push(mod);
    } else {
      const normalized = mod.startsWith('+') ? mod.slice(1).trim() : mod.trim();
      toppings.push(`+ ${normalized}`);
    }
  }

  return { spicyLevels, toppings };
}

export function KitchenSplitSlip({
  orderCode,
  orderType = 'DINE_IN',
  tableLabel,
  takeawayNumber,
  printedAt,
  orderNote,
  transferFromTable,
  transferToTable,
  isReprint = false,
  tickets,
}: KitchenSplitSlipProps) {
  const resolvedTableDisplay = React.useMemo(() => {
    if (orderType === 'TAKEAWAY' || (takeawayNumber !== null && takeawayNumber !== undefined)) {
      const num = String(takeawayNumber ?? 1).padStart(2, '0');
      return tableLabel ? tableLabel.toUpperCase() : `MANG VỀ #${num}`;
    }
    return (tableLabel || 'BÀN 01').toUpperCase();
  }, [orderType, tableLabel, takeawayNumber]);

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
      {tickets.map((ticket) => {
        const meta = STATION_META[ticket.station];
        const logoType: StationLogoType = ticket.logoType || meta.logoType;
        const stationTitle = ticket.stationTitle || meta.title;
        const isAddonBatch = ticket.batchNo > 1;
        const batchBannerText =
          ticket.batchLabel || (isAddonBatch ? `[GỌI THÊM - LƯỢT ${ticket.batchNo}]` : 'Lượt 1');

        const transferNoticeText =
          ticket.transferNotice ||
          (transferFromTable && transferToTable
            ? `[GHI CHÚ ĐỔI BÀN: Chuyển từ ${transferFromTable.toUpperCase()} sang ${transferToTable.toUpperCase()}]`
            : undefined);

        return (
          <div
            key={`${ticket.station}-${ticket.batchNo}`}
            data-testid={`kitchen-ticket-page-${ticket.station}`}
            className="ticket-page px-3 border-b border-dashed border-black bg-white font-mono text-xs text-black"
            style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
          >
            {/* Header: Station Logo & Large Bold Station Title */}
            <div className="flex flex-col items-center border-b-2 border-black pb-2 text-center">
              <StationLogo logoType={logoType} className="mb-1 h-12 w-12" />
              <div className="text-base font-extrabold uppercase tracking-wide">
                {stationTitle}
              </div>
            </div>

            {/* Table / Takeaway & Order Metadata */}
            <div className="mt-1.5 space-y-1 border-b border-dashed border-black pb-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-base font-extrabold">{resolvedTableDisplay}</span>
                <span className="text-[11px] font-semibold">Mã Đơn: {orderCode}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>Thời gian: {formattedTime}</span>
                {!isAddonBatch ? <span className="font-bold">Lượt: Lượt 1</span> : null}
              </div>

              {isAddonBatch ? (
                <div
                  data-testid={`kitchen-addon-batch-banner-${ticket.station}`}
                  className="mt-1 bg-black px-2 py-1 text-center text-sm font-extrabold uppercase tracking-wider text-white"
                >
                  {batchBannerText}
                </div>
              ) : null}

              {transferNoticeText ? (
                <div
                  data-testid={`kitchen-transfer-notice-${ticket.station}`}
                  className="mt-1 border-2 border-black px-1.5 py-1 text-center text-xs font-extrabold uppercase"
                >
                  {transferNoticeText}
                </div>
              ) : null}

              {(ticket.reprintLabel || isReprint) ? (
                <div
                  data-testid={`kitchen-reprint-banner-${ticket.station}`}
                  className="mt-1 border-2 border-black bg-black px-1.5 py-1 text-center text-xs font-black uppercase tracking-wider text-white"
                >
                  {ticket.reprintLabel || '*** BẢN SAO - IN LẠI (KHÔNG LÀM TRÙNG) ***'}
                </div>
              ) : null}
            </div>

            {/* Items Table */}
            <div className="mt-1.5">
              <div className="flex justify-between border-b border-black pb-1 text-[11px] font-bold uppercase">
                <span>TÊN MÓN</span>
                <span>SL / CẤP ĐỘ CAY</span>
              </div>

              <div className="divide-y divide-dashed divide-black">
                {ticket.items.map((item, idx) => {
                  const { spicyLevels, toppings } = classifyModifiers(item.modifiers);
                  const inlineSummaryParts = [...spicyLevels];
                  if (item.note && item.note.trim()) {
                    inlineSummaryParts.push(item.note.trim());
                  }

                  return (
                    <div key={`${item.name}-${idx}`} className="py-1.5">
                      <div className="flex items-start justify-between gap-2 text-sm font-extrabold">
                        <span>{item.name}</span>
                        <span className="shrink-0">
                          {String(item.qty).padStart(2, '0')}
                        </span>
                      </div>

                      {inlineSummaryParts.length > 0 ? (
                        <div className="mt-0.5 text-xs font-bold">
                          {inlineSummaryParts.join(' - ')}
                        </div>
                      ) : null}

                      {toppings.length > 0 ? (
                        <div className="mt-0.5 space-y-0.5 pl-2 text-xs font-semibold">
                          {toppings.map((topping, tIdx) => (
                            <div
                              key={`${topping}-${tIdx}`}
                              className="flex items-center justify-between"
                            >
                              <span>{topping}</span>
                              <span>{String(item.qty).padStart(2, '0')}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {orderNote && orderNote.trim() ? (
              <div className="mt-1.5 border-t border-black pt-1 text-xs font-bold">
                Ghi chú đơn: {orderNote.trim()}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
