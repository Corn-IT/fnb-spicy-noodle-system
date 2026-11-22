import { BadRequestException, Inject, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateProductSchema,
  ImportMenuExcelRequestSchema,
  ImportMenuExcelResponseSchema,
  MdmCategory,
  ProductSchema,
  PublicMenuResponseSchema,
  QrTokenSchema,
  UpdateProductSchema,
  type AuthPrincipal,
  type CreateProductInput,
  type ImportMenuExcelRequest,
  type UpdateProductInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeVietnameseString } from '../../common/utils/normalized-string.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

const productInclude = {
  category: { select: { id: true, name: true, isActive: true, metadata: true } },
  modifierGroups: {
    orderBy: { id: 'asc' as const },
    include: { modifiers: { orderBy: { id: 'asc' as const } } },
  },
  comboParents: { orderBy: { childProductId: 'asc' as const } },
};

type ProductRecord = {
  id: number;
  name: string;
  subtitle?: string | null;
  categoryId?: number | null;
  category?: { id: number; name: string; isActive?: boolean; metadata?: Prisma.JsonValue | null } | null;
  price: Prisma.Decimal;
  station: string;
  isAvailable: boolean;
  imageUrl: string | null;
  sortOrder: number;
  modifierGroups: Array<{
    id: number;
    name: string;
    isRequired: boolean;
    maxSelect: number;
    isAutoSelect?: boolean;
    allowSubstitution?: boolean;
    modifiers: Array<{
      id: number;
      name: string;
      extraPrice: Prisma.Decimal;
      isDefaultChecked?: boolean;
      isAvailable?: boolean;
      defaultSubstituteName?: string | null;
    }>;
  }>;
  comboParents: Array<{ childProductId: number; quantity: number }>;
};

interface CachedPublicMenuCatalog {
  expiresAt: number;
  stations: Array<{ id: number; code: string; name: string; sortOrder: number }>;
  categories: Array<{ id: number; code: string; name: string; stationCode: string | null; sortOrder: number }>;
  products: Array<ReturnType<MenuService['toProduct']>>;
}

const PUBLIC_MENU_CACHE_TTL_MS = 30_000;

@Injectable()
export class MenuService {
  private publicMenuCatalogCache: CachedPublicMenuCatalog | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  invalidatePublicMenuCache(): void {
    this.publicMenuCatalogCache = null;
  }

