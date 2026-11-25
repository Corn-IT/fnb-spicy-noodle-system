import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { setQrVoiceAlertEnabled } from '@/lib/voice-alert-preference';

export const UI_PREFERENCES_STORAGE_KEY = 'fnb-ui-preferences' as const;

export type ThemeMode = 'light' | 'dark';

/** Per-account display scale override. Missing values fall back to the store-level setting. */
export interface UserDisplayScaleOverride {
  globalPercent?: number;
  perPath: Record<string, number>;
}

const EMPTY_DISPLAY_SCALE_OVERRIDE: UserDisplayScaleOverride = { perPath: {} };

/** Shape of `uiPreferences` in login and refresh responses. Every key may be absent. */
export type ServerUiPreferences = {
    theme?: 'light' | 'dark' | 'system';
    sidebarWidth?: number;
    columnWidths?: Record<string, number>;
    displayScale?: { globalPercent?: number; perPath?: Record<string, number> };
    navOrder?: string[];
    navGroupOrder?: string[];
    sidebarCollapsed?: boolean;
    voiceAlertEnabled?: boolean;
  };

export interface UiPreferencesState {
  theme: ThemeMode;
  hasExplicitTheme: boolean;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  columnWidths: Record<string, Record<string, number>>;
  userDisplayScale: UserDisplayScaleOverride;
  userNavOrder: string[];
  userNavGroupOrder: string[];
  userVoiceAlertEnabled: boolean | undefined;
  /** True while local changes have not reached the server yet; incoming server values must not overwrite them. */
  accountSyncPending: boolean;
  setAccountSyncPending: (pending: boolean) => void;
  setUserVoiceAlertEnabled: (enabled: boolean) => void;
  setUserDisplayScale: (scale: UserDisplayScaleOverride) => void;
  setUserNavOrder: (order: string[]) => void;
  setUserNavGroupOrder: (order: string[]) => void;
  setTheme: (theme: ThemeMode) => void;
  resetThemeToStoreDefault: () => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTableColumnWidths: (tableId: string, widths: Record<string, number>) => void;
  hydrateFromServer: (prefs: ServerUiPreferences, options?: { force?: boolean }) => void;
}

export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 360;

export function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

export function flattenColumnWidths(
  nested: Record<string, Record<string, number>>,
): Record<string, number> {
  const flat: Record<string, number> = {};
  for (const [tableId, cols] of Object.entries(nested)) {
    for (const [colId, width] of Object.entries(cols)) {
      if (Number.isFinite(width) && width > 0) {
        flat[`${tableId}.${colId}`] = Math.round(width);
      }
    }
  }
  return flat;
}

export function unflattenColumnWidths(
  flat: Record<string, number>,
): Record<string, Record<string, number>> {
  const nested: Record<string, Record<string, number>> = {};
  for (const [key, width] of Object.entries(flat)) {
    const dotIndex = key.indexOf('.');
    if (dotIndex > 0) {
      const tableId = key.slice(0, dotIndex);
      const colId = key.slice(dotIndex + 1);
      nested[tableId] ??= {};
      nested[tableId][colId] = width;
    } else {
      nested.default ??= {};
      nested.default[key] = width;
    }
  }
  return nested;
}

export const useUiPreferencesStore = create<UiPreferencesState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      hasExplicitTheme: false,
      sidebarWidth: 260,
      sidebarCollapsed: false,
      columnWidths: {},
      userDisplayScale: EMPTY_DISPLAY_SCALE_OVERRIDE,
      userNavOrder: [],
      userNavGroupOrder: [],
      userVoiceAlertEnabled: undefined,
      accountSyncPending: false,
      setAccountSyncPending: (pending) => set({ accountSyncPending: pending }),
      setUserVoiceAlertEnabled: (enabled) => set({ userVoiceAlertEnabled: enabled }),
      setUserDisplayScale: (scale) => set({ userDisplayScale: scale }),
      setUserNavOrder: (order) => set({ userNavOrder: order }),
      setUserNavGroupOrder: (order) => set({ userNavGroupOrder: order }),
      setTheme: (theme) => set({ theme, hasExplicitTheme: true }),
      resetThemeToStoreDefault: () => set({ hasExplicitTheme: false }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark', hasExplicitTheme: true }),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarWidth(width) }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setTableColumnWidths: (tableId, widths) =>
        set((state) => ({
          columnWidths: {
            ...state.columnWidths,
            [tableId]: {
              ...(state.columnWidths[tableId] ?? {}),
              ...widths,
            },
          },
        })),
      hydrateFromServer: (prefs, options) => {
        // A refresh or login response must not wipe a change the user just made locally.
        if (!options?.force && get().accountSyncPending) return;
        // The voice switch is read from device storage at alert time. An account without a choice
        // gets the default (on) so another account's choice never carries over.
        setQrVoiceAlertEnabled(prefs.voiceAlertEnabled ?? true);
        set((state) => ({
          theme:
            prefs.theme === 'dark' || prefs.theme === 'light'
              ? prefs.theme
              : state.theme,
          // 'system' means the account never picked a theme: drop the previous account's explicit choice
          // so the store default applies.
          hasExplicitTheme:
            prefs.theme === 'dark' || prefs.theme === 'light'
              ? true
              : prefs.theme === 'system'
                ? false
                : state.hasExplicitTheme,
          sidebarWidth:
            typeof prefs.sidebarWidth === 'number'
              ? clampSidebarWidth(prefs.sidebarWidth)
              : state.sidebarWidth,
          columnWidths: prefs.columnWidths
            ? {
                ...state.columnWidths,
                ...unflattenColumnWidths(prefs.columnWidths),
              }
            : state.columnWidths,
          // Server wins on login: per-account values missing on the server are reset so
          // another account's local overrides never leak into this session.
          userDisplayScale: {
            ...(typeof prefs.displayScale?.globalPercent === 'number'
              ? { globalPercent: prefs.displayScale.globalPercent }
              : {}),
            perPath: { ...(prefs.displayScale?.perPath ?? {}) },
          },
          userNavOrder: [...(prefs.navOrder ?? [])],
          userNavGroupOrder: [...(prefs.navGroupOrder ?? [])],
          sidebarCollapsed: prefs.sidebarCollapsed ?? false,
          userVoiceAlertEnabled: prefs.voiceAlertEnabled,
        }));
      },
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        hasExplicitTheme: state.hasExplicitTheme,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        columnWidths: state.columnWidths,
        userDisplayScale: state.userDisplayScale,
        userNavOrder: state.userNavOrder,
        userNavGroupOrder: state.userNavGroupOrder,
        userVoiceAlertEnabled: state.userVoiceAlertEnabled,
      }),
    },
  ),
);
