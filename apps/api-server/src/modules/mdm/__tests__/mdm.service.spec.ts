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

  it('should list only active lookup values matching category and keyword', async () => {
    const prisma = { masterData: { findMany: vi.fn().mockResolvedValue([{ id: 1 }]) } };
    const service = new MdmService(prisma as never);

    await service.lookup({ category: MdmCategory.INGREDIENT, keyword: 'bo', page: 1, limit: 20, activeOnly: true });

    expect(prisma.masterData.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        category: 'INGREDIENT',
        isActive: true,
        normalizedName: { not: '__internal_cashflow_default_opening_budget__' },
        name: { contains: 'bo', mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
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

  it('should list inactive master data when activeOnly is false and no keyword was provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(23);
    const prisma = { masterData: { findMany, count } };
    const service = new MdmService(prisma as never);

    const result = await service.list({ category: MdmCategory.UNIT, page: 2, limit: 10, activeOnly: false });

    expect(result).toEqual({ page: 2, limit: 10, total: 23, items: [] });
    const where = { category: 'UNIT', normalizedName: { not: '__internal_cashflow_default_opening_budget__' } };
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: { name: 'asc' },
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('should filter active master data by keyword in the admin list', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(2);
    const prisma = { masterData: { findMany, count } };
    const service = new MdmService(prisma as never);

    const result = await service.list({ category: MdmCategory.INGREDIENT, keyword: 'bo', page: 1, limit: 20, activeOnly: true });

    const where = {
      category: 'INGREDIENT',
      isActive: true,
      normalizedName: { not: '__internal_cashflow_default_opening_budget__' },
      name: { contains: 'bo', mode: 'insensitive' },
    };
    expect(result).toEqual({ page: 1, limit: 20, total: 2, items: [] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
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

  it('should soft-disable an existing master-data record', async () => {
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ id: 5 }),
        update: vi.fn().mockResolvedValue({ id: 5, isActive: false }),
      },
    };
    const service = new MdmService(prisma as never);

    await expect(service.softDisable(5)).resolves.toMatchObject({ id: 5, isActive: false });
    expect(prisma.masterData.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { isActive: false } });
  });
});
