import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  ApplicableDiscountsResponseSchema,
  ApplyPosDiscountRequestSchema,
  ApproveQrOrderSchema,
  CheckoutOrderRequestSchema,
  CreateDiningTableSchema,
  CreatePosOrderSchema,
  CreateQrOrderSchema,
  DiscountSnapshotSchema,
  ErrorCodes,
  OrderDetailResponseSchema,
  PatchOrderItemsResponseSchema,
  PatchOrderItemsSchema,
  PosOrderCreationResponseSchema,
  PosTableGridResponseSchema,
  ProvisionalBillResponseSchema,
  QrOrderResponseSchema,
  QrTokenSchema,
  RotateTableQrResponseSchema,
  RotateTakeawayQrResponseSchema,
  ShortenLegacyQrTokensResponseSchema,
  SplitCheckoutOrderRequestSchema,
  SplitProvisionalBillRequestSchema,
  UpdateDiningTableSchema,
  VoidInvoiceRequestSchema,
  calculateOrderDiscount,
  getVietQrBankShortName,
  isLegacyLongQrToken,
  maskQrTokenForAudit,
  normalizeQrToken,
  type ApplyPosDiscountRequest,
  type ApproveQrOrderInput,
  type AuthPrincipal,
  type CheckoutOrderRequest,
  type CreateDiningTableInput,
  type CreateOrderItemInput,
  type CreatePosOrderInput,
  type CreateQrOrderInput,
  type DiscountSnapshot,
  type PatchOrderItemsInput,
  type QrOrderResponse,
  type ReprintKitchenRequest,
  type SplitCheckoutOrderRequest,
  type SplitProvisionalBillRequest,
  type TableActionRequest,
  type UpdateDiningTableInput,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import type { ZodType } from 'zod';
import type { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService, formatPaymentMethodVi } from '../../common/audit/audit-log.service';
import { generateUniqueTableQrToken } from '../../common/utils/qr-token.util';
import {
  formatTakeawayCustomerNote,
  getOrCreateTakeawayQrToken,
  isTakeawayQrToken,
  rotateTakeawayQrToken,
  signTakeawayGuestSessionToken,
  verifyTakeawayGuestSessionToken,
} from '../../common/security/takeaway-qr.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import { DiscountsService } from '../discounts/discounts.service';
import { PaymentQrService, type QrSelectionResult } from '../payment-qr/payment-qr.service';
import { KitchenSplitService } from './kitchen-split.service';
import {
  computeTotalsFromRows,
  extractDiscountSnapshot,
  hasOrderDiscount,
  recomputeOrderTotals,
  snapshotToCalcRule,
  toCalcItems,
} from './order-totals.helper';
import { TableTransferService } from './table-transfer.service';

type PricingModifier = {
  id: number;
  name: string;
  extraPrice: Prisma.Decimal;
  isDefaultChecked?: boolean;
  isAvailable?: boolean;
  defaultSubstituteName?: string | null;
};
type PricingGroup = {
  id: number;
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect?: boolean;
  allowSubstitution?: boolean;
  modifiers: PricingModifier[];
};
type PricingProduct = {
  id: number;
  name: string;
  price: Prisma.Decimal;
  station: string;
  isAvailable: boolean;
  modifierGroups: PricingGroup[];
};
type ResolvedOrderItem = {
  productId: number;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersSnapshot: Prisma.InputJsonValue;
  itemNote: string | null;
};
type OrderRow = {
  id: number;
  orderCode: string;
  orderType: string;
  orderSource?: string;
  tableId: number | null;
  takeawayNumber: number | null;
  status: string;
  paymentMethod?: string | null;
  paymentAccountId?: number | null;
  cashAmount?: Prisma.Decimal;
  transferAmount?: Prisma.Decimal;
  subtotalAmount?: Prisma.Decimal;
  discountAmount?: Prisma.Decimal;
  discountId?: number | null;
  discountSnapshot?: unknown;
  totalAmount: Prisma.Decimal;
  mergedIntoOrderId?: number | null;
  cashierId?: number | null;
  note?: string | null;
  voidReason?: string | null;
  createdAt?: Date;
  paidAt?: Date | null;
  table?: { id: number; name: string; status?: string } | null;
  items?: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitPrice: Prisma.Decimal;
    modifiersSnapshot: unknown;
    itemNote: string | null;
    batchNo: number;
    itemSource?: string;
    kitchenStatus: string;
    createdAt?: Date;
    product: {
      id: number;
      name: string;
      categoryId?: number | null;
      station: string;
      comboParents?: Array<{ childProductId: number; quantity: number; childProduct?: { name?: string; station: string } }>;
    };
  }>;
  tableTransferLogs?: unknown;
};

const physicalStations = new Set(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);

class RetryQrOrderWithActiveSession extends Error {
  constructor(readonly activeOrderId: number) {
    super('Retry QR order after discovering an active table session');
  }
}

