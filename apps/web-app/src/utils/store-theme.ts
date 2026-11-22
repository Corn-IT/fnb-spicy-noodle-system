import { StoreAssetKind, type ColorOverride, type UploadStoreAssetInput } from '@fnb/shared';

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface ThemeCssVariables {
  primary: string;
  primaryForeground: string;
  ring: string;
  accentText: string;
  price: string;
}

export const CARD_SURFACE_HSL = {
  light: '0 0% 100%',
  dark: '222.2 41% 11.5%',
} as const;

export interface StoreThemeVariables {
  light: ThemeCssVariables;
  dark: ThemeCssVariables;
}

const ACCEPTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

const ACCEPTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|ico)$/i;
const MAX_UPLOAD_INPUT_BYTES = 8 * 1024 * 1024;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function hexToHsl(hex: string): HslColor {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / delta + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h *= 60;
  }

  return {
    h: Number(h.toFixed(1)),
    s: Number((s * 100).toFixed(1)),
    l: Number((l * 100).toFixed(1)),
  };
}

export function formatHslVar(hsl: HslColor): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

export function parseHslVar(value: string): HslColor {
  const match = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(value);
  if (!match) {
    throw new Error(`Invalid HSL CSS value: ${value}`);
  }
  return {
    h: Number(match[1]),
    s: Number(match[2]),
    l: Number(match[3]),
  };
}

function hslToRgb({ h, s, l }: HslColor): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function channelRelativeLuminance(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return (
    0.2126 * channelRelativeLuminance(rgb.r) +
    0.7152 * channelRelativeLuminance(rgb.g) +
    0.0722 * channelRelativeLuminance(rgb.b)
  );
}

export function computeHslContrastRatio(hslVarA: string, hslVarB: string): number {
  const lumA = relativeLuminance(hslToRgb(parseHslVar(hslVarA)));
  const lumB = relativeLuminance(hslToRgb(parseHslVar(hslVarB)));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function pickAccessibleForeground(primaryCssValue: string): string {
  const white = '0 0% 100%';
  const darkSlate = '222.2 84% 4.9%';
  const pureBlack = '0 0% 0%';

  const whiteContrast = computeHslContrastRatio(primaryCssValue, white);
  if (whiteContrast >= 4.5) return white;

  const slateContrast = computeHslContrastRatio(primaryCssValue, darkSlate);
  if (slateContrast >= 4.5) return darkSlate;

  const blackContrast = computeHslContrastRatio(primaryCssValue, pureBlack);
  return blackContrast >= whiteContrast ? pureBlack : white;
}

function lightenForDark(hsl: HslColor): HslColor {
  return {
    h: hsl.h,
    s: hsl.s,
    l: Number(Math.min(84, hsl.l + 4).toFixed(1)),
  };
}

function resolveTokenPairHsl(
  fallbackVars: { light: string; dark: string },
  override?: ColorOverride | null,
): { light: string; dark: string } {
  if (!override) {
    return fallbackVars;
  }

  const lightHsl = override.light ? hexToHsl(override.light) : null;
  const lightVar = lightHsl ? formatHslVar(lightHsl) : fallbackVars.light;

  let darkVar = fallbackVars.dark;
  if (override.dark) {
    darkVar = formatHslVar(hexToHsl(override.dark));
  } else if (lightHsl) {
    darkVar = formatHslVar(lightenForDark(lightHsl));
  }

  return {
    light: lightVar,
    dark: darkVar,
  };
}

function resolvePrimaryForegroundPairHsl(
  fallbackVars: { light: string; dark: string },
  override?: ColorOverride | null,
): { light: string; dark: string } {
  if (!override) {
    return fallbackVars;
  }

  const lightVar = override.light ? formatHslVar(hexToHsl(override.light)) : fallbackVars.light;
  const darkVar = override.dark
    ? formatHslVar(hexToHsl(override.dark))
    : override.light
      ? lightVar
      : fallbackVars.dark;

  return {
    light: lightVar,
    dark: darkVar,
  };
}

export function computeColorContrastOnCard(hslVar: string, mode: 'light' | 'dark'): number {
  return computeHslContrastRatio(hslVar, CARD_SURFACE_HSL[mode]);
}

export function buildStoreThemeVariables(
  brandColor: string,
  accentTextColor?: ColorOverride | null,
  priceColor?: ColorOverride | null,
  primaryTextColor?: ColorOverride | null,
): StoreThemeVariables {
  const lightHsl = hexToHsl(brandColor);
  const lightPrimary = formatHslVar(lightHsl);
  const darkPrimary = formatHslVar(lightenForDark(lightHsl));

  const fallbackPair = { light: lightPrimary, dark: darkPrimary };
  const primaryFgFallbackPair = {
    light: pickAccessibleForeground(lightPrimary),
    dark: pickAccessibleForeground(darkPrimary),
  };
  const primaryFgPair = resolvePrimaryForegroundPairHsl(primaryFgFallbackPair, primaryTextColor);
  const accentPair = resolveTokenPairHsl(fallbackPair, accentTextColor);
  const pricePair = resolveTokenPairHsl(fallbackPair, priceColor);

  return {
    light: {
      primary: lightPrimary,
      primaryForeground: primaryFgPair.light,
      ring: lightPrimary,
      accentText: accentPair.light,
      price: pricePair.light,
    },
    dark: {
      primary: darkPrimary,
      primaryForeground: primaryFgPair.dark,
      ring: darkPrimary,
      accentText: accentPair.dark,
      price: pricePair.dark,
    },
  };
}

export function applyStoreThemeVariables(
  brandColor: string,
  activeMode: 'light' | 'dark',
  accentTextColor?: ColorOverride | null,
  priceColor?: ColorOverride | null,
  primaryTextColor?: ColorOverride | null,
): void {
  const vars = buildStoreThemeVariables(
    brandColor,
    accentTextColor,
    priceColor,
    primaryTextColor,
  );
  const selected = activeMode === 'dark' ? vars.dark : vars.light;
  const root = document.documentElement;
  root.style.setProperty('--primary', selected.primary);
  root.style.setProperty('--primary-foreground', selected.primaryForeground);
  root.style.setProperty('--ring', selected.ring);
  root.style.setProperty('--accent-text', selected.accentText);
  root.style.setProperty('--price', selected.price);
}

export function syncDocumentThemeMode(
  mode: 'light' | 'dark',
  brandColor: string,
  accentTextColor?: ColorOverride | null,
  priceColor?: ColorOverride | null,
  primaryTextColor?: ColorOverride | null,
): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  applyStoreThemeVariables(brandColor, mode, accentTextColor, priceColor, primaryTextColor);
}

