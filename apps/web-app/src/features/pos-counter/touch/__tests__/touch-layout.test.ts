import { beforeEach, describe, expect, it } from 'vitest';

import {
  autoColumns,
  readTouchLayout,
  resolveColumns,
  TOUCH_LAYOUT_STORAGE_KEY,
  writeTouchLayout,
} from '../touch-layout';

describe('touch layout columns', () => {
  beforeEach(() => localStorage.clear());

  it('"Tự động" for tables follows the screen width: 4 → 5 → 6 → 7 per row', () => {
    expect(autoColumns('tables', 928)).toBe(4); // màn 960px
    expect(autoColumns('tables', 992)).toBe(5); // màn 1024px
    expect(autoColumns('tables', 1248)).toBe(6); // màn 1280px
    expect(autoColumns('tables', 1888)).toBe(7); // màn 1920px
  });

  it('"Tự động" for the menu shows 4 dishes per row, 3 only on a narrow menu column', () => {
    expect(autoColumns('menu', 648)).toBe(4);
    expect(autoColumns('menu', 1288)).toBe(4);
    expect(autoColumns('menu', 440)).toBe(3);
  });

  it('honours a fixed choice and reduces it only when tiles would get too narrow', () => {
    expect(resolveColumns('tables', 3, 1888)).toEqual({ columns: 3, clamped: false });
    expect(resolveColumns('menu', 5, 648)).toEqual({ columns: 4, clamped: true }); // 5 ô < 130px
    expect(resolveColumns('menu', 5, 1288)).toEqual({ columns: 5, clamped: false });
  });

  it('defaults to auto and ignores corrupted or out-of-range stored values', () => {
    expect(readTouchLayout()).toEqual({ tableColumns: 'auto', menuColumns: 'auto' });
    localStorage.setItem(TOUCH_LAYOUT_STORAGE_KEY, JSON.stringify({ tableColumns: 9, menuColumns: 'x' }));
    expect(readTouchLayout()).toEqual({ tableColumns: 'auto', menuColumns: 'auto' });
    localStorage.setItem(TOUCH_LAYOUT_STORAGE_KEY, '{broken');
    expect(readTouchLayout()).toEqual({ tableColumns: 'auto', menuColumns: 'auto' });

    writeTouchLayout({ tableColumns: 5, menuColumns: 3 });
    expect(readTouchLayout()).toEqual({ tableColumns: 5, menuColumns: 3 });
  });
});
