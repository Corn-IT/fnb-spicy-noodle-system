import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InvoicesController } from '../invoices.controller';
import { InvoicesService } from '../invoices.service';
import { PosController } from '../pos.controller';
import { PosService } from '../pos.service';

describe('POS and invoice HTTP routes', () => {
  const posService = {
    getTableGrid: vi.fn(async () => ({ tables: [], takeaways: [] })),
    createQrOrder: vi.fn(async () => ({ orderId: 42, activeOrderId: 42, orderCode: 'HD-20261108-0001', currentTableLabel: 'Bàn 07', status: 'PENDING', batchNo: 1, totalAmount: 100 })),
    createOrder: vi.fn(async () => ({ orderId: 43 })),
    getOrder: vi.fn(async () => ({ orderId: 43 })),
    approveQrOrder: vi.fn(async () => ({ orderId: 42, status: 'SERVING' })),
    patchOrderItems: vi.fn(async () => ({ orderId: 43 })),
    getProvisionalBill: vi.fn(async () => ({ orderId: 43, status: 'SERVING' })),
    checkout: vi.fn(async () => ({ orderId: 43, status: 'PAID' })),
    splitKitchen: vi.fn(async () => ({ tickets: [] })),
    tableAction: vi.fn(async () => ({ action: 'MOVE' })),
  };
  const invoicesService = {
    list: vi.fn(async () => ({ page: 1, limit: 20, total: 0, items: [] })),
    get: vi.fn(async () => ({ orderId: 43 })),
    voidInvoice: vi.fn(async () => ({ orderId: 43, status: 'VOIDED' })),
  };
  const adminRecord = {
    id: 1, employeeId: 1, username: 'superadmin', isSuperAdmin: true, isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };
  const cashierRecord = {
    id: 2, employeeId: 12, username: 'cashier01', isSuperAdmin: false, isActive: true,
    permissions: UserPermissionsSchema.parse({ invoices: { view: true, reprint: true, void: true } }),
  };
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class PosHttpTestModule {}
    Module({
      controllers: [PosController, InvoicesController],
      providers: [
        { provide: PosService, useValue: posService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: JwtService, useValue: { verifyAsync: async (token: string) => ({ sub: token === 'cashier-token' ? 2 : 1, tokenType: 'access' }) } },
        { provide: PrismaService, useValue: { user: { findUnique: async (args: { where: { id: number } }) => (
          args.where.id === cashierRecord.id ? cashierRecord : adminRecord
        ) } } },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(PosHttpTestModule);
    app = await NestFactory.create(PosHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => app?.close());

  it('should accept public QR orders without staff authentication', async () => {
    const response = await fetch(`${baseUrl}/api/v1/public/orders/qr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qrToken: 'a'.repeat(64), items: [{ productId: 11, quantity: 1 }] }),
    });

    expect(response.status).toBe(201);
    expect(posService.createQrOrder).toHaveBeenCalledWith({
      qrToken: 'a'.repeat(64), items: [{ productId: 11, quantity: 1, modifiers: [] }],
    });
  });

  it('should expose authenticated table and order endpoints with the acting cashier id', async () => {
    const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
    const grid = await fetch(`${baseUrl}/api/v1/pos/tables`, { headers });
    const checkout = await fetch(`${baseUrl}/api/v1/pos/orders/43/checkout`, {
      method: 'POST', headers, body: JSON.stringify({ paymentMethod: 'CASH' }),
    });

    expect(grid.status).toBe(200);
    expect(checkout.status).toBe(201);
    expect(posService.getTableGrid).toHaveBeenCalledOnce();
    expect(posService.checkout).toHaveBeenCalledWith(43, {
      paymentMethod: 'CASH', cashAmount: 0, transferAmount: 0, printReceipt: true,
    }, 1);
  });

  it('should expose permission-protected kitchen split and table transfer endpoints', async () => {
    const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
    const split = await fetch(`${baseUrl}/api/v1/pos/orders/43/split-kitchen`, { method: 'POST', headers });
    const transfer = await fetch(`${baseUrl}/api/v1/pos/orders/43/table-action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'MOVE', targetTableId: 7, reason: 'Khách đổi bàn' }),
    });

    expect(split.status).toBe(200);
    expect(transfer.status).toBe(201);
    expect(posService.splitKitchen).toHaveBeenCalledWith(43, 1);
    expect(posService.tableAction).toHaveBeenCalledWith(43, {
      action: 'MOVE', targetTableId: 7, reason: 'Khách đổi bàn',
    }, 1);
  });

  it('should expose invoice listing and superadmin void routes', async () => {
    const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
    const list = await fetch(`${baseUrl}/api/v1/invoices?page=1&limit=20`, { headers });
    const voidResponse = await fetch(`${baseUrl}/api/v1/invoices/43/void`, {
      method: 'POST', headers, body: JSON.stringify({ voidReason: 'Khách báo nhân viên tính sai' }),
    });

    expect(list.status).toBe(200);
    expect(voidResponse.status).toBe(201);
    expect(invoicesService.list).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(invoicesService.voidInvoice).toHaveBeenCalledWith(43, { voidReason: 'Khách báo nhân viên tính sai' }, 1);
  });

  it('should reject invoice voiding for an authenticated cashier even when invoices.void is true', async () => {
    invoicesService.voidInvoice.mockClear();
    const response = await fetch(`${baseUrl}/api/v1/invoices/43/void`, {
      method: 'POST',
      headers: { authorization: 'Bearer cashier-token', 'content-type': 'application/json' },
      body: JSON.stringify({ voidReason: 'Lý do huỷ hoá đơn hợp lệ' }),
    });

    expect(response.status).toBe(403);
    expect(invoicesService.voidInvoice).not.toHaveBeenCalled();
  });
});
