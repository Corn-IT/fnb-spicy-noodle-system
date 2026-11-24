import * as React from 'react';

import {
  buildCashDrawerKickPayload,
  encodeThermalContainerToEscPos,
} from './escpos-encoder.util';
import {
  KitchenCancelItemSlip,
  type KitchenCancelItemSlipProps,
} from './kitchen-cancel-item-slip';
import { KitchenSplitSlip, type KitchenSplitSlipProps } from './kitchen-split-slip';
import { OfficialReceiptSlip, type OfficialReceiptSlipProps } from './official-receipt-slip';
import {
  dispatchLanEscPosPrint,
  dispatchRawbtUsbPrint,
  type PhysicalPrintDispatchResult,
} from './physical-print-transport.util';
import { useThermalPrinterConfigStore } from './printer-config.store';
import {
  ProvisionalVietQrSlip,
  type ProvisionalVietQrSlipData,
} from './provisional-vietqr-slip';
import {
  TableTransferNoticeSlip,
  type TableTransferNoticeSlipProps,
} from './table-transfer-notice-slip';
import { TableQrSlip, type TableQrSlipProps } from './table-qr-slip';

export type ThermalPrintJob =
  | {
      id: string;
      type: 'KITCHEN_SPLIT';
      payload: KitchenSplitSlipProps;
    }
  | {
      id: string;
      type: 'TABLE_TRANSFER_NOTICE';
      payload: TableTransferNoticeSlipProps;
    }
  | {
      id: string;
      type: 'KITCHEN_CANCEL_ITEM';
      payload: KitchenCancelItemSlipProps;
    }
  | {
      id: string;
      type: 'PROVISIONAL_VIETQR';
      payload: ProvisionalVietQrSlipData;
    }
  | {
      id: string;
      type: 'OFFICIAL_RECEIPT';
      payload: OfficialReceiptSlipProps;
    }
  | {
      id: string;
      type: 'TABLE_QR';
      payload: TableQrSlipProps;
    };

export interface ThermalPrinterContextValue {
  printQueue: ThermalPrintJob[];
  activePrintJob: ThermalPrintJob | null;
  lastPhysicalPrintResult: PhysicalPrintDispatchResult | null;
  lastPhysicalPrintError: string | null;
  printKitchenSplit: (payload: KitchenSplitSlipProps) => void;
  printTableTransferNotice: (payload: TableTransferNoticeSlipProps) => void;
  printKitchenCancelItem: (payload: KitchenCancelItemSlipProps) => void;
  printProvisionalVietQr: (payload: ProvisionalVietQrSlipData) => void;
  printOfficialReceipt: (payload: OfficialReceiptSlipProps) => void;
  printTableQr: (payload: TableQrSlipProps) => void;
  kickCashDrawerNow: () => Promise<PhysicalPrintDispatchResult | null>;
  clearPrintQueue: () => void;
}

const noop = () => {};
const asyncNullNoop = async () => null;

const defaultPrinterContext: ThermalPrinterContextValue = {
  printQueue: [],
  activePrintJob: null,
  lastPhysicalPrintResult: null,
  lastPhysicalPrintError: null,
  printKitchenSplit: noop,
  printTableTransferNotice: noop,
  printKitchenCancelItem: noop,
  printProvisionalVietQr: noop,
  printOfficialReceipt: noop,
  printTableQr: noop,
  kickCashDrawerNow: asyncNullNoop,
  clearPrintQueue: noop,
};

const ThermalPrinterContext = React.createContext<ThermalPrinterContextValue>(
  defaultPrinterContext,
);

let printJobCounter = 0;

function createJobId(prefix: string): string {
  printJobCounter += 1;
  return `${prefix}-${Date.now()}-${printJobCounter}`;
}

export interface ThermalPrintProviderProps {
  children: React.ReactNode;
}

/** Bỏ job vừa in khỏi hàng đợi; giữ nguyên mảng khi hàng đợi đã trống để không render lại thừa. */
function dequeuePrintJob(queue: ThermalPrintJob[], jobId: string): ThermalPrintJob[] {
  if (queue.length === 0) return queue;
  return queue.length > 1 ? queue.filter((item) => item.id !== jobId) : [];
}

