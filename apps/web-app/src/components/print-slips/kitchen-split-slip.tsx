import {
  type OrderType,
  type PublicStoreSettingsResponse,
  type SplitKitchenResponse,
} from '@fnb/shared';
import * as React from 'react';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { getThermalSlipRootStyle, resolveThermalFontSizePt } from './print-template.util';
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
  const fontSizePt = resolveThermalFontSizePt(tpl.fontSizePt);
  const priceCategorySet = React.useMemo(
    () => new Set<number>(tpl.priceCategoryIds ?? []),
    [tpl.priceCategoryIds],
  );
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
            data-font-size-pt={fontSizePt}
            className="ticket-page break-words bg-white px-0 py-0 font-mono text-black"
            style={getThermalSlipRootStyle(fontSizePt)}
          >
            {/* Header */}
            <div className="flex flex-col items-center border-b-2 border-black pb-1 text-center">
              {tpl.blocks.stationLogo ? (
                <StationLogo logoType={logoType} className="mb-0.5 h-10 w-10" />
              ) : null}
              <div
                data-print-kind="heading"
                data-print-scale="1.4"
                className="font-extrabold uppercase tracking-wide"
                style={{ fontSize: '1.4em' }}
              >
                {stationTitle}
              </div>
              {customTitle ? (
                <div
                  data-testid={`kitchen-custom-title-${ticket.station}`}
                  data-print-kind="text"
                  data-print-scale="0.85"
                  data-print-align="center"
                  data-print-bold
                  className="font-bold uppercase"
                  style={{ fontSize: '0.85em' }}
                >
                  {customTitle}
                </div>
              ) : null}
            </div>

            <div data-print-kind="divider" className="hidden" />

            {/* Table / Takeaway & Order Metadata */}
            <div className="mt-1 space-y-0.5 border-b border-dashed border-black pb-1">
              <div
                data-print-kind="pair"
                data-print-scale="1.15"
                data-print-bold
                className="flex items-baseline justify-between gap-2"
              >
                <span className="font-extrabold" style={{ fontSize: '1.25em' }}>
                  {resolvedTableDisplay}
                </span>
                {tpl.blocks.orderCode ? (
                  <span className="font-semibold" style={{ fontSize: '0.85em' }}>
                    Mã Đơn: {orderCode}
                  </span>
                ) : (
                  <span />
                )}
              </div>
              <div
                data-print-kind="pair"
                data-print-scale="0.85"
                className="flex items-center justify-between gap-2"
                style={{ fontSize: '0.85em' }}
              >
                {tpl.blocks.time ? <span>Thời gian: {formattedTime}</span> : <span />}
                <span className="font-bold">{`Lượt ${ticket.batchNo}`}</span>
              </div>

              {isAddonBatch ? (
                <div
                  data-testid={`kitchen-addon-batch-banner-${ticket.station}`}
                  data-print-kind="banner"
                  className="mt-0.5 border-2 border-black bg-white px-1 py-0.5 text-center font-extrabold uppercase tracking-wider text-black"
                >
                  {batchBannerText}
                </div>
              ) : null}

              {transferNoticeText ? (
                <div
                  data-testid={`kitchen-transfer-notice-${ticket.station}`}
                  data-print-kind="banner"
                  className="mt-0.5 border-2 border-black bg-white px-1 py-0.5 text-center font-extrabold uppercase text-black"
                >
                  {transferNoticeText}
                </div>
              ) : null}

              {(ticket.reprintLabel || isReprint) ? (
                <div
                  data-testid={`kitchen-reprint-banner-${ticket.station}`}
                  data-print-kind="banner"
                  className="mt-0.5 border-2 border-black bg-white px-1 py-0.5 text-center font-black uppercase tracking-wider text-black"
                >
                  {normalizedReprintLabel}
                </div>
              ) : null}
            </div>

            <div data-print-kind="divider" className="hidden" />

            {/* Items */}
            <div className="mt-1">
              <div
                data-print-kind="pair"
                data-print-scale="0.85"
                data-print-bold
                className="flex justify-between border-b border-black pb-0.5 font-bold uppercase"
                style={{ fontSize: '0.85em' }}
              >
                <span>TÊN MÓN</span>
                <span>SL</span>
              </div>
              <div data-print-kind="divider" className="hidden" />

              <div className="divide-y divide-dashed divide-black">
                {ticket.items.map((item, idx) => {
                  const { spicyLevels, toppings } = classifyModifiers(item.modifiers);
                  const trimmedNote = item.note ? item.note.trim() : '';
                  const showUnitPrice =
                    item.categoryId != null &&
                    priceCategorySet.has(item.categoryId) &&
                    typeof item.unitPrice === 'number';
                  const itemDisplayName = showUnitPrice
                    ? `${item.name} — ${item.unitPrice!.toLocaleString('vi-VN')}`
                    : item.name;

                  return (
                    <div key={`${item.name}-${idx}`} className="py-1">
                      <div
                        data-print-kind="pair"
                        data-print-scale="1.05"
                        data-print-bold
                        className="flex items-start justify-between gap-2 font-extrabold"
                        style={{ fontSize: '1.05em' }}
                      >
                        <span>{itemDisplayName}</span>
                        <span className="shrink-0">
                          {String(item.qty).padStart(2, '0')}
                        </span>
                      </div>

                      {spicyLevels.length > 0 ? (
                        <div
                          data-print-kind="text"
                          data-print-bold
                          className="mt-0.5 font-bold"
                        >
                          {spicyLevels.join(' - ')}
                        </div>
                      ) : null}

                      {toppings.length > 0 ? (
                        <div className="mt-0.5 space-y-0.5 pl-2 font-semibold">
                          {toppings.map((topping, tIdx) => (
                            <div
                              key={`${topping}-${tIdx}`}
                              data-print-kind="text"
                              data-print-scale="0.95"
                            >
                              {topping}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {tpl.blocks.itemNotes && trimmedNote ? (
                        <div
                          data-testid={`kitchen-item-note-${idx}`}
                          data-print-kind="text"
                          data-print-bold
                          className="mt-0.5 pl-2 font-bold italic"
                        >
                          Ghi chú: {trimmedNote}
                        </div>
                      ) : null}
                      <div data-print-kind="divider" className="hidden" />
                    </div>
                  );
                })}
              </div>
            </div>

            {tpl.blocks.itemNotes && orderNote && orderNote.trim() ? (
              <div
                data-print-kind="text"
                data-print-bold
                className="mt-1 border-t border-black pt-1 font-bold"
              >
                Ghi chú đơn: {orderNote.trim()}
              </div>
            ) : null}

            {customFooterNote ? (
              <div
                data-testid={`kitchen-custom-footer-${ticket.station}`}
                data-print-kind="text"
                data-print-scale="0.85"
                data-print-align="center"
                className="mt-1 border-t border-dashed border-black pt-1 text-center font-semibold"
                style={{ fontSize: '0.85em' }}
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
