import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MdmCategory, PaymentSource, type AuthPrincipal } from '@fnb/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MdmService } from '../../mdm/mdm.service';
import { InventoryService } from '../inventory.service';

function createHarness() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    masterData: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    inventoryImport: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const mdm = {
    findOrCreate: vi.fn(async (category: string, name: string) => ({
      id: category === MdmCategory.INGREDIENT ? 17 : category === MdmCategory.SUPPLIER ? 22 : 4,
      category,
      name: category === MdmCategory.INGREDIENT
        ? 'Ba Chỉ Bò Mỹ'
        : category === MdmCategory.SUPPLIER
          ? 'Công Ty Rau Sạch'
          : name,
    })),
  };
  return { prisma, tx, mdm };
}

function cashier(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    id: 9,
    employeeId: 9,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions: {
      pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false },
      invoices: { view: false, reprint: false, void: false },
      inventory: { view: true, create: true, update: false, delete: true },
      cashflow: { view: false, create: false, config: false },
      employees: { view: false, create: false, update: false, delete: false },
      schedules: { view: false, update: false },
      mdm: { view: false, write: false },
      rbac: { view: false, manage: false },
    },
    ...overrides,
  };
}

describe('InventoryService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a batch, resolve ingredient and unit MDM, and round every line with Decimal', async () => {
    const harness = createHarness();
    harness.tx.inventoryImport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 1,
      ...data,
    }));
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    const result = await service.createBatch({
      items: [
        { ingredientName: '  ba chỉ bò mỹ  ', unitName: 'Kg', unitPrice: 1.15, quantity: 2.5 },
        { ingredientName: '  trứng gà  ', unitName: 'Quả', unitPrice: 9, quantity: 3.5 },
      ],
      supplierName: '  Công ty Rau Sạch  ',
      paymentSource: PaymentSource.EXTERNAL,
      importDate: '2026-11-08',
      note: 'Nhập thịt',
    }, 9);

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.mdm.findOrCreate).toHaveBeenNthCalledWith(
      1,
      MdmCategory.SUPPLIER,
      'Công ty Rau Sạch',
      {},
      harness.tx,
    );
    expect(harness.mdm.findOrCreate).toHaveBeenNthCalledWith(
      2,
      MdmCategory.UNIT,
      'Kg',
      {},
      harness.tx,
    );
    expect(harness.mdm.findOrCreate).toHaveBeenNthCalledWith(
      3,
      MdmCategory.INGREDIENT,
      '  ba chỉ bò mỹ  ',
      { default_unit: 'Kg', last_price: 1.15 },
      harness.tx,
    );
    expect(harness.tx.inventoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientMdmId: 17,
        supplierMdmId: 22,
        supplierNameSnapshot: 'Công Ty Rau Sạch',
        itemNameSnapshot: 'Ba Chỉ Bò Mỹ',
        unitName: 'Kg',
        unitPrice: new Prisma.Decimal('1.15'),
        quantity: new Prisma.Decimal('2.5'),
        totalCost: new Prisma.Decimal('2.88'),
        paymentSource: 'EXTERNAL',
        importDate: new Date('2026-11-08T00:00:00.000Z'),
        createdBy: 9,
      }),
    });
    expect(harness.tx.inventoryImport.create).toHaveBeenCalledTimes(2);
    expect(result.totalCost).toBe(34.38);
    expect(result.items).toHaveLength(2);
  });

  it('rejects an inactive or non-supplier MDM record selected as the supplier', async () => {
    const harness = createHarness();
    harness.tx.masterData.findUnique.mockResolvedValue({
      id: 22,
      category: MdmCategory.INGREDIENT,
      name: 'Bò Viên',
      isActive: true,
    });
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createBatch({
      supplierMdmId: 22,
      items: [{ ingredientName: 'Bò Viên', unitName: 'Kg', unitPrice: 10000, quantity: 1 }],
      importDate: '2026-11-08',
    }, 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should list matching imports with server pagination and summaries across all matching rows', async () => {
    const harness = createHarness();
    harness.tx.inventoryImport.findMany.mockResolvedValue([{
      id: 3,
      unitPrice: new Prisma.Decimal('2.05'),
      quantity: new Prisma.Decimal('5'),
      totalCost: new Prisma.Decimal('10.25'),
    }]);
    harness.tx.inventoryImport.count.mockResolvedValue(21);
    harness.tx.inventoryImport.groupBy.mockResolvedValue([
      { paymentSource: PaymentSource.CASH_DRAWER, _sum: { totalCost: new Prisma.Decimal('30.50') } },
      { paymentSource: PaymentSource.EXTERNAL, _sum: { totalCost: new Prisma.Decimal('8.25') } },
    ]);
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    const result = await service.list({
      page: 2,
      limit: 10,
      fromDate: '2026-11-01',
      toDate: '2026-11-08',
      keyword: 'ba chi',
      paymentSource: PaymentSource.CASH_DRAWER,
    });

    expect(harness.tx.inventoryImport.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isDeleted: false,
        paymentSource: PaymentSource.CASH_DRAWER,
        importDate: { gte: new Date('2026-11-01T00:00:00.000Z'), lt: new Date('2026-11-09T00:00:00.000Z') },
        itemNameSnapshot: { contains: 'ba chi', mode: 'insensitive' },
      }),
      skip: 10,
      take: 10,
    }));
    expect(result).toMatchObject({
      page: 2,
      limit: 10,
      total: 21,
      summary: { totalImportCost: 38.75, totalCashDrawerCost: 30.5, totalExternalCost: 8.25 },
    });
  });

  it('should allow a cashier to soft-delete an import created during the current business day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T05:00:00.000Z'));
    const harness = createHarness();
    harness.tx.inventoryImport.findUnique.mockResolvedValue({
      id: 12, isDeleted: false, createdAt: new Date('2026-11-08T02:00:00.000Z'),
      unitPrice: new Prisma.Decimal('10'), quantity: new Prisma.Decimal('1'), totalCost: new Prisma.Decimal('10'),
    });
    harness.tx.inventoryImport.update.mockResolvedValue({
      id: 12, isDeleted: true,
      unitPrice: new Prisma.Decimal('10'), quantity: new Prisma.Decimal('1'), totalCost: new Prisma.Decimal('10'),
    });
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.softDelete(12, cashier())).resolves.toMatchObject({ id: 12, isDeleted: true });
    expect(harness.tx.inventoryImport.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { isDeleted: true } });
  });

  it('should require a manager or super admin to delete an import from a prior business day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T05:00:00.000Z'));
    const harness = createHarness();
    harness.tx.inventoryImport.findUnique.mockResolvedValue({
      id: 12, isDeleted: false, createdAt: new Date('2026-11-07T15:00:00.000Z'),
      unitPrice: new Prisma.Decimal('10'), quantity: new Prisma.Decimal('1'), totalCost: new Prisma.Decimal('10'),
    });
    harness.tx.inventoryImport.update.mockResolvedValue({
      id: 12, isDeleted: true,
      unitPrice: new Prisma.Decimal('10'), quantity: new Prisma.Decimal('1'), totalCost: new Prisma.Decimal('10'),
    });
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.softDelete(12, cashier())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.softDelete(12, cashier({
      permissions: { ...cashier().permissions, inventory: { ...cashier().permissions.inventory, update: true } },
    }))).resolves.toMatchObject({ id: 12, isDeleted: true });
    expect(harness.tx.inventoryImport.update).toHaveBeenCalledOnce();
  });

  it('should return not found for a missing import and conflict for an already deleted import', async () => {
    const harness = createHarness();
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    harness.tx.inventoryImport.findUnique.mockResolvedValue(null);
    await expect(service.softDelete(99, cashier())).rejects.toBeInstanceOf(NotFoundException);
    harness.tx.inventoryImport.findUnique.mockResolvedValue({
      id: 12, isDeleted: true,
      unitPrice: new Prisma.Decimal('10'), quantity: new Prisma.Decimal('1'), totalCost: new Prisma.Decimal('10'),
    });
    await expect(service.softDelete(12, cashier())).rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.inventoryImport.update).not.toHaveBeenCalled();
  });
});
