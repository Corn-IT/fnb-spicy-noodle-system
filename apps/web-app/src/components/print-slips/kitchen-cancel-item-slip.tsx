import {
  PRINT_TEMPLATE_DEFAULTS,
  type KitchenStation,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { getThermalSlipRootStyle, resolveThermalFontSizePt } from './print-template.util';
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
  storeSettings?: PublicStoreSettingsResponse;
}

function formatCancelSlipTime(printedAt?: string): string {
  if (printedAt && printedAt.trim()) {
    const trimmed = printedAt.trim();
    const matchTimeFirst = /^(\d{2}:\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})$/.exec(trimmed);
    if (matchTimeFirst) {
      return `${matchTimeFirst[1]} - ${matchTimeFirst[2]}`;
    }
    const matchDateFirst = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})$/.exec(trimmed);
    if (matchDateFirst) {
      return `${matchDateFirst[2]} - ${matchDateFirst[1]}`;
    }
    return trimmed;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  return `${hh}:${mi}:${ss} - ${dd}/${mm}/${yyyy}`;
}

export function KitchenCancelItemSlip({
  orderCode,
  printedAt,
  slips,
  storeSettings,
}: KitchenCancelItemSlipProps) {
  const { settings: contextSettings } = useStoreSettings();
  const activeSettings = storeSettings ?? contextSettings;
  const tpl = activeSettings.printTemplates.kitchenCancel;
  const fontSizePt = resolveThermalFontSizePt(tpl.fontSizePt);
  const resolvedTitle = tpl.title.trim() || PRINT_TEMPLATE_DEFAULTS.kitchenCancel.title;
  const resolvedReason = tpl.footerNote.trim() || PRINT_TEMPLATE_DEFAULTS.kitchenCancel.footerNote;
  const formattedTime = formatCancelSlipTime(printedAt);

  return (
    <>
      {slips.map((slip, index) => {
        const meta = STATION_META[slip.station] ?? {
          title: slip.station,
          logoType: 'CHEF_HAT_NOODLE' as const,
        };
        const qtyStr = String(slip.quantity).padStart(2, '0');
        const tableUpper = slip.tableLabel.toUpperCase();

        return (
          <div
            key={`${slip.station}-${slip.itemName}-${index}`}
            data-testid={`kitchen-cancel-slip-${slip.station}-${index}`}
            data-font-size-pt={fontSizePt}
            data-thermal-font={tpl.fontFamily}
            className="ticket-page break-words bg-white px-0 py-0 font-mono text-black"
            style={getThermalSlipRootStyle(fontSizePt, tpl.fontFamily)}
          >
            <div className="flex flex-col items-center border-b-2 border-black pb-1 text-center">
              <StationLogo logoType={meta.logoType} className="mb-0.5 h-9 w-9" />
              <div
                data-print-kind="heading"
                data-print-scale="1.2"
                className="font-bold uppercase"
                style={{ fontSize: '1.2em' }}
              >
                {meta.title}
              </div>
              <div
                data-print-kind="banner"
                className="mt-0.5 border-2 border-black bg-white px-1.5 py-0.5 font-extrabold uppercase text-black"
                style={{ fontSize: '1.3em' }}
              >
                {resolvedTitle}
              </div>
            </div>

            <div className="my-1 space-y-0.5">
              <div
                data-print-kind="pair"
                data-print-bold
                className="flex items-center justify-between gap-2 font-bold"
              >
                <span style={{ fontSize: '1.15em' }}>{tableUpper}</span>
                {orderCode ? <span>Mã Đơn: {orderCode}</span> : <span />}
              </div>
              {tpl.blocks.time ? (
                <div data-print-kind="text" data-print-scale="0.85" style={{ fontSize: '0.85em' }}>
                  Thời gian báo huỷ: {formattedTime}
                </div>
              ) : null}
            </div>

            <div
              data-print-kind="banner"
              className="border-2 border-black p-1.5 text-center font-extrabold uppercase"
              style={{ fontSize: '1.1em' }}
            >
              {`${tableUpper} - HUỶ ${qtyStr} ${slip.itemName.toUpperCase()}`}
            </div>

            {tpl.blocks.reason ? (
              <div
                data-testid={`kitchen-cancel-reason-${slip.station}-${index}`}
                data-print-kind="text"
                data-print-scale="0.85"
                data-print-align="center"
                className="mt-1 text-center font-semibold"
                style={{ fontSize: '0.85em' }}
              >
                {resolvedReason}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
