import {
  ALLOWED_STORE_NAV_PATHS,
  DEFAULT_DISPLAY_SCALE_PERCENT,
  DISPLAY_SCALE_MAX_PERCENT,
  DISPLAY_SCALE_MIN_PERCENT,
  type DisplayScale,
} from '@fnb/shared';
import * as React from 'react';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

export function isGuestQrPath(pathname: string): boolean {
  return (
    pathname === '/q' ||
    pathname.startsWith('/q/') ||
    pathname === '/qr' ||
    pathname.startsWith('/qr/')
  );
}

function clampScalePercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DISPLAY_SCALE_PERCENT;
  }
  return Math.max(DISPLAY_SCALE_MIN_PERCENT, Math.min(DISPLAY_SCALE_MAX_PERCENT, Math.round(value)));
}

/**
 * Resolves the effective display zoom percent (80..150) for a given route pathname.
 * - Guest QR routes (/q/*, /qr/*) use `qrOrderPercent` exclusively (never inherit `globalPercent`).
 * - Internal app routes use `perPath[matchedPath]` if set, otherwise fall back to `globalPercent`.
 */
export function resolveDisplayScalePercent(
  pathname: string,
  displayScale?: Partial<DisplayScale> | null,
): number {
  if (!displayScale) return DEFAULT_DISPLAY_SCALE_PERCENT;

  if (isGuestQrPath(pathname)) {
    return clampScalePercent(displayScale.qrOrderPercent);
  }

  const matchedPath = ALLOWED_STORE_NAV_PATHS.find(
    (navPath) => pathname === navPath || pathname.startsWith(`${navPath}/`),
  );

  if (matchedPath && displayScale.perPath && matchedPath in displayScale.perPath) {
    const override = displayScale.perPath[matchedPath];
    if (typeof override === 'number' && Number.isFinite(override)) {
      return clampScalePercent(override);
    }
  }

  return clampScalePercent(displayScale.globalPercent);
}

/**
 * Below this viewport width the staff app is never zoomed in: drawers and menus would overflow the
 * screen. The guest QR page is exempt because it has no drawer and the store sets its scale on purpose.
 */
export const DISPLAY_SCALE_MIN_VIEWPORT_PX = 640;

/** Caps zoom-in at 100% on phone-sized viewports; zoom-out is always allowed. */
export function capPercentForViewport(
  percent: number,
  viewportWidth: number,
  pathname = '',
): number {
  return viewportWidth < DISPLAY_SCALE_MIN_VIEWPORT_PX && !isGuestQrPath(pathname)
    ? Math.min(percent, DEFAULT_DISPLAY_SCALE_PERCENT)
    : percent;
}

function useViewportWidth(): number {
  const [width, setWidth] = React.useState<number>(() =>
    typeof window === 'undefined' ? DISPLAY_SCALE_MIN_VIEWPORT_PX : window.innerWidth,
  );
  React.useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

/**
 * Layers the account-level override on top of the store display scale.
 * `qrOrderPercent` is guest-facing and is never overridden per account.
 */
export function mergeUserDisplayScale(
  storeScale: DisplayScale,
  userScale?: { globalPercent?: number; perPath?: Record<string, number> } | null,
): DisplayScale {
  if (!userScale) return storeScale;
  return {
    ...storeScale,
    globalPercent: userScale.globalPercent ?? storeScale.globalPercent,
    perPath: { ...storeScale.perPath, ...(userScale.perPath ?? {}) },
  };
}

/**
 * Applies `--page-zoom` CSS variable on `<html>` for the current route so content and portaled
 * dialogs/popovers scale together while sidebar & topbar remain at 100%.
 */
export function useDisplayScale(pathname: string): number {
  const { settings } = useStoreSettings();
  const userDisplayScale = useUiPreferencesStore((state) => state.userDisplayScale);
  const effectiveScale = React.useMemo(
    () => mergeUserDisplayScale(settings.displayScale, userDisplayScale),
    [settings.displayScale, userDisplayScale],
  );
  const viewportWidth = useViewportWidth();
  const percent = capPercentForViewport(
    resolveDisplayScalePercent(pathname, effectiveScale),
    viewportWidth,
    pathname,
  );

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const zoomValue = String(percent / 100);
    document.documentElement.style.setProperty('--page-zoom', zoomValue);
    return () => {
      document.documentElement.style.setProperty('--page-zoom', '1');
    };
  }, [percent]);

  return percent;
}
