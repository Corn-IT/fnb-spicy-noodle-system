import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosSocketGateway } from '../../../gateways/pos-socket.gateway';
import { signTakeawayGuestSessionToken, setCachedTakeawayQrToken } from '../../../common/security/takeaway-qr.util';
import {
  generateShortQrToken,
  generateUniqueTableQrToken,
} from '../../../common/utils/qr-token.util';
import { MenuService } from '../../menu/menu.service';
import { KitchenSplitService } from '../kitchen-split.service';
import { PosService } from '../pos.service';
import { TableTransferService } from '../table-transfer.service';

const TAKEAWAY_TOKEN = 'c'.repeat(64);
const TABLE_TOKEN = 'd'.repeat(64);

function createPosTakeawayHarness() {
  const lockedTables: string[] = [];
  let takeawayQrToken = TAKEAWAY_TOKEN;
  let takeawaySequence = 0;

  const product = {
    id: 11,
    name: 'Mì bò cay',
    price: new Prisma.Decimal('49000.00'),
    station: 'BEP_NAU',
    isAvailable: true,
    modifierGroups: [],
  };

  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.raw.join('');
      lockedTables.push(sql);
      if (sql.includes('INSERT INTO takeaway_sequences')) return [{ takeawayNumber: ++takeawaySequence }];
      return [];
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      lockedTables.push(strings.raw.join(''));
      return 1;
    }),
    masterData: {
      findUnique: vi.fn(async () => ({ isActive: true, metadata: { qrToken: takeawayQrToken } })),
      upsert: vi.fn(async (args: { update?: { metadata?: { qrToken?: string } } }) => {
        if (args.update?.metadata?.qrToken) {
          takeawayQrToken = args.update.metadata.qrToken;
        }
        return { metadata: { qrToken: takeawayQrToken } };
      }),
    },
    diningTable: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([
        { id: 1, name: 'Bàn 01', qrToken: TABLE_TOKEN, status: 'AVAILABLE', activeOrderId: null, activeOrder: null },
      ]),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { takeawayNumber: null } }),
      create: vi.fn(),
      update: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { batchNo: 1 } }),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    product: { findMany: vi.fn().mockResolvedValue([product]) },
    comboItem: { findMany: vi.fn().mockResolvedValue([]) },
    paymentAccount: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (op: (client: typeof tx) => Promise<unknown>) => op(tx)),
  };

  const gateway = {
    emitQrNewOrder: vi.fn(),
    emitQrAddonOrder: vi.fn(),
    emitOrderStatusUpdated: vi.fn(),
    emitOrderSessionRedirected: vi.fn(),
    emitTableGridSync: vi.fn(),
  };

  const config = {
    get: vi.fn((key: string) => key),
  };

  const auditLog = { record: vi.fn() };

  const service = new PosService(
    prisma as never,
    gateway as never,
    config as never,
    new KitchenSplitService(prisma as never, gateway as never),
    new TableTransferService(prisma as never, gateway as never),
    auditLog as never,
  );

  return { tx, prisma, gateway, auditLog, service };
}

