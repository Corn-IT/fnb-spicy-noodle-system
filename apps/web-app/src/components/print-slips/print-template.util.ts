import {
  DEFAULT_THERMAL_FONT_SIZE_PT,
  PRINT_TEMPLATE_DEFAULTS,
  THERMAL_FONT_SIZE_PT_MAX,
  THERMAL_FONT_SIZE_PT_MIN,
} from '@fnb/shared';
import type * as React from 'react';

export function resolveThermalFontSizePt(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const clamped = Math.max(THERMAL_FONT_SIZE_PT_MIN, Math.min(THERMAL_FONT_SIZE_PT_MAX, raw));
    return Math.round(clamped * 2) / 2;
  }
  return DEFAULT_THERMAL_FONT_SIZE_PT;
}

export function getThermalSlipRootStyle(fontSizePt: number): React.CSSProperties {
  return {
    fontSize: `${resolveThermalFontSizePt(fontSizePt)}pt`,
    lineHeight: 1.25,
    breakAfter: 'page',
    pageBreakAfter: 'always',
  };
}

/**
 * Resolves customer-visible priced modifiers for provisional & official receipts.
 * Prefers server-provided `pricedModifiers` (filtered by extraPrice > 0).
 * Falls back to keeping modifiers with explicit price tags like "(5k)" / "(20.000đ)" when `pricedModifiers` is absent.
 */
export function resolvePricedModifiers(
  modifiers: readonly string[],
  pricedModifiers?: readonly string[] | null,
): string[] {
  if (Array.isArray(pricedModifiers)) {
    return pricedModifiers.filter((m) => m.trim().length > 0);
  }
  return modifiers.filter((m) => {
    const trimmed = m.trim();
    if (!trimmed) return false;
    return /\(\s*\+?\s*[1-9][\d.,]*\s*(k|đ|d|vnd)\s*\)/i.test(trimmed);
  });
}

export function formatTransferFooterNote(
  template: string | undefined | null,
  fromTableUpper: string,
  toTableUpper: string,
): string {
  const source = template?.trim() || PRINT_TEMPLATE_DEFAULTS.tableTransfer.footerNote;
  return source
    .split('{fromTable}')
    .join(fromTableUpper)
    .split('{toTable}')
    .join(toTableUpper);
}
