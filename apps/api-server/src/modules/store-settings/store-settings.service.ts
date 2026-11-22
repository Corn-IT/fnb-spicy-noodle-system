import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  extractQrMessages,
  mergeStoreSettingsWithDefaults,
  PublicStoreSettingsResponseSchema,
  sanitizeNavGroupLabels,
  sanitizeNavGroupOrder,
  sanitizeNavLabels,
  sanitizeNavOrder,
  sanitizePageHeaders,
  sanitizeStoreMessages,
  STORE_MESSAGES_NORMALIZED_NAME,
  StoreAssetKind,
  StoreMessagesMapSchema,
  StoreMessagesResponseSchema,
  StoreSettingsSchema,
  UpdateStoreSettingsSchema,
  UploadStoreAssetSchema,
  type PublicStoreSettingsResponse,
  type StoreMessagesMap,
  type StoreMessagesResponse,
  type StoreSettings,
  type StoreSettingsAssets,
  type UpdateStoreSettingsInput,
  type UploadStoreAssetInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  decodeValidatedImageBase64,
  detectImageMimeFromMagicBytes,
  type SupportedImageMime,
} from '../../common/utils/image-binary.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const STORE_SETTINGS_NORMALIZED_NAME = 'store_settings';
const STORE_SETTINGS_DISPLAY_NAME = 'Cấu hình Cửa hàng & Thương hiệu';
const STORE_MESSAGES_DISPLAY_NAME = 'Tuỳ chỉnh Thông báo & Nhãn Hệ thống';

interface AssetKindConfig {
  normalizedName: string;
  displayName: string;
  assetField: keyof StoreSettingsAssets;
  maxBytes: number;
  label: string;
}

const ASSET_KIND_CONFIG: Record<StoreAssetKind, AssetKindConfig> = {
  [StoreAssetKind.LOGO]: {
    normalizedName: 'store_logo',
    displayName: 'Logo Cửa hàng',
    assetField: 'logo',
    maxBytes: 512 * 1024,
    label: 'Logo chính',
  },
  [StoreAssetKind.FAVICON]: {
    normalizedName: 'store_favicon',
    displayName: 'Favicon Cửa hàng',
    assetField: 'favicon',
    maxBytes: 128 * 1024,
    label: 'Favicon',
  },
  [StoreAssetKind.QR_LOGO]: {
    normalizedName: 'store_qr_logo',
    displayName: 'Logo Trang QR',
    assetField: 'qrLogo',
    maxBytes: 512 * 1024,
    label: 'Logo trang QR',
  },
};

const ALL_CONFIG_KEYS = [
  STORE_SETTINGS_NORMALIZED_NAME,
  STORE_MESSAGES_NORMALIZED_NAME,
  ...Object.values(ASSET_KIND_CONFIG).map((item) => item.normalizedName),
];

type ConfigDbClient = {
  masterData?: {
    findUnique: PrismaService['masterData']['findUnique'];
    findMany: PrismaService['masterData']['findMany'];
    upsert: PrismaService['masterData']['upsert'];
  };
  $queryRaw?: PrismaService['$queryRaw'];
};

