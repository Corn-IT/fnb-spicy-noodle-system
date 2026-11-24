import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

describe('@fnb/shared store-settings contracts', () => {
  it('exports store-settings schemas, defaults, socket event, error codes, and audit module', () => {
    expect(contracts).toHaveProperty('StoreSettingsSchema');
    expect(contracts).toHaveProperty('StoreAssetKindSchema');
    expect(contracts).toHaveProperty('PublicStoreSettingsResponseSchema');
    expect(contracts).toHaveProperty('UpdateStoreSettingsSchema');
    expect(contracts).toHaveProperty('UploadStoreAssetSchema');
    expect(contracts).toHaveProperty('DEFAULT_STORE_SETTINGS');

    expect(contracts.SocketEvents.STORE_SETTINGS_UPDATED).toBe('store-settings:updated');
    expect(contracts.ErrorCodes.STORE_ASSET_INVALID_TYPE).toBe('STORE_ASSET_INVALID_TYPE');
    expect(contracts.ErrorCodes.STORE_ASSET_TOO_LARGE).toBe('STORE_ASSET_TOO_LARGE');
    expect(contracts.ErrorCodes.STORE_SETTINGS_CONFLICT).toBe('STORE_SETTINGS_CONFLICT');
    expect(contracts.AuditModuleSchema.safeParse('SETTINGS').success).toBe(true);
    expect(contracts.AUDIT_MODULE_CONFIG.SETTINGS.moduleLabel).toBeTruthy();
  });

  it('validates StoreSettingsSchema fields and rejects invalid colors, lengths, or nav keys', () => {
    const valid = contracts.StoreSettingsSchema.safeParse(contracts.DEFAULT_STORE_SETTINGS);
    expect(valid.success).toBe(true);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        storeName: '   ',
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        brandColor: '#FFF',
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        brandColor: '#GGGGGG',
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        description: 'a'.repeat(301),
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        qr: { ...contracts.DEFAULT_STORE_SETTINGS.qr, welcomeMessage: 'a'.repeat(161) },
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        receipt: { ...contracts.DEFAULT_STORE_SETTINGS.receipt, footerNote: 'a'.repeat(201) },
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        navLabels: { pos: 'Bán hàng' },
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        navLabels: { '/pos': 'a'.repeat(41) },
      }).success,
    ).toBe(false);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        navLabels: { '/pos': 'Bán hàng' },
      }).success,
    ).toBe(true);
  });

  it('validates StoreAssetKindSchema and blocks SVG mime in UploadStoreAssetSchema', () => {
    expect(contracts.StoreAssetKindSchema.safeParse('logo').success).toBe(true);
    expect(contracts.StoreAssetKindSchema.safeParse('favicon').success).toBe(true);
    expect(contracts.StoreAssetKindSchema.safeParse('qr-logo').success).toBe(true);
    expect(contracts.StoreAssetKindSchema.safeParse('banner').success).toBe(false);

    expect(
      contracts.UploadStoreAssetSchema.safeParse({
        mime: 'image/webp',
        base64: 'UklGRg==',
      }).success,
    ).toBe(true);

    expect(
      contracts.UploadStoreAssetSchema.safeParse({
        mime: 'image/svg+xml',
        base64: 'PHN2Zz48L3N2Zz4=',
      }).success,
    ).toBe(false);
  });

  it('adds settings permissions with default false and auto-grants legacy users with rbac.update', () => {
    const emptyParsed = contracts.UserPermissionsSchema.parse({});
    expect(emptyParsed.settings).toEqual({ view: false, update: false });

    const legacyRbacUpdater = contracts.UserPermissionsSchema.parse({
      rbac: { view: true, update: true },
    });
    expect(legacyRbacUpdater.settings).toEqual({ view: true, update: true });

    const legacyManageAdmin = contracts.UserPermissionsSchema.parse({
      rbac: { view: true, manage: true },
    });
    expect(legacyManageAdmin.settings).toEqual({ view: true, update: true });

    const explicitDenied = contracts.UserPermissionsSchema.parse({
      rbac: { view: true, update: true },
      settings: { view: false, update: false },
    });
    expect(explicitDenied.settings).toEqual({ view: false, update: false });
  });

  it('validates primaryTextColor, accentTextColor, priceColor, pageHeaders and rejects invalid color overrides or lengths', () => {
    expect(contracts).toHaveProperty('ColorOverrideSchema');
    expect(contracts).toHaveProperty('PageHeaderOverrideSchema');
    expect(contracts).toHaveProperty('sanitizePageHeaders');
    expect(contracts).toHaveProperty('mergeStoreSettingsWithDefaults');

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        primaryTextColor: { light: '#FFFFFF', dark: '#FFFFFF' },
        accentTextColor: { light: '#2563EB', dark: '#60A5FA' },
        priceColor: { light: '#0D9488', dark: null },
        pageHeaders: {
          '/settings': { title: 'Thiết lập Quán', subtitle: 'Mô tả mới' },
        },
      }).success,
    ).toBe(true);

    expect(
      contracts.ColorOverrideSchema.safeParse({ light: '#FFF', dark: null }).success,
    ).toBe(false);

    expect(
      contracts.PageHeaderOverrideSchema.safeParse({ title: 'a'.repeat(81), subtitle: '' }).success,
    ).toBe(false);

    expect(
      contracts.PageHeaderOverrideSchema.safeParse({ title: 'OK', subtitle: 'a'.repeat(201) }).success,
    ).toBe(false);
  });

  it('sanitizes navLabels, navGroupLabels, navGroupOrder, navOrder, and pageHeaders against whitelist', () => {
    expect(
      contracts.sanitizeNavLabels({
        '/pos': '  Bán hàng  ',
        '/menu': '   ',
        '/invalid-route': 'Không hợp lệ',
      }),
    ).toEqual({ '/pos': 'Bán hàng' });

    expect(
      contracts.sanitizeNavGroupLabels({
        sales: '  Bán hàng & Quầy  ',
        hr: '   ',
        unknown: 'Drop me',
      }),
    ).toEqual({ sales: 'Bán hàng & Quầy' });

    expect(
      contracts.sanitizeNavGroupOrder([' hr ', 'sales', 'hr', 'rogue', 'finance']),
    ).toEqual(['hr', 'sales', 'finance']);

    expect(
      contracts.sanitizeNavOrder([' /discounts ', '/pos', '/discounts', '/rogue']),
    ).toEqual(['/discounts', '/pos']);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        navGroupLabels: { sales: 'Quầy & Khuyến mãi' },
        navGroupOrder: ['finance', 'sales'],
        navOrder: ['/discounts', '/pos'],
      }).success,
    ).toBe(true);

    expect(
      contracts.StoreSettingsSchema.safeParse({
        ...contracts.DEFAULT_STORE_SETTINGS,
        navGroupLabels: { sales: 'a'.repeat(41) },
      }).success,
    ).toBe(false);

    expect(
      contracts.sanitizePageHeaders({
        '/settings': { title: '  Thiết lập  ', subtitle: '  Mô tả tuỳ chỉnh  ' },
        '/pos': { title: '  POS Nhanh  ', subtitle: '   ' },
        '/menu': { title: '   ', subtitle: '   ' },
        '/rogue': { title: 'XSS', subtitle: 'Should drop' },
      }),
    ).toEqual({
      '/settings': { title: 'Thiết lập', subtitle: 'Mô tả tuỳ chỉnh' },
      '/pos': { title: 'POS Nhanh', subtitle: '' },
    });
  });

  it('merges legacy v1 store-settings metadata cleanly while still rejecting corrupted field types', () => {
    const legacyV1 = {
      storeName: 'Mì Cay Seoul',
      subtitle: 'Hương vị Hàn Quốc',
      description: 'Đăng nhập hệ thống',
      brandColor: '#0F766E',
      defaultTheme: 'dark',
      qr: {
        storeName: 'Seoul QR',
        subtitle: 'Chào mừng',
        welcomeMessage: 'Chúc ngon miệng',
        theme: 'light',
      },
      receipt: {
        printName: 'MI CAY SEOUL',
        address: '123 Nguyễn Trãi',
        phone: '0901234567',
        footerNote: 'Cảm ơn!',
        showLogo: true,
      },
      navLabels: { '/pos': 'Thu ngân' },
    };

    const mergedV1 = contracts.mergeStoreSettingsWithDefaults(legacyV1);
    const parsedV1 = contracts.StoreSettingsSchema.safeParse(mergedV1);
    expect(parsedV1.success).toBe(true);
    if (parsedV1.success) {
      expect(parsedV1.data.storeName).toBe('Mì Cay Seoul');
      expect(parsedV1.data.brandColor).toBe('#0F766E');
      expect(parsedV1.data.primaryTextColor).toEqual({ light: null, dark: null });
      expect(parsedV1.data.accentTextColor).toEqual({ light: null, dark: null });
      expect(parsedV1.data.priceColor).toEqual({ light: null, dark: null });
      expect(parsedV1.data.navGroupLabels).toEqual({});
      expect(parsedV1.data.navGroupOrder).toEqual([]);
      expect(parsedV1.data.navOrder).toEqual([]);
      expect(parsedV1.data.pageHeaders).toEqual({});
    }

    const mergedCachedPublic = contracts.mergeStoreSettingsWithDefaults({
      ...legacyV1,
      updatedAt: '2026-11-15T10:00:00.000Z',
      assets: { logo: null, favicon: null, qrLogo: null },
    });
    expect(contracts.PublicStoreSettingsResponseSchema.safeParse(mergedCachedPublic).success).toBe(true);

    const corruptColor = contracts.mergeStoreSettingsWithDefaults({
      ...legacyV1,
      brandColor: 'not-a-hex',
    });
    expect(contracts.StoreSettingsSchema.safeParse(corruptColor).success).toBe(false);

    const corruptName = contracts.mergeStoreSettingsWithDefaults({
      ...legacyV1,
      storeName: 999,
    });
    expect(contracts.StoreSettingsSchema.safeParse(corruptName).success).toBe(false);
    expect(parsedV1.success && parsedV1.data.printTemplates).toEqual(contracts.DEFAULT_PRINT_TEMPLATES);
  });

  it('validates printTemplates schemas, deep-merges partial v1.5/partial templates, and rejects invalid fontSize or corrupt blocks (Story 16)', () => {
    expect(contracts).toHaveProperty('ThermalFontSizeSchema');
    expect(contracts).toHaveProperty('PrintTemplateKeySchema');
    expect(contracts).toHaveProperty('PrintTemplatesSchema');
    expect(contracts).toHaveProperty('PRINT_TEMPLATE_DEFAULTS');
    expect(contracts.DEFAULT_PRINT_TEMPLATES.provisional.blocks.discountLine).toBe(false);

    const partialMerged = contracts.mergeStoreSettingsWithDefaults({
      ...contracts.DEFAULT_STORE_SETTINGS,
      printTemplates: {
        provisional: {
          title: '  HOÁ ĐƠN TẠM  ',
          blocks: { cashier: false },
        },
        kitchen: {
          fontSize: 'lg',
        },
      },
    });
    const parsedPartial = contracts.StoreSettingsSchema.safeParse(partialMerged);
    expect(parsedPartial.success).toBe(true);
    if (parsedPartial.success) {
      expect(parsedPartial.data.printTemplates.provisional.title).toBe('HOÁ ĐƠN TẠM');
      expect(parsedPartial.data.printTemplates.provisional.blocks.cashier).toBe(false);
      expect(parsedPartial.data.printTemplates.provisional.blocks.bankInfo).toBe(true);
      expect(parsedPartial.data.printTemplates.provisional.blocks.discountLine).toBe(false);
      expect(parsedPartial.data.printTemplates.kitchen.fontSizePt).toBe(9.5);
      expect(parsedPartial.data.printTemplates.tableTransfer).toEqual(
        contracts.DEFAULT_PRINT_TEMPLATES.tableTransfer,
      );
    }

    const badFontSize = contracts.mergeStoreSettingsWithDefaults({
      ...contracts.DEFAULT_STORE_SETTINGS,
      printTemplates: {
        kitchen: { fontSize: 'xl' },
      },
    });
    expect(contracts.StoreSettingsSchema.safeParse(badFontSize).success).toBe(false);

    const corruptBlocks = contracts.mergeStoreSettingsWithDefaults({
      ...contracts.DEFAULT_STORE_SETTINGS,
      printTemplates: {
        official: { blocks: 'not-an-object' },
      },
    });
    expect(contracts.StoreSettingsSchema.safeParse(corruptBlocks).success).toBe(false);
  });

  it('validates QrCardSettingsSchema, migrates missing qrCard defaults, and resolves non-empty display labels', () => {
    expect(contracts).toHaveProperty('QrCardSettingsSchema');
    expect(contracts).toHaveProperty('QR_CARD_DEFAULTS');
    expect(contracts).toHaveProperty('resolveQrCardDisplay');

    const legacyWithoutQrCard = {
      ...contracts.DEFAULT_STORE_SETTINGS,
      qrCard: undefined,
    };
    const merged = contracts.mergeStoreSettingsWithDefaults(legacyWithoutQrCard);
    const parsed = contracts.StoreSettingsSchema.safeParse(merged);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.qrCard).toEqual(contracts.QR_CARD_DEFAULTS);
    }

    const partialMerged = contracts.mergeStoreSettingsWithDefaults({
      ...contracts.DEFAULT_STORE_SETTINGS,
      qrCard: {
        tableSubtitle: '  Quét nhanh gọi món  ',
        showLogo: true,
        showLinkText: false,
      },
    });
    const parsedPartial = contracts.StoreSettingsSchema.safeParse(partialMerged);
    expect(parsedPartial.success).toBe(true);
    if (parsedPartial.success) {
      expect(parsedPartial.data.qrCard.tableSubtitle).toBe('Quét nhanh gọi món');
      expect(parsedPartial.data.qrCard.showLogo).toBe(true);
      expect(parsedPartial.data.qrCard.showLinkText).toBe(false);
      expect(parsedPartial.data.qrCard.takeawayTitle).toBe(contracts.QR_CARD_DEFAULTS.takeawayTitle);
    }

    const badColor = contracts.StoreSettingsSchema.safeParse({
      ...contracts.DEFAULT_STORE_SETTINGS,
      qrCard: { ...contracts.QR_CARD_DEFAULTS, accentColor: 'red' },
    });
    expect(badColor.success).toBe(false);

    const resolved = contracts.resolveQrCardDisplay({
      storeName: 'Ăn Vặt Tran',
      qr: { storeName: '  Tran QR  ', subtitle: '', welcomeMessage: '', theme: 'system' },
      qrCard: {
        ...contracts.QR_CARD_DEFAULTS,
        tableHeadline: '   ',
        takeawayTitle: 'Mang Về Nhanh',
        accentColor: '#2563eb',
      },
    });
    expect(resolved.storeName).toBe('Tran QR');
    expect(resolved.tableHeadline).toBe(contracts.QR_CARD_DEFAULTS.tableHeadline);
    expect(resolved.takeawayTitle).toBe('Mang Về Nhanh');
    expect(resolved.accentColor).toBe('#2563EB');
  });

  it('migrates legacy thermal fontSize sm/md/lg to fontSizePt and validates 6..16 step 0.5 & priceCategoryIds', () => {
    const mergedLegacy = contracts.mergeStoreSettingsWithDefaults({
      ...contracts.DEFAULT_STORE_SETTINGS,
      printTemplates: {
        kitchen: { fontSize: 'sm' },
        kitchenCancel: { fontSize: 'lg' },
        provisional: { title: 'Tạm tính' },
      },
    });
    const parsedLegacy = contracts.StoreSettingsSchema.safeParse(mergedLegacy);
    expect(parsedLegacy.success).toBe(true);
    if (parsedLegacy.success) {
      expect(parsedLegacy.data.printTemplates.kitchen.fontSizePt).toBe(7);
      expect(parsedLegacy.data.printTemplates.kitchen.priceCategoryIds).toEqual([]);
      expect(parsedLegacy.data.printTemplates.kitchenCancel.fontSizePt).toBe(9.5);
      expect(parsedLegacy.data.printTemplates.provisional.fontSizePt).toBe(8);
    }

    expect(contracts.ThermalFontSizePtSchema.safeParse(6).success).toBe(true);
    expect(contracts.ThermalFontSizePtSchema.safeParse(8.5).success).toBe(true);
    expect(contracts.ThermalFontSizePtSchema.safeParse(16).success).toBe(true);
    expect(contracts.ThermalFontSizePtSchema.safeParse(5.5).success).toBe(false);
    expect(contracts.ThermalFontSizePtSchema.safeParse(16.5).success).toBe(false);
    expect(contracts.ThermalFontSizePtSchema.safeParse(7.3).success).toBe(false);
  });

  it('validates displayScale (80..150 step 5), printer calibration, cancel order response, and unique 6-digit bank BINs', () => {
    expect(contracts.DisplayScalePercentSchema.safeParse(80).success).toBe(true);
    expect(contracts.DisplayScalePercentSchema.safeParse(125).success).toBe(true);
    expect(contracts.DisplayScalePercentSchema.safeParse(150).success).toBe(true);
    expect(contracts.DisplayScalePercentSchema.safeParse(75).success).toBe(false);
    expect(contracts.DisplayScalePercentSchema.safeParse(155).success).toBe(false);
    expect(contracts.DisplayScalePercentSchema.safeParse(82).success).toBe(false);

    const withPerPath = contracts.StoreSettingsSchema.safeParse({
      ...contracts.DEFAULT_STORE_SETTINGS,
      displayScale: {
        globalPercent: 110,
        perPath: { '/pos': 125, '/menu': 95 },
        qrOrderPercent: 100,
      },
    });
    expect(withPerPath.success).toBe(true);

    const badPath = contracts.StoreSettingsSchema.safeParse({
      ...contracts.DEFAULT_STORE_SETTINGS,
      displayScale: {
        globalPercent: 100,
        perPath: { '/invalid-route': 110 },
        qrOrderPercent: 100,
      },
    });
    expect(badPath.success).toBe(false);

    const printerValid = contracts.ThermalPrinterDeviceConfigSchema.safeParse({
      ...contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
      leftMarginMm: 3,
      rightMarginMm: 2.5,
      feedLinesBeforeCut: 2,
    });
    expect(printerValid.success).toBe(true);
    // Legacy config without rightMarginMm defaults cleanly to 0
    const { rightMarginMm: _omittedRight, ...legacyPrinterConfig } =
      contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG;
    const legacyParsed = contracts.ThermalPrinterDeviceConfigSchema.safeParse(legacyPrinterConfig);
    expect(legacyParsed.success).toBe(true);
    if (legacyParsed.success) {
      expect(legacyParsed.data.rightMarginMm).toBe(0);
    }
    expect(
      contracts.ThermalPrinterDeviceConfigSchema.safeParse({
        ...contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
        leftMarginMm: 9,
      }).success,
    ).toBe(false);
    expect(
      contracts.ThermalPrinterDeviceConfigSchema.safeParse({
        ...contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
        rightMarginMm: 9,
      }).success,
    ).toBe(false);
    expect(
      contracts.ThermalPrinterDeviceConfigSchema.safeParse({
        ...contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
        rightMarginMm: -0.5,
      }).success,
    ).toBe(false);
    expect(
      contracts.ThermalPrinterDeviceConfigSchema.safeParse({
        ...contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
        feedLinesBeforeCut: 6,
      }).success,
    ).toBe(false);

    const cancelParsed = contracts.CancelOrderResponseSchema.safeParse({
      orderId: 10,
      status: 'VOIDED',
      tableId: 2,
      requireCancellationSlip: true,
      kitchenCancellationSlips: [
        { station: 'BEP_NAU', tableLabel: 'Bàn 02', itemName: 'Mì Cay', quantity: 1 },
      ],
    });
    expect(cancelParsed.success).toBe(true);

    const bins = contracts.VIETQR_BANKS.map((b) => b.bin);
    expect(new Set(bins).size).toBe(bins.length);
    for (const bank of contracts.VIETQR_BANKS) {
      expect(bank.bin).toMatch(/^\d{6}$/);
      expect(contracts.getVietQrBankBin(bank.code)).toBe(bank.bin);
    }
  });
});
