import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InvoicesController } from '../invoices.controller';
import { InvoicesService } from '../invoices.service';

describe('InvoicesController HTTP routes & RBAC (Invariant 8)', () => {
  const invoicesService = {
    list: vi.fn(async () => ({ page: 1, limit: 20, total: 0, items: [] })),
    get: vi.fn(async () => ({ orderId: 101, orderCode: 'HD-101' })),
    reprint: vi.fn(async () => ({ orderId: 101, orderCode: 'HD-101', status: 'PAID' })),
    requestPaymentMethodEdit: vi.fn(async () => ({ orderId: 101, status: 'PENDING_APPROVAL' })),
    reviewPaymentMethodEdit: vi.fn(async () => ({ orderId: 101, status: 'APPROVED' })),
    voidInvoice: vi.fn(async () => ({
      orderId: 101,
      orderCode: 'HD-101',
      status: 'VOIDED',
      voidReason: 'Khách phản ánh tính sai món',
      syncedSettlementIds: [7],
    })),
  };

  const superAdmin = {
    id: 1,
    employeeId: 1,
    username: 'superadmin',
    isSuperAdmin: true,
    isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };

  const cashierWithUpdateAndReprint = {
    id: 2,
    employeeId: 2,
    username: 'cashier01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({
      invoices: { view: true, reprint: true, update: true, approve: false, void: false },
    }),
  };

  const viewerNoInvoices = {
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
    class InvoicesHttpTestModule {}
    Module({
      controllers: [InvoicesController],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
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
                if (args.where.id === 2) return cashierWithUpdateAndReprint;
                if (args.where.id === 3) return viewerNoInvoices;
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
    })(InvoicesHttpTestModule);

    app = await NestFactory.create(InvoicesHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => app?.close());

  it('enforces 401 unauthenticated and 403 RBAC across list, detail, reprint, edit PM, approve PM, and void', async () => {
    expect((await fetch(`${baseUrl}/api/v1/invoices`)).status).toBe(401);

    expect(
      (await fetch(`${baseUrl}/api/v1/invoices`, { headers: { authorization: 'Bearer kitchen' } })).status,
    ).toBe(403);

    expect(
      (await fetch(`${baseUrl}/api/v1/invoices/101`, { headers: { authorization: 'Bearer kitchen' } })).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/invoices/101/payment-method/review`, {
          method: 'POST',
          headers: { authorization: 'Bearer cashier', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'APPROVE' }),
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/v1/invoices/101/void`, {
          method: 'POST',
          headers: { authorization: 'Bearer cashier', 'content-type': 'application/json' },
          body: JSON.stringify({ voidReason: 'Khách phản ánh tính sai món' }),
        })
      ).status,
    ).toBe(403);
  });

  it('delegates all 6 Endpoints cleanly with ZodValidationPipe validation', async () => {
    const adminHeaders = { authorization: 'Bearer admin', 'content-type': 'application/json' };
    const cashierHeaders = { authorization: 'Bearer cashier', 'content-type': 'application/json' };

    const listRes = await fetch(`${baseUrl}/api/v1/invoices?page=1&limit=20&status=PAID`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(listRes.status).toBe(200);
    expect(invoicesService.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20, status: 'PAID' }));

    const getRes = await fetch(`${baseUrl}/api/v1/invoices/101`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(getRes.status).toBe(200);
    expect(invoicesService.get).toHaveBeenCalledWith(101);

    const reprintRes = await fetch(`${baseUrl}/api/v1/invoices/101/reprint`, {
      method: 'POST',
      headers: { authorization: 'Bearer cashier' },
    });
    expect(reprintRes.status).toBe(201);
    expect(invoicesService.reprint).toHaveBeenCalledWith(101, expect.objectContaining({ id: 2 }));

    const invalidPmEdit = await fetch(`${baseUrl}/api/v1/invoices/101/payment-method`, {
      method: 'PATCH',
      headers: cashierHeaders,
      body: JSON.stringify({ paymentMethod: 'TRANSFER', reason: 'ab' }),
    });
    expect(invalidPmEdit.status).toBe(422);

    const pmEditRes = await fetch(`${baseUrl}/api/v1/invoices/101/payment-method`, {
      method: 'PATCH',
      headers: cashierHeaders,
      body: JSON.stringify({
        paymentMethod: 'TRANSFER',
        cashAmount: 0,
        transferAmount: 185000,
        reason: 'Khách quét QR lúc sau',
      }),
    });
    expect(pmEditRes.status).toBe(200);
    expect(invoicesService.requestPaymentMethodEdit).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ paymentMethod: 'TRANSFER' }),
      expect.objectContaining({ id: 2 }),
    );

    const reviewRes = await fetch(`${baseUrl}/api/v1/invoices/101/payment-method/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ decision: 'APPROVE', reviewNote: 'Đã đối soát VCB' }),
    });
    expect(reviewRes.status).toBe(201);
    expect(invoicesService.reviewPaymentMethodEdit).toHaveBeenCalledWith(
      101,
      { decision: 'APPROVE', reviewNote: 'Đã đối soát VCB' },
      expect.objectContaining({ id: 1 }),
    );

    const voidRes = await fetch(`${baseUrl}/api/v1/invoices/101/void`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ voidReason: 'Khách phản ánh tính sai món' }),
    });
    expect(voidRes.status).toBe(201);
    expect(invoicesService.voidInvoice).toHaveBeenCalledWith(
      101,
      { voidReason: 'Khách phản ánh tính sai món' },
      1,
    );
  });
});