export interface StoreAssetBinaryResult {
  buffer: Buffer;
  mime: SupportedImageMime;
  updatedAt: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class StoreSettingsService {
  private readonly logger = new Logger(StoreSettingsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
  ) {}

  async getPublicSettings(): Promise<PublicStoreSettingsResponse> {
    const rows =
      typeof this.prisma.masterData?.findMany === 'function'
        ? await this.prisma.masterData.findMany({
            where: {
              category: SYSTEM_CONFIG_CATEGORY,
              normalizedName: { in: ALL_CONFIG_KEYS },
            },
          })
        : [];

    const rowMap = new Map(rows.map((row) => [row.normalizedName, row]));
    const { settings, updatedAt } = this.parseSettingsMetadata(
      rowMap.get(STORE_SETTINGS_NORMALIZED_NAME)?.metadata,
      rowMap.get(STORE_SETTINGS_NORMALIZED_NAME)?.isActive ?? true,
    );
    const { messages } = this.parseMessagesMetadata(
      rowMap.get(STORE_MESSAGES_NORMALIZED_NAME)?.metadata,
      rowMap.get(STORE_MESSAGES_NORMALIZED_NAME)?.isActive ?? true,
    );

    const assets: StoreSettingsAssets = {
      logo: this.extractAssetVersion(rowMap.get(ASSET_KIND_CONFIG[StoreAssetKind.LOGO].normalizedName)),
      favicon: this.extractAssetVersion(rowMap.get(ASSET_KIND_CONFIG[StoreAssetKind.FAVICON].normalizedName)),
      qrLogo: this.extractAssetVersion(rowMap.get(ASSET_KIND_CONFIG[StoreAssetKind.QR_LOGO].normalizedName)),
    };

    return PublicStoreSettingsResponseSchema.parse({
      ...settings,
      updatedAt,
      assets,
      qrMessages: extractQrMessages(messages),
    });
  }

  async getMessages(): Promise<StoreMessagesResponse> {
    const row =
      typeof this.prisma.masterData?.findUnique === 'function'
        ? await this.prisma.masterData.findUnique({
            where: {
              category_normalizedName: {
                category: SYSTEM_CONFIG_CATEGORY,
                normalizedName: STORE_MESSAGES_NORMALIZED_NAME,
              },
            },
          })
        : null;

    const { messages, updatedAt } = this.parseMessagesMetadata(row?.metadata, row?.isActive ?? true);
    return StoreMessagesResponseSchema.parse({
      messages,
      updatedAt,
    });
  }

  async updateSettings(
    rawInput: UpdateStoreSettingsInput,
    actorId?: number,
  ): Promise<PublicStoreSettingsResponse> {
    const parsedInput = UpdateStoreSettingsSchema.parse(rawInput);
    const { expectedUpdatedAt, messages: rawMessages, ...settingsPayload } = parsedInput;
    const hasMessagesPayload = rawMessages !== undefined;
    const sanitizedSettings = StoreSettingsSchema.parse(
      this.sanitizeNavigationFields(settingsPayload),
    );
    const sanitizedMessages = hasMessagesPayload ? sanitizeStoreMessages(rawMessages) : undefined;

    const nextUpdatedAt = new Date().toISOString();

    await this.prisma.$transaction(async (tx) => {
      const db = tx as unknown as ConfigDbClient;
      if (typeof db.$queryRaw === 'function') {
        if (hasMessagesPayload) {
          await db.$queryRaw`
            SELECT id FROM master_data
            WHERE category = ${SYSTEM_CONFIG_CATEGORY}
              AND normalized_name IN (${STORE_SETTINGS_NORMALIZED_NAME}, ${STORE_MESSAGES_NORMALIZED_NAME})
            ORDER BY id ASC
            FOR UPDATE
          `;
        } else {
          await db.$queryRaw`
            SELECT id FROM master_data
            WHERE category = ${SYSTEM_CONFIG_CATEGORY} AND normalized_name = ${STORE_SETTINGS_NORMALIZED_NAME}
            ORDER BY id ASC
            FOR UPDATE
          `;
        }
      }

      const existingRow = await db.masterData?.findUnique({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: STORE_SETTINGS_NORMALIZED_NAME,
          },
        },
      });

      const currentState = this.parseSettingsMetadata(existingRow?.metadata, existingRow?.isActive ?? true);
      if (currentState.updatedAt !== expectedUpdatedAt) {
        throw new ConflictException({
          code: ErrorCodes.STORE_SETTINGS_CONFLICT,
          message: 'Cấu hình đã bị người khác thay đổi, vui lòng tải lại trước khi lưu',
        });
      }

      const metadataPayload: Prisma.InputJsonObject = {
        ...sanitizedSettings,
        updatedAt: nextUpdatedAt,
      };

      await db.masterData?.upsert({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: STORE_SETTINGS_NORMALIZED_NAME,
          },
        },
        update: {
          name: STORE_SETTINGS_DISPLAY_NAME,
          metadata: metadataPayload,
          isActive: true,
        },
        create: {
          category: SYSTEM_CONFIG_CATEGORY,
          name: STORE_SETTINGS_DISPLAY_NAME,
          normalizedName: STORE_SETTINGS_NORMALIZED_NAME,
          metadata: metadataPayload,
          isActive: true,
        },
      });

