import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type MasterData } from '@prisma/client';
import {
  CreateInventoryImportBatchSchema,
  ErrorCodes,
  InventoryImportFilterQuerySchema,
  MdmCategory,
  UpdateInventoryImportSchema,
  type AuthPrincipal,
  type CreateInventoryImportBatchInput,
  type InventoryImportFilterQuery,
  type UpdateInventoryImportInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
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
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
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

    const sourceLabel = batch.paymentSource === 'CASH_DRAWER' ? 'Tiền két' : 'Tiền ngoài';
    const totalFormatted = `${created.totalCost.toNumber().toLocaleString('vi-VN')}đ`;
    this.logger.log(`Inventory import batch created: userId=${userId}, items=${created.imports.length}, total=${created.totalCost.toFixed(2)}`);
    await this.auditLogService?.record({
      module: 'INVENTORY',
      action: 'Tạo phiếu nhập kho',
      detail: `${created.imports.length} mặt hàng (${totalFormatted})`,
      message: `tạo phiếu nhập kho gồm ${created.imports.length} mặt hàng từ nguồn ${sourceLabel} với tổng chi phí ${totalFormatted}`,
      actor: userId,
      metadata: {
        itemCount: created.imports.length,
        totalCost: created.totalCost.toNumber(),
        paymentSourceLabel: sourceLabel,
      },
    });
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

  async updateImport(id: number, input: UpdateInventoryImportInput, user: AuthPrincipal) {
    const parsed = UpdateInventoryImportSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu cập nhật phiếu nhập hàng không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const dto = parsed.data;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM inventory_imports WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.inventoryImport.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Không tìm thấy phiếu nhập hàng');
      if (existing.isDeleted) {
        throw new ConflictException({
          code: ErrorCodes.INVENTORY_ALREADY_DELETED,
          message: 'Phiếu nhập hàng đã được xoá, không thể chỉnh sửa',
        });
      }

      const unit = await this.mdmService.findOrCreate(MdmCategory.UNIT, dto.unitName, {}, tx);
      const ingredientName = await this.resolveIngredientName(
        {
          ingredientMdmId: dto.ingredientMdmId,
          ingredientName: dto.ingredientName,
          unitName: dto.unitName,
          unitPrice: dto.unitPrice,
          quantity: dto.quantity,
        },
        tx,
      );
      const unitPrice = new Prisma.Decimal(dto.unitPrice.toString());
      const quantity = new Prisma.Decimal(dto.quantity.toString());
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

      let supplierId = existing.supplierMdmId;
      let supplierNameSnapshot = existing.supplierNameSnapshot;
      if (dto.supplierMdmId !== undefined || dto.supplierName !== undefined) {
        const supplier = await this.resolveSupplier(
          { supplierMdmId: dto.supplierMdmId, supplierName: dto.supplierName } as CreateInventoryImportBatchInput,
          tx,
        );
        supplierId = supplier.id;
        supplierNameSnapshot = supplier.name;
      }

      const updated = await tx.inventoryImport.update({
        where: { id },
        data: {
          ingredientMdmId: ingredient.id,
          supplierMdmId: supplierId,
          supplierNameSnapshot,
          itemNameSnapshot: ingredient.name,
          unitName: unit.name,
          unitPrice,
          quantity,
          totalCost,
          paymentSource: dto.paymentSource,
          importDate: dateOnly(dto.importDate),
          note: dto.note ?? null,
        },
      });

      const sourceLabel = dto.paymentSource === 'CASH_DRAWER' ? 'Tiền két' : 'Quỹ ngoài';
      const costFormatted = `${totalCost.toNumber().toLocaleString('vi-VN')}đ`;
      const fmtMoney = (v: number) => `${v.toLocaleString('vi-VN')}đ`;
      const fmtDate = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
      const toNum = (v: unknown) =>
        v !== null && v !== undefined && typeof (v as { toNumber?: () => number }).toNumber === 'function'
          ? (v as { toNumber: () => number }).toNumber()
          : Number(v ?? 0);

      const changes: Array<{ field: string; from: string; to: string }> = [];
      const prev = existing as Record<string, unknown> | undefined;
      if (prev) {
        if (typeof prev.itemNameSnapshot === 'string' && prev.itemNameSnapshot !== ingredient.name) {
          changes.push({ field: 'Nguyên liệu', from: prev.itemNameSnapshot, to: ingredient.name });
        }
        const oldSupplier = typeof prev.supplierNameSnapshot === 'string' ? prev.supplierNameSnapshot : '';
        const newSupplier = supplierNameSnapshot ?? '';
        if (oldSupplier !== newSupplier) {
          changes.push({ field: 'Nhà cung cấp', from: oldSupplier || 'Không có', to: newSupplier || 'Không có' });
        }
        if (typeof prev.unitName === 'string' && prev.unitName !== unit.name) {
          changes.push({ field: 'Đơn vị tính', from: prev.unitName, to: unit.name });
        }
        if (prev.quantity !== undefined) {
          const oldQty = toNum(prev.quantity);
          const newQty = quantity.toNumber();
          if (oldQty !== newQty) {
            changes.push({ field: 'Số lượng', from: String(oldQty), to: String(newQty) });
          }
        }
        if (prev.unitPrice !== undefined) {
          const oldPrice = toNum(prev.unitPrice);
          const newPrice = unitPrice.toNumber();
          if (oldPrice !== newPrice) {
            changes.push({ field: 'Đơn giá', from: fmtMoney(oldPrice), to: fmtMoney(newPrice) });
          }
        }
        if (prev.totalCost !== undefined) {
          const oldTotal = toNum(prev.totalCost);
          const newTotal = totalCost.toNumber();
          if (oldTotal !== newTotal) {
            changes.push({ field: 'Thành tiền', from: fmtMoney(oldTotal), to: costFormatted });
          }
        }
        if (typeof prev.paymentSource === 'string' && prev.paymentSource !== dto.paymentSource) {
          const oldSourceLabel = prev.paymentSource === 'CASH_DRAWER' ? 'Tiền két' : 'Quỹ ngoài';
          changes.push({ field: 'Nguồn tiền', from: oldSourceLabel, to: sourceLabel });
        }
        if (prev.importDate instanceof Date) {
          const oldDateStr = prev.importDate.toISOString().slice(0, 10);
          if (oldDateStr !== dto.importDate) {
            changes.push({
              field: 'Ngày nhập',
              from: fmtDate(prev.importDate),
              to: fmtDate(dateOnly(dto.importDate)),
            });
          }
        }
        const oldNote = typeof prev.note === 'string' ? prev.note.trim() : '';
        const newNote = (dto.note ?? '').trim();
        if (oldNote !== newNote) {
          changes.push({ field: 'Ghi chú', from: oldNote || 'Trống', to: newNote || 'Trống' });
        }
      }

      this.logger.log(`Inventory import updated: importId=${id}, userId=${user.id}`);
      await this.auditLogService?.record({
        module: 'INVENTORY',
        action: 'Chỉnh sửa phiếu nhập kho',
        detail: `${ingredient.name} (${costFormatted})`,
        message: 'chỉnh sửa phiếu nhập kho',
        actor: user.id,
        metadata: {
          importId: id,
          itemName: ingredient.name,
          totalCost: totalCost.toNumber(),
          paymentSourceLabel: sourceLabel,
          ...(changes.length > 0 ? { changes } : {}),
        },
        tx,
      });

      return this.toImportResponse(updated);
    });
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
      const sourceLabel = inventoryImport.paymentSource === 'CASH_DRAWER' ? 'Tiền két' : 'Tiền ngoài';
      const costFormatted = `${inventoryImport.totalCost.toNumber().toLocaleString('vi-VN')}đ`;
      this.logger.log(`Inventory import soft-deleted: importId=${id}, userId=${user.id}`);
      await this.auditLogService?.record({
        module: 'INVENTORY',
        action: 'Huỷ phiếu nhập kho',
        detail: `${inventoryImport.itemNameSnapshot} (${costFormatted})`,
        message: `huỷ phiếu nhập kho mặt hàng "${inventoryImport.itemNameSnapshot}" (nguồn ${sourceLabel}, giá trị ${costFormatted})`,
        actor: user.id,
        metadata: {
          importId: id,
          itemName: inventoryImport.itemNameSnapshot,
          paymentSourceLabel: sourceLabel,
        },
        tx,
      });
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
