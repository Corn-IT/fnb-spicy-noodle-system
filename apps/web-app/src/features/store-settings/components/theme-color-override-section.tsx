import type { ColorOverride, StoreSettings } from '@fnb/shared';
import { AlertTriangle, CheckCircle2, Palette, RotateCcw, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';
import {
  buildStoreThemeVariables,
  computeColorContrastOnCard,
  computeHslContrastRatio,
  type StoreThemeVariables,
} from '@/utils/store-theme';

export interface ColorOverridePreset {
  name: string;
  light: string;
  dark: string | null;
}

interface ThemeColorOverrideSectionProps {
  idPrefix: 'primary-text' | 'accent-text' | 'price';
  title: string;
  description: string;
  value: ColorOverride;
  brandColor: string;
  resolvedVars: StoreThemeVariables;
  presets: readonly ColorOverridePreset[];
  disabled?: boolean;
  onChange: (next: ColorOverride) => void;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function hslVarToHex(hslVar: string): string {
  const parts = hslVar.trim().split(/\s+/);
  if (parts.length < 3) return '#E11D48';
  const h = Number.parseFloat(parts[0] ?? '0') / 360;
  const s = Number.parseFloat((parts[1] ?? '0').replace('%', '')) / 100;
  const l = Number.parseFloat((parts[2] ?? '0').replace('%', '')) / 100;
  if ([h, s, l].some((n) => Number.isNaN(n))) return '#E11D48';

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = l;
    g = l;
    b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function ThemeColorOverrideSection({
  idPrefix,
  title,
  description,
  value,
  brandColor,
  resolvedVars,
  presets,
  disabled = false,
  onChange,
}: ThemeColorOverrideSectionProps) {
  const isCustom = value.light !== null || value.dark !== null;
  const isOnPrimary = idPrefix === 'primary-text';
  const safeBrandFallback = HEX_COLOR_RE.test(brandColor.trim())
    ? brandColor.trim().toUpperCase()
    : '#E11D48';
  const lightFallbackHex = isOnPrimary ? '#FFFFFF' : safeBrandFallback;
  const lightHsl = isOnPrimary
    ? resolvedVars.light.primaryForeground
    : idPrefix === 'accent-text'
      ? resolvedVars.light.accentText
      : resolvedVars.light.price;
  const darkHsl = isOnPrimary
    ? resolvedVars.dark.primaryForeground
    : idPrefix === 'accent-text'
      ? resolvedVars.dark.accentText
      : resolvedVars.dark.price;
  const lightContrast = isOnPrimary
    ? computeHslContrastRatio(lightHsl, resolvedVars.light.primary)
    : computeColorContrastOnCard(lightHsl, 'light');
  const darkContrast = isOnPrimary
    ? computeHslContrastRatio(darkHsl, resolvedVars.dark.primary)
    : computeColorContrastOnCard(darkHsl, 'dark');
  const autoDarkHex = hslVarToHex(darkHsl);
  const darkAutoLabel = isOnPrimary
    ? value.light !== null
      ? 'Giống chế độ Sáng'
      : 'Tự động (Tương phản)'
    : 'Tự động (+4% sáng)';

  const handleEnableCustom = () => {
    if (isCustom) return;
    onChange({
      light: lightFallbackHex,
      dark: null,
    });
  };

  const lightPickerValue =
    value.light !== null && HEX_COLOR_RE.test(value.light.trim())
      ? value.light.trim()
      : lightFallbackHex;
  const darkPickerValue =
    value.dark !== null && HEX_COLOR_RE.test(value.dark.trim())
      ? value.dark.trim()
      : autoDarkHex;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Palette className="h-4 w-4 shrink-0 text-accent-text" />
            <span>{title}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="inline-flex w-fit shrink-0 rounded-lg border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            disabled={disabled}
            data-testid={`${idPrefix}-mode-brand`}
            onClick={() => onChange({ light: null, dark: null })}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors disabled:opacity-50',
              !isCustom
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {isOnPrimary ? 'Tự động (Tương phản)' : 'Theo màu chủ đạo'}
          </button>
          <button
            type="button"
            disabled={disabled}
            data-testid={`${idPrefix}-mode-custom`}
            onClick={handleEnableCustom}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors disabled:opacity-50',
              isCustom
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tuỳ chỉnh
          </button>
        </div>
      </div>

      {isCustom ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${idPrefix}-light-hex`} className="block text-xs font-semibold">
                Chế độ Sáng (Light Mode)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label={`Chọn ${title} chế độ Sáng`}
                  disabled={disabled}
                  value={lightPickerValue}
                  onChange={(e) => onChange({ ...value, light: e.target.value.toUpperCase() })}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-0.5 disabled:cursor-not-allowed"
                />
                <Input
                  id={`${idPrefix}-light-hex`}
                  data-testid={`input-${idPrefix}-light-hex`}
                  disabled={disabled}
                  value={value.light ?? ''}
                  onChange={(e) => onChange({ ...value, light: e.target.value })}
                  placeholder={lightFallbackHex}
                  className="h-9 w-32 font-mono text-xs uppercase"
                />
                <span
                  data-testid={`${idPrefix}-light-contrast`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium',
                    lightContrast >= 4.5
                      ? 'bg-background text-emerald-700 dark:text-emerald-400'
                      : 'border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
                  )}
                >
                  {lightContrast >= 4.5 ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  Tương phản: {lightContrast}:1
                </span>
              </div>
              {lightContrast < 4.5 ? (
                <p
                  data-testid={`${idPrefix}-light-wcag-warning`}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400"
                >
                  {isOnPrimary
                    ? 'Cảnh báo: Tương phản dưới 4.5:1 trên nền Màu chủ đạo Sáng — chữ trên nút/menu có thể khó đọc.'
                    : 'Cảnh báo: Tương phản dưới 4.5:1 trên nền thẻ Sáng — chữ có thể khó đọc.'}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`${idPrefix}-dark-hex`} className="block text-xs font-semibold">
                  Chế độ Tối (Dark Mode)
                </label>
                {value.dark !== null ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    data-testid={`${idPrefix}-dark-auto-btn`}
                    onClick={() => onChange({ ...value, dark: null })}
                    className="h-6 gap-1 px-2 text-[11px]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {darkAutoLabel}
                  </Button>
                ) : (
                  <span
                    data-testid={`${idPrefix}-dark-auto-badge`}
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    {isOnPrimary ? `Đang dùng: ${darkAutoLabel}` : 'Đang tự động (+4% sáng)'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label={`Chọn ${title} chế độ Tối`}
                  disabled={disabled}
                  value={darkPickerValue}
                  onChange={(e) => onChange({ ...value, dark: e.target.value.toUpperCase() })}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-0.5 disabled:cursor-not-allowed"
                />
                <Input
                  id={`${idPrefix}-dark-hex`}
                  data-testid={`input-${idPrefix}-dark-hex`}
                  disabled={disabled}
                  value={value.dark ?? ''}
                  onChange={(e) => {
                    const nextDark = e.target.value;
                    onChange({
                      ...value,
                      dark: nextDark.length === 0 ? null : nextDark,
                    });
                  }}
                  placeholder={`Tự động (${autoDarkHex})`}
                  className="h-9 w-36 font-mono text-xs uppercase"
                />
                <span
                  data-testid={`${idPrefix}-dark-contrast`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium',
                    darkContrast >= 4.5
                      ? 'bg-background text-emerald-700 dark:text-emerald-400'
                      : 'border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
                  )}
                >
                  {darkContrast >= 4.5 ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  Tương phản: {darkContrast}:1
                </span>
              </div>
              {darkContrast < 4.5 ? (
                <p
                  data-testid={`${idPrefix}-dark-wcag-warning`}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400"
                >
                  {isOnPrimary
                    ? 'Cảnh báo: Tương phản dưới 4.5:1 trên nền Màu chủ đạo Tối — chữ trên nút/menu có thể khó đọc.'
                    : 'Cảnh báo: Tương phản dưới 4.5:1 trên nền thẻ Tối — nên tăng độ sáng màu Dark.'}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {presets.map((preset) => (
              <button
                key={`${idPrefix}-${preset.name}`}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ light: preset.light, dark: preset.dark })}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted/60 disabled:opacity-50"
              >
                <span
                  className="h-3 w-3 rounded-full border border-black/15"
                  style={{ backgroundColor: preset.light }}
                />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {isOnPrimary
              ? `Đang tự động chọn Trắng/Đen tối ưu độ tương phản trên nền ${safeBrandFallback}.`
              : `Đang kế thừa tự động từ Màu chủ đạo (${safeBrandFallback}).`}
          </span>
          <span data-testid={`${idPrefix}-light-contrast`} className="font-medium text-foreground">
            Light {lightContrast}:1
          </span>
          <span data-testid={`${idPrefix}-dark-contrast`} className="font-medium text-foreground">
            Dark {darkContrast}:1
          </span>
        </div>
      )}
    </div>
  );
}

interface ThemeDualPreviewCardProps {
  resolvedVars: StoreThemeVariables;
}

export function ThemeDualPreviewCard({ resolvedVars }: ThemeDualPreviewCardProps) {
  return (
    <div className="space-y-2 border-t pt-4" data-testid="theme-dual-preview">
      <span className="block text-sm font-semibold">Xem trước nhanh (Chế độ Sáng & Tối)</span>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div
          className="rounded-xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-xs"
          data-testid="theme-preview-light"
        >
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">LIGHT CARD</span>
            <span
              className="font-semibold"
              data-testid="theme-preview-light-accent"
              style={{ color: `hsl(${resolvedVars.light.accentText})` }}
            >
              Bàn 05 · Chi tiết
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Mì Cay Hải Sản (Cấp 2)</div>
              <div
                className="text-base font-bold tabular-nums"
                style={{ color: `hsl(${resolvedVars.light.price})` }}
                data-testid="theme-preview-light-price"
              >
                65.000 ₫
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-xs"
                data-testid="theme-preview-light-nav-pill"
                style={{
                  backgroundColor: `hsl(${resolvedVars.light.primary})`,
                  color: `hsl(${resolvedVars.light.primaryForeground})`,
                }}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                Cài đặt
              </span>
              <span
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-bold shadow-xs"
                data-testid="theme-preview-light-primary-btn"
                style={{
                  backgroundColor: `hsl(${resolvedVars.light.primary})`,
                  color: `hsl(${resolvedVars.light.primaryForeground})`,
                }}
              >
                Gửi Bếp
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px]">
            <span className="font-semibold text-emerald-600">+120.000 ₫ (Thu)</span>
            <span className="font-semibold text-rose-600">-45.000 ₫ (Chi)</span>
          </div>
        </div>

        <div
          className="rounded-xl border border-slate-800 bg-slate-900 p-3.5 text-slate-100 shadow-xs"
          data-testid="theme-preview-dark"
        >
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400">DARK CARD</span>
            <span
              className="font-semibold"
              data-testid="theme-preview-dark-accent"
              style={{ color: `hsl(${resolvedVars.dark.accentText})` }}
            >
              Bàn 05 · Chi tiết
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Mì Cay Hải Sản (Cấp 2)</div>
              <div
                className="text-base font-bold tabular-nums"
                style={{ color: `hsl(${resolvedVars.dark.price})` }}
                data-testid="theme-preview-dark-price"
              >
                65.000 ₫
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-xs"
                data-testid="theme-preview-dark-nav-pill"
                style={{
                  backgroundColor: `hsl(${resolvedVars.dark.primary})`,
                  color: `hsl(${resolvedVars.dark.primaryForeground})`,
                }}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                Cài đặt
              </span>
              <span
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-bold shadow-xs"
                data-testid="theme-preview-dark-primary-btn"
                style={{
                  backgroundColor: `hsl(${resolvedVars.dark.primary})`,
                  color: `hsl(${resolvedVars.dark.primaryForeground})`,
                }}
              >
                Gửi Bếp
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-slate-800 pt-2 text-[11px]">
            <span className="font-semibold text-emerald-400">+120.000 ₫ (Thu)</span>
            <span className="font-semibold text-rose-400">-45.000 ₫ (Chi)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function resolveDraftThemeVariables(
  draft: Pick<StoreSettings, 'brandColor' | 'primaryTextColor' | 'accentTextColor' | 'priceColor'>,
): StoreThemeVariables {
  const safeBrand = HEX_COLOR_RE.test(draft.brandColor.trim()) ? draft.brandColor.trim() : '#E11D48';
  const safeOverride = (override: ColorOverride): ColorOverride => ({
    light:
      override.light && HEX_COLOR_RE.test(override.light.trim()) ? override.light.trim() : null,
    dark: override.dark && HEX_COLOR_RE.test(override.dark.trim()) ? override.dark.trim() : null,
  });

  return buildStoreThemeVariables(
    safeBrand,
    safeOverride(draft.accentTextColor),
    safeOverride(draft.priceColor),
    safeOverride(draft.primaryTextColor),
  );
}
