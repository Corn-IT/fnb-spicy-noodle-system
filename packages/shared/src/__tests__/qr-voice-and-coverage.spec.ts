import { describe, expect, it } from 'vitest';

import {
  AuditLogFilterQuerySchema,
  AuditLogScopedQuerySchema,
  AvatarUrlSchema,
  ChangePasswordSchema,
  CreateDiscountSchema,
  CreatePaymentAccountRequestSchema,
  DEFAULT_QR_REMINDER_CONFIG,
  DEFAULT_QR_VOICE_ENGINE_CONFIG,
  ErrorCodes,
  KitchenStationSchema,
  MESSAGE_CATALOG,
  PaymentAccountOrdersQuerySchema,
  ProductStationSchema,
  SocketRooms,
  UpdateInventoryImportSchema,
  UpdatePaymentAccountRequestSchema,
  UpdateProfileSchema,
  UserPermissionsSchema,
  calculateOrderDiscount,
  clampQrAutoCancelMinutes,
  clampQrMaxReminders,
  clampQrReminderConfig,
  clampQrReminderDelayMinutes,
  clampQrReminderIntervalSeconds,
  clampVoiceRate,
  clampVoiceVolume,
  extractQrMessages,
  findPaymentQrLimitHierarchyViolation,
  findVietQrBank,
  getVietQrBankShortName,
  interpolateMessageTemplate,
  isChunkLoadErrorMessage,
  isValidMessageKey,
  mergeStoreSettingsWithDefaults,
  parseQrReminderConfig,
  parseQrVoiceEngineConfig,
  resolveErrorCodeMessage,
  resolveHttpErrorKey,
  resolveStoreMessage,
  sanitizeStoreMessages,
  serializeQrReminderConfig,
  serializeQrVoiceEngineConfig,
  validateMessagePlaceholders,
  validateStoreMessagesMap,
} from '../index';