export function ThermalPrintProvider({ children }: ThermalPrintProviderProps) {
  const [printQueue, setPrintQueue] = React.useState<ThermalPrintJob[]>([]);
  const [lastJob, setLastJob] = React.useState<ThermalPrintJob | null>(null);
  const [lastPhysicalPrintResult, setLastPhysicalPrintResult] =
    React.useState<PhysicalPrintDispatchResult | null>(null);
  const [lastPhysicalPrintError, setLastPhysicalPrintError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const leftMarginMm = useThermalPrinterConfigStore((state) => state.config.leftMarginMm ?? 0);
  const rightMarginMm = useThermalPrinterConfigStore((state) => state.config.rightMarginMm ?? 0);

  const activePrintJob = printQueue[0] ?? null;
  const currentRenderJob = activePrintJob ?? lastJob;
  const currentRenderJobRef = React.useRef<ThermalPrintJob | null>(null);
  currentRenderJobRef.current = currentRenderJob;

  const executeBrowserPrintAndDequeue = React.useCallback((jobId: string) => {
    const printerConfig = useThermalPrinterConfigStore.getState().config;
    const job = currentRenderJobRef.current;

    if (printerConfig.driver === 'BROWSER') {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        const isAutomation = Boolean(
          (typeof navigator !== 'undefined' && navigator.webdriver) ||
            window.location.search.includes('no-print') ||
            window.localStorage.getItem('fnb_disable_native_print') === 'true',
        );
        if (!isAutomation) {
          window.print();
        } else {
          console.log('[ThermalPrint] Automation mode detected: simulated print for job', jobId);
        }
      }
      setPrintQueue((prev) => dequeuePrintJob(prev, jobId));
      return;
    }

    const containerEl =
      containerRef.current ??
      (typeof document !== 'undefined'
        ? document.getElementById('thermal-print-container')
        : null);

    setPrintQueue((prev) => dequeuePrintJob(prev, jobId));

    if (!containerEl) {
      return;
    }

    const shouldKickCashDrawer = Boolean(
      printerConfig.cashDrawerKick &&
        job?.type === 'OFFICIAL_RECEIPT' &&
        job.payload.paymentMethod !== 'TRANSFER',
    );

    void (async () => {
      try {
        setLastPhysicalPrintError(null);
        const escPosBytes = await encodeThermalContainerToEscPos(containerEl, {
          paperWidthDots: printerConfig.paperWidthDots,
          kickCashDrawer: shouldKickCashDrawer,
          leftMarginMm: printerConfig.leftMarginMm,
          rightMarginMm: printerConfig.rightMarginMm,
          feedLinesBeforeCut: printerConfig.feedLinesBeforeCut,
        });

        if (printerConfig.driver === 'RAWBT_USB') {
          const res = await dispatchRawbtUsbPrint(escPosBytes, {
            wsUrl: printerConfig.rawbtWsUrl,
            fallbackToIntent: printerConfig.rawbtFallbackToIntent,
          });
          setLastPhysicalPrintResult(res);
        } else if (printerConfig.driver === 'LAN_ESCPOS') {
          const res = await dispatchLanEscPosPrint(escPosBytes, printerConfig);
          setLastPhysicalPrintResult(res);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi gửi lệnh in nhiệt ESC/POS';
        setLastPhysicalPrintError(msg);
      }
    })();
  }, []);

  // Phiếu chờ ảnh (VietQR, logo) báo "sẵn sàng in" qua callback này. Callback phải ổn định và chỉ
  // gắn cho job ĐANG chờ in: phiếu đã in vẫn được giữ trên màn (lastJob), nếu nó còn callback thì
  // mỗi lần render lại sẽ tự in thêm một bản (vòng lặp in liên tục).
  const activePrintJobIdRef = React.useRef<string | null>(null);
  activePrintJobIdRef.current = activePrintJob?.id ?? null;
  // Callback gắn với ĐÚNG job đang chờ: phiếu cũ (đã bị thay bằng lệnh in mới) có gọi muộn cũng
  // không in nhầm phiếu mới trước khi ảnh VietQR của phiếu mới tải xong.
  const activeJobId = activePrintJob?.id ?? null;
  const handleSlipReadyToPrint = React.useMemo(() => {
    if (!activeJobId) return undefined;
    return () => {
      if (activePrintJobIdRef.current === activeJobId) executeBrowserPrintAndDequeue(activeJobId);
    };
  }, [activeJobId, executeBrowserPrintAndDequeue]);

  const kickCashDrawerNow = React.useCallback(async (): Promise<PhysicalPrintDispatchResult | null> => {
    const printerConfig = useThermalPrinterConfigStore.getState().config;
    const kickBytes = buildCashDrawerKickPayload();
    setLastPhysicalPrintError(null);

    try {
      if (printerConfig.driver === 'LAN_ESCPOS') {
        const res = await dispatchLanEscPosPrint(kickBytes, printerConfig);
        setLastPhysicalPrintResult(res);
        return res;
      }
      // For RAWBT_USB (or even if called while testing drawer from Android POS)
      const res = await dispatchRawbtUsbPrint(kickBytes, {
        wsUrl: printerConfig.rawbtWsUrl,
        fallbackToIntent: printerConfig.rawbtFallbackToIntent,
      });
      setLastPhysicalPrintResult(res);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi xung mở két đựng tiền RJ11';
      setLastPhysicalPrintError(msg);
      throw err;
    }
  }, []);

  React.useEffect(() => {
    if (!activePrintJob) return;
    if (
      activePrintJob.type === 'PROVISIONAL_VIETQR' ||
      (activePrintJob.type === 'TABLE_QR' && Boolean(activePrintJob.payload.logoUrl))
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      executeBrowserPrintAndDequeue(activePrintJob.id);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [activePrintJob, executeBrowserPrintAndDequeue]);

  const enqueueReplacementOrAppend = React.useCallback((job: ThermalPrintJob) => {
    setLastJob(job);
    setPrintQueue([job]);
  }, []);

  const clearPrintQueue = React.useCallback(() => {
    setLastJob(null);
    setPrintQueue([]);
  }, []);

  const contextValue = React.useMemo<ThermalPrinterContextValue>(
    () => ({
      printQueue,
      activePrintJob,
      lastPhysicalPrintResult,
      lastPhysicalPrintError,
      printKitchenSplit: (payload) => {
        if (payload.tickets.length === 0) return;
        enqueueReplacementOrAppend({
          id: createJobId('kitchen-split'),
          type: 'KITCHEN_SPLIT',
          payload,
        });
      },
      printTableTransferNotice: (payload) => {
        enqueueReplacementOrAppend({
          id: createJobId('table-transfer'),
          type: 'TABLE_TRANSFER_NOTICE',
          payload,
        });
      },
      printKitchenCancelItem: (payload) => {
        if (payload.slips.length === 0) return;
        enqueueReplacementOrAppend({
          id: createJobId('kitchen-cancel'),
          type: 'KITCHEN_CANCEL_ITEM',
          payload,
        });
      },
      printProvisionalVietQr: (payload) => {
        enqueueReplacementOrAppend({
          id: createJobId('provisional-vietqr'),
          type: 'PROVISIONAL_VIETQR',
          payload,
        });
      },
      printOfficialReceipt: (payload) => {
        enqueueReplacementOrAppend({
          id: createJobId('official-receipt'),
          type: 'OFFICIAL_RECEIPT',
          payload,
        });
      },
      printTableQr: (payload) => {
        enqueueReplacementOrAppend({
          id: createJobId('table-qr'),
          type: 'TABLE_QR',
          payload,
        });
      },
      kickCashDrawerNow,
      clearPrintQueue,
    }),
    [
      printQueue,
      activePrintJob,
      lastPhysicalPrintResult,
      lastPhysicalPrintError,
      enqueueReplacementOrAppend,
      kickCashDrawerNow,
      clearPrintQueue,
    ],
  );

  return (
    <ThermalPrinterContext.Provider value={contextValue}>
      {children}
      <div
        ref={containerRef}
        id="thermal-print-container"
        data-testid="thermal-print-container"
        aria-hidden="true"
        className="hidden print:block"
        style={
          {
            '--thermal-left-margin-mm': `${leftMarginMm}mm`,
            '--thermal-right-margin-mm': `${rightMarginMm}mm`,
          } as React.CSSProperties
        }
      >
        {currentRenderJob?.type === 'KITCHEN_SPLIT' ? (
          <KitchenSplitSlip key={currentRenderJob.id} {...currentRenderJob.payload} />
        ) : null}

        {currentRenderJob?.type === 'TABLE_TRANSFER_NOTICE' ? (
          <TableTransferNoticeSlip key={currentRenderJob.id} {...currentRenderJob.payload} />
        ) : null}

        {currentRenderJob?.type === 'KITCHEN_CANCEL_ITEM' ? (
          <KitchenCancelItemSlip key={currentRenderJob.id} {...currentRenderJob.payload} />
        ) : null}

        {currentRenderJob?.type === 'PROVISIONAL_VIETQR' ? (
          <ProvisionalVietQrSlip
            key={currentRenderJob.id}
            bill={currentRenderJob.payload}
            onReadyToPrint={
              activePrintJob?.id === currentRenderJob.id ? handleSlipReadyToPrint : undefined
            }
          />
        ) : null}

        {currentRenderJob?.type === 'OFFICIAL_RECEIPT' ? (
          <OfficialReceiptSlip key={currentRenderJob.id} {...currentRenderJob.payload} />
        ) : null}

        {currentRenderJob?.type === 'TABLE_QR' ? (
          <TableQrSlip
            key={currentRenderJob.id}
            {...currentRenderJob.payload}
            onReadyToPrint={
              currentRenderJob.payload.logoUrl && activePrintJob?.id === currentRenderJob.id
                ? handleSlipReadyToPrint
                : undefined
            }
          />
        ) : null}
      </div>
    </ThermalPrinterContext.Provider>
  );
}

export function useThermalPrinter(): ThermalPrinterContextValue {
  return React.useContext(ThermalPrinterContext);
}
