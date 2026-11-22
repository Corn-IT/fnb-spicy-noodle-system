import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MdmCategory } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { MdmService } from '../mdm.service';

describe('MdmService', () => {
  it('should prevent Master Data writes from creating or editing the internal cashflow budget record', async () => {
    const service = new MdmService({
      masterData: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          category: MdmCategory.UNIT,
          normalizedName: '__internal_cashflow_default_opening_budget__',
        }),
        update: vi.fn(),
      },
    } as never);

    await expect(service.findOrCreate(MdmCategory.UNIT, '__internal_cashflow_default_opening_budget__'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(5, { metadata: { opening_budget: '1.00' } }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.softDisable(5)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should use a conflict-safe MDM upsert when sharing an inventory transaction', async () => {
    const record = {
      id: 8,
      category: MdmCategory.INGREDIENT,
      name: 'Ba Chỉ Bò Mỹ',
      normalizedName: 'ba chi bo my',
      metadata: { default_unit: 'Kg', last_price: 180000 },
      isActive: true,
      createdAt: new Date('2026-11-08T00:00:00.000Z'),
    };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([record]) };
    const service = new MdmService({} as never);

    await expect(service.findOrCreate(
      MdmCategory.INGREDIENT,
      '  ba chỉ bò mỹ  ',
      { default_unit: 'Kg', last_price: 180000 },
      tx as never,
    )).resolves.toEqual(record);

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain('ON CONFLICT (category, normalized_name)');
    expect(tx.$queryRaw.mock.calls[0]?.[0].raw.join('')).toContain('metadata = master_data.metadata || EXCLUDED.metadata');
  });

  it('should trim, title-case and normalize a new Vietnamese name before creating it', async () => {
    const prisma = {
      masterData: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const service = new MdmService(prisma as never);

    await service.findOrCreate(MdmCategory.INGREDIENT, '  tương ớt hàn quốc  ');

    expect(prisma.masterData.create).toHaveBeenCalledWith({
      data: {
        category: 'INGREDIENT',
        name: 'Tương Ớt Hàn Quốc',
        normalizedName: 'tuong ot han quoc',
        metadata: {},
        isActive: true,
      },
    });
  });

  it('should merge metadata into the active record with a matching normalized name', async () => {
    const existing = { id: 7, metadata: { default_unit: 'Kg' }, isActive: true };
    const prisma = {
      masterData: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({ ...existing, metadata: { default_unit: 'Kg', last_price: 135000 } }),
        create: vi.fn(),
      },
    };
    const service = new MdmService(prisma as never);

    const result = await service.findOrCreate(MdmCategory.INGREDIENT, 'TƯƠNG ỚT HÀN QUỐC', { last_price: 135000 });

    expect(prisma.masterData.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { metadata: { default_unit: 'Kg', last_price: 135000 } },
    });
    expect(prisma.masterData.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 7, metadata: { last_price: 135000 } });
  });

  it('should reject a blank category name before querying Prisma', async () => {
    const prisma = { masterData: { findFirst: vi.fn(), create: vi.fn() } };
    const service = new MdmService(prisma as never);

    await expect(service.findOrCreate(MdmCategory.INGREDIENT, '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.masterData.findFirst).not.toHaveBeenCalled();
  });

  it('should list only active lookup values matching category and keyword ordered by metadata sortOrder', async () => {
    const prisma = {
      masterData: {
        findMany: vi.fn().mockResolvedValue([
          { id: 2, name: 'Bò Tươi', metadata: { sortOrder: 2 } },
          { id: 1, name: 'Ba Chỉ Bò Mỹ', metadata: { sortOrder: 1 } },
        ]),
      },
    };
    const service = new MdmService(prisma as never);

    const rows = await service.lookup({ category: MdmCategory.INGREDIENT, keyword: 'bo', page: 1, limit: 20, activeOnly: true });

    expect(rows.map((r) => r.name)).toEqual(['Ba Chỉ Bò Mỹ', 'Bò Tươi']);
    expect(prisma.masterData.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        category: 'INGREDIENT',
        isActive: true,
        normalizedName: { not: '__internal_cashflow_default_opening_budget__' },
        OR: [
          { name: { contains: 'bo', mode: 'insensitive' } },
          { normalizedName: { contains: 'bo', mode: 'insensitive' } },
        ],
      },
      orderBy: { id: 'asc' },
    }));
  });

  it('should normalize a renamed record and merge metadata without changing its category', async () => {
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 3, category: 'UNIT', metadata: { default: true } }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({ id: 3, name: 'Đá Bi', normalizedName: 'da bi' }),
      },
    };
    const service = new MdmService(prisma as never);

    await service.update(3, { name: '  đá bi  ', metadata: { last_price: 1000 } });

    expect(prisma.masterData.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { name: 'Đá Bi', normalizedName: 'da bi', metadata: { default: true, last_price: 1000 } },
    });
  });

  it('should return the active match unchanged when no metadata is supplied', async () => {
    const existing = { id: 8, name: 'Đá Bi', metadata: {}, isActive: true };
    const prisma = { masterData: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn() } };
    const service = new MdmService(prisma as never);

    await expect(service.findOrCreate(MdmCategory.INGREDIENT, 'Đá bi')).resolves.toBe(existing);
    expect(prisma.masterData.update).not.toHaveBeenCalled();
  });

  it('should recover a unique-name race by reactivating and updating the existing record', async () => {
    const inactive = { id: 9, category: 'INGREDIENT', metadata: { default_unit: 'Kg' }, isActive: false };
    const prisma = {
      masterData: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002', clientVersion: 'unit-test', meta: { target: ['category', 'normalized_name'] },
        })),
        findUnique: vi.fn().mockResolvedValue(inactive),
        update: vi.fn().mockResolvedValueOnce({ ...inactive, isActive: true, name: 'Đá Bi' })
          .mockResolvedValueOnce({ ...inactive, isActive: true, name: 'Đá Bi', metadata: { default_unit: 'Kg', last_price: 1200 } }),
      },
    };
    const service = new MdmService(prisma as never);

    await expect(service.findOrCreate(MdmCategory.INGREDIENT, 'đá bi', { last_price: 1200 })).resolves.toMatchObject({
      id: 9, isActive: true, metadata: { last_price: 1200 },
    });
    expect(prisma.masterData.findUnique).toHaveBeenCalledWith({
      where: { category_normalizedName: { category: 'INGREDIENT', normalizedName: 'da bi' } },
    });
  });

  it('should propagate a uniqueness error when the conflicting record cannot be read', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'unit-test', meta: { target: ['category', 'normalized_name'] },
    });
    const prisma = {
      masterData: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(duplicate), findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = new MdmService(prisma as never);

    await expect(service.findOrCreate(MdmCategory.INGREDIENT, 'Bò viên')).rejects.toBe(duplicate);
  });

  it('should reuse a record inserted concurrently when it is already active', async () => {
    const active = { id: 11, category: 'INGREDIENT', metadata: {}, isActive: true };
    const prisma = {
      masterData: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002', clientVersion: 'unit-test', meta: { target: ['category', 'normalized_name'] },
        })),
        findUnique: vi.fn().mockResolvedValue(active),
        update: vi.fn(),
      },
    };
    const service = new MdmService(prisma as never);

    await expect(service.findOrCreate(MdmCategory.INGREDIENT, 'Bò viên')).resolves.toBe(active);
    expect(prisma.masterData.update).not.toHaveBeenCalled();
  });

  it('should propagate non-unique database errors when creating master data', async () => {
    const databaseError = new Error('database unavailable');
    const prisma = { masterData: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(databaseError) } };
    const service = new MdmService(prisma as never);

    await expect(service.findOrCreate(MdmCategory.INGREDIENT, 'Bò viên')).rejects.toBe(databaseError);
  });

  it('should list and paginate inactive master data sorted by metadata sortOrder when activeOnly is false', async () => {
    const pool = Array.from({ length: 13 }, (_, idx) => ({
      id: idx + 1,
      category: 'UNIT',
      name: `Đơn vị ${13 - idx}`,
      normalizedName: `don vi ${13 - idx}`,
      metadata: { sortOrder: 13 - idx },
      isActive: idx % 2 === 0,
      createdAt: new Date('2026-11-08T00:00:00.000Z'),
    }));
    const findMany = vi.fn().mockResolvedValue(pool);
    const prisma = { masterData: { findMany } };
    const service = new MdmService(prisma as never);

    const result = await service.list({ category: MdmCategory.UNIT, page: 2, limit: 10, activeOnly: false });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(13);
    expect(result.items.map((i) => i.name)).toEqual(['Đơn vị 11', 'Đơn vị 12', 'Đơn vị 13']);
    const where = { category: 'UNIT', normalizedName: { not: '__internal_cashflow_default_opening_budget__' } };
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: { id: 'asc' },
    });
  });

  it('should filter active master data by keyword in the admin list', async () => {
    const matched = [
      {
        id: 2,
        category: 'INGREDIENT',
        name: 'Bò Tươi',
        normalizedName: 'bo tuoi',
        metadata: { sortOrder: 2 },
        isActive: true,
        createdAt: new Date('2026-11-08T00:00:00.000Z'),
      },
      {
        id: 1,
        category: 'INGREDIENT',
        name: 'Ba Chỉ Bò Mỹ',
        normalizedName: 'ba chi bo my',
        metadata: { sortOrder: 1 },
        isActive: true,
        createdAt: new Date('2026-11-08T00:00:00.000Z'),
      },
    ];
    const findMany = vi.fn().mockResolvedValue(matched);
    const prisma = { masterData: { findMany } };
    const service = new MdmService(prisma as never);

    const result = await service.list({ category: MdmCategory.INGREDIENT, keyword: 'bo', page: 1, limit: 20, activeOnly: true });

    const where = {
      category: 'INGREDIENT',
      isActive: true,
      normalizedName: { not: '__internal_cashflow_default_opening_budget__' },
      OR: [
        { name: { contains: 'bo', mode: 'insensitive' } },
        { normalizedName: { contains: 'bo', mode: 'insensitive' } },
      ],
    };
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.name)).toEqual(['Ba Chỉ Bò Mỹ', 'Bò Tươi']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('should return all active values when lookup has no keyword', async () => {
    const prisma = { masterData: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new MdmService(prisma as never);

    await service.lookup({ category: MdmCategory.UNIT, page: 1, limit: 20, activeOnly: true });

    expect(prisma.masterData.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        category: 'UNIT',
        isActive: true,
        normalizedName: { not: '__internal_cashflow_default_opening_budget__' },
      },
    }));
  });

  it('should return a conflict when renaming a record to another normalized name', async () => {
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, category: 'UNIT', metadata: {} }),
        findFirst: vi.fn().mockResolvedValue({ id: 2 }),
        update: vi.fn(),
      },
    };
    const service = new MdmService(prisma as never);

    await expect(service.update(1, { name: 'Kg' })).rejects.toMatchObject({ status: 409, response: { code: 'MDM_NAME_TAKEN' } });
    expect(prisma.masterData.update).not.toHaveBeenCalled();
  });

  it('should update metadata without changing the normalized name', async () => {
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, category: 'UNIT', metadata: { default: true } }),
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const service = new MdmService(prisma as never);

    await service.update(1, { metadata: { source: 'admin' } });

    expect(prisma.masterData.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { metadata: { default: true, source: 'admin' } },
    });
  });

  it('should convert a database unique violation into an MDM name conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'unit-test', meta: { target: ['category', 'normalized_name'] },
    });
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, category: 'UNIT', metadata: {} }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockRejectedValue(duplicate),
      },
    };
    const service = new MdmService(prisma as never);

    await expect(service.update(1, { name: 'Thùng' })).rejects.toMatchObject({ status: 409, response: { code: 'MDM_NAME_TAKEN' } });
  });

  it('should propagate non-unique database failures while updating master data', async () => {
    const databaseError = new Error('database unavailable');
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, category: 'UNIT', metadata: {} }),
        update: vi.fn().mockRejectedValue(databaseError),
      },
    };
    const service = new MdmService(prisma as never);

    await expect(service.update(1, { metadata: { source: 'admin' } })).rejects.toBe(databaseError);
  });

  it('should return 404 when updating or disabling a missing master-data row', async () => {
    const prisma = { masterData: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const service = new MdmService(prisma as never);

    await expect(service.update(99, { name: 'Kg' })).rejects.toMatchObject({ status: 404 });
    await expect(service.softDisable(99)).rejects.toMatchObject({ status: 404 });
  });

  it('should soft-disable an existing master-data record when delete delegate is unavailable and hard-delete unused record when available', async () => {
    const prismaLegacy = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, category: 'UNIT', name: 'Kg', normalizedName: 'kg', metadata: {} }),
        update: vi.fn().mockResolvedValue({ id: 5, isActive: false }),
      },
    };
    const legacyService = new MdmService(prismaLegacy as never);
    await expect(legacyService.softDisable(5)).resolves.toMatchObject({ id: 5, isActive: false });
    expect(prismaLegacy.masterData.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { isActive: false } });

    const prismaFull = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 6, category: 'SUPPLIER', name: 'Chợ Mới', normalizedName: 'cho moi', metadata: {} }),
        delete: vi.fn().mockResolvedValue({ id: 6, category: 'SUPPLIER', name: 'Chợ Mới', normalizedName: 'cho moi', isActive: true }),
      },
      inventoryImport: { count: vi.fn().mockResolvedValue(0) },
    };
    const fullService = new MdmService(prismaFull as never);
    await expect(fullService.softDisable(6)).resolves.toMatchObject({ id: 6 });
    expect(prismaFull.masterData.delete).toHaveBeenCalledWith({ where: { id: 6 } });
  });

  it('should allow updating normalizedName manually and reject duplicate or invalid normalizedName', async () => {
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({
          id: 10,
          category: 'POSITION',
          name: 'Thu Ngân Quầy',
          normalizedName: 'thu ngan quay',
          metadata: {},
          isActive: true,
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({
          id: 10,
          category: 'POSITION',
          name: 'Thu Ngân Quầy',
          normalizedName: 'thu-ngan-ca',
          metadata: { description: 'Quầy chính' },
          isActive: true,
        }),
      },
    };
    const service = new MdmService(prisma as never);

    await service.update(10, { normalizedName: 'Thu-Ngân-Ca', metadata: { description: 'Quầy chính' } });

    expect(prisma.masterData.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { normalizedName: 'thu-ngan-ca', metadata: { description: 'Quầy chính' } },
    });
  });

  it('should block deactivating or deleting records that still have active references', async () => {
    const prismaDeactivate = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({
          id: 11,
          category: 'POSITION',
          name: 'Thu Ngân Quầy',
          normalizedName: 'thu ngan quay',
          metadata: {},
          isActive: true,
        }),
        update: vi.fn(),
      },
      employee: { count: vi.fn().mockResolvedValue(2) },
    };
    const service = new MdmService(prismaDeactivate as never);

    await expect(service.update(11, { isActive: false })).rejects.toThrow(/2 nhân viên/);
    await expect(service.softDisable(11)).rejects.toThrow(/2 hồ sơ nhân viên/);
    expect(prismaDeactivate.masterData.update).not.toHaveBeenCalled();
  });

  it('should sync product stations when MENU_CATEGORY defaultStation changes and no active order items exist', async () => {
    const tx = {
      masterData: { update: vi.fn().mockResolvedValue({ id: 12, category: 'MENU_CATEGORY', name: 'Topoki', normalizedName: 'topoki', metadata: { defaultStation: 'BEP_NAU' }, isActive: true }) },
      product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({
          id: 12,
          category: 'MENU_CATEGORY',
          name: 'Topoki',
          normalizedName: 'topoki',
          metadata: { defaultStation: 'BEP_CHIEN' },
          isActive: true,
        }),
      },
      orderItem: { count: vi.fn().mockResolvedValue(0) },
      product: { updateMany: tx.product.updateMany },
      $transaction: vi.fn(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const service = new MdmService(prisma as never);

    await service.update(12, { metadata: { defaultStation: 'BEP_NAU' } });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 12, station: { not: 'COMBO' }, sortOrder: { gte: 0 } },
      data: { station: 'BEP_NAU' },
    });
  });
});
