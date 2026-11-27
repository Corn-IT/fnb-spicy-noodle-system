import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import * as transport from '../physical-print-transport.util';
import { ESC_POS_COMMANDS } from '../escpos-encoder.util';
import { useThermalPrinterConfigStore } from '../printer-config.store';
import { ThermalPrintProvider, useThermalPrinter } from '../thermal-print-provider';

const callbacks = vi.hoisted(() => [] as (() => void)[]);
const liveSettings = vi.hoisted(() => ({ font: 'roboto' }));
vi.mock('../provisional-vietqr-slip', () => ({
  ProvisionalVietQrSlip: ({ onReadyToPrint }: { onReadyToPrint?: () => void }) => {
    if (onReadyToPrint) callbacks.push(onReadyToPrint);
    return <div className="ticket-page" data-thermal-font={liveSettings.font}>Mì cay Đặng</div>;
  },
}));

vi.mock('../official-receipt-slip', () => ({
  OfficialReceiptSlip: () => <div className="ticket-page" data-thermal-font="roboto"><img src="/optional-logo.png" alt="Logo" height={36} /></div>,
}));

function Controls() {
  const printer = useThermalPrinter();
  return <>
    <button onClick={() => printer.printProvisionalVietQr({ orderId: 1, orderCode: 'HD1', orderType: 'DINE_IN', tableId: 1, takeawayNumber: null, tableLabel: 'Bàn 01', totalAmount: 60000, status: 'SERVING', items: [] })}>Print</button>
    <button onClick={() => printer.printOfficialReceipt({ orderCode: 'HD1', tableLabel: 'Bàn 01', paymentMethod: 'CASH', cashAmount: 60000, transferAmount: 0, totalAmount: 60000, items: [] })}>Receipt</button>
    <button onClick={printer.clearPrintQueue}>Cancel</button>
    <output>{printer.lastPhysicalPrintError}</output>
  </>;
}

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
afterEach(() => {
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode);
  else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  callbacks.length = 0;
  liveSettings.font = 'roboto';
  useThermalPrinterConfigStore.getState().resetConfig();
  vi.restoreAllMocks();
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
});

function startPrint(load: ReturnType<typeof vi.fn>) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  render(<ThermalPrintProvider><Controls /></ThermalPrintProvider>);
  fireEvent.click(screen.getByText('Print'));
  return print;
}

it('coalesces duplicate readiness callbacks while waiting and after printing', async () => {
  let resolve!: (faces: FontFace[]) => void;
  const loaded = new Promise<FontFace[]>((done) => { resolve = done; });
  const load = vi.fn(() => loaded);
  const print = startPrint(load);
  const ready = callbacks.at(-1)!;
  act(() => { ready(); ready(); });
  expect(print).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => { resolve([{} as FontFace]); });
  act(() => { ready(); });
  expect(print).toHaveBeenCalledTimes(1);
});

it('does not print a cancelled job when its fonts become ready', async () => {
  let resolve!: (faces: FontFace[]) => void;
  const loaded = new Promise<FontFace[]>((done) => { resolve = done; });
  const print = startPrint(vi.fn(() => loaded));
  act(() => callbacks.at(-1)!());
  fireEvent.click(screen.getByText('Cancel'));
  await act(async () => { resolve([{} as FontFace]); });
  expect(print).not.toHaveBeenCalled();
});

it('reports font loading errors and dequeues the job without printing fallback text', async () => {
  const print = startPrint(vi.fn().mockRejectedValue(new Error('Font unavailable')));
  await act(async () => callbacks.at(-1)!());
  expect(print).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Font unavailable');
});


it('waits for a changed live family before printing the same browser job', async () => {
  const resolvers: ((faces: FontFace[]) => void)[] = [];
  const load = vi.fn(() => new Promise<FontFace[]>((resolve) => resolvers.push(resolve)));
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const view = render(<ThermalPrintProvider><Controls /></ThermalPrintProvider>);
  fireEvent.click(screen.getByText('Print'));
  act(() => callbacks.at(-1)!());
  expect(load).toHaveBeenCalledTimes(2);
  liveSettings.font = 'noto-sans';
  view.rerender(<ThermalPrintProvider><Controls /></ThermalPrintProvider>);
  await act(async () => { resolvers[0]!([{} as FontFace]); resolvers[1]!([{} as FontFace]); });
  expect(print).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(4);
  expect(load).toHaveBeenCalledWith('400 16px "Noto Sans"', expect.any(String));
  await act(async () => { resolvers[2]!([{} as FontFace]); resolvers[3]!([{} as FontFace]); });
  expect(print).toHaveBeenCalledTimes(1);
});

it.each(['broken', 'stalled'])('dispatches a physical cash receipt when its optional logo is %s', async (state) => {
  const decode = vi.fn(() => state === 'broken' ? Promise.reject(new Error('Broken logo')) : new Promise<void>(() => {}));
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode });
  useThermalPrinterConfigStore.getState().updateConfig({ driver: 'LAN_ESCPOS', cashDrawerKick: true });
  const dispatch = vi.spyOn(transport, 'dispatchLanEscPosPrint').mockResolvedValue({ transport: 'LAN_ESCPOS', bytesSent: 1 });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockResolvedValue([{} as FontFace]) } });
  render(<ThermalPrintProvider><Controls /></ThermalPrintProvider>);
  fireEvent.click(screen.getByText('Receipt'));
  await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  const bytes = dispatch.mock.calls[0]![0];
  expect(Array.from(bytes).join(',')).toContain(Array.from(ESC_POS_COMMANDS.CASH_DRAWER_KICK).join(','));
  expect(decode).not.toHaveBeenCalled();
});
