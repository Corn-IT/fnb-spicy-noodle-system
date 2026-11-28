import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QrSecurityService } from '../../../common/security/qr-security.service';
import { PosSocketGateway } from '../../../gateways/pos-socket.gateway';
import { InvoicesController } from '../invoices.controller';
import { InvoicesService } from '../invoices.service';
import { PosController } from '../pos.controller';
import { PosService } from '../pos.service';

describe('POS and invoice HTTP routes', () => {
  const posService = {
    deletePosDraft: vi.fn(async () => ({ id: 'draft-1', deleted: true })),
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
  const qrSecurityService = {
    updateConfig: vi.fn(async () => ({ wifiProtectionEnabled: true })),
    verifyGuestQrAccess: vi.fn(async () => undefined),
    recordPosClientIp: vi.fn(),
  };
  const gateway = {
    emitStoreSettingsUpdated: vi.fn(),
  };
  const adminRecord = {
    id: 1, employeeId: 1, username: 'superadmin', isSuperAdmin: true, isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };
  const cashierRecord = {
    id: 2, employeeId: 12, username: 'cashier01', isSuperAdmin: false, isActive: true,
    permissions: UserPermissionsSchema.parse({ invoices: { view: true, reprint: true, void: false } }),
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
        { provide: QrSecurityService, useValue: qrSecurityService },
        { provide: PosSocketGateway, useValue: gateway },
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

  it('allows draft deletion independently from confirmed-order deletion and forwards the revision', async () => {
    const previous = cashierRecord.permissions;
    cashierRecord.permissions = UserPermissionsSchema.parse({ pos: { deleteDrafts: true, delete: false } });
    try {
      const response = await fetch(`${baseUrl}/api/v1/pos/drafts/draft-1?revision=2`, {
        method: 'DELETE', headers: { authorization: 'Bearer cashier-token' },
      });
      expect(response.status).toBe(200);
      expect(posService.deletePosDraft).toHaveBeenCalledWith('draft-1', 2, 2);
      expect((await fetch(`${baseUrl}/api/v1/pos/orders/43/cancel`, {
        method: 'POST', headers: { authorization: 'Bearer cashier-token' },
      })).status).toBe(403);
    } finally { cashierRecord.permissions = previous; }
  });

  it('denies draft deletion without the dedicated permission even for staff who can create and delete orders', async () => {
    const previous = cashierRecord.permissions;
    cashierRecord.permissions = UserPermissionsSchema.parse({ pos: { create: true, update: true, delete: true } });
    try {
      expect((await fetch(`${baseUrl}/api/v1/pos/drafts/draft-1?revision=2`, {
        method: 'DELETE', headers: { authorization: 'Bearer cashier-token' },
      })).status).toBe(403);
    } finally { cashierRecord.permissions = previous; }
  });

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

  it('should reject invoice voiding for an authenticated cashier without invoices.void permission', async () => {
    invoicesService.voidInvoice.mockClear();
    const response = await fetch(`${baseUrl}/api/v1/invoices/43/void`, {
      method: 'POST',
      headers: { authorization: 'Bearer cashier-token', 'content-type': 'application/json' },
      body: JSON.stringify({ voidReason: 'Lý do huỷ hoá đơn hợp lệ' }),
    });

    expect(response.status).toBe(403);
    expect(invoicesService.voidInvoice).not.toHaveBeenCalled();
  });

  it('emits store:settings_updated when QR security config is updated so active guests lock/unlock realtime', async () => {
    gateway.emitStoreSettingsUpdated.mockClear();
    const res = await fetch(`${baseUrl}/api/v1/pos/qr-security-config`, {
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ wifiProtectionEnabled: true }),
    });
    expect(res.status).toBe(200);
    expect(qrSecurityService.updateConfig).toHaveBeenCalledTimes(1);
    expect(gateway.emitStoreSettingsUpdated).toHaveBeenCalledTimes(1);
  });

  it('delegates POS drafts, table CRUD, QR rotation/shorten, kitchen reprint, provisional split & discounts', async () => {
    const extPosService = {
      ...posService,
      listPosDrafts: vi.fn(async () => ({ drafts: [] })),
      createPosDraft: vi.fn(async () => ({ id: 'draft-new', revision: 1 })),
      updatePosDraft: vi.fn(async () => ({ id: 'draft-new', revision: 2 })),
      submitPosDraft: vi.fn(async () => ({ orderId: 77 })),
      createTable: vi.fn(async () => ({ id: 9, name: 'Bàn 09' })),
      updateTable: vi.fn(async () => ({ id: 9, name: 'Bàn 09 VIP' })),
      deleteTable: vi.fn(async () => ({ deleted: true })),
      rotateTableQr: vi.fn(async () => ({ id: 9, qrToken: 'new-qr' })),
      rotateTakeawayQr: vi.fn(async () => ({ qrToken: 'new-takeaway-qr' })),
      shortenLegacyQrTokens: vi.fn(async () => ({ updatedCount: 3 })),
      cancelOrder: vi.fn(async () => ({ orderId: 43, status: 'VOIDED' })),
      getSplitProvisionalBill: vi.fn(async () => ({ orderId: 43 })),
      splitCheckout: vi.fn(async () => ({ paidAmount: 50000 })),
      reprintKitchen: vi.fn(async () => ({ tickets: [] })),
      getApplicableDiscounts: vi.fn(async () => ({ items: [] })),
      applyDiscount: vi.fn(async () => ({ orderId: 43 })),
      removeDiscount: vi.fn(async () => ({ orderId: 43 })),
      checkQrOrderStillPending: vi.fn(async () => ({ stillPending: true })),
    };

    class FullPosControllerModule {}
    Module({
      controllers: [PosController],
      providers: [
        { provide: PosService, useValue: extPosService },
        { provide: QrSecurityService, useValue: qrSecurityService },
        { provide: PosSocketGateway, useValue: gateway },
        { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 1, tokenType: 'access' }) } },
        { provide: PrismaService, useValue: { user: { findUnique: async () => adminRecord } } },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(FullPosControllerModule);

    const extApp = await NestFactory.create(FullPosControllerModule, { logger: ['error'], abortOnError: false });
    await extApp.listen(0, '127.0.0.1');
    const addr = extApp.getHttpServer().address() as { port: number };
    const extBase = `http://127.0.0.1:${addr.port}`;
    const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };

    try {
      expect((await fetch(`${extBase}/api/v1/public/orders/qr-pending-check?orderId=42&kind=ADDON&batchNo=2`)).status).toBe(200);
      expect(extPosService.checkQrOrderStillPending).toHaveBeenCalledWith({ orderId: 42, kind: 'ADDON', batchNo: 2 });

      expect((await fetch(`${extBase}/api/v1/pos/drafts`, { headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/drafts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 1, quantity: 1 }], note: null }),
      })).status).toBe(201);
      expect((await fetch(`${extBase}/api/v1/pos/drafts/draft-new`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ orderType: 'TAKEAWAY', tableId: null, items: [{ productId: 1, quantity: 2 }], note: null, expectedRevision: 1 }),
      })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/drafts/draft-new/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedRevision: 2, idempotencyKey: 'idem-key-1234567890' }),
      })).status).toBe(201);

      expect((await fetch(`${extBase}/api/v1/pos/tables`, { method: 'POST', headers, body: JSON.stringify({ name: 'Bàn 09' }) })).status).toBe(201);
      expect((await fetch(`${extBase}/api/v1/pos/tables/9`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Bàn 09 VIP' }) })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/tables/9`, { method: 'DELETE', headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/tables/9/rotate-qr`, { method: 'POST', headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/takeaway-qr/rotate`, { method: 'POST', headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/tables/shorten-qr`, { method: 'POST', headers })).status).toBe(200);

      expect((await fetch(`${extBase}/api/v1/pos/orders/43`, { headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/provisional-bill`, { method: 'POST', headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/split-provisional-bill`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: [{ orderItemId: 1, quantity: 1 }] }),
      })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/split-checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: [{ orderItemId: 1, quantity: 1 }], paymentMethod: 'CASH' }),
      })).status).toBe(201);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/reprint-kitchen`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchNo: 1 }),
      })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/applicable-discounts`, { headers })).status).toBe(200);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/discount`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: 'GIAM10' }),
      })).status).toBe(201);
      expect((await fetch(`${extBase}/api/v1/pos/orders/43/discount`, { method: 'DELETE', headers })).status).toBe(200);

      // TTS blank text -> 400; mocked upstream -> audio/mpeg cache hit
      expect((await fetch(`${extBase}/api/v1/public/tts?text=%20%20`)).status).toBe(400);
      const originalFetch = globalThis.fetch;
      const upstreamFetchSpy = vi.fn(async () =>
        new Response(Uint8Array.from([0x49, 0x44, 0x33]), { status: 200 }),
      );
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('https://translate.googleapis.com')) {
          return upstreamFetchSpy();
        }
        return originalFetch(input, init);
      });
      try {
        const tts1 = await originalFetch(`${extBase}/api/v1/public/tts?text=Ban%2005%20co%20don%20moi`);
        expect(tts1.status).toBe(200);
        expect(tts1.headers.get('content-type')).toContain('audio/mpeg');
        const tts2 = await originalFetch(`${extBase}/api/v1/public/tts?text=Ban%2005%20co%20don%20moi`);
        expect(tts2.status).toBe(200);
        expect(upstreamFetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      await extApp.close();
    }
  });
});
