import {
  DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
  ThermalPrinterDeviceConfigSchema,
  type ThermalPrinterDeviceConfig,
  type ThermalPrinterDriver,
} from '@fnb/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const THERMAL_PRINTER_CONFIG_STORAGE_KEY = 'fnb-thermal-printer-device-config' as const;

export interface ThermalPrinterConfigState {
  config: ThermalPrinterDeviceConfig;
  setDriver: (driver: ThermalPrinterDriver) => void;
  updateConfig: (partial: Partial<ThermalPrinterDeviceConfig>) => void;
  resetConfig: () => void;
}

function sanitizePrinterConfig(
  current: ThermalPrinterDeviceConfig,
  partial: Partial<ThermalPrinterDeviceConfig>,
): ThermalPrinterDeviceConfig {
  const merged = {
    ...current,
    ...partial,
  };
  const parsed = ThermalPrinterDeviceConfigSchema.safeParse(merged);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    ...current,
    driver: ThermalPrinterDeviceConfigSchema.shape.driver.safeParse(merged.driver).success
      ? merged.driver
      : current.driver,
    paperWidthDots:
      merged.paperWidthDots === 384 || merged.paperWidthDots === 576
        ? merged.paperWidthDots
        : current.paperWidthDots,
    cashDrawerKick:
      typeof merged.cashDrawerKick === 'boolean'
        ? merged.cashDrawerKick
        : current.cashDrawerKick,
    rawbtWsUrl:
      typeof merged.rawbtWsUrl === 'string' && merged.rawbtWsUrl.trim().length > 0
        ? merged.rawbtWsUrl.trim()
        : current.rawbtWsUrl,
    rawbtFallbackToIntent:
      typeof merged.rawbtFallbackToIntent === 'boolean'
        ? merged.rawbtFallbackToIntent
        : current.rawbtFallbackToIntent,
    lanHost:
      typeof merged.lanHost === 'string' && merged.lanHost.trim().length > 0
        ? merged.lanHost.trim()
        : current.lanHost,
    lanPort:
      typeof merged.lanPort === 'number' &&
      Number.isInteger(merged.lanPort) &&
      merged.lanPort >= 1 &&
      merged.lanPort <= 65535
        ? merged.lanPort
        : current.lanPort,
    lanTimeoutMs:
      typeof merged.lanTimeoutMs === 'number' &&
      Number.isInteger(merged.lanTimeoutMs) &&
      merged.lanTimeoutMs >= 500 &&
      merged.lanTimeoutMs <= 15000
        ? merged.lanTimeoutMs
        : current.lanTimeoutMs,
    leftMarginMm:
      typeof merged.leftMarginMm === 'number' &&
      Number.isFinite(merged.leftMarginMm) &&
      merged.leftMarginMm >= 0 &&
      merged.leftMarginMm <= 8
        ? merged.leftMarginMm
        : current.leftMarginMm,
    rightMarginMm:
      typeof merged.rightMarginMm === 'number' &&
      Number.isFinite(merged.rightMarginMm) &&
      merged.rightMarginMm >= 0 &&
      merged.rightMarginMm <= 8
        ? merged.rightMarginMm
        : current.rightMarginMm,
    feedLinesBeforeCut:
      typeof merged.feedLinesBeforeCut === 'number' &&
      Number.isInteger(merged.feedLinesBeforeCut) &&
      merged.feedLinesBeforeCut >= 0 &&
      merged.feedLinesBeforeCut <= 5
        ? merged.feedLinesBeforeCut
        : current.feedLinesBeforeCut,
  };
}

export const useThermalPrinterConfigStore = create<ThermalPrinterConfigState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG },
      setDriver: (driver) =>
        set((state) => ({
          config: sanitizePrinterConfig(state.config, { driver }),
        })),
      updateConfig: (partial) =>
        set((state) => ({
          config: sanitizePrinterConfig(state.config, partial),
        })),
      resetConfig: () =>
        set({
          config: { ...DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG },
        }),
    }),
    {
      name: THERMAL_PRINTER_CONFIG_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        config: state.config,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ThermalPrinterConfigState> | undefined;
        const parsed = ThermalPrinterDeviceConfigSchema.safeParse(persisted?.config);
        return { ...currentState, config: parsed.success ? parsed.data : currentState.config };
      },
    },
  ),
);

// Browser storage events only arrive in other tabs; do not persist again and create an echo loop.
export function syncPrinterConfigFromStorage(event: StorageEvent): void {
  if (event.key !== THERMAL_PRINTER_CONFIG_STORAGE_KEY || !event.newValue) return;
  try {
    const raw = localStorage.getItem(THERMAL_PRINTER_CONFIG_STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as { state?: { config?: unknown } };
    const parsed = ThermalPrinterDeviceConfigSchema.safeParse(stored.state?.config);
    if (!parsed.success) return;
    void useThermalPrinterConfigStore.persist.rehydrate();
  } catch {
    // Ignore malformed or inaccessible browser storage.
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', syncPrinterConfigFromStorage);
}
