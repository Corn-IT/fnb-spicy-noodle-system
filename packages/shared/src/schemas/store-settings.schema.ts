import { z } from 'zod';
import {
  type StoreMessagesMap,
  validateStoreMessagesMap,
} from '../constants/message-catalog';
import { IsoDateTimeSchema } from './common.schema';

const PlainText = (max: number) => z.string().trim().max(max);
const HexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu phải có dạng #RRGGBB');
const ThemeModeSchema = z.enum(['light', 'dark']);
const QrThemeModeSchema = z.enum(['light', 'dark', 'system']);
const NavPathSchema = z.string().trim().startsWith('/', 'Đường dẫn menu phải bắt đầu bằng /').max(64);
const NavGroupKeySchema = z.string().trim().min(1, 'Mã nhóm menu không được để trống').max(32);

export const ColorOverrideSchema = z
  .object({
    light: HexColorSchema.nullable(),
    dark: HexColorSchema.nullable(),
  })
  .strict();

export type ColorOverride = z.infer<typeof ColorOverrideSchema>;

export const PageHeaderOverrideSchema = z
  .object({
    title: PlainText(80),
    subtitle: PlainText(200),
  })
  .strict();

export type PageHeaderOverride = z.infer<typeof PageHeaderOverrideSchema>;

export const ThermalFontSizeSchema = z.enum(['sm', 'md', 'lg']);
export type ThermalFontSize = z.infer<typeof ThermalFontSizeSchema>;

export const PrintTemplateKeySchema = z.enum([
  'provisional',
  'official',
  'kitchen',
  'kitchenCancel',
  'tableTransfer',
]);
export type PrintTemplateKey = z.infer<typeof PrintTemplateKeySchema>;

