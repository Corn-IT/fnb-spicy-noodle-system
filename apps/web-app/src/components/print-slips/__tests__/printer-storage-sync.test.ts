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
});