export function validateClientImageFile(file: File): void {
  if (file.size > MAX_UPLOAD_INPUT_BYTES) {
    throw new Error('File ảnh gốc vượt quá 8MB');
  }
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    throw new Error('Không hỗ trợ file SVG vì lý do bảo mật, vui lòng chọn PNG, JPEG, WebP hoặc ICO');
  }
  const hasValidType = normalizedType.length > 0 && ACCEPTED_IMAGE_MIME_TYPES.has(normalizedType);
  const hasValidExt = ACCEPTED_IMAGE_EXTENSIONS.test(file.name);
  if (!hasValidType && !hasValidExt) {
    throw new Error('Định dạng ảnh không hợp lệ (chỉ nhận PNG, JPEG, WebP hoặc ICO)');
  }
}

export async function resizeImageFileToUploadPayload(
  file: File,
  kind: StoreAssetKind,
): Promise<UploadStoreAssetInput> {
  validateClientImageFile(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Không thể đọc dữ liệu ảnh'));
      element.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width || 1;
    const srcH = img.naturalHeight || img.height || 1;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Trình duyệt không hỗ trợ xử lý ảnh Canvas');
    }

    let outputMime: 'image/png' | 'image/webp';
    if (kind === StoreAssetKind.FAVICON) {
      canvas.width = 64;
      canvas.height = 64;
      outputMime = 'image/png';
      const scale = Math.min(64 / srcW, 64 / srcH);
      const drawW = Math.max(1, Math.round(srcW * scale));
      const drawH = Math.max(1, Math.round(srcH * scale));
      const offsetX = Math.floor((64 - drawW) / 2);
      const offsetY = Math.floor((64 - drawH) / 2);
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      const targetW = Math.max(1, Math.round(srcW * scale));
      const targetH = Math.max(1, Math.round(srcH * scale));
      canvas.width = targetW;
      canvas.height = targetH;
      outputMime = 'image/webp';
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
    }

    let dataUrl = canvas.toDataURL(outputMime, outputMime === 'image/webp' ? 0.88 : undefined);
    let actualMime: 'image/png' | 'image/jpeg' | 'image/webp' = outputMime;
    if (outputMime === 'image/webp' && !dataUrl.startsWith('data:image/webp')) {
      actualMime = 'image/png';
      dataUrl = canvas.toDataURL('image/png');
    }

    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) {
      throw new Error('Không thể nén ảnh trước khi tải lên');
    }

    return {
      mime: actualMime,
      base64,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
