import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MenuService } from '../menu.service';

const productRow = {
  id: 1,
  name: 'Mì bò',
  price: new Prisma.Decimal('45000.00'),
  station: 'BEP_NAU',
  isAvailable: true,
  imageUrl: null,
  sortOrder: 0,
  modifierGroups: [{
    id: 10,
    name: 'Cấp độ cay',
    isRequired: true,
    maxSelect: 1,
    modifiers: [{ id: 100, name: 'Cấp độ 3', extraPrice: new Prisma.Decimal('0.00') }],
  }],
  comboParents: [],
};

describe('MenuService', () => {
  it('should return only available products with the scanned table session', async () => {
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 42 }) },
      product: { findMany: vi.fn().mockResolvedValue([productRow]) },
    };
    const service = new MenuService(prisma as never);

    const result = await service.getPublicMenu('a'.repeat(64));

    expect(result).toMatchObject({
      table: { tableId: 7, tableName: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 42 },
      products: [{ id: 1, price: 45000, modifierGroups: [{ modifiers: [{ extraPrice: 0 }] }], comboItems: [] }],
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isAvailable: true } }));
  });

  it('should reject an unknown QR token without loading the menu', async () => {
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue(null) },
      product: { findMany: vi.fn() },
    };
    const service = new MenuService(prisma as never);

    await expect(service.getPublicMenu('x'.repeat(64))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('should treat malformed QR tokens as an unknown table without querying the database', async () => {
    const prisma = {
      diningTable: { findUnique: vi.fn() },
      product: { findMany: vi.fn() },
    };
    const service = new MenuService(prisma as never);

    await expect(service.getPublicMenu('invalid')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.diningTable.findUnique).not.toHaveBeenCalled();
  });

  it('should persist a product and all of its modifier and combo configuration atomically', async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([{ id: 2, station: 'BEP_NAU' }]),
        create: vi.fn().mockResolvedValue({
          ...productRow,
          station: 'COMBO',
          comboParents: [{ childProductId: 2, quantity: 2 }],
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new MenuService(prisma as never);

    await service.createProduct({
      name: 'Combo đôi',
      price: 99000,
      station: 'COMBO',
      comboItems: [{ productId: 2, quantity: 2 }],
      modifierGroups: [{
        name: 'Cấp độ cay', isRequired: true, maxSelect: 1,
        modifiers: [{ name: 'Cấp độ 3', extraPrice: 0 }],
      }],
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Combo đôi',
        comboParents: { create: [{ childProduct: { connect: { id: 2 } }, quantity: 2 }] },
        modifierGroups: { create: [{
          name: 'Cấp độ cay', isRequired: true, maxSelect: 1,
          modifiers: { create: [{ name: 'Cấp độ 3', extraPrice: new Prisma.Decimal('0.00') }] },
        }] },
      }),
      include: expect.any(Object),
    }));
  });

  it('should reject duplicate normalized topping names before creating a product', async () => {
    const tx = { product: { findMany: vi.fn(), create: vi.fn() } };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new MenuService(prisma as never);

    await expect(service.createProduct({
      name: 'Mì cay',
      price: 45000,
      station: 'BEP_NAU',
      modifierGroups: [{
        name: 'Topping',
        modifiers: [
          { name: 'Thêm Bò Viên', extraPrice: 5000 },
          { name: '  them bo vien  ', extraPrice: 10000 },
        ],
      }],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it('should reject duplicate normalized topping names when updating a product', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new MenuService(prisma as never);

    await expect(service.updateProduct(1, {
      modifierGroups: [{
        name: 'Topping',
        modifiers: [
          { name: 'Trứng', extraPrice: 5000 },
          { name: 'TRUNG', extraPrice: 5000 },
        ],
      }],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject a combo containing another combo product', async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([{ id: 2, station: 'COMBO' }]),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new MenuService(prisma as never);

    await expect(service.createProduct({
      name: 'Combo đôi', price: 99000, station: 'COMBO', comboItems: [{ productId: 2, quantity: 1 }],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.product.create).not.toHaveBeenCalled();
  });
});
