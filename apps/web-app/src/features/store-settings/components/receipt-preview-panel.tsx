import type {
  KitchenStation,
  PrintTemplateKey,
  PublicStoreSettingsResponse,
  SplitKitchenResponse,
} from '@fnb/shared';
import * as React from 'react';

import {
  buildVietQrFallbackSvgDataUrl,
  KitchenCancelItemSlip,
  KitchenSplitSlip,
  OfficialReceiptSlip,
  ProvisionalVietQrSlip,
  STATION_META,
  TableTransferNoticeSlip,
} from '@/components/print-slips';
import { cn } from '@/utils/cn';

export interface ReceiptPreviewPanelProps {
  storeSettings: PublicStoreSettingsResponse;
  templateKey?: PrintTemplateKey;
}

const TEMPLATE_PREVIEW_LABELS: Record<PrintTemplateKey, string> = {
  provisional: 'Tạm tính + VietQR',
  official: 'Hoá đơn chính thức',
  kitchen: 'Tách bếp (3 trạm)',
  kitchenCancel: 'Báo huỷ món bếp',
  tableTransfer: 'Thông báo đổi bàn',
};

const SAMPLE_RECEIPT_ITEMS = [
  {
    name: 'Mì Cay Hải Sản (Cấp 2)',
    quantity: 2,
    unitPrice: 55000,
    lineTotal: 110000,
    modifiers: ['Cấp độ 2', 'Thêm Xúc xích'],
    note: 'Ít hành lá',
  },
  {
    name: 'Trà Đào Cam Sả',
    quantity: 1,
    unitPrice: 29000,
    lineTotal: 29000,
    modifiers: ['Ít đá'],
    note: null,
  },
];

const SAMPLE_PROVISIONAL_QR = buildVietQrFallbackSvgDataUrl({
  amount: 139000,
  orderCode: 'HD-MẪU-0001',
  tableLabel: 'BÀN 05',
  tableId: 5,
  orderType: 'DINE_IN',
});

const KITCHEN_STATION_SAMPLES: ReadonlyArray<{
  station: KitchenStation;
  shortLabel: string;
  ticket: SplitKitchenResponse['tickets'][number];
}> = [
  {
    station: 'BEP_NAU',
    shortLabel: 'Bếp Nấu',
    ticket: {
      station: 'BEP_NAU',
      stationTitle: STATION_META.BEP_NAU.title,
      logoType: STATION_META.BEP_NAU.logoType,
      batchNo: 1,
      batchLabel: 'Lượt 1',
      items: [
        {
          name: 'Mì Cay Hải Sản',
          qty: 2,
          modifiers: ['Cấp độ 2', 'Xúc xích'],
          note: 'Ít hành lá',
        },
      ],
    },
  },
  {
    station: 'BEP_CHIEN',
    shortLabel: 'Bếp Chiên',
    ticket: {
      station: 'BEP_CHIEN',
      stationTitle: STATION_META.BEP_CHIEN.title,
      logoType: STATION_META.BEP_CHIEN.logoType,
      batchNo: 1,
      batchLabel: 'Lượt 1',
      items: [
        {
          name: 'Gà Rán Giòn Cay',
          qty: 1,
          modifiers: ['Sốt cay Hàn Quốc'],
          note: 'Chiên giòn ráo dầu',
        },
      ],
    },
  },
  {
    station: 'PHA_CHE',
    shortLabel: 'Quầy Nước',
    ticket: {
      station: 'PHA_CHE',
      stationTitle: STATION_META.PHA_CHE.title,
      logoType: STATION_META.PHA_CHE.logoType,
      batchNo: 1,
      batchLabel: 'Lượt 1',
      items: [
        {
          name: 'Trà Đào Cam Sả',
          qty: 1,
          modifiers: ['Ít đá', 'Trân châu trắng'],
          note: '',
        },
      ],
    },
  },
];

