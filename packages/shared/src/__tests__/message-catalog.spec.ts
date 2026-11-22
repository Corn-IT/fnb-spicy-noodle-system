import { describe, expect, it } from 'vitest';

import {
  ErrorCodes,
  HTTP_ERROR_CATALOG,
  HTTP_ERROR_CATALOG_BY_KEY,
  MESSAGE_CATALOG,
  MESSAGE_CATALOG_BY_KEY,
  MESSAGE_MODULE_LABELS,
  MessageModuleValues,
  PublicStoreSettingsResponseSchema,
  StoreMessagesMapSchema,
  UpdateStoreSettingsSchema,
  DEFAULT_STORE_SETTINGS,
  extractPlaceholders,
  extractQrMessages,
  interpolateMessageTemplate,
  isChunkLoadErrorMessage,
  resolveErrorCodeMessage,
  resolveHttpErrorDefinition,
  resolveStoreMessage,
  sanitizeStoreMessages,
  validateMessagePlaceholders,
} from '../index';

describe('MESSAGE_CATALOG & Store Messages Contracts (Story 17)', () => {
  it('covers all 15 modules, unique keys, and all 35 ErrorCodes', () => {
    expect(MessageModuleValues).toHaveLength(15);
    const seen = new Set<string>();
    const coveredModules = new Set<string>();

    for (const item of MESSAGE_CATALOG) {
      expect(seen.has(item.key)).toBe(false);
      seen.add(item.key);
      coveredModules.add(item.module);
      expect(MESSAGE_MODULE_LABELS[item.module]).toBeTruthy();

      // Default templates must only reference variables declared in `item.variables`
      const declared = new Set(item.variables);
      for (const token of [
        ...extractPlaceholders(item.defaultTitle),
        ...(item.defaultDescription ? extractPlaceholders(item.defaultDescription) : []),
      ]) {
        expect(declared.has(token)).toBe(true);
      }
    }

    for (const mod of MessageModuleValues) {
      expect(coveredModules.has(mod)).toBe(true);
    }

    const allErrorCodes = Object.values(ErrorCodes);
    expect(allErrorCodes).toHaveLength(47);
    for (const code of allErrorCodes) {
      const entry = MESSAGE_CATALOG_BY_KEY.get(`error.${code}`);
      expect(entry).toBeDefined();
      expect(entry?.module).toBe('SYSTEM_ERROR');
    }

    expect(MESSAGE_CATALOG_BY_KEY.get('qr.banner.tableMoveNotice')?.defaultTitle).toBe(
      'Quý khách chuyển bàn vui lòng thông báo với lễ tân',
    );
  });

  it('rejects unknown keys, unknown {var} placeholders, and accepts valid subsets or plain strings', () => {
    expect(
      validateMessagePlaceholders('non.existent.key', { title: 'Test' }).length,
    ).toBeGreaterThan(0);

    const invalidPlaceholder = StoreMessagesMapSchema.safeParse({
      'pos.kitchen.splitSuccess': {
        title: 'Tách đơn {invalidVar}',
        description: 'Gửi {ticketCount} phiếu',
      },
    });
    expect(invalidPlaceholder.success).toBe(false);

    const subsetOk = StoreMessagesMapSchema.safeParse({
      'pos.kitchen.splitSuccess': {
        title: 'Đã gửi bếp Lượt {batchNo}!',
      },
      'qr.banner.tableMoveNotice': {
        title: 'Vui lòng báo thu ngân trước khi đổi bàn',
      },
    });
    expect(subsetOk.success).toBe(true);
  });

  it('resolves overrides, interpolates variables, and strips equal-to-default entries sparsely', () => {
    const resolvedDefault = resolveStoreMessage({}, 'qr.banner.tableMoveNotice');
    expect(resolvedDefault).toEqual({
      title: 'Quý khách chuyển bàn vui lòng thông báo với lễ tân',
      isOverridden: false,
    });

    const interpolated = resolveStoreMessage(
      {
        'pos.kitchen.splitSuccess': {
          title: 'Lượt #{batchNo} đã gửi!',
          description: 'Tổng {ticketCount} trạm bếp',
        },
      },
      'pos.kitchen.splitSuccess',
      { batchNo: 3, ticketCount: 2 },
    );
    expect(interpolated).toEqual({
      title: 'Lượt #3 đã gửi!',
      description: 'Tổng 2 trạm bếp',
      isOverridden: true,
    });

    expect(interpolateMessageTemplate('Xin chào {name} ({count})', { name: 'A', count: null })).toBe(
      'Xin chào A ()',
    );

    const sparse = sanitizeStoreMessages({
      'qr.banner.tableMoveNotice': {
        title: 'Quý khách chuyển bàn vui lòng thông báo với lễ tân',
      },
      'pos.order.approveQrSuccess': {
        title: '   ',
        description: 'Đơn đã chuyển sang trạng thái Đang phục vụ.',
      },
      'unknown.key': { title: 'Should ignore' },
      'qr.status.orderPaid': { title: '  Cảm ơn quý khách rất nhiều!  ' },
    });
    expect(sparse).toEqual({
      'qr.status.orderPaid': { title: 'Cảm ơn quý khách rất nhiều!' },
    });
  });

  it('extracts strictly QR customer and QR security messages for public payloads', () => {
    const qrOnly = extractQrMessages({
      'qr.banner.tableMoveNotice': { title: 'Thông báo bàn mới' },
      'error.QR_WIFI_REQUIRED': { title: 'Kết nối Wi-Fi quán trước nhé' },
      'pos.kitchen.splitSuccess': { title: 'Tách bếp nhanh' },
      'error.RBAC_PERMISSION_DENIED': { title: 'Cấm vào' },
    });
    expect(qrOnly).toEqual({
      'qr.banner.tableMoveNotice': { title: 'Thông báo bàn mới' },
      'error.QR_WIFI_REQUIRED': { title: 'Kết nối Wi-Fi quán trước nhé' },
    });
  });

  it('resolves ErrorCode messages cleanly for both un-overridden 403 split and customized errors', () => {
    const default403 = resolveErrorCodeMessage(
      {},
      ErrorCodes.RBAC_PERMISSION_DENIED,
      'Thiếu quyền settings.view',
    );
    expect(default403).toEqual({
      title: 'Không đủ quyền truy cập (403)',
      description: 'Thiếu quyền settings.view',
      isOverridden: false,
    });

    const custom403 = resolveErrorCodeMessage(
      {
        'error.RBAC_PERMISSION_DENIED': {
          title: 'Hạn chế quyền thao tác',
          description: 'Liên hệ quản lý để mở khoá quyền này.',
        },
      },
      ErrorCodes.RBAC_PERMISSION_DENIED,
      'Thiếu quyền settings.view',
    );
    expect(custom403).toEqual({
      title: 'Hạn chế quyền thao tác',
      description: 'Liên hệ quản lý để mở khoá quyền này.',
      isOverridden: true,
    });
  });

  it('integrates qrMessages and UpdateStoreSettingsSchema.messages cleanly', () => {
    const legacyPublic = PublicStoreSettingsResponseSchema.parse({
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: null,
      assets: { logo: null, favicon: null, qrLogo: null },
    });
    expect(legacyPublic.qrMessages).toBeUndefined();

    const validUpdate = UpdateStoreSettingsSchema.safeParse({
      ...DEFAULT_STORE_SETTINGS,
      expectedUpdatedAt: null,
      messages: {
        'qr.banner.tableMoveNotice': { title: 'Đổi bàn báo nhân viên' },
      },
    });
    expect(validUpdate.success).toBe(true);
  });

  it('registers all 18 HTTP_ERROR_CATALOG entries in SYSTEM_ERROR and maps status/codes accurately', () => {
    expect(HTTP_ERROR_CATALOG).toHaveLength(18);
    expect(HTTP_ERROR_CATALOG_BY_KEY.size).toBe(18);
    for (const httpItem of HTTP_ERROR_CATALOG) {
      const catEntry = MESSAGE_CATALOG_BY_KEY.get(httpItem.messageKey);
      expect(catEntry).toBeDefined();
      expect(catEntry?.module).toBe('SYSTEM_ERROR');
      expect(catEntry?.kind).toBe('error');
      expect(httpItem.guestTitle.length).toBeGreaterThan(0);
      expect(httpItem.recoveryHint.length).toBeGreaterThan(0);
    }

    expect(resolveHttpErrorDefinition({ statusCode: 404 }).key).toBe('404');
    expect(resolveHttpErrorDefinition({ statusCode: 502 }).key).toBe('502');
    expect(resolveHttpErrorDefinition({ statusCode: 429 }).key).toBe('429');
    expect(resolveHttpErrorDefinition({ statusCode: 418 }).key).toBe('400');
    expect(resolveHttpErrorDefinition({ statusCode: 599 }).key).toBe('500');
    expect(resolveHttpErrorDefinition({ code: 'NETWORK_ERROR', statusCode: 0 }).key).toBe('NETWORK_ERROR');
    expect(resolveHttpErrorDefinition({ isChunkError: true }).key).toBe('CHUNK_LOAD_ERROR');
    expect(resolveHttpErrorDefinition({ isRuntimeError: true }).key).toBe('RUNTIME_CRASH');
    expect(isChunkLoadErrorMessage('Failed to fetch dynamically imported module: /assets/pos.js')).toBe(true);
  });
});
