import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveDisplayScalePercent, useDisplayScale } from '../use-display-scale';

const mockUseStoreSettings = vi.fn();

vi.mock('@/hooks/use-store-settings', () => ({
  useStoreSettings: () => mockUseStoreSettings(),
}));

describe('useDisplayScale & resolveDisplayScalePercent', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--page-zoom');
    vi.clearAllMocks();
  });

  it('uses per-path override when configured and falls back to globalPercent otherwise', () => {
    const scale = {
      globalPercent: 115,
      perPath: { '/pos': 135 },
      qrOrderPercent: 95,
    };

    expect(resolveDisplayScalePercent('/pos', scale)).toBe(135);
    expect(resolveDisplayScalePercent('/pos/orders/1', scale)).toBe(135);
    expect(resolveDisplayScalePercent('/menu', scale)).toBe(115);
    expect(resolveDisplayScalePercent('/dashboard', scale)).toBe(115);
  });

  it('uses store scale for touch POS and the corresponding touch settings route', () => {
    const scale = { globalPercent: 120, perPath: { '/pos': 150 }, qrOrderPercent: 100 };
    expect(resolveDisplayScalePercent('/pos', scale)).toBe(150);
    expect(resolveDisplayScalePercent('/pos/touch', scale)).toBe(150);
    expect(resolveDisplayScalePercent('/pos/touch/settings', { ...scale, perPath: { '/settings': 125 } })).toBe(125);
  });

  it('isolates guest QR order routes so they never inherit globalPercent', () => {
    const scale = {
      globalPercent: 140,
      perPath: { '/pos': 150 },
      qrOrderPercent: 100,
    };

    expect(resolveDisplayScalePercent('/q/tbl-01', scale)).toBe(100);
    expect(resolveDisplayScalePercent('/qr/takeaway-1', scale)).toBe(100);
    expect(resolveDisplayScalePercent('/q/tbl-01', { ...scale, qrOrderPercent: 120 })).toBe(120);
  });

  it('sets --page-zoom CSS variable on documentElement and resets on unmount', () => {
    mockUseStoreSettings.mockReturnValue({
      settings: {
        displayScale: {
          globalPercent: 110,
          perPath: { '/pos': 125 },
          qrOrderPercent: 100,
        },
      },
    });

    const { rerender, unmount } = renderHook(({ path }) => useDisplayScale(path), {
      initialProps: { path: '/pos' },
    });

    expect(document.documentElement.style.getPropertyValue('--page-zoom')).toBe('1.25');

    rerender({ path: '/invoices' });
    expect(document.documentElement.style.getPropertyValue('--page-zoom')).toBe('1.1');

    rerender({ path: '/q/abc' });
    expect(document.documentElement.style.getPropertyValue('--page-zoom')).toBe('1');

    unmount();
    expect(document.documentElement.style.getPropertyValue('--page-zoom')).toBe('1');
  });
});