export function ReceiptPreviewPanel({
  storeSettings,
  templateKey = 'official',
}: ReceiptPreviewPanelProps) {
  const [selectedKitchenStation, setSelectedKitchenStation] =
    React.useState<KitchenStation>('BEP_NAU');

  const activeKitchenSample =
    KITCHEN_STATION_SAMPLES.find((entry) => entry.station === selectedKitchenStation) ??
    KITCHEN_STATION_SAMPLES[0];

  const sampleAccountName = (storeSettings.receipt.printName || storeSettings.storeName || 'CHỦ QUÁN').toUpperCase();

  const renderSlip = () => {
    switch (templateKey) {
      case 'provisional':
        return (
          <ProvisionalVietQrSlip
            bill={{
              orderId: 999,
              orderCode: 'HD-MẪU-0001',
              orderType: 'DINE_IN',
              tableId: 5,
              tableLabel: 'Bàn 05',
              takeawayNumber: null,
              totalAmount: 139000,
              status: 'SERVING',
              cashierName: 'Nguyễn Minh Quân',
              vietQrPayload: SAMPLE_PROVISIONAL_QR,
              paymentAccount: {
                id: 1,
                label: 'MB Chính',
                bankName: 'MB Bank',
                bankCode: 'MB',
                accountNo: '0123456789',
                accountName: sampleAccountName,
              },
              items: SAMPLE_RECEIPT_ITEMS,
            }}
            storeSettings={storeSettings}
          />
        );
      case 'kitchen':
        return (
          <KitchenSplitSlip
            orderCode="HD-MẪU-0001"
            orderType="DINE_IN"
            tableLabel="BÀN 05"
            printedAt="15/11/2026 12:30:00"
            orderNote="Làm nhanh bàn khách đặt trước"
            tickets={[activeKitchenSample.ticket]}
            storeSettings={storeSettings}
          />
        );
      case 'kitchenCancel':
        return (
          <KitchenCancelItemSlip
            orderCode="HD-MẪU-0001"
            printedAt="12:30:00 15/11/2026"
            slips={[
              {
                station: 'BEP_NAU',
                tableLabel: 'BÀN 05',
                itemName: 'Mì Cay Hải Sản (Cấp 2)',
                quantity: 1,
              },
            ]}
            storeSettings={storeSettings}
          />
        );
      case 'tableTransfer':
        return (
          <TableTransferNoticeSlip
            orderCode="HD-MẪU-0001"
            fromLabel="Bàn 03"
            toLabel="Bàn 08"
            affectedStations={['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']}
            printedAt="15/11/2026 12:30:00"
            cashierName="Nguyễn Minh Quân"
            storeSettings={storeSettings}
          />
        );
      case 'official':
      default:
        return (
          <OfficialReceiptSlip
            orderCode="HD-MẪU-0001"
            tableLabel="BÀN 05"
            cashierName="Nguyễn Minh Quân"
            paidAt="15/11/2026 12:30:00"
            paymentMethod="SPLIT"
            cashAmount={59000}
            transferAmount={80000}
            totalAmount={139000}
            items={SAMPLE_RECEIPT_ITEMS}
            storeSettings={storeSettings}
          />
        );
    }
  };

  return (
    <div className="min-w-0 space-y-2.5 rounded-xl border bg-muted/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Xem trước 80mm · {TEMPLATE_PREVIEW_LABELS[templateKey]}
        </h3>
        <span className="text-[11px] font-medium text-accent-text">Cập nhật trực tiếp</span>
      </div>
      {templateKey === 'kitchen' ? (
        <div
          role="tablist"
          aria-label="Chọn trạm bếp xem trước"
          className="grid grid-cols-3 gap-1 rounded-lg border bg-background/70 p-1"
        >
          {KITCHEN_STATION_SAMPLES.map((entry) => {
            const isSelected = entry.station === activeKitchenSample.station;
            return (
              <button
                key={entry.station}
                type="button"
                role="tab"
                aria-selected={isSelected}
                data-testid={`kitchen-preview-station-${entry.station}`}
                onClick={() => setSelectedKitchenStation(entry.station)}
                className={cn(
                  'truncate rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                {entry.shortLabel}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        data-testid="receipt-live-preview"
        data-preview-template={templateKey}
        className="mx-auto w-full max-w-[320px] overflow-x-auto rounded-lg border bg-white p-2 shadow-sm"
      >
        {renderSlip()}
      </div>
    </div>
  );
}
