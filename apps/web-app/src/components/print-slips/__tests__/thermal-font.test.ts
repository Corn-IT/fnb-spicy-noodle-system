import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForThermalFont } from '../thermal-font.util';

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
afterEach(() => {
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
  vi.useRealTimers();
});

describe('thermal font readiness', () => {
  it('fails when a named font has no matching faces instead of silently printing fallback text', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
    await expect(waitForThermalFont('roboto')).rejects.toThrow('Roboto');
  });

  it('times out a stalled font and loads both regular and bold Vietnamese text', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<FontFace[]>(() => {}));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    const result = expect(waitForThermalFont('noto-sans')).rejects.toThrow('Noto Sans');
    await vi.advanceTimersByTimeAsync(10000);
    await result;
    expect(load).toHaveBeenCalledWith('400 16px "Noto Sans"', expect.stringContaining('ặ'));
    expect(load).toHaveBeenCalledWith('700 16px "Noto Sans"', expect.stringContaining('ặ'));
  });
});
