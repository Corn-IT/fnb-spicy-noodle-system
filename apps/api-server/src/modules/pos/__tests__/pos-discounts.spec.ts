import { ConflictException, ForbiddenException, Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { ErrorCodes, UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DiscountsService } from '../../discounts/discounts.service';
import { InvoicesService } from '../invoices.service';
import { KitchenSplitService } from '../kitchen-split.service';
import { PosController } from '../pos.controller';
import { PosService } from '../pos.service';
import { TableTransferService } from '../table-transfer.service';

interface MockOrderRow {
  id: number;
  orderCode: string;
  orderType: string;
  orderSource: string;
  tableId: number | null;
  takeawayNumber: number | null;
  status: string;
  paymentMethod: string | null;
  paymentAccountId: number | null;
  cashAmount: Prisma.Decimal;
  transferAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountId: number | null;
  discountSnapshot: unknown;
  totalAmount: Prisma.Decimal;
  note: string | null;
  voidReason: string | null;
  tableTransferLogs: unknown[];
  cashierId: number | null;
  createdAt: Date;
  paidAt: Date | null;
  table?: { id: number; name: string } | null;
}

function makeOrderRow(overrides: Partial<MockOrderRow> = {}): MockOrderRow {
  return {
    id: 42,
    orderCode: 'HD-20261115-0001',
    orderType: 'DINE_IN',
    orderSource: 'POS_COUNTER',
    tableId: 1,
    takeawayNumber: null,
    status: 'SERVING',
    paymentMethod: null,
    paymentAccountId: null,
    cashAmount: new Prisma.Decimal(0),
    transferAmount: new Prisma.Decimal(0),
    subtotalAmount: new Prisma.Decimal(200000),
    discountAmount: new Prisma.Decimal(0),
    discountId: null,
    discountSnapshot: null,
    totalAmount: new Prisma.Decimal(200000),
    note: null,
    voidReason: null,
    tableTransferLogs: [],
    cashierId: 2,
    createdAt: new Date('2026-11-15T09:00:00.000Z'),
    paidAt: null,
    table: { id: 1, name: 'Bàn 01' },
    ...overrides,
  };
}

function createPosDiscountHarness(options: {
  initialOrder?: MockOrderRow;
  initialItems?: Array<{
    id: number;
    orderId: number;
    productId: number;
    categoryId: number | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    kitchenStatus: string;
  }>;
  discountRow?: {
    id: number;
    code: string;
    name: string;
    valueType: string;
    value: Prisma.Decimal;
    maxDiscountAmount: Prisma.Decimal | null;
    scope: string;
    minOrderAmount: Prisma.Decimal | null;
    startsAt: Date | null;
    endsAt: Date | null;
    activeWeekdays: number[];
    timeWindowStart: string | null;
    timeWindowEnd: string | null;
    usageLimit: number | null;
    usedCount: number;
    isActive: boolean;
    isArchived: boolean;
    targets: Array<{ id: number; discountId: number; categoryId: number | null; productId: number | null }>;
  } | null;
  executeRawReturn?: number;
} = {}) {
  const lockCalls: string[] = [];
  const executeSqlCalls: string[] = [];
  let orderState = options.initialOrder ?? makeOrderRow();
  let itemsState = (options.initialItems ?? [
    {
      id: 1,
      orderId: orderState.id,
      productId: 11,
      categoryId: 100,
      productName: 'Mì Cay Bò',
      quantity: 2,
      unitPrice: 100000,
      kitchenStatus: 'PRINTED',
    },
  ]).map((item) => ({
    ...item,
    unitPrice: new Prisma.Decimal(item.unitPrice),
    modifiersSnapshot: [],
    itemNote: null,
    batchNo: 1,
    createdAt: new Date('2026-11-15T09:00:00.000Z'),
    product: {
      id: item.productId,
      name: item.productName,
      categoryId: item.categoryId,
      station: 'BEP_NAU',
    },
  }));

  const discountState = options.discountRow ?? null;

  const tx: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      lockCalls.push(strings.raw.join(''));
      return [];
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      executeSqlCalls.push(strings.raw.join(''));
      return options.executeRawReturn ?? 1;
    }),
    order: {
      findUnique: vi.fn(async () => ({
        ...orderState,
        items: itemsState,
        table: orderState.table,
      })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        orderState = {
          ...orderState,
          ...(args.data as Partial<MockOrderRow>),
          discountSnapshot:
            args.data.discountSnapshot === Prisma.JsonNull
              ? null
              : args.data.discountSnapshot !== undefined
                ? args.data.discountSnapshot
                : orderState.discountSnapshot,
        };
        return orderState;
      }),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    orderItem: {
      findMany: vi.fn(async () => itemsState),
      createMany: vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
        for (const row of args.data) {
          const nextId = itemsState.length + 1;
          itemsState.push({
            id: nextId,
            orderId: orderState.id,
            productId: Number(row.productId),
            categoryId: 100,
            productName: 'Mì Thêm',
            quantity: Number(row.quantity),
            unitPrice: row.unitPrice as Prisma.Decimal,
            modifiersSnapshot: [],
            itemNote: null,
            batchNo: 2,
            kitchenStatus: 'NEW',
            createdAt: new Date(),
            product: { id: Number(row.productId), name: 'Mì Thêm', categoryId: 100, station: 'BEP_NAU' },
          });
        }
      }),
      update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
        itemsState = itemsState.map((it) =>
          it.id === args.where.id
            ? {
                ...it,
                ...(args.data as Partial<typeof it>),
                kitchenStatus: String(args.data.kitchenStatus ?? it.kitchenStatus),
              }
            : it,
        );
      }),
      delete: vi.fn(async (args: { where: { id: number } }) => {
        itemsState = itemsState.filter((it) => it.id !== args.where.id);
      }),
      aggregate: vi.fn(async () => ({ _max: { batchNo: 1 } })),
    },
    diningTable: {
      findUnique: vi.fn(async () => ({ id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: orderState.id })),
      update: vi.fn(async () => ({})),
    },
    product: {
      findMany: vi.fn(async () => [
        { id: 11, name: 'Mì Cay Bò', categoryId: 100, price: new Prisma.Decimal(100000), station: 'BEP_NAU', isAvailable: true, modifierGroups: [] },
      ]),
    },
    paymentAccount: {
      findMany: vi.fn(async () => [
        {
          id: 1,
          label: 'TK Chính',
          bankCode: 'VPB',
          accountNo: '186877721',
          accountName: 'THAN THI LOAN',
          priority: 1,
          isActive: true,
          dailyLimit: null,
          monthlyLimit: null,
          yearlyLimit: null,
        },
      ]),
    },
    discount: {
      findUnique: vi.fn(async () => discountState),
      findMany: vi.fn(async () => (discountState ? [discountState] : [])),
    },
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const gateway = {
    emitQrNewOrder: vi.fn(),
    emitQrAddonOrder: vi.fn(),
    emitOrderStatusUpdated: vi.fn(),
    emitOrderSessionRedirected: vi.fn(),
    emitTableGridSync: vi.fn(),
  };
  const config = { get: vi.fn(() => undefined) };
  const kitchenSplitService = new KitchenSplitService();
  const tableTransferService = new TableTransferService(prisma as never, gateway as never);
  const paymentQrService = {
    selectForAmount: vi.fn(async () => ({
      account: { id: 1, label: 'TK', bankCode: 'VPB', accountNo: '186877721', accountName: 'THAN THI LOAN' },
      brief: { id: 1, label: 'TK', bankCode: 'VPB', bankName: 'VPBank', accountNo: '186877721', accountName: 'THAN THI LOAN' },
      rotated: false,
      overLimit: false,
    })),
    buildVietQrUrl: vi.fn((_acc: unknown, amount: Prisma.Decimal | number, orderCode: string) =>
      `https://img.vietqr.io/image/VPB-186877721-compact2.png?amount=${Math.round(Number(amount))}&addInfo=${orderCode}`),
  };
  const auditLogService = { record: vi.fn(async () => {}) };
  const discountsService = new DiscountsService(prisma as never, auditLogService as never);
  const posService = new PosService(
    prisma as never,
    gateway as never,
    config as never,
    kitchenSplitService,
    tableTransferService,
    auditLogService as never,
    paymentQrService as never,
    discountsService,
  );

  return {
    posService,
    tableTransferService,
    auditLogService,
    gateway,
    lockCalls,
    executeSqlCalls,
    getOrderState: () => orderState,
    setOrderState: (next: MockOrderRow) => {
      orderState = next;
    },
    tx,
    prisma,
  };
}

