import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type MasterData } from '@prisma/client';
import {
  CreateInventoryImportBatchSchema,
  ErrorCodes,
  InventoryImportFilterQuerySchema,
  MdmCategory,
  type AuthPrincipal,
  type CreateInventoryImportBatchInput,
  type InventoryImportFilterQuery,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateString, dateOnly, nextDateOnly } from '../../common/utils/business-date.util';
import { MdmService } from '../mdm/mdm.service';

const DECIMAL_ROUNDING = Prisma.Decimal.ROUND_HALF_UP;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MdmService) private readonly mdmService: MdmService,
  ) {}

  async createBatch(input: CreateInventoryImportBatchInput, userId: number) {
    const parsed = CreateInventoryImportBatchSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu nhập hàng không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const batch = parsed.data;
    const importDate = dateOnly(batch.importDate);
    const created = await this.prisma.$transaction(async (tx) => {
      const imports = [];
      let batchTotal = new Prisma.Decimal(0);
      const supplier = await this.resolveSupplier(batch, tx);

      for (const item of batch.items) {
        const unit = await this.mdmService.findOrCreate(MdmCategory.UNIT, item.unitName, {}, tx);
        const ingredientName = await this.resolveIngredientName(item, tx);
        const unitPrice = new Prisma.Decimal(item.unitPrice.toString());
        const quantity = new Prisma.Decimal(item.quantity.toString());
        const totalCost = unitPrice.mul(quantity).toDecimalPlaces(2, DECIMAL_ROUNDING);
        if (totalCost.greaterThan('9999999999.99')) {
          throw new UnprocessableEntityException({
            code: ErrorCodes.VALIDATION_FAILED,
            message: 'Thành tiền vượt giới hạn NUMERIC(12,2)',
          });
        }

        const ingredient = await this.mdmService.findOrCreate(
          MdmCategory.INGREDIENT,
          ingredientName,
          { default_unit: unit.name, last_price: unitPrice.toNumber() },
          tx,
        );
        const createdImport = await tx.inventoryImport.create({
          data: {
            ingredientMdmId: ingredient.id,
            supplierMdmId: supplier.id,
            supplierNameSnapshot: supplier.name,
            itemNameSnapshot: ingredient.name,
            unitName: unit.name,
            unitPrice,
            quantity,
            totalCost,
            paymentSource: batch.paymentSource,
            importDate,
            note: batch.note,
            createdBy: userId,
          },
        });
        imports.push(createdImport);
        batchTotal = batchTotal.plus(totalCost);
      }

      return { imports, totalCost: batchTotal };
    });

    this.logger.log(`Inventory import batch created: userId=${userId}, items=${created.imports.length}, total=${created.totalCost.toFixed(2)}`);
    return {
      items: created.imports.map((item) => this.toImportResponse(item)),
      totalCost: created.totalCost.toNumber(),
    };
  }

  async list(input: InventoryImportFilterQuery) {
    const parsed = InventoryImportFilterQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Bộ lọc nhập hàng không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const { page, limit, fromDate, toDate, keyword, paymentSource, ingredientMdmId } = parsed.data;
    const where: Prisma.InventoryImportWhereInput = {
      isDeleted: false,
      ...(paymentSource ? { paymentSource } : {}),
      ...(ingredientMdmId ? { ingredientMdmId } : {}),
      ...(keyword ? { itemNameSnapshot: { contains: keyword, mode: 'insensitive' } } : {}),
      ...(fromDate || toDate ? {
        importDate: {
          ...(fromDate ? { gte: dateOnly(fromDate) } : {}),
          ...(toDate ? { lt: nextDateOnly(toDate) } : {}),
        },
      } : {}),
    };

    const [items, total, groupedCosts] = await Promise.all([
      this.prisma.inventoryImport.findMany({
        where,
        orderBy: [{ importDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryImport.count({ where }),
      this.prisma.inventoryImport.groupBy({ by: ['paymentSource'], where, _sum: { totalCost: true } }),
    ]);

    const cashDrawerTotal = this.groupTotal(groupedCosts, 'CASH_DRAWER');
    const externalTotal = this.groupTotal(groupedCosts, 'EXTERNAL');
    return {
      page,
      limit,
      total,
      items: items.map((item) => this.toImportResponse(item)),
      summary: {
        totalImportCost: cashDrawerTotal.plus(externalTotal).toNumber(),
        totalCashDrawerCost: cashDrawerTotal.toNumber(),
        totalExternalCost: externalTotal.toNumber(),
      },
    };
  }

  async softDelete(id: number, user: AuthPrincipal) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM inventory_imports WHERE id = ${id} FOR UPDATE`;
      const inventoryImport = await tx.inventoryImport.findUnique({ where: { id } });
      if (!inventoryImport) throw new NotFoundException('Không tìm thấy phiếu nhập hàng');
      if (inventoryImport.isDeleted) {
        throw new ConflictException({
          code: ErrorCodes.INVENTORY_ALREADY_DELETED,
          message: 'Phiếu nhập hàng đã được xoá',
        });
      }

      const sameBusinessDay = businessDateString(inventoryImport.createdAt) === businessDateString(new Date());
      const canDeleteHistoricalImport = user.isSuperAdmin || user.permissions.inventory.update;
      if (!sameBusinessDay && !canDeleteHistoricalImport) {
        throw new ForbiddenException({
          code: ErrorCodes.INVENTORY_PAST_SHIFT_FORBIDDEN,
          message: 'Chỉ Quản lý hoặc Super Admin được xoá phiếu nhập của ngày trước',
        });
      }

      const deleted = await tx.inventoryImport.update({ where: { id }, data: { isDeleted: true } });
      this.logger.log(`Inventory import soft-deleted: importId=${id}, userId=${user.id}`);
      return this.toImportResponse(deleted);
    });
  }

  private async resolveIngredientName(
    item: CreateInventoryImportBatchInput['items'][number],
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const rawName = item.ingredientName ?? item.itemNameSnapshot;
    if (rawName) return rawName;

    const selected = await tx.masterData.findUnique({ where: { id: item.ingredientMdmId } });
    if (!selected || selected.category !== MdmCategory.INGREDIENT || !selected.isActive) {
      throw new NotFoundException('Không tìm thấy nguyên liệu đang hoạt động');
    }
    return selected.name;
  }

  private async resolveSupplier(
    batch: CreateInventoryImportBatchInput,
    tx: Prisma.TransactionClient,
  ): Promise<MasterData> {
    if (batch.supplierMdmId !== undefined) {
      const selected = await tx.masterData.findUnique({ where: { id: batch.supplierMdmId } });
      if (!selected || selected.category !== MdmCategory.SUPPLIER || !selected.isActive) {
        throw new NotFoundException('Không tìm thấy nhà cung cấp đang hoạt động');
      }
      return selected;
    }

    if (!batch.supplierName) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Phải chọn hoặc nhập nhà cung cấp',
      });
    }
    return this.mdmService.findOrCreate(MdmCategory.SUPPLIER, batch.supplierName, {}, tx);
  }

  private groupTotal(groups: Array<{ paymentSource: string; _sum: { totalCost: Prisma.Decimal | null } }>, source: string) {
    return groups.find((group) => group.paymentSource === source)?._sum.totalCost ?? new Prisma.Decimal(0);
  }

  private toImportResponse<T extends {
    unitPrice: Prisma.Decimal;
    quantity: Prisma.Decimal;
    totalCost: Prisma.Decimal;
  }>(item: T) {
    return {
      ...item,
      unitPrice: item.unitPrice.toNumber(),
      quantity: item.quantity.toNumber(),
      totalCost: item.totalCost.toNumber(),
    };
  }
}