      let changedMessageKeys: string[] | undefined;
      if (sanitizedMessages !== undefined) {
        const existingMessagesRow = await db.masterData?.findUnique({
          where: {
            category_normalizedName: {
              category: SYSTEM_CONFIG_CATEGORY,
              normalizedName: STORE_MESSAGES_NORMALIZED_NAME,
            },
          },
        });
        const currentMessagesState = this.parseMessagesMetadata(
          existingMessagesRow?.metadata,
          existingMessagesRow?.isActive ?? true,
        );
        changedMessageKeys = this.diffMessageKeys(currentMessagesState.messages, sanitizedMessages);

        const messagesMetadata: Prisma.InputJsonObject = {
          messages: sanitizedMessages as unknown as Prisma.InputJsonObject,
          updatedAt: nextUpdatedAt,
        };

        await db.masterData?.upsert({
          where: {
            category_normalizedName: {
              category: SYSTEM_CONFIG_CATEGORY,
              normalizedName: STORE_MESSAGES_NORMALIZED_NAME,
            },
          },
          update: {
            name: STORE_MESSAGES_DISPLAY_NAME,
            metadata: messagesMetadata,
            isActive: true,
          },
          create: {
            category: SYSTEM_CONFIG_CATEGORY,
            name: STORE_MESSAGES_DISPLAY_NAME,
            normalizedName: STORE_MESSAGES_NORMALIZED_NAME,
            metadata: messagesMetadata,
            isActive: true,
          },
        });
      }