  private async getCachedPublicMenuCatalog(): Promise<CachedPublicMenuCatalog> {
    const now = Date.now();
    if (this.publicMenuCatalogCache && this.publicMenuCatalogCache.expiresAt > now) {
      return this.publicMenuCatalogCache;
    }

    const products = await this.prisma.product.findMany({
      where: { isAvailable: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: productInclude,
    });

    const hiddenStationCodes = new Set<string>();
    const stations: Array<{ id: number; code: string; name: string; sortOrder: number }> = [];
    const categories: Array<{ id: number; code: string; name: string; stationCode: string | null; sortOrder: number }> = [];

    if (typeof this.prisma.masterData?.findMany === 'function') {
      const stationRows = await this.prisma.masterData.findMany({
        where: { category: 'KITCHEN_STATION' },
        select: { id: true, name: true, isActive: true, metadata: true },
        orderBy: [{ id: 'asc' }],
      });
      for (const row of stationRows) {
        const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
          ? (row.metadata as { code?: string; stationCode?: string; isHidden?: boolean; sortOrder?: number })
          : {};
        const stationCode = meta.stationCode ?? meta.code;
        if (stationCode && (!row.isActive || meta.isHidden)) {
          hiddenStationCodes.add(stationCode);
        } else if (stationCode && row.isActive && !meta.isHidden) {
          stations.push({
            id: row.id,
            code: stationCode,
            name: row.name,
            sortOrder: Number(meta.sortOrder ?? 0),
          });
        }
      }
      if (stationRows.length === 0) {
        stations.push(
          { id: 1, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 },
          { id: 2, code: 'BEP_CHIEN', name: 'Bếp Chiên', sortOrder: 2 },
          { id: 3, code: 'PHA_CHE', name: 'Pha Chế', sortOrder: 3 },
          { id: 4, code: 'COMBO', name: 'Combo', sortOrder: 4 },
        );
      }
      stations.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

      const categoryRows = await this.prisma.masterData.findMany({
        where: { category: 'MENU_CATEGORY', isActive: true },
        select: { id: true, name: true, metadata: true },
        orderBy: [{ id: 'asc' }],
      });
      for (const row of categoryRows) {
        const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
          ? (row.metadata as { code?: string; defaultStation?: string; stationCode?: string; isHidden?: boolean; sortOrder?: number })
          : {};
        if (meta.isHidden) continue;
        categories.push({
          id: row.id,
          code: meta.code ?? `CAT_${row.id}`,
          name: row.name,
          stationCode: meta.defaultStation ?? meta.stationCode ?? null,
          sortOrder: Number(meta.sortOrder ?? 0),
        });
      }
      categories.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }

    const visibleProducts = products.filter((product) => {
      if (product.sortOrder < 0) return false;
      if (hiddenStationCodes.has(product.station)) return false;
      const category = (product as ProductRecord).category;
      if (category) {
        if (category.isActive === false) return false;
        const catMeta = (category.metadata && typeof category.metadata === 'object' && !Array.isArray(category.metadata))
          ? (category.metadata as { isHidden?: boolean })
          : {};
        if (catMeta.isHidden) return false;
      }
      return true;
    });

    const cached: CachedPublicMenuCatalog = {
      expiresAt: now + PUBLIC_MENU_CACHE_TTL_MS,
      stations,
      categories,
      products: visibleProducts.map((product) => this.toProduct(product as ProductRecord)),
    };
    this.publicMenuCatalogCache = cached;
    return cached;
  }

  async getPublicMenu(token: string) {
    if (!QrTokenSchema.safeParse(token).success) throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });
    const table = await this.prisma.diningTable.findUnique({
      where: { qrToken: token },
      select: { id: true, name: true, status: true, activeOrderId: true },
    });
    if (!table) throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });

    const catalog = await this.getCachedPublicMenuCatalog();

    let activeOrder: {
      orderId: number;
      orderCode: string;
      status: 'PENDING' | 'SERVING';
      totalAmount: number;
      createdAt: string;
      items: Array<{
        id: number;
        productId: number;
        productName: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        batchNo: number;
        kitchenStatus: 'NEW' | 'PRINTED' | 'CANCELLED';
        itemNote: string | null;
        modifiers: Array<{
          groupId?: number;
          modifierId?: number;
          name: string;
          extraPrice?: number;
          action?: string;
          substituteModifierId?: number;
          substituteName?: string;
          substitutedFromName?: string;
        }>;
        createdAt: string;
      }>;
    } | null = null;

    if (table.activeOrderId !== null && typeof this.prisma.order?.findUnique === 'function') {
      const order = await this.prisma.order.findUnique({
        where: { id: table.activeOrderId },
        select: {
          id: true,
          orderCode: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          items: {
            where: { kitchenStatus: { not: 'CANCELLED' } },
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              modifiersSnapshot: true,
              itemNote: true,
              batchNo: true,
              kitchenStatus: true,
              createdAt: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (order && (order.status === 'PENDING' || order.status === 'SERVING') && order.items.length > 0) {
        activeOrder = {
          orderId: order.id,
          orderCode: order.orderCode,
          status: order.status,
          totalAmount: order.totalAmount.toNumber(),
          createdAt: order.createdAt.toISOString(),
          items: order.items.map((item) => {
            const rawMods = Array.isArray(item.modifiersSnapshot) ? item.modifiersSnapshot : [];
            const modifiers = rawMods.flatMap((entry) => {
              if (!entry || typeof entry !== 'object') return [];
              const rec = entry as Record<string, unknown>;
              if (typeof rec.name !== 'string' || !rec.name.trim()) return [];
              return [{
                ...(typeof rec.groupId === 'number' ? { groupId: rec.groupId } : {}),
                ...(typeof rec.modifierId === 'number' ? { modifierId: rec.modifierId } : {}),
                name: rec.name,
                ...(rec.extraPrice !== undefined ? { extraPrice: Number(rec.extraPrice) } : {}),
                ...(typeof rec.action === 'string' ? { action: rec.action } : {}),
                ...(typeof rec.substituteModifierId === 'number' ? { substituteModifierId: rec.substituteModifierId } : {}),
                ...(typeof rec.substituteName === 'string' ? { substituteName: rec.substituteName } : {}),
                ...(typeof rec.substitutedFromName === 'string' ? { substitutedFromName: rec.substitutedFromName } : {}),
              }];
            });
            return {
              id: item.id,
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toNumber(),
              lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
              batchNo: item.batchNo,
              kitchenStatus: item.kitchenStatus as 'NEW' | 'PRINTED' | 'CANCELLED',
              itemNote: item.itemNote ?? null,
              modifiers,
              createdAt: item.createdAt.toISOString(),
            };
          }),
        };
      }
    }

    return PublicMenuResponseSchema.parse({
      table: {
        tableId: table.id,
        tableName: table.name,
        status: table.status,
        activeOrderId: table.activeOrderId,
      },
      stations: catalog.stations,
      categories: catalog.categories,
      activeOrder,
      products: catalog.products,
      updatedAt: new Date().toISOString(),
    });
  }

  async listProducts() {
    const products = await this.prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: productInclude,
    });
    return products
      .filter((product) => product.sortOrder >= 0)
      .map((product) => this.toProduct(product as ProductRecord));
  }

  async createProduct(input: CreateProductInput, actor?: AuthPrincipal) {
    const parsed = CreateProductSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu sản phẩm không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    this.assertUniqueModifierNames(parsed.data.modifierGroups);

    const product = await this.prisma.$transaction(async (tx) => {
      await this.assertPhysicalComboChildren(tx, parsed.data.station, parsed.data.comboItems);
      return tx.product.create({
        data: {
          name: parsed.data.name,
          ...(parsed.data.subtitle !== undefined ? { subtitle: parsed.data.subtitle } : {}),
          ...(parsed.data.categoryId !== undefined ? { categoryId: parsed.data.categoryId } : {}),
          price: new Prisma.Decimal(parsed.data.price),
          station: parsed.data.station,
          isAvailable: parsed.data.isAvailable,
          imageUrl: parsed.data.imageUrl,
          sortOrder: parsed.data.sortOrder,
          comboParents: {
            create: parsed.data.comboItems.map(({ productId, quantity }) => ({
              childProduct: { connect: { id: productId } }, quantity,
            })),
          },
          modifierGroups: {
            create: parsed.data.modifierGroups.map((group) => ({
              name: group.name,
              isRequired: group.isRequired,
              maxSelect: group.maxSelect,
              ...(group.isAutoSelect ? { isAutoSelect: true } : {}),
              ...(group.allowSubstitution ? { allowSubstitution: true } : {}),
              modifiers: { create: group.modifiers.map((modifier) => ({
                name: modifier.name,
                extraPrice: new Prisma.Decimal(modifier.extraPrice),
                ...(modifier.isDefaultChecked ? { isDefaultChecked: true } : {}),
                ...(modifier.isAvailable === false ? { isAvailable: false } : {}),
                ...(modifier.defaultSubstituteName ? { defaultSubstituteName: modifier.defaultSubstituteName } : {}),
              })) },
            })),
          },
        },
        include: productInclude,
      });
    });

    this.invalidatePublicMenuCache();
    this.posSocketGateway?.emitMenuUpdated();
    await this.auditLogService?.record({
      module: 'MENU',
      action: 'Thêm món ăn',
      detail: `"${product.name}" (${product.price.toNumber().toLocaleString('vi-VN')}đ)`,
      message: `thêm món ăn mới "${product.name}" (giá ${product.price.toNumber().toLocaleString('vi-VN')}đ)`,
      actor,
      metadata: { productId: product.id, productName: product.name },
    });

    return this.toProduct(product as ProductRecord);
  }

  async updateProduct(id: number, input: UpdateProductInput, actor?: AuthPrincipal) {
    const parsed = UpdateProductSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu sản phẩm không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    if (parsed.data.modifierGroups !== undefined) {
      this.assertUniqueModifierNames(parsed.data.modifierGroups);
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, include: productInclude }) as ProductRecord | null;
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy sản phẩm' });

      const station = parsed.data.station ?? existing.station;
      if (parsed.data.comboItems !== undefined) {
        await this.assertPhysicalComboChildren(tx, station, parsed.data.comboItems);
      } else if (station !== 'COMBO' && existing.station === 'COMBO') {
        await tx.comboItem.deleteMany({ where: { parentProductId: id } });
      }
      if (station === 'COMBO' && parsed.data.comboItems === undefined) {
        throw new BadRequestException({ message: 'Sản phẩm COMBO phải có ít nhất một món thành phần' });
      }

      const data: Prisma.ProductUpdateInput = {};
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.subtitle !== undefined) data.subtitle = parsed.data.subtitle;
      if (parsed.data.categoryId !== undefined) {
        data.category = parsed.data.categoryId === null
          ? { disconnect: true }
          : { connect: { id: parsed.data.categoryId } };
      }
      if (parsed.data.price !== undefined) data.price = new Prisma.Decimal(parsed.data.price);
      if (parsed.data.station !== undefined) data.station = parsed.data.station;
      if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable;
      if (parsed.data.imageUrl !== undefined) data.imageUrl = parsed.data.imageUrl;
      if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
      if (parsed.data.comboItems !== undefined) {
        data.comboParents = {
          deleteMany: {},
          create: parsed.data.comboItems.map(({ productId, quantity }) => ({
            childProduct: { connect: { id: productId } }, quantity,
          })),
        };
      }
      if (parsed.data.modifierGroups !== undefined) {
        data.modifierGroups = {
          deleteMany: {},
          create: parsed.data.modifierGroups.map((group) => ({
            name: group.name,
            isRequired: group.isRequired,
            maxSelect: group.maxSelect,
            ...(group.isAutoSelect ? { isAutoSelect: true } : {}),
            ...(group.allowSubstitution ? { allowSubstitution: true } : {}),
            modifiers: { create: group.modifiers.map((modifier) => ({
              name: modifier.name,
              extraPrice: new Prisma.Decimal(modifier.extraPrice),
              ...(modifier.isDefaultChecked ? { isDefaultChecked: true } : {}),
              ...(modifier.isAvailable === false ? { isAvailable: false } : {}),
              ...(modifier.defaultSubstituteName ? { defaultSubstituteName: modifier.defaultSubstituteName } : {}),
            })) },
          })),
        };
      }

      const updated = await tx.product.update({ where: { id }, data, include: productInclude }) as ProductRecord;
      return { existing, updated };
    });

    const product = outcome.updated;
    const prevProduct = outcome.existing;
    const changes: Array<{ field: string; from: string; to: string }> = [];
    if (prevProduct.name && prevProduct.name !== product.name) {
      changes.push({ field: 'Tên món', from: prevProduct.name, to: product.name });
    }
    if (parsed.data.subtitle !== undefined && (prevProduct.subtitle ?? '') !== (product.subtitle ?? '')) {
      changes.push({ field: 'Mô tả phụ', from: prevProduct.subtitle || 'Trống', to: product.subtitle || 'Trống' });
    }
    if (parsed.data.price !== undefined && prevProduct.price !== undefined) {
      const oldPrice = prevProduct.price.toNumber();
      const newPrice = product.price.toNumber();
      if (oldPrice !== newPrice) {
        changes.push({ field: 'Đơn giá', from: `${oldPrice.toLocaleString('vi-VN')}đ`, to: `${newPrice.toLocaleString('vi-VN')}đ` });
      }
    }
    if (parsed.data.station !== undefined && prevProduct.station !== product.station) {
      changes.push({ field: 'Khu vực bếp', from: prevProduct.station, to: product.station });
    }
    if (parsed.data.categoryId !== undefined && prevProduct.categoryId !== product.categoryId) {
      changes.push({
        field: 'Danh mục',
        from: prevProduct.category?.name ?? 'Chưa phân nhóm',
        to: product.category?.name ?? 'Chưa phân nhóm',
      });
    }
    if (parsed.data.isAvailable !== undefined && prevProduct.isAvailable !== product.isAvailable) {
      changes.push({
        field: 'Trạng thái',
        from: prevProduct.isAvailable ? 'Đang bán' : 'Đang ẩn',
        to: product.isAvailable ? 'Đang bán' : 'Đang ẩn',
      });
    }
    if (parsed.data.modifierGroups !== undefined && Array.isArray(prevProduct.modifierGroups)) {
      const oldGroups = prevProduct.modifierGroups.map((g) => `${g.name} (${g.modifiers.length})`).join(', ');
      const newGroups = product.modifierGroups.map((g) => `${g.name} (${g.modifiers.length})`).join(', ');
      if (oldGroups !== newGroups) {
        changes.push({ field: 'Nhóm tuỳ chọn', from: oldGroups || 'Không có', to: newGroups || 'Không có' });
      }
      const oldOut = prevProduct.modifierGroups.flatMap((g) => g.modifiers).filter((m) => m.isAvailable === false).map((m) => m.name);
      const newOut = product.modifierGroups.flatMap((g) => g.modifiers).filter((m) => m.isAvailable === false).map((m) => m.name);
      if (oldOut.join(', ') !== newOut.join(', ')) {
        changes.push({ field: 'Topping tạm hết', from: oldOut.join(', ') || 'Không có', to: newOut.join(', ') || 'Không có' });
      }
    }

    this.invalidatePublicMenuCache();
    this.posSocketGateway?.emitMenuUpdated();
    const unavailableToppings = (parsed.data.modifierGroups ?? [])
      .flatMap((group) => group.modifiers)
      .filter((mod) => mod.isAvailable === false)
      .map((mod) => mod.name);
    const updateMessage = unavailableToppings.length > 0
      ? `cập nhật món ăn (đánh dấu Tạm hết topping: ${unavailableToppings.join(', ')})`
      : 'cập nhật thông tin món ăn';
    await this.auditLogService?.record({
      module: 'MENU',
      action: 'Cập nhật món ăn',
      detail: `"${product.name}"`,
      message: updateMessage,
      actor,
      metadata: {
        productId: product.id,
        productName: product.name,
        ...(product.category?.name ? { categoryLabel: product.category.name } : {}),
        ...(unavailableToppings.length > 0 ? { unavailableToppings } : {}),
        ...(changes.length > 0 ? { changes } : {}),
      },
    });

    return this.toProduct(product as ProductRecord);
  }

  async deleteProduct(id: number, actor?: AuthPrincipal) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id },
        include: {
          _count: { select: { orderItems: true, comboChildren: true } },
        },
      });
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy sản phẩm' });

      if (typeof tx.orderItem?.count === 'function') {
        const activeOrderItemsCount = await tx.orderItem.count({
          where: {
            productId: id,
            kitchenStatus: { not: 'CANCELLED' },
            order: { status: { in: ['PENDING', 'SERVING'] } },
          },
        });
        if (activeOrderItemsCount > 0) {
          throw new BadRequestException({
            code: 'PRODUCT_IN_ACTIVE_ORDER',
            message: 'Không thể xoá món ăn đang có trong hoá đơn đang phục vụ. Vui lòng dùng tính năng Ẩn món.',
          });
        }
      }

      if (existing._count.comboChildren > 0) {
        const activeComboParents = typeof tx.comboItem?.count === 'function'
          ? await tx.comboItem.count({
              where: { childProductId: id, parentProduct: { sortOrder: { gte: 0 } } },
            })
          : existing._count.comboChildren;
        if (activeComboParents > 0) {
          throw new BadRequestException({
            code: 'PRODUCT_IN_COMBO',
            message: 'Không thể xoá món ăn đang là thành phần của Combo. Vui lòng xoá hoặc gỡ khỏi Combo trước, hoặc dùng tính năng Ẩn món.',
          });
        }
      }

      if (existing._count.orderItems > 0 || existing._count.comboChildren > 0) {
        await tx.product.update({
          where: { id },
          data: {
            isAvailable: false,
            category: { disconnect: true },
            sortOrder: -9999,
            comboParents: { deleteMany: {} },
          },
        });
        return {
          deleted: true,
          softDisabled: false,
          id,
          name: existing.name,
        };
      }

      await tx.product.delete({ where: { id } });
      return {
        deleted: true,
        softDisabled: false,
        id,
        name: existing.name,
      };
    });

    this.invalidatePublicMenuCache();
    this.posSocketGateway?.emitMenuUpdated();
    const productName = 'name' in result && result.name ? result.name : `#${id}`;
    await this.auditLogService?.record({
      module: 'MENU',
      action: 'Xoá món ăn',
      detail: `"${productName}"`,
      message: `xoá món ăn "${productName}" khỏi thực đơn`,
      actor,
      metadata: { productId: id, productName },
    });

    return { deleted: result.deleted, softDisabled: result.softDisabled, id: result.id };
  }

  async importProductsExcel(input: ImportMenuExcelRequest, actor?: AuthPrincipal) {
    const parsed = ImportMenuExcelRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu nhập từ file Excel không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const resolveStationCode = (
      rawStation: string | undefined,
      stationRows: Array<{ name: string; metadata: Prisma.JsonValue }>,
    ): string => {
      const normalized = normalizeVietnameseString(rawStation ?? '');
      if (!normalized || normalized === 'bep nau' || normalized === 'bep_nau') return 'BEP_NAU';
      if (normalized === 'bep chien' || normalized === 'bep_chien') return 'BEP_CHIEN';
      if (normalized === 'pha che' || normalized === 'pha_che') return 'PHA_CHE';
      if (normalized === 'combo') return 'COMBO';
      for (const row of stationRows) {
        const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
          ? (row.metadata as { code?: string; stationCode?: string })
          : {};
        const code = meta.stationCode ?? meta.code;
        if (code && (normalizeVietnameseString(row.name) === normalized || normalizeVietnameseString(code) === normalized)) {
          return code;
        }
      }
      return 'BEP_NAU';
    };

    const summary = await this.prisma.$transaction(async (tx) => {
      const existingProducts = (await tx.product.findMany({
        where: { sortOrder: { gte: 0 } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: productInclude,
      })) as ProductRecord[];

      const stationRows = typeof tx.masterData?.findMany === 'function'
        ? await tx.masterData.findMany({
            where: { category: MdmCategory.KITCHEN_STATION },
            select: { name: true, metadata: true },
          })
        : [];

      const categoryRows = typeof tx.masterData?.findMany === 'function'
        ? await tx.masterData.findMany({
            where: { category: MdmCategory.MENU_CATEGORY },
            select: { id: true, name: true, normalizedName: true, isActive: true },
          })
        : [];

      const categoryByNormalized = new Map(
        categoryRows.map((c) => [c.normalizedName, c]),
      );

      const existingByNormalizedName = new Map<string, ProductRecord>();
      for (const prod of existingProducts) {
        const key = normalizeVietnameseString(prod.name);
        if (!existingByNormalizedName.has(key)) {
          existingByNormalizedName.set(key, prod);
        }
      }

      const matchedProductIds = new Set<number>();
      let createdCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;
      const skippedActiveOrderProducts: string[] = [];
      let nextSortOrder = existingProducts.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;

      for (const row of parsed.data.items) {
        const normalizedProductName = normalizeVietnameseString(row.name);
        if (!normalizedProductName) continue;

        const mappedStation = resolveStationCode(row.station, stationRows);

        let resolvedCategoryId: number | null = null;
        const cleanCategoryName = row.categoryName?.trim() ?? '';
        const normalizedCategory = normalizeVietnameseString(cleanCategoryName);
        if (cleanCategoryName && normalizedCategory !== 'chua phan nhom') {
          const foundCategory = categoryByNormalized.get(normalizedCategory);
          if (foundCategory) {
            if (!foundCategory.isActive && typeof tx.masterData?.update === 'function') {
              await tx.masterData.update({
                where: { id: foundCategory.id },
                data: { isActive: true },
              });
            }
            resolvedCategoryId = foundCategory.id;
          } else if (typeof tx.masterData?.create === 'function') {
            const createdCategory = await tx.masterData.create({
              data: {
                category: MdmCategory.MENU_CATEGORY,
                name: cleanCategoryName,
                normalizedName: normalizedCategory,
                isActive: true,
                metadata: {
                  defaultStation: mappedStation === 'COMBO' ? 'COMBO' : mappedStation,
                  stationCode: mappedStation === 'COMBO' ? 'COMBO' : mappedStation,
                },
              },
              select: { id: true, name: true, normalizedName: true, isActive: true },
            });
            categoryByNormalized.set(normalizedCategory, createdCategory);
            resolvedCategoryId = createdCategory.id;
          }
        }

        const existing = existingByNormalizedName.get(normalizedProductName);
        if (existing) {
          matchedProductIds.add(existing.id);

          const nextSubtitle = row.subtitle !== undefined ? (row.subtitle?.trim() || null) : existing.subtitle ?? null;
          const nextStation =
            mappedStation === 'COMBO' && existing.station !== 'COMBO' && existing.comboParents.length === 0
              ? existing.station
              : mappedStation;

          const updateData: Prisma.ProductUpdateInput = {
            name: row.name.trim(),
            subtitle: nextSubtitle,
            category: resolvedCategoryId === null
              ? { disconnect: true }
              : { connect: { id: resolvedCategoryId } },
            price: new Prisma.Decimal(row.price),
            station: nextStation,
            isAvailable: row.isAvailable,
            sortOrder: row.sortOrder > 0 ? row.sortOrder : existing.sortOrder,
          };

          if (nextStation !== 'COMBO' && existing.station === 'COMBO') {
            updateData.comboParents = { deleteMany: {} };
          }

          if (row.modifierGroupsText !== undefined && (row.modifierGroupsText === null || row.modifierGroupsText.trim() === '')) {
            updateData.modifierGroups = { deleteMany: {} };
          }

          await tx.product.update({
            where: { id: existing.id },
            data: updateData,
          });
          updatedCount += 1;
        } else {
          const safeCreateStation = mappedStation === 'COMBO' ? 'BEP_NAU' : mappedStation;
          const created = await tx.product.create({
            data: {
              name: row.name.trim(),
              subtitle: row.subtitle?.trim() || null,
              ...(resolvedCategoryId !== null ? { categoryId: resolvedCategoryId } : {}),
              price: new Prisma.Decimal(row.price),
              station: safeCreateStation,
              isAvailable: row.isAvailable,
              sortOrder: row.sortOrder > 0 ? row.sortOrder : nextSortOrder++,
            },
            include: productInclude,
          });
          existingByNormalizedName.set(normalizedProductName, created as ProductRecord);
          matchedProductIds.add(created.id);
          createdCount += 1;
        }
      }

      if (parsed.data.syncMissingAsDeleted) {
        for (const existing of existingProducts) {
          if (matchedProductIds.has(existing.id)) continue;

          if (typeof tx.orderItem?.count === 'function') {
            const activeOrderItemsCount = await tx.orderItem.count({
              where: {
                productId: existing.id,
                kitchenStatus: { not: 'CANCELLED' },
                order: { status: { in: ['PENDING', 'SERVING'] } },
              },
            });
            if (activeOrderItemsCount > 0) {
              await tx.product.update({
                where: { id: existing.id },
                data: { isAvailable: false },
              });
              skippedActiveOrderProducts.push(existing.name);
              continue;
            }
          }

          const counts = typeof tx.product.findUnique === 'function'
            ? await tx.product.findUnique({
                where: { id: existing.id },
                select: { _count: { select: { orderItems: true, comboChildren: true } } },
              })
            : null;
          const hasRefs = (counts?._count.orderItems ?? 0) > 0 || (counts?._count.comboChildren ?? 0) > 0;
          if (hasRefs) {
            await tx.product.update({
              where: { id: existing.id },
              data: {
                isAvailable: false,
                category: { disconnect: true },
                sortOrder: -9999,
                comboParents: { deleteMany: {} },
              },
            });
          } else {
            await tx.product.delete({ where: { id: existing.id } });
          }
          deletedCount += 1;
        }
      }

      return {
        createdCount,
        updatedCount,
        deletedCount,
        skippedActiveOrderProducts,
      };
    });

    this.invalidatePublicMenuCache();
    this.posSocketGateway?.emitMenuUpdated();
    await this.auditLogService?.record({
      module: 'MENU',
      action: 'Nhập file Excel',
      detail: `Tạo mới ${summary.createdCount}, cập nhật ${summary.updatedCount}, xoá ${summary.deletedCount} món`,
      message: `đồng bộ thực đơn từ file Excel (tạo mới ${summary.createdCount} món, cập nhật ${summary.updatedCount} món, xoá ${summary.deletedCount} món)`,
      actor,
      metadata: summary,
    });

    return ImportMenuExcelResponseSchema.parse(summary);
  }

  private async assertPhysicalComboChildren(
    tx: Prisma.TransactionClient,
    station: string,
    comboItems: Array<{ productId: number; quantity: number }>,
  ): Promise<void> {
    if (station !== 'COMBO') {
      if (comboItems.length > 0) throw new BadRequestException({ message: 'Món thường không được có món thành phần' });
      return;
    }
    if (comboItems.length === 0) throw new BadRequestException({ message: 'Sản phẩm COMBO phải có ít nhất một món thành phần' });

    const childIds = [...new Set(comboItems.map(({ productId }) => productId))];
    const children = await tx.product.findMany({
      where: { id: { in: childIds } },
      select: { id: true, station: true },
    });
    if (children.length !== childIds.length || children.some(({ station: childStation }) => childStation === 'COMBO')) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Món thành phần phải tồn tại và thuộc một trạm bếp thực',
      });
    }
  }

  private assertUniqueModifierNames(
    groups: Array<{ modifiers: Array<{ name: string }> }>,
  ): void {
    for (const group of groups) {
      const seen = new Set<string>();
      for (const modifier of group.modifiers) {
        const normalizedName = normalizeVietnameseString(modifier.name);
        if (seen.has(normalizedName)) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu tuỳ chọn món không hợp lệ',
            details: {
              fieldErrors: {
                modifierGroups: ['Tên topping bị trùng sau khi chuẩn hoá không dấu'],
              },
            },
          });
        }
        seen.add(normalizedName);
      }
    }
  }

  private toProduct(record: ProductRecord) {
    const isCategoryActive = record.category ? record.category.isActive !== false : true;
    return ProductSchema.parse({
      id: record.id,
      name: record.name,
      subtitle: record.subtitle ?? null,
      categoryId: isCategoryActive ? (record.categoryId ?? record.category?.id ?? null) : null,
      categoryName: isCategoryActive ? (record.category?.name ?? null) : null,
      price: record.price.toNumber(),
      station: record.station,
      isAvailable: record.isAvailable,
      imageUrl: record.imageUrl,
      sortOrder: record.sortOrder,
      modifierGroups: record.modifierGroups.map((group) => ({
        id: group.id,
        name: group.name,
        isRequired: group.isRequired,
        maxSelect: group.maxSelect,
        isAutoSelect: group.isAutoSelect ?? false,
        allowSubstitution: group.allowSubstitution ?? false,
        modifiers: group.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          extraPrice: modifier.extraPrice.toNumber(),
          isDefaultChecked: modifier.isDefaultChecked ?? false,
          isAvailable: modifier.isAvailable ?? true,
          defaultSubstituteName: modifier.defaultSubstituteName ?? null,
        })),
      })),
      comboItems: record.comboParents.map(({ childProductId, quantity }) => ({ productId: childProductId, quantity })),
    });
  }
}
