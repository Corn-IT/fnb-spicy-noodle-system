import * as React from 'react';

/**
 * Bố cục số cột của màn POS cảm ứng, lưu theo THIẾT BỊ (không theo tài khoản) vì phụ thuộc kích
 * thước màn hình của từng máy. "auto" = tự chọn theo bề ngang thực tế của vùng hiển thị.
 */
export const TOUCH_LAYOUT_STORAGE_KEY = 'fnb-pos-touch-layout';

export type ColumnChoice = 'auto' | number;

export interface TouchLayoutPrefs {
  tableColumns: ColumnChoice;
  menuColumns: ColumnChoice;
}

export const TABLE_COLUMN_OPTIONS = [3, 4, 5, 6, 7] as const;
export const MENU_COLUMN_OPTIONS = [3, 4, 5] as const;

export const DEFAULT_TOUCH_LAYOUT: TouchLayoutPrefs = { tableColumns: 'auto', menuColumns: 'auto' };

const LAYOUT_EVENT = 'fnb:pos-touch-layout-changed';

const sanitizeChoice = (value: unknown, allowed: readonly number[]): ColumnChoice =>
  typeof value === 'number' && allowed.includes(value) ? value : 'auto';

export function readTouchLayout(): TouchLayoutPrefs {
  try {
    const raw = localStorage.getItem(TOUCH_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_TOUCH_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<Record<keyof TouchLayoutPrefs, unknown>>;
    return {
      tableColumns: sanitizeChoice(parsed.tableColumns, TABLE_COLUMN_OPTIONS),
      menuColumns: sanitizeChoice(parsed.menuColumns, MENU_COLUMN_OPTIONS),
    };
  } catch {
    return DEFAULT_TOUCH_LAYOUT;
  }
}

export function writeTouchLayout(next: TouchLayoutPrefs): void {
  try {
    localStorage.setItem(TOUCH_LAYOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Trình duyệt chặn localStorage: chỉ áp dụng trong phiên hiện tại.
  }
  window.dispatchEvent(new Event(LAYOUT_EVENT));
}

export function useTouchLayoutPrefs(): [TouchLayoutPrefs, (patch: Partial<TouchLayoutPrefs>) => void] {
  const [prefs, setPrefs] = React.useState<TouchLayoutPrefs>(readTouchLayout);
  React.useEffect(() => {
    const sync = () => setPrefs(readTouchLayout());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOUCH_LAYOUT_STORAGE_KEY) sync();
    };
    window.addEventListener(LAYOUT_EVENT, sync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(LAYOUT_EVENT, sync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);
  const update = React.useCallback((patch: Partial<TouchLayoutPrefs>) => {
    const next = { ...readTouchLayout(), ...patch };
    writeTouchLayout(next);
    setPrefs(next);
  }, []);
  return [prefs, update];
}

export type GridKind = 'tables' | 'menu';

/** Thẻ hẹp hơn mức này thì khó chạm / chữ bị cắt: tự giảm số cột. */
const MIN_TILE_PX: Record<GridKind, number> = { tables: 150, menu: 130 };
const GAP_PX: Record<GridKind, number> = { tables: 12, menu: 10 };
/** Dùng khi chưa đo được bề rộng (lần render đầu / môi trường test). */
const FALLBACK_AUTO: Record<GridKind, number> = { tables: 6, menu: 4 };

/** "Tự động" theo bề rộng vùng lưới (px). */
export function autoColumns(kind: GridKind, width: number): number {
  if (kind === 'menu') return width < 540 ? 3 : 4;
  if (width < 600) return 3;
  if (width < 992) return 4;
  if (width < 1248) return 5;
  if (width < 1504) return 6;
  return 7;
}

export interface ResolvedColumns {
  columns: number;
  /** Số cột người dùng chọn bị giảm vì màn quá hẹp. */
  clamped: boolean;
}

export function resolveColumns(kind: GridKind, choice: ColumnChoice, width: number): ResolvedColumns {
  if (width <= 0) {
    return { columns: choice === 'auto' ? FALLBACK_AUTO[kind] : choice, clamped: false };
  }
  const wanted = choice === 'auto' ? autoColumns(kind, width) : choice;
  const maxFit = Math.max(2, Math.floor((width + GAP_PX[kind]) / (MIN_TILE_PX[kind] + GAP_PX[kind])));
  const columns = Math.min(wanted, maxFit);
  return { columns, clamped: choice !== 'auto' && columns < wanted };
}

/** Đo bề rộng thực tế của lưới và trả số cột cần dùng. */
export function useGridColumns(kind: GridKind, choice: ColumnChoice) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const resolved = resolveColumns(kind, choice, width);
  const style = React.useMemo<React.CSSProperties>(
    () => ({ gridTemplateColumns: `repeat(${resolved.columns}, minmax(0, 1fr))` }),
    [resolved.columns],
  );
  return { ref, style, ...resolved };
}