describe('POS & Invoice Discount Integration (Story 18)', () => {
  const cashierNoManual: AuthPrincipal = {
    id: 2,
    employeeId: 2,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({
      pos: { view: true, create: true, update: true, checkout: true, manualDiscount: false },
    }),
  };

  const managerWithManual: AuthPrincipal = {
    id: 3,
    employeeId: 3,
    username: 'manager01',
    isSuperAdmin: false,
    permissions: UserPermissionsSchema.parse({
      pos: { view: true, create: true, update: true, checkout: true, manualDiscount: true },
    }),
  };

  it('applies discount code, rounds & caps discount, syncs VietQR provisional bill, and removes discount cleanly', async () => {
    const harness = createPosDiscountHarness({
      discountRow: {
        id: 1,
        code: 'GIAM10',
        name: 'Giảm 10% tối đa 15k',
        valueType: 'PERCENT',
        value: new Prisma.Decimal(10),
        maxDiscountAmount: new Prisma.Decimal(15000),
        scope: 'ORDER',
        minOrderAmount: new Prisma.Decimal(100000),
        startsAt: null,
        endsAt: null,
        activeWeekdays: [],
        timeWindowStart: null,
        timeWindowEnd: null,
        usageLimit: 10,
        usedCount: 2,
        isActive: true,
        isArchived: false,
        targets: [],
      },
    });

    const applied = await harness.posService.applyDiscount(42, { code: 'giam10' }, cashierNoManual);
    expect(applied.subtotalAmount).toBe(200000);
    expect(applied.discountAmount).toBe(15000);
    expect(applied.totalAmount).toBe(185000);
    expect(applied.discountSnapshot?.code).toBe('GIAM10');
    expect(harness.gateway.emitTableGridSync).toHaveBeenCalled();

    const bill = await harness.posService.getProvisionalBill(42, cashierNoManual.id);
    expect(bill.subtotalAmount).toBe(200000);
    expect(bill.discountAmount).toBe(15000);
    expect(bill.totalAmount).toBe(185000);
    expect(bill.vietQrPayload).toContain('amount=185000');

    const removed = await harness.posService.removeDiscount(42, cashierNoManual.id);
    expect(removed.discountAmount).toBe(0);
    expect(removed.totalAmount).toBe(200000);
    expect(removed.discountSnapshot).toBeNull();
  });

  it('enforces pos.manualDiscount strictly (403 without permission even when pos.checkout=true)', async () => {
    const harness = createPosDiscountHarness();

    await expect(
      harness.posService.applyDiscount(
        42,
        { manual: { valueType: 'FIXED', value: 20000, reason: 'Khách quen' } },
        cashierNoManual,
      ),
    ).rejects.toThrow(ForbiddenException);

    const appliedManual = await harness.posService.applyDiscount(
      42,
      { manual: { valueType: 'FIXED', value: 20000, reason: 'Khách VIP' } },
      managerWithManual,
    );
    expect(appliedManual.discountAmount).toBe(20000);
    expect(appliedManual.totalAmount).toBe(180000);
    expect(appliedManual.discountId).toBeNull();
    expect(harness.auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'POS', action: 'Áp giảm giá tay' }),
    );
  });

  it('recomputes order totals when items are cancelled below minOrderAmount (A1 warning, no usage increment on checkout)', async () => {
    const snapshot = {
      kind: 'CODE',
      discountId: 1,
      code: 'MIN150',
      name: 'Đơn từ 150k',
      valueType: 'FIXED',
      value: 20000,
      maxDiscountAmount: null,
      scope: 'ORDER',
      targetCategoryIds: [],
      targetProductIds: [],
      minOrderAmount: 150000,
      appliedAt: '2026-11-15T09:00:00.000Z',
      appliedBy: 2,
      reason: null,
    };
    const harness = createPosDiscountHarness({
      initialOrder: makeOrderRow({
        subtotalAmount: new Prisma.Decimal(200000),
        discountAmount: new Prisma.Decimal(20000),
        discountId: 1,
        discountSnapshot: snapshot,
        totalAmount: new Prisma.Decimal(180000),
      }),
      initialItems: [
        { id: 1, orderId: 42, productId: 11, categoryId: 100, productName: 'Mì A', quantity: 1, unitPrice: 100000, kitchenStatus: 'PRINTED' },
        { id: 2, orderId: 42, productId: 11, categoryId: 100, productName: 'Mì B', quantity: 1, unitPrice: 100000, kitchenStatus: 'PRINTED' },
      ],
    });

    const patched = await harness.posService.patchOrderItems(42, { removeItemIds: [2] }, cashierNoManual.id);
    expect(patched.subtotalAmount).toBe(100000);
    expect(patched.discountAmount).toBe(0);
    expect(patched.totalAmount).toBe(100000);
    expect(patched.discountWarning).toBe('MIN_ORDER_NOT_MET');

    await harness.posService.checkout(42, { paymentMethod: 'CASH', cashAmount: 100000, transferAmount: 0, printReceipt: false }, cashierNoManual.id);
    expect(harness.executeSqlCalls.some((sql) => sql.includes('UPDATE discounts'))).toBe(false);
  });

  it('blocks split-checkout and split-provisional-bill with 409 POS_DISCOUNT_BLOCKS_SPLIT when discounted', async () => {
    const harness = createPosDiscountHarness({
      initialOrder: makeOrderRow({
        discountAmount: new Prisma.Decimal(20000),
        discountSnapshot: {
          kind: 'MANUAL',
          discountId: null,
          code: null,
          name: 'Giảm tay 20k',
          valueType: 'FIXED',
          value: 20000,
          maxDiscountAmount: null,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: null,
          appliedAt: '2026-11-15T09:00:00.000Z',
          appliedBy: 3,
          reason: 'Khách VIP',
        },
        totalAmount: new Prisma.Decimal(180000),
      }),
    });

    const splitBillErr = await harness.posService
      .getSplitProvisionalBill(42, { items: [{ orderItemId: 1, quantity: 1 }] }, 2)
      .catch((e: unknown) => e as ConflictException);
    expect(splitBillErr).toBeInstanceOf(ConflictException);
    expect(splitBillErr.getResponse()).toMatchObject({ code: ErrorCodes.POS_DISCOUNT_BLOCKS_SPLIT });

    const splitPayErr = await harness.posService
      .splitCheckout(42, { items: [{ orderItemId: 1, quantity: 1 }], paymentMethod: 'CASH', cashAmount: 100000, transferAmount: 0, printReceipt: false }, 2)
      .catch((e: unknown) => e as ConflictException);
    expect(splitPayErr).toBeInstanceOf(ConflictException);
    expect(splitPayErr.getResponse()).toMatchObject({ code: ErrorCodes.POS_DISCOUNT_BLOCKS_SPLIT });
  });

  it('consumes discount usage atomically on checkout in lock order orders->tables->discounts and rejects 0-row race with 409 DISCOUNT_USAGE_EXHAUSTED', async () => {
    const snapshot = {
      kind: 'CODE',
      discountId: 7,
      code: 'LASTONE',
      name: 'Last slot',
      valueType: 'FIXED',
      value: 20000,
      maxDiscountAmount: null,
      scope: 'ORDER',
      targetCategoryIds: [],
      targetProductIds: [],
      minOrderAmount: null,
      appliedAt: '2026-11-15T09:00:00.000Z',
      appliedBy: 2,
      reason: null,
    };

    const okHarness = createPosDiscountHarness({
      initialOrder: makeOrderRow({
        subtotalAmount: new Prisma.Decimal(200000),
        discountAmount: new Prisma.Decimal(20000),
        discountId: 7,
        discountSnapshot: snapshot,
        totalAmount: new Prisma.Decimal(180000),
      }),
      executeRawReturn: 1,
    });

    await okHarness.posService.checkout(
      42,
      { paymentMethod: 'CASH', totalAmount: 180000, cashAmount: 180000, transferAmount: 0, printReceipt: false },
      2,
    );
    expect(okHarness.lockCalls[0]).toContain('FROM orders');
    expect(okHarness.lockCalls[1]).toContain('FROM dining_tables');
    expect(okHarness.lockCalls[2]).toContain('FROM discounts');
    expect(okHarness.executeSqlCalls.some((s) => s.includes('UPDATE discounts'))).toBe(true);

    const raceHarness = createPosDiscountHarness({
      initialOrder: makeOrderRow({
        subtotalAmount: new Prisma.Decimal(200000),
        discountAmount: new Prisma.Decimal(20000),
        discountId: 7,
        discountSnapshot: snapshot,
        totalAmount: new Prisma.Decimal(180000),
      }),
      executeRawReturn: 0,
    });

    const raceErr = await raceHarness.posService
      .checkout(
        42,
        { paymentMethod: 'CASH', totalAmount: 180000, cashAmount: 180000, transferAmount: 0, printReceipt: false },
        2,
      )
      .catch((e: unknown) => e as ConflictException);
    expect(raceErr).toBeInstanceOf(ConflictException);
    expect(raceErr.getResponse()).toMatchObject({ code: ErrorCodes.DISCOUNT_USAGE_EXHAUSTED });
  });

  it('voidInvoice locks orders->discounts and restores used_count when order used a discount code', async () => {
    const queries: string[] = [];
    const executes: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        queries.push(strings.raw.join(''));
        return [];
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
        executes.push(strings.raw.join(''));
        return 1;
      }),
      order: {
        findUnique: vi.fn(async () => ({
          id: 42,
          orderCode: 'HD-20261115-0001',
          orderType: 'TAKEAWAY',
          tableId: null,
          status: 'PAID',
          discountId: 7,
          discountAmount: new Prisma.Decimal(20000),
          totalAmount: new Prisma.Decimal(180000),
        })),
        update: vi.fn(async () => ({
          id: 42,
          orderCode: 'HD-20261115-0001',
          status: 'VOIDED',
          voidReason: 'Khách huỷ hoá đơn sai món',
        })),
      },
      diningTable: { updateMany: vi.fn() },
    };
    const prisma = { ...tx, $transaction: vi.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) };
    const invoicesService = new InvoicesService(prisma as never);

    await invoicesService.voidInvoice(42, { voidReason: 'Khách huỷ hoá đơn sai món' }, 1);
    expect(queries[0]).toContain('FROM orders');
    expect(queries[1]).toContain('FROM discounts');
    expect(executes[0]).toContain('GREATEST(used_count - 1, 0)');
  });

  it('exposes HTTP endpoints for applicable-discounts, apply, and remove discount with RBAC', async () => {
    const posServiceMock = {
      getApplicableDiscounts: vi.fn(async () => ({ subtotalAmount: 200000, currentDiscountSnapshot: null, items: [] })),
      applyDiscount: vi.fn(async () => ({ orderId: 42, discountAmount: 20000 })),
      removeDiscount: vi.fn(async () => ({ orderId: 42, discountAmount: 0 })),
    };

    class TestHttpModule {}
    Module({
      controllers: [PosController],
      providers: [
        { provide: PosService, useValue: posServiceMock },
        { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 2, tokenType: 'access' }) } },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async () => ({
                id: 2,
                employeeId: 2,
                username: 'cashier01',
                isSuperAdmin: false,
                isActive: true,
                permissions: cashierNoManual.permissions,
              }),
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
    })(TestHttpModule);

    const app: INestApplication = await NestFactory.create(TestHttpModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}`;
    try {
      const applicableRes = await fetch(`${url}/api/v1/pos/orders/42/applicable-discounts`, {
        headers: { authorization: 'Bearer ok' },
      });
      expect(applicableRes.status).toBe(200);

      const applyRes = await fetch(`${url}/api/v1/pos/orders/42/discount`, {
        method: 'POST',
        headers: { authorization: 'Bearer ok', 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'GIAM10' }),
      });
      expect(applyRes.status).toBe(201);

      const removeRes = await fetch(`${url}/api/v1/pos/orders/42/discount`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer ok' },
      });
      expect(removeRes.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('drops source order discount on MERGE and recomputes target order discount with target rule', async () => {
    const tables: Record<number, { id: number; name: string; status: string; activeOrderId: number | null }> = {
      1: { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 42 },
      7: { id: 7, name: 'Bàn 07', status: 'OCCUPIED', activeOrderId: 99 },
    };
    const orders: Record<number, Record<string, unknown>> = {
      42: makeOrderRow({
        id: 42,
        tableId: 1,
        subtotalAmount: new Prisma.Decimal(100000),
        discountAmount: new Prisma.Decimal(20000),
        discountId: 2,
        discountSnapshot: {
          kind: 'CODE',
          discountId: 2,
          code: 'SRC20K',
          name: 'Source 20k',
          valueType: 'FIXED',
          value: 20000,
          maxDiscountAmount: null,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: null,
          appliedAt: '2026-11-15T09:00:00.000Z',
          appliedBy: 2,
          reason: null,
        },
        totalAmount: new Prisma.Decimal(80000),
      }) as unknown as Record<string, unknown>,
      99: makeOrderRow({
        id: 99,
        orderCode: 'HD-20261115-0002',
        tableId: 7,
        subtotalAmount: new Prisma.Decimal(200000),
        discountAmount: new Prisma.Decimal(20000),
        discountId: 1,
        discountSnapshot: {
          kind: 'CODE',
          discountId: 1,
          code: 'TGT10',
          name: 'Target 10%',
          valueType: 'PERCENT',
          value: 10,
          maxDiscountAmount: 25000,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: null,
          appliedAt: '2026-11-15T09:00:00.000Z',
          appliedBy: 2,
          reason: null,
        },
        totalAmount: new Prisma.Decimal(180000),
      }) as unknown as Record<string, unknown>,
    };
    let mergedItems = [
      { id: 1, orderId: 42, productId: 11, quantity: 1, unitPrice: new Prisma.Decimal(100000), kitchenStatus: 'PRINTED', product: { categoryId: 100, station: 'BEP_NAU', comboParents: [] } },
      { id: 2, orderId: 99, productId: 12, quantity: 2, unitPrice: new Prisma.Decimal(100000), kitchenStatus: 'PRINTED', product: { categoryId: 100, station: 'BEP_NAU', comboParents: [] } },
    ];
    const tx = {
      $queryRaw: vi.fn(async () => []),
      order: {
        findUnique: vi.fn(async (args: { where: { id: number } }) => {
          const row = orders[args.where.id];
          if (!row) return null;
          return { ...row, items: mergedItems.filter((it) => it.orderId === args.where.id) };
        }),
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          orders[args.where.id] = { ...orders[args.where.id], ...args.data };
          return orders[args.where.id];
        }),
        delete: vi.fn(async () => ({})),
      },
      orderItem: {
        updateMany: vi.fn(async (args: { where: { orderId: number }; data: { orderId: number } }) => {
          mergedItems = mergedItems.map((it) => (it.orderId === args.where.orderId ? { ...it, orderId: args.data.orderId } : it));
        }),
        findMany: vi.fn(async (args: { where: { orderId: number } }) => mergedItems.filter((it) => it.orderId === args.where.orderId)),
      },
      diningTable: {
        findUnique: vi.fn(async (args: { where: { id: number } }) => tables[args.where.id] ?? null),
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          tables[args.where.id] = { ...tables[args.where.id], ...args.data } as typeof tables[number];
        }),
      },
    };
    const prisma = { ...tx, $transaction: vi.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) };
    const gateway = {
      emitQrNewOrder: vi.fn(),
      emitQrAddonOrder: vi.fn(),
      emitOrderStatusUpdated: vi.fn(),
      emitOrderSessionRedirected: vi.fn(),
      emitTableGridSync: vi.fn(),
    };
    const service = new TableTransferService(prisma as never, gateway as never);

    await service.executeTableAction(42, { action: 'MERGE', targetTableId: 7, reason: 'Gộp bàn giảm giá' }, 2);

    // Source discount dropped; target subtotal becomes 300k, target discount = 10% capped at 25k -> total = 275k
    expect(Number(orders[99].subtotalAmount)).toBe(300000);
    expect(Number(orders[99].discountAmount)).toBe(25000);
    expect(Number(orders[99].totalAmount)).toBe(275000);
    expect(orders[42].discountSnapshot).toBe(Prisma.JsonNull);
  });
});