@Injectable()
export class PosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PosSocketGateway) private readonly gateway: PosSocketGateway,
    @Optional() @Inject(ConfigService) _config: ConfigService<EnvConfig, true>,
    @Inject(KitchenSplitService) private readonly kitchenSplitService: KitchenSplitService,
    @Inject(TableTransferService) private readonly tableTransferService: TableTransferService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PaymentQrService) private readonly paymentQrService?: PaymentQrService,
    @Optional() @Inject(DiscountsService) private readonly discountsService?: DiscountsService,
  ) {}

  private get qrService(): PaymentQrService {
    return this.paymentQrService ?? new PaymentQrService(this.prisma, this.auditLogService);
  }

  private get discountSvc(): DiscountsService {
    return this.discountsService ?? new DiscountsService(this.prisma, this.auditLogService);
  }

  async createOrder(input: CreatePosOrderInput, cashierId: number) {
    const parsed = this.parseRequest(CreatePosOrderSchema, input);
    const created = await this.prisma.$transaction(async (tx) => {
      let table: { id: number; name: string; status: string; activeOrderId: number | null } | null = null;
      if (parsed.orderType === 'DINE_IN') {
        const tableId = parsed.tableId;
        if (tableId === undefined || tableId === null) throw new BadRequestException('Đơn tại bàn cần chọn bàn');
        await this.lockTables(tx, [tableId]);
        table = await tx.diningTable.findUnique({ where: { id: tableId } });
        if (!table || table.status !== 'AVAILABLE' || table.activeOrderId !== null) {
          throw this.conflict('POS_TABLE_NOT_AVAILABLE', 'Bàn đã có khách hoặc không còn trống');
        }
      }

      const now = new Date();
      const businessDay = this.businessDay(now);
      await this.lockOrderSequence(tx, businessDay.key);
      const orderCode = await this.nextOrderCode(tx, businessDay);
      const takeawayNumber = parsed.orderType === 'TAKEAWAY'
        ? await this.nextTakeawayNumber(tx, businessDay)
        : null;
      const items = await this.resolveItems(tx, parsed.items);
      const totalAmount = this.totalForItems(items);
      const order = await tx.order.create({
        data: {
          orderCode,
          orderType: parsed.orderType,
          orderSource: 'POS_COUNTER',
          tableId: parsed.orderType === 'DINE_IN' ? parsed.tableId : null,
          takeawayNumber,
          status: 'SERVING',
          cashierId,
          note: parsed.note,
          subtotalAmount: totalAmount,
          discountAmount: new Prisma.Decimal(0),
          totalAmount,
          createdAt: now,
          items: { create: items.map((item) => ({ ...item, batchNo: 1 })) },
        },
      });
      if (table) {
        await tx.diningTable.update({ where: { id: table.id }, data: { status: 'OCCUPIED', activeOrderId: order.id } });
      }
      return this.createdOrderResponse(order as OrderRow, table?.name ?? null);
    });

    this.gateway.emitTableGridSync({ orderId: created.orderId, tableId: created.tableId, status: created.status });
    const isTakeaway = created.orderType === 'TAKEAWAY';
    const targetDesc = created.tableLabel ?? 'Mang về';
    await this.auditLogService?.record({
      module: 'POS',
      action: isTakeaway ? 'Tạo đơn mang về' : 'Tạo đơn tại bàn',
      detail: `${created.orderCode} (${targetDesc})`,
      message: `${isTakeaway ? 'tạo đơn mang về' : 'tạo đơn ăn tại bàn'} ${created.orderCode} (${targetDesc})`,
      actor: cashierId,
      metadata: { orderId: created.orderId, orderCode: created.orderCode, tableLabel: targetDesc },
    });
    return created;
  }

  async createQrOrder(input: CreateQrOrderInput): Promise<QrOrderResponse> {
    const parsed = this.parseRequest(CreateQrOrderSchema, input);
    const normalizedQrToken = normalizeQrToken(parsed.qrToken);
    let result: { kind: 'new' | 'addon'; response: ReturnType<typeof QrOrderResponseSchema.parse>; payload: unknown };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const qrTable = await tx.diningTable.findUnique({ where: { qrToken: normalizedQrToken } });
        if (!qrTable) {
          const isTakeaway = await isTakeawayQrToken(tx, normalizedQrToken);
          if (!isTakeaway) {
            throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });
          }
          return this.createTakeawayQrOrderTx(tx, { ...parsed, qrToken: normalizedQrToken });
        }

        const existingOrderId = parsed.activeOrderId ?? qrTable.activeOrderId;
        if (existingOrderId !== null && existingOrderId !== undefined) {
          const sourceBeforeLock = await tx.order.findUnique({
            where: { id: existingOrderId },
            select: { id: true, mergedIntoOrderId: true },
          });
          if (!sourceBeforeLock) throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng QR' });
          const lockIds = [existingOrderId, sourceBeforeLock.mergedIntoOrderId].filter((id): id is number => id !== null);
          await this.lockOrders(tx, lockIds);

          const source = await tx.order.findUnique({
            where: { id: existingOrderId },
            include: { table: { select: { id: true, name: true } } },
          }) as OrderRow | null;
          if (!source) throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng QR' });
          if (!this.isQrOrderAccessibleFromTable(source, qrTable)) {
            throw new ForbiddenException({ message: 'Phiên đơn hàng không thuộc bàn của mã QR này' });
          }
          if (source.status === 'MERGED' && typeof source.mergedIntoOrderId === 'number' && !lockIds.includes(source.mergedIntoOrderId)) {
            throw new RetryQrOrderWithActiveSession(existingOrderId);
          }
          let target = source;
          if (source.status === 'MERGED' && typeof source.mergedIntoOrderId === 'number') {
            target = await tx.order.findUnique({
              where: { id: source.mergedIntoOrderId },
              include: { table: { select: { id: true, name: true } } },
            }) as OrderRow | null ?? source;
            if (target.status === 'MERGED' && typeof target.mergedIntoOrderId === 'number') {
              throw new RetryQrOrderWithActiveSession(target.id);
            }
          }
          if (!['PENDING', 'SERVING'].includes(target.status) || target.orderType !== 'DINE_IN' || !target.table) {
            throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để gọi thêm món');
          }

          const response = await this.appendItems(tx, target, parsed.items);
          return {
            kind: 'addon' as const,
            response: QrOrderResponseSchema.parse({
              orderId: target.id,
              activeOrderId: target.id,
              orderCode: target.orderCode,
              currentTableLabel: target.table.name,
              status: target.status,
              batchNo: response.batchNo,
              totalAmount: response.totalAmount,
            }),
            payload: { ...response, orderId: target.id, tableId: target.table.id, tableLabel: target.table.name },
          };
        }

        await this.lockTables(tx, [qrTable.id]);
        const table = await tx.diningTable.findUnique({ where: { id: qrTable.id } });
        if (!table) throw new NotFoundException({ message: 'Không tìm thấy bàn' });
        if (table.activeOrderId !== null) throw new RetryQrOrderWithActiveSession(table.activeOrderId);
        if (table.status !== 'AVAILABLE') throw this.conflict('POS_TABLE_NOT_AVAILABLE', 'Bàn hiện không nhận đơn QR mới');

        const now = new Date();
        const businessDay = this.businessDay(now);
        await this.lockOrderSequence(tx, businessDay.key);
        const orderCode = await this.nextOrderCode(tx, businessDay);
        const items = await this.resolveItems(tx, parsed.items);
        const totalAmount = this.totalForItems(items);
        const order = await tx.order.create({
          data: {
            orderCode,
            orderType: 'DINE_IN',
            orderSource: 'QR_CODE',
            tableId: table.id,
            takeawayNumber: null,
            status: 'PENDING',
            note: parsed.note,
            subtotalAmount: totalAmount,
            discountAmount: new Prisma.Decimal(0),
            totalAmount,
            createdAt: now,
            items: { create: items.map((item) => ({ ...item, batchNo: 1, itemSource: 'QR_CODE' })) },
          },
        });
        await tx.diningTable.update({ where: { id: table.id }, data: { status: 'PENDING', activeOrderId: order.id } });
        const response = QrOrderResponseSchema.parse({
          orderId: order.id,
          activeOrderId: order.id,
          orderCode,
          currentTableLabel: table.name,
          status: 'PENDING',
          batchNo: 1,
          totalAmount: totalAmount.toNumber(),
        });
        return {
          kind: 'new' as const,
          response,
          payload: { ...response, tableId: table.id, tableLabel: table.name, pendingQrSince: now.toISOString() },
        };
      });
    } catch (error) {
      if (error instanceof RetryQrOrderWithActiveSession) {
        return this.createQrOrder({ ...parsed, activeOrderId: error.activeOrderId });
      }
      throw error;
    }

    if (result.kind === 'new') this.gateway.emitQrNewOrder(result.payload);
    else this.gateway.emitQrAddonOrder(result.payload);
    return result.response;
  }

  async getTableGrid() {
    const [tables, takeaways, takeawayQrToken] = await Promise.all([
      this.prisma.diningTable.findMany({
        where: { status: { in: ['AVAILABLE', 'PENDING', 'OCCUPIED'] } },
        orderBy: { id: 'asc' },
        include: {
          activeOrder: {
            select: {
              id: true,
              orderCode: true,
              orderType: true,
              orderSource: true,
              tableId: true,
              takeawayNumber: true,
              status: true,
              subtotalAmount: true,
              discountAmount: true,
              totalAmount: true,
              createdAt: true,
              items: { select: { batchNo: true, kitchenStatus: true, itemSource: true, createdAt: true } },
            },
          },
        },
      }),
      this.prisma.order.findMany({
        where: { orderType: 'TAKEAWAY', status: { in: ['PENDING', 'SERVING'] } },
        orderBy: [{ createdAt: 'asc' }, { takeawayNumber: 'asc' }],
        include: {
          items: { select: { batchNo: true, kitchenStatus: true, itemSource: true, createdAt: true } },
        },
      }),
      getOrCreateTakeawayQrToken(this.prisma),
    ]);
    return PosTableGridResponseSchema.parse({
      tables: tables.map((table) => {
        const rawQrToken = (table as { qrToken?: unknown }).qrToken;
        const validQrToken = QrTokenSchema.safeParse(rawQrToken).success
          ? (rawQrToken as string)
          : undefined;
        return {
          id: table.id,
          name: table.name,
          ...(validQrToken ? { qrToken: validQrToken } : {}),
          status: table.status,
          activeOrderId: table.activeOrderId,
          activeOrder: table.activeOrder ? this.orderSummary(table.activeOrder as unknown as OrderRow, table.name) : null,
        };
      }),
      takeaways: takeaways.map((order) => this.orderSummary(order as unknown as OrderRow, null)),
      ...(takeawayQrToken ? { takeawayQrToken } : {}),
    });
  }

  async rotateTakeawayQr(userId?: number) {
    const result = await rotateTakeawayQrToken(this.prisma);
    this.gateway.emitTableGridSync({ takeawayQrRotated: true });
    if (userId) {
      const oldShort = maskQrTokenForAudit(result.previousQrToken);
      const newShort = maskQrTokenForAudit(result.qrToken);
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Đổi mã QR Mang về',
        detail: 'Mã QR Đặt món Mang về',
        message: 'đổi mã QR đặt món Mang về',
        actor: userId,
        metadata: {
          changes: [{ field: 'Mã QR Mang về', from: oldShort, to: newShort }],
        },
      });
    }
    return RotateTakeawayQrResponseSchema.parse({ qrToken: result.qrToken });
  }

  async shortenLegacyQrTokens(userId?: number) {
    const { updatedTables, updatedTakeaway } = await this.prisma.$transaction(async (tx) => {
      const activeTables = await tx.diningTable.findMany({
        where: { status: { not: 'DELETED' } },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, qrToken: true },
      });
      const legacyTables = activeTables.filter((t) => isLegacyLongQrToken(t.qrToken));
      if (legacyTables.length > 0) {
        await this.lockTables(
          tx,
          legacyTables.map((t) => t.id),
        );
      }

      let tableCount = 0;
      for (const table of legacyTables) {
        const nextToken = await generateUniqueTableQrToken(tx, table.name, table.qrToken);
        await tx.diningTable.update({
          where: { id: table.id },
          data: { qrToken: nextToken },
        });
        tableCount += 1;
      }

      const currentTakeaway = await getOrCreateTakeawayQrToken(tx);
      let takeawayRotated = false;
      if (isLegacyLongQrToken(currentTakeaway)) {
        await rotateTakeawayQrToken(tx);
        takeawayRotated = true;
      }

      return { updatedTables: tableCount, updatedTakeaway: takeawayRotated };
    });

    if (updatedTables > 0 || updatedTakeaway) {
      this.gateway.emitTableGridSync({ shortenedLegacyQrTokens: true });
      if (userId) {
        const total = updatedTables + (updatedTakeaway ? 1 : 0);
        await this.auditLogService?.record({
          module: 'POS',
          action: 'Thu gọn mã QR',
          detail: `${total} mã QR`,
          message: `thu gọn ${total} mã QR sang định dạng ngắn dễ nhập`,
          actor: userId,
          metadata: { updatedTables, updatedTakeaway },
        });
      }
    }

    return ShortenLegacyQrTokensResponseSchema.parse({
      updatedTables,
      updatedTakeaway,
    });
  }

  async createTable(input: CreateDiningTableInput, userId?: number) {
    const parsed = this.parseRequest(CreateDiningTableSchema, input);
    const trimmedName = parsed.name.trim();
    if (/mang\s*v[eề]|takeaway/i.test(trimmedName)) {
      throw new BadRequestException({
        code: 'INVALID_TABLE_NAME',
        message: 'Không được tạo bàn tên "Mang về" trong sơ đồ bàn vật lý (Invariant 2)',
      });
    }

    if (typeof this.prisma.diningTable?.findFirst === 'function') {
      const duplicate = await this.prisma.diningTable.findFirst({
        where: {
          status: { in: ['AVAILABLE', 'PENDING', 'OCCUPIED'] },
          name: { equals: trimmedName, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw this.conflict('POS_TABLE_DUPLICATE', `Tên bàn "${trimmedName}" đã tồn tại`);
      }
    }

    const qrToken = await generateUniqueTableQrToken(this.prisma, trimmedName);
    const created = await this.prisma.diningTable.create({
      data: {
        name: trimmedName,
        qrToken,
        status: 'AVAILABLE',
        activeOrderId: null,
      },
    });
    this.gateway.emitTableGridSync({ tableId: created.id });
    if (userId) {
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Thêm bàn',
        detail: created.name,
        message: `thêm bàn mới "${created.name}" vào sơ đồ bàn`,
        actor: userId,
        metadata: { tableId: created.id, tableLabel: created.name },
      });
    }
    return {
      id: created.id,
      name: created.name,
      status: created.status,
      activeOrderId: created.activeOrderId,
    };
  }

  async updateTable(id: number, input: UpdateDiningTableInput, userId?: number) {
    const parsed = this.parseRequest(UpdateDiningTableSchema, input);
    const trimmedName = parsed.name.trim();
    if (/mang\s*v[eề]|takeaway/i.test(trimmedName)) {
      throw new BadRequestException({
        code: 'INVALID_TABLE_NAME',
        message: 'Không được đổi tên bàn thành "Mang về" (Invariant 2)',
      });
    }

    const existing = await this.prisma.diningTable.findUnique({ where: { id } });
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException({ message: 'Không tìm thấy bàn vật lý' });
    }

    if (existing.status !== 'AVAILABLE' || existing.activeOrderId !== null) {
      throw this.conflict(
        'POS_TABLE_NOT_AVAILABLE',
        `Không thể đổi tên bàn "${existing.name}" khi bàn đang có khách hoặc đang có đơn phục vụ. Vui lòng hoàn tất thanh toán trước khi đổi tên bàn.`,
      );
    }

    if (typeof this.prisma.diningTable?.findFirst === 'function') {
      const duplicate = await this.prisma.diningTable.findFirst({
        where: {
          id: { not: id },
          status: { in: ['AVAILABLE', 'PENDING', 'OCCUPIED'] },
          name: { equals: trimmedName, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw this.conflict('POS_TABLE_DUPLICATE', `Tên bàn "${trimmedName}" đã tồn tại`);
      }
    }

    const updated = await this.prisma.diningTable.update({
      where: { id },
      data: { name: trimmedName },
    });
    this.gateway.emitTableGridSync({ tableId: updated.id });
    if (userId) {
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Đổi tên bàn',
        detail: `${existing.name} -> ${updated.name}`,
        message: 'đổi tên bàn',
        actor: userId,
        metadata: {
          tableId: updated.id,
          tableLabel: updated.name,
          changes: [{ field: 'Tên bàn', from: existing.name, to: updated.name }],
        },
      });
    }
    return {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      activeOrderId: updated.activeOrderId,
    };
  }

  async deleteTable(id: number, userId?: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockTables(tx, [id]);
      const existing = await tx.diningTable.findUnique({ where: { id } });
      if (!existing || existing.status === 'DELETED') {
        throw new NotFoundException({ message: 'Không tìm thấy bàn vật lý' });
      }

      if (existing.status !== 'AVAILABLE' || existing.activeOrderId !== null) {
        throw this.conflict(
          'POS_TABLE_NOT_AVAILABLE',
          'Không thể xoá bàn đang có khách hoặc đang có đơn phục vụ',
        );
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (typeof tx.order?.count === 'function') {
        const recentOrderCount = await tx.order.count({
          where: {
            tableId: id,
            createdAt: { gte: thirtyDaysAgo },
          },
        });
        if (recentOrderCount > 0) {
          throw new BadRequestException({
            code: 'TABLE_HAS_RECENT_ORDERS',
            message: `Bàn "${existing.name}" đã phát sinh ${recentOrderCount} hoá đơn trong vòng 30 ngày qua nên không thể xoá. Chỉ cho phép xoá bàn khi không có hoá đơn nào trong 30 ngày gần nhất.`,
          });
        }

        const totalOrderCount = await tx.order.count({ where: { tableId: id } });
        if (totalOrderCount > 0) {
          await tx.diningTable.update({
            where: { id },
            data: {
              status: 'DELETED',
              name: `${existing.name}_archived_${Date.now()}`,
            },
          });
          return { deleted: true, id, archived: true, tableName: existing.name };
        }
      }

      await tx.diningTable.delete({ where: { id } });
      return { deleted: true, id, archived: false, tableName: existing.name };
    });

    this.gateway.emitTableGridSync({ tableId: id });
    if (userId) {
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Xoá bàn',
        detail: result.tableName,
        message: `xoá bàn "${result.tableName}" khỏi sơ đồ bàn`,
        actor: userId,
        metadata: { tableId: id, tableLabel: result.tableName },
      });
    }
    return { deleted: result.deleted, id: result.id, archived: result.archived };
  }

  async rotateTableQr(id: number, userId?: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockTables(tx, [id]);
      const existing = await tx.diningTable.findUnique({ where: { id } });
      if (!existing || existing.status === 'DELETED') {
        throw new NotFoundException({ message: 'Không tìm thấy bàn vật lý' });
      }

      const nextQrToken = await generateUniqueTableQrToken(tx, existing.name, existing.qrToken);
      const updated = await tx.diningTable.update({
        where: { id },
        data: { qrToken: nextQrToken },
      });

      return {
        previousQrToken: existing.qrToken,
        table: RotateTableQrResponseSchema.parse({
          id: updated.id,
          name: updated.name,
          qrToken: updated.qrToken,
          status: updated.status,
          activeOrderId: updated.activeOrderId,
        }),
      };
    });

    this.gateway.emitTableGridSync({ tableId: id });
    if (userId) {
      const oldShort = maskQrTokenForAudit(result.previousQrToken);
      const newShort = maskQrTokenForAudit(result.table.qrToken);
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Đổi mã QR bàn',
        detail: result.table.name,
        message: `đổi mã QR cho bàn "${result.table.name}"`,
        actor: userId,
        metadata: {
          tableId: result.table.id,
          tableLabel: result.table.name,
          changes: [{ field: 'Mã QR bàn', from: oldShort, to: newShort }],
        },
      });
    }
    return result.table;
  }

  async getOrder(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, name: true } },
        items: {
          orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
          include: { product: { include: { comboParents: { include: { childProduct: true } } } } },
        },
      },
    }) as OrderRow | null;
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    return this.orderDetail(order);
  }

  async approveQrOrder(id: number, input: ApproveQrOrderInput, cashierId: number) {
    const parsed = this.parseRequest(ApproveQrOrderSchema, input);
    const order = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng QR' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const current = await tx.order.findUnique({ where: { id }, include: { table: { select: { name: true } } } }) as OrderRow | null;
      if (!current) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng QR' });
      if (current.status !== 'PENDING' || current.orderSource !== 'QR_CODE') {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể duyệt đơn QR đang chờ xác nhận');
      }
      const updated = await tx.order.update({
        where: { id },
        data: parsed.approved
          ? { status: 'SERVING', cashierId }
          : { status: 'VOIDED', cashierId, voidReason: parsed.reason },
      });
      if (current.tableId !== null) {
        await tx.diningTable.update({
          where: { id: current.tableId },
          data: parsed.approved
            ? { status: 'OCCUPIED', activeOrderId: id }
            : { status: 'AVAILABLE', activeOrderId: null },
        });
      }
      return {
        order: updated as OrderRow,
        tableLabel: current.table?.name ?? (current.orderType === 'TAKEAWAY' ? `Mang về #${String(current.takeawayNumber ?? 0).padStart(2, '0')}` : null),
      };
    });
    this.gateway.emitOrderStatusUpdated(id, { status: order.order.status, message: parsed.approved ? 'Bếp đang chế biến' : 'Đơn hàng đã bị từ chối' });
    this.gateway.emitTableGridSync({ orderId: id, status: order.order.status });
    await this.auditLogService?.record({
      module: 'POS',
      action: parsed.approved ? 'Duyệt đơn QR' : 'Từ chối đơn QR',
      detail: order.order.orderCode,
      message: `${parsed.approved ? 'duyệt đơn gọi món QR' : 'từ chối đơn gọi món QR'}`,
      actor: cashierId,
      metadata: {
        orderId: id,
        orderCode: order.order.orderCode,
        ...(order.tableLabel ? { tableLabel: order.tableLabel } : {}),
        ...(!parsed.approved && parsed.reason ? { reason: parsed.reason } : {}),
      },
    });
    return { orderId: id, status: order.order.status };
  }

  async cancelOrder(id: number, input: VoidInvoiceRequest, cashierId?: number) {
    const parsed = this.parseRequest(VoidInvoiceRequestSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const current = await tx.order.findUnique({ where: { id }, include: { table: { select: { name: true } } } }) as OrderRow | null;
      if (!current) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (!['PENDING', 'SERVING'].includes(current.status)) {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể huỷ đơn hàng đang mở hoặc đang phục vụ');
      }

      await tx.orderItem.deleteMany({ where: { orderId: id, kitchenStatus: 'NEW' } });
      await tx.orderItem.updateMany({ where: { orderId: id, kitchenStatus: 'PRINTED' }, data: { kitchenStatus: 'CANCELLED' } });

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: parsed.voidReason,
          subtotalAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          discountId: null,
          discountSnapshot: Prisma.JsonNull,
          paymentAccountId: null,
          totalAmount: new Prisma.Decimal(0),
          cashierId: cashierId ?? current.cashierId,
        },
      });

      if (current.tableId !== null) {
        await tx.diningTable.update({
          where: { id: current.tableId },
          data: { status: 'AVAILABLE', activeOrderId: null },
        });
      }
      const tableLabel = current.table?.name ?? (current.orderType === 'TAKEAWAY' ? `Mang về #${String(current.takeawayNumber ?? 0).padStart(2, '0')}` : null);
      return { order: updated as OrderRow, tableId: current.tableId, tableLabel };
    });

    this.gateway.emitOrderStatusUpdated(id, { status: 'VOIDED', message: 'Đơn hàng đã được huỷ và giải phóng bàn' });
    this.gateway.emitTableGridSync({ orderId: id, tableId: result.tableId, status: 'AVAILABLE' });
    if (cashierId) {
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Huỷ đơn',
        detail: `${result.order.orderCode} (${parsed.voidReason})`,
        message: 'huỷ đơn đang phục vụ',
        actor: cashierId,
        metadata: {
          orderId: id,
          orderCode: result.order.orderCode,
          ...(result.tableLabel ? { tableLabel: result.tableLabel } : {}),
          reason: parsed.voidReason,
        },
      });
    }
    return { orderId: id, status: 'VOIDED', tableId: result.tableId };
  }

  async patchOrderItems(id: number, input: PatchOrderItemsInput, userId?: number) {
    const parsed = this.parseRequest(PatchOrderItemsSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            include: { product: { include: { comboParents: { include: { childProduct: { select: { name: true, station: true } } } } } } },
          },
        },
      }) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (!['PENDING', 'SERVING'].includes(order.status)) throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để sửa món');

      const slips: Array<{ station: 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE'; tableLabel: string; itemName: string; quantity: number }> = [];
      const itemsById = new Map((order.items ?? []).map((item) => [item.id, item]));
      const changedIds = new Set<number>();
      const tableLabel = order.table?.name ?? `Mang về #${String(order.takeawayNumber ?? 0).padStart(2, '0')}`;

      for (const itemId of parsed.removeItemIds ?? []) {
        const item = itemsById.get(itemId);
        if (!item || changedIds.has(itemId)) throw new NotFoundException({ message: 'Không tìm thấy món trong đơn hàng' });
        changedIds.add(itemId);
        if (item.kitchenStatus === 'NEW') await tx.orderItem.delete({ where: { id: itemId } });
        else if (item.kitchenStatus === 'PRINTED') {
          await tx.orderItem.update({ where: { id: itemId }, data: { kitchenStatus: 'CANCELLED' } });
          slips.push(...await this.cancellationSlips(tx, item, tableLabel));
        } else throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Món đã huỷ không thể sửa tiếp');
      }

      const replacementsByOrderItemId = new Map<number, Awaited<ReturnType<typeof this.resolveItems>>[number]>();
      for (const update of parsed.updates ?? []) {
        const item = itemsById.get(update.orderItemId);
        if (!item || changedIds.has(update.orderItemId)) throw new NotFoundException({ message: 'Không tìm thấy món trong đơn hàng' });
        changedIds.add(update.orderItemId);
        if (item.kitchenStatus === 'CANCELLED') throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Món đã huỷ không thể sửa tiếp');

        const replacementInput: CreateOrderItemInput = {
          productId: item.productId,
          quantity: update.quantity ?? item.quantity,
          modifiers: update.modifiers ?? this.modifierSelections(item.modifiersSnapshot),
          itemNote: update.itemNote === undefined ? (item.itemNote ?? undefined) : (update.itemNote ?? undefined),
        };
        const [replacement] = await this.resolveItems(tx, [replacementInput]);
        replacementsByOrderItemId.set(update.orderItemId, replacement);
        if (item.kitchenStatus === 'NEW') {
          await tx.orderItem.update({ where: { id: item.id }, data: {
            quantity: replacement.quantity,
            unitPrice: replacement.unitPrice,
            modifiersSnapshot: replacement.modifiersSnapshot,
            itemNote: replacement.itemNote,
          } });
        } else {
          await tx.orderItem.update({ where: { id: item.id }, data: { kitchenStatus: 'CANCELLED' } });
          slips.push(...await this.cancellationSlips(tx, item, tableLabel));
          const aggregate = await tx.orderItem.aggregate({ where: { orderId: id }, _max: { batchNo: true } });
          await tx.orderItem.create({ data: {
            orderId: id,
            ...replacement,
            batchNo: (aggregate._max.batchNo ?? 0) + 1,
            kitchenStatus: 'NEW',
          } });
        }
      }

      let resolvedAddedItems: Awaited<ReturnType<typeof this.resolveItems>> = [];
      if (parsed.addItems?.length) {
        resolvedAddedItems = await this.resolveItems(tx, parsed.addItems);
        const aggregate = await tx.orderItem.aggregate({ where: { orderId: id }, _max: { batchNo: true } });
        await tx.orderItem.createMany({ data: resolvedAddedItems.map((item) => ({
          orderId: id, ...item, batchNo: (aggregate._max.batchNo ?? 0) + 1, kitchenStatus: 'NEW',
        })) });
      }

      const totals = await recomputeOrderTotals(tx, id, order.discountSnapshot ?? null);
      const totalAmount = totals.totalDecimal;

      const auditChanges: Array<{ field: string; from: string; to: string }> = [];
      for (const itemId of parsed.removeItemIds ?? []) {
        const item = itemsById.get(itemId);
        if (item) {
          const itemName = (item as { product?: { name?: string } }).product?.name ?? `Món #${item.productId}`;
          const mods = this.modifierNames(item.modifiersSnapshot);
          const desc = `${item.quantity}x ${itemName}${mods.length ? ` (${mods.join(', ')})` : ''}`;
          auditChanges.push({ field: 'Xoá / huỷ món', from: desc, to: 'Đã bỏ khỏi đơn' });
        }
      }
      for (const update of parsed.updates ?? []) {
        const item = itemsById.get(update.orderItemId);
        if (item) {
          const itemName = (item as { product?: { name?: string } }).product?.name ?? `Món #${item.productId}`;
          const oldMods = this.modifierNames(item.modifiersSnapshot);
          const replacement = replacementsByOrderItemId.get(update.orderItemId);
          const nextQty = update.quantity ?? item.quantity;
          const nextMods = replacement ? this.modifierNames(replacement.modifiersSnapshot) : oldMods;
          const oldNote = item.itemNote ?? '';
          const nextNote = update.itemNote === undefined ? oldNote : (update.itemNote ?? '');
          const oldDesc = `SL ${item.quantity}${oldMods.length ? ` • ${oldMods.join(', ')}` : ''}${oldNote ? ` • "${oldNote}"` : ''}`;
          const newDesc = `SL ${nextQty}${nextMods.length ? ` • ${nextMods.join(', ')}` : ''}${nextNote ? ` • "${nextNote}"` : ''}`;
          if (oldDesc !== newDesc) {
            auditChanges.push({ field: `Sửa ${itemName}`, from: oldDesc, to: newDesc });
          }
        }
      }
      if (resolvedAddedItems.length > 0) {
        const addedIds = [...new Set(resolvedAddedItems.map((i) => i.productId))];
        const addedProducts = addedIds.length && typeof tx.product?.findMany === 'function'
          ? await tx.product.findMany({ where: { id: { in: addedIds } }, select: { id: true, name: true } })
          : [];
        const nameById = new Map((addedProducts ?? []).map((p) => [p.id, p.name]));
        for (const added of resolvedAddedItems) {
          const name = nameById.get(added.productId) ?? `Món #${added.productId}`;
          const mods = this.modifierNames(added.modifiersSnapshot);
          const desc = `${added.quantity}x ${name}${mods.length ? ` (${mods.join(', ')})` : ''}`;
          auditChanges.push({ field: 'Thêm món', from: 'Chưa có', to: desc });
        }
      }
      const prevTotalNum = Number(order.totalAmount ?? 0);
      const nextTotalNum = totalAmount.toNumber();
      if (prevTotalNum !== nextTotalNum) {
        auditChanges.push({
          field: 'Tổng tạm tính',
          from: `${prevTotalNum.toLocaleString('vi-VN')}đ`,
          to: `${nextTotalNum.toLocaleString('vi-VN')}đ`,
        });
      }

      return {
        response: PatchOrderItemsResponseSchema.parse({
          orderId: id,
          subtotalAmount: totals.subtotalAmount,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          discountWarning: totals.warningCode,
          requireCancellationSlip: slips.length > 0,
          kitchenCancellationSlips: slips,
        }),
        orderCode: order.orderCode,
        orderStatus: order.status,
        tableLabel,
        changes: auditChanges,
      };
    });

    this.gateway.emitOrderStatusUpdated?.(id, {
      orderId: id,
      status: result.orderStatus,
    });
    this.gateway.emitTableGridSync({ orderId: id, totalAmount: result.response.totalAmount });
    if (userId) {
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Điều chỉnh món',
        detail: `${result.orderCode ?? `#${id}`}`,
        message: 'điều chỉnh món trong đơn',
        actor: userId,
        metadata: {
          orderId: id,
          ...(result.orderCode ? { orderCode: result.orderCode } : {}),
          ...(result.tableLabel ? { tableLabel: result.tableLabel } : {}),
          totalAmount: result.response.totalAmount,
          ...(result.changes.length > 0 ? { changes: result.changes } : {}),
        },
      });
    }
    return result.response;
  }

  async tableAction(id: number, input: TableActionRequest, userId?: number) {
    const res = await this.tableTransferService.executeTableAction(id, input, userId);
    if (userId) {
      const tableActionLabels: Record<TableActionRequest['action'], { title: string; verb: string }> = {
        MOVE: { title: 'Chuyển bàn', verb: 'chuyển bàn' },
        MERGE: { title: 'Gộp bàn', verb: 'gộp bàn' },
        SWAP: { title: 'Đổi bàn', verb: 'đổi chỗ 2 bàn' },
      };
      const label = tableActionLabels[input.action];
      const slip = res.kitchenTransferSlip;
      const detailText = slip
        ? `từ ${slip.fromLabel} sang ${slip.toLabel} (đơn ${slip.orderCode})`
        : `cho đơn #${id} sang bàn #${input.targetTableId}`;
      await this.auditLogService?.record({
        module: 'POS',
        action: label.title,
        detail: detailText,
        message: `${label.verb} ${detailText}`,
        actor: userId,
        metadata: {
          orderId: id,
          reason: input.reason,
          ...(slip ? { orderCode: slip.orderCode, fromLabel: slip.fromLabel, toLabel: slip.toLabel } : { targetTableId: input.targetTableId }),
        },
      });
    }
    return res;
  }

  async getApplicableDiscounts(id: number) {
    const order = (await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          where: { kitchenStatus: { in: ['NEW', 'PRINTED'] } },
          include: { product: { select: { id: true, categoryId: true } } },
        },
      },
    })) as OrderRow | null;
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });

    const activeItems = (order.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED');
    const calcItems = toCalcItems(activeItems);
    const subtotalAmount = calculateOrderDiscount(calcItems, null).subtotalAmount;
    const currentDiscountSnapshot = extractDiscountSnapshot(order.discountSnapshot);
    const items = await this.discountSvc.findApplicableForOrderItems(calcItems);

    return ApplicableDiscountsResponseSchema.parse({
      subtotalAmount,
      currentDiscountSnapshot,
      items,
    });
  }

  async applyDiscount(id: number, input: ApplyPosDiscountRequest, user: AuthPrincipal) {
    const parsed = this.parseRequest(ApplyPosDiscountRequestSchema, input);
    const isManual = 'manual' in parsed;
    if (isManual) {
      const hasManualPermission = user.isSuperAdmin || Boolean(user.permissions?.pos?.manualDiscount);
      if (!hasManualPermission) {
        throw new ForbiddenException({
          code: ErrorCodes.RBAC_PERMISSION_DENIED,
          message: 'Bạn không có quyền áp dụng giảm giá thủ công trực tiếp trên đơn',
        });
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const head = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!head) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (head.tableId !== null) await this.lockTables(tx, [head.tableId]);

      const order = (await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
            include: { product: { include: { comboParents: { include: { childProduct: true } } } } },
          },
        },
      })) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (order.status !== 'SERVING') {
        throw this.conflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Chỉ có thể áp dụng giảm giá cho đơn đang phục vụ');
      }

      const activeItems = (order.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED');
      const calcItems = toCalcItems(activeItems);
      const subtotalOnly = calculateOrderDiscount(calcItems, null).subtotalAmount;
      if (activeItems.length === 0 || subtotalOnly <= 0) {
        throw this.conflict(ErrorCodes.DISCOUNT_NOT_APPLICABLE, 'Đơn hàng chưa có món hợp lệ để giảm giá');
      }

      let nextDiscountId: number | null = null;
      let nextSnapshot: DiscountSnapshot;

      if (isManual) {
        if (parsed.manual.valueType === 'FIXED' && parsed.manual.value > subtotalOnly) {
          throw new UnprocessableEntityException({
            code: ErrorCodes.VALIDATION_FAILED,
            message: 'Số tiền giảm giá thủ công không được vượt quá tổng tiền món',
          });
        }
        nextSnapshot = DiscountSnapshotSchema.parse({
          kind: 'MANUAL',
          discountId: null,
          code: null,
          name:
            parsed.manual.valueType === 'PERCENT'
              ? `Giảm tay ${parsed.manual.value}%`
              : `Giảm tay ${parsed.manual.value.toLocaleString('vi-VN')}đ`,
          valueType: parsed.manual.valueType,
          value: parsed.manual.value,
          maxDiscountAmount: null,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: null,
          appliedAt: new Date().toISOString(),
          appliedBy: user.id,
          reason: parsed.manual.reason,
        });
      } else {
        const resolved = await this.discountSvc.findValidDiscountByCodeOrId(
          tx,
          'code' in parsed ? { code: parsed.code } : { discountId: parsed.discountId },
        );
        nextDiscountId = resolved.discount.id;
        nextSnapshot = DiscountSnapshotSchema.parse({
          kind: 'CODE',
          discountId: resolved.discount.id,
          code: resolved.discount.code,
          name: resolved.discount.name,
          valueType: resolved.discount.valueType as 'PERCENT' | 'FIXED',
          value: Number(resolved.discount.value),
          maxDiscountAmount:
            resolved.discount.maxDiscountAmount !== null ? Number(resolved.discount.maxDiscountAmount) : null,
          scope: resolved.discount.scope as 'ORDER' | 'CATEGORY' | 'PRODUCT',
          targetCategoryIds: resolved.targetCategoryIds,
          targetProductIds: resolved.targetProductIds,
          minOrderAmount:
            resolved.discount.minOrderAmount !== null ? Number(resolved.discount.minOrderAmount) : null,
          appliedAt: new Date().toISOString(),
          appliedBy: user.id,
          reason: null,
        });

        const previewCalc = calculateOrderDiscount(calcItems, snapshotToCalcRule(nextSnapshot));
        if (previewCalc.warningCode === 'MIN_ORDER_NOT_MET') {
          throw this.conflict(
            ErrorCodes.DISCOUNT_NOT_APPLICABLE,
            previewCalc.warningMessage ?? 'Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã giảm giá',
          );
        }
        if (previewCalc.warningCode === 'NOT_APPLICABLE' || previewCalc.discountAmount <= 0) {
          throw this.conflict(
            ErrorCodes.DISCOUNT_NOT_APPLICABLE,
            previewCalc.warningMessage ?? 'Đơn hàng hiện không có món phù hợp để áp dụng mã giảm giá',
          );
        }
      }

      const totals = computeTotalsFromRows(activeItems, nextSnapshot);
      const updated = (await tx.order.update({
        where: { id },
        data: {
          discountId: nextDiscountId,
          discountSnapshot: nextSnapshot as unknown as Prisma.InputJsonValue,
          subtotalAmount: totals.subtotalDecimal,
          discountAmount: totals.discountDecimal,
          totalAmount: totals.totalDecimal,
        },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
            include: { product: { include: { comboParents: { include: { childProduct: true } } } } },
          },
        },
      })) as OrderRow;

      const hydrated: OrderRow = {
        ...order,
        ...updated,
        items: updated.items ?? order.items,
        table: updated.table ?? order.table,
        discountId: nextDiscountId,
        discountSnapshot: nextSnapshot,
        subtotalAmount: totals.subtotalDecimal,
        discountAmount: totals.discountDecimal,
        totalAmount: totals.totalDecimal,
      };
      return {
        detail: this.orderDetail(hydrated),
        orderCode: order.orderCode,
        tableId: order.tableId,
        snapshot: nextSnapshot,
        discountAmount: totals.discountAmount,
      };
    });

    this.gateway.emitOrderStatusUpdated?.(id, {
      orderId: id,
      status: 'SERVING',
    });
    this.gateway.emitTableGridSync({
      orderId: id,
      tableId: result.tableId,
      totalAmount: result.detail.totalAmount,
    });
    await this.auditLogService?.record({
      module: 'POS',
      action: isManual ? 'Áp giảm giá tay' : 'Áp mã giảm giá',
      detail: `${result.orderCode} (-${result.discountAmount.toLocaleString('vi-VN')}đ)${result.snapshot.code ? ` • ${result.snapshot.code}` : ''}`,
      message: isManual
        ? `áp giảm giá thủ công ${result.discountAmount.toLocaleString('vi-VN')}đ cho đơn ${result.orderCode}`
        : `áp mã giảm giá ${result.snapshot.code} (-${result.discountAmount.toLocaleString('vi-VN')}đ) cho đơn ${result.orderCode}`,
      actor: user.id,
      metadata: {
        orderId: id,
        orderCode: result.orderCode,
        discountId: result.snapshot.discountId,
        discountCode: result.snapshot.code,
        discountAmount: result.discountAmount,
        totalAmount: result.detail.totalAmount,
        ...(result.snapshot.reason ? { reason: result.snapshot.reason } : {}),
      },
    });
    return result.detail;
  }

  async removeDiscount(id: number, userId?: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const head = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!head) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (head.tableId !== null) await this.lockTables(tx, [head.tableId]);

      const order = (await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
            include: { product: { include: { comboParents: { include: { childProduct: true } } } } },
          },
        },
      })) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (order.status !== 'SERVING') {
        throw this.conflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Chỉ có thể gỡ giảm giá cho đơn đang phục vụ');
      }

      const previousSnapshot = extractDiscountSnapshot(order.discountSnapshot);
      const totals = computeTotalsFromRows(order.items ?? [], null);
      const zeroDecimal = new Prisma.Decimal(0);
      const updated = (await tx.order.update({
        where: { id },
        data: {
          discountId: null,
          discountSnapshot: Prisma.JsonNull,
          subtotalAmount: totals.subtotalDecimal,
          discountAmount: zeroDecimal,
          totalAmount: totals.totalDecimal,
        },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
            include: { product: { include: { comboParents: { include: { childProduct: true } } } } },
          },
        },
      })) as OrderRow;

      const hydrated: OrderRow = {
        ...order,
        ...updated,
        items: updated.items ?? order.items,
        table: updated.table ?? order.table,
        discountId: null,
        discountSnapshot: null,
        subtotalAmount: totals.subtotalDecimal,
        discountAmount: zeroDecimal,
        totalAmount: totals.totalDecimal,
      };
      return {
        detail: this.orderDetail(hydrated),
        orderCode: order.orderCode,
        tableId: order.tableId,
        hadDiscount: previousSnapshot !== null,
        previousCode: previousSnapshot?.code ?? null,
      };
    });

    this.gateway.emitOrderStatusUpdated?.(id, {
      orderId: id,
      status: 'SERVING',
    });
    this.gateway.emitTableGridSync({
      orderId: id,
      tableId: result.tableId,
      totalAmount: result.detail.totalAmount,
    });
    if (userId && result.hadDiscount) {
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Gỡ giảm giá',
        detail: `${result.orderCode}${result.previousCode ? ` (${result.previousCode})` : ''}`,
        message: `gỡ giảm giá khỏi đơn ${result.orderCode}`,
        actor: userId,
        metadata: {
          orderId: id,
          orderCode: result.orderCode,
          previousCode: result.previousCode,
          totalAmount: result.detail.totalAmount,
        },
      });
    }
    return result.detail;
  }

  async getProvisionalBill(id: number, userId?: number) {
    const { order, qrSelection } = await this.prisma.$transaction(async (tx) => {
      await this.lockOrders(tx, [id]);
      const found = (await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { id: true, name: true, status: true } },
          items: {
            include: { product: { select: { name: true, categoryId: true } } },
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
          },
        },
      })) as OrderRow | null;
      if (!found) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (found.status !== 'SERVING') {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể in tạm tính cho đơn đang phục vụ');
      }

      const selection = await this.qrService.selectForAmount(tx, found.totalAmount);
      await tx.order.update({
        where: { id: found.id },
        data: { paymentAccountId: selection.account.id },
      });

      return { order: found, qrSelection: selection };
    });

    await this.recordQrSelectionAudit(qrSelection, order.orderCode, order.totalAmount.toNumber(), userId);

    const tableCode = this.orderTableCode(order);
    const totals = computeTotalsFromRows(order.items ?? [], order.discountSnapshot);
    const vietQrPayload = this.qrService.buildVietQrUrl(
      qrSelection.account,
      order.totalAmount,
      order.orderCode,
      tableCode,
    );

    return ProvisionalBillResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      takeawayNumber: order.takeawayNumber,
      items: (order.items ?? [])
        .filter((item) => item.kitchenStatus !== 'CANCELLED')
        .map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
          lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
          modifiers: this.modifierNames(item.modifiersSnapshot),
          note: item.itemNote,
        })),
      subtotalAmount: order.subtotalAmount !== undefined ? order.subtotalAmount.toNumber() : totals.subtotalAmount,
      discountAmount: order.discountAmount !== undefined ? order.discountAmount.toNumber() : totals.discountAmount,
      discountSnapshot: totals.snapshot,
      discountWarning: totals.warningCode,
      totalAmount: order.totalAmount.toNumber(),
      status: 'SERVING',
      vietQrPayload,
      paymentAccount: qrSelection.brief,
      qrRotated: qrSelection.rotated,
      qrOverLimit: qrSelection.overLimit,
    });
  }

  async getSplitProvisionalBill(id: number, input: SplitProvisionalBillRequest, userId?: number) {
    const parsed = this.parseRequest(SplitProvisionalBillRequestSchema, input);
    const order = (await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, name: true, status: true } },
        items: {
          include: { product: { select: { id: true, name: true } } },
          orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
        },
      },
    })) as OrderRow | null;
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    if (order.status !== 'SERVING') {
      throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể in tạm tính tách đơn cho đơn đang phục vụ');
    }
    if (hasOrderDiscount(order)) {
      throw this.conflict(
        ErrorCodes.POS_DISCOUNT_BLOCKS_SPLIT,
        'Đơn hàng đang áp dụng giảm giá, vui lòng gỡ giảm giá trước khi tách tạm tính',
      );
    }

    const activeItems = (order.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED');
    const activeItemMap = new Map(activeItems.map((item) => [item.id, item]));
    const selectedQtyByItemId = new Map<number, number>();
    for (const sel of parsed.items) {
      const current = selectedQtyByItemId.get(sel.orderItemId) ?? 0;
      selectedQtyByItemId.set(sel.orderItemId, current + sel.quantity);
    }

    let splitTotal = new Prisma.Decimal(0);
    const billItems: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      modifiers: string[];
      note: string | null;
    }> = [];

    for (const [itemId, selectedQty] of selectedQtyByItemId.entries()) {
      const item = activeItemMap.get(itemId);
      if (!item) {
        throw new BadRequestException({ message: `Món #${itemId} không tồn tại trong đơn hoặc đã huỷ` });
      }
      if (selectedQty <= 0 || selectedQty > item.quantity) {
        throw new BadRequestException({
          message: `Số lượng tách của món "${item.product.name}" không hợp lệ (tối đa ${item.quantity})`,
        });
      }
      const lineTotal = item.unitPrice.mul(selectedQty);
      splitTotal = splitTotal.add(lineTotal);
      billItems.push({
        name: item.product.name,
        quantity: selectedQty,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: lineTotal.toNumber(),
        modifiers: this.modifierNames(item.modifiersSnapshot),
        note: item.itemNote,
      });
    }
    splitTotal = splitTotal.toDecimalPlaces(2);

    const qrSelection = await this.qrService.selectForAmount(this.prisma, splitTotal);
    await this.recordQrSelectionAudit(qrSelection, `${order.orderCode} (Tách đơn)`, splitTotal.toNumber(), userId);

    const tableCode = this.orderTableCode(order);
    const vietQrPayload = this.qrService.buildVietQrUrl(
      qrSelection.account,
      splitTotal,
      order.orderCode,
      tableCode,
    );

    return ProvisionalBillResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      takeawayNumber: order.takeawayNumber,
      items: billItems,
      subtotalAmount: splitTotal.toNumber(),
      discountAmount: 0,
      discountSnapshot: null,
      discountWarning: null,
      totalAmount: splitTotal.toNumber(),
      status: 'SERVING',
      vietQrPayload,
      paymentAccount: qrSelection.brief,
      qrRotated: qrSelection.rotated,
      qrOverLimit: qrSelection.overLimit,
    });
  }

  private async recordQrSelectionAudit(
    selection: QrSelectionResult,
    orderCode: string,
    amount: number,
    actorId?: number,
  ): Promise<void> {
    if (!selection.rotated && !selection.overLimit) return;
    const bankLabel = `${getVietQrBankShortName(selection.account.bankCode)} - ${selection.account.accountNo}`;
    const action = selection.overLimit ? 'Vượt hạn mức tất cả QR' : 'Tự động xoay vòng QR';
    await this.auditLogService?.record({
      module: 'PAYMENT_QR',
      action,
      detail: `${selection.account.label} (${bankLabel}) cho đơn ${orderCode}`,
      actor: actorId,
      metadata: {
        paymentAccountId: selection.account.id,
        label: selection.account.label,
        orderCode,
        amount,
        rotated: selection.rotated,
        overLimit: selection.overLimit,
      },
    });
  }

  async checkout(id: number, input: CheckoutOrderRequest, cashierId: number) {
    const parsed = this.parseRequest(CheckoutOrderRequestSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      const order = await tx.order.findUnique({ where: { id }, include: { table: { select: { name: true } } } }) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (order.status !== 'SERVING') throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để thanh toán');
      if (order.tableId !== null) await this.lockTables(tx, [order.tableId]);

      const appliedDiscountAmount = Number(order.discountAmount ?? 0);
      if (order.discountId !== null && order.discountId !== undefined && appliedDiscountAmount > 0) {
        await tx.$queryRaw`SELECT id FROM discounts WHERE id = ${order.discountId} ORDER BY id ASC FOR UPDATE`;
        const affectedRows = await tx.$executeRaw`
          UPDATE discounts
          SET used_count = used_count + 1, updated_at = NOW()
          WHERE id = ${order.discountId}
            AND (usage_limit IS NULL OR used_count < usage_limit)
        `;
        if (Number(affectedRows) === 0) {
          throw this.conflict(
            ErrorCodes.DISCOUNT_USAGE_EXHAUSTED,
            'Mã giảm giá đã hết lượt sử dụng trong lúc chờ thanh toán',
          );
        }
      }

      const totalCents = this.toCents(order.totalAmount);
      if (parsed.totalAmount !== undefined && this.toCents(parsed.totalAmount) !== totalCents) {
        throw this.conflict('POS_CONCURRENT_MODIFICATION', 'Tổng tiền đơn hàng đã thay đổi, vui lòng tải lại hoá đơn');
      }
      let cashCents = 0;
      let transferCents = 0;
      if (parsed.paymentMethod === 'CASH') cashCents = totalCents;
      else if (parsed.paymentMethod === 'TRANSFER') transferCents = totalCents;
      else {
        cashCents = this.toCents(parsed.cashAmount);
        transferCents = this.toCents(parsed.transferAmount);
        if (cashCents <= 0 || transferCents <= 0 || cashCents + transferCents !== totalCents) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: 'Tiền mặt và chuyển khoản phải lớn hơn 0 và cộng lại bằng tổng hoá đơn',
          });
        }
      }

      const paidAt = new Date();
      let resolvedPaymentAccountId: number | null = order.paymentAccountId ?? null;
      if (parsed.paymentMethod === 'CASH') {
        resolvedPaymentAccountId = null;
      } else if (resolvedPaymentAccountId === null) {
        const qrSelection = await this.qrService.selectForAmount(tx, this.fromCents(transferCents), paidAt);
        resolvedPaymentAccountId = qrSelection.account.id;
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          paymentMethod: parsed.paymentMethod,
          paymentAccountId: resolvedPaymentAccountId,
          cashAmount: this.fromCents(cashCents),
          transferAmount: this.fromCents(transferCents),
          paidAt,
          cashierId,
        },
      });
      if (order.tableId !== null) {
        await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE', activeOrderId: null } });
      }
      const tableLabel = order.table?.name ?? (order.orderType === 'TAKEAWAY' ? `Mang về #${String(order.takeawayNumber ?? 0).padStart(2, '0')}` : null);
      return { order: updated as OrderRow, paidAt, tableId: order.tableId, tableLabel };
    });

    const payload = { orderId: id, status: 'PAID', paidAt: result.paidAt.toISOString() };
    this.gateway.emitOrderStatusUpdated(id, payload);
    this.gateway.emitTableGridSync({ orderId: id, tableId: result.tableId, status: 'PAID' });
    const methodLabel = formatPaymentMethodVi(parsed.paymentMethod);
    const totalFormatted = `${result.order.totalAmount.toNumber().toLocaleString('vi-VN')}đ`;
    await this.auditLogService?.record({
      module: 'POS',
      action: 'Thanh toán đơn',
      detail: `${result.order.orderCode} (${methodLabel} - ${totalFormatted})`,
      message: `thanh toán đơn hàng (tổng tiền ${totalFormatted})`,
      actor: cashierId,
      metadata: {
        orderId: id,
        orderCode: result.order.orderCode,
        ...(result.tableLabel ? { tableLabel: result.tableLabel } : {}),
        paymentMethodLabel: methodLabel,
        totalAmount: result.order.totalAmount.toNumber(),
      },
    });
    return payload;
  }

  async splitCheckout(id: number, input: SplitCheckoutOrderRequest, cashierId: number) {
    const parsed = this.parseRequest(SplitCheckoutOrderRequestSchema, input);

    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({
        where: { id },
        select: { id: true, tableId: true },
      });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });

      // Invariant 5: Lock orders first, then dining_tables
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);

      const order = await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
            include: { product: { select: { id: true, name: true, station: true } } },
          },
        },
      }) as OrderRow | null;
      if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (order.status !== 'SERVING') {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể tách thanh toán cho đơn đang phục vụ');
      }
      if (hasOrderDiscount(order)) {
        throw this.conflict(
          ErrorCodes.POS_DISCOUNT_BLOCKS_SPLIT,
          'Đơn hàng đang áp dụng giảm giá, vui lòng gỡ giảm giá trước khi tách thanh toán',
        );
      }

      const activeItems = (order.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED');
      if (activeItems.length === 0) {
        throw new BadRequestException({ message: 'Đơn hàng không còn món hợp lệ để thanh toán' });
      }

      const activeItemMap = new Map(activeItems.map((item) => [item.id, item]));
      const selectedQtyByItemId = new Map<number, number>();
      for (const sel of parsed.items) {
        const current = selectedQtyByItemId.get(sel.orderItemId) ?? 0;
        selectedQtyByItemId.set(sel.orderItemId, current + sel.quantity);
      }

      let splitTotal = new Prisma.Decimal(0);
      for (const [itemId, selectedQty] of selectedQtyByItemId.entries()) {
        const item = activeItemMap.get(itemId);
        if (!item) {
          throw new BadRequestException({ message: `Món #${itemId} không tồn tại trong đơn hoặc đã huỷ` });
        }
        if (selectedQty <= 0 || selectedQty > item.quantity) {
          throw new BadRequestException({
            message: `Số lượng tách của món "${item.product.name}" không hợp lệ (tối đa ${item.quantity})`,
          });
        }
        splitTotal = splitTotal.add(item.unitPrice.mul(selectedQty));
      }
      splitTotal = splitTotal.toDecimalPlaces(2);

      const splitTotalCents = this.toCents(splitTotal);
      let cashCents = 0;
      let transferCents = 0;
      if (parsed.paymentMethod === 'CASH') {
        cashCents = splitTotalCents;
      } else if (parsed.paymentMethod === 'TRANSFER') {
        transferCents = splitTotalCents;
      } else {
        cashCents = this.toCents(parsed.cashAmount);
        transferCents = this.toCents(parsed.transferAmount);
        if (cashCents <= 0 || transferCents <= 0 || cashCents + transferCents !== splitTotalCents) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: 'Tiền mặt và chuyển khoản phải lớn hơn 0 và cộng lại bằng tổng tiền tách đơn',
          });
        }
      }

      const isFullSelection = activeItems.every(
        (item) => (selectedQtyByItemId.get(item.id) ?? 0) === item.quantity,
      );

      const paidAt = new Date();
      let resolvedPaymentAccountId: number | null = null;
      if (parsed.paymentMethod === 'TRANSFER' || parsed.paymentMethod === 'SPLIT') {
        if (parsed.paymentAccountId !== undefined) {
          const specified = await tx.paymentAccount.findUnique({ where: { id: parsed.paymentAccountId } });
          if (specified) {
            resolvedPaymentAccountId = specified.id;
          }
        }
        if (resolvedPaymentAccountId === null) {
          if (isFullSelection && order.paymentAccountId) {
            resolvedPaymentAccountId = order.paymentAccountId;
          } else {
            const qrSelection = await this.qrService.selectForAmount(tx, this.fromCents(transferCents), paidAt);
            resolvedPaymentAccountId = qrSelection.account.id;
          }
        }
      }

      if (isFullSelection) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            paymentMethod: parsed.paymentMethod,
            paymentAccountId: resolvedPaymentAccountId,
            cashAmount: this.fromCents(cashCents),
            transferAmount: this.fromCents(transferCents),
            paidAt,
            cashierId,
          },
        });
        if (order.tableId !== null) {
          await tx.diningTable.update({
            where: { id: order.tableId },
            data: { status: 'AVAILABLE', activeOrderId: null },
          });
        }
        return {
          isFullCheckout: true,
          paidOrderId: order.id,
          paidOrderCode: order.orderCode,
          remainingOrderId: null,
          remainingTotalAmount: 0,
          paidTotalAmount: splitTotal.toNumber(),
          paidAt,
          tableId: order.tableId,
          status: 'PAID' as const,
        };
      }

      const businessDay = this.businessDay(paidAt);
      await this.lockOrderSequence(tx, businessDay.key);
      const splitOrderCode = await this.nextOrderCode(tx, businessDay);
      const splitTakeawayNumber =
        order.orderType === 'TAKEAWAY' ? await this.nextTakeawayNumber(tx, businessDay) : null;

      const paidOrder = await tx.order.create({
        data: {
          orderCode: splitOrderCode,
          orderType: order.orderType as 'DINE_IN' | 'TAKEAWAY',
          orderSource: 'POS_COUNTER',
          tableId: order.orderType === 'DINE_IN' ? order.tableId : null,
          takeawayNumber: splitTakeawayNumber,
          status: 'PAID',
          paymentMethod: parsed.paymentMethod,
          paymentAccountId: resolvedPaymentAccountId,
          cashAmount: this.fromCents(cashCents),
          transferAmount: this.fromCents(transferCents),
          subtotalAmount: splitTotal,
          discountAmount: new Prisma.Decimal(0),
          totalAmount: splitTotal,
          cashierId,
          note: `Tách thanh toán từ đơn ${order.orderCode}`,
          createdAt: paidAt,
          paidAt,
        },
      });

      for (const [itemId, selectedQty] of selectedQtyByItemId.entries()) {
        const item = activeItemMap.get(itemId)!;
        if (selectedQty === item.quantity) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { orderId: paidOrder.id },
          });
        } else {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { quantity: item.quantity - selectedQty },
          });
          await tx.orderItem.create({
            data: {
              orderId: paidOrder.id,
              productId: item.productId,
              quantity: selectedQty,
              unitPrice: item.unitPrice,
              modifiersSnapshot: (item.modifiersSnapshot ?? []) as Prisma.InputJsonValue,
              itemNote: item.itemNote,
              batchNo: item.batchNo,
              ...(item.itemSource ? { itemSource: item.itemSource } : {}),
              kitchenStatus: item.kitchenStatus as 'NEW' | 'PRINTED',
            },
          });
        }
      }

      const remainingItems = await tx.orderItem.findMany({
        where: { orderId: order.id, kitchenStatus: { in: ['NEW', 'PRINTED'] } },
        select: { quantity: true, unitPrice: true },
      });
      const remainingTotal = this.totalForItems(remainingItems);
      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotalAmount: remainingTotal,
          discountAmount: new Prisma.Decimal(0),
          totalAmount: remainingTotal,
        },
      });

      return {
        isFullCheckout: false,
        paidOrderId: paidOrder.id,
        paidOrderCode: paidOrder.orderCode,
        remainingOrderId: order.id,
        remainingTotalAmount: remainingTotal.toNumber(),
        paidTotalAmount: splitTotal.toNumber(),
        paidAt,
        tableId: order.tableId,
        status: 'SERVING' as const,
      };
    });

    if (result.isFullCheckout) {
      this.gateway.emitOrderStatusUpdated(id, {
        orderId: id,
        status: 'PAID',
        paidAt: result.paidAt.toISOString(),
      });
    } else {
      this.gateway.emitOrderStatusUpdated?.(id, {
        orderId: id,
        status: 'SERVING',
      });
    }
    this.gateway.emitTableGridSync({
      orderId: id,
      tableId: result.tableId,
      status: result.status,
    });
    const splitMethodLabel = formatPaymentMethodVi(parsed.paymentMethod);
    const paidFormatted = `${result.paidTotalAmount.toLocaleString('vi-VN')}đ`;
    await this.auditLogService?.record({
      module: 'POS',
      action: 'Tách thanh toán',
      detail: `${result.paidOrderCode} (${splitMethodLabel} - ${paidFormatted})`,
      message: `tách thanh toán hoá đơn ${result.paidOrderCode} qua ${splitMethodLabel} (số tiền ${paidFormatted})`,
      actor: cashierId,
      metadata: {
        orderId: id,
        paidOrderId: result.paidOrderId,
        orderCode: result.paidOrderCode,
        paymentMethodLabel: splitMethodLabel,
        totalAmount: result.paidTotalAmount,
      },
    });

    return {
      isFullCheckout: result.isFullCheckout,
      paidOrderId: result.paidOrderId,
      paidOrderCode: result.paidOrderCode,
      remainingOrderId: result.remainingOrderId,
      remainingTotalAmount: result.remainingTotalAmount,
      paidTotalAmount: result.paidTotalAmount,
      paidAt: result.paidAt.toISOString(),
      status: result.status,
    };
  }

  async splitKitchen(id: number, userId?: number) {
    const res = await this.kitchenSplitService.splitKitchen(id, userId);
    if (userId && Array.isArray(res.tickets) && res.tickets.length > 0) {
      const orderMeta = typeof this.prisma.order?.findUnique === 'function'
        ? await this.prisma.order.findUnique({
            where: { id },
            select: { orderCode: true, orderType: true, takeawayNumber: true, table: { select: { name: true } } },
          })
        : null;
      const tableLabel =
        orderMeta?.table?.name ??
        (orderMeta?.orderType === 'TAKEAWAY'
          ? `Mang về #${String(orderMeta.takeawayNumber ?? 0).padStart(2, '0')}`
          : undefined);
      await this.auditLogService?.record({
        module: 'POS',
        action: 'Tách phiếu bếp',
        detail: `${orderMeta?.orderCode ?? `Đơn #${id}`} (${res.tickets.length} phiếu bếp)`,
        message: `gửi tách ${res.tickets.length} phiếu chế biến xuống bếp`,
        actor: userId,
        metadata: {
          orderId: id,
          ...(orderMeta?.orderCode ? { orderCode: orderMeta.orderCode } : {}),
          ...(tableLabel ? { tableLabel } : {}),
          ticketCount: res.tickets.length,
        },
      });
    }
    return res;
  }

  async reprintKitchen(id: number, options?: ReprintKitchenRequest, userId?: number) {
    return this.kitchenSplitService.reprintKitchen(id, options, userId);
  }

  private async appendItems(tx: Prisma.TransactionClient, order: OrderRow, itemInputs: CreateOrderItemInput[]) {
    const items = await this.resolveItems(tx, itemInputs);
    const aggregate = await tx.orderItem.aggregate({ where: { orderId: order.id }, _max: { batchNo: true } });
    const batchNo = (aggregate._max.batchNo ?? 0) + 1;
    const addedTotal = this.totalForItems(items);
    await tx.orderItem.createMany({
      data: items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiersSnapshot: item.modifiersSnapshot,
        itemNote: item.itemNote,
        batchNo,
        itemSource: 'QR_CODE',
        kitchenStatus: 'NEW',
      })),
    });
    const existingSnapshot = extractDiscountSnapshot(order.discountSnapshot);
    const foundRows =
      typeof tx.orderItem?.findMany === 'function'
        ? await tx.orderItem.findMany({
            where: { orderId: order.id, kitchenStatus: { in: ['NEW', 'PRINTED'] } },
            include: { product: { select: { categoryId: true } } },
          })
        : undefined;
    if (Array.isArray(foundRows)) {
      const totals = computeTotalsFromRows(foundRows, existingSnapshot);
      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotalAmount: totals.subtotalDecimal,
          discountAmount: totals.discountDecimal,
          totalAmount: totals.totalDecimal,
        },
      });
      return { batchNo, totalAmount: totals.totalAmount };
    }
    const nextSubtotal = (order.subtotalAmount ?? order.totalAmount).add(addedTotal);
    const nextTotal = order.totalAmount.add(addedTotal);
    await tx.order.update({
      where: { id: order.id },
      data: { subtotalAmount: nextSubtotal, discountAmount: new Prisma.Decimal(0), totalAmount: nextTotal },
    });
    return { batchNo, totalAmount: nextTotal.toNumber() };
  }

  private async resolveItems(tx: Prisma.TransactionClient, itemInputs: CreateOrderItemInput[]): Promise<ResolvedOrderItem[]> {
    const productIds = [...new Set(itemInputs.map(({ productId }) => productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
      include: { modifierGroups: { include: { modifiers: true } } },
    }) as PricingProduct[];
    const productsById = new Map(products.map((product) => [product.id, product]));
    if (products.length !== productIds.length) throw new NotFoundException({ message: 'Một hoặc nhiều món không tồn tại hoặc đã ngừng bán' });

    return itemInputs.map((input) => {
      const product = productsById.get(input.productId);
      if (!product) throw new NotFoundException({ message: 'Không tìm thấy sản phẩm' });
      const selectedIds = new Set<number>();
      let modifierTotal = new Prisma.Decimal(0);
      const snapshots: Array<{
        groupId: number;
        modifierId: number;
        name: string;
        extraPrice: Prisma.Decimal;
        action?: 'SELECTED' | 'REMOVED_DEFAULT' | 'SUBSTITUTED';
        substituteModifierId?: number;
        substituteName?: string;
      }> = [];
      for (const group of product.modifierGroups) {
        const selections = input.modifiers.filter((selection) => selection.groupId === group.id);
        const positiveSelections = selections.filter((selection) => !selection.action || selection.action === 'SELECTED');
        const exceptionSelections = selections.filter((selection) => selection.action === 'REMOVED_DEFAULT' || selection.action === 'SUBSTITUTED');
        const isCheckboxAutoGroup = Boolean(group.isAutoSelect || group.allowSubstitution);
        const hasImplicitRadioDefault = !isCheckboxAutoGroup && group.modifiers.some((m) => m.isDefaultChecked);

        if (
          positiveSelections.length > group.maxSelect ||
          (!isCheckboxAutoGroup && !hasImplicitRadioDefault && group.isRequired && positiveSelections.length === 0)
        ) {
          throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: `Lựa chọn món bổ sung không hợp lệ: ${group.name}` });
        }

        if (group.allowSubstitution && exceptionSelections.length >= group.modifiers.length && group.modifiers.length > 0) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: `Phải giữ lại ít nhất 1 thành phần chính trong nhóm ${group.name}`,
          });
        }

        const remainingGroupModifiers = group.modifiers.filter(
          (candidate) =>
            candidate.isAvailable !== false &&
            !exceptionSelections.some((ex) => ex.modifierId === candidate.id),
        );

        for (const selection of selections) {
          if (selectedIds.has(selection.modifierId)) throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'Không thể chọn trùng tuỳ chọn món' });
          selectedIds.add(selection.modifierId);
          const modifier = group.modifiers.find((candidate) => candidate.id === selection.modifierId);
          if (!modifier) throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: `Tuỳ chọn không thuộc nhóm ${group.name}` });

          if (selection.action !== 'REMOVED_DEFAULT' && selection.action !== 'SUBSTITUTED' && modifier.isAvailable === false) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_FAILED',
              message: `Tuỳ chọn "${modifier.name}" hiện đang tạm hết`,
            });
          }

          if (selection.action === 'REMOVED_DEFAULT') {
            snapshots.push({
              groupId: group.id,
              modifierId: modifier.id,
              name: `Không ${modifier.name}`,
              extraPrice: new Prisma.Decimal(0),
              action: 'REMOVED_DEFAULT',
            });
            continue;
          }

          if (selection.action === 'SUBSTITUTED') {
            if (selection.substituteModifierId) {
              const targetMod = group.modifiers.find((m) => m.id === selection.substituteModifierId);
              if (!targetMod || targetMod.isAvailable === false) {
                throw new UnprocessableEntityException({
                  code: 'VALIDATION_FAILED',
                  message: 'Món thay thế hiện không khả dụng hoặc tạm hết',
                });
              }
            }
            const explicitSubModifier = selection.substituteModifierId
              ? remainingGroupModifiers.find((m) => m.id === selection.substituteModifierId)
              : undefined;
            const defaultSubIsAvailable = Boolean(
              modifier.defaultSubstituteName?.trim() &&
              !group.modifiers.some(
                (m) => m.name === modifier.defaultSubstituteName?.trim() && m.isAvailable === false,
              ),
            );
            const replacementName = remainingGroupModifiers.length === 1
              ? remainingGroupModifiers[0]!.name
              : (explicitSubModifier?.name
                ?? selection.substituteName?.trim()
                ?? (defaultSubIsAvailable ? modifier.defaultSubstituteName?.trim() : undefined)
                ?? remainingGroupModifiers[0]?.name
                ?? '');
            const formattedName = replacementName
              ? `Không ${modifier.name} (Thay bằng ${replacementName})`
              : `Không ${modifier.name}`;
            snapshots.push({
              groupId: group.id,
              modifierId: modifier.id,
              name: formattedName,
              extraPrice: new Prisma.Decimal(0),
              action: 'SUBSTITUTED',
              ...(explicitSubModifier ? { substituteModifierId: explicitSubModifier.id } : {}),
              ...(replacementName ? { substituteName: replacementName } : {}),
            });
            continue;
          }

          modifierTotal = modifierTotal.add(modifier.extraPrice);
          if (modifier.isDefaultChecked && modifier.extraPrice.equals(0)) {
            continue;
          }
          snapshots.push({ groupId: group.id, modifierId: modifier.id, name: modifier.name, extraPrice: modifier.extraPrice });
        }
      }
      if (input.modifiers.some((selection) => !product.modifierGroups.some((group) => group.id === selection.groupId))) {
        throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'Nhóm tuỳ chọn không thuộc sản phẩm' });
      }
      return {
        productId: product.id,
        quantity: input.quantity,
        unitPrice: product.price.add(modifierTotal),
        modifiersSnapshot: snapshots.map((snapshot) => ({ ...snapshot, extraPrice: snapshot.extraPrice.toFixed(2) })) as unknown as Prisma.InputJsonValue,
        itemNote: input.itemNote ?? null,
      };
    });
  }

  private totalForItems(items: Array<{ unitPrice: Prisma.Decimal; quantity: number }>): Prisma.Decimal {
    return items.reduce((total, item) => total.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0)).toDecimalPlaces(2);
  }

  private createdOrderResponse(order: OrderRow, tableLabel: string | null) {
    const label = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
      ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
      : tableLabel;
    return PosOrderCreationResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      takeawayNumber: order.takeawayNumber,
      tableLabel: label,
      status: order.status,
      subtotalAmount: order.subtotalAmount !== undefined ? order.subtotalAmount.toNumber() : order.totalAmount.toNumber(),
      discountAmount: order.discountAmount !== undefined ? order.discountAmount.toNumber() : 0,
      totalAmount: order.totalAmount.toNumber(),
    });
  }

  private orderSummary(order: OrderRow, tableLabel: string | null) {
    const resolvedTableLabel = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
      ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
      : tableLabel;

    let hasUnprintedAddon: boolean | undefined;
    let unprintedAddonBatchNo: number | null | undefined;
    let pendingQrSince: string | null | undefined;
    let pendingQrKind: 'NEW' | 'ADDON' | null | undefined;

    if (order.status === 'PENDING' && order.orderSource === 'QR_CODE') {
      pendingQrKind = 'NEW';
      pendingQrSince = (order.createdAt ?? new Date(0)).toISOString();
    }

    if (order.status === 'SERVING' && Array.isArray(order.items)) {
      const newItems = order.items.filter((i) => i.kitchenStatus === 'NEW');
      // Chỉ kích hoạt gọi thêm khi có món NEW từ Lượt 2 trở đi (batchNo >= 2)
      const isAddon = newItems.length > 0 && newItems.some((i) => i.batchNo >= 2);
      if (isAddon) {
        hasUnprintedAddon = true;
        unprintedAddonBatchNo = Math.max(...newItems.map((i) => i.batchNo));
      }
      const qrAddonItems = newItems.filter((i) => i.batchNo >= 2 && i.itemSource === 'QR_CODE');
      if (qrAddonItems.length > 0) {
        pendingQrKind = 'ADDON';
        const earliestMs = Math.min(
          ...qrAddonItems.map((i) =>
            i.createdAt instanceof Date
              ? i.createdAt.getTime()
              : (order.createdAt?.getTime() ?? Date.now()),
          ),
        );
        pendingQrSince = new Date(earliestMs).toISOString();
      }
    }

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      tableId: order.tableId,
      tableLabel: resolvedTableLabel,
      takeawayNumber: order.takeawayNumber ?? null,
      status: order.status,
      subtotalAmount: order.subtotalAmount !== undefined ? order.subtotalAmount.toNumber() : order.totalAmount.toNumber(),
      discountAmount: order.discountAmount !== undefined ? order.discountAmount.toNumber() : 0,
      totalAmount: order.totalAmount.toNumber(),
      createdAt: (order.createdAt ?? new Date(0)).toISOString(),
      ...(hasUnprintedAddon !== undefined ? { hasUnprintedAddon } : {}),
      ...(unprintedAddonBatchNo !== undefined ? { unprintedAddonBatchNo } : {}),
      ...(pendingQrSince !== undefined ? { pendingQrSince } : {}),
      ...(pendingQrKind !== undefined ? { pendingQrKind } : {}),
    };
  }

  private orderDetail(order: OrderRow) {
    const tableLabel = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
      ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
      : order.table?.name ?? null;
    const totals = computeTotalsFromRows(order.items ?? [], order.discountSnapshot);
    return OrderDetailResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      orderSource: order.orderSource ?? 'POS_COUNTER',
      tableId: order.tableId,
      tableLabel,
      takeawayNumber: order.takeawayNumber ?? null,
      status: order.status,
      paymentMethod: order.paymentMethod ?? null,
      cashAmount: (order.cashAmount ?? new Prisma.Decimal(0)).toNumber(),
      transferAmount: (order.transferAmount ?? new Prisma.Decimal(0)).toNumber(),
      subtotalAmount: order.subtotalAmount !== undefined ? order.subtotalAmount.toNumber() : totals.subtotalAmount,
      discountAmount: order.discountAmount !== undefined ? order.discountAmount.toNumber() : totals.discountAmount,
      discountId: order.discountId ?? null,
      discountSnapshot: totals.snapshot,
      discountWarning: totals.warningCode,
      totalAmount: order.totalAmount.toNumber(),
      note: order.note ?? null,
      createdAt: (order.createdAt ?? new Date(0)).toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      tableTransferLogs: Array.isArray(order.tableTransferLogs) ? order.tableTransferLogs : [],
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productId: item.productId,
        categoryId: item.product.categoryId ?? null,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
        modifiers: this.modifierNames(item.modifiersSnapshot),
        itemNote: item.itemNote,
        batchNo: item.batchNo,
        kitchenStatus: item.kitchenStatus,
      })),
    });
  }

  private async cancellationSlips(
    tx: Prisma.TransactionClient,
    item: NonNullable<OrderRow['items']>[number],
    tableLabel: string,
  ): Promise<Array<{ station: 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE'; tableLabel: string; itemName: string; quantity: number }>> {
    const components = item.product.station === 'COMBO'
      ? item.product.comboParents ?? await tx.comboItem.findMany({
        where: { parentProductId: item.productId },
        include: { childProduct: { select: { name: true, station: true } } },
      })
      : [];
    if (item.product.station !== 'COMBO') {
      if (!physicalStations.has(item.product.station)) throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Món bếp chưa được gán trạm hợp lệ');
      return [{ station: item.product.station as 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE', tableLabel, itemName: item.product.name, quantity: item.quantity }];
    }
    return components.flatMap((part) => {
      const station = part.childProduct?.station;
      if (!station || !physicalStations.has(station)) return [];
      return [{
        station: station as 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE',
        tableLabel,
        itemName: part.childProduct?.name ?? item.product.name,
        quantity: item.quantity * part.quantity,
      }];
    });
  }

  private modifierSelections(value: unknown): CreateOrderItemInput['modifiers'] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('groupId' in entry) || !('modifierId' in entry)) return [];
      if (typeof entry.groupId !== 'number' || typeof entry.modifierId !== 'number') return [];
      const action = 'action' in entry && (entry.action === 'SELECTED' || entry.action === 'REMOVED_DEFAULT' || entry.action === 'SUBSTITUTED')
        ? entry.action
        : undefined;
      const substituteModifierId = 'substituteModifierId' in entry && typeof entry.substituteModifierId === 'number'
        ? entry.substituteModifierId
        : undefined;
      const substituteName = 'substituteName' in entry && typeof entry.substituteName === 'string'
        ? entry.substituteName
        : undefined;
      return [{
        groupId: entry.groupId,
        modifierId: entry.modifierId,
        ...(action ? { action } : {}),
        ...(substituteModifierId ? { substituteModifierId } : {}),
        ...(substituteName ? { substituteName } : {}),
      }];
    });
  }

  private modifierNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string') return [];
      return [entry.name];
    });
  }

  private orderTableCode(order: { table?: { name?: string | null } | null; tableId?: number | null; orderType?: string | null; takeawayNumber?: number | null }): string {
    if (order.orderType === 'TAKEAWAY' || order.takeawayNumber) {
      return `MV${String(order.takeawayNumber ?? 1).padStart(2, '0')}`;
    }
    if (order.table?.name) {
      const digits = order.table.name.match(/\d+/);
      if (digits) return `B${digits[0].padStart(2, '0')}`;
      return order.table.name.replace(/\s+/g, '').toUpperCase();
    }
    if (order.tableId) {
      return `B${String(order.tableId).padStart(2, '0')}`;
    }
    return '';
  }

  private toCents(amount: Prisma.Decimal | number): number {
    return new Prisma.Decimal(amount).mul(100).toDecimalPlaces(0).toNumber();
  }

  private fromCents(cents: number): Prisma.Decimal {
    return new Prisma.Decimal(cents).div(100).toDecimalPlaces(2);
  }

  private businessDay(now: Date): { key: string; start: Date; end: Date } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
    const key = `${part('year')}${part('month')}${part('day')}`;
    const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000+07:00`);
    return { key, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

  private async lockOrderSequence(tx: Prisma.TransactionClient, businessDate: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fnb-pos-order-sequence:${businessDate}`}))`;
  }

  private async nextOrderCode(tx: Prisma.TransactionClient, day: { key: string; start: Date; end: Date }): Promise<string> {
    const lastOrder = await tx.order.findFirst({
      where: { createdAt: { gte: day.start, lt: day.end }, orderCode: { startsWith: `HD-${day.key}-` } },
      orderBy: { orderCode: 'desc' },
      select: { orderCode: true },
    });
    const sequence = lastOrder ? Number(lastOrder.orderCode.slice(-4)) + 1 : 1;
    if (!Number.isSafeInteger(sequence) || sequence > 9999) throw new ConflictException({ message: 'Đã vượt giới hạn mã hoá đơn trong ngày' });
    return `HD-${day.key}-${String(sequence).padStart(4, '0')}`;
  }

  private async nextTakeawayNumber(tx: Prisma.TransactionClient, day: { start: Date; end: Date }): Promise<number> {
    const aggregate = await tx.order.aggregate({
      where: { orderType: 'TAKEAWAY', createdAt: { gte: day.start, lt: day.end } },
      _max: { takeawayNumber: true },
    });
    return (aggregate._max.takeawayNumber ?? 0) + 1;
  }

  private async lockOrders(tx: Prisma.TransactionClient, orderIds: number[]): Promise<void> {
    const ids = [...new Set(orderIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM orders WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
  }

  private async lockTables(tx: Prisma.TransactionClient, tableIds: number[]): Promise<void> {
    const ids = [...new Set(tableIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM dining_tables WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
  }

  private parseRequest<T>(schema: ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        details: { fieldErrors: parsed.error.flatten() },
      });
    }
    return parsed.data;
  }

  private isQrOrderAccessibleFromTable(
    order: { id: number; tableId: number | null; tableTransferLogs?: unknown },
    qrTable: { id: number; name: string; activeOrderId: number | null },
  ): boolean {
    if (order.id === qrTable.activeOrderId || order.tableId === qrTable.id) {
      return true;
    }
    if (!Array.isArray(order.tableTransferLogs)) {
      return false;
    }
    return order.tableTransferLogs.some(
      (entry) =>
        typeof entry === 'object'
        && entry !== null
        && (entry as { fromTable?: unknown }).fromTable === qrTable.name,
    );
  }

  private async createTakeawayQrOrderTx(
    tx: Prisma.TransactionClient,
    parsed: CreateQrOrderInput,
  ): Promise<{ kind: 'new' | 'addon'; response: ReturnType<typeof QrOrderResponseSchema.parse>; payload: unknown }> {
    if (parsed.activeOrderId !== undefined) {
      await this.lockOrders(tx, [parsed.activeOrderId]);
      const target = await tx.order.findUnique({ where: { id: parsed.activeOrderId } }) as OrderRow | null;
      if (!target) {
        throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng Mang về' });
      }
      if (
        target.orderType !== 'TAKEAWAY' ||
        target.orderSource !== 'QR_CODE' ||
        !verifyTakeawayGuestSessionToken(parsed.guestSessionToken, target.id, target.orderCode)
      ) {
        throw new ForbiddenException({ message: 'Phiên đơn mang về không hợp lệ' });
      }
      if (!['PENDING', 'SERVING'].includes(target.status)) {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để gọi thêm món');
      }
      const takeawayLabel = `Mang về #${String(target.takeawayNumber ?? 1).padStart(2, '0')}`;
      const addon = await this.appendItems(tx, target, parsed.items);
      const guestSessionToken = signTakeawayGuestSessionToken(target.id, target.orderCode);
      const response = QrOrderResponseSchema.parse({
        orderId: target.id,
        activeOrderId: target.id,
        orderCode: target.orderCode,
        orderType: 'TAKEAWAY',
        takeawayNumber: target.takeawayNumber,
        guestSessionToken,
        currentTableLabel: takeawayLabel,
        status: target.status,
        batchNo: addon.batchNo,
        totalAmount: addon.totalAmount,
      });
      return {
        kind: 'addon',
        response,
        payload: {
          orderId: target.id,
          tableId: null,
          tableLabel: takeawayLabel,
          batchNo: addon.batchNo,
          totalAmount: addon.totalAmount,
        },
      };
    }

    const now = new Date();
    const businessDay = this.businessDay(now);
    await this.lockOrderSequence(tx, businessDay.key);
    const orderCode = await this.nextOrderCode(tx, businessDay);
    const takeawayNumber = await this.nextTakeawayNumber(tx, businessDay);
    const items = await this.resolveItems(tx, parsed.items);
    const totalAmount = this.totalForItems(items);
    const formattedNote = formatTakeawayCustomerNote({
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      note: parsed.note,
    });
    const order = await tx.order.create({
      data: {
        orderCode,
        orderType: 'TAKEAWAY',
        orderSource: 'QR_CODE',
        tableId: null,
        takeawayNumber,
        status: 'PENDING',
        note: formattedNote,
        subtotalAmount: totalAmount,
        discountAmount: new Prisma.Decimal(0),
        totalAmount,
        createdAt: now,
        items: { create: items.map((item) => ({ ...item, batchNo: 1, itemSource: 'QR_CODE' })) },
      },
    });
    const takeawayLabel = `Mang về #${String(takeawayNumber).padStart(2, '0')}`;
    const guestSessionToken = signTakeawayGuestSessionToken(order.id, orderCode);
    const response = QrOrderResponseSchema.parse({
      orderId: order.id,
      activeOrderId: order.id,
      orderCode,
      orderType: 'TAKEAWAY',
      takeawayNumber,
      guestSessionToken,
      currentTableLabel: takeawayLabel,
      status: 'PENDING',
      batchNo: 1,
      totalAmount: totalAmount.toNumber(),
    });
    return {
      kind: 'new',
      response,
      payload: {
        orderId: order.id,
        activeOrderId: order.id,
        orderCode,
        orderType: 'TAKEAWAY',
        takeawayNumber,
        currentTableLabel: takeawayLabel,
        status: 'PENDING',
        batchNo: 1,
        totalAmount: totalAmount.toNumber(),
        tableId: null,
        tableLabel: takeawayLabel,
        pendingQrSince: now.toISOString(),
      },
    };
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }
}
