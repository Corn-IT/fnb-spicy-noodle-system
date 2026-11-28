import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PaymentQrController } from '../payment-qr.controller';
import { PaymentQrService } from '../payment-qr.service';

describe('PaymentQrController HTTP routes & RBAC (Invariant 8)', () => {
  const paymentQrService = {
    list: vi.fn(async () => [{ id: 1, label: 'TK Chính', bankCode: 'VPB' }]),
    listOrders: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalTransferAmount: 0 })),
    create: vi.fn(async () => ({ id: 2, label: 'TK Mới' })),
    reorder: vi.fn(async () => [{ id: 2, priority: 1 }, { id: 1, priority: 2 }]),
    update: vi.fn(async () => ({ id: 1, label: 'Updated' })),
    remove: vi.fn(async () => ({ deletedId: 2 })),
  };

  const superAdminRecord = {
    id: 1,
    employeeId: 1,
    username: 'superadmin',
    isSuperAdmin: true,
    isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };

  const viewOnlyUser = {
    id: 2,
    employeeId: 2,
    username: 'viewer01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({
      paymentQr: { view: true, create: false, update: false, delete: false },
    }),
  };

  const cashierNoPermUser = {
    id: 3,
    employeeId: 3,
    username: 'cashier01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class PaymentQrHttpTestModule {}
    Module({
      controllers: [PaymentQrController],
      providers: [
        { provide: PaymentQrService, useValue: paymentQrService },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async (token: string) => ({
              sub: token === 'viewer' ? 2 : token === 'cashier' ? 3 : 1,
              tokenType: 'access',
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async (args: { where: { id: number } }) => {
                if (args.where.id === 2) return viewOnlyUser;
                if (args.where.id === 3) return cashierNoPermUser;
                return superAdminRecord;
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
    })(PaymentQrHttpTestModule);

    app = await NestFactory.create(PaymentQrHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => app?.close());

  it('returns 401 when unauthenticated and 403 when missing paymentQr permissions', async () => {
    expect((await fetch(`${baseUrl}/api/v1/payment-qr`)).status).toBe(401);

    const noViewRes = await fetch(`${baseUrl}/api/v1/payment-qr`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(noViewRes.status).toBe(403);

    const viewOk = await fetch(`${baseUrl}/api/v1/payment-qr`, {
      headers: { authorization: 'Bearer viewer' },
    });
    expect(viewOk.status).toBe(200);

    const ordersOk = await fetch(`${baseUrl}/api/v1/payment-qr/1/orders?page=1&limit=20`, {
      headers: { authorization: 'Bearer viewer' },
    });
    expect(ordersOk.status).toBe(200);
    expect(paymentQrService.listOrders).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ page: 1, limit: 20 }),
    );

    const forbiddenCreate = await fetch(`${baseUrl}/api/v1/payment-qr`, {
      method: 'POST',
      headers: { authorization: 'Bearer viewer', 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'QR Test',
        bankCode: 'VPB',
        accountNo: '186877721',
        accountName: 'THAN THI LOAN',
      }),
    });
    expect(forbiddenCreate.status).toBe(403);

    const forbiddenReorder = await fetch(`${baseUrl}/api/v1/payment-qr/reorder`, {
      method: 'PUT',
      headers: { authorization: 'Bearer viewer', 'content-type': 'application/json' },
      body: JSON.stringify({ orderedIds: [2, 1] }),
    });
    expect(forbiddenReorder.status).toBe(403);

    const forbiddenUpdate = await fetch(`${baseUrl}/api/v1/payment-qr/1`, {
      method: 'PUT',
      headers: { authorization: 'Bearer viewer', 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Rename' }),
    });
    expect(forbiddenUpdate.status).toBe(403);

    const forbiddenDelete = await fetch(`${baseUrl}/api/v1/payment-qr/2`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer viewer' },
    });
    expect(forbiddenDelete.status).toBe(403);
  });

  it('validates payloads and delegates CRUD & reorder to PaymentQrService for authorized actors', async () => {
    const adminHeaders = {
      authorization: 'Bearer admin',
      'content-type': 'application/json',
    };

    const invalidCreate = await fetch(`${baseUrl}/api/v1/payment-qr`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ label: '', bankCode: 'VPB', accountNo: '12', accountName: 'A' }),
    });
    expect(invalidCreate.status).toBe(422);

    const createRes = await fetch(`${baseUrl}/api/v1/payment-qr`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        label: 'TK Phụ VCB',
        bankCode: 'VCB',
        accountNo: '0071001234567',
        accountName: 'THAN THI LOAN',
        isActive: true,
        dailyLimit: 5000000,
        monthlyLimit: 50000000,
        yearlyLimit: null,
      }),
    });
    expect(createRes.status).toBe(201);
    expect(paymentQrService.create).toHaveBeenCalledWith(
      expect.objectContaining({ bankCode: 'VCB', accountNo: '0071001234567' }),
      1,
    );

    const reorderRes = await fetch(`${baseUrl}/api/v1/payment-qr/reorder`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ orderedIds: [2, 1] }),
    });
    expect(reorderRes.status).toBe(200);
    expect(paymentQrService.reorder).toHaveBeenCalledWith({ orderedIds: [2, 1] }, 1);

    const updateRes = await fetch(`${baseUrl}/api/v1/payment-qr/1`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    expect(updateRes.status).toBe(200);
    expect(paymentQrService.update).toHaveBeenCalledWith(1, { isActive: false }, 1);

    const deleteRes = await fetch(`${baseUrl}/api/v1/payment-qr/2`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer admin' },
    });
    expect(deleteRes.status).toBe(200);
    expect(paymentQrService.remove).toHaveBeenCalledWith(2, 1);
  });
});
