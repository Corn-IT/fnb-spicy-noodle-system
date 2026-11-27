import {
  ALLOWED_STORE_NAV_PATHS,
  DEFAULT_DISPLAY_SCALE_PERCENT,
  DISPLAY_SCALE_MAX_PERCENT,
  DISPLAY_SCALE_MIN_PERCENT,
  type DisplayScale,
} from '@fnb/shared';
import * as React from 'react';

import { useStoreSettings } from '@/hooks/use-store-settings';

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

  const staffPath = pathname.startsWith('/pos/touch/')
    ? pathname.replace('/pos/touch', '')
    : pathname === '/pos/touch' ? '/pos' : pathname;
  const matchedPath = ALLOWED_STORE_NAV_PATHS.find(
    (navPath) => staffPath === navPath || staffPath.startsWith(`${navPath}/`),
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
 * Applies `--page-zoom` CSS variable on `<html>` for the current route so content and portaled
 * dialogs/popovers scale together while sidebar & topbar remain at 100%.
 */
export function useDisplayScale(pathname: string): number {
  const { settings } = useStoreSettings();
  const percent = resolveDisplayScalePercent(pathname, settings.displayScale);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const zoomValue = String(percent / 100);
    document.documentElement.style.setProperty('--page-zoom', zoomValue);
    if (percent !== DEFAULT_DISPLAY_SCALE_PERCENT) {
      document.documentElement.setAttribute('data-page-zoomed', 'true');
    } else {
      document.documentElement.removeAttribute('data-page-zoomed');
    }
    return () => {
      document.documentElement.style.setProperty('--page-zoom', '1');
      document.documentElement.removeAttribute('data-page-zoomed');
    };
  }, [percent]);

  return percent;
}
