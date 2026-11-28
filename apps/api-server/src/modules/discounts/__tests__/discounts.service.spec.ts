import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { DiscountsService } from '../discounts.service';

interface MockTargetRow {
  id: number;
  discountId: number;
  categoryId: number | null;
  productId: number | null;
  category?: { id: number; name: string } | null;
  product?: { id: number; name: string } | null;
}

interface MockDiscountRow {
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
  activeWeekdays: number[];
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  isArchived: boolean;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
  targets: MockTargetRow[];
}

function makeDiscountRow(overrides: Partial<MockDiscountRow> & { id: number }): MockDiscountRow {
  return {
    code: `CODE${overrides.id}`,
    name: `Discount ${overrides.id}`,
    valueType: 'PERCENT',
    value: new Prisma.Decimal(10),
    maxDiscountAmount: new Prisma.Decimal(20000),
    scope: 'ORDER',
    minOrderAmount: null,
    startsAt: null,
    endsAt: null,
    activeWeekdays: [],
    timeWindowStart: null,
    timeWindowEnd: null,
    usageLimit: null,
    usedCount: 0,
    isActive: true,
    isArchived: false,
    createdBy: 1,
    createdAt: new Date('2026-11-15T00:00:00.000Z'),
    updatedAt: new Date('2026-11-15T00:00:00.000Z'),
    targets: [],
    ...overrides,
  };
}

function createDiscountsHarness(
  initialDiscounts: MockDiscountRow[] = [],
  options: {
    paidOrders?: Array<{ discountId: number | null; discountAmount: Prisma.Decimal; status: string }>;
    allOrdersDiscountIds?: number[];
  } = {},
) {
  const discounts = [...initialDiscounts];
  const paidOrders = options.paidOrders ?? [];
  const categories = [
    { id: 100, category: 'MENU_CATEGORY', name: 'Mì Cay', isActive: true },
    { id: 200, category: 'MENU_CATEGORY', name: 'Đồ uống', isActive: true },
  ];
  const products = [
    { id: 1, name: 'Mì Cay Bò', categoryId: 100 },
    { id: 2, name: 'Trà Đào', categoryId: 200 },
  ];
  let nextId = discounts.reduce((max, d) => Math.max(max, d.id), 0) + 1;
  let nextTargetId = 1;

  const client: Record<string, unknown> = {
    discount: {
      findMany: vi.fn(async (args?: { where?: { isArchived?: boolean; isActive?: boolean; scope?: string } }) => {
        return discounts.filter((d) => {
          if (args?.where?.isArchived !== undefined && d.isArchived !== args.where.isArchived) return false;
          if (args?.where?.isActive !== undefined && d.isActive !== args.where.isActive) return false;
          if (args?.where?.scope && d.scope !== args.where.scope) return false;
          return true;
        });
      }),
      count: vi.fn(async () => discounts.filter((d) => !d.isArchived).length),
      findUnique: vi.fn(async (args: { where: { id?: number; code?: string } }) => {
        if (args.where.id !== undefined) return discounts.find((d) => d.id === args.where.id) ?? null;
        if (args.where.code !== undefined) return discounts.find((d) => d.code === args.where.code) ?? null;
        return null;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const targetsInput = (args.data.targets as { create?: Array<{ categoryId?: number; productId?: number }> } | undefined)?.create ?? [];
        const created = makeDiscountRow({
          id: nextId++,
          code: String(args.data.code),
          name: String(args.data.name),
          valueType: String(args.data.valueType),
          value: args.data.value as Prisma.Decimal,
          maxDiscountAmount: (args.data.maxDiscountAmount as Prisma.Decimal | null) ?? null,
          scope: String(args.data.scope),
          minOrderAmount: (args.data.minOrderAmount as Prisma.Decimal | null) ?? null,
          startsAt: (args.data.startsAt as Date | null) ?? null,
          endsAt: (args.data.endsAt as Date | null) ?? null,
          activeWeekdays: (args.data.activeWeekdays as number[]) ?? [],
          timeWindowStart: (args.data.timeWindowStart as string | null) ?? null,
          timeWindowEnd: (args.data.timeWindowEnd as string | null) ?? null,
          usageLimit: (args.data.usageLimit as number | null) ?? null,
          isActive: Boolean(args.data.isActive ?? true),
          createdBy: Number(args.data.createdBy),
          targets: targetsInput.map((t) => ({
            id: nextTargetId++,
            discountId: nextId - 1,
            categoryId: t.categoryId ?? null,
            productId: t.productId ?? null,
            category: t.categoryId ? { id: t.categoryId, name: categories.find((c) => c.id === t.categoryId)?.name ?? 'Cat' } : null,
            product: t.productId ? { id: t.productId, name: products.find((p) => p.id === t.productId)?.name ?? 'Prod' } : null,
          })),
        });
        discounts.push(created);
        return created;
      }),
      update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
        const idx = discounts.findIndex((d) => d.id === args.where.id);
        if (idx < 0) throw new Error('Not found');
        const current = discounts[idx];
        const nextTargets = (args.data.targets as { create?: Array<{ categoryId?: number; productId?: number }> } | undefined)?.create;
        discounts[idx] = {
          ...current,
          ...(args.data as Partial<MockDiscountRow>),
          targets: nextTargets
            ? nextTargets.map((t) => ({
                id: nextTargetId++,
                discountId: current.id,
                categoryId: t.categoryId ?? null,
                productId: t.productId ?? null,
                category: t.categoryId ? { id: t.categoryId, name: categories.find((c) => c.id === t.categoryId)?.name ?? 'Cat' } : null,
                product: t.productId ? { id: t.productId, name: products.find((p) => p.id === t.productId)?.name ?? 'Prod' } : null,
              }))
            : current.targets,
          updatedAt: new Date('2026-11-15T12:00:00.000Z'),
        };
        return discounts[idx];
      }),
      delete: vi.fn(async (args: { where: { id: number } }) => {
        const idx = discounts.findIndex((d) => d.id === args.where.id);
        if (idx < 0) throw new Error('Not found');
        const [removed] = discounts.splice(idx, 1);
        return removed;
      }),
    },
    masterData: {
      findMany: vi.fn(async (args: { where: { id?: { in: number[] } } }) =>
        categories.filter((c) => !args.where.id || args.where.id.in.includes(c.id)),
      ),
    },
    product: {
      findMany: vi.fn(async (args: { where: { id?: { in: number[] } } }) =>
        products.filter((p) => !args.where.id || args.where.id.in.includes(p.id)),
      ),
    },
    order: {
      groupBy: vi.fn(async () => {
        const totals = new Map<number, Prisma.Decimal>();
        for (const row of paidOrders) {
          if (row.discountId != null && row.status === 'PAID') {
            totals.set(
              row.discountId,
              (totals.get(row.discountId) ?? new Prisma.Decimal(0)).add(row.discountAmount),
            );
          }
        }
        return Array.from(totals.entries()).map(([discountId, sum]) => ({
          discountId,
          _sum: { discountAmount: sum },
        }));
      }),
      count: vi.fn(async (args: { where: { discountId?: number } }) => {
        const targetId = args.where.discountId;
        return (options.allOrdersDiscountIds ?? []).filter((id) => id === targetId).length;
      }),
    },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  const auditLogService = { record: vi.fn(async () => {}) };
  const service = new DiscountsService(client as never, auditLogService as never);
  return { service, discounts, auditLogService, client };
}