      await this.auditLogService?.record({
        module: 'SETTINGS',
        action: 'Cập nhật cấu hình',
        detail: sanitizedSettings.storeName,
        message: `cập nhật cấu hình cửa hàng "${sanitizedSettings.storeName}"`,
        actor: actorId,
        tx,
        metadata: {
          before: currentState.settings,
          after: sanitizedSettings,
          ...(changedMessageKeys !== undefined ? { changedMessageKeys } : {}),
          updatedAt: nextUpdatedAt,
        },
      });
    });

    this.posSocketGateway?.emitStoreSettingsUpdated({ version: nextUpdatedAt });
    return this.getPublicSettings();
  }

  async uploadAsset(
    kind: StoreAssetKind,
    rawInput: UploadStoreAssetInput,
    actorId?: number,
  ): Promise<PublicStoreSettingsResponse> {
    const config = ASSET_KIND_CONFIG[kind];
    const parsedInput = UploadStoreAssetSchema.parse(rawInput);
    const {
      buffer,
      mime: detectedMime,
      canonicalBase64,
    } = decodeValidatedImageBase64(parsedInput.base64, config.maxBytes, config.label);

    const nextUpdatedAt = new Date().toISOString();
    const metadataPayload: Prisma.InputJsonObject = {
      mime: detectedMime,
      base64: canonicalBase64,
      byteSize: buffer.byteLength,
      updatedAt: nextUpdatedAt,
    };

    await this.prisma.masterData.upsert({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: config.normalizedName,
        },
      },
      update: {
        name: config.displayName,
        metadata: metadataPayload,
        isActive: true,
      },
      create: {
        category: SYSTEM_CONFIG_CATEGORY,
        name: config.displayName,
        normalizedName: config.normalizedName,
        metadata: metadataPayload,
        isActive: true,
      },
    });

    await this.auditLogService?.record({
      module: 'SETTINGS',
      action: 'Cập nhật ảnh cửa hàng',
      detail: config.label,
      message: `cập nhật ${config.label} (${detectedMime}, ${buffer.byteLength} bytes)`,
      actor: actorId,
      metadata: {
        kind,
        mime: detectedMime,
        byteSize: buffer.byteLength,
        updatedAt: nextUpdatedAt,
      },
    });

    this.posSocketGateway?.emitStoreSettingsUpdated({ version: nextUpdatedAt });
    return this.getPublicSettings();
  }

  async deleteAsset(
    kind: StoreAssetKind,
    actorId?: number,
  ): Promise<PublicStoreSettingsResponse> {
    const config = ASSET_KIND_CONFIG[kind];
    const deletedAt = new Date().toISOString();

    await this.prisma.masterData.upsert({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: config.normalizedName,
        },
      },
      update: {
        name: config.displayName,
        metadata: { updatedAt: deletedAt } as Prisma.InputJsonObject,
        isActive: false,
      },
      create: {
        category: SYSTEM_CONFIG_CATEGORY,
        name: config.displayName,
        normalizedName: config.normalizedName,
        metadata: { updatedAt: deletedAt } as Prisma.InputJsonObject,
        isActive: false,
      },
    });

    await this.auditLogService?.record({
      module: 'SETTINGS',
      action: 'Xoá ảnh cửa hàng',
      detail: config.label,
      message: `xoá ${config.label} về ảnh mặc định`,
      actor: actorId,
      metadata: {
        kind,
        updatedAt: deletedAt,
      },
    });

    this.posSocketGateway?.emitStoreSettingsUpdated({ version: deletedAt });
    return this.getPublicSettings();
  }

  async getAssetBinary(kind: StoreAssetKind): Promise<StoreAssetBinaryResult> {
    const config = ASSET_KIND_CONFIG[kind];
    const row = await this.prisma.masterData.findUnique({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: config.normalizedName,
        },
      },
    });

    if (!row?.isActive || !isPlainRecord(row.metadata)) {
      throw new NotFoundException('Không tìm thấy ảnh cấu hình cửa hàng');
    }

    const rawBase64 = typeof row.metadata.base64 === 'string' ? row.metadata.base64 : '';
    const updatedAt = typeof row.metadata.updatedAt === 'string' ? row.metadata.updatedAt : null;
    if (!rawBase64) {
      throw new NotFoundException('Không tìm thấy ảnh cấu hình cửa hàng');
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    const detectedMime = detectImageMimeFromMagicBytes(buffer);
    if (!detectedMime) {
      throw new NotFoundException('Dữ liệu ảnh cấu hình không hợp lệ');
    }

    return {
      buffer,
      mime: detectedMime,
      updatedAt,
    };
  }

  private sanitizeNavigationFields(settings: StoreSettings): StoreSettings {
    return {
      ...settings,
      navLabels: sanitizeNavLabels(settings.navLabels),
      navGroupLabels: sanitizeNavGroupLabels(settings.navGroupLabels),
      navGroupOrder: sanitizeNavGroupOrder(settings.navGroupOrder),
      navOrder: sanitizeNavOrder(settings.navOrder),
      pageHeaders: sanitizePageHeaders(settings.pageHeaders),
    };
  }

  private parseSettingsMetadata(
    rawMetadata: unknown,
    isActive: boolean,
  ): { settings: StoreSettings; updatedAt: string | null } {
    if (!isActive || !isPlainRecord(rawMetadata) || Object.keys(rawMetadata).length === 0) {
      return { settings: DEFAULT_STORE_SETTINGS, updatedAt: null };
    }

    const { updatedAt: rawUpdatedAt, ...candidate } = rawMetadata;
    const parsed = StoreSettingsSchema.safeParse(mergeStoreSettingsWithDefaults(candidate));
    if (!parsed.success) {
      this.logger.warn(`Invalid store_settings metadata in master_data, using DEFAULT_STORE_SETTINGS: ${parsed.error.message}`);
      return { settings: DEFAULT_STORE_SETTINGS, updatedAt: null };
    }

    return {
      settings: this.sanitizeNavigationFields(parsed.data),
      updatedAt: typeof rawUpdatedAt === 'string' ? rawUpdatedAt : null,
    };
  }

  private parseMessagesMetadata(
    rawMetadata: unknown,
    isActive: boolean,
  ): { messages: StoreMessagesMap; updatedAt: string | null } {
    if (!isActive || !isPlainRecord(rawMetadata) || Object.keys(rawMetadata).length === 0) {
      return { messages: {}, updatedAt: null };
    }

    const { updatedAt: rawUpdatedAt, messages: rawMessagesField, ...legacyFlat } = rawMetadata;
    const candidate = isPlainRecord(rawMessagesField) ? rawMessagesField : legacyFlat;
    const cleaned = sanitizeStoreMessages(candidate as Record<string, { title?: string; description?: string } | undefined>);
    const parsed = StoreMessagesMapSchema.safeParse(cleaned);
    if (!parsed.success) {
      this.logger.warn(`Invalid store_messages metadata in master_data, using empty overrides: ${parsed.error.message}`);
      return { messages: {}, updatedAt: typeof rawUpdatedAt === 'string' ? rawUpdatedAt : null };
    }

    return {
      messages: parsed.data,
      updatedAt: typeof rawUpdatedAt === 'string' ? rawUpdatedAt : null,
    };
  }

  private diffMessageKeys(before: StoreMessagesMap, after: StoreMessagesMap): string[] {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed: string[] = [];
    for (const key of allKeys) {
      const a = before[key];
      const b = after[key];
      if ((a?.title ?? '') !== (b?.title ?? '') || (a?.description ?? '') !== (b?.description ?? '')) {
        changed.push(key);
      }
    }
    return changed.sort();
  }

  private extractAssetVersion(row: { isActive: boolean; metadata: unknown } | undefined): string | null {
    if (!row?.isActive || !isPlainRecord(row.metadata)) return null;
    if (typeof row.metadata.base64 !== 'string' || row.metadata.base64.length === 0) return null;
    return typeof row.metadata.updatedAt === 'string' ? row.metadata.updatedAt : null;
  }
}
