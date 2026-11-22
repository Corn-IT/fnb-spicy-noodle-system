import {
  type OrderType,
  type PublicStoreSettingsResponse,
  type SplitKitchenResponse,
} from '@fnb/shared';
import * as React from 'react';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { cn } from '@/utils/cn';
import { THERMAL_FONT_CLASSES } from './print-template.util';
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
  storeSettings?: PublicStoreSettingsResponse;
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
  storeSettings,
}: KitchenSplitSlipProps) {
  const { settings: contextSettings } = useStoreSettings();
  const activeSettings = storeSettings ?? contextSettings;
  const tpl = activeSettings.printTemplates.kitchen;
  const fs = THERMAL_FONT_CLASSES[tpl.fontSize];
  const customTitle = tpl.title.trim();
  const customFooterNote = tpl.footerNote.trim();

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
        const meta = STATION_META[ticket.station] ?? {
          title: ticket.station,
          logoType: 'CHEF_HAT_NOODLE' as StationLogoType,
        };
        const logoType: StationLogoType = ticket.logoType || meta.logoType;
        const stationTitle = ticket.stationTitle || meta.title;
        const isAddonBatch = ticket.batchNo > 1;
        const batchBannerText =
          ticket.batchLabel || (isAddonBatch ? `[GỌI THÊM - LƯỢT ${ticket.batchNo}]` : `Lượt ${ticket.batchNo}`);

        const transferNoticeText =
          ticket.transferNotice ||
          (transferFromTable && transferToTable
            ? `[GHI CHÚ ĐỔI BÀN: Chuyển từ ${transferFromTable.toUpperCase()} sang ${transferToTable.toUpperCase()}]`
            : undefined);

        const normalizedReprintLabel = ticket.reprintLabel
          ? ticket.reprintLabel.replace(/\s*\(KHÔNG LÀM TRÙNG\)\s*/i, ' ')
          : '*** BẢN SAO - IN LẠI ***';

        return (
          <div
            key={`${ticket.station}-${ticket.batchNo}`}
            data-testid={`kitchen-ticket-page-${ticket.station}`}
            data-font-size={tpl.fontSize}
            className={cn(
              'ticket-page break-words border-b border-dashed border-black bg-white px-4 font-mono text-black',
              fs.body,
            )}
            style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
          >
            {/* Header: Station Logo & Large Bold Station Title */}
            <div className="flex flex-col items-center border-b-2 border-black pb-2 text-center">
              {tpl.blocks.stationLogo ? (
                <StationLogo logoType={logoType} className="mb-1 h-12 w-12" />
              ) : null}
              <div className={cn('font-extrabold uppercase tracking-wide', fs.heading)}>
                {stationTitle}
              </div>
              {customTitle ? (
                <div
                  data-testid={`kitchen-custom-title-${ticket.station}`}
                  className={cn('mt-0.5 font-bold uppercase', fs.sub)}
                >
                  {customTitle}
                </div>
              ) : null}
            </div>

            {/* Table / Takeaway & Order Metadata */}
            <div className="mt-1.5 space-y-1 border-b border-dashed border-black pb-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn('font-extrabold', fs.heading)}>{resolvedTableDisplay}</span>
                {tpl.blocks.orderCode ? (
                  <span className={cn('font-semibold', fs.sub)}>Mã Đơn: {orderCode}</span>
                ) : null}
              </div>
              <div className={cn('flex items-center justify-between gap-2', fs.sub)}>
                {tpl.blocks.time ? <span>Thời gian: {formattedTime}</span> : <span />}
                <span className="font-bold">{`Lượt ${ticket.batchNo}`}</span>
              </div>

              {isAddonBatch ? (
                <div
                  data-testid={`kitchen-addon-batch-banner-${ticket.station}`}
                  className={cn(
                    'mt-1 border-2 border-black bg-white px-2 py-1 text-center font-extrabold uppercase tracking-wider text-black',
                    fs.item,
                  )}
                >
                  {batchBannerText}
                </div>
              ) : null}

              {transferNoticeText ? (
                <div
                  data-testid={`kitchen-transfer-notice-${ticket.station}`}
                  className={cn(
                    'mt-1 border-2 border-black bg-white px-1.5 py-1 text-center font-extrabold uppercase text-black',
                    fs.body,
                  )}
                >
                  {transferNoticeText}
                </div>
              ) : null}

              {(ticket.reprintLabel || isReprint) ? (
                <div
                  data-testid={`kitchen-reprint-banner-${ticket.station}`}
                  className={cn(
                    'mt-1 border-2 border-black bg-white px-1.5 py-1 text-center font-black uppercase tracking-wider text-black',
                    fs.body,
                  )}
                >
                  {normalizedReprintLabel}
                </div>
              ) : null}
            </div>

            {/* Items Table */}
            <div className="mt-1.5">
              <div
                className={cn(
                  'flex justify-between border-b border-black pb-1 font-bold uppercase',
                  fs.sub,
                )}
              >
                <span>TÊN MÓN</span>
                <span>SL / CẤP ĐỘ CAY</span>
              </div>

              <div className="divide-y divide-dashed divide-black">
                {ticket.items.map((item, idx) => {
                  const { spicyLevels, toppings } = classifyModifiers(item.modifiers);
                  const trimmedNote = item.note ? item.note.trim() : '';

                  return (
                    <div key={`${item.name}-${idx}`} className="py-1.5">
                      <div className={cn('flex items-start justify-between gap-2 font-extrabold', fs.item)}>
                        <span>{item.name}</span>
                        <span className="shrink-0">
                          {String(item.qty).padStart(2, '0')}
                        </span>
                      </div>

                      {spicyLevels.length > 0 ? (
                        <div className={cn('mt-0.5 font-bold', fs.body)}>
                          {spicyLevels.join(' - ')}
                        </div>
                      ) : null}

                      {toppings.length > 0 ? (
                        <div className={cn('mt-0.5 space-y-0.5 pl-2 font-semibold', fs.body)}>
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

                      {tpl.blocks.itemNotes && trimmedNote ? (
                        <div
                          data-testid={`kitchen-item-note-${idx}`}
                          className={cn('mt-0.5 pl-2 font-bold italic', fs.body)}
                        >
                          Ghi chú: {trimmedNote}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {tpl.blocks.itemNotes && orderNote && orderNote.trim() ? (
              <div className={cn('mt-1.5 border-t border-black pt-1 font-bold', fs.body)}>
                Ghi chú đơn: {orderNote.trim()}
              </div>
            ) : null}

            {customFooterNote ? (
              <div
                data-testid={`kitchen-custom-footer-${ticket.station}`}
                className={cn(
                  'mt-1.5 border-t border-dashed border-black pt-1 text-center font-semibold',
                  fs.sub,
                )}
              >
                {customFooterNote}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
