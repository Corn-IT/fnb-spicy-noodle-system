import { BadRequestException, ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import {
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  StoreAssetKind,
  type StoreSettings,
} from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { StoreSettingsService } from '../store-settings.service';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

function makeSettings(overrides: Partial<StoreSettings> = {}): StoreSettings {
  return {
    ...DEFAULT_STORE_SETTINGS,
    ...overrides,
    qr: { ...DEFAULT_STORE_SETTINGS.qr, ...(overrides.qr ?? {}) },
    qrCard: { ...DEFAULT_STORE_SETTINGS.qrCard, ...(overrides.qrCard ?? {}) },
    receipt: { ...DEFAULT_STORE_SETTINGS.receipt, ...(overrides.receipt ?? {}) },
  };
}

function createMockDeps(initialRows: Array<{
  category: string;
  normalizedName: string;
  name?: string;
  metadata: unknown;
  isActive?: boolean;
}> = []) {
  const rows = new Map(
    initialRows.map((row) => [
      `${row.category}:${row.normalizedName}`,
      {
        id: Math.floor(Math.random() * 1000) + 1,
        name: row.name ?? row.normalizedName,
        isActive: row.isActive ?? true,
        ...row,
      },
    ]),
  );

  const masterData = {
    findUnique: vi.fn(async ({ where }: { where: { category_normalizedName: { category: string; normalizedName: string } } }) => {
      const key = `${where.category_normalizedName.category}:${where.category_normalizedName.normalizedName}`;
      return rows.get(key) ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where: { category: string; normalizedName?: { in: string[] } } }) => {
      return Array.from(rows.values()).filter((row) => {
        if (row.category !== where.category) return false;
        if (where.normalizedName?.in && !where.normalizedName.in.includes(row.normalizedName)) return false;
        return true;
      });
    }),
    upsert: vi.fn(async ({
      where,
      update,
      create,
    }: {
      where: { category_normalizedName: { category: string; normalizedName: string } };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => {
      const key = `${where.category_normalizedName.category}:${where.category_normalizedName.normalizedName}`;
      const existing = rows.get(key);
      const next = existing
        ? { ...existing, ...update }
        : { id: rows.size + 1, ...create };
      rows.set(key, next as never);
      return next;
    }),
  };

  const prisma = {
    masterData,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ masterData })),
  };

  const auditLogService = {
    record: vi.fn(async () => undefined),
  };

  const posSocketGateway = {
    emitStoreSettingsUpdated: vi.fn(),
  };

  const service = new StoreSettingsService(
    prisma as never,
    auditLogService as never,
    posSocketGateway as never,
  );

  return { service, prisma, rows, auditLogService, posSocketGateway };
}