describe('DiscountsService', () => {
  it('lists discounts with computed remainingCount, isLocked, and totalDiscountedAmount', async () => {
    const row = makeDiscountRow({
      id: 1,
      code: 'GIAM10',
      usageLimit: 50,
      usedCount: 3,
    });
    const { service } = createDiscountsHarness([row], {
      paidOrders: [
        { discountId: 1, discountAmount: new Prisma.Decimal(20000), status: 'PAID' },
        { discountId: 1, discountAmount: new Prisma.Decimal(15000), status: 'PAID' },
        { discountId: 1, discountAmount: new Prisma.Decimal(10000), status: 'VOIDED' },
      ],
    });

    const result = await service.list({ page: 1, limit: 20, status: 'all' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      code: 'GIAM10',
      usedCount: 3,
      remainingCount: 47,
      totalDiscountedAmount: 35000,
      isLocked: true,
    });
  });

  it('creates CATEGORY and PRODUCT discounts and rejects duplicate codes', async () => {
    const { service, auditLogService } = createDiscountsHarness();
    const created = await service.create(
      {
        code: 'happy5k',
        name: 'Giảm 5k Mì cay',
        valueType: 'FIXED',
        value: 5000,
        scope: 'CATEGORY',
        targetCategoryIds: [100],
        targetProductIds: [],
        timeWindowStart: '14:00',
        timeWindowEnd: '17:00',
        activeWeekdays: [1, 2, 3, 4, 5],
      },
      1,
    );

    expect(created.code).toBe('HAPPY5K');
    expect(created.targetCategoryIds).toEqual([100]);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'DISCOUNTS', action: 'Tạo mã giảm giá' }),
    );

    await expect(
      service.create(
        {
          code: 'HAPPY5K',
          name: 'Trùng mã',
          valueType: 'FIXED',
          value: 5000,
          scope: 'ORDER',
        },
        1,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects invalid category or product target IDs with 422', async () => {
    const { service } = createDiscountsHarness();
    await expect(
      service.create(
        {
          code: 'BADCAT',
          name: 'Bad target',
          valueType: 'FIXED',
          value: 5000,
          scope: 'CATEGORY',
          targetCategoryIds: [999],
        },
        1,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('locks value, scope, targets, and minOrderAmount when usedCount > 0 while allowing date/limit/status edits', async () => {
    const usedRow = makeDiscountRow({
      id: 5,
      code: 'LOCKED10',
      name: 'Used discount',
      valueType: 'PERCENT',
      value: new Prisma.Decimal(10),
      maxDiscountAmount: new Prisma.Decimal(20000),
      scope: 'ORDER',
      usageLimit: 10,
      usedCount: 2,
    });
    const { service } = createDiscountsHarness([usedRow]);

    // Trying to change value fails with DISCOUNT_LOCKED_FIELDS
    let caughtError: unknown;
    try {
      await service.update(
        5,
        {
          code: 'LOCKED10',
          name: 'Used discount',
          valueType: 'PERCENT',
          value: 15,
          maxDiscountAmount: 20000,
          scope: 'ORDER',
          usageLimit: 10,
        },
        1,
      );
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(ConflictException);
    expect((caughtError as ConflictException).getResponse()).toMatchObject({
      code: ErrorCodes.DISCOUNT_LOCKED_FIELDS,
    });

    // Editing name + usageLimit >= usedCount succeeds
    const updated = await service.update(
      5,
      {
        code: 'LOCKED10',
        name: 'Gia hạn mã',
        valueType: 'PERCENT',
        value: 10,
        maxDiscountAmount: 20000,
        scope: 'ORDER',
        usageLimit: 25,
        isActive: true,
      },
      1,
    );
    expect(updated.name).toBe('Gia hạn mã');
    expect(updated.usageLimit).toBe(25);
  });

  it('hard deletes unused discount and archives used discount', async () => {
    const unused = makeDiscountRow({ id: 10, code: 'UNUSED', usedCount: 0 });
    const used = makeDiscountRow({ id: 11, code: 'USED', usedCount: 1 });
    const { service, discounts } = createDiscountsHarness([unused, used]);

    const resUnused = await service.remove(10, 1);
    expect(resUnused).toEqual({ deleted: true, archived: false });
    expect(discounts.some((d) => d.id === 10)).toBe(false);

    const resUsed = await service.remove(11, 1);
    expect(resUsed).toEqual({ deleted: false, archived: true });
    const archivedRow = discounts.find((d) => d.id === 11);
    expect(archivedRow?.isArchived).toBe(true);
    expect(archivedRow?.isActive).toBe(false);

    await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
  });

  it('matches Vietnamese discount names without diacritics in list keyword filter', async () => {
    const gioVang = makeDiscountRow({
      id: 20,
      code: 'GIOVANG15K',
      name: 'Giờ vàng ngày thường — Giảm 15.000đ',
    });
    const giam10 = makeDiscountRow({
      id: 21,
      code: 'GIAM10',
      name: 'Giảm 10% tổng hoá đơn',
    });
    const { service } = createDiscountsHarness([gioVang, giam10]);

    const res = await service.list({ keyword: 'gio vang', page: 1, limit: 20 });
    expect(res.total).toBe(1);
    expect(res.items.map((item) => item.code)).toEqual(['GIOVANG15K']);
  });

  it('supports list filters (active/inactive/expired/archived/scope), target updates when unused, toggleStatus & non-groupBy totals', async () => {
    const unused = makeDiscountRow({
      id: 30,
      code: 'COMBO20K',
      name: 'Giảm 20k',
      scope: 'CATEGORY',
      valueType: 'FIXED',
      value: new Prisma.Decimal(20000),
      maxDiscountAmount: null,
      usedCount: 0,
      isActive: true,
      targets: [{ id: 1, discountId: 30, categoryId: 100, productId: null }],
    });
    const archived = makeDiscountRow({
      id: 31,
      code: 'OLD',
      isActive: false,
      isArchived: true,
    });
    const { service, client } = createDiscountsHarness([unused, archived], {
      paidOrders: [
        { discountId: 30, discountAmount: new Prisma.Decimal(20000), status: 'PAID' },
      ],
    });

    // Drop groupBy to exercise findMany fallback inside computeTotalDiscountedMap
    delete (client.order as { groupBy?: unknown }).groupBy;
    (client.order as { findMany?: unknown }).findMany = vi.fn(async () => [
      { discountId: 30, discountAmount: new Prisma.Decimal(20000) },
    ]);

    await expect(service.list({ page: 1, limit: 20, status: 'active', scope: 'CATEGORY' })).resolves.toMatchObject({
      total: 1,
    });
    await expect(service.list({ page: 1, limit: 20, status: 'inactive' })).resolves.toBeDefined();
    await expect(service.list({ page: 1, limit: 20, status: 'expired' })).resolves.toBeDefined();
    await expect(service.list({ page: 1, limit: 20, status: 'archived' })).resolves.toMatchObject({
      total: 1,
    });

    const toggledOff = await service.toggleStatus(30, { isActive: false }, 1);
    expect(toggledOff.isActive).toBe(false);
    await expect(service.toggleStatus(31, { isActive: true }, 1)).rejects.toThrow(ConflictException);
    await expect(service.toggleStatus(999, { isActive: true }, 1)).rejects.toThrow(NotFoundException);

    // Unused discount can change code, valueType, scope, targets
    const edited = await service.update(
      30,
      {
        code: 'MON10',
        name: 'Đổi sang món',
        valueType: 'PERCENT',
        value: 10,
        maxDiscountAmount: 25000,
        scope: 'PRODUCT',
        targetProductIds: [1],
        isActive: true,
      },
      1,
    );
    expect(edited.code).toBe('MON10');
    expect(edited.targetProductIds).toEqual([1]);

    // Invalid product target fails with 422
    await expect(
      service.create(
        {
          code: 'BADPROD',
          name: 'Invalid prod',
          valueType: 'FIXED',
          value: 5000,
          scope: 'PRODUCT',
          targetProductIds: [999],
        },
        1,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(service.update(31, { code: 'OLD', name: 'Arch', valueType: 'FIXED', value: 1000, scope: 'ORDER' }, 1)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.update(999, { code: 'NONE', name: 'None', valueType: 'FIXED', value: 1000, scope: 'ORDER' }, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('finds applicable discounts for live POS orders and enforces schedule windows on findValidDiscountByCodeOrId', async () => {
    const now = new Date('2026-11-27T12:00:00.000+07:00');
    const eligible = makeDiscountRow({
      id: 40,
      code: 'ELIGIBLE20',
      valueType: 'FIXED',
      value: new Prisma.Decimal(20000),
      maxDiscountAmount: null,
      scope: 'ORDER',
      usageLimit: 10,
      usedCount: 2,
    });
    const highMinOrder = makeDiscountRow({
      id: 41,
      code: 'VIP500K',
      valueType: 'FIXED',
      value: new Prisma.Decimal(50000),
      maxDiscountAmount: null,
      scope: 'ORDER',
      minOrderAmount: new Prisma.Decimal(500000),
    });
    const expired = makeDiscountRow({
      id: 42,
      code: 'EXPIRED',
      endsAt: new Date('2026-11-01T00:00:00.000Z'),
    });

    const { service, client } = createDiscountsHarness([eligible, highMinOrder, expired]);

    const applicable = await service.findApplicableForOrderItems(
      [{ productId: 1, categoryId: 100, unitPrice: 100000, quantity: 2 }],
      now,
    );
    expect(applicable.map((d) => d.code)).toEqual(['ELIGIBLE20', 'VIP500K']);
    expect(applicable[0].isEligibleForCurrentOrder).toBe(true);
    expect(applicable[1].warningCode).toBe('MIN_ORDER_NOT_MET');

    const byCode = await service.findValidDiscountByCodeOrId(client as never, { code: 'eligible20' }, now);
    expect(byCode.discount.id).toBe(40);
    await expect(service.findValidDiscountByCodeOrId(client as never, { discountId: 999 }, now)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.findValidDiscountByCodeOrId(client as never, { code: 'EXPIRED' }, now)).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.DISCOUNT_EXPIRED }),
    });
  });
});
