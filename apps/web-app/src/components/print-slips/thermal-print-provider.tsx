import * as React from 'react';

import {
  KitchenCancelItemSlip,
  type KitchenCancelItemSlipProps,
} from './kitchen-cancel-item-slip';
import { KitchenSplitSlip, type KitchenSplitSlipProps } from './kitchen-split-slip';
import { OfficialReceiptSlip, type OfficialReceiptSlipProps } from './official-receipt-slip';
import {
  ProvisionalVietQrSlip,
  type ProvisionalVietQrSlipData,
} from './provisional-vietqr-slip';
import {
  TableTransferNoticeSlip,
  type TableTransferNoticeSlipProps,
} from './table-transfer-notice-slip';

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
    };

export interface ThermalPrinterContextValue {
  printQueue: ThermalPrintJob[];
  activePrintJob: ThermalPrintJob | null;
  printKitchenSplit: (payload: KitchenSplitSlipProps) => void;
  printTableTransferNotice: (payload: TableTransferNoticeSlipProps) => void;
  printKitchenCancelItem: (payload: KitchenCancelItemSlipProps) => void;
  printProvisionalVietQr: (payload: ProvisionalVietQrSlipData) => void;
  printOfficialReceipt: (payload: OfficialReceiptSlipProps) => void;
  clearPrintQueue: () => void;
}

const noop = () => {};

const defaultPrinterContext: ThermalPrinterContextValue = {
  printQueue: [],
  activePrintJob: null,
  printKitchenSplit: noop,
  printTableTransferNotice: noop,
  printKitchenCancelItem: noop,
  printProvisionalVietQr: noop,
  printOfficialReceipt: noop,
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

export function ThermalPrintProvider({ children }: ThermalPrintProviderProps) {
  const [printQueue, setPrintQueue] = React.useState<ThermalPrintJob[]>([]);
  const [lastJob, setLastJob] = React.useState<ThermalPrintJob | null>(null);

  const activePrintJob = printQueue[0] ?? null;
  const currentRenderJob = activePrintJob ?? lastJob;

  const executeBrowserPrintAndDequeue = React.useCallback((jobId: string) => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      const isAutomation = Boolean(
        (typeof navigator !== 'undefined' && navigator.webdriver) ||
        window.location.search.includes('no-print') ||
        window.localStorage.getItem('fnb_disable_native_print') === 'true'
      );
      if (!isAutomation) {
        window.print();
      } else {
        console.log('[ThermalPrint] Automation mode detected: simulated print for job', jobId);
      }
    }
    setPrintQueue((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== jobId) : []));
  }, []);

  React.useEffect(() => {
    if (!activePrintJob) return;
    if (activePrintJob.type === 'PROVISIONAL_VIETQR') {
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
      clearPrintQueue,
    }),
    [printQueue, activePrintJob, enqueueReplacementOrAppend, clearPrintQueue],
  );

  return (
    <ThermalPrinterContext.Provider value={contextValue}>
      {children}
      <div
        id="thermal-print-container"
        data-testid="thermal-print-container"
        aria-hidden="true"
        className="hidden print:block"
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
            onReadyToPrint={() => executeBrowserPrintAndDequeue(currentRenderJob.id)}
          />
        ) : null}

        {currentRenderJob?.type === 'OFFICIAL_RECEIPT' ? (
          <OfficialReceiptSlip key={currentRenderJob.id} {...currentRenderJob.payload} />
        ) : null}
      </div>
    </ThermalPrinterContext.Provider>
  );
}

export function useThermalPrinter(): ThermalPrinterContextValue {
  return React.useContext(ThermalPrinterContext);
}
