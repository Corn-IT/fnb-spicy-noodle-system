import { PRINT_TEMPLATE_DEFAULTS, type ThermalFontSize } from '@fnb/shared';

export interface ThermalFontScaleClasses {
  body: string;
  item: string;
  heading: string;
  sub: string;
}

export const THERMAL_FONT_CLASSES: Record<ThermalFontSize, ThermalFontScaleClasses> = {
  sm: {
    body: 'text-[11px]',
    item: 'text-xs',
    heading: 'text-sm',
    sub: 'text-[10px]',
  },
  md: {
    body: 'text-xs',
    item: 'text-sm',
    heading: 'text-base',
    sub: 'text-[11px]',
  },
  lg: {
    body: 'text-sm',
    item: 'text-base',
    heading: 'text-lg',
    sub: 'text-xs',
  },
};

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
