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

  it('should sync non-hidden stations & categories, expose activeOrder, and preserve modifier isAvailable in getPublicMenu', async () => {
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue({ id: 5, name: 'Bàn 05', status: 'OCCUPIED', activeOrderId: 900 }) },
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...productRow,
            id: 1,
            station: 'BEP_NAU',
            modifierGroups: [{
              id: 20,
              name: 'Đồ ăn chính',
              isRequired: false,
              maxSelect: 3,
              isAutoSelect: true,
              allowSubstitution: true,
              modifiers: [
                { id: 201, name: 'Tôm', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, isAvailable: false, defaultSubstituteName: 'Mực' },
                { id: 202, name: 'Mực', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true, isAvailable: true, defaultSubstituteName: 'Tôm' },
              ],
            }],
          },
          {
            ...productRow,
            id: 2,
            station: 'HIDDEN_ST',
          },
        ]),
      },
      masterData: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { id: 10, name: 'Bếp Nấu', isActive: true, metadata: { code: 'BEP_NAU', sortOrder: 1 } },
            { id: 11, name: 'Trạm Ẩn', isActive: true, metadata: { code: 'HIDDEN_ST', isHidden: true, sortOrder: 2 } },
          ])
          .mockResolvedValueOnce([
            { id: 100, name: 'Mì Cay', isActive: true, metadata: { code: 'MI_CAY', stationCode: 'BEP_NAU', sortOrder: 1 } },
            { id: 101, name: 'Mục Ẩn', isActive: true, metadata: { code: 'HIDDEN_CAT', isHidden: true, sortOrder: 2 } },
          ]),
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 900,
          orderCode: 'HD-20261114-0900',
          status: 'SERVING',
          totalAmount: new Prisma.Decimal('45000.00'),
          createdAt: new Date('2026-11-14T04:00:00.000Z'),
          items: [
            {
              id: 1,
              productId: 1,
              product: { name: 'Mì bò' },
              quantity: 1,
              unitPrice: new Prisma.Decimal('45000.00'),
              batchNo: 1,
              kitchenStatus: 'PRINTED',
              itemNote: null,
              modifiersSnapshot: [{ groupId: 20, modifierId: 202, name: 'Mực', extraPrice: '0.00' }],
              createdAt: new Date('2026-11-14T04:00:00.000Z'),
            },
          ],
        }),
      },
    };
    const service = new MenuService(prisma as never);

    const result = await service.getPublicMenu('b'.repeat(64));

    expect(result.stations).toEqual([{ id: 10, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 }]);
    expect(result.categories).toEqual([{ id: 100, code: 'MI_CAY', name: 'Mì Cay', stationCode: 'BEP_NAU', sortOrder: 1 }]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.modifierGroups[0]?.modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 201, name: 'Tôm', isAvailable: false }),
        expect.objectContaining({ id: 202, name: 'Mực', isAvailable: true }),
      ]),
    );
    expect(result.activeOrder).toMatchObject({
      orderId: 900,
      orderCode: 'HD-20261114-0900',
      status: 'SERVING',
      totalAmount: 45000,
    });
  });

  it('should create new products, update existing products (clearing blank fields), and delete omitted products in importProductsExcel', async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          { ...productRow, id: 1, name: 'Mì bò', subtitle: 'Cay nhẹ', categoryId: 10, sortOrder: 1 },
          { ...productRow, id: 2, name: 'Trà sữa cũ', subtitle: null, categoryId: 10, sortOrder: 2 },
        ]),
        findUnique: vi.fn().mockResolvedValue({ _count: { orderItems: 0, comboChildren: 0 } }),
        update: vi.fn().mockResolvedValue({ ...productRow, id: 1 }),
        create: vi.fn().mockResolvedValue({ ...productRow, id: 3, name: 'Bánh mì mới' }),
        delete: vi.fn().mockResolvedValue({ id: 2 }),
      },
      orderItem: {
        count: vi.fn().mockResolvedValue(0),
      },
      masterData: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ name: 'Bếp Nấu', metadata: { code: 'BEP_NAU' } }])
          .mockResolvedValueOnce([{ id: 10, name: 'Mì Cay', normalizedName: 'mi cay', isActive: true }]),
        create: vi.fn().mockResolvedValue({ id: 11, name: 'Ăn Sáng', normalizedName: 'an sang', isActive: true }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (op: (client: typeof tx) => Promise<unknown>) => op(tx)),
    };
    const posSocketGateway = { emitMenuUpdated: vi.fn() };
    const service = new MenuService(prisma as never, posSocketGateway as never);

    const res = await service.importProductsExcel({
      syncMissingAsDeleted: true,
      items: [
        {
          name: 'Mì bò',
          subtitle: null,
          categoryName: null,
          station: 'Bếp Nấu',
          price: 49000,
          modifierGroupsText: null,
          isAvailable: true,
          sortOrder: 1,
        },
        {
          name: 'Bánh mì mới',
          subtitle: 'Giòn nóng',
          categoryName: 'Ăn Sáng',
          station: 'Bếp Chiên',
          price: 30000,
          isAvailable: true,
          sortOrder: 2,
        },
      ],
    });

    expect(res).toEqual({
      createdCount: 1,
      updatedCount: 1,
      deletedCount: 1,
      skippedActiveOrderProducts: [],
    });
    expect(tx.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({
        subtitle: null,
        category: { disconnect: true },
        modifierGroups: { deleteMany: {} },
      }),
    }));
    expect(tx.product.create).toHaveBeenCalledTimes(1);
    expect(tx.product.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(posSocketGateway.emitMenuUpdated).toHaveBeenCalledTimes(1);
  });

  it('resolves transferred activeOrder for DINE_IN F5 only when transferred from the requested table (anti-IDOR) and exposes subtotal/discountAmount', async () => {
    const prisma = {
      diningTable: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          name: 'Bàn 01',
          status: 'AVAILABLE',
          activeOrderId: null,
        }),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      masterData: { findMany: vi.fn().mockResolvedValue([]) },
      order: {
        findUnique: vi
          .fn()
          // 1. Transferred order lookup -> belongs to Bàn 01 via tableTransferLogs
          .mockResolvedValueOnce({
            id: 700,
            tableId: 3,
            status: 'SERVING',
            mergedIntoOrderId: null,
            tableTransferLogs: [{ action: 'MOVE', fromTable: 'Bàn 01', toTable: 'Bàn 03' }],
          })
          // 2. loadPublicActiveOrder for 700
          .mockResolvedValueOnce({
            id: 700,
            orderCode: 'HD-700',
            status: 'SERVING',
            subtotalAmount: new Prisma.Decimal('100000.00'),
            discountAmount: new Prisma.Decimal('10000.00'),
            totalAmount: new Prisma.Decimal('90000.00'),
            createdAt: new Date('2026-11-22T05:00:00.000Z'),
            table: { name: 'Bàn 03' },
            items: [
              {
                id: 1,
                productId: 1,
                product: { name: 'Mì bò' },
                quantity: 1,
                unitPrice: new Prisma.Decimal('100000.00'),
                batchNo: 1,
                kitchenStatus: 'PRINTED',
                itemNote: null,
                modifiersSnapshot: [],
                createdAt: new Date('2026-11-22T05:00:00.000Z'),
              },
            ],
          })
          // 3. Cross-table IDOR attempt (order 888 belongs to Bàn 08, never transferred from Bàn 01)
          .mockResolvedValueOnce({
            id: 888,
            tableId: 8,
            status: 'SERVING',
            mergedIntoOrderId: null,
            tableTransferLogs: [],
          }),
      },
    };
    const service = new MenuService(prisma as never);

    const movedRes = await service.getPublicMenu('ban01-zry8', { activeOrderId: 700 });
    expect(movedRes.activeOrder).toMatchObject({
      orderId: 700,
      subtotalAmount: 100000,
      discountAmount: 10000,
      totalAmount: 90000,
      tableLabel: 'Bàn 03',
    });

    const idorRes = await service.getPublicMenu('ban01-zry8', { activeOrderId: 888 });
    expect(idorRes.activeOrder).toBeNull();
  });

  it('keeps swapped guest attached to their transferred order even when the physical table holds another active order', async () => {
    const prisma = {
      diningTable: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          name: 'Bàn 01',
          status: 'OCCUPIED',
          activeOrderId: 119,
        }),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      masterData: { findMany: vi.fn().mockResolvedValue([]) },
      order: {
        findUnique: vi
          .fn()
          // 1. resolveTransferredTableOrderId(118, Bàn 01) -> swapped from Bàn 01 to Bàn 02
          .mockResolvedValueOnce({
            id: 118,
            tableId: 2,
            status: 'SERVING',
            mergedIntoOrderId: null,
            tableTransferLogs: [{ action: 'SWAP', fromTable: 'Bàn 01', toTable: 'Bàn 02' }],
          })
          // 2. loadPublicActiveOrder(118)
          .mockResolvedValueOnce({
            id: 118,
            orderCode: 'HD-118',
            status: 'SERVING',
            subtotalAmount: new Prisma.Decimal('10000.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('10000.00'),
            createdAt: new Date('2026-11-22T05:00:00.000Z'),
            table: { name: 'Bàn 02' },
            items: [
              {
                id: 1,
                productId: 1,
                product: { name: 'Topping' },
                quantity: 2,
                unitPrice: new Prisma.Decimal('5000.00'),
                batchNo: 1,
                kitchenStatus: 'PRINTED',
                itemNote: null,
                modifiersSnapshot: [],
                createdAt: new Date('2026-11-22T05:00:00.000Z'),
              },
            ],
          }),
      },
    };
    const service = new MenuService(prisma as never);

    const res = await service.getPublicMenu('ban01-zry8', { activeOrderId: 118 });
    expect(res.activeOrder).toMatchObject({
      orderId: 118,
      tableLabel: 'Bàn 02',
      totalAmount: 10000,
    });
    expect(res.table.activeOrderId).toBe(118);
  });

  it('automatically attaches the default Size (M +0đ / L +7.000đ) modifier group when creating a product in one of the 10 drink categories with empty modifierGroups', async () => {
    const tx = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ name: 'Trà Sữa' }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          ...productRow,
          id: 50,
          name: 'Trà Sữa Mới',
          station: 'PHA_CHE',
          price: new Prisma.Decimal('30000.00'),
          modifierGroups: [
            {
              id: 500,
              name: 'Size',
              isRequired: true,
              maxSelect: 1,
              modifiers: [
                { id: 501, name: 'Size M', extraPrice: new Prisma.Decimal('0.00'), isDefaultChecked: true },
                { id: 502, name: 'Size L', extraPrice: new Prisma.Decimal('5000.00'), isDefaultChecked: false },
              ],
            },
          ],
          comboParents: [],
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (op: (client: typeof tx) => Promise<unknown>) => op(tx)),
    };
    const service = new MenuService(prisma as never);

    await service.createProduct({
      name: 'Trà Sữa Mới',
      categoryId: 15,
      price: 30000,
      station: 'PHA_CHE',
      modifierGroups: [],
    });

    expect(tx.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        modifierGroups: {
          create: [
            expect.objectContaining({
              name: 'Size',
              isRequired: true,
              maxSelect: 1,
              modifiers: {
                create: [
                  expect.objectContaining({ name: 'Size M', extraPrice: new Prisma.Decimal(0), isDefaultChecked: true }),
                  expect.objectContaining({ name: 'Size L', extraPrice: new Prisma.Decimal(5000) }),
                ],
              },
            }),
          ],
        },
      }),
    }));
  });

  it('should persist allowedSubstituteNames matrix and return parsed allowlists in toProduct', async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          id: 50,
          name: 'Mì Cay Hải Sản',
          subtitle: null,
          categoryId: 1,
          category: { id: 1, name: 'Mì Cay', isActive: true },
          price: new Prisma.Decimal('69000.00'),
          station: 'BEP_NAU',
          isAvailable: true,
          imageUrl: null,
          sortOrder: 1,
          modifierGroups: [
            {
              id: 30,
              name: 'Đồ ăn món chính',
              isRequired: false,
              maxSelect: 3,
              isAutoSelect: true,
              allowSubstitution: true,
              modifiers: [
                {
                  id: 301,
                  name: 'Ngao',
                  extraPrice: new Prisma.Decimal('0.00'),
                  isDefaultChecked: true,
                  isAvailable: true,
                  defaultSubstituteName: null,
                  allowedSubstituteNames: [],
                },
                {
                  id: 302,
                  name: 'Tôm',
                  extraPrice: new Prisma.Decimal('0.00'),
                  isDefaultChecked: true,
                  isAvailable: true,
                  defaultSubstituteName: 'Mực',
                  allowedSubstituteNames: ['Mực'],
                },
                {
                  id: 303,
                  name: 'Mực',
                  extraPrice: new Prisma.Decimal('0.00'),
                  isDefaultChecked: true,
                  isAvailable: true,
                  defaultSubstituteName: 'Tôm',
                  allowedSubstituteNames: ['Tôm', 'Ngao'],
                },
              ],
            },
          ],
          comboParents: [],
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (op: (client: typeof tx) => Promise<unknown>) => op(tx)),
    };
    const service = new MenuService(prisma as never);

    const created = await service.createProduct({
      name: 'Mì Cay Hải Sản',
      price: 69000,
      station: 'BEP_NAU',
      modifierGroups: [
        {
          name: 'Đồ ăn món chính',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: true,
          allowSubstitution: true,
          modifiers: [
            {
              name: 'Ngao',
              extraPrice: 0,
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: null,
              allowedSubstituteNames: [],
            },
            {
              name: 'Tôm',
              extraPrice: 0,
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: 'Mực',
              allowedSubstituteNames: ['Mực'],
            },
            {
              name: 'Mực',
              extraPrice: 0,
              isDefaultChecked: true,
              isAvailable: true,
              defaultSubstituteName: 'Tôm',
              allowedSubstituteNames: ['Tôm', 'Ngao'],
            },
          ],
        },
      ],
    });

    expect(tx.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        modifierGroups: {
          create: [
            expect.objectContaining({
              allowSubstitution: true,
              modifiers: {
                create: expect.arrayContaining([
                  expect.objectContaining({ name: 'Ngao', allowedSubstituteNames: [] }),
                  expect.objectContaining({ name: 'Tôm', defaultSubstituteName: 'Mực', allowedSubstituteNames: ['Mực'] }),
                  expect.objectContaining({ name: 'Mực', defaultSubstituteName: 'Tôm', allowedSubstituteNames: ['Tôm', 'Ngao'] }),
                ]),
              },
            }),
          ],
        },
      }),
    }));
    expect(created.modifierGroups[0]?.modifiers[0]?.allowedSubstituteNames).toEqual([]);
    expect(created.modifierGroups[0]?.modifiers[1]?.allowedSubstituteNames).toEqual(['Mực']);
  });

  it('should reject self-substitution, unknown targets, or default omitted from allowedSubstituteNames', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new MenuService(prisma as never);

    await expect(service.createProduct({
      name: 'Mì Hải Sản',
      price: 69000,
      station: 'BEP_NAU',
      modifierGroups: [{
        name: 'Đồ ăn chính',
        allowSubstitution: true,
        modifiers: [
          { name: 'Ngao', extraPrice: 0, allowedSubstituteNames: [], defaultSubstituteName: 'Tôm' },
          { name: 'Tôm', extraPrice: 0, allowedSubstituteNames: ['Mực'], defaultSubstituteName: 'Mực' },
          { name: 'Mực', extraPrice: 0, allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' },
        ],
      }],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(service.updateProduct(1, {
      modifierGroups: [{
        name: 'Đồ ăn chính',
        allowSubstitution: true,
        modifiers: [
          { name: 'Tôm', extraPrice: 0, allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' },
          { name: 'Mực', extraPrice: 0, allowedSubstituteNames: ['Tôm'], defaultSubstituteName: 'Tôm' },
        ],
      }],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should invalidate cached getPublicMenu catalog immediately whenever PosSocketGateway.emitMenuUpdated bumps revision', async () => {
    let revision = 0;
    const fakeGateway = {
      getMenuCatalogRevision: () => revision,
      emitMenuUpdated: () => {
        revision += 1;
      },
    };
    const findManyProducts = vi.fn().mockResolvedValue([productRow]);
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue({ id: 7, name: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null }) },
      product: { findMany: findManyProducts },
    };
    const service = new MenuService(prisma as never, fakeGateway as never);

    // First call populates cache; second call hits cache
    await service.getPublicMenu('a'.repeat(64));
    await service.getPublicMenu('a'.repeat(64));
    expect(findManyProducts).toHaveBeenCalledTimes(1);

    // External MDM / Menu mutation calls emitMenuUpdated() -> bumps revision -> forces fresh DB read
    fakeGateway.emitMenuUpdated();
    await service.getPublicMenu('a'.repeat(64));
    expect(findManyProducts).toHaveBeenCalledTimes(2);
  });

  it('should preserve existing comboItems on partial COMBO updates while still rejecting empty COMBO conversions', async () => {
    const comboProduct = {
      ...productRow,
      id: 50,
      name: 'Combo Đặc Biệt',
      station: 'COMBO',
      comboParents: [{ childProductId: 1, quantity: 2 }],
      modifierGroups: [],
    };
    const nonComboProduct = {
      ...productRow,
      id: 51,
      station: 'BEP_NAU',
      comboParents: [],
      modifierGroups: [],
    };

    const tx = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(comboProduct)
          .mockResolvedValueOnce(nonComboProduct),
        update: vi.fn().mockResolvedValue({ ...comboProduct, isAvailable: false }),
      },
      comboItem: { deleteMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (op: (client: typeof tx) => Promise<unknown>) => op(tx)),
    };
    const service = new MenuService(prisma as never);

    const toggled = await service.updateProduct(50, { isAvailable: false });
    expect(toggled.isAvailable).toBe(false);
    expect(toggled.comboItems).toEqual([{ productId: 1, quantity: 2 }]);

    // Converting a regular product to COMBO without comboItems still rejects validation (422)
    await expect(service.updateProduct(51, { station: 'COMBO' })).rejects.toMatchObject({ status: 422 });
  });

  it('should enforce deleteProduct active-order & combo-child guards, soft-archive historical items, and hard-delete unused items', async () => {
    const prismaActiveOrder = {
      $transaction: vi.fn(async (op: (client: unknown) => Promise<unknown>) =>
        op({
          product: { findUnique: vi.fn().mockResolvedValue({ id: 1, name: 'Mì Cay', _count: { orderItems: 0, comboChildren: 0 } }) },
          orderItem: { count: vi.fn().mockResolvedValue(2) },
        }),
      ),
    };
    await expect(new MenuService(prismaActiveOrder as never).deleteProduct(1))
      .rejects.toMatchObject({ response: { code: 'PRODUCT_IN_ACTIVE_ORDER' } });

    const prismaInCombo = {
      $transaction: vi.fn(async (op: (client: unknown) => Promise<unknown>) =>
        op({
          product: { findUnique: vi.fn().mockResolvedValue({ id: 2, name: 'Xúc Xích', _count: { orderItems: 0, comboChildren: 1 } }) },
          orderItem: { count: vi.fn().mockResolvedValue(0) },
          comboItem: { count: vi.fn().mockResolvedValue(1) },
        }),
      ),
    };
    await expect(new MenuService(prismaInCombo as never).deleteProduct(2))
      .rejects.toMatchObject({ response: { code: 'PRODUCT_IN_COMBO' } });

    const historicalUpdate = vi.fn().mockResolvedValue({ id: 3 });
    const prismaHistorical = {
      $transaction: vi.fn(async (op: (client: unknown) => Promise<unknown>) =>
        op({
          product: {
            findUnique: vi.fn().mockResolvedValue({ id: 3, name: 'Trà Đào Cũ', _count: { orderItems: 5, comboChildren: 0 } }),
            update: historicalUpdate,
          },
          orderItem: { count: vi.fn().mockResolvedValue(0) },
        }),
      ),
    };
    const resArchive = await new MenuService(prismaHistorical as never).deleteProduct(3);
    expect(resArchive.deleted).toBe(true);
    expect(historicalUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isAvailable: false, sortOrder: -9999 }),
    }));
  });

  it('lists active products, records field change diffs in updateProduct, and runs importProductsExcel sync', async () => {
    const gateway = { emitMenuUpdated: vi.fn() };
    const auditLog = { record: vi.fn() };
    const comboDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const existingProduct = {
      id: 77,
      categoryId: 10,
      category: { id: 10, name: 'Mỳ Cay', isActive: true, metadata: { defaultStation: 'BEP_NAU' } },
      station: 'COMBO',
      name: 'Combo Mì Bò',
      subtitle: 'Cũ',
      price: new Prisma.Decimal('80000'),
      isAvailable: true,
      sortOrder: 1,
      imageUrl: null,
      modifierGroups: [
        {
          id: 1,
          name: 'Cấp độ',
          isRequired: true,
          maxSelect: 1,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [{ id: 11, name: 'Trứng', extraPrice: new Prisma.Decimal('0'), isDefaultChecked: false, isAvailable: true, isHidden: false }],
        },
      ],
      comboParents: [{ childProductId: 1, quantity: 1 }],
    };
    const updatedProduct = {
      ...existingProduct,
      comboParents: [],
      categoryId: 20,
      category: { id: 20, name: 'Trà Trái Cây', isActive: true, metadata: { defaultStation: 'PHA_CHE' } },
      station: 'BEP_NAU',
      name: 'Mì Bò Đặc Biệt',
      subtitle: 'Mới',
      price: new Prisma.Decimal('95000'),
      isAvailable: false,
      modifierGroups: [
        {
          id: 2,
          name: 'Topping',
          isRequired: false,
          maxSelect: 3,
          isAutoSelect: false,
          allowSubstitution: false,
          modifiers: [{ id: 12, name: 'Trứng', extraPrice: new Prisma.Decimal('10000'), isDefaultChecked: false, isAvailable: false, isHidden: false }],
        },
      ],
    };

    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([existingProduct]),
        findUnique: vi.fn().mockResolvedValue(existingProduct),
        create: vi.fn().mockResolvedValue({ ...existingProduct, id: 88, name: 'Trà Đào Mới', station: 'PHA_CHE', modifierGroups: [], comboParents: [] }),
        update: vi.fn().mockResolvedValue(updatedProduct),
        delete: vi.fn().mockResolvedValue({ id: 77 }),
      },
      comboItem: { deleteMany: comboDeleteMany },
      masterData: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ name: 'Pha Chế', metadata: { code: 'PHA_CHE' } }])
          .mockResolvedValueOnce([{ id: 10, name: 'Trà Trái Cây', normalizedName: 'tra trai cay', isActive: false }]),
        update: vi.fn().mockResolvedValue({ id: 10, isActive: true }),
        create: vi.fn().mockResolvedValue({ id: 30, name: 'Trà Sữa', normalizedName: 'tra sua', isActive: true }),
      },
      orderItem: { count: vi.fn().mockResolvedValue(0) },
    };
    const prisma = {
      ...tx,
      product: { ...tx.product, findMany: vi.fn().mockResolvedValue([updatedProduct]) },
      $transaction: vi.fn(async (op: (client: typeof tx) => Promise<unknown>) => op(tx)),
    };

    const svc = new MenuService(prisma as never, gateway as never, auditLog as never);
    const listed = await svc.listProducts();
    expect(listed[0]?.name).toBe('Mì Bò Đặc Biệt');

    const res = await svc.updateProduct(
      77,
      {
        name: 'Mì Bò Đặc Biệt',
        subtitle: 'Mới',
        categoryId: 20,
        price: 95000,
        station: 'BEP_NAU',
        isAvailable: false,
        modifierGroups: [
          {
            name: 'Topping',
            isRequired: false,
            maxSelect: 3,
            modifiers: [{ name: 'Trứng', extraPrice: 10000, isAvailable: false }],
          },
        ],
      },
      { id: 1, employeeId: 1, username: 'admin', isSuperAdmin: true } as never,
    );
    expect(res.price).toBe(95000);
    expect(comboDeleteMany).toHaveBeenCalledWith({ where: { parentProductId: 77 } });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      module: 'MENU',
      action: 'Cập nhật món ăn',
    }));

    const importSummary = await svc.importProductsExcel(
      {
        items: [
          { name: 'Combo Mì Bò', station: 'BEP_NAU', categoryName: 'Trà Trái Cây', price: 85000, isAvailable: true, sortOrder: 1, subtitle: '', modifierGroupsText: '' },
          { name: 'Trà Sữa Trân Châu', station: 'Pha Chế', categoryName: 'Trà Sữa', price: 32000, isAvailable: true, sortOrder: 2 },
        ],
        syncMissingAsDeleted: true,
      },
      { id: 1, employeeId: 1, username: 'admin', isSuperAdmin: true } as never,
    );
    expect(importSummary).toMatchObject({ createdCount: 1, updatedCount: 1 });
  });
});
