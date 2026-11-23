import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type MasterData } from '@prisma/client';
import {
  ErrorCodes,
  InternalMdmRecord,
  MdmCategory,
  ProductStationSchema,
  type AuditModule,
  type AuthPrincipal,
  type MdmListResponse,
  type MdmLookupQuery,
  type UpdateMdmInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { compareMdmRecords, readMetadataSortOrder } from '../../common/utils/display-order.util';
import { normalizeVietnameseString, toTitleCase } from '../../common/utils/normalized-string.util';
import { buildIyFallbackKeywords, queryMatchingIdsBySearchNorm } from '../../common/utils/search-normalize.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

type Metadata = Record<string, unknown>;

const DEFAULT_KITCHEN_STATIONS = [
  { name: 'Bếp Nấu', normalizedName: 'bep nau', code: 'BEP_NAU', sortOrder: 1 },
  { name: 'Bếp Chiên', normalizedName: 'bep chien', code: 'BEP_CHIEN', sortOrder: 2 },
  { name: 'Pha Chế', normalizedName: 'pha che', code: 'PHA_CHE', sortOrder: 3 },
  { name: 'Combo', normalizedName: 'combo', code: 'COMBO', sortOrder: 4 },
] as const;

@Injectable()
export class MdmService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  private async ensureDefaultKitchenStations(): Promise<void> {
    if (
      typeof this.prisma.masterData?.count !== 'function' ||
      typeof this.prisma.masterData?.upsert !== 'function'
    ) {
      return;
    }
    const existingCount = await this.prisma.masterData.count({
      where: { category: MdmCategory.KITCHEN_STATION },
    });
    if (existingCount > 0) return;

    for (const st of DEFAULT_KITCHEN_STATIONS) {
      await this.prisma.masterData.upsert({
        where: {
          category_normalizedName: {
            category: MdmCategory.KITCHEN_STATION,
            normalizedName: st.normalizedName,
          },
        },
        update: {},
        create: {
          category: MdmCategory.KITCHEN_STATION,
          name: st.name,
          normalizedName: st.normalizedName,
          metadata: { code: st.code, sortOrder: st.sortOrder, isHidden: false },
          isActive: true,
        },
      });
    }
  }

  async findOrCreate(
    category: MdmCategory,
    rawInput: string,
    metadata: Metadata = {},
    client: PrismaService | Prisma.TransactionClient = this.prisma,
    actor?: AuthPrincipal,
    customNormalizedName?: string,
  ): Promise<MasterData> {
    const trimmed = rawInput.trim();
    if (!trimmed) throw new BadRequestException('Tên danh mục không được để trống');

    const name = toTitleCase(trimmed);
    const normalizedName = customNormalizedName !== undefined
      ? this.sanitizeManualNormalizedName(customNormalizedName)
      : normalizeVietnameseString(trimmed);
    if (!normalizedName || normalizedName.startsWith('__internal_')) {
      throw new BadRequestException('Tên danh mục này được hệ thống sử dụng hoặc không hợp lệ');
    }
    if (category === MdmCategory.UNIT && normalizedName === InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET) {
      throw new BadRequestException('Tên danh mục này được hệ thống sử dụng');
    }
    if (client !== this.prisma) {
      return this.findOrCreateWithinTransaction(client, category, name, normalizedName, metadata);
    }

    const existing = await client.masterData.findFirst({
      where: { category, normalizedName, isActive: true },
    });

    if (existing) {
      const merged = await this.mergeMetadata(existing, metadata, client);
      this.notifyMenuIfRelevant(category);
      return merged;
    }

    let createdRecord: MasterData;
    try {
      createdRecord = await client.masterData.create({
        data: { category, name, normalizedName, metadata: metadata as Prisma.InputJsonObject, isActive: true },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const conflicting = await client.masterData.findUnique({
        where: { category_normalizedName: { category, normalizedName } },
      });
      if (!conflicting) throw error;
      const reactivated = conflicting.isActive
        ? conflicting
        : await client.masterData.update({ where: { id: conflicting.id }, data: { isActive: true, name } });
      createdRecord = await this.mergeMetadata(reactivated, metadata, client);
    }

    this.notifyMenuIfRelevant(category);
    if (actor) {
      await this.recordAudit(category, 'create', createdRecord.name, actor, createdRecord.id);
    }
    return createdRecord;
  }

  private async buildMdmKeywordFilter(rawKeyword?: string): Promise<Prisma.MasterDataWhereInput> {
    const trimmedKeyword = rawKeyword?.trim();
    if (!trimmedKeyword) return {};
    const matchedIds = await queryMatchingIdsBySearchNorm(
      this.prisma,
      'master_data',
      ['name', 'normalized_name'],
      trimmedKeyword,
    );
    if (matchedIds !== null) {
      return { id: { in: matchedIds } };
    }
    const variants = buildIyFallbackKeywords(trimmedKeyword);
    return {
      OR: variants.flatMap((v) => [
        { name: { contains: v, mode: 'insensitive' as const } },
        { normalizedName: { contains: v, mode: 'insensitive' as const } },
      ]),
    };
  }

  async lookup(query: MdmLookupQuery): Promise<MasterData[]> {
    if (query.category === MdmCategory.KITCHEN_STATION) {
      await this.ensureDefaultKitchenStations();
    }
    const keywordFilter = await this.buildMdmKeywordFilter(query.keyword);
    const rows = await this.prisma.masterData.findMany({
      where: {
        category: query.category,
        isActive: true,
        normalizedName: { not: InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET },
        ...keywordFilter,
      },
      orderBy: { id: 'asc' },
    });
    const sorted = [...rows].sort(compareMdmRecords);
    return sorted.slice((query.page - 1) * query.limit, query.page * query.limit);
  }

  async list(query: MdmLookupQuery): Promise<MdmListResponse> {
    if (query.category === MdmCategory.KITCHEN_STATION) {
      await this.ensureDefaultKitchenStations();
    }
    const keywordFilter = await this.buildMdmKeywordFilter(query.keyword);
    const where: Prisma.MasterDataWhereInput = {
      category: query.category,
      normalizedName: { not: InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET },
      ...(query.activeOnly ? { isActive: true } : {}),
      ...keywordFilter,
    };
    const records = await this.prisma.masterData.findMany({
      where,
      orderBy: { id: 'asc' },
    });
    const sorted = [...records].sort(compareMdmRecords);
    const paged = sorted.slice((query.page - 1) * query.limit, query.page * query.limit);
    const items = paged.map((record) => ({
      ...record,
      category: record.category as MdmCategory,
      metadata: record.metadata as Metadata,
      createdAt: record.createdAt.toISOString(),
    }));
    return { page: query.page, limit: query.limit, total: sorted.length, items };
  }

  async update(id: number, input: UpdateMdmInput, actor?: AuthPrincipal): Promise<MasterData> {
    const existing = await this.prisma.masterData.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy dữ liệu danh mục');
    if (this.isInternalCashflowRecord(existing)) throw this.internalRecordForbidden();

    const data: Prisma.MasterDataUpdateInput = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new BadRequestException('Tên hiển thị không được để trống');
      const autoNormalized = normalizeVietnameseString(trimmed);
      if (!autoNormalized || autoNormalized.startsWith('__internal_')) {
        throw new BadRequestException('Tên danh mục này được hệ thống sử dụng hoặc không hợp lệ');
      }
      data.name = toTitleCase(trimmed);
      if (input.normalizedName === undefined) {
        data.normalizedName = autoNormalized;
      }
    }

    if (input.normalizedName !== undefined) {
      const sanitizedNorm = this.sanitizeManualNormalizedName(input.normalizedName);
      if (!sanitizedNorm || sanitizedNorm.startsWith('__internal_')) {
        throw new BadRequestException('Tên không dấu không hợp lệ hoặc được hệ thống sử dụng');
      }
      data.normalizedName = sanitizedNorm;
    }

    const nextNormalizedName = typeof data.normalizedName === 'string' ? data.normalizedName : undefined;
    if (nextNormalizedName !== undefined && nextNormalizedName !== existing.normalizedName) {
      const duplicate = await this.prisma.masterData.findFirst({
        where: { category: existing.category, normalizedName: nextNormalizedName, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw this.duplicateName();
    }

    const oldMeta = (existing.metadata ?? {}) as Metadata;
    let nextMenuStation: string | null = null;
    if (input.metadata !== undefined) {
      const mergedMeta = this.sanitizeMetadataForCategory(existing.category, oldMeta, input.metadata);
      if (existing.category === MdmCategory.MENU_CATEGORY) {
        const nextStation = typeof mergedMeta.defaultStation === 'string' ? mergedMeta.defaultStation : '';
        const prevStation = typeof oldMeta.defaultStation === 'string' ? oldMeta.defaultStation : '';
        if (nextStation && nextStation !== prevStation) {
          await this.assertCategoryStationChangeAllowed(id, existing.name);
          nextMenuStation = nextStation;
        }
      }
      data.metadata = mergedMeta as Prisma.InputJsonObject;
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      if (!input.isActive) {
        await this.assertCanDeactivate(existing);
      }
      data.isActive = input.isActive;
    }

    try {
      const updated =
        nextMenuStation &&
        typeof this.prisma.$transaction === 'function' &&
        typeof this.prisma.product?.updateMany === 'function'
          ? await this.prisma.$transaction(async (tx) => {
              const row = await tx.masterData.update({ where: { id }, data });
              await tx.product.updateMany({
                where: { categoryId: id, station: { not: 'COMBO' }, sortOrder: { gte: 0 } },
                data: { station: nextMenuStation },
              });
              return row;
            })
          : await this.prisma.masterData.update({ where: { id }, data });

      this.notifyMenuIfRelevant(existing.category);
      if (actor) {
        const changes: Array<{ field: string; from: string; to: string }> = [];
        const newMeta = (updated.metadata ?? {}) as Metadata;
        if (input.name !== undefined && existing.name !== updated.name) {
          changes.push({ field: 'Tên hiển thị', from: existing.name, to: updated.name });
        }
        if (existing.normalizedName !== updated.normalizedName) {
          changes.push({ field: 'Tên không dấu', from: existing.normalizedName, to: updated.normalizedName });
        }
        if (existing.isActive !== updated.isActive) {
          changes.push({
            field: 'Trạng thái hoạt động',
            from: existing.isActive ? 'Hoạt động' : 'Ngưng',
            to: updated.isActive ? 'Hoạt động' : 'Ngưng',
          });
        }
        if (oldMeta.defaultStation !== newMeta.defaultStation) {
          changes.push({
            field: 'Khu vực bếp',
            from: String(oldMeta.defaultStation ?? 'Chưa chọn'),
            to: String(newMeta.defaultStation ?? 'Chưa chọn'),
          });
        }
        if (Boolean(oldMeta.isHidden) !== Boolean(newMeta.isHidden)) {
          changes.push({
            field: 'Hiển thị POS/QR',
            from: oldMeta.isHidden ? 'Đang ẩn' : 'Đang hiện',
            to: newMeta.isHidden ? 'Đang ẩn' : 'Đang hiện',
          });
        }
        if ((oldMeta.description ?? '') !== (newMeta.description ?? '')) {
          changes.push({
            field: 'Mô tả',
            from: String(oldMeta.description ?? '') || 'Trống',
            to: String(newMeta.description ?? '') || 'Trống',
          });
        }
        const oldSort = readMetadataSortOrder(oldMeta);
        const newSort = readMetadataSortOrder(newMeta);
        if (oldSort !== newSort) {
          changes.push({
            field: 'Thứ tự hiển thị',
            from: oldSort !== null ? String(oldSort) : 'Mặc định',
            to: newSort !== null ? String(newSort) : 'Mặc định',
          });
        }
        if (oldMeta.default_unit !== newMeta.default_unit) {
          changes.push({
            field: 'ĐVT mặc định',
            from: String(oldMeta.default_unit ?? 'Trống'),
            to: String(newMeta.default_unit ?? 'Trống'),
          });
        }
        if (oldMeta.last_price !== newMeta.last_price) {
          const oldPrice = typeof oldMeta.last_price === 'number' ? `${oldMeta.last_price.toLocaleString('vi-VN')}đ` : 'Chưa có';
          const newPrice = typeof newMeta.last_price === 'number' ? `${newMeta.last_price.toLocaleString('vi-VN')}đ` : 'Chưa có';
          changes.push({ field: 'Đơn giá gần nhất', from: oldPrice, to: newPrice });
        }
        await this.recordAudit(existing.category, 'update', updated.name, actor, updated.id, changes);
      }
      return updated;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw this.duplicateName();
      throw error;
    }
  }

  async softDisable(id: number, actor?: AuthPrincipal): Promise<MasterData> {
    const existing = await this.prisma.masterData.findUnique({
      where: { id },
      select: { id: true, category: true, name: true, normalizedName: true, metadata: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy dữ liệu danh mục');
    if (this.isInternalCashflowRecord(existing)) throw this.internalRecordForbidden();

    await this.assertCanDeleteRecord(existing);

    let deletedRecord: MasterData;
    try {
      deletedRecord = typeof this.prisma.masterData?.delete === 'function'
        ? await this.prisma.masterData.delete({ where: { id } })
        : await this.prisma.masterData.update({ where: { id }, data: { isActive: false } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          `Không thể xoá "${existing.name}" vì vẫn còn dữ liệu liên quan trong hệ thống. Vui lòng chuyển trạng thái sang Ngưng.`,
        );
      }
      throw error;
    }

    this.notifyMenuIfRelevant(existing.category);
    if (actor) {
      await this.recordAudit(existing.category, 'delete', existing.name, actor, id);
    }
    return deletedRecord;
  }

  private sanitizeManualNormalizedName(raw: string): string {
    const normalized = normalizeVietnameseString(raw);
    if (!normalized) {
      throw new BadRequestException('Tên không dấu không được để trống');
    }
    if (/[^\x20-\x7E]/.test(normalized)) {
      throw new BadRequestException('Tên không dấu chỉ được chứa ký tự ASCII không dấu');
    }
    return normalized;
  }

  private sanitizeMetadataForCategory(
    category: string,
    previousMeta: Metadata,
    patchMeta: Metadata,
  ): Metadata {
    const merged: Metadata = { ...previousMeta };
    for (const [key, value] of Object.entries(patchMeta)) {
      if (value === undefined) continue;
      if (value === null || (typeof value === 'string' && value.trim() === '')) {
        delete merged[key];
      } else {
        merged[key] = typeof value === 'string' ? value.trim() : value;
      }
    }

    if (category === MdmCategory.MENU_CATEGORY) {
      if (merged.defaultStation !== undefined) {
        const stationCode = String(merged.defaultStation).trim();
        const parsedStation = ProductStationSchema.safeParse(stationCode);
        if (!parsedStation.success) {
          throw new BadRequestException('Trạm bếp mặc định không hợp lệ');
        }
        merged.defaultStation = parsedStation.data;
        if (merged.stationCode !== undefined) {
          merged.stationCode = parsedStation.data;
        }
      }
    }

    if (merged.sortOrder !== undefined) {
      const num = Number(merged.sortOrder);
      if (!Number.isInteger(num) || num < 0) {
        throw new BadRequestException('Thứ tự hiển thị phải là số nguyên không âm');
      }
      merged.sortOrder = num;
    }

    if (category === MdmCategory.INGREDIENT && merged.last_price !== undefined) {
      const price = Number(merged.last_price);
      if (!Number.isFinite(price) || price < 0) {
        throw new BadRequestException('Đơn giá tham khảo phải lớn hơn hoặc bằng 0');
      }
      merged.last_price = price;
    }

    return merged;
  }

  private async assertCategoryStationChangeAllowed(categoryId: number, categoryName: string): Promise<void> {
    if (typeof this.prisma.orderItem?.count !== 'function') return;
    const activeItems = await this.prisma.orderItem.count({
      where: {
        kitchenStatus: { not: 'CANCELLED' },
        order: { status: { in: ['PENDING', 'SERVING'] } },
        product: { categoryId, sortOrder: { gte: 0 } },
      },
    });
    if (activeItems > 0) {
      throw new ConflictException(
        `Không thể đổi trạm bếp mặc định của danh mục "${categoryName}" vì đang có ${activeItems} món thuộc danh mục trong đơn đang phục vụ.`,
      );
    }
  }

  private async assertCanDeactivate(existing: {
    id: number;
    category: string;
    name: string;
    normalizedName: string;
    metadata: Prisma.JsonValue;
  }): Promise<void> {
    if (existing.category === MdmCategory.MENU_CATEGORY && typeof this.prisma.product?.count === 'function') {
      const activeProducts = await this.prisma.product.count({
        where: { categoryId: existing.id, isAvailable: true, sortOrder: { gte: 0 } },
      });
      if (activeProducts > 0) {
        throw new BadRequestException(
          `Không thể ngưng danh mục "${existing.name}" vì vẫn còn ${activeProducts} món ăn đang mở bán. Hãy ẩn hoặc chuyển các món ăn trước.`,
        );
      }
    }

    if (existing.category === MdmCategory.POSITION && typeof this.prisma.employee?.count === 'function') {
      const activeEmployees = await this.prisma.employee.count({
        where: { positionId: existing.id, isDeleted: false },
      });
      if (activeEmployees > 0) {
        throw new BadRequestException(
          `Không thể ngưng chức vụ "${existing.name}" vì đang có ${activeEmployees} nhân viên hoạt động giữ chức vụ này.`,
        );
      }
    }

    if (existing.category === MdmCategory.SPECIALTY && typeof this.prisma.employee?.count === 'function') {
      const activeEmployees = await this.prisma.employee.count({
        where: { specialtyId: existing.id, isDeleted: false },
      });
      if (activeEmployees > 0) {
        throw new BadRequestException(
          `Không thể ngưng chuyên môn "${existing.name}" vì đang có ${activeEmployees} nhân viên hoạt động thuộc chuyên môn này.`,
        );
      }
    }

    if (existing.category === MdmCategory.KITCHEN_STATION) {
      await this.assertStationNoActiveChildren(existing);
    }
  }

  private async assertCanDeleteRecord(existing: {
    id: number;
    category: string;
    name: string;
    normalizedName: string;
    metadata: Prisma.JsonValue;
  }): Promise<void> {
    if (existing.category === MdmCategory.MENU_CATEGORY) {
      if (typeof this.prisma.product?.count === 'function') {
        const childProductsCount = await this.prisma.product.count({
          where: { categoryId: existing.id, sortOrder: { gte: 0 } },
        });
        if (childProductsCount > 0) {
          throw new BadRequestException(
            `Không thể xoá danh mục "${existing.name}" vì vẫn còn ${childProductsCount} món ăn trực thuộc. Vui lòng xoá/chuyển món trước hoặc bấm Trạng thái để chuyển sang Ngưng.`,
          );
        }
      }
      if (typeof this.prisma.discountTarget?.count === 'function') {
        const discountRefs = await this.prisma.discountTarget.count({
          where: { categoryId: existing.id },
        });
        if (discountRefs > 0) {
          throw new ConflictException(
            `Không thể xoá danh mục "${existing.name}" vì đang được áp dụng trong ${discountRefs} chương trình giảm giá.`,
          );
        }
      }
    }

    if (existing.category === MdmCategory.POSITION && typeof this.prisma.employee?.count === 'function') {
      const empCount = await this.prisma.employee.count({ where: { positionId: existing.id } });
      if (empCount > 0) {
        throw new ConflictException(
          `Không thể xoá chức vụ "${existing.name}" vì đang liên kết với ${empCount} hồ sơ nhân viên. Hãy bấm Trạng thái để chuyển sang Ngưng nếu ngừng dùng.`,
        );
      }
    }

    if (existing.category === MdmCategory.SPECIALTY && typeof this.prisma.employee?.count === 'function') {
      const empCount = await this.prisma.employee.count({ where: { specialtyId: existing.id } });
      if (empCount > 0) {
        throw new ConflictException(
          `Không thể xoá chuyên môn "${existing.name}" vì đang liên kết với ${empCount} hồ sơ nhân viên. Hãy bấm Trạng thái để chuyển sang Ngưng nếu ngừng dùng.`,
        );
      }
    }

    if (existing.category === MdmCategory.INGREDIENT && typeof this.prisma.inventoryImport?.count === 'function') {
      const importCount = await this.prisma.inventoryImport.count({ where: { ingredientMdmId: existing.id } });
      if (importCount > 0) {
        throw new ConflictException(
          `Không thể xoá nguyên liệu "${existing.name}" vì đã phát sinh ${importCount} phiếu nhập kho. Hãy bấm Trạng thái để chuyển sang Ngưng.`,
        );
      }
    }

    if (existing.category === MdmCategory.SUPPLIER && typeof this.prisma.inventoryImport?.count === 'function') {
      const importCount = await this.prisma.inventoryImport.count({ where: { supplierMdmId: existing.id } });
      if (importCount > 0) {
        throw new ConflictException(
          `Không thể xoá nhà cung cấp "${existing.name}" vì đã phát sinh ${importCount} phiếu nhập kho. Hãy bấm Trạng thái để chuyển sang Ngưng.`,
        );
      }
    }

    if (existing.category === MdmCategory.UNIT) {
      if (typeof this.prisma.inventoryImport?.count === 'function') {
        const importCount = await this.prisma.inventoryImport.count({ where: { unitName: existing.name } });
        if (importCount > 0) {
          throw new ConflictException(
            `Không thể xoá đơn vị tính "${existing.name}" vì đang có ${importCount} phiếu nhập kho sử dụng.`,
          );
        }
      }
      if (typeof this.prisma.masterData?.findMany === 'function') {
        const ingredients = await this.prisma.masterData.findMany({
          where: { category: MdmCategory.INGREDIENT },
          select: { name: true, metadata: true },
        });
        const usedByIngredient = ingredients.filter((ing) => {
          const meta = (ing.metadata ?? {}) as Metadata;
          return typeof meta.default_unit === 'string' && normalizeVietnameseString(meta.default_unit) === existing.normalizedName;
        });
        if (usedByIngredient.length > 0) {
          throw new ConflictException(
            `Không thể xoá đơn vị tính "${existing.name}" vì đang là ĐVT mặc định của ${usedByIngredient.length} nguyên liệu.`,
          );
        }
      }
    }

    if (existing.category === MdmCategory.KITCHEN_STATION) {
      await this.assertStationNoActiveChildren(existing);
    }
  }

  private async assertStationNoActiveChildren(existing: {
    name: string;
    normalizedName: string;
    metadata: Prisma.JsonValue;
  }): Promise<void> {
    const meta = (existing.metadata ?? {}) as Metadata;
    const stationCode =
      typeof meta.code === 'string' && meta.code.trim()
        ? meta.code.trim()
        : existing.normalizedName.toUpperCase().replace(/\s+/g, '_');

    let childCategoriesCount = 0;
    if (typeof this.prisma.masterData?.findMany === 'function') {
      const activeCategories = await this.prisma.masterData.findMany({
        where: { category: MdmCategory.MENU_CATEGORY, isActive: true },
        select: { id: true, metadata: true },
      });
      childCategoriesCount = activeCategories.filter(
        (cat) => ((cat.metadata ?? {}) as Metadata).defaultStation === stationCode,
      ).length;
    }

    const childProductsCount =
      typeof this.prisma.product?.count === 'function'
        ? await this.prisma.product.count({
            where: {
              station: stationCode,
              sortOrder: { gte: 0 },
            },
          })
        : 0;

    if (childCategoriesCount > 0 || childProductsCount > 0) {
      throw new BadRequestException(
        `Không thể xoá/ngưng Bếp "${existing.name}" vì vẫn còn ${childCategoriesCount} danh mục con và ${childProductsCount} món ăn trực thuộc.`,
      );
    }
  }

  private notifyMenuIfRelevant(category: string): void {
    if (category === MdmCategory.KITCHEN_STATION || category === MdmCategory.MENU_CATEGORY) {
      this.posSocketGateway?.emitMenuUpdated();
    }
  }

  private async recordAudit(
    category: string,
    op: 'create' | 'update' | 'delete',
    name: string,
    actor: AuthPrincipal,
    recordId: number,
    changes: Array<{ field: string; from: string; to: string }> = [],
  ): Promise<void> {
    const isMenuCategory = category === MdmCategory.KITCHEN_STATION || category === MdmCategory.MENU_CATEGORY;
    const auditModule: AuditModule = isMenuCategory ? 'MENU' : 'MDM';
    const categoryLabelMap: Record<string, string> = {
      KITCHEN_STATION: 'khu vực bếp',
      MENU_CATEGORY: 'danh mục món',
      INGREDIENT: 'Nguyên liệu',
      SUPPLIER: 'Nhà cung cấp',
      UNIT: 'Đơn vị tính',
      POSITION: 'Chức vụ',
      SPECIALTY: 'Chuyên môn',
    };
    const label = categoryLabelMap[category] ?? 'danh mục';
    const actionVerbMap: Record<typeof op, string> = {
      create: 'Thêm',
      update: 'Cập nhật',
      delete: 'Xoá',
    };
    const phraseVerbMap: Record<typeof op, string> = {
      create: 'thêm mới',
      update: 'cập nhật',
      delete: 'xoá / ẩn',
    };
    const action = `${actionVerbMap[op]} ${label}`;
    await this.auditLogService?.record({
      module: auditModule,
      action,
      detail: `${label} "${name}"`,
      message: `${phraseVerbMap[op]} ${label}`,
      actor,
      metadata: {
        category,
        categoryLabel: label,
        recordId,
        recordName: name,
        ...(changes.length > 0 ? { changes } : {}),
      },
    });
  }

  private async mergeMetadata(
    record: MasterData,
    metadata: Metadata,
    client: PrismaService | Prisma.TransactionClient,
  ): Promise<MasterData> {
    if (Object.keys(metadata).length === 0) return record;
    return client.masterData.update({
      where: { id: record.id },
      data: {
        metadata: { ...(record.metadata as Metadata), ...metadata } as Prisma.InputJsonObject,
      },
    });
  }

  private async findOrCreateWithinTransaction(
    client: Prisma.TransactionClient | PrismaService,
    category: MdmCategory,
    name: string,
    normalizedName: string,
    metadata: Metadata,
  ): Promise<MasterData> {
    const metadataJson = JSON.stringify(metadata);
    const [record] = await client.$queryRaw<MasterData[]>`
      INSERT INTO master_data (category, name, normalized_name, metadata, is_active)
      VALUES (${category}, ${name}, ${normalizedName}, ${metadataJson}::jsonb, TRUE)
      ON CONFLICT (category, normalized_name)
      DO UPDATE SET
        name = CASE WHEN master_data.is_active THEN master_data.name ELSE EXCLUDED.name END,
        metadata = master_data.metadata || EXCLUDED.metadata,
        is_active = TRUE
      RETURNING
        id,
        category,
        name,
        normalized_name AS "normalizedName",
        metadata,
        is_active AS "isActive",
        created_at AS "createdAt"
    `;
    if (!record) throw new Error('Không thể lưu dữ liệu danh mục');
    return record;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private duplicateName(): ConflictException {
    return new ConflictException({ code: ErrorCodes.MDM_NAME_TAKEN, message: 'Tên danh mục đã tồn tại' });
  }

  private isInternalCashflowRecord(record: { category: string; normalizedName: string }): boolean {
    return record.category === MdmCategory.UNIT
      && record.normalizedName === InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET;
  }

  private internalRecordForbidden(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.RBAC_PERMISSION_DENIED,
      message: 'Không thể chỉnh sửa cấu hình nội bộ của hệ thống qua danh mục Master Data',
    });
  }
}
