import {
  PRINT_TEMPLATE_DEFAULTS,
  type KitchenStation,
  type PublicStoreSettingsResponse,
} from '@fnb/shared';

import { useStoreSettings } from '@/hooks/use-store-settings';
import {
  formatTransferFooterNote,
  getThermalSlipRootStyle,
  resolveThermalFontSizePt,
} from './print-template.util';
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
  const fontSizePt = resolveThermalFontSizePt(tpl.fontSizePt);
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
      data-font-size-pt={fontSizePt}
      className="ticket-page break-words bg-white px-0 py-0 font-mono text-black"
      style={getThermalSlipRootStyle(fontSizePt)}
    >
      <div className="border-b-2 border-black pb-1 text-center">
        <div
          data-print-kind="heading"
          data-print-scale="1.35"
          className="font-extrabold uppercase"
          style={{ fontSize: '1.35em' }}
        >
          {resolvedTitle}
        </div>
      </div>

      <div className="my-1 space-y-1">
        <div data-print-kind="text" data-print-bold className="font-bold">
          ĐƠN HÀNG: {orderCode}
        </div>
        <div
          data-print-kind="banner"
          className="border-2 border-black p-1.5 text-center font-extrabold uppercase"
          style={{ fontSize: '1.1em' }}
        >
          <div>CHUYỂN TỪ: {`>>> ${normalizedFrom} <<<`}</div>
          <div className="mt-0.5">SANG BÀN: {`>>> ${normalizedTo} <<<`}</div>
        </div>
        {tpl.blocks.time ? (
          <div data-print-kind="text" data-print-scale="0.85" style={{ fontSize: '0.85em' }}>
            Thời gian: {formattedTime}
          </div>
        ) : null}
        {tpl.blocks.cashier ? (
          <div
            data-testid="table-transfer-cashier"
            data-print-kind="text"
            data-print-scale="0.85"
            style={{ fontSize: '0.85em' }}
          >
            Nhân viên: {cashierName?.trim() || 'Thu ngân'}
          </div>
        ) : null}
        <div data-print-kind="text" data-print-bold className="font-bold">
          Trạm ảnh hưởng: {stationLabels}
        </div>
      </div>

      <div
        data-testid="table-transfer-footer"
        data-print-kind="text"
        data-print-scale="0.85"
        data-print-align="center"
        data-print-bold
        className="border-t border-dashed border-black pt-1 text-center font-bold"
        style={{ fontSize: '0.85em' }}
      >
        {resolvedFooter}
      </div>
    </div>
  );
}
