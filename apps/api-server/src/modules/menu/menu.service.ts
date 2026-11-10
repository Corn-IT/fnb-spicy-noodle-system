import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateProductSchema,
  ProductSchema,
  PublicMenuResponseSchema,
  QrTokenSchema,
  UpdateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeVietnameseString } from '../../common/utils/normalized-string.util';

const productInclude = {
  category: { select: { id: true, name: true } },
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
  category?: { id: number; name: string } | null;
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
      defaultSubstituteName?: string | null;
    }>;
  }>;
  comboParents: Array<{ childProductId: number; quantity: number }>;
};

@Injectable()
export class MenuService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getPublicMenu(token: string) {
    if (!QrTokenSchema.safeParse(token).success) throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });
    const table = await this.prisma.diningTable.findUnique({
      where: { qrToken: token },
      select: { id: true, name: true, status: true, activeOrderId: true },
    });
    if (!table) throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });

    const products = await this.prisma.product.findMany({
      where: { isAvailable: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: productInclude,
    });

    return PublicMenuResponseSchema.parse({
      table: {
        tableId: table.id,
        tableName: table.name,
        status: table.status,
        activeOrderId: table.activeOrderId,
      },
      products: products.map((product) => this.toProduct(product as ProductRecord)),
      updatedAt: new Date().toISOString(),
    });
  }

  async listProducts() {
    const products = await this.prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: productInclude,
    });
    return products.map((product) => this.toProduct(product as ProductRecord));
  }

  async createProduct(input: CreateProductInput) {
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
                ...(modifier.defaultSubstituteName ? { defaultSubstituteName: modifier.defaultSubstituteName } : {}),
              })) },
            })),
          },
        },
        include: productInclude,
      });
    });

    return this.toProduct(product as ProductRecord);
  }

  async updateProduct(id: number, input: UpdateProductInput) {
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

    const product = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, select: { id: true, station: true } });
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
              ...(modifier.defaultSubstituteName ? { defaultSubstituteName: modifier.defaultSubstituteName } : {}),
            })) },
          })),
        };
      }

      return tx.product.update({ where: { id }, data, include: productInclude });
    });

    return this.toProduct(product as ProductRecord);
  }

  async deleteProduct(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id },
        include: {
          _count: { select: { orderItems: true, comboChildren: true } },
        },
      });
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy sản phẩm' });

      if (existing._count.orderItems > 0 || existing._count.comboChildren > 0) {
        const disabled = await tx.product.update({
          where: { id },
          data: { isAvailable: false },
          include: productInclude,
        });
        return {
          deleted: false,
          softDisabled: true,
          product: this.toProduct(disabled as ProductRecord),
        };
      }

      await tx.product.delete({ where: { id } });
      return {
        deleted: true,
        softDisabled: false,
        id,
      };
    });
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
    return ProductSchema.parse({
      id: record.id,
      name: record.name,
      subtitle: record.subtitle ?? null,
      categoryId: record.categoryId ?? record.category?.id ?? null,
      categoryName: record.category?.name ?? null,
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
          defaultSubstituteName: modifier.defaultSubstituteName ?? null,
        })),
      })),
      comboItems: record.comboParents.map(({ childProductId, quantity }) => ({ productId: childProductId, quantity })),
    });
  }
}
