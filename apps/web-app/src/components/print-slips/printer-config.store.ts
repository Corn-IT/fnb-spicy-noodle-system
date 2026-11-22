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
    },
  ),
);