describe('Takeaway QR End-to-End Backend Logic', () => {
  afterEach(() => {
    setCachedTakeawayQrToken(null);
  });

  it('should create independent TAKEAWAY orders with null tableId, incremented takeawayNumber, and guestSessionToken', async () => {
    const harness = createPosTakeawayHarness();
    harness.tx.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ orderCode: 'HD-20261122-0001' });

    harness.tx.order.create
      .mockResolvedValueOnce({
        id: 101,
        orderCode: 'HD-20261122-0001',
        orderType: 'TAKEAWAY',
        orderSource: 'QR_CODE',
        tableId: null,
        takeawayNumber: 1,
        status: 'PENDING',
        subtotalAmount: new Prisma.Decimal('49000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('49000.00'),
      })
      .mockResolvedValueOnce({
        id: 102,
        orderCode: 'HD-20261122-0002',
        orderType: 'TAKEAWAY',
        orderSource: 'QR_CODE',
        tableId: null,
        takeawayNumber: 2,
        status: 'PENDING',
        subtotalAmount: new Prisma.Decimal('98000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('98000.00'),
      });

    // Guest 1 scans Takeaway QR
    const res1 = await harness.service.createQrOrder({
      qrToken: TAKEAWAY_TOKEN,
      customerName: 'Chị Lan',
      customerPhone: '0901234567',
      note: 'Ít cay, không hành',
      items: [{ productId: 11, quantity: 1 }],
    });

    expect(res1).toMatchObject({
      orderId: 101,
      orderType: 'TAKEAWAY',
      takeawayNumber: 1,
      currentTableLabel: 'Mang về #01',
      status: 'PENDING',
      totalAmount: 49000,
    });
    expect(res1.guestSessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.tx.order.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          tableId: null,
          orderType: 'TAKEAWAY',
          orderSource: 'QR_CODE',
          takeawayNumber: 1,
          note: 'Khách: Chị Lan - 0901234567 | Ít cay, không hành',
        }),
      }),
    );

    // Guest 2 simultaneously scans the same Takeaway QR -> independent order #02
    const res2 = await harness.service.createQrOrder({
      qrToken: TAKEAWAY_TOKEN,
      items: [{ productId: 11, quantity: 2 }],
    });
    expect(res2).toMatchObject({
      orderId: 102,
      orderType: 'TAKEAWAY',
      takeawayNumber: 2,
      currentTableLabel: 'Mang về #02',
      status: 'PENDING',
    });
    expect(res2.guestSessionToken).not.toBe(res1.guestSessionToken);
    expect(harness.gateway.emitQrNewOrder).toHaveBeenCalledTimes(2);
    expect(harness.gateway.emitQrNewOrder).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tableId: null, tableLabel: 'Mang về #01', orderType: 'TAKEAWAY' }),
    );
  });

  it('should enforce HMAC guestSessionToken for Takeaway add-on orders and reject tampered tokens', async () => {
    const harness = createPosTakeawayHarness();
    const order = {
      id: 101,
      orderCode: 'HD-20261122-0001',
      orderType: 'TAKEAWAY',
      orderSource: 'QR_CODE',
      tableId: null,
      takeawayNumber: 1,
      status: 'SERVING',
      discountAmount: new Prisma.Decimal('0.00'),
    };
    harness.tx.order.findUnique.mockResolvedValue(order);
    harness.tx.orderItem.findMany.mockResolvedValue([
      {
        id: 1,
        productId: 11,
        quantity: 1,
        unitPrice: new Prisma.Decimal('49000.00'),
        batchNo: 1,
        kitchenStatus: 'PRINTED',
        itemSource: 'QR_CODE',
        createdAt: new Date(),
      },
      {
        id: 2,
        productId: 11,
        quantity: 1,
        unitPrice: new Prisma.Decimal('49000.00'),
        batchNo: 2,
        kitchenStatus: 'NEW',
        itemSource: 'QR_CODE',
        createdAt: new Date(),
      },
    ]);
    harness.tx.order.update.mockResolvedValue({ ...order, totalAmount: new Prisma.Decimal('98000.00') });

    // Missing/wrong token -> Forbidden
    await expect(
      harness.service.createQrOrder({
        qrToken: TAKEAWAY_TOKEN,
        activeOrderId: 101,
        guestSessionToken: '0'.repeat(64),
        items: [{ productId: 11, quantity: 1 }],
      }),
    ).rejects.toThrow(ForbiddenException);

    // Valid token -> Allowed
    const validToken = signTakeawayGuestSessionToken(101, 'HD-20261122-0001');
    const addonRes = await harness.service.createQrOrder({
      qrToken: TAKEAWAY_TOKEN,
      activeOrderId: 101,
      guestSessionToken: validToken,
      items: [{ productId: 11, quantity: 1 }],
    });

    expect(addonRes).toMatchObject({
      orderId: 101,
      orderType: 'TAKEAWAY',
      batchNo: 2,
      totalAmount: 98000,
    });
    expect(harness.gateway.emitQrAddonOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 101, tableId: null, tableLabel: 'Mang về #01', batchNo: 2 }),
    );
  });

  it('should include PENDING & SERVING takeaways and takeawayQrToken in getTableGrid and rotate takeaway QR cleanly', async () => {
    const harness = createPosTakeawayHarness();
    harness.tx.order.findMany.mockResolvedValue([
      {
        id: 201,
        orderCode: 'HD-20261122-0005',
        orderType: 'TAKEAWAY',
        orderSource: 'QR_CODE',
        tableId: null,
        takeawayNumber: 5,
        status: 'PENDING',
        subtotalAmount: new Prisma.Decimal('49000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('49000.00'),
        createdAt: new Date('2026-11-22T05:00:00.000Z'),
        items: [
          { batchNo: 1, kitchenStatus: 'NEW', itemSource: 'QR_CODE', createdAt: new Date('2026-11-22T05:00:00.000Z') },
        ],
      },
    ]);

    const grid = await harness.service.getTableGrid();
    expect(grid.takeawayQrToken).toBe(TAKEAWAY_TOKEN);
    expect(grid.takeaways).toHaveLength(1);
    expect(grid.takeaways[0]).toMatchObject({
      orderId: 201,
      status: 'PENDING',
      tableLabel: 'Mang về #05',
      pendingQrKind: 'NEW',
    });

    const rotated = await harness.service.rotateTakeawayQr(1);
    expect(rotated.qrToken).toMatch(/^mangve-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);
    expect(rotated.qrToken).not.toBe(TAKEAWAY_TOKEN);
    expect(harness.gateway.emitTableGridSync).toHaveBeenCalledWith({ takeawayQrRotated: true });
    expect(harness.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          changes: [{ field: 'Mã QR Mang về', from: 'cccccc...', to: 'mangve-****' }],
        },
      }),
    );
  });

  it('should resolve Takeaway public menu and restore activeOrder only when guestSessionToken matches', async () => {
    const order = {
      id: 301,
      orderCode: 'HD-20261122-0009',
      orderType: 'TAKEAWAY',
      orderSource: 'QR_CODE',
      tableId: null,
      takeawayNumber: 9,
      status: 'PENDING',
      note: 'Khách: Minh | Không hành',
      totalAmount: new Prisma.Decimal('49000.00'),
      createdAt: new Date('2026-11-22T05:10:00.000Z'),
      items: [
        {
          id: 1,
          productId: 11,
          product: { name: 'Mì bò cay' },
          quantity: 1,
          unitPrice: new Prisma.Decimal('49000.00'),
          batchNo: 1,
          kitchenStatus: 'NEW',
          itemNote: null,
          modifiersSnapshot: [],
          createdAt: new Date('2026-11-22T05:10:00.000Z'),
        },
      ],
    };
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue(null) },
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ isActive: true, metadata: { qrToken: TAKEAWAY_TOKEN } }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      order: { findUnique: vi.fn().mockResolvedValue(order) },
    };
    const menuService = new MenuService(prisma as never);

    // Without guestSessionToken -> no activeOrder leaked (IDOR protection)
    const noTokenRes = await menuService.getPublicMenu(TAKEAWAY_TOKEN, { activeOrderId: 301 });
    expect(noTokenRes.orderMode).toBe('TAKEAWAY');
    expect(noTokenRes.table.tableId).toBeNull();
    expect(noTokenRes.table.tableName).toBe('Mang về');
    expect(noTokenRes.activeOrder).toBeNull();

    // With valid guestSessionToken -> restores activeOrder with Mang về #09 label & note
    const validGuestToken = signTakeawayGuestSessionToken(301, 'HD-20261122-0009');
    const withTokenRes = await menuService.getPublicMenu(TAKEAWAY_TOKEN, {
      activeOrderId: 301,
      guestSessionToken: validGuestToken,
    });
    expect(withTokenRes.table.tableName).toBe('Mang về #09');
    expect(withTokenRes.activeOrder).toMatchObject({
      orderId: 301,
      orderCode: 'HD-20261122-0009',
      status: 'PENDING',
      note: 'Khách: Minh | Không hành',
    });
  });

  it('should authenticate Takeaway QR socket clients only with valid guestSessionToken for TAKEAWAY QR_CODE orders', async () => {
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue(null) },
      masterData: {
        findUnique: vi.fn().mockResolvedValue({ isActive: true, metadata: { qrToken: TAKEAWAY_TOKEN } }),
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 401,
          orderCode: 'HD-20261122-0010',
          tableId: null,
          orderType: 'TAKEAWAY',
          orderSource: 'QR_CODE',
          status: 'PENDING',
        }),
      },
    };
    const gateway = new PosSocketGateway(
      { verifyAsync: vi.fn() } as never,
      prisma as never,
    );
    const validToken = signTakeawayGuestSessionToken(401, 'HD-20261122-0010');

    const okSocket = {
      handshake: {
        auth: { qrToken: TAKEAWAY_TOKEN, orderId: 401, guestSessionToken: validToken },
        query: {},
      },
      data: {},
      join: vi.fn(),
      disconnect: vi.fn(),
    };
    await expect(
      (gateway as unknown as { authenticate: (s: unknown) => Promise<void> }).authenticate(okSocket),
    ).resolves.toBeUndefined();
    expect(okSocket.data).toMatchObject({ authMode: 'guest', orderId: 401 });

    // Missing or wrong guestSessionToken for existing takeaway orderId must be rejected
    const badSocket = {
      handshake: {
        auth: { qrToken: TAKEAWAY_TOKEN, orderId: 401, guestSessionToken: '0'.repeat(64) },
        query: {},
      },
      data: {},
    };
    await expect(
      (gateway as unknown as { authenticate: (s: unknown) => Promise<void> }).authenticate(badSocket),
    ).rejects.toThrow(/Order does not belong/);
  });

  it('generates short readable table & takeaway QR tokens and converts legacy 64-char tokens in bulk', async () => {
    const generated = generateShortQrToken('Bàn 05');
    expect(generated).toMatch(/^ban05-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);

    let checks = 0;
    const uniqueToken = await generateUniqueTableQrToken(
      {
        diningTable: {
          findUnique: vi.fn(async () => {
            checks += 1;
            return checks === 1 ? { id: 99 } : null;
          }),
        },
      },
      'Bàn VIP 02',
    );
    expect(uniqueToken).toMatch(/^banvip02-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);
    expect(checks).toBe(2);

    const updatedTableTokens: Array<{ id: number; qrToken: string }> = [];
    let currentTakeawayToken = 'f'.repeat(64);
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      diningTable: {
        findMany: vi.fn().mockResolvedValue([
          { id: 1, name: 'Bàn 01', qrToken: 'a'.repeat(64) },
          { id: 2, name: 'Bàn 02', qrToken: 'ban02-k7m9' },
        ]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(async ({ where, data }: { where: { id: number }; data: { qrToken: string } }) => {
          updatedTableTokens.push({ id: where.id, qrToken: data.qrToken });
          return { id: where.id, qrToken: data.qrToken };
        }),
      },
      masterData: {
        findUnique: vi.fn(async () => ({ isActive: true, metadata: { qrToken: currentTakeawayToken } })),
        upsert: vi.fn(async (args: { update?: { metadata?: { qrToken?: string } } }) => {
          currentTakeawayToken = args.update?.metadata?.qrToken ?? currentTakeawayToken;
          return { metadata: { qrToken: currentTakeawayToken } };
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };
    const gateway = { emitTableGridSync: vi.fn() };
    const auditLogService = { record: vi.fn() };

    const service = new PosService(
      prisma as never,
      gateway as never,
      undefined as never,
      {} as KitchenSplitService,
      {} as TableTransferService,
      auditLogService as never,
    );

    const summary = await service.shortenLegacyQrTokens(1);
    expect(summary).toEqual({ updatedTables: 1, updatedTakeaway: true });
    expect(updatedTableTokens).toHaveLength(1);
    expect(updatedTableTokens[0]!.id).toBe(1);
    expect(updatedTableTokens[0]!.qrToken).toMatch(/^ban01-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);
    expect(currentTakeawayToken).toMatch(/^mangve-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);
    expect(gateway.emitTableGridSync).toHaveBeenCalledWith({ shortenedLegacyQrTokens: true });

    // Case-insensitive guest menu lookup supports mixed-case manual entry
    const menuService = new MenuService(
      {
        diningTable: {
          findUnique: vi.fn(async ({ where }: { where: { qrToken: string } }) =>
            where.qrToken === 'ban01-k7m9'
              ? { id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null }
              : null,
          ),
        },
        masterData: { findMany: vi.fn().mockResolvedValue([]) },
        product: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
    );
    const guestRes = await menuService.getPublicMenu('Ban01-K7M9');
    expect(guestRes.table.tableName).toBe('Bàn 01');
  });

  it('snapshots LETTER takeawayLabelFormat on QR takeaway creation and leaves old orders intact when setting switches to NUMBER', async () => {
    const harness = createPosTakeawayHarness();
    let formatSetting: 'NUMBER' | 'LETTER' = 'LETTER';
    harness.tx.masterData.findUnique = vi.fn(async ({ where }: { where?: { category_normalizedName?: { category?: string; normalizedName?: string } } }) => {
      if (where?.category_normalizedName?.category === 'SYSTEM_CONFIG' && where.category_normalizedName.normalizedName === 'store_settings') {
        return { isActive: true, metadata: { takeawayLabelFormat: formatSetting } };
      }
      return { isActive: true, metadata: { qrToken: TAKEAWAY_TOKEN } };
    }) as never;

    let seq = 0;
    harness.tx.$queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.raw.join('');
      if (sql.includes('INSERT INTO takeaway_sequences')) return [{ takeawayNumber: ++seq }];
      return [];
    }) as never;
    harness.tx.order.create = vi.fn(async ({ data }: { data: { takeawayNumber: number; takeawayLabelFormat: string | null } }) => ({
      id: 900 + data.takeawayNumber,
      orderCode: `HD-20261127-0${data.takeawayNumber}`,
      orderType: 'TAKEAWAY',
      orderSource: 'QR_CODE',
      tableId: null,
      takeawayNumber: data.takeawayNumber,
      takeawayLabelFormat: data.takeawayLabelFormat,
      status: 'PENDING',
      totalAmount: new Prisma.Decimal('49000.00'),
    })) as never;

    // Issue 5 sequential QR orders (#A, #B, #C, #D, #AA)
    const results: Array<{ currentTableLabel: string; takeawayLabelFormat?: string | null }> = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(
        await harness.service.createQrOrder({
          qrToken: TAKEAWAY_TOKEN,
          items: [{ productId: 11, quantity: 1 }],
        }),
      );
    }
    expect(results.map((r) => r.currentTableLabel)).toEqual([
      'Mang về #A',
      'Mang về #B',
      'Mang về #C',
      'Mang về #D',
      'Mang về #AA',
    ]);
    expect(results.every((r) => r.takeawayLabelFormat === 'LETTER')).toBe(true);

    // Mid-day toggle back to NUMBER -> next QR order #6 uses #06
    formatSetting = 'NUMBER';
    const sixth = await harness.service.createQrOrder({
      qrToken: TAKEAWAY_TOKEN,
      items: [{ productId: 11, quantity: 1 }],
    });
    expect(sixth.currentTableLabel).toBe('Mang về #06');
    expect(sixth.takeawayLabelFormat).toBe('NUMBER');
  });
});
