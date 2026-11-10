import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const UI_PREFERENCES_STORAGE_KEY = 'fnb-ui-preferences' as const;

export type ThemeMode = 'light' | 'dark';

export interface UiPreferencesState {
  theme: ThemeMode;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  columnWidths: Record<string, Record<string, number>>;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTableColumnWidths: (tableId: string, widths: Record<string, number>) => void;
  hydrateFromServer: (prefs: {
    theme?: 'light' | 'dark' | 'system';
    sidebarWidth?: number;
    columnWidths?: Record<string, number>;
  }) => void;
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
      sidebarWidth: 260,
      sidebarCollapsed: false,
      columnWidths: {},
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
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
      hydrateFromServer: (prefs) =>
        set((state) => ({
          theme:
            prefs.theme === 'dark' || prefs.theme === 'light'
              ? prefs.theme
              : state.theme,
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
        })),
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        columnWidths: state.columnWidths,
      }),
    },
  ),
);
