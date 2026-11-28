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
        id: { in: expect.any(Array) },
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

  it('should update an inventory import record and recalculate totalCost using Decimal', async () => {
    const harness = createHarness();
    harness.tx.inventoryImport.findUnique.mockResolvedValue({
      id: 20,
      isDeleted: false,
      importDate: new Date('2026-11-10T00:00:00.000Z'),
      supplierId: 10,
      supplierNameSnapshot: 'Cửa Hàng Hải Sản',
      itemId: 11,
      itemNameSnapshot: 'Mực Ống Tươi',
      unitId: 12,
      unitNameSnapshot: 'kg',
      unitPrice: new Prisma.Decimal('100000'),
      quantity: new Prisma.Decimal('2'),
      totalCost: new Prisma.Decimal('200000'),
      paymentSource: PaymentSource.CASH_DRAWER,
      note: 'Cũ',
      createdAt: new Date('2026-11-10T03:00:00.000Z'),
    });
    harness.mdm.findOrCreate
      .mockResolvedValueOnce({ id: 22, category: MdmCategory.UNIT, name: 'kg' })
      .mockResolvedValueOnce({ id: 21, category: MdmCategory.INGREDIENT, name: 'Tôm Sú' })
      .mockResolvedValueOnce({ id: 20, category: MdmCategory.SUPPLIER, name: 'Chợ Đầu Mối' });
    harness.tx.inventoryImport.update.mockResolvedValue({
      id: 20,
      isDeleted: false,
      ingredientMdmId: 21,
      supplierMdmId: 20,
      supplierNameSnapshot: 'Chợ Đầu Mối',
      itemNameSnapshot: 'Tôm Sú',
      unitName: 'kg',
      unitPrice: new Prisma.Decimal('150000'),
      quantity: new Prisma.Decimal('3.5'),
      totalCost: new Prisma.Decimal('525000'),
      paymentSource: PaymentSource.EXTERNAL,
      importDate: new Date('2026-11-10T00:00:00.000Z'),
      note: 'Đã cập nhật',
      createdBy: 1,
      createdAt: new Date('2026-11-10T03:00:00.000Z'),
    });
    const auditLogService = { record: vi.fn() };
    const service = new InventoryService(
      harness.prisma as never,
      harness.mdm as unknown as MdmService,
      auditLogService as never,
    );

    const updated = await service.updateImport(20, {
      importDate: '2026-11-10',
      supplierName: 'Chợ Đầu Mối',
      ingredientName: 'Tôm Sú',
      unitName: 'kg',
      unitPrice: 150000,
      quantity: 3.5,
      paymentSource: PaymentSource.EXTERNAL,
      note: 'Đã cập nhật',
    }, cashier());

    expect(harness.tx.inventoryImport.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20 },
      data: expect.objectContaining({
        totalCost: new Prisma.Decimal('525000'),
        paymentSource: PaymentSource.EXTERNAL,
      }),
    }));
    expect(updated.totalCost).toBe(525000);
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      module: 'INVENTORY',
      action: 'Chỉnh sửa phiếu nhập kho',
      metadata: expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ field: 'Nguyên liệu', from: 'Mực Ống Tươi', to: 'Tôm Sú' }),
          expect.objectContaining({ field: 'Nguồn tiền', from: 'Tiền két', to: 'Quỹ ngoài' }),
          expect.objectContaining({ field: 'Ghi chú', from: 'Cũ', to: 'Đã cập nhật' }),
        ]),
      }),
    }));
  });

  it('resolves ingredient & supplier by MDM ID, rejects deleted/missing updateImport, and enforces NUMERIC(12,2) ceiling', async () => {
    const harness = createHarness();
    const service = new InventoryService(harness.prisma as never, harness.mdm as unknown as MdmService);

    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 30, category: MdmCategory.SUPPLIER, name: 'NCC Mì', isActive: true })
      .mockResolvedValueOnce({ id: 40, category: MdmCategory.INGREDIENT, name: 'Mì Trứng', isActive: true });
    harness.tx.inventoryImport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 88,
      ...data,
    }));

    const batch = await service.createBatch(
      {
        supplierMdmId: 30,
        importDate: '2026-11-27',
        paymentSource: PaymentSource.CASH_DRAWER,
        items: [{ ingredientMdmId: 40, unitName: 'Thùng', unitPrice: 250000, quantity: 2 }],
      },
      1,
    );
    expect(batch.totalCost).toBe(500000);

    // Inactive/missing ingredient MDM fails 404
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 30, category: MdmCategory.SUPPLIER, name: 'NCC Mì', isActive: true })
      .mockResolvedValueOnce(null);
    await expect(
      service.createBatch(
        {
          supplierMdmId: 30,
          importDate: '2026-11-27',
          paymentSource: PaymentSource.CASH_DRAWER,
          items: [{ ingredientMdmId: 999, unitName: 'Thùng', unitPrice: 1000, quantity: 1 }],
        },
        1,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    // updateImport missing -> 404, deleted -> 409
    harness.tx.inventoryImport.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.updateImport(
        999,
        {
          supplierName: 'NCC',
          ingredientName: 'Bò',
          unitName: 'kg',
          unitPrice: 10000,
          quantity: 1,
          paymentSource: PaymentSource.CASH_DRAWER,
          importDate: '2026-11-27',
        },
        cashier(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    harness.tx.inventoryImport.findUnique.mockResolvedValueOnce({ id: 20, isDeleted: true });
    await expect(
      service.updateImport(
        20,
        {
          supplierName: 'NCC',
          ingredientName: 'Bò',
          unitName: 'kg',
          unitPrice: 10000,
          quantity: 1,
          paymentSource: PaymentSource.CASH_DRAWER,
          importDate: '2026-11-27',
        },
        cashier(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    // Full field-change audit diff on updateImport
    const now = new Date();
    const diffTx = {
      inventoryImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 21,
          isDeleted: false,
          createdAt: now,
          itemNameSnapshot: 'Mì Trứng',
          supplierNameSnapshot: 'NCC Cũ',
          unitName: 'Thùng',
          quantity: new Prisma.Decimal('2'),
          unitPrice: new Prisma.Decimal('100000'),
          totalCost: new Prisma.Decimal('200000'),
          paymentSource: PaymentSource.CASH_DRAWER,
          importDate: new Date('2026-11-20T00:00:00.000Z'),
          note: 'Ghi chú cũ',
        }),
        update: vi.fn().mockResolvedValue({
          id: 21,
          ingredientMdmId: 101,
          supplierMdmId: 103,
          itemNameSnapshot: 'Bò Mỹ',
          supplierNameSnapshot: 'NCC Mới',
          unitName: 'Kg',
          quantity: new Prisma.Decimal('3'),
          unitPrice: new Prisma.Decimal('150000'),
          totalCost: new Prisma.Decimal('450000'),
          paymentSource: PaymentSource.EXTERNAL,
          importDate: new Date('2026-11-27T00:00:00.000Z'),
          note: 'Ghi chú mới',
          createdBy: 1,
          isDeleted: false,
          createdAt: now,
        }),
      },
      $queryRaw: vi.fn(),
    };
    const mdm = {
      findOrCreate: vi
        .fn()
        .mockResolvedValueOnce({ id: 101, name: 'Bò Mỹ' })
        .mockResolvedValueOnce({ id: 102, name: 'Kg' })
        .mockResolvedValueOnce({ id: 103, name: 'NCC Mới' }),
    };
    const auditLog = { record: vi.fn() };
    const diffPrisma = {
      ...diffTx,
      $transaction: vi.fn(async (op: (tx: typeof diffTx) => Promise<unknown>) => op(diffTx)),
    };
    const svcDiff = new InventoryService(diffPrisma as never, mdm as never, auditLog as never);
    await svcDiff.updateImport(
      21,
      {
        ingredientName: 'Bò Mỹ',
        supplierName: 'NCC Mới',
        unitName: 'Kg',
        quantity: 3,
        unitPrice: 150000,
        paymentSource: PaymentSource.EXTERNAL,
        importDate: '2026-11-27',
        note: 'Ghi chú mới',
      },
      cashier(),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'INVENTORY',
        action: 'Chỉnh sửa phiếu nhập kho',
        metadata: expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'Nguyên liệu' }),
            expect.objectContaining({ field: 'Nhà cung cấp' }),
            expect.objectContaining({ field: 'Đơn vị tính' }),
            expect.objectContaining({ field: 'Số lượng' }),
            expect.objectContaining({ field: 'Đơn giá' }),
            expect.objectContaining({ field: 'Thành tiền' }),
            expect.objectContaining({ field: 'Nguồn tiền' }),
            expect.objectContaining({ field: 'Ngày nhập' }),
            expect.objectContaining({ field: 'Ghi chú' }),
          ]),
        }),
      }),
    );

    // listImports keyword unaccent/fallback + paymentSource + ingredientMdmId + date filters + groupTotal
    const listPrisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 21 }]).mockRejectedValueOnce(new Error('no unaccent')),
      inventoryImport: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 21,
            ingredientMdmId: 101,
            supplierMdmId: 103,
            itemNameSnapshot: 'Bò Mỹ',
            supplierNameSnapshot: 'NCC Mới',
            unitName: 'Kg',
            quantity: new Prisma.Decimal('3'),
            unitPrice: new Prisma.Decimal('150000'),
            totalCost: new Prisma.Decimal('450000'),
            paymentSource: PaymentSource.EXTERNAL,
            importDate: new Date('2026-11-27T00:00:00.000Z'),
            note: null,
            createdBy: 1,
            isDeleted: false,
            createdAt: now,
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
        groupBy: vi.fn().mockResolvedValue([
          { paymentSource: 'CASH_DRAWER', _sum: { totalCost: new Prisma.Decimal('100000') } },
          { paymentSource: 'EXTERNAL', _sum: { totalCost: new Prisma.Decimal('450000') } },
        ]),
      },
    };
    const svcList = new InventoryService(listPrisma as never, mdm as never, auditLog as never);
    const listUnaccent = await svcList.list({
      page: 1,
      limit: 20,
      keyword: 'bo my',
      paymentSource: PaymentSource.EXTERNAL,
      ingredientMdmId: 101,
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    });
    expect(listUnaccent.summary.totalImportCost).toBe(550000);

    const listFallback = await svcList.list({
      page: 1,
      limit: 20,
      keyword: 'bo my',
    });
    expect(listFallback.items).toHaveLength(1);
  });

  it('guards createBatch, list, updateImport, and softDelete error & lookup branches (403/404/409/422)', async () => {
    const h = createHarness();
    h.tx.masterData.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => {
      if (where.id === 501) return { id: 501, category: MdmCategory.SUPPLIER, name: 'NCC A', isActive: true };
      if (where.id === 502) return { id: 502, category: MdmCategory.INGREDIENT, name: 'Ớt Bột', isActive: true };
      if (where.id === 503) return { id: 503, category: MdmCategory.SUPPLIER, name: 'NCC Ẩn', isActive: false };
      return null;
    });
    h.tx.inventoryImport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 99,
      ...data,
    }));

    const svc = new InventoryService(h.prisma as never, h.mdm as unknown as MdmService);

    await expect(
      svc.createBatch({ items: [], supplierName: 'NCC', paymentSource: PaymentSource.CASH_DRAWER, importDate: '2026-11-28' } as never, 1),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      svc.createBatch({
        items: [{ ingredientMdmId: 502, unitName: 'Kg', unitPrice: 10000, quantity: 1 }],
        supplierMdmId: 503,
        paymentSource: PaymentSource.CASH_DRAWER,
        importDate: '2026-11-28',
      }, 1),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      svc.createBatch({
        items: [{ ingredientMdmId: 999, unitName: 'Kg', unitPrice: 10000, quantity: 1 }],
        supplierMdmId: 501,
        paymentSource: PaymentSource.CASH_DRAWER,
        importDate: '2026-11-28',
      }, 1),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Valid lookup via supplierMdmId + ingredientMdmId
    const byIds = await svc.createBatch({
      items: [{ ingredientMdmId: 502, unitName: 'Kg', unitPrice: 50000, quantity: 2 }],
      supplierMdmId: 501,
      paymentSource: PaymentSource.EXTERNAL,
      importDate: '2026-11-28',
    }, 1);
    expect(byIds.totalCost).toBe(100000);

    await expect(svc.list({ page: -1, limit: 20 } as never)).rejects.toMatchObject({ status: 422 });

    await expect(
      svc.updateImport(1, { ingredientName: '', unitName: 'Kg', unitPrice: 1000, quantity: 1, paymentSource: PaymentSource.CASH_DRAWER, importDate: '2026-11-28' } as never, cashier()),
    ).rejects.toMatchObject({ status: 422 });

    h.tx.inventoryImport.findUnique.mockResolvedValueOnce(null);
    await expect(
      svc.updateImport(999, { ingredientName: 'Bò', unitName: 'Kg', unitPrice: 1000, quantity: 1, paymentSource: PaymentSource.CASH_DRAWER, importDate: '2026-11-28' }, cashier()),
    ).rejects.toBeInstanceOf(NotFoundException);

    h.tx.inventoryImport.findUnique.mockResolvedValueOnce({ id: 5, isDeleted: true });
    await expect(
      svc.updateImport(5, { ingredientName: 'Bò', unitName: 'Kg', unitPrice: 1000, quantity: 1, paymentSource: PaymentSource.CASH_DRAWER, importDate: '2026-11-28' }, cashier()),
    ).rejects.toBeInstanceOf(ConflictException);

    h.tx.inventoryImport.findUnique.mockResolvedValueOnce(null);
    await expect(svc.softDelete(999, cashier())).rejects.toBeInstanceOf(NotFoundException);

    h.tx.inventoryImport.findUnique.mockResolvedValueOnce({ id: 5, isDeleted: true });
    await expect(svc.softDelete(5, cashier())).rejects.toBeInstanceOf(ConflictException);

    // Non-manager cashier cannot delete past-day import -> 403
    h.tx.inventoryImport.findUnique.mockResolvedValueOnce({
      id: 6,
      isDeleted: false,
      createdAt: new Date('2020-01-01T01:00:00.000Z'),
      totalCost: new Prisma.Decimal('50000'),
      paymentSource: 'CASH_DRAWER',
      itemNameSnapshot: 'Hành',
    });
    await expect(svc.softDelete(6, cashier())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
