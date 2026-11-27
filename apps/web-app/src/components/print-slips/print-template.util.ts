import './thermal-fonts.css';
import {
  DEFAULT_THERMAL_FONT_SIZE_PT,
  resolveThermalFontFamily,
  type ThermalFontFamily,
  PRINT_TEMPLATE_DEFAULTS,
  THERMAL_FONT_SIZE_PT_MAX,
  THERMAL_FONT_SIZE_PT_MIN,
  formatProductNameWithSize,
} from '@fnb/shared';
import type * as React from 'react';

export function resolveThermalFontSizePt(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const clamped = Math.max(THERMAL_FONT_SIZE_PT_MIN, Math.min(THERMAL_FONT_SIZE_PT_MAX, raw));
    return Math.round(clamped * 2) / 2;
  }
  return DEFAULT_THERMAL_FONT_SIZE_PT;
}

export function getThermalSlipRootStyle(fontSizePt: number, fontFamily: ThermalFontFamily): React.CSSProperties {
  return {
    fontSize: `${resolveThermalFontSizePt(fontSizePt)}pt`,
    fontFamily: resolveThermalFontFamily(fontFamily),
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

export interface ReceiptPrintableItemInput {
  name: string;
  quantity: number;
  unitPrice?: number;
  lineTotal: number;
  modifiers?: readonly string[];
  pricedModifiers?: readonly string[] | null;
  isTakeaway?: boolean;
}

export interface ConsolidatedReceiptPrintItem {
  key: string;
  displayName: string;
  isTakeaway: boolean;
  pricedModifiers: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Consolidates receipt rows for Provisional Bills and Official Receipts:
 * - Merges rows that share the same displayed product name (including Size M/L),
 *   same takeaway flag, same unit price, and same sorted priced-modifier set
 *   (so 0đ variations like spice levels, "Không hành", or 0đ substitutions collapse into one row).
 * - Keeps rows separate whenever unit price, priced toppings, Size, or [Mang về] differ.
 */
export function consolidateReceiptPrintItems(
  items: readonly ReceiptPrintableItemInput[],
  options: { hideTakeawayBadge?: boolean } = {},
): ConsolidatedReceiptPrintItem[] {
  const { hideTakeawayBadge = false } = options;
  const grouped = new Map<string, ConsolidatedReceiptPrintItem>();

  for (const item of items) {
    const { displayName, remainingModifiers, remainingPricedModifiers } =
      formatProductNameWithSize(item.name, item.modifiers ?? [], item.pricedModifiers);
    const pricedModifiers = resolvePricedModifiers(remainingModifiers, remainingPricedModifiers);
    const effectiveIsTakeaway = !hideTakeawayBadge && Boolean(item.isTakeaway);

    const resolvedUnitPrice =
      typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice)
        ? item.unitPrice
        : item.quantity > 0
          ? item.lineTotal / item.quantity
          : item.lineTotal;
    const unitPriceCents = Math.round(resolvedUnitPrice * 100);
    const pricedModsKey = [...pricedModifiers]
      .map((mod) => mod.trim().toLowerCase())
      .sort()
      .join('||');

    const key = [
      displayName.trim().toLowerCase(),
      effectiveIsTakeaway ? 'TA' : 'DI',
      String(unitPriceCents),
      pricedModsKey,
    ].join('::');

    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.lineTotal = Math.round((existing.lineTotal + item.lineTotal) * 100) / 100;
    } else {
      grouped.set(key, {
        key,
        displayName,
        isTakeaway: effectiveIsTakeaway,
        pricedModifiers,
        quantity: item.quantity,
        unitPrice: Math.round(resolvedUnitPrice * 100) / 100,
        lineTotal: Math.round(item.lineTotal * 100) / 100,
      });
    }
  }

  return Array.from(grouped.values());
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
