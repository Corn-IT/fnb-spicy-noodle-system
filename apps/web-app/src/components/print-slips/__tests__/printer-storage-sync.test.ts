import { DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG } from '@fnb/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { syncPrinterConfigFromStorage, THERMAL_PRINTER_CONFIG_STORAGE_KEY, useThermalPrinterConfigStore } from '../printer-config.store';

describe('printer device storage synchronization', () => {
  beforeEach(() => { localStorage.clear(); useThermalPrinterConfigStore.getState().resetConfig(); });
  it('adopts validated configuration saved by another tab and ignores malformed data', () => {
    const saved = JSON.stringify({ state: { config: { ...DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG, driver: 'LAN_ESCPOS', lanHost: '192.168.1.123' } }, version: 0 });
    localStorage.setItem(THERMAL_PRINTER_CONFIG_STORAGE_KEY, saved);
    syncPrinterConfigFromStorage(new StorageEvent('storage', { key: THERMAL_PRINTER_CONFIG_STORAGE_KEY, newValue: saved }));
    expect(useThermalPrinterConfigStore.getState().config.driver).toBe('LAN_ESCPOS');
    expect(useThermalPrinterConfigStore.getState().config.lanHost).toBe('192.168.1.123');
    for (const invalid of ['{', JSON.stringify({ state: { config: { driver: 'UNKNOWN' } } })]) {
      localStorage.setItem(THERMAL_PRINTER_CONFIG_STORAGE_KEY, invalid);
      syncPrinterConfigFromStorage(new StorageEvent('storage', { key: THERMAL_PRINTER_CONFIG_STORAGE_KEY, newValue: invalid }));
      expect(useThermalPrinterConfigStore.getState().config.lanHost).toBe('192.168.1.123');
    }
  });

  it('sanitizes valid vs invalid partial fields in setDriver/updateConfig and restores persisted config cleanly', () => {
    const store = useThermalPrinterConfigStore.getState();
    store.setDriver('RAWBT_USB');
    expect(useThermalPrinterConfigStore.getState().config.driver).toBe('RAWBT_USB');

    // Pass mix of valid and invalid fields -> fallback keeps safe current values for invalid keys
    store.updateConfig({
      driver: 'BAD_DRIVER' as never,
      paperWidthDots: 999 as never,
      cashDrawerKick: 'yes' as never,
      rawbtWsUrl: '   ',
      rawbtFallbackToIntent: 'no' as never,
      lanHost: '   ',
      lanPort: 99999,
      lanTimeoutMs: 10,
      leftMarginMm: 99,
      rightMarginMm: -2,
      feedLinesBeforeCut: 10,
    });
    const afterInvalid = useThermalPrinterConfigStore.getState().config;
    expect(afterInvalid.driver).toBe('RAWBT_USB');
    expect(afterInvalid.paperWidthDots).toBe(DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG.paperWidthDots);

    // Valid sanitized update path (partial fallback where only subset is invalid)
    store.updateConfig({
      driver: 'LAN_ESCPOS',
      paperWidthDots: 384,
      cashDrawerKick: false,
      rawbtWsUrl: ' ws://localhost:40213 ',
      rawbtFallbackToIntent: false,
      lanHost: ' 192.168.1.88 ',
      lanPort: 9101,
      lanTimeoutMs: 3000,
      leftMarginMm: 2,
      rightMarginMm: 2,
      feedLinesBeforeCut: 99,
    });
    const updated = useThermalPrinterConfigStore.getState().config;
    expect(updated.driver).toBe('LAN_ESCPOS');
    expect(updated.lanHost).toBe('192.168.1.88');
    expect(updated.lanPort).toBe(9101);

    // Unrelated storage key / empty newValue early returns
    syncPrinterConfigFromStorage(new StorageEvent('storage', { key: 'other-key', newValue: '1' }));
    syncPrinterConfigFromStorage(new StorageEvent('storage', { key: THERMAL_PRINTER_CONFIG_STORAGE_KEY, newValue: null }));
    localStorage.removeItem(THERMAL_PRINTER_CONFIG_STORAGE_KEY);
    syncPrinterConfigFromStorage(new StorageEvent('storage', { key: THERMAL_PRINTER_CONFIG_STORAGE_KEY, newValue: 'x' }));
  });
});
