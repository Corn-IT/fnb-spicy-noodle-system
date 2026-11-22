import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateOrderDiscount,
  CreateDiscountSchema,
  DiscountFilterQuerySchema,
  DiscountRecordSchema,
  ErrorCodes,
  evaluateDiscountScheduleWindow,
  MdmCategory,
  ToggleDiscountStatusSchema,
  UpdateDiscountSchema,
  type ApplicableDiscountItem,
  type CreateDiscountInput,
  type DiscountCalculableItem,
  type DiscountFilterQuery,
  type DiscountListResponse,
  type DiscountRecord,
  type DiscountScope,
  type DiscountValueType,
  type ToggleDiscountStatusInput,
  type UpdateDiscountInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeVietnameseString } from '../../common/utils/normalized-string.util';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface DiscountTargetWithRefs {
  id: number;
  discountId: number;
  categoryId: number | null;
  productId: number | null;
  category?: { id: number; name: string } | null;
  product?: { id: number; name: string } | null;
}

export interface DiscountEntityWithTargets {
  id: number;
  code: string;
  name: string;
  valueType: string;
  value: Prisma.Decimal;
  maxDiscountAmount: Prisma.Decimal | null;
  scope: string;
  minOrderAmount: Prisma.Decimal | null;
  startsAt: Date | null;
  endsAt: Date | null;
  activeWeekdays: Prisma.JsonValue;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  isArchived: boolean;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
  targets: DiscountTargetWithRefs[];
}

const TARGET_INCLUDE = {
  targets: {
    include: {
      category: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  },
} as const;

function parseWeekdaysJson(raw: Prisma.JsonValue): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => Number(entry))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

function sameSortedIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

function decimalOrNullEquals(
  existing: Prisma.Decimal | null,
  candidate: number | null | undefined,
): boolean {
  const normalizedCandidate = candidate ?? null;
  if (existing === null && normalizedCandidate === null) return true;
  if (existing === null || normalizedCandidate === null) return false;
  return existing.equals(new Prisma.Decimal(normalizedCandidate));
}

@Injectable()
export class DiscountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  async list(queryInput: unknown, now = new Date()): Promise<DiscountListResponse> {
    const query = this.parseInput<DiscountFilterQuery>(DiscountFilterQuerySchema, queryInput);
    if (query.status === 'active') {
      const baseAnd: Prisma.DiscountWhereInput[] = [
        { isArchived: false },
        { isActive: true },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ];
      if (query.scope) {
        baseAnd.push({ scope: query.scope });
      }
      return this.queryPaginatedList({ AND: baseAnd }, query.page, query.limit, query.keyword);
    }

    const where: Prisma.DiscountWhereInput = {};
    if (query.scope) {
      where.scope = query.scope;
    }

    if (query.status === 'archived') {
      where.isArchived = true;
    } else if (query.status === 'inactive') {
      where.isArchived = false;
      where.isActive = false;
    } else if (query.status === 'expired') {
      where.isArchived = false;
      where.endsAt = { lt: now };
    } else {
      where.isArchived = false;
    }