describe('qr-voice-config & shared edge coverage', () => {
  it('clamps, parses, and serializes QrVoiceEngineConfig and QrReminderConfig', () => {
    expect(clampVoiceRate(Number.NaN)).toBe(1);
    expect(clampVoiceRate(0.2)).toBe(0.75);
    expect(clampVoiceRate(2.5)).toBe(1.5);
    expect(clampVoiceVolume(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampVoiceVolume(0.05)).toBe(0.2);
    expect(clampVoiceVolume(1.5)).toBe(1);

    expect(parseQrVoiceEngineConfig(null)).toEqual(DEFAULT_QR_VOICE_ENGINE_CONFIG);
    expect(parseQrVoiceEngineConfig('unknown|invalidchunk|rate=1.2|volume=0.8|chime=0')).toEqual({
      voiceProfile: 'vi-female-standard',
      rate: 1.2,
      volume: 0.8,
      chimeEnabled: false,
    });
    expect(parseQrVoiceEngineConfig('vi-female-bright|chime=false')).toEqual({
      voiceProfile: 'vi-female-bright',
      rate: 1,
      volume: 1,
      chimeEnabled: false,
    });
    expect(
      serializeQrVoiceEngineConfig({
        voiceProfile: 'offline-mp3',
        rate: 1.15,
        volume: 0.9,
        chimeEnabled: false,
      }),
    ).toBe('offline-mp3|rate=1.15|volume=0.9|chime=0');
    expect(
      serializeQrVoiceEngineConfig({
        voiceProfile: 'vi-female-standard',
        rate: 1,
        volume: 1,
        chimeEnabled: true,
      }),
    ).toBe('vi-female-standard|rate=1|volume=1|chime=1');

    expect(clampQrReminderDelayMinutes('bad')).toBe(5);
    expect(clampQrReminderIntervalSeconds(5)).toBe(15);
    expect(clampQrMaxReminders(99)).toBe(5);
    expect(clampQrAutoCancelMinutes(1, 3)).toBe(3);
    expect(clampQrReminderConfig({ reminderEnabled: false, autoCancelMinutes: 1 }).autoCancelMinutes).toBe(2);

    expect(parseQrReminderConfig(undefined)).toEqual(DEFAULT_QR_REMINDER_CONFIG);
    const parsedReminder = parseQrReminderConfig(
      'badchunk|rem=0|remDelay=3|remInt=45|remMax=4|autoCancel=false|autoCancelMin=8',
    );
    expect(parsedReminder).toEqual({
      reminderEnabled: false,
      reminderDelayMinutes: 3,
      reminderIntervalSeconds: 45,
      maxReminders: 4,
      autoCancelEnabled: false,
      autoCancelMinutes: 8,
    });
    expect(serializeQrReminderConfig(parsedReminder)).toBe(
      'rem=0|remDelay=3|remInt=45|remMax=4|autoCancel=0|autoCancelMin=8',
    );
    expect(serializeQrReminderConfig(DEFAULT_QR_REMINDER_CONFIG)).toBe(
      'rem=1|remDelay=5|remInt=60|remMax=2|autoCancel=1|autoCancelMin=12',
    );
  });

  it('covers SocketRooms, stations, profile URLs, PaymentQR hierarchy, and VietQR helpers', () => {
    expect(SocketRooms.orderSession(42)).toBe('order_session_42');
    expect(SocketRooms.userAccount(7)).toBe('user_account_7');
    expect(SocketRooms.userSession('sid-1')).toBe('user_session_sid-1');

    expect(KitchenStationSchema.safeParse('BEP_NAU').success).toBe(true);
    expect(KitchenStationSchema.safeParse('BEP_NUONG').success).toBe(true);
    expect(KitchenStationSchema.safeParse('COMBO').success).toBe(false);
    expect(ProductStationSchema.safeParse('COMBO').success).toBe(true);
    expect(ProductStationSchema.safeParse('BEP_NUONG').success).toBe(true);

    expect(AvatarUrlSchema.safeParse('/api/v1/profile/avatar/1').success).toBe(true);
    expect(AvatarUrlSchema.safeParse('https://cdn.example.com/a.png').success).toBe(true);
    expect(AvatarUrlSchema.safeParse('ftp://example.com/a.png').success).toBe(false);
    expect(AvatarUrlSchema.safeParse('not a valid url').success).toBe(false);
    expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: 'Password@123',
        newPassword: 'Password@456',
        confirmPassword: 'Mismatch@456',
      }).success,
    ).toBe(false);

    expect(
      findPaymentQrLimitHierarchyViolation({
        dailyLimit: 500_000,
        monthlyLimit: 1_000_000,
        yearlyLimit: 800_000,
      })?.field,
    ).toBe('yearlyLimit');
    expect(
      findPaymentQrLimitHierarchyViolation({
        dailyLimit: 500_000,
        monthlyLimit: null,
        yearlyLimit: 400_000,
      })?.field,
    ).toBe('yearlyLimit');
    expect(
      CreatePaymentAccountRequestSchema.safeParse({
        label: 'TK Test',
        bankCode: 'VPB',
        accountNo: '12345678',
        accountName: 'NGUYEN VAN A',
        monthlyLimit: 1_000_000,
        yearlyLimit: 500_000,
      }).success,
    ).toBe(false);
    expect(UpdatePaymentAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(
      PaymentAccountOrdersQuerySchema.safeParse({
        fromDate: '2026-11-20',
        toDate: '2026-11-10',
      }).success,
    ).toBe(false);

    expect(findVietQrBank(' vpb ')?.code).toBe('VPB');
    expect(getVietQrBankShortName('unknown_bank')).toBe('UNKNOWN_BANK');
  });

  it('covers catalog, error helpers, audit log dates, inventory updates, and RBAC/settings fallbacks', () => {
    expect(isChunkLoadErrorMessage('ChunkLoadError: Loading chunk 4 failed')).toBe(true);
    expect(isChunkLoadErrorMessage('Normal error')).toBe(false);
    expect(resolveHttpErrorKey({ isChunkError: true })).toBe('CHUNK_LOAD_ERROR');
    expect(resolveHttpErrorKey({ code: 'RATE_LIMIT_EXCEEDED' })).toBe('429');
    expect(resolveHttpErrorKey({ code: 'SECURITY_BOT_BLOCKED' })).toBe('403');
    expect(resolveHttpErrorKey({ statusCode: 418 })).toBe('400');
    expect(resolveHttpErrorKey({ statusCode: 502 })).toBe('502');
    expect(resolveHttpErrorKey({ statusCode: 599 })).toBe('500');
    expect(resolveHttpErrorKey({ isRuntimeError: true })).toBe('RUNTIME_CRASH');
    expect(resolveHttpErrorKey({})).toBe('500');

    expect(interpolateMessageTemplate('Xin chào {name}', { name: null })).toBe('Xin chào ');
    expect(resolveStoreMessage(null, 'unknown.key', { a: 1 }).title).toBe('unknown.key');
    expect(
      resolveStoreMessage({ 'custom.k': { title: 'Chào', description: 'Mô tả' } }, 'custom.k'),
    ).toEqual({ title: 'Chào', description: 'Mô tả', isOverridden: true });
    expect(sanitizeStoreMessages(null)).toEqual({});
    expect(extractQrMessages(null)).toEqual({});
    expect(
      sanitizeStoreMessages({
        unknownKey: { title: 'x' },
        'qr.banner.welcome': { title: '   ', description: 'Mới' },
      }),
    ).toEqual({});
    expect(
      resolveErrorCodeMessage(null, ErrorCodes.AUTH_CREDENTIALS_INVALID, ''),
    ).toMatchObject({ isOverridden: false });
    expect(
      resolveErrorCodeMessage(null, 'NON_EXISTENT_CODE', 'Lỗi tuỳ chỉnh'),
    ).toEqual({ title: 'Lỗi tuỳ chỉnh', isOverridden: false });

    const withDescItem = MESSAGE_CATALOG.find((m) => m.defaultDescription !== undefined)!;
    const withoutDescErrorItem = MESSAGE_CATALOG.find(
      (m) => m.key.startsWith('error.') && m.defaultDescription === undefined,
    );
    expect(
      sanitizeStoreMessages({
        [withDescItem.key]: { title: 'Tiêu đề tuỳ chỉnh', description: 'Mô tả tuỳ chỉnh' },
      })[withDescItem.key],
    ).toEqual({ title: 'Tiêu đề tuỳ chỉnh', description: 'Mô tả tuỳ chỉnh' });
    expect(
      resolveStoreMessage(
        { [withDescItem.key]: { title: 'Tiêu đề A', description: 'Mô tả B' } },
        withDescItem.key,
      ),
    ).toEqual({ title: 'Tiêu đề A', description: 'Mô tả B', isOverridden: true });
    if (withoutDescErrorItem) {
      const code = withoutDescErrorItem.key.replace(/^error\./, '');
      expect(resolveErrorCodeMessage(null, code, '')).toMatchObject({ isOverridden: false });
      expect(resolveErrorCodeMessage(null, code, 'Custom server fallback')).toEqual({
        title: 'Custom server fallback',
        isOverridden: false,
      });
    }
    const qrKey = MESSAGE_CATALOG.find((m) => m.module === 'QR_CUSTOMER')!.key;
    const noVarItem = MESSAGE_CATALOG.find((m) => m.variables.length === 0)!;
    const staffKey = MESSAGE_CATALOG.find(
      (m) => m.module !== 'QR_CUSTOMER' && !m.key.startsWith('error.'),
    )!.key;
    expect(isValidMessageKey(qrKey)).toBe(true);
    expect(isValidMessageKey('missing.key')).toBe(false);
    expect(
      validateMessagePlaceholders(noVarItem.key, {
        title: 'a'.repeat(noVarItem.maxTitleLength + 5),
        description: '{invalidToken}',
      }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(validateStoreMessagesMap(null)).toEqual([]);
    expect(validateStoreMessagesMap({ [qrKey]: undefined as never })).toEqual([]);
    expect(
      extractQrMessages({
        unknownKey: { title: 'skip' },
        [qrKey]: { title: 'Hi' },
        [staffKey]: { title: 'Skip' },
      }),
    ).toEqual({ [qrKey]: { title: 'Hi' } });

    expect(
      calculateOrderDiscount([{ productId: 1, categoryId: 1, unitPrice: 35000, quantity: 1, kitchenStatus: 'NEW' }], null),
    ).toMatchObject({ subtotalAmount: 35000, discountAmount: 0, totalAmount: 35000 });
    expect(
      calculateOrderDiscount([{ productId: 1, categoryId: 1, unitPrice: 35000, quantity: 1, kitchenStatus: 'NEW' }], {
        scope: 'ORDER',
        valueType: 'FIXED',
        value: -1000,
      }).discountAmount,
    ).toBe(0);

    expect(
      CreateDiscountSchema.safeParse({
        code: 'TEST20',
        name: 'Test Conflict',
        scope: 'PRODUCT',
        valueType: 'FIXED',
        value: 10000,
        targetCategoryIds: [1, 1],
        targetProductIds: [],
        activeWeekdays: [1, 1],
        startsAt: '2026-11-22T12:00:00Z',
        endsAt: '2026-11-22T10:00:00Z',
        timeWindowStart: '09:00',
        timeWindowEnd: null,
      }).success,
    ).toBe(false);

    expect(
      AuditLogScopedQuerySchema.safeParse({ fromDate: '2026-11-20', toDate: '2026-11-10' }).success,
    ).toBe(false);
    expect(
      AuditLogFilterQuerySchema.safeParse({
        module: 'POS',
        fromDate: '2026-11-01',
        toDate: '2026-11-20',
      }).success,
    ).toBe(true);

    expect(
      UpdateInventoryImportSchema.safeParse({
        unitName: 'Kg',
        unitPrice: 10000,
        quantity: 2,
        paymentSource: 'CASH_DRAWER',
        importDate: '2026-11-22',
      }).success,
    ).toBe(false);
    expect(
      UpdateInventoryImportSchema.safeParse({
        ingredientName: 'Bò Mỹ',
        unitName: 'Kg',
        unitPrice: 9_999_999_999,
        quantity: 2,
        paymentSource: 'CASH_DRAWER',
        importDate: '2026-11-22',
      }).success,
    ).toBe(false);

    expect(mergeStoreSettingsWithDefaults('invalid')).toBe('invalid');
    expect(mergeStoreSettingsWithDefaults({ printTemplates: 'invalid' })).toMatchObject({
      printTemplates: 'invalid',
    });
    expect(mergeStoreSettingsWithDefaults({ printTemplates: { provisional: 'invalid' } })).toMatchObject({
      printTemplates: { provisional: 'invalid' },
    });

    const parsedLegacy = UserPermissionsSchema.parse({
      schedules: { view: true, update: true },
      cashflow: { view: true, create: true, config: false, export: true },
      rbac: { view: true, update: true },
      pos: { view: true, update: true },
      payroll: { view: true },
    });
    expect(parsedLegacy.schedules.create).toBe(true);
    expect(parsedLegacy.cashflow.compensate).toBe(true);
    expect(parsedLegacy.settings.update).toBe(true);
    expect(parsedLegacy.dashboard.export).toBe(true);
    expect(parsedLegacy.dashboard.viewProfit).toBe(true);
  });
});
