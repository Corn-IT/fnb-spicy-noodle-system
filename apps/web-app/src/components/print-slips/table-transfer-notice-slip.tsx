import {
  PRINT_TEMPLATE_DEFAULTS,
  type KitchenStation,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { formatTransferFooterNote } from './print-template.util';
import { STATION_META } from './station-logos';

export interface TableTransferNoticeSlipProps {
  orderCode: string;
  fromLabel: string;
  toLabel: string;
  affectedStations: KitchenStation[];
  printedAt?: string;
  cashierName?: string | null;
  storeSettings?: PublicStoreSettingsResponse;
}

export function TableTransferNoticeSlip({
  orderCode,
  fromLabel,
  toLabel,
  affectedStations,
  printedAt,
  cashierName,
  storeSettings,
}: TableTransferNoticeSlipProps) {
  const { settings: contextSettings } = useStoreSettings();
  const activeSettings = storeSettings ?? contextSettings;
  const tpl = activeSettings.printTemplates.tableTransfer;
  const resolvedTitle = tpl.title.trim() || PRINT_TEMPLATE_DEFAULTS.tableTransfer.title;

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
  const resolvedFooter = formatTransferFooterNote(tpl.footerNote, normalizedFrom, normalizedTo);

  return (
    <div
      data-testid="table-transfer-notice-slip"
      className="ticket-page break-words border-b border-dashed border-black bg-white px-4 font-mono text-xs text-black"
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      <div className="border-b-2 border-black pb-2 text-center">
        <div className="text-base font-extrabold uppercase">{resolvedTitle}</div>
      </div>

      <div className="my-2 space-y-1.5 text-xs">
        <div className="font-bold">ĐƠN HÀNG: {orderCode}</div>
        <div className="border-2 border-black p-2 text-center text-sm font-extrabold uppercase">
          <div>CHUYỂN TỪ: {`>>> ${normalizedFrom} <<<`}</div>
          <div className="mt-1">SANG BÀN: {`>>> ${normalizedTo} <<<`}</div>
        </div>
        {tpl.blocks.time ? <div>Thời gian: {formattedTime}</div> : null}
        {tpl.blocks.cashier ? (
          <div data-testid="table-transfer-cashier">
            Nhân viên: {cashierName?.trim() || 'Thu ngân'}
          </div>
        ) : null}
        <div className="font-bold">Trạm ảnh hưởng: {stationLabels}</div>
      </div>

      <div
        data-testid="table-transfer-footer"
        className="border-t border-dashed border-black pt-1.5 text-center text-xs font-bold"
      >
        {resolvedFooter}
      </div>
    </div>
  );
}
