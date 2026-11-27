import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_SETTINGS,
  mergeStoreSettingsWithDefaults,
  PublicStoreSettingsResponseSchema,
  QR_CARD_DEFAULTS,
  resolveQrCardDisplay,
  sanitizeNavGroupLabels,
  sanitizeNavGroupOrder,
  sanitizeNavLabels,
  sanitizeNavOrder,
  sanitizePageHeaders,
  StoreMessagesMapSchema,
  StoreSettingsSchema,
  UiPreferencesSchema,
  UpdateUiPreferencesSchema,
  UserDisplayScaleSchema,
} from '../index';

describe('shared store policy compatibility contracts', () => {
  it('merges partial cached branding, QR and scale without losing version/assets or explicit false values', () => {
    const cached = {
      storeName: 'Shared store',
      defaultTheme: 'dark',
      qr: { theme: 'light', subtitle: undefined },
      qrCard: { showLogo: false, showLinkText: false },
      displayScale: { globalPercent: 150 },
      updatedAt: '2026-11-27T10:00:00.000Z',
      assets: { logo: 'logo-v2', favicon: null, qrLogo: null },
    };
    const parsed = PublicStoreSettingsResponseSchema.parse(mergeStoreSettingsWithDefaults(cached));
    expect(parsed).toMatchObject({
      defaultTheme: 'dark', qr: { theme: 'light', subtitle: '' },
      qrCard: { showLogo: false, showLinkText: false },
      displayScale: { globalPercent: 150, perPath: {}, qrOrderPercent: 100 },
      updatedAt: cached.updatedAt, assets: cached.assets,
    });
    expect(cached.qr).toEqual({ theme: 'light', subtitle: undefined });
  });

  it.each([null, [], 'broken'])('does not turn malformed cached settings %j into valid defaults', (candidate) => {
    expect(mergeStoreSettingsWithDefaults(candidate)).toBe(candidate);
    expect(StoreSettingsSchema.safeParse(mergeStoreSettingsWithDefaults(candidate)).success).toBe(false);
  });

  it('keeps invalid nested cache values visible to schema validation', () => {
    for (const field of ['qr', 'qrCard', 'receipt', 'displayScale', 'primaryTextColor', 'printTemplates']) {
      const merged = mergeStoreSettingsWithDefaults({ [field]: null });
      expect(StoreSettingsSchema.safeParse(merged).success, field).toBe(false);
    }
    expect(StoreSettingsSchema.safeParse(mergeStoreSettingsWithDefaults({ printTemplates: { official: null } })).success).toBe(false);
  });

  it('preserves explicit font size when an older cached template also contains legacy fontSize', () => {
    const parsed = StoreSettingsSchema.parse(mergeStoreSettingsWithDefaults({
      printTemplates: { official: { fontSize: 'sm', fontSizePt: 12.5, blocks: { cashier: false } } },
    }));
    expect(parsed.printTemplates.official.fontSizePt).toBe(12.5);
    expect(parsed.printTemplates.official.blocks.cashier).toBe(false);
  });

  it('cleans absent and malformed cached navigation without introducing inaccessible paths or duplicates', () => {
    for (const absent of [undefined, null]) {
      expect(sanitizeNavLabels(absent)).toEqual({});
      expect(sanitizeNavGroupLabels(absent)).toEqual({});
      expect(sanitizeNavOrder(absent)).toEqual([]);
      expect(sanitizeNavGroupOrder(absent)).toEqual([]);
      expect(sanitizePageHeaders(absent)).toEqual({});
    }
    expect(sanitizeNavLabels({ ' /pos ': ' POS ', '/settings': undefined, '/rogue': 'Drop' })).toEqual({ '/pos': 'POS' });
    expect(sanitizeNavGroupLabels({ sales: undefined, finance: ' Finance ' })).toEqual({ finance: 'Finance' });
    // Browser JSON has no TypeScript guarantees; tolerate non-string entries at this boundary.
    const paths = JSON.parse('[null,12," /pos ","/rogue","/pos","/settings"]') as string[];
    expect(sanitizeNavOrder(paths)).toEqual(['/pos', '/settings']);
    expect(sanitizeNavGroupOrder(JSON.parse('[false," sales ","sales","finance"]') as string[])).toEqual(['sales', 'finance']);
  });

  it('retains a supplied subtitle or title when the other header field is absent', () => {
    expect(sanitizePageHeaders({
      '/pos': { subtitle: ' Cashier ' }, '/menu': { title: ' Menu ' }, '/profile': undefined,
    })).toEqual({ '/pos': { title: '', subtitle: 'Cashier' }, '/menu': { title: 'Menu', subtitle: '' } });
  });

  it('falls back to store identity, readable QR copy and safe accent for blank guest card overrides', () => {
    const resolved = resolveQrCardDisplay({
      storeName: ' Shared store ', qr: { ...DEFAULT_STORE_SETTINGS.qr, storeName: ' ' },
      qrCard: { tableHeadline: '', tableSubtitle: ' ', takeawayTitle: '', takeawayHeadline: '', takeawaySubtitle: '', footerText: '', accentColor: 'invalid', showLogo: false, showLinkText: false },
    });
    expect(resolved).toEqual({ storeName: 'Shared store', ...QR_CARD_DEFAULTS, showLogo: false, showLinkText: false });
    expect(resolveQrCardDisplay({ ...DEFAULT_STORE_SETTINGS, storeName: ' ', qr: { ...DEFAULT_STORE_SETTINGS.qr, storeName: '' } }).storeName).toBe('Quán Mì Cay');
  });

  it('keeps legacy account theme, navigation and scale readable without requiring their deletion', () => {
    const legacy = {
      theme: 'light', sidebarWidth: 320, columnWidths: { total: 140 },
      displayScale: { globalPercent: 80, perPath: { '/pos': 125 } },
      navOrder: ['/menu', '/pos'], navGroupOrder: ['finance', 'sales'],
      sidebarCollapsed: true, voiceAlertEnabled: false,
    };
    expect(UiPreferencesSchema.parse(legacy)).toEqual(legacy);
    expect(UpdateUiPreferencesSchema.parse({ voiceAlertEnabled: true })).toEqual({ voiceAlertEnabled: true });
    expect(legacy.displayScale).toEqual({ globalPercent: 80, perPath: { '/pos': 125 } });
    expect(UserDisplayScaleSchema.safeParse({ perPath: { '/rogue': 125 } }).success).toBe(false);
    expect(UserDisplayScaleSchema.parse({ perPath: { '/pos': 150 } })).toEqual({ perPath: { '/pos': 150 } });
  });

  it('rejects unknown shared message keys at the key path instead of silently broadcasting them', () => {
    const parsed = StoreMessagesMapSchema.safeParse({ 'unknown.global.key': { title: 'Unexpected' } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(['unknown.global.key']);
  });
});