describe('StoreSettingsService', () => {
  it('returns default store settings and null assets when no config row exists (AC-14.2)', async () => {
    const { service } = createMockDeps();

    const result = await service.getPublicSettings();

    expect(result).toEqual({
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: null,
      assets: { logo: null, favicon: null, qrLogo: null },
      qrMessages: {},
    });
  });

  it('falls back to DEFAULT_STORE_SETTINGS with a warning when stored metadata is corrupted (AC-14.2)', async () => {
    const { service } = createMockDeps([
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_settings',
        metadata: { storeName: 999, brandColor: 'not-a-hex' },
      },
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_logo',
        metadata: {
          mime: 'image/png',
          base64: PNG_HEADER.toString('base64'),
          byteSize: PNG_HEADER.byteLength,
          updatedAt: '2026-11-15T00:00:00.000Z',
        },
        isActive: true,
      },
    ]);
    const warnSpy = vi.spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn');

    const result = await service.getPublicSettings();

    expect(result.storeName).toBe(DEFAULT_STORE_SETTINGS.storeName);
    expect(result.brandColor).toBe(DEFAULT_STORE_SETTINGS.brandColor);
    expect(result.assets.logo).toBe('2026-11-15T00:00:00.000Z');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('saves valid settings, strips unknown navLabels keys, emits socket event, and writes SETTINGS audit log (AC-14.7, AC-14.10, AC-14.13)', async () => {
    const { service, auditLogService, posSocketGateway } = createMockDeps();

    const saved = await service.updateSettings(
      {
        ...makeSettings({
          storeName: 'Mì Cay Seoul',
          brandColor: '#F97316',
          navLabels: {
            '/pos': 'Bán hàng',
            '/khong-ton-tai': 'Menu ảo',
          },
        }),
        expectedUpdatedAt: null,
      },
      7,
    );

    expect(saved.storeName).toBe('Mì Cay Seoul');
    expect(saved.brandColor).toBe('#F97316');
    expect(saved.navLabels).toEqual({ '/pos': 'Bán hàng' });
    expect(saved.updatedAt).toBeTruthy();

    expect(posSocketGateway.emitStoreSettingsUpdated).toHaveBeenCalledWith({
      version: saved.updatedAt,
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'SETTINGS',
        actor: 7,
      }),
    );
  });

  it('throws 409 STORE_SETTINGS_CONFLICT on stale expectedUpdatedAt (AC-14.6)', async () => {
    const { service } = createMockDeps([
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_settings',
        metadata: {
          ...DEFAULT_STORE_SETTINGS,
          updatedAt: '2026-11-15T10:00:00.000Z',
        },
      },
    ]);

    await expect(
      service.updateSettings(
        {
          ...makeSettings({ storeName: 'Updated By B' }),
          expectedUpdatedAt: '2026-11-15T09:00:00.000Z',
        },
        2,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCodes.STORE_SETTINGS_CONFLICT },
    });

    await expect(
      service.updateSettings(
        {
          ...makeSettings({ storeName: 'Updated By B' }),
          expectedUpdatedAt: null,
        },
        2,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates image magic bytes (blocking SVG and spoofed text), enforces decoded byte caps, stores asset, and logs without base64 (AC-14.3, AC-14.13)', async () => {
    const { service, auditLogService, posSocketGateway } = createMockDeps();

    // 1. SVG payload pretending to be PNG
    const svgBase64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    await expect(
      service.uploadAsset(StoreAssetKind.LOGO, { mime: 'image/png', base64: svgBase64 }, 1),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCodes.STORE_ASSET_INVALID_TYPE },
    });

    // 2. Plain text pretending to be WebP
    const textBase64 = Buffer.from('not really a webp file').toString('base64');
    await expect(
      service.uploadAsset(StoreAssetKind.LOGO, { mime: 'image/webp', base64: textBase64 }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 3. Oversized logo (> 512KB) -> 413
    const oversizedLogo = Buffer.concat([PNG_HEADER, Buffer.alloc(513 * 1024)]);
    await expect(
      service.uploadAsset(StoreAssetKind.LOGO, { mime: 'image/png', base64: oversizedLogo.toString('base64') }, 1),
    ).rejects.toMatchObject({
      status: 413,
      response: { code: ErrorCodes.STORE_ASSET_TOO_LARGE },
    });

    // 4. Oversized favicon (> 128KB) -> 413
    const oversizedFavicon = Buffer.concat([PNG_HEADER, Buffer.alloc(129 * 1024)]);
    await expect(
      service.uploadAsset(StoreAssetKind.FAVICON, { mime: 'image/png', base64: oversizedFavicon.toString('base64') }, 1),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    // 5. Valid WebP qr-logo, JPEG logo, and PNG favicon
    const webpRes = await service.uploadAsset(
      StoreAssetKind.QR_LOGO,
      { mime: 'image/webp', base64: WEBP_HEADER.toString('base64') },
      1,
    );
    expect(webpRes.assets.qrLogo).toBeTruthy();

    const jpegRes = await service.uploadAsset(
      StoreAssetKind.LOGO,
      { mime: 'image/jpeg', base64: JPEG_HEADER.toString('base64') },
      1,
    );
    expect(jpegRes.assets.logo).toBeTruthy();

    const favRes = await service.uploadAsset(
      StoreAssetKind.FAVICON,
      { mime: 'image/png', base64: PNG_HEADER.toString('base64') },
      1,
    );
    expect(favRes.assets.favicon).toBeTruthy();

    expect(posSocketGateway.emitStoreSettingsUpdated).toHaveBeenCalledTimes(3);
    const auditCall = auditLogService.record.mock.calls.at(-1)?.[0] as { module: string; metadata?: Record<string, unknown> };
    expect(auditCall.module).toBe('SETTINGS');
    expect(JSON.stringify(auditCall)).not.toContain(PNG_HEADER.toString('base64'));
  });

  it('serves binary asset when active and throws 404 after deletion or when absent (AC-14.4)', async () => {
    const { service, auditLogService } = createMockDeps();

    await expect(service.getAssetBinary(StoreAssetKind.LOGO)).rejects.toBeInstanceOf(NotFoundException);

    await service.uploadAsset(StoreAssetKind.LOGO, { mime: 'image/png', base64: PNG_HEADER.toString('base64') }, 1);
    const binary = await service.getAssetBinary(StoreAssetKind.LOGO);
    expect(binary.mime).toBe('image/png');
    expect(binary.buffer.equals(PNG_HEADER)).toBe(true);

    const afterDelete = await service.deleteAsset(StoreAssetKind.LOGO, 1);
    expect(afterDelete.assets.logo).toBeNull();
    expect(auditLogService.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ module: 'SETTINGS', action: 'Xoá ảnh cửa hàng' }),
    );
    await expect(service.getAssetBinary(StoreAssetKind.LOGO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('migrates legacy v1 metadata cleanly, sanitizes pageHeaders, and still warns on corrupted metadata (AC-15.1, AC-15.8, AC-15.9)', async () => {
    const legacyUpdatedAt = '2026-11-15T06:00:00.000Z';
    const { service, auditLogService, posSocketGateway } = createMockDeps([
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_settings',
        metadata: {
          storeName: 'Mì Cay Tràng An',
          subtitle: 'Bản v1',
          description: 'Mô tả v1',
          brandColor: '#0F766E',
          defaultTheme: 'dark',
          qr: { storeName: 'QR v1', subtitle: '', welcomeMessage: 'Hello', theme: 'light' },
          receipt: { printName: 'TRANG AN', address: 'HN', phone: '0909', footerNote: 'Thanks', showLogo: true },
          navLabels: { '/pos': 'POS v1' },
          updatedAt: legacyUpdatedAt,
        },
      },
    ]);

    const legacyLoaded = await service.getPublicSettings();
    expect(legacyLoaded.storeName).toBe('Mì Cay Tràng An');
    expect(legacyLoaded.brandColor).toBe('#0F766E');
    expect(legacyLoaded.primaryTextColor).toEqual({ light: null, dark: null });
    expect(legacyLoaded.accentTextColor).toEqual({ light: null, dark: null });
    expect(legacyLoaded.priceColor).toEqual({ light: null, dark: null });
    expect(legacyLoaded.navGroupLabels).toEqual({});
    expect(legacyLoaded.navGroupOrder).toEqual([]);
    expect(legacyLoaded.navOrder).toEqual([]);
    expect(legacyLoaded.pageHeaders).toEqual({});

    const updated = await service.updateSettings(
      {
        ...makeSettings({
          storeName: 'Mì Cay Tràng An',
          primaryTextColor: { light: '#FFFFFF', dark: '#FFFFFF' },
          accentTextColor: { light: '#2563EB', dark: '#60A5FA' },
          priceColor: { light: '#0D9488', dark: null },
          navGroupLabels: {
            sales: '  Bán hàng & Quầy  ',
            rogue: 'Should drop',
          },
          navGroupOrder: [' finance ', 'sales', 'rogue', 'finance'],
          navOrder: [' /discounts ', '/pos', '/rogue', '/discounts'],
          pageHeaders: {
            '/settings': { title: '  Thiết lập Quán  ', subtitle: '  Mô tả mới  ' },
            '/pos': { title: '   ', subtitle: '   ' },
            '/hacked-route': { title: 'X', subtitle: 'Y' },
          },
        }),
        expectedUpdatedAt: legacyUpdatedAt,
      },
      7,
    );

    expect(updated.primaryTextColor).toEqual({ light: '#FFFFFF', dark: '#FFFFFF' });
    expect(updated.accentTextColor).toEqual({ light: '#2563EB', dark: '#60A5FA' });
    expect(updated.priceColor).toEqual({ light: '#0D9488', dark: null });
    expect(updated.navGroupLabels).toEqual({ sales: 'Bán hàng & Quầy' });
    expect(updated.navGroupOrder).toEqual(['finance', 'sales']);
    expect(updated.navOrder).toEqual(['/discounts', '/pos']);
    expect(updated.pageHeaders).toEqual({
      '/settings': { title: 'Thiết lập Quán', subtitle: 'Mô tả mới' },
    });
    expect(posSocketGateway.emitStoreSettingsUpdated).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ module: 'SETTINGS', actor: 7 }),
    );

    const corruptDeps = createMockDeps([
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_settings',
        metadata: {
          storeName: 'Corrupt',
          brandColor: 'not-a-hex',
          updatedAt: legacyUpdatedAt,
        },
      },
    ]);
    const warnSpy = vi.spyOn(
      (corruptDeps.service as unknown as { logger: { warn: (msg: string) => void } }).logger,
      'warn',
    );
    const corruptLoaded = await corruptDeps.service.getPublicSettings();
    expect(corruptLoaded.brandColor).toBe(DEFAULT_STORE_SETTINGS.brandColor);
    expect(corruptLoaded.storeName).toBe(DEFAULT_STORE_SETTINGS.storeName);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('migrates v1.5 metadata missing printTemplates and persists custom 5-template settings (Story 16)', async () => {
    const v15UpdatedAt = '2026-11-15T07:00:00.000Z';
    const { service, auditLogService, posSocketGateway } = createMockDeps([
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_settings',
        metadata: {
          ...makeSettings({
            storeName: 'Mì Cay Hoàng Kim',
            accentTextColor: { light: '#2563EB', dark: null },
          }),
          printTemplates: undefined,
          updatedAt: v15UpdatedAt,
        },
      },
    ]);

    const loaded = await service.getPublicSettings();
    expect(loaded.printTemplates).toEqual(DEFAULT_STORE_SETTINGS.printTemplates);
    expect(loaded.printTemplates.provisional.blocks.discountLine).toBe(false);

    const updated = await service.updateSettings(
      {
        ...makeSettings({
          storeName: 'Mì Cay Hoàng Kim',
          printTemplates: {
            ...DEFAULT_STORE_SETTINGS.printTemplates,
            provisional: {
              ...DEFAULT_STORE_SETTINGS.printTemplates.provisional,
              title: '  PHIẾU TÍNH TẠM  ',
              blocks: {
                ...DEFAULT_STORE_SETTINGS.printTemplates.provisional.blocks,
                discountLine: true,
                bankInfo: false,
              },
            },
            official: {
              ...DEFAULT_STORE_SETTINGS.printTemplates.official,
              blocks: {
                ...DEFAULT_STORE_SETTINGS.printTemplates.official.blocks,
                cashier: false,
                paymentBreakdown: false,
              },
            },
            kitchen: {
              ...DEFAULT_STORE_SETTINGS.printTemplates.kitchen,
              title: 'BẾP CHUẨN BỊ',
              footerNote: 'Ưu tiên khách bàn',
              fontSizePt: 10,
              blocks: {
                ...DEFAULT_STORE_SETTINGS.printTemplates.kitchen.blocks,
                stationLogo: false,
              },
            },
            kitchenCancel: {
              ...DEFAULT_STORE_SETTINGS.printTemplates.kitchenCancel,
              title: 'BÁO HUỶ GẤP',
              fontSizePt: 7,
              blocks: { time: false, reason: true },
            },
            tableTransfer: {
              ...DEFAULT_STORE_SETTINGS.printTemplates.tableTransfer,
              footerNote: 'Đưa từ {fromTable} qua {toTable} gấp!',
              blocks: { time: true, cashier: true },
            },
          },
        }),
        expectedUpdatedAt: v15UpdatedAt,
      },
      9,
    );

    expect(updated.printTemplates.provisional.title).toBe('PHIẾU TÍNH TẠM');
    expect(updated.printTemplates.provisional.blocks.discountLine).toBe(true);
    expect(updated.printTemplates.official.blocks.cashier).toBe(false);
    expect(updated.printTemplates.kitchen.fontSizePt).toBe(10);
    expect(updated.printTemplates.kitchenCancel.fontSizePt).toBe(7);
    expect(updated.printTemplates.tableTransfer.footerNote).toBe(
      'Đưa từ {fromTable} qua {toTable} gấp!',
    );
    expect(posSocketGateway.emitStoreSettingsUpdated).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ module: 'SETTINGS', actor: 9 }),
    );
  });

  it('stores sparse store_messages in SYSTEM_CONFIG, validates {var} placeholders, preserves messages on partial PUT, and isolates qrMessages cleanly (Story 17)', async () => {
    const { service, rows, auditLogService, posSocketGateway } = createMockDeps();

    // 1. Reject invalid placeholder variable
    await expect(
      service.updateSettings(
        {
          ...makeSettings(),
          expectedUpdatedAt: null,
          messages: {
            'pos.kitchen.splitSuccess': {
              title: 'Gửi bếp {unknownToken}',
            },
          },
        },
        1,
      ),
    ).rejects.toThrow();

    // 2. Save custom QR, POS, and RBAC ErrorCode messages; default-equal entry should be stripped (sparse)
    const saved = await service.updateSettings(
      {
        ...makeSettings({ storeName: 'Quán Mì Cay v2' }),
        expectedUpdatedAt: null,
        messages: {
          'qr.banner.tableMoveNotice': {
            title: 'Đổi bàn nhớ báo thu ngân nhé!',
          },
          'error.QR_WIFI_REQUIRED': {
            title: 'Vui lòng bắt Wi-Fi quán trước khi quét QR.',
          },
          'pos.kitchen.splitSuccess': {
            title: 'Gửi bếp Lượt #{batchNo}',
            description: 'Tổng {ticketCount} phiếu',
          },
          'error.RBAC_PERMISSION_DENIED': {
            title: 'Hạn chế quyền truy cập',
            description: 'Liên hệ quản lý để mở khoá quyền.',
          },
          // Equal to default -> should NOT be persisted in sparse map
          'qr.status.orderVoided': {
            title: 'Đơn hàng đã bị huỷ',
          },
        },
      },
      5,
    );

    // Public settings must contain ONLY qrMessages (qr.* and error.QR_*), NEVER pos.* or error.RBAC_*
    expect(saved.qrMessages).toEqual({
      'qr.banner.tableMoveNotice': { title: 'Đổi bàn nhớ báo thu ngân nhé!' },
      'error.QR_WIFI_REQUIRED': { title: 'Vui lòng bắt Wi-Fi quán trước khi quét QR.' },
    });

    // Authenticated getMessages returns all 4 sparse customized messages (excluding unchanged orderVoided)
    const allMessages = await service.getMessages();
    expect(Object.keys(allMessages.messages).sort()).toEqual([
      'error.QR_WIFI_REQUIRED',
      'error.RBAC_PERMISSION_DENIED',
      'pos.kitchen.splitSuccess',
      'qr.banner.tableMoveNotice',
    ]);
    expect(allMessages.updatedAt).toBeTruthy();

    // Check sparse persistence in master_data row
    const msgRow = rows.get('SYSTEM_CONFIG:store_messages');
    expect(msgRow).toBeDefined();
    expect(auditLogService.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        module: 'SETTINGS',
        actor: 5,
        metadata: expect.objectContaining({
          changedMessageKeys: [
            'error.QR_WIFI_REQUIRED',
            'error.RBAC_PERMISSION_DENIED',
            'pos.kitchen.splitSuccess',
            'qr.banner.tableMoveNotice',
          ],
        }),
      }),
    );

    // 3. Subsequent PUT without `messages` field must preserve existing customized store_messages
    const partialUpdate = await service.updateSettings(
      {
        ...makeSettings({ storeName: 'Quán Mì Cay v2.1' }),
        expectedUpdatedAt: saved.updatedAt,
      },
      5,
    );
    expect(partialUpdate.qrMessages).toEqual(saved.qrMessages);
    expect((await service.getMessages()).messages).toEqual(allMessages.messages);
    expect(posSocketGateway.emitStoreSettingsUpdated).toHaveBeenCalledTimes(2);
  });

  it('hydrates legacy metadata missing qrCard and normalizes saved qrCard settings', async () => {
    const updatedAt = '2026-11-22T09:00:00.000Z';
    const { service, posSocketGateway } = createMockDeps([
      {
        category: 'SYSTEM_CONFIG',
        normalizedName: 'store_settings',
        metadata: {
          ...makeSettings({ storeName: 'Mì Cay Sasin' }),
          qrCard: undefined,
          updatedAt,
        },
      },
    ]);

    const loaded = await service.getPublicSettings();
    expect(loaded.qrCard).toEqual(DEFAULT_STORE_SETTINGS.qrCard);

    const saved = await service.updateSettings(
      {
        ...makeSettings({
          storeName: 'Mì Cay Sasin',
          qrCard: {
            ...DEFAULT_STORE_SETTINGS.qrCard,
            tableSubtitle: '  Quét mã đặt món ngay tại bàn  ',
            takeawayTitle: 'Mang Về Nhanh',
            accentColor: '#059669',
            showLogo: true,
            showLinkText: false,
          },
        }),
        expectedUpdatedAt: loaded.updatedAt,
      },
      1,
    );

    expect(saved.qrCard.tableSubtitle).toBe('Quét mã đặt món ngay tại bàn');
    expect(saved.qrCard.takeawayTitle).toBe('Mang Về Nhanh');
    expect(saved.qrCard.accentColor).toBe('#059669');
    expect(saved.qrCard.showLogo).toBe(true);
    expect(saved.qrCard.showLinkText).toBe(false);
    expect(posSocketGateway.emitStoreSettingsUpdated).toHaveBeenCalledTimes(1);
  });
});
