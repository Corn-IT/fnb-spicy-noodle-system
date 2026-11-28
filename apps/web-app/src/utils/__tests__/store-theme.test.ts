import { describe, expect, it } from 'vitest';
import {
  buildStoreThemeVariables,
  computeColorContrastOnCard,
  computeHslContrastRatio,
  hexToHsl,
  parseHslVar,
  syncDocumentThemeMode,
  validateClientImageFile,
} from '../store-theme';

describe('store-theme utilities (AC-14.8, AC-15.2..AC-15.4)', () => {
  it('converts #E11D48 to expected HSL channels and keeps WCAG >= 4.5:1 contrast', () => {
    const hsl = hexToHsl('#E11D48');
    expect(hsl.h).toBeCloseTo(346.8, 0);
    expect(hsl.s).toBeCloseTo(77.2, 0);
    expect(hsl.l).toBeCloseTo(49.8, 0);

    const vars = buildStoreThemeVariables('#E11D48');
    expect(vars.light.primary).toBe(vars.light.ring);
    expect(vars.dark.primary).toBe(vars.dark.ring);
    expect(vars.light.accentText).toBe(vars.light.primary);
    expect(vars.light.price).toBe(vars.light.primary);
    expect(vars.dark.accentText).toBe(vars.dark.primary);
    expect(vars.dark.price).toBe(vars.dark.primary);
    expect(computeHslContrastRatio(vars.light.primary, vars.light.primaryForeground)).toBeGreaterThanOrEqual(4.5);
    expect(computeHslContrastRatio(vars.dark.primary, vars.dark.primaryForeground)).toBeGreaterThanOrEqual(4.5);
  });

  it('resolves independent accentTextColor and priceColor tokens with +4% auto-dark fallback (AC-15.2..AC-15.4)', () => {
    const amberHsl = hexToHsl('#D97706');
    const vars = buildStoreThemeVariables(
      '#E11D48',
      { light: '#D97706', dark: null },
      { light: '#0D9488', dark: '#2DD4BF' },
    );

    // Primary remains untouched
    expect(vars.light.primary).toBe('346.8 77.2% 49.8%');
    // accentText dark auto-lightens +4% capped at 84%
    expect(parseHslVar(vars.light.accentText).l).toBeCloseTo(amberHsl.l, 1);
    expect(parseHslVar(vars.dark.accentText).l).toBeCloseTo(Math.min(84, amberHsl.l + 4), 1);
    // price uses explicit light & dark hex
    expect(vars.light.price).toBe(`${hexToHsl('#0D9488').h} ${hexToHsl('#0D9488').s}% ${hexToHsl('#0D9488').l}%`);
    expect(vars.dark.price).toBe(`${hexToHsl('#2DD4BF').h} ${hexToHsl('#2DD4BF').s}% ${hexToHsl('#2DD4BF').l}%`);
    expect(computeColorContrastOnCard(vars.light.price, 'light')).toBeGreaterThan(3);
    expect(computeColorContrastOnCard(vars.dark.price, 'dark')).toBeGreaterThanOrEqual(4.5);

    syncDocumentThemeMode('dark', '#E11D48', { light: '#D97706', dark: null }, { light: '#0D9488', dark: '#2DD4BF' });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--accent-text')).toBe(vars.dark.accentText);
    expect(document.documentElement.style.getPropertyValue('--price')).toBe(vars.dark.price);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(vars.dark.primary);
  });

  it('overrides --primary-foreground explicitly and keeps pure white when dark inherits light', () => {
    const inheritLightVars = buildStoreThemeVariables(
      '#E11D48',
      null,
      null,
      { light: '#FFFFFF', dark: null },
    );
    expect(inheritLightVars.light.primaryForeground).toBe('0 0% 100%');
    expect(inheritLightVars.dark.primaryForeground).toBe('0 0% 100%');

    const dualCustomVars = buildStoreThemeVariables(
      '#E11D48',
      null,
      null,
      { light: '#FEF08A', dark: '#FFFFFF' },
    );
    expect(dualCustomVars.light.primaryForeground).not.toBe('0 0% 100%');
    expect(dualCustomVars.dark.primaryForeground).toBe('0 0% 100%');

    syncDocumentThemeMode(
      'dark',
      '#E11D48',
      null,
      null,
      { light: '#FEF08A', dark: '#FFFFFF' },
    );
    expect(document.documentElement.style.getPropertyValue('--primary-foreground')).toBe('0 0% 100%');
  });

  it('switches --primary-foreground to dark text with >= 4.5:1 contrast for bright yellow (#FACC15) in light and dark modes', () => {
    const vars = buildStoreThemeVariables('#FACC15');

    // Light yellow must pick dark foreground (lightness < 20%)
    const lightFgLightness = Number(vars.light.primaryForeground.split(/\s+/)[2]?.replace('%', ''));
    const darkFgLightness = Number(vars.dark.primaryForeground.split(/\s+/)[2]?.replace('%', ''));

    expect(lightFgLightness).toBeLessThan(20);
    expect(darkFgLightness).toBeLessThan(20);
    expect(computeHslContrastRatio(vars.light.primary, vars.light.primaryForeground)).toBeGreaterThanOrEqual(4.5);
    expect(computeHslContrastRatio(vars.dark.primary, vars.dark.primaryForeground)).toBeGreaterThanOrEqual(4.5);
  });

  it('picks white foreground with >= 4.5:1 contrast across diverse brand colors', () => {
    for (const color of ['#0F172A', '#2563EB', '#059669', '#9333EA', '#EA580C']) {
      const vars = buildStoreThemeVariables(color);
      expect(computeHslContrastRatio(vars.light.primary, vars.light.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      expect(computeHslContrastRatio(vars.dark.primary, vars.dark.primaryForeground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rejects SVG files and unsupported file types before canvas processing', () => {
    const svgFile = new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' });
    const txtFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' });
    const icoFile = new File([new Uint8Array([0x00, 0x00, 0x01, 0x00])], 'favicon.ico', { type: 'image/x-icon' });

    expect(() => validateClientImageFile(svgFile)).toThrow();
    expect(() => validateClientImageFile(txtFile)).toThrow();
    expect(() => validateClientImageFile(pngFile)).not.toThrow();
    expect(() => validateClientImageFile(icoFile)).not.toThrow();
  });

  it('resizes PNG/LOGO/FAVICON uploads via Canvas with webp->png fallback and handles Canvas/Image errors', async () => {
    const { StoreAssetKind } = await import('@fnb/shared');
    const { resizeImageFileToUploadPayload } = await import('../store-theme');

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const origCreateElement = document.createElement.bind(document);
    const OrigImage = globalThis.Image;

    let shouldFailImg = false;
    let mockMimeData = 'data:image/webp;base64,V0VCUF9EQVRB';
    let mockPngData = 'data:image/png;base64,UE5HX0RBVEE=';
    let mockCtx: Record<string, unknown> | null = {
      clearRect: () => undefined,
      drawImage: () => undefined,
    };

    URL.createObjectURL = () => 'blob:mock-image';
    URL.revokeObjectURL = () => undefined;

    class MockImage {
      width = 1024;
      height = 512;
      naturalWidth = 1024;
      naturalHeight = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        queueMicrotask(() => {
          if (shouldFailImg) this.onerror?.();
          else this.onload?.();
        });
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image;

    document.createElement = ((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
          toDataURL: (mime: string) => (mime === 'image/png' ? mockPngData : mockMimeData),
        } as unknown as HTMLCanvasElement;
      }
      return origCreateElement(tag);
    }) as typeof document.createElement;

    try {
      const pngFile = new File([new Uint8Array([1, 2, 3])], 'icon.png', { type: 'image/png' });

      // 1. FAVICON -> 64x64 PNG
      const fav = await resizeImageFileToUploadPayload(pngFile, StoreAssetKind.FAVICON);
      expect(fav).toEqual({ mime: 'image/png', base64: 'UE5HX0RBVEE=' });

      // 2. LOGO -> 512x256 WebP
      const logo = await resizeImageFileToUploadPayload(pngFile, StoreAssetKind.LOGO);
      expect(logo).toEqual({ mime: 'image/webp', base64: 'V0VCUF9EQVRB' });

      // 3. LOGO fallback to PNG when WebP encoder returns non-webp data URL
      mockMimeData = 'data:image/png;base64,RkFMTEJBQ0tfUE5H';
      const fallback = await resizeImageFileToUploadPayload(pngFile, StoreAssetKind.LOGO);
      expect(fallback).toEqual({ mime: 'image/png', base64: 'UE5HX0RBVEE=' });

      // 4. Empty base64 error branch
      mockPngData = 'data:image/png;base64,';
      await expect(
        resizeImageFileToUploadPayload(pngFile, StoreAssetKind.FAVICON),
      ).rejects.toThrow(/Không thể nén ảnh/);

      // 5. Missing 2d canvas context error branch
      mockCtx = null;
      await expect(
        resizeImageFileToUploadPayload(pngFile, StoreAssetKind.LOGO),
      ).rejects.toThrow(/Canvas/);

      // 6. Broken image decode error branch
      shouldFailImg = true;
      await expect(
        resizeImageFileToUploadPayload(pngFile, StoreAssetKind.LOGO),
      ).rejects.toThrow(/Không thể đọc/);
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      document.createElement = origCreateElement;
      globalThis.Image = OrigImage;
    }
  });
});
