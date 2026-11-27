import { afterEach, expect, it, vi } from 'vitest';
import { renderTicketPageToMonochrome } from '../escpos-encoder.util';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function makeTicket(decode: () => Promise<void>) {
  const ticket = document.createElement('div');
  ticket.innerHTML = '<img data-print-kind="qr" height="176" alt="VietQR" />';
  const snapshot = ticket.cloneNode(true) as HTMLElement;
  const image = snapshot.querySelector('img')!;
  Object.defineProperty(image, 'decode', { value: decode });
  const drawImage = vi.fn();
  const context = {
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    fillRect: vi.fn(), drawImage,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  return { ticket: snapshot, image, drawImage };
}

it('waits for a first-print cloned QR image to decode before drawing it', async () => {
  let finish!: () => void;
  const { ticket, image, drawImage } = makeTicket(() => new Promise<void>((resolve) => { finish = resolve; }));
  const rendered = renderTicketPageToMonochrome(ticket);
  await Promise.resolve();
  expect(drawImage).not.toHaveBeenCalled();
  Object.defineProperty(image, 'complete', { value: true });
  Object.defineProperty(image, 'naturalWidth', { value: 176 });
  finish();
  await rendered;
  expect(drawImage).toHaveBeenCalledTimes(1);
});

it('reports a failed required QR decode', async () => {
  const { ticket } = makeTicket(() => Promise.reject(new Error('Broken QR')));
  await expect(renderTicketPageToMonochrome(ticket)).rejects.toThrow('ảnh QR');
});

it('bounds a stalled required QR decode', async () => {
  vi.useFakeTimers();
  const { ticket } = makeTicket(() => new Promise<void>(() => {}));
  const rejected = expect(renderTicketPageToMonochrome(ticket)).rejects.toThrow('ảnh QR');
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
});