export const PrintTemplatesSchema = z
  .object({
    provisional: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        blocks: z
          .object({
            logo: z.boolean(),
            address: z.boolean(),
            phone: z.boolean(),
            orderCode: z.boolean(),
            cashier: z.boolean(),
            itemModifiers: z.boolean(),
            itemNotes: z.boolean(),
            discountLine: z.boolean(),
            bankInfo: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    official: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        blocks: z
          .object({
            logo: z.boolean(),
            address: z.boolean(),
            phone: z.boolean(),
            orderCode: z.boolean(),
            cashier: z.boolean(),
            paymentBreakdown: z.boolean(),
            itemModifiers: z.boolean(),
            itemNotes: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    kitchen: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        fontSize: ThermalFontSizeSchema,
        blocks: z
          .object({
            stationLogo: z.boolean(),
            orderCode: z.boolean(),
            time: z.boolean(),
            itemNotes: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    kitchenCancel: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        fontSize: ThermalFontSizeSchema,
        blocks: z
          .object({
            time: z.boolean(),
            reason: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    tableTransfer: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        blocks: z
          .object({
            time: z.boolean(),
            cashier: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type PrintTemplates = z.infer<typeof PrintTemplatesSchema>;

export const PRINT_TEMPLATE_DEFAULTS = {
  provisional: {
    title: 'PHIẾU TẠM TÍNH',
  },
  official: {
    title: 'HOÁ ĐƠN THANH TOÁN (PAID)',
    footerNoteFallback: 'CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!',
  },
  kitchenCancel: {
    title: 'PHIẾU BÁO HUỶ MÓN',
    footerNote: 'Vui lòng ngưng chế biến món vừa báo huỷ trên!',
  },
  tableTransfer: {
    title: '⚠️ THÔNG BÁO ĐỔI BÀN ⚠️',
    footerNote: 'LƯU Ý: Các món đang chế biến của {fromTable} vui lòng bưng qua {toTable}!',
  },
} as const;

export const DEFAULT_PRINT_TEMPLATES: PrintTemplates = {
  provisional: {
    title: '',
    footerNote: '',
    blocks: {
      logo: true,
      address: true,
      phone: true,
      orderCode: true,
      cashier: true,
      itemModifiers: true,
      itemNotes: true,
      discountLine: false,
      bankInfo: true,
    },
  },
  official: {
    title: '',
    footerNote: '',
    blocks: {
      logo: true,
      address: true,
      phone: true,
      orderCode: true,
      cashier: true,
      paymentBreakdown: true,
      itemModifiers: true,
      itemNotes: true,
    },
  },
  kitchen: {
    title: '',
    footerNote: '',
    fontSize: 'md',
    blocks: {
      stationLogo: true,
      orderCode: true,
      time: true,
      itemNotes: true,
    },
  },
  kitchenCancel: {
    title: '',
    footerNote: '',
    fontSize: 'md',
    blocks: {
      time: true,
      reason: true,
    },
  },
  tableTransfer: {
    title: '',
    footerNote: '',
    blocks: {
      time: true,
      cashier: true,
    },
  },
};

export function cloneDefaultPrintTemplates(): PrintTemplates {
  return {
    provisional: {
      ...DEFAULT_PRINT_TEMPLATES.provisional,
      blocks: { ...DEFAULT_PRINT_TEMPLATES.provisional.blocks },
    },
    official: {
      ...DEFAULT_PRINT_TEMPLATES.official,
      blocks: { ...DEFAULT_PRINT_TEMPLATES.official.blocks },
    },
    kitchen: {
      ...DEFAULT_PRINT_TEMPLATES.kitchen,
      blocks: { ...DEFAULT_PRINT_TEMPLATES.kitchen.blocks },
    },
    kitchenCancel: {
      ...DEFAULT_PRINT_TEMPLATES.kitchenCancel,
      blocks: { ...DEFAULT_PRINT_TEMPLATES.kitchenCancel.blocks },
    },
    tableTransfer: {
      ...DEFAULT_PRINT_TEMPLATES.tableTransfer,
      blocks: { ...DEFAULT_PRINT_TEMPLATES.tableTransfer.blocks },
    },
  };
}

export const StoreAssetKind = {
  LOGO: 'logo',
  FAVICON: 'favicon',
  QR_LOGO: 'qr-logo',
} as const;

export type StoreAssetKind = (typeof StoreAssetKind)[keyof typeof StoreAssetKind];
export const StoreAssetKindSchema = z.enum([StoreAssetKind.LOGO, StoreAssetKind.FAVICON, StoreAssetKind.QR_LOGO]);

export const ALLOWED_STORE_NAV_PATHS = [
  '/dashboard',
  '/pos',
  '/menu',
  '/discounts',
  '/invoices',
  '/cashflow',
  '/payment-qr',
  '/inventory',
  '/employees',
  '/schedules',
  '/payroll',
  '/master-data',
  '/rbac',
  '/settings',
  '/profile',
] as const;

export type AllowedStoreNavPath = (typeof ALLOWED_STORE_NAV_PATHS)[number];
const ALLOWED_STORE_NAV_PATH_SET = new Set<string>(ALLOWED_STORE_NAV_PATHS);

export const ALLOWED_STORE_NAV_GROUP_KEYS = [
  'sales',
  'finance',
  'hr',
  'system',
] as const;

export type AllowedStoreNavGroupKey = (typeof ALLOWED_STORE_NAV_GROUP_KEYS)[number];
const ALLOWED_STORE_NAV_GROUP_KEY_SET = new Set<string>(ALLOWED_STORE_NAV_GROUP_KEYS);

export const QrCardSettingsSchema = z
  .object({
    tableHeadline: PlainText(60),
    tableSubtitle: PlainText(120),
    takeawayTitle: PlainText(60),
    takeawayHeadline: PlainText(60),
    takeawaySubtitle: PlainText(120),
    footerText: PlainText(120),
    accentColor: HexColorSchema,
    showLogo: z.boolean(),
    showLinkText: z.boolean(),
  })
  .strict();

export type QrCardSettings = z.infer<typeof QrCardSettingsSchema>;

export const QR_CARD_DEFAULTS: QrCardSettings = {
  tableHeadline: 'QUÉT MÃ QR ĐẶT MÓN TẠI BÀN',
  tableSubtitle: 'Quét mã QR để gọi món tại bàn',
  takeawayTitle: 'Đơn Mang Về',
  takeawayHeadline: 'QUÉT MÃ QR ĐẶT MÓN MANG VỀ',
  takeawaySubtitle: 'Quét mã QR để tự đặt món Mang về',
  footerText: 'Mở Camera hoặc truy cập nhanh:',
  accentColor: '#EA580C',
  showLogo: false,
  showLinkText: true,
};

export function cloneDefaultQrCardSettings(): QrCardSettings {
  return { ...QR_CARD_DEFAULTS };
}

export function normalizeQrCardSettings(source: QrCardSettings): QrCardSettings {
  return {
    tableHeadline: source.tableHeadline.trim(),
    tableSubtitle: source.tableSubtitle.trim(),
    takeawayTitle: source.takeawayTitle.trim(),
    takeawayHeadline: source.takeawayHeadline.trim(),
    takeawaySubtitle: source.takeawaySubtitle.trim(),
    footerText: source.footerText.trim(),
    accentColor: source.accentColor.trim().toUpperCase(),
    showLogo: source.showLogo,
    showLinkText: source.showLinkText,
  };
}

export interface ResolvedQrCardDisplay {
  storeName: string;
  tableHeadline: string;
  tableSubtitle: string;
  takeawayTitle: string;
  takeawayHeadline: string;
  takeawaySubtitle: string;
  footerText: string;
  accentColor: string;
  showLogo: boolean;
  showLinkText: boolean;
}

export const StoreSettingsSchema = z.object({
  storeName: PlainText(60).min(1, 'Tên cửa hàng không được để trống'),
  subtitle: PlainText(80),
  description: PlainText(300),
  brandColor: HexColorSchema,
  primaryTextColor: ColorOverrideSchema,
  accentTextColor: ColorOverrideSchema,
  priceColor: ColorOverrideSchema,
  defaultTheme: ThemeModeSchema,
  qr: z.object({
    storeName: PlainText(60),
    subtitle: PlainText(80),
    welcomeMessage: PlainText(160),
    theme: QrThemeModeSchema,
  }).strict(),
  qrCard: QrCardSettingsSchema,
  receipt: z.object({
    printName: PlainText(60),
    address: PlainText(160),
    phone: PlainText(20),
    footerNote: PlainText(200),
    showLogo: z.boolean(),
  }).strict(),
  navLabels: z.record(
    NavPathSchema,
    PlainText(40).min(1, 'Tên menu không được để trống'),
  ),
  navGroupLabels: z.record(
    NavGroupKeySchema,
    PlainText(40).min(1, 'Tên nhóm menu không được để trống'),
  ),
  navGroupOrder: z.array(NavGroupKeySchema).max(16),
  navOrder: z.array(NavPathSchema).max(64),
  pageHeaders: z.record(NavPathSchema, PageHeaderOverrideSchema),
  printTemplates: PrintTemplatesSchema,
}).strict();

export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

export const StoreSettingsAssetsSchema = z.object({
  logo: z.string().nullable(),
  favicon: z.string().nullable(),
  qrLogo: z.string().nullable(),
}).strict();

export type StoreSettingsAssets = z.infer<typeof StoreSettingsAssetsSchema>;

export const StoreMessageOverrideSchema = z.object({
  title: PlainText(200).optional(),
  description: PlainText(500).optional(),
}).strict();

export const StoreMessagesMapSchema = z
  .record(z.string(), StoreMessageOverrideSchema)
  .superRefine((map, ctx) => {
    for (const issue of validateStoreMessagesMap(map as StoreMessagesMap)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.field ? [issue.key, issue.field] : [issue.key],
        message: issue.message,
      });
    }
  });

export const StoreMessagesResponseSchema = z.object({
  messages: StoreMessagesMapSchema,
  updatedAt: IsoDateTimeSchema.nullable(),
}).strict();

export type StoreMessagesResponse = z.infer<typeof StoreMessagesResponseSchema>;

export const PublicStoreSettingsResponseSchema = StoreSettingsSchema.extend({
  updatedAt: IsoDateTimeSchema.nullable(),
  assets: StoreSettingsAssetsSchema,
  qrMessages: StoreMessagesMapSchema.optional(),
}).strict();

export type PublicStoreSettingsResponse = z.infer<typeof PublicStoreSettingsResponseSchema>;

export const UpdateStoreSettingsSchema = StoreSettingsSchema.extend({
  expectedUpdatedAt: IsoDateTimeSchema.nullable(),
  messages: StoreMessagesMapSchema.optional(),
}).strict();

export type UpdateStoreSettingsInput = z.infer<typeof UpdateStoreSettingsSchema>;

export const UploadStoreAssetSchema = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  base64: z.string().trim().min(1),
}).strict();

export type UploadStoreAssetInput = z.infer<typeof UploadStoreAssetSchema>;

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'Ăn Vặt Tran',
  subtitle: 'Hệ thống vận hành',
  description: 'Đăng nhập vào hệ thống Bán hàng & Quản trị Vận hành',
  brandColor: '#E11D48',
  primaryTextColor: { light: null, dark: null },
  accentTextColor: { light: null, dark: null },
  priceColor: { light: null, dark: null },
  defaultTheme: 'light',
  qr: {
    storeName: '',
    subtitle: '',
    welcomeMessage: '',
    theme: 'system',
  },
  qrCard: cloneDefaultQrCardSettings(),
  receipt: {
    printName: 'QUÁN ĂN VẶT TRAN',
    address: 'ĐC: Lạng Giang - Bắc Ninh',
    phone: '0967622716',
    footerNote: 'CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!',
    showLogo: false,
  },
  navLabels: {},
  navGroupLabels: {},
  navGroupOrder: [],
  navOrder: [],
  pageHeaders: {},
  printTemplates: cloneDefaultPrintTemplates(),
};

export const NEUTRAL_STORE_SETTINGS: PublicStoreSettingsResponse = {
  storeName: 'POS',
  subtitle: '',
  description: '',
  brandColor: '#E11D48',
  primaryTextColor: { light: null, dark: null },
  accentTextColor: { light: null, dark: null },
  priceColor: { light: null, dark: null },
  defaultTheme: 'light',
  qr: {
    storeName: '',
    subtitle: '',
    welcomeMessage: '',
    theme: 'system',
  },
  qrCard: cloneDefaultQrCardSettings(),
  receipt: {
    printName: '',
    address: '',
    phone: '',
    footerNote: '',
    showLogo: false,
  },
  navLabels: {},
  navGroupLabels: {},
  navGroupOrder: [],
  navOrder: [],
  pageHeaders: {},
  printTemplates: cloneDefaultPrintTemplates(),
  updatedAt: null,
  assets: {
    logo: null,
    favicon: null,
    qrLogo: null,
  },
  qrMessages: {},
};

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickDefinedEntries(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function mergeNestedDefaults<T extends Record<string, unknown>>(
  defaults: T,
  hasKey: boolean,
  candidateValue: unknown,
): unknown {
  if (!hasKey) {
    return { ...defaults };
  }
  if (!isPlainObjectRecord(candidateValue)) {
    return candidateValue;
  }
  return {
    ...defaults,
    ...pickDefinedEntries(candidateValue),
  };
}

function sanitizeWhitelistLabels(
  labels: Record<string, string | undefined> | undefined | null,
  allowedSet: ReadonlySet<string>,
): Record<string, string> {
  if (!labels) return {};
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    const trimmedKey = key.trim();
    const trimmedVal = typeof value === 'string' ? value.trim() : '';
    if (allowedSet.has(trimmedKey) && trimmedVal.length > 0) {
      cleaned[trimmedKey] = trimmedVal;
    }
  }
  return cleaned;
}

function sanitizeUniqueWhitelistOrder<T extends string>(
  order: readonly string[] | undefined | null,
  allowedSet: ReadonlySet<string>,
): T[] {
  if (!order) return [];
  const seen = new Set<string>();
  const cleaned: T[] = [];
  for (const item of order) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!allowedSet.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed as T);
  }
  return cleaned;
}

/**
 * Filters `navLabels` to whitelisted navigation paths with non-empty trimmed labels.
 */
export function sanitizeNavLabels(
  navLabels: Record<string, string | undefined> | undefined | null,
): Record<string, string> {
  return sanitizeWhitelistLabels(navLabels, ALLOWED_STORE_NAV_PATH_SET);
}

/**
 * Filters `navGroupLabels` to whitelisted navigation group keys with non-empty trimmed labels.
 */
export function sanitizeNavGroupLabels(
  navGroupLabels: Record<string, string | undefined> | undefined | null,
): Record<string, string> {
  return sanitizeWhitelistLabels(navGroupLabels, ALLOWED_STORE_NAV_GROUP_KEY_SET);
}

/**
 * Deduplicates and filters `navGroupOrder` to whitelisted navigation group keys.
 */
export function sanitizeNavGroupOrder(
  navGroupOrder: readonly string[] | undefined | null,
): AllowedStoreNavGroupKey[] {
  return sanitizeUniqueWhitelistOrder<AllowedStoreNavGroupKey>(
    navGroupOrder,
    ALLOWED_STORE_NAV_GROUP_KEY_SET,
  );
}

/**
 * Deduplicates and filters `navOrder` to whitelisted navigation paths.
 */
export function sanitizeNavOrder(
  navOrder: readonly string[] | undefined | null,
): AllowedStoreNavPath[] {
  return sanitizeUniqueWhitelistOrder<AllowedStoreNavPath>(
    navOrder,
    ALLOWED_STORE_NAV_PATH_SET,
  );
}

/**
 * Filters `pageHeaders` to whitelisted paths, trimming title/subtitle and omitting empty pairs.
 */
export function sanitizePageHeaders(
  pageHeaders: Record<string, Partial<PageHeaderOverride> | undefined> | undefined | null,
): Record<string, PageHeaderOverride> {
  if (!pageHeaders) return {};
  const cleaned: Record<string, PageHeaderOverride> = {};
  for (const [key, value] of Object.entries(pageHeaders)) {
    const trimmedKey = key.trim();
    if (!ALLOWED_STORE_NAV_PATH_SET.has(trimmedKey) || !value) continue;
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const subtitle = typeof value.subtitle === 'string' ? value.subtitle.trim() : '';
    if (title.length === 0 && subtitle.length === 0) continue;
    cleaned[trimmedKey] = { title, subtitle };
  }
  return cleaned;
}

function mergePrintTemplateBranch<T extends { blocks: Record<string, unknown> }>(
  defaults: T,
  hasBranch: boolean,
  candidateBranch: unknown,
): unknown {
  if (!hasBranch) {
    return { ...defaults, blocks: { ...defaults.blocks } };
  }
  if (!isPlainObjectRecord(candidateBranch)) {
    return candidateBranch;
  }
  const definedBranch = pickDefinedEntries(candidateBranch);
  return {
    ...defaults,
    ...definedBranch,
    blocks: mergeNestedDefaults(defaults.blocks, 'blocks' in definedBranch, definedBranch.blocks),
  };
}

function mergePrintTemplatesDefaults(hasKey: boolean, candidateValue: unknown): unknown {
  if (!hasKey) {
    return cloneDefaultPrintTemplates();
  }
  if (!isPlainObjectRecord(candidateValue)) {
    return candidateValue;
  }
  const definedTemplates = pickDefinedEntries(candidateValue);
  return {
    provisional: mergePrintTemplateBranch(
      DEFAULT_PRINT_TEMPLATES.provisional,
      'provisional' in definedTemplates,
      definedTemplates.provisional,
    ),
    official: mergePrintTemplateBranch(
      DEFAULT_PRINT_TEMPLATES.official,
      'official' in definedTemplates,
      definedTemplates.official,
    ),
    kitchen: mergePrintTemplateBranch(
      DEFAULT_PRINT_TEMPLATES.kitchen,
      'kitchen' in definedTemplates,
      definedTemplates.kitchen,
    ),
    kitchenCancel: mergePrintTemplateBranch(
      DEFAULT_PRINT_TEMPLATES.kitchenCancel,
      'kitchenCancel' in definedTemplates,
      definedTemplates.kitchenCancel,
    ),
    tableTransfer: mergePrintTemplateBranch(
      DEFAULT_PRINT_TEMPLATES.tableTransfer,
      'tableTransfer' in definedTemplates,
      definedTemplates.tableTransfer,
    ),
  };
}

/**
 * Merges legacy v1/v1.5 store-settings JSON objects with v2 defaults without masking corrupted field types.
 */
export function mergeStoreSettingsWithDefaults(rawCandidate: unknown): unknown {
  if (!isPlainObjectRecord(rawCandidate)) {
    return rawCandidate;
  }

  const definedEntries = pickDefinedEntries(rawCandidate);
  return {
    ...DEFAULT_STORE_SETTINGS,
    ...definedEntries,
    primaryTextColor: mergeNestedDefaults(
      DEFAULT_STORE_SETTINGS.primaryTextColor,
      'primaryTextColor' in definedEntries,
      definedEntries.primaryTextColor,
    ),
    accentTextColor: mergeNestedDefaults(
      DEFAULT_STORE_SETTINGS.accentTextColor,
      'accentTextColor' in definedEntries,
      definedEntries.accentTextColor,
    ),
    priceColor: mergeNestedDefaults(
      DEFAULT_STORE_SETTINGS.priceColor,
      'priceColor' in definedEntries,
      definedEntries.priceColor,
    ),
    qr: mergeNestedDefaults(
      DEFAULT_STORE_SETTINGS.qr,
      'qr' in definedEntries,
      definedEntries.qr,
    ),
    qrCard: mergeNestedDefaults(
      DEFAULT_STORE_SETTINGS.qrCard,
      'qrCard' in definedEntries,
      definedEntries.qrCard,
    ),
    receipt: mergeNestedDefaults(
      DEFAULT_STORE_SETTINGS.receipt,
      'receipt' in definedEntries,
      definedEntries.receipt,
    ),
    navLabels: 'navLabels' in definedEntries ? definedEntries.navLabels : {},
    navGroupLabels: 'navGroupLabels' in definedEntries ? definedEntries.navGroupLabels : {},
    navGroupOrder: 'navGroupOrder' in definedEntries ? definedEntries.navGroupOrder : [],
    navOrder: 'navOrder' in definedEntries ? definedEntries.navOrder : [],
    pageHeaders: 'pageHeaders' in definedEntries ? definedEntries.pageHeaders : {},
    printTemplates: mergePrintTemplatesDefaults(
      'printTemplates' in definedEntries,
      definedEntries.printTemplates,
    ),
  };
}

export function resolveQrCardDisplay(
  settings: Pick<StoreSettings, 'storeName' | 'qr' | 'qrCard'>,
): ResolvedQrCardDisplay {
  const storeName = settings.qr.storeName.trim() || settings.storeName.trim() || 'Quán Mì Cay';
  const card = settings.qrCard;
  const rawHex = card.accentColor.trim();
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(rawHex)
    ? rawHex.toUpperCase()
    : QR_CARD_DEFAULTS.accentColor;

  return {
    storeName,
    tableHeadline: card.tableHeadline.trim() || QR_CARD_DEFAULTS.tableHeadline,
    tableSubtitle: card.tableSubtitle.trim() || QR_CARD_DEFAULTS.tableSubtitle,
    takeawayTitle: card.takeawayTitle.trim() || QR_CARD_DEFAULTS.takeawayTitle,
    takeawayHeadline: card.takeawayHeadline.trim() || QR_CARD_DEFAULTS.takeawayHeadline,
    takeawaySubtitle: card.takeawaySubtitle.trim() || QR_CARD_DEFAULTS.takeawaySubtitle,
    footerText: card.footerText.trim() || QR_CARD_DEFAULTS.footerText,
    accentColor,
    showLogo: card.showLogo,
    showLinkText: card.showLinkText,
  };
}