    return this.queryPaginatedList(where, query.page, query.limit, query.keyword);
  }

  async create(input: CreateDiscountInput, actorId: number): Promise<DiscountRecord> {
    const parsed = this.parseInput(CreateDiscountSchema, input);

    const created = await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.discount.findUnique({ where: { code: parsed.code } });
      if (duplicate) {
        throw new ConflictException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: `Mã giảm giá "${parsed.code}" đã tồn tại`,
        });
      }

      await this.assertValidTargets(tx, parsed.targetCategoryIds, parsed.targetProductIds);

      return (await tx.discount.create({
        data: {
          code: parsed.code,
          name: parsed.name,
          valueType: parsed.valueType,
          value: new Prisma.Decimal(parsed.value),
          maxDiscountAmount:
            parsed.maxDiscountAmount != null ? new Prisma.Decimal(parsed.maxDiscountAmount) : null,
          scope: parsed.scope,
          minOrderAmount:
            parsed.minOrderAmount != null ? new Prisma.Decimal(parsed.minOrderAmount) : null,
          startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
          endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
          activeWeekdays: parsed.activeWeekdays,
          timeWindowStart: parsed.timeWindowStart ?? null,
          timeWindowEnd: parsed.timeWindowEnd ?? null,
          usageLimit: parsed.usageLimit ?? null,
          isActive: parsed.isActive,
          createdBy: actorId,
          targets:
            parsed.targetCategoryIds.length > 0 || parsed.targetProductIds.length > 0
              ? {
                  create: [
                    ...parsed.targetCategoryIds.map((categoryId) => ({ categoryId })),
                    ...parsed.targetProductIds.map((productId) => ({ productId })),
                  ],
                }
              : undefined,
        },
        include: TARGET_INCLUDE,
      })) as unknown as DiscountEntityWithTargets;
    });

    await this.auditLogService?.record({
      module: 'DISCOUNTS',
      action: 'Tạo mã giảm giá',
      detail: `${created.code} — ${created.name}`,
      actor: actorId,
      metadata: {
        discountId: created.id,
        code: created.code,
        valueType: created.valueType,
        value: created.value.toNumber(),
        scope: created.scope,
      },
    });

    return this.toDiscountRecord(created, 0);
  }

  async update(id: number, input: UpdateDiscountInput, actorId: number): Promise<DiscountRecord> {
    const parsed = this.parseInput(UpdateDiscountSchema, input);

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.discount.findUnique({
        where: { id },
        include: TARGET_INCLUDE,
      })) as unknown as DiscountEntityWithTargets | null;

      if (!existing) {
        throw new NotFoundException({
          code: ErrorCodes.DISCOUNT_NOT_FOUND,
          message: 'Không tìm thấy mã giảm giá',
        });
      }

      if (existing.isArchived) {
        throw new ConflictException({
          code: ErrorCodes.DISCOUNT_INACTIVE,
          message: 'Không thể chỉnh sửa mã giảm giá đã lưu trữ',
        });
      }

      if (parsed.code !== existing.code) {
        if (existing.usedCount > 0) {
          throw new ConflictException({
            code: ErrorCodes.DISCOUNT_LOCKED_FIELDS,
            message: 'Mã giảm giá đã phát sinh lượt dùng nên không thể đổi mã code',
          });
        }
        const duplicate = await tx.discount.findUnique({ where: { code: parsed.code } });
        if (duplicate && duplicate.id !== id) {
          throw new ConflictException({
            code: ErrorCodes.VALIDATION_FAILED,
            message: `Mã giảm giá "${parsed.code}" đã tồn tại`,
          });
        }
      }

      if (existing.usedCount > 0) {
        this.assertNoLockedFieldChange(existing, parsed);
      } else {
        await this.assertValidTargets(tx, parsed.targetCategoryIds, parsed.targetProductIds);
      }

      if (parsed.usageLimit != null && parsed.usageLimit < existing.usedCount) {
        throw new UnprocessableEntityException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: `Giới hạn lượt (${parsed.usageLimit}) không được nhỏ hơn số lượt đã dùng (${existing.usedCount})`,
        });
      }

      if (existing.usedCount === 0 && typeof tx.discountTarget?.deleteMany === 'function') {
        await tx.discountTarget.deleteMany({ where: { discountId: id } });
      }

      return (await tx.discount.update({
        where: { id },
        data: {
          ...(existing.usedCount === 0
            ? {
                code: parsed.code,
                valueType: parsed.valueType,
                value: new Prisma.Decimal(parsed.value),
                maxDiscountAmount:
                  parsed.maxDiscountAmount != null
                    ? new Prisma.Decimal(parsed.maxDiscountAmount)
                    : null,
                scope: parsed.scope,
                minOrderAmount:
                  parsed.minOrderAmount != null ? new Prisma.Decimal(parsed.minOrderAmount) : null,
                targets:
                  parsed.targetCategoryIds.length > 0 || parsed.targetProductIds.length > 0
                    ? {
                        create: [
                          ...parsed.targetCategoryIds.map((categoryId) => ({ categoryId })),
                          ...parsed.targetProductIds.map((productId) => ({ productId })),
                        ],
                      }
                    : undefined,
              }
            : {}),
          name: parsed.name,
          startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
          endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
          activeWeekdays: parsed.activeWeekdays,
          timeWindowStart: parsed.timeWindowStart ?? null,
          timeWindowEnd: parsed.timeWindowEnd ?? null,
          usageLimit: parsed.usageLimit ?? null,
          isActive: parsed.isActive,
        },
        include: TARGET_INCLUDE,
      })) as unknown as DiscountEntityWithTargets;
    });

    await this.auditLogService?.record({
      module: 'DISCOUNTS',
      action: 'Cập nhật mã giảm giá',
      detail: `${updated.code} — ${updated.name}`,
      actor: actorId,
      metadata: {
        discountId: updated.id,
        code: updated.code,
        usedCount: updated.usedCount,
      },
    });

    const totals = await this.computeTotalDiscountedMap(this.prisma, [updated.id]);
    return this.toDiscountRecord(updated, totals.get(updated.id) ?? 0);
  }

  async toggleStatus(
    id: number,
    input: ToggleDiscountStatusInput,
    actorId: number,
  ): Promise<DiscountRecord> {
    const parsed = this.parseInput(ToggleDiscountStatusSchema, input);

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.discount.findUnique({
        where: { id },
        include: TARGET_INCLUDE,
      })) as unknown as DiscountEntityWithTargets | null;

      if (!existing) {
        throw new NotFoundException({
          code: ErrorCodes.DISCOUNT_NOT_FOUND,
          message: 'Không tìm thấy mã giảm giá',
        });
      }
      if (existing.isArchived) {
        throw new ConflictException({
          code: ErrorCodes.DISCOUNT_INACTIVE,
          message: 'Không thể bật/tắt mã giảm giá đã lưu trữ',
        });
      }

      return (await tx.discount.update({
        where: { id },
        data: { isActive: parsed.isActive },
        include: TARGET_INCLUDE,
      })) as unknown as DiscountEntityWithTargets;
    });

    await this.auditLogService?.record({
      module: 'DISCOUNTS',
      action: parsed.isActive ? 'Bật mã giảm giá' : 'Tắt mã giảm giá',
      detail: `${updated.code} (${parsed.isActive ? 'Đang bật' : 'Tạm ngưng'})`,
      actor: actorId,
      metadata: { discountId: updated.id, code: updated.code, isActive: updated.isActive },
    });

    const totals = await this.computeTotalDiscountedMap(this.prisma, [updated.id]);
    return this.toDiscountRecord(updated, totals.get(updated.id) ?? 0);
  }

  async remove(id: number, actorId: number): Promise<{ deleted: boolean; archived: boolean }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.discount.findUnique({
        where: { id },
      })) as unknown as DiscountEntityWithTargets | null;

      if (!existing) {
        throw new NotFoundException({
          code: ErrorCodes.DISCOUNT_NOT_FOUND,
          message: 'Không tìm thấy mã giảm giá',
        });
      }

      const referencingOrderCount = await tx.order.count({ where: { discountId: id } });
      if (existing.usedCount === 0 && referencingOrderCount === 0) {
        await tx.discount.delete({ where: { id } });
        return { deleted: true, archived: false, code: existing.code };
      }

      await tx.discount.update({
        where: { id },
        data: { isArchived: true, isActive: false },
      });
      return { deleted: false, archived: true, code: existing.code };
    });

    await this.auditLogService?.record({
      module: 'DISCOUNTS',
      action: result.deleted ? 'Xoá mã giảm giá' : 'Lưu trữ mã giảm giá',
      detail: result.code,
      actor: actorId,
      metadata: { discountId: id, deleted: result.deleted, archived: result.archived },
    });

    return { deleted: result.deleted, archived: result.archived };
  }

  /**
   * Lists currently schedule-valid discounts along with estimated discount amount for a live POS order.
   */
  async findApplicableForOrderItems(
    items: readonly DiscountCalculableItem[],
    now = new Date(),
  ): Promise<ApplicableDiscountItem[]> {
    const candidates = (await this.prisma.discount.findMany({
      where: { isArchived: false, isActive: true },
      include: TARGET_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })) as unknown as DiscountEntityWithTargets[];

    const applicable: ApplicableDiscountItem[] = [];

    for (const discount of candidates) {
      const windowCheck = evaluateDiscountScheduleWindow(
        {
          isActive: discount.isActive,
          isArchived: discount.isArchived,
          startsAt: discount.startsAt,
          endsAt: discount.endsAt,
          activeWeekdays: parseWeekdaysJson(discount.activeWeekdays),
          timeWindowStart: discount.timeWindowStart,
          timeWindowEnd: discount.timeWindowEnd,
          usageLimit: discount.usageLimit,
          usedCount: discount.usedCount,
        },
        now,
      );
      if (!windowCheck.ok) continue;

      const targetCategoryIds = discount.targets
        .map((t) => t.categoryId)
        .filter((cid): cid is number => cid !== null);
      const targetProductIds = discount.targets
        .map((t) => t.productId)
        .filter((pid): pid is number => pid !== null);

      const calc = calculateOrderDiscount(items, {
        valueType: discount.valueType as DiscountValueType,
        value: discount.value.toNumber(),
        maxDiscountAmount: discount.maxDiscountAmount?.toNumber() ?? null,
        scope: discount.scope as DiscountScope,
        targetCategoryIds,
        targetProductIds,
        minOrderAmount: discount.minOrderAmount?.toNumber() ?? null,
      });

      applicable.push({
        id: discount.id,
        code: discount.code,
        name: discount.name,
        valueType: discount.valueType as DiscountValueType,
        value: discount.value.toNumber(),
        maxDiscountAmount: discount.maxDiscountAmount?.toNumber() ?? null,
        scope: discount.scope as DiscountScope,
        minOrderAmount: discount.minOrderAmount?.toNumber() ?? null,
        targetCategoryIds,
        targetProductIds,
        endsAt: discount.endsAt ? discount.endsAt.toISOString() : null,
        usageLimit: discount.usageLimit,
        usedCount: discount.usedCount,
        remainingCount:
          discount.usageLimit != null ? Math.max(0, discount.usageLimit - discount.usedCount) : null,
        estimatedDiscountAmount: calc.discountAmount,
        isEligibleForCurrentOrder: calc.warningCode === null && calc.discountAmount > 0,
        warningCode: calc.warningCode,
        warningMessage: calc.warningMessage,
      });
    }

    applicable.sort((a, b) => {
      if (a.isEligibleForCurrentOrder !== b.isEligibleForCurrentOrder) {
        return a.isEligibleForCurrentOrder ? -1 : 1;
      }
      return b.estimatedDiscountAmount - a.estimatedDiscountAmount;
    });

    return applicable;
  }

  /**
   * Resolves a discount by id or uppercase code and enforces apply-time schedule & usage checks.
   */
  async findValidDiscountByCodeOrId(
    client: DbClient,
    identifier: { code?: string; discountId?: number },
    now = new Date(),
  ): Promise<{
    discount: DiscountEntityWithTargets;
    targetCategoryIds: number[];
    targetProductIds: number[];
  }> {
    const discount = (await (identifier.discountId !== undefined
      ? client.discount.findUnique({
          where: { id: identifier.discountId },
          include: TARGET_INCLUDE,
        })
      : client.discount.findUnique({
          where: { code: identifier.code?.trim().toUpperCase() ?? '' },
          include: TARGET_INCLUDE,
        }))) as unknown as DiscountEntityWithTargets | null;

    if (!discount) {
      throw new NotFoundException({
        code: ErrorCodes.DISCOUNT_NOT_FOUND,
        message: 'Không tìm thấy mã giảm giá phù hợp',
      });
    }

    const windowCheck = evaluateDiscountScheduleWindow(
      {
        isActive: discount.isActive,
        isArchived: discount.isArchived,
        startsAt: discount.startsAt,
        endsAt: discount.endsAt,
        activeWeekdays: parseWeekdaysJson(discount.activeWeekdays),
        timeWindowStart: discount.timeWindowStart,
        timeWindowEnd: discount.timeWindowEnd,
        usageLimit: discount.usageLimit,
        usedCount: discount.usedCount,
      },
      now,
    );

    if (!windowCheck.ok) {
      throw new ConflictException({
        code: ErrorCodes[windowCheck.reasonCode],
        message: windowCheck.message,
      });
    }

    return {
      discount,
      targetCategoryIds: discount.targets
        .map((t) => t.categoryId)
        .filter((cid): cid is number => cid !== null),
      targetProductIds: discount.targets
        .map((t) => t.productId)
        .filter((pid): pid is number => pid !== null),
    };
  }

  private async queryPaginatedList(
    where: Prisma.DiscountWhereInput,
    page: number,
    limit: number,
    keyword?: string,
  ): Promise<DiscountListResponse> {
    const normalizedKeyword = normalizeVietnameseString(keyword ?? '');
    const skip = (page - 1) * limit;

    let total: number;
    let typedRows: DiscountEntityWithTargets[];

    if (normalizedKeyword) {
      const allRows = (await this.prisma.discount.findMany({
        where,
        include: TARGET_INCLUDE,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      })) as unknown as DiscountEntityWithTargets[];

      const filtered = allRows.filter(
        (row) =>
          normalizeVietnameseString(row.code).includes(normalizedKeyword) ||
          normalizeVietnameseString(row.name).includes(normalizedKeyword),
      );
      total = filtered.length;
      typedRows = filtered.slice(skip, skip + limit);
    } else {
      const [countResult, rows] = await Promise.all([
        this.prisma.discount.count({ where }),
        this.prisma.discount.findMany({
          where,
          include: TARGET_INCLUDE,
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
        }) as Promise<unknown[]>,
      ]);
      total = countResult;
      typedRows = rows as DiscountEntityWithTargets[];
    }

    const totals = await this.computeTotalDiscountedMap(
      this.prisma,
      typedRows.map((r) => r.id),
    );

    return {
      page,
      limit,
      total,
      items: typedRows.map((row) => this.toDiscountRecord(row, totals.get(row.id) ?? 0)),
    };
  }

  private async computeTotalDiscountedMap(
    client: DbClient,
    discountIds: readonly number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (discountIds.length === 0) return map;

    const orderModel = client.order as unknown as {
      groupBy?: (args: unknown) => Promise<
        Array<{ discountId: number | null; _sum: { discountAmount: Prisma.Decimal | null } }>
      >;
      findMany: (args: unknown) => Promise<
        Array<{ discountId: number | null; discountAmount: Prisma.Decimal }>
      >;
    };

    if (typeof orderModel.groupBy === 'function') {
      const grouped = await orderModel.groupBy({
        by: ['discountId'],
        where: { discountId: { in: [...discountIds] }, status: 'PAID' },
        _sum: { discountAmount: true },
      });
      for (const entry of grouped) {
        if (entry.discountId != null && entry._sum.discountAmount) {
          map.set(entry.discountId, entry._sum.discountAmount.toNumber());
        }
      }
      return map;
    }

    const rows = await orderModel.findMany({
      where: { discountId: { in: [...discountIds] }, status: 'PAID' },
      select: { discountId: true, discountAmount: true },
    });
    for (const row of rows) {
      if (row.discountId != null) {
        map.set(row.discountId, (map.get(row.discountId) ?? 0) + row.discountAmount.toNumber());
      }
    }
    return map;
  }

  private async assertValidTargets(
    client: DbClient,
    categoryIds: readonly number[],
    productIds: readonly number[],
  ): Promise<void> {
    if (categoryIds.length > 0) {
      const foundCategories = await client.masterData.findMany({
        where: { id: { in: [...categoryIds] }, category: MdmCategory.MENU_CATEGORY, isActive: true },
        select: { id: true },
      });
      if (foundCategories.length !== categoryIds.length) {
        throw new UnprocessableEntityException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: 'Một hoặc nhiều danh mục món được chọn không tồn tại hoặc đã ngưng hoạt động',
        });
      }
    }

    if (productIds.length > 0) {
      const foundProducts = await client.product.findMany({
        where: { id: { in: [...productIds] } },
        select: { id: true },
      });
      if (foundProducts.length !== productIds.length) {
        throw new UnprocessableEntityException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: 'Một hoặc nhiều sản phẩm được chọn không tồn tại',
        });
      }
    }
  }

  private assertNoLockedFieldChange(
    existing: DiscountEntityWithTargets,
    parsed: UpdateDiscountInput,
  ): void {
    const existingCategories = existing.targets
      .map((t) => t.categoryId)
      .filter((cid): cid is number => cid !== null);
    const existingProducts = existing.targets
      .map((t) => t.productId)
      .filter((pid): pid is number => pid !== null);

    const lockedChanged =
      parsed.code !== existing.code ||
      parsed.valueType !== existing.valueType ||
      !existing.value.equals(new Prisma.Decimal(parsed.value)) ||
      !decimalOrNullEquals(existing.maxDiscountAmount, parsed.maxDiscountAmount) ||
      parsed.scope !== existing.scope ||
      !decimalOrNullEquals(existing.minOrderAmount, parsed.minOrderAmount) ||
      !sameSortedIds(existingCategories, parsed.targetCategoryIds) ||
      !sameSortedIds(existingProducts, parsed.targetProductIds);

    if (lockedChanged) {
      throw new ConflictException({
        code: ErrorCodes.DISCOUNT_LOCKED_FIELDS,
        message:
          'Mã giảm giá đã có lượt sử dụng nên không thể sửa mã code, giá trị, phạm vi hoặc đơn tối thiểu',
      });
    }
  }

  private toDiscountRecord(
    row: DiscountEntityWithTargets,
    totalDiscountedAmount: number,
  ): DiscountRecord {
    const targetCategoryIds = row.targets
      .map((t) => t.categoryId)
      .filter((cid): cid is number => cid !== null);
    const targetProductIds = row.targets
      .map((t) => t.productId)
      .filter((pid): pid is number => pid !== null);

    return DiscountRecordSchema.parse({
      id: row.id,
      code: row.code,
      name: row.name,
      valueType: row.valueType,
      value: row.value.toNumber(),
      maxDiscountAmount: row.maxDiscountAmount?.toNumber() ?? null,
      scope: row.scope,
      targetCategoryIds,
      targetProductIds,
      targets: row.targets.map((t) => ({
        categoryId: t.categoryId,
        categoryName: t.category?.name ?? null,
        productId: t.productId,
        productName: t.product?.name ?? null,
      })),
      minOrderAmount: row.minOrderAmount?.toNumber() ?? null,
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      activeWeekdays: parseWeekdaysJson(row.activeWeekdays),
      timeWindowStart: row.timeWindowStart,
      timeWindowEnd: row.timeWindowEnd,
      usageLimit: row.usageLimit,
      usedCount: row.usedCount,
      remainingCount:
        row.usageLimit != null ? Math.max(0, row.usageLimit - row.usedCount) : null,
      totalDiscountedAmount: Math.round(totalDiscountedAmount * 100) / 100,
      isActive: row.isActive,
      isArchived: row.isArchived,
      isLocked: row.usedCount > 0,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private parseInput<T>(
    schema: {
      safeParse: (v: unknown) => {
        success: boolean;
        data?: T;
        error?: { flatten: () => { fieldErrors: unknown } };
      };
    },
    input: unknown,
  ): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu mã giảm giá không hợp lệ',
        details: { fieldErrors: parsed.error?.flatten().fieldErrors },
      });
    }
    return parsed.data as T;
  }
}
