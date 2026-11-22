import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import {
  CreatePosOrderSchema,
  CreateQrOrderSchema,
  ErrorCodes,
  UserPermissionsSchema,
  type AuthPrincipal,
} from '@fnb/shared';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CashflowController } from '../../../modules/cashflow/cashflow.controller';
import { CashflowService } from '../../../modules/cashflow/cashflow.service';
import { EmployeesService } from '../../../modules/hr-schedule/employees.service';
import { MenuService } from '../../../modules/menu/menu.service';
import { PaymentQrService } from '../../../modules/payment-qr/payment-qr.service';
import { InvoicesController } from '../../../modules/pos/invoices.controller';
import { KitchenSplitService } from '../../../modules/pos/kitchen-split.service';
import { PosService } from '../../../modules/pos/pos.service';
import { TableTransferService } from '../../../modules/pos/table-transfer.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { RateLimitGuard } from '../rate-limit.guard';
import { maskSensitiveIdentifier } from '../redact.util';

const VALID_TOKEN_1 = '1'.repeat(64);
const VALID_TOKEN_2 = '2'.repeat(64);

function createHttpContext(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: AuthPrincipal;
  ip?: string;
  handler?: (...args: never[]) => unknown;
  cls?: new (...args: never[]) => unknown;
}): ExecutionContext {
  const request = {
    method: options.method ?? 'GET',
    originalUrl: options.url ?? '/api/v1/health',
    url: options.url ?? '/api/v1/health',
    headers: options.headers ?? {},
    body: options.body ?? {},
    user: options.user,
    ip: options.ip ?? '203.0.113.55',
    socket: { remoteAddress: options.ip ?? '203.0.113.55' },
  } as unknown as Request;

  const response = {
    setHeader: vi.fn(),
  } as unknown as Response;

  return {
    getType: () => 'http',
    getHandler: () => options.handler ?? (() => {}),
    getClass: () => options.cls ?? class DummyController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('5-Suite Comprehensive Security, RBAC, Concurrency & Performance Audit', () => {
  // =========================================================================
  // SUITE 1: PRICE TAMPERING & INPUT MANIPULATION
  // =========================================================================
  describe('Suite 1: Price Tampering & Input Manipulation (Zero-Trust Pricing)', () => {
    it('rejects client-injected unitPrice, totalAmount, extraPrice, or negative quantity via ZodValidationPipe (.strict())', () => {
      const qrPipe = new ZodValidationPipe(CreateQrOrderSchema);
      const posPipe = new ZodValidationPipe(CreatePosOrderSchema);

      // 1.1 Negative quantity
      expect(() =>
        qrPipe.transform(
          {
            qrToken: VALID_TOKEN_1,
            items: [{ productId: 1, quantity: -2, modifiers: [] }],
          },
          { type: 'body' } as never,
        ),
      ).toThrow(UnprocessableEntityException);

      // 1.2 Injected unitPrice / totalAmount at root or item level
      expect(() =>
        qrPipe.transform(
          {
            qrToken: VALID_TOKEN_1,
            totalAmount: 1,
            items: [{ productId: 1, quantity: 2, unitPrice: 0, modifiers: [] }],
          },
          { type: 'body' } as never,
        ),
      ).toThrow(UnprocessableEntityException);

      // 1.3 Injected negative extraPrice inside modifier selection
      expect(() =>
        posPipe.transform(
          {
            orderType: 'DINE_IN',
            tableId: 1,
            items: [
              {
                productId: 1,
                quantity: 1,
                modifiers: [{ groupId: 10, modifierId: 100, extraPrice: -50000 }],
              },
            ],
          },
          { type: 'body' } as never,
        ),
      ).toThrow(UnprocessableEntityException);

      // 1.4 Fake / malformed qrToken
      expect(() =>
        qrPipe.transform(
          {
            qrToken: 'token_table_1_fake',
            items: [{ productId: 1, quantity: 1, modifiers: [] }],
          },
          { type: 'body' } as never,
        ),
      ).toThrow(UnprocessableEntityException);
    });

    it('calculates totalAmount strictly from PostgreSQL product.price + modifier.extraPrice', async () => {
      const createdOrders: Array<{ subtotalAmount: Prisma.Decimal; totalAmount: Prisma.Decimal }> = [];
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        diningTable: {
          findUnique: vi.fn().mockResolvedValue({
            id: 5,
            name: 'Bàn 05',
            qrToken: VALID_TOKEN_1,
            status: 'AVAILABLE',
            activeOrderId: null,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        order: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(async ({ data }: { data: { subtotalAmount: Prisma.Decimal; totalAmount: Prisma.Decimal } }) => {
            createdOrders.push(data);
            return {
              id: 501,
              orderCode: 'ORD-20261117-0001',
              orderType: 'DINE_IN',
              orderSource: 'QR_CODE',
              tableId: 5,
              takeawayNumber: null,
              status: 'PENDING',
              subtotalAmount: data.subtotalAmount,
              discountAmount: new Prisma.Decimal(0),
              totalAmount: data.totalAmount,
            };
          }),
        },
        product: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              name: 'Mì Cay Hải Sản',
              price: new Prisma.Decimal(69000),
              station: 'BEP_NAU',
              isAvailable: true,
              modifierGroups: [
                {
                  id: 10,
                  name: 'Topping thêm',
                  isRequired: false,
                  maxSelect: 3,
                  modifiers: [
                    { id: 101, name: 'Thêm Phô Mai', extraPrice: new Prisma.Decimal(15000), isAvailable: true },
                  ],
                },
              ],
            },
          ]),
        },
      };

      const prisma = {
        employee: mockTx.employee,
        $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      };
      const gateway = { emitQrNewOrder: vi.fn(), emitQrAddonOrder: vi.fn(), emitTableGridSync: vi.fn() };
      const posService = new PosService(
        prisma as never,
        gateway as never,
        undefined as never,
        {} as KitchenSplitService,
        {} as TableTransferService,
      );

      const res = await posService.createQrOrder({
        qrToken: VALID_TOKEN_1,
        items: [
          {
            productId: 1,
            quantity: 2,
            modifiers: [{ groupId: 10, modifierId: 101 }],
          },
        ],
      });

      // (69,000 + 15,000) * 2 = 168,000 VND
      expect(res.totalAmount).toBe(168000);
      expect(createdOrders[0]?.totalAmount.toNumber()).toBe(168000);
    });
  });

  // =========================================================================
  // SUITE 2: RBAC MATRIX & HTTP 401 VS 403 ACCURACY + SENSITIVE MASKING
  // =========================================================================
  describe('Suite 2: RBAC Matrix (Invariant 8: 401 vs 403) & PII Masking', () => {
    it('throws 401 Unauthorized when JWT is missing or invalid, and 403 Forbidden when Cashier accesses restricted endpoints', async () => {
      const jwtGuard = new JwtAuthGuard({
        verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')),
      } as never);

      await expect(
        jwtGuard.canActivate(createHttpContext({ headers: {} })),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        jwtGuard.canActivate(
          createHttpContext({ headers: { authorization: 'Bearer expired.jwt.token' } }),
        ),
      ).rejects.toThrow(UnauthorizedException);

      // Cashier principal (has pos.view, invoices.view, cashflow.view, but NO invoices.void, NO employees, NO rbac)
      const cashierPrincipal: AuthPrincipal = {
        id: 2,
        employeeId: 2,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true, create: true, update: true, checkout: true, splitKitchen: true, tableAction: true },
          invoices: { view: true, reprint: true, void: false },
          cashflow: { view: true, create: true, config: false },
        }),
      };

      const reflector = new Reflector();
      const rbacGuard = new RbacGuard(reflector);

      // Cashier calling InvoicesController.voidInvoice -> 403 Forbidden (requires invoices.void)
      const voidCtx = createHttpContext({
        user: cashierPrincipal,
        handler: InvoicesController.prototype.voidInvoice,
        cls: InvoicesController,
      });
      expect(() => rbacGuard.canActivate(voidCtx)).toThrow(ForbiddenException);

      // Manager with invoices.void: true calling InvoicesController.voidInvoice -> Allowed (true)
      const managerPrincipal: AuthPrincipal = {
        ...cashierPrincipal,
        id: 3,
        username: 'manager01',
        permissions: UserPermissionsSchema.parse({
          invoices: { view: true, void: true },
        }),
      };
      const managerVoidCtx = createHttpContext({
        user: managerPrincipal,
        handler: InvoicesController.prototype.voidInvoice,
        cls: InvoicesController,
      });
      expect(rbacGuard.canActivate(managerVoidCtx)).toBe(true);

      // Cashier calling CashflowController.setDefaultBudget -> 403 Forbidden (requires cashflow.config)
      const budgetCtx = createHttpContext({
        user: cashierPrincipal,
        handler: CashflowController.prototype.setDefaultBudget,
        cls: CashflowController,
      });
      expect(() => rbacGuard.canActivate(budgetCtx)).toThrow(ForbiddenException);
    });

    it('masks citizenId (CCCD) and bankAccountNo (STK) in EmployeesService audit logs', async () => {
      expect(maskSensitiveIdentifier('079099001234')).toBe('********1234');
      expect(maskSensitiveIdentifier('19036543219999')).toBe('********9999');

      const recordedAudits: Array<{ metadata?: Record<string, unknown> }> = [];
      const existingEmp = {
        id: 10,
        fullName: 'Trần Văn B',
        shortName: 'B TV',
        dob: new Date('1999-01-01'),
        phone: '0909123456',
        address: 'Q1',
        citizenId: '079099001111',
        citizenIdIssuedPlace: 'CCS',
        startDate: new Date('2025-01-01'),
        bankName: 'VPB',
        bankAccountNo: '123456789012',
        bankAccountName: 'TRAN VAN B',
        note: null,
        isDeleted: false,
        position: { id: 1, name: 'Thu ngân' },
        specialty: null,
        user: null,
      };
      const updatedEmp = {
        ...existingEmp,
        citizenId: '079099009999',
        bankAccountNo: '987654321098',
        positionId: 1,
        specialtyId: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        position: { id: 1, name: 'Thu ngân', category: 'POSITION', normalizedName: 'thu ngan', isActive: true, metadata: null, createdAt: new Date(), updatedAt: new Date() },
      };
      const mockTx = {
        employee: {
          findUnique: vi.fn().mockResolvedValueOnce(existingEmp).mockResolvedValue(updatedEmp),
          findFirst: vi.fn().mockResolvedValue(existingEmp),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue(updatedEmp),
        },
      };
      const prisma = {
        employee: mockTx.employee,
        $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      };
      const auditLogService = {
        record: vi.fn(async (entry: { metadata?: Record<string, unknown> }) => {
          recordedAudits.push(entry);
        }),
      };

      const service = new EmployeesService(
        prisma as never,
        {} as never,
        auditLogService as never,
        { emitScheduleUpdated: vi.fn() } as never,
      );

      await service.updateEmployee(
        10,
        { citizenId: '079099009999', bankAccountNo: '987654321098' },
        { id: 1, employeeId: 1, username: 'admin', isSuperAdmin: true, permissions: {} as never },
      );

      const changes = (recordedAudits[0]?.metadata?.changes ?? []) as Array<{
        field: string;
        from: string;
        to: string;
      }>;
      const cccdChange = changes.find((c) => c.field === 'Số CCCD');
      const stkChange = changes.find((c) => c.field === 'STK');
      expect(cccdChange).toEqual({
        field: 'Số CCCD',
        from: '********1111',
        to: '********9999',
      });
      expect(stkChange).toEqual({
        field: 'STK',
        from: '********9012',
        to: '********1098',
      });
    });
  });

  // =========================================================================
  // SUITE 3: CONCURRENCY & ROW LOCKING (MERGE RETENTION & SPLIT-KITCHEN)
  // =========================================================================
  describe('Suite 3: Concurrency, Row Locking (Invariant 5) & MERGE Session Redirect', () => {
    it('retains MERGED source order in database with mergedIntoOrderId so guest QR add-on orders redirect seamlessly', async () => {
      const deletedOrderIds: number[] = [];
      const updatedOrders = new Map<number, Record<string, unknown>>();
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
            if (where.id === 101) {
              return {
                id: 101,
                orderCode: 'ORD-101',
                orderType: 'DINE_IN',
                status: 'SERVING',
                tableId: 1,
                totalAmount: new Prisma.Decimal(69000),
                discountId: null,
                discountSnapshot: null,
                tableTransferLogs: [],
                items: [
                  {
                    id: 1,
                    productId: 10,
                    quantity: 1,
                    unitPrice: new Prisma.Decimal(69000),
                    modifiersSnapshot: [],
                    kitchenStatus: 'PRINTED',
                    product: { id: 10, categoryId: 1, station: 'BEP_NAU', comboParents: [] },
                  },
                ],
              };
            }
            if (where.id === 102) {
              return {
                id: 102,
                orderCode: 'ORD-102',
                orderType: 'DINE_IN',
                status: 'SERVING',
                tableId: 2,
                totalAmount: new Prisma.Decimal(55000),
                discountId: null,
                discountSnapshot: null,
                tableTransferLogs: [],
                items: [
                  {
                    id: 2,
                    productId: 11,
                    quantity: 1,
                    unitPrice: new Prisma.Decimal(55000),
                    modifiersSnapshot: [],
                    kitchenStatus: 'PRINTED',
                    product: { id: 11, categoryId: 1, station: 'BEP_CHIEN', comboParents: [] },
                  },
                ],
              };
            }
            return null;
          }),
          update: vi.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
            updatedOrders.set(where.id, data);
            return { id: where.id, ...data };
          }),
          delete: vi.fn(async ({ where }: { where: { id: number } }) => {
            deletedOrderIds.push(where.id);
          }),
        },
        orderItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              productId: 10,
              quantity: 1,
              unitPrice: new Prisma.Decimal(69000),
              modifiersSnapshot: [],
              kitchenStatus: 'PRINTED',
              product: { id: 10, categoryId: 1 },
            },
            {
              id: 2,
              productId: 11,
              quantity: 1,
              unitPrice: new Prisma.Decimal(55000),
              modifiersSnapshot: [],
              kitchenStatus: 'PRINTED',
              product: { id: 11, categoryId: 1 },
            },
          ]),
        },
        diningTable: {
          findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
            if (where.id === 1) return { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 101 };
            if (where.id === 2) return { id: 2, name: 'Bàn 02', status: 'OCCUPIED', activeOrderId: 102 };
            return null;
          }),
          findMany: vi.fn().mockResolvedValue([
            { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 101 },
            { id: 2, name: 'Bàn 02', status: 'OCCUPIED', activeOrderId: 102 },
          ]),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        employee: mockTx.employee,
        $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      };
      const gateway = {
        emitOrderSessionRedirected: vi.fn(),
        emitTableGridSync: vi.fn(),
      };

      const transferService = new TableTransferService(prisma as never, gateway as never);
      const res = await transferService.executeTableAction(
        101,
        { action: 'MERGE', targetTableId: 2, reason: 'Khách ngồi chung bàn 02' },
        1,
      );

      expect(res.action).toBe('MERGE');
      // Source order #101 MUST NOT be deleted so activeOrderId=101 can redirect via mergedIntoOrderId=102
      expect(deletedOrderIds).toEqual([]);
      expect(updatedOrders.get(101)).toMatchObject({
        status: 'MERGED',
        mergedIntoOrderId: 102,
      });
    });

    it('ensures concurrent splitKitchen calls are serialized and idempotent (second call returns tickets: [])', async () => {
      let itemStatus: 'NEW' | 'PRINTED' = 'NEW';
      let lockQueue = Promise.resolve();

      const prisma = {
        $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const run = lockQueue.then(async () => {
            const tx = {
              $queryRaw: vi.fn().mockResolvedValue([]),
              order: {
                findUnique: vi.fn(async () => ({
                  id: 300,
                  orderCode: 'ORD-300',
                  status: 'SERVING',
                  tableId: 3,
                  tableTransferLogs: [],
                  items:
                    itemStatus === 'NEW'
                      ? [
                          {
                            id: 9001,
                            productId: 1,
                            quantity: 1,
                            batchNo: 1,
                            kitchenStatus: itemStatus,
                            modifiersSnapshot: [],
                            itemNote: null,
                            product: {
                              id: 1,
                              name: 'Mì Cay Bò Mỹ',
                              station: 'BEP_NAU',
                              comboParents: [],
                            },
                          },
                        ]
                      : [],
                })),
                update: vi.fn().mockResolvedValue({}),
              },
              orderItem: {
                aggregate: vi.fn().mockResolvedValue({ _max: { batchNo: null } }),
                updateMany: vi.fn(async () => {
                  itemStatus = 'PRINTED';
                  return { count: 1 };
                }),
              },
              diningTable: {
                update: vi.fn().mockResolvedValue({}),
              },
            };
            return cb(tx);
          });
          lockQueue = run.then(() => undefined, () => undefined);
          return run;
        }),
      };

      const gateway = {
        emitOrderStatusUpdated: vi.fn(),
        emitTableGridSync: vi.fn(),
      };

      const splitService = new KitchenSplitService(prisma as never, gateway as never);
      const [first, second] = await Promise.all([
        splitService.splitKitchen(300),
        splitService.splitKitchen(300),
      ]);

      const nonEmpty = [first, second].filter((r) => r.tickets.length > 0);
      const empty = [first, second].filter((r) => r.tickets.length === 0);
      expect(nonEmpty).toHaveLength(1);
      expect(empty).toHaveLength(1);
      expect(nonEmpty[0]?.tickets[0]?.station).toBe('BEP_NAU');
    });
  });

  // =========================================================================
  // SUITE 4: BLIND SETTLEMENT & CASHFLOW INVARIANT 6
  // =========================================================================
  describe('Suite 4: Cashflow Blind Settlement & Invariant 6 Formula', () => {
    it('hides theoretical figures in preview() for non-SuperAdmin (blindMode=true) while returning full figures for SuperAdmin', async () => {
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            totalCashSales: new Prisma.Decimal(500000),
            totalTransferSales: new Prisma.Decimal(300000),
          },
        ]),
        masterData: {
          findUnique: vi.fn().mockResolvedValue({
            metadata: { opening_budget: '1000000.00' },
          }),
        },
        inventoryImport: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { totalCost: new Prisma.Decimal(150000) },
          }),
        },
      };

      const service = new CashflowService(prisma as never);

      // Non-SuperAdmin (Cashier) -> Blind Settlement Mode
      const cashierPreview = await service.preview(new Date('2026-11-17T08:00:00.000Z'), false);
      expect(cashierPreview).toEqual({
        settlementDate: '2026-11-17',
        shiftName: 'CA_NGAY',
        blindMode: true,
        openingBudget: 1000000,
        totalCashSales: null,
        totalTransferSales: null,
        totalCashImports: null,
        expectedCashInDrawer: null,
      });

      // SuperAdmin -> Full Preview Mode
      const adminPreview = await service.preview(new Date('2026-11-17T08:00:00.000Z'), true);
      expect(adminPreview).toEqual({
        settlementDate: '2026-11-17',
        shiftName: 'CA_NGAY',
        blindMode: false,
        openingBudget: 1000000,
        totalCashSales: 500000,
        totalTransferSales: 300000,
        totalCashImports: 150000,
        expectedCashInDrawer: 1350000,
      });
    });

    it('requires discrepancy note without leaking theoretical discrepancy amount when settleShift has a mismatch', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            totalCashSales: new Prisma.Decimal(500000),
            totalTransferSales: new Prisma.Decimal(0),
          },
        ]),
        cashDrawerSettlement: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        masterData: {
          findUnique: vi.fn().mockResolvedValue({
            metadata: { opening_budget: '1000000.00' },
          }),
        },
        inventoryImport: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { totalCost: new Prisma.Decimal(0) },
          }),
        },
      };

      const prisma = {
        employee: mockTx.employee,
        $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      };
      const service = new CashflowService(prisma as never);

      // Expected is 1,500,000, cashier counts 1,000,000 (2 x 500k) without note
      let caughtError: unknown;
      try {
        await service.settleShift(
          {
            settlementDate: '2026-11-17',
            shiftName: 'CA_NGAY',
            actualCountedCash: 1000000,
            denominationsDetail: {
              '500000': 2,
              '200000': 0,
              '100000': 0,
              '50000': 0,
              '20000': 0,
              '10000': 0,
              '5000': 0,
              '2000': 0,
              '1000': 0,
            },
          },
          2,
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(UnprocessableEntityException);
      const responseObj = (caughtError as UnprocessableEntityException).getResponse() as Record<string, unknown>;
      expect(responseObj.code).toBe(ErrorCodes.CASHFLOW_DISCREPANCY_NOTE_REQUIRED);
      // Verify the error payload does NOT leak 1500000 or 500000
      expect(JSON.stringify(responseObj)).not.toContain('1500000');
      expect(JSON.stringify(responseObj)).not.toContain('500000');
    });
  });

  // =========================================================================
  // SUITE 5: QR SPAM RATE LIMIT, BUCKET CAP & ROTATE TABLE QR TOKEN
  // =========================================================================
  describe('Suite 5: QR Order Rate Limit, Bucket Cap & Rotate Table QR Token', () => {
    it('blocks the 7th QR order submission within 60s for the same table qrToken with HTTP 429', () => {
      const guard = new RateLimitGuard();
      guard.setForceEnabled(true);

      for (let i = 1; i <= 6; i += 1) {
        const ctx = createHttpContext({
          method: 'POST',
          url: '/api/v1/public/orders/qr',
          ip: `10.0.0.${i}`,
          body: { qrToken: VALID_TOKEN_1 },
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }

      const seventhCtx = createHttpContext({
        method: 'POST',
        url: '/api/v1/public/orders/qr',
        ip: '10.0.0.99',
        body: { qrToken: VALID_TOKEN_1 },
      });

      try {
        guard.canActivate(seventhCtx);
        expect.fail('Expected 429 Too Many Requests on 7th QR order');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('rotates a table qrToken even when OCCUPIED while keeping activeOrderId intact and invalidating the old token', async () => {
      let storedToken = VALID_TOKEN_1;
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        diningTable: {
          findUnique: vi.fn(async ({ where }: { where: { id?: number; qrToken?: string } }) => {
            if (where.id === 8) {
              return {
                id: 8,
                name: 'Bàn 08',
                qrToken: storedToken,
                status: 'OCCUPIED',
                activeOrderId: 888,
              };
            }
            if (where.qrToken) {
              return where.qrToken === storedToken
                ? { id: 8, name: 'Bàn 08', qrToken: storedToken, status: 'OCCUPIED', activeOrderId: 888 }
                : null;
            }
            return null;
          }),
          update: vi.fn(async ({ data }: { data: { qrToken: string } }) => {
            storedToken = data.qrToken;
            return {
              id: 8,
              name: 'Bàn 08',
              qrToken: storedToken,
              status: 'OCCUPIED',
              activeOrderId: 888,
            };
          }),
        },
      };

      const prisma = {
        employee: mockTx.employee,
        $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      };
      const gateway = { emitTableGridSync: vi.fn() };
      const auditLogService = { record: vi.fn() };

      const posService = new PosService(
        prisma as never,
        gateway as never,
        undefined as never,
        {} as KitchenSplitService,
        {} as TableTransferService,
        auditLogService as never,
      );

      const rotated = await posService.rotateTableQr(8, 1);
      expect(rotated.id).toBe(8);
      expect(rotated.status).toBe('OCCUPIED');
      expect(rotated.activeOrderId).toBe(888);
      expect(rotated.qrToken).toHaveLength(64);
      expect(rotated.qrToken).not.toBe(VALID_TOKEN_1);
      expect(gateway.emitTableGridSync).toHaveBeenCalledWith({ tableId: 8 });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'POS',
          action: 'Đổi mã QR bàn',
        }),
      );

      // Old QR token is now rejected with 404 NotFoundException
      await expect(
        posService.createQrOrder({
          qrToken: VALID_TOKEN_1,
          items: [{ productId: 1, quantity: 1, modifiers: [] }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // BONUS: MENU 30S IN-MEMORY CACHE & PAYMENT QR SQL AGGREGATION
  // =========================================================================
  describe('Performance: MenuService 30s Public Catalog Cache & PaymentQrService SQL Aggregation', () => {
    it('caches static product/category/station queries in MenuService.getPublicMenu for 30s and invalidates on mutation', async () => {
      const productFindMany = vi.fn().mockResolvedValue([
        {
          id: 1,
          name: 'Mì Cay Kim Chi',
          subtitle: null,
          categoryId: null,
          category: null,
          price: new Prisma.Decimal(59000),
          station: 'BEP_NAU',
          isAvailable: true,
          imageUrl: null,
          sortOrder: 1,
          modifierGroups: [],
          comboParents: [],
        },
      ]);

      const prisma = {
        diningTable: {
          findUnique: vi.fn(async ({ where }: { where: { qrToken: string } }) => ({
            id: where.qrToken === VALID_TOKEN_1 ? 1 : 2,
            name: where.qrToken === VALID_TOKEN_1 ? 'Bàn 01' : 'Bàn 02',
            status: 'AVAILABLE',
            activeOrderId: null,
          })),
        },
        product: {
          findMany: productFindMany,
        },
        masterData: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const menuService = new MenuService(prisma as never);

      // Call 1 (Bàn 01) -> queries DB
      const res1 = await menuService.getPublicMenu(VALID_TOKEN_1);
      expect(res1.table.tableName).toBe('Bàn 01');
      expect(productFindMany).toHaveBeenCalledTimes(1);

      // Call 2 (Bàn 02) within 30s -> serves static catalog from memory cache!
      const res2 = await menuService.getPublicMenu(VALID_TOKEN_2);
      expect(res2.table.tableName).toBe('Bàn 02');
      expect(productFindMany).toHaveBeenCalledTimes(1);

      // Invalidate cache -> next call queries DB again
      menuService.invalidatePublicMenuCache();
      await menuService.getPublicMenu(VALID_TOKEN_1);
      expect(productFindMany).toHaveBeenCalledTimes(2);
    });

    it('uses Prisma SQL groupBy in PaymentQrService.selectForAmount when available instead of loading all orders', async () => {
      const findManyOrdersSpy = vi.fn();
      const groupBySpy = vi.fn().mockResolvedValue([
        {
          paymentAccountId: 1,
          paymentMethod: 'TRANSFER',
          _sum: {
            totalAmount: new Prisma.Decimal(5000000),
            transferAmount: new Prisma.Decimal(5000000),
          },
        },
      ]);

      const mockClient = {
        paymentAccount: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              label: 'QR Chính',
              bankCode: 'VPB',
              accountNo: '123456789',
              accountName: 'NGUYEN VAN A',
              priority: 1,
              isActive: true,
              dailyLimit: new Prisma.Decimal(10000000),
              monthlyLimit: null,
              yearlyLimit: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
        order: {
          groupBy: groupBySpy,
          findMany: findManyOrdersSpy,
        },
      };

      const qrService = new PaymentQrService(mockClient as never);
      const selected = await qrService.selectForAmount(mockClient as never, 150000);

      expect(selected.account.id).toBe(1);
      expect(groupBySpy).toHaveBeenCalledTimes(3);
      expect(findManyOrdersSpy).not.toHaveBeenCalled();
    });
  });
});
