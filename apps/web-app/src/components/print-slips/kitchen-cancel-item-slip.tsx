import {
  PRINT_TEMPLATE_DEFAULTS,
  type KitchenStation,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { cn } from '@/utils/cn';
import { THERMAL_FONT_CLASSES } from './print-template.util';
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
  const fs = THERMAL_FONT_CLASSES[tpl.fontSize];
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
            data-font-size={tpl.fontSize}
            className={cn(
              'ticket-page break-words border-b border-dashed border-black bg-white px-4 font-mono text-black',
              fs.body,
            )}
            style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
          >
            <div className="flex flex-col items-center border-b-2 border-black pb-2 text-center">
              <StationLogo logoType={meta.logoType} className="mb-1 h-10 w-10" />
              <div className={cn('font-bold uppercase', fs.item)}>{meta.title}</div>
              <div
                className={cn(
                  'mt-1 border-2 border-black bg-white px-2 py-0.5 font-extrabold uppercase text-black',
                  fs.heading,
                )}
              >
                {resolvedTitle}
              </div>
            </div>

            <div className={cn('my-2 space-y-1', fs.body)}>
              <div className="flex items-center justify-between gap-2 font-bold">
                <span className={fs.item}>{tableUpper}</span>
                {orderCode ? <span>Mã Đơn: {orderCode}</span> : null}
              </div>
              {tpl.blocks.time ? <div>Thời gian báo huỷ: {formattedTime}</div> : null}
            </div>

            <div
              className={cn(
                'border-2 border-black p-2 text-center font-extrabold uppercase',
                fs.item,
              )}
            >
              {`${tableUpper} - HUỶ ${qtyStr} ${slip.itemName.toUpperCase()}`}
            </div>

            {tpl.blocks.reason ? (
              <div
                data-testid={`kitchen-cancel-reason-${slip.station}-${index}`}
                className={cn('mt-1.5 text-center font-semibold', fs.sub)}
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
