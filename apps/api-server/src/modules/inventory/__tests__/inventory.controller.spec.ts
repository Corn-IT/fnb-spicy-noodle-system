import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InventoryController } from '../inventory.controller';
import { InventoryService } from '../inventory.service';

describe('InventoryController HTTP routes & RBAC (Invariant 8)', () => {
  const inventoryService = {
    list: vi.fn(async () => ({
      page: 1,
      limit: 20,
      total: 0,
      items: [],
      summary: { totalImportCost: 0, totalCashDrawerCost: 0, totalExternalCost: 0 },
    })),
    createBatch: vi.fn(async () => ({ items: [{ id: 1 }], totalCost: 150000 })),
    updateImport: vi.fn(async () => ({ id: 1, totalCost: 200000 })),
    softDelete: vi.fn(async () => ({ id: 1, isDeleted: true })),
  };

  const superAdmin = {
    id: 1,
    employeeId: 1,
    username: 'superadmin',
    isSuperAdmin: true,
    isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };

  const cashierWithCreateDelete = {
    id: 2,
    employeeId: 2,
    username: 'cashier01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({
      inventory: { view: true, create: true, update: false, delete: true },
    }),
  };

  const kitchenNoPerm = {
    id: 3,
    employeeId: 3,
    username: 'kitchen01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class InventoryHttpTestModule {}
    Module({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async (token: string) => ({
              sub: token === 'cashier' ? 2 : token === 'kitchen' ? 3 : 1,
              tokenType: 'access',
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async (args: { where: { id: number } }) => {
                if (args.where.id === 2) return cashierWithCreateDelete;
                if (args.where.id === 3) return kitchenNoPerm;
                return superAdmin;
              },
            },
          },
        },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(InventoryHttpTestModule);

    app = await NestFactory.create(InventoryHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => app?.close());

  it('returns 401 unauthenticated and 403 when missing inventory sub-permissions', async () => {
    expect((await fetch(`${baseUrl}/api/v1/inventory-imports`)).status).toBe(401);

    expect(
      (await fetch(`${baseUrl}/api/v1/inventory-imports`, { headers: { authorization: 'Bearer kitchen' } })).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/inventory-imports`, {
          method: 'POST',
          headers: { authorization: 'Bearer kitchen', 'content-type': 'application/json' },
          body: JSON.stringify({
            supplierName: 'NCC A',
            importDate: '2026-11-27',
            paymentSource: 'CASH_DRAWER',
            items: [{ ingredientName: 'Bò Mỹ', unitName: 'Kg', unitPrice: 150000, quantity: 1 }],
          }),
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/inventory-imports/1`, {
          method: 'PUT',
          headers: { authorization: 'Bearer cashier', 'content-type': 'application/json' },
          body: JSON.stringify({
            supplierName: 'NCC A',
            ingredientName: 'Bò Mỹ',
            unitName: 'Kg',
            unitPrice: 150000,
            quantity: 1,
            paymentSource: 'CASH_DRAWER',
            importDate: '2026-11-27',
          }),
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/inventory-imports/1`, {
          method: 'DELETE',
          headers: { authorization: 'Bearer kitchen' },
        })
      ).status,
    ).toBe(403);
  });

  it('validates payloads and delegates list, createBatch, updateImport, and softDelete cleanly', async () => {
    const adminHeaders = { authorization: 'Bearer admin', 'content-type': 'application/json' };
    const cashierHeaders = { authorization: 'Bearer cashier', 'content-type': 'application/json' };

    const listRes = await fetch(`${baseUrl}/api/v1/inventory-imports?page=1&limit=20&paymentSource=CASH_DRAWER`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(listRes.status).toBe(200);
    expect(inventoryService.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, paymentSource: 'CASH_DRAWER' }),
    );

    const invalidBatch = await fetch(`${baseUrl}/api/v1/inventory-imports`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({ supplierName: 'NCC', importDate: '2026-11-27', items: [] }),
    });
    expect(invalidBatch.status).toBe(422);

    const createRes = await fetch(`${baseUrl}/api/v1/inventory-imports`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        supplierName: 'Công ty Rau',
        importDate: '2026-11-27',
        paymentSource: 'CASH_DRAWER',
        items: [{ ingredientName: 'Cải Thảo', unitName: 'Kg', unitPrice: 30000, quantity: 5 }],
      }),
    });
    expect(createRes.status).toBe(201);
    expect(inventoryService.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({ paymentSource: 'CASH_DRAWER' }),
      2,
    );

    const updateRes = await fetch(`${baseUrl}/api/v1/inventory-imports/1`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        supplierName: 'Công ty Rau',
        ingredientName: 'Cải Thảo',
        unitName: 'Kg',
        unitPrice: 32000,
        quantity: 6,
        paymentSource: 'EXTERNAL',
        importDate: '2026-11-27',
      }),
    });
    expect(updateRes.status).toBe(200);
    expect(inventoryService.updateImport).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ unitPrice: 32000, paymentSource: 'EXTERNAL' }),
      expect.objectContaining({ id: 1 }),
    );

    const deleteRes = await fetch(`${baseUrl}/api/v1/inventory-imports/1`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer cashier' },
    });
    expect(deleteRes.status).toBe(200);
    expect(inventoryService.softDelete).toHaveBeenCalledWith(1, expect.objectContaining({ id: 2 }));
  });
});
