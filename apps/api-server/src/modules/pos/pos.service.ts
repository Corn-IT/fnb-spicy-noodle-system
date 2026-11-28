import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  CancelOrderResponseSchema,
  CreatePosOrderSchema,
  ErrorCodes,
  PatchOrderItemsResponseSchema,
  PatchOrderItemsSchema,
  VoidInvoiceRequestSchema,
  type ApplyPosDiscountRequest,
  type ApproveQrOrderInput,
  type AuthPrincipal,
  type CheckoutOrderRequest,
  type CreateDiningTableInput,
  type CreateOrderItemInput,
  type CreatePosDraftRequest,
  type CreatePosOrderInput,
  type CreateQrOrderInput,
  type PatchOrderItemsInput,
  type QrOrderResponse,
  type ReprintKitchenRequest,
  type SplitCheckoutOrderRequest,
  type SplitProvisionalBillRequest,
  type SubmitPosDraftRequest,
  type TableActionRequest,
  type UpdateDiningTableInput,
  type UpdatePosDraftRequest,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import type { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import {
  formatOrderTakeawayLabel,
  resolveStoreTakeawayLabelFormat,
} from '../../common/utils/takeaway-format.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import { DiscountsService } from '../discounts/discounts.service';
import { PaymentQrService } from '../payment-qr/payment-qr.service';
import { KitchenSplitService } from './kitchen-split.service';
import { recomputeOrderTotals } from './order-totals.helper';
import { TableTransferService } from './table-transfer.service';
import { allocateTakeawayNumber } from './takeaway-sequence.helper';
import { WebPushService } from './web-push.service';
import {
  applyDiscountHelper,
  checkoutHelper,
  getApplicableDiscountsHelper,
  getProvisionalBillHelper,
  getSplitProvisionalBillHelper,
  removeDiscountHelper,
  splitCheckoutHelper,
} from './helpers/pos-billing.helper';
import {
  createPosDraftHelper,
  deletePosDraftHelper,
  listPosDraftsHelper,
  submitPosDraftHelper,
  updatePosDraftHelper,
} from './helpers/pos-drafts.helper';
import {
  checkQrOrderStillPendingHelper,
  createQrOrderHelper,
} from './helpers/pos-qr.helper';
import {
  businessDay,
  cancellationSlips,
  createdOrderResponse,
  lockOrderSequence,
  lockOrders,
  lockTables,
  modifierNames,
  modifierSelections,
  nextOrderCode,
  orderDetail,
  parseRequest,
  posConflict,
  resolveOrderItems,
  totalForItems,
  type OrderRow,
  type PosRuntimeDeps,
} from './helpers/pos-shared.helper';
import {
  approveQrOrderHelper,
  createTableHelper,
  deleteTableHelper,
  getTableGridHelper,
  rotateTableQrHelper,
  rotateTakeawayQrHelper,
  shortenLegacyQrTokensHelper,
  updateTableHelper,
} from './helpers/pos-tables.helper';

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
    @Optional() @Inject(WebPushService) private readonly webPushService?: WebPushService,
  ) {}

  private get qrService(): PaymentQrService {
    return this.paymentQrService ?? new PaymentQrService(this.prisma, this.auditLogService);
  }

  private get discountSvc(): DiscountsService {
    return this.discountsService ?? new DiscountsService(this.prisma, this.auditLogService);
  }

  private get deps(): PosRuntimeDeps {
    return {
      prisma: this.prisma,
      gateway: this.gateway,
      auditLogService: this.auditLogService,
      webPushService: this.webPushService,
      getQrService: () => this.qrService,
      getDiscountSvc: () => this.discountSvc,
    };
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
        ? await allocateTakeawayNumber(tx, now)
        : null;
      const takeawayLabelFormat = parsed.orderType === 'TAKEAWAY'
        ? await resolveStoreTakeawayLabelFormat(tx)
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
          takeawayLabelFormat,
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

  async listPosDrafts() {
    return listPosDraftsHelper(this.deps);
  }

  async createPosDraft(input: CreatePosDraftRequest, userId: number) {
    return createPosDraftHelper(this.deps, input, userId);
  }

  async updatePosDraft(id: string, input: UpdatePosDraftRequest, userId: number) {
    return updatePosDraftHelper(this.deps, id, input, userId);
  }

  async deletePosDraft(id: string, expectedRevision: number, userId: number) {
    return deletePosDraftHelper(this.deps, id, expectedRevision, userId);
  }

  async submitPosDraft(id: string, input: SubmitPosDraftRequest, cashierId: number) {
    return submitPosDraftHelper(this.deps, id, input, cashierId);
  }

  async createQrOrder(input: CreateQrOrderInput): Promise<QrOrderResponse> {
    return createQrOrderHelper(this.deps, input);
  }

  async checkQrOrderStillPending(input: {
    orderId: number;
    kind?: string;
    batchNo?: number;
  }): Promise<{ stillPending: boolean }> {
    return checkQrOrderStillPendingHelper(this.deps, input);
  }

  async getTableGrid() {
    return getTableGridHelper(this.deps);
  }

  async rotateTakeawayQr(userId?: number) {
    return rotateTakeawayQrHelper(this.deps, userId);
  }

  async shortenLegacyQrTokens(userId?: number) {
    return shortenLegacyQrTokensHelper(this.deps, userId);
  }

  async createTable(input: CreateDiningTableInput, userId?: number) {
    return createTableHelper(this.deps, input, userId);
  }

  async updateTable(id: number, input: UpdateDiningTableInput, userId?: number) {
    return updateTableHelper(this.deps, id, input, userId);
  }

  async deleteTable(id: number, userId?: number) {
    return deleteTableHelper(this.deps, id, userId);
  }

  async rotateTableQr(id: number, userId?: number) {
    return rotateTableQrHelper(this.deps, id, userId);
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
    return approveQrOrderHelper(this.deps, id, input, cashierId);
  }

  async cancelOrder(id: number, input: VoidInvoiceRequest, cashierId?: number) {
    const parsed = this.parseRequest(VoidInvoiceRequestSchema, input);
    const result = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
      if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      await this.lockOrders(tx, [id]);
      if (snapshot.tableId !== null) await this.lockTables(tx, [snapshot.tableId]);
      const current = await tx.order.findUnique({
        where: { id },
        include: {
          table: { select: { name: true } },
          items: {
            where: { kitchenStatus: 'PRINTED' },
            include: {
              product: {
                include: {
                  comboParents: {
                    include: { childProduct: { select: { name: true, station: true } } },
                  },
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      }) as OrderRow | null;
      if (!current) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (!['PENDING', 'SERVING'].includes(current.status)) {
        throw this.conflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể huỷ đơn hàng đang mở hoặc đang phục vụ');
      }

      const tableLabel = current.table?.name ?? (current.orderType === 'TAKEAWAY' ? formatOrderTakeawayLabel(current.takeawayNumber, current.takeawayLabelFormat) : null);
      const slipLabel = tableLabel ?? `Đơn #${current.orderCode}`;
      const kitchenCancellationSlips: Array<{ station: 'BEP_NAU' | 'BEP_CHIEN' | 'PHA_CHE'; tableLabel: string; itemName: string; quantity: number }> = [];
      for (const printedItem of current.items ?? []) {
        const itemSlips = await this.cancellationSlips(tx, printedItem, slipLabel);
        kitchenCancellationSlips.push(...itemSlips);
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
      return { order: updated as OrderRow, tableId: current.tableId, tableLabel, kitchenCancellationSlips };
    });

    this.gateway.emitOrderStatusUpdated(id, {
      status: 'VOIDED',
      message: 'Đơn hàng đã được huỷ và giải phóng bàn',
      ...(parsed.voidReason ? { reason: parsed.voidReason } : {}),
    });
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
    return CancelOrderResponseSchema.parse({
      orderId: id,
      status: 'VOIDED',
      tableId: result.tableId,
      requireCancellationSlip: result.kitchenCancellationSlips.length > 0,
      kitchenCancellationSlips: result.kitchenCancellationSlips,
    });
  }

  /** Khoá so sánh 2 dòng món có thể gộp: cùng món, giá (đã gồm tuỳ chọn), ghi chú, cờ mang về và tuỳ chọn. */
  private orderItemMergeKey(item: {
    productId: number;
    unitPrice: Prisma.Decimal | number | string;
    itemNote?: string | null;
    isTakeaway?: boolean;
    modifiersSnapshot: unknown;
  }): string {
    const modifiers = Array.isArray(item.modifiersSnapshot) ? item.modifiersSnapshot : [];
    const normalized = modifiers
      .map((raw) => {
        const m = (raw ?? {}) as { groupId?: unknown; modifierId?: unknown; action?: unknown; substituteModifierId?: unknown };
        return [m.groupId ?? null, m.modifierId ?? null, m.action ?? 'SELECTED', m.substituteModifierId ?? null];
      })
      .map((entry) => JSON.stringify(entry))
      .sort();
    return JSON.stringify([
      item.productId,
      new Prisma.Decimal(item.unitPrice).toFixed(2),
      (item.itemNote ?? '').trim(),
      Boolean(item.isTakeaway),
      normalized,
    ]);
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
      const tableLabel = order.table?.name ?? formatOrderTakeawayLabel(order.takeawayNumber, order.takeawayLabelFormat);

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
        if (update.expectedKitchenStatus === 'NEW' && item.kitchenStatus !== 'NEW') {
          throw this.conflict(
            ErrorCodes.POS_ITEM_ALREADY_PRINTED,
            'Món này vừa được tách xuống bếp, không thể sửa trực tiếp tuỳ chọn nữa',
          );
        }

        const isOnlyTakeawayToggle =
          update.isTakeaway !== undefined &&
          update.quantity === undefined &&
          update.modifiers === undefined &&
          update.itemNote === undefined;

        if (isOnlyTakeawayToggle) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { isTakeaway: Boolean(update.isTakeaway) },
          });
          continue;
        }

        const replacementInput: CreateOrderItemInput = {
          productId: item.productId,
          quantity: update.quantity ?? item.quantity,
          modifiers: update.modifiers ?? this.modifierSelections(item.modifiersSnapshot),
          itemNote: update.itemNote === undefined ? (item.itemNote ?? undefined) : (update.itemNote ?? undefined),
          isTakeaway: update.isTakeaway ?? item.isTakeaway ?? false,
        };
        const [replacement] = await this.resolveItems(tx, [replacementInput]);
        replacementsByOrderItemId.set(update.orderItemId, replacement);
        if (item.kitchenStatus === 'NEW') {
          await tx.orderItem.update({ where: { id: item.id }, data: {
            quantity: replacement.quantity,
            unitPrice: replacement.unitPrice,
            modifiersSnapshot: replacement.modifiersSnapshot,
            itemNote: replacement.itemNote,
            ...(update.isTakeaway !== undefined ? { isTakeaway: replacement.isTakeaway } : {}),
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
        // Gọi trùng món (cùng món, tuỳ chọn, ghi chú và giá hiện hành) thì cộng dồn vào dòng CHƯA gửi
        // bếp do quầy thêm, thay vì tạo dòng mới. Làm trong giao dịch đã khoá đơn nên luôn cộng trên số
        // lượng mới nhất: nhiều máy cùng chạm cũng không mất món. Món đã in bếp / khách gọi qua QR
        // đang chờ duyệt vẫn tách dòng để phiếu bếp và cảnh báo QR đúng.
        const mergeableByKey = new Map<string, { id: number }>();
        for (const item of order.items ?? []) {
          const source = (item as { itemSource?: string | null }).itemSource ?? 'POS_COUNTER';
          if (item.kitchenStatus !== 'NEW' || source !== 'POS_COUNTER' || changedIds.has(item.id)) continue;
          const key = this.orderItemMergeKey(item);
          if (!mergeableByKey.has(key)) mergeableByKey.set(key, item);
        }
        const itemsToCreate: typeof resolvedAddedItems = [];
        const pendingByKey = new Map<string, (typeof resolvedAddedItems)[number]>();
        for (const added of resolvedAddedItems) {
          const key = this.orderItemMergeKey(added);
          const existing = mergeableByKey.get(key);
          if (existing) {
            await tx.orderItem.update({ where: { id: existing.id }, data: { quantity: { increment: added.quantity } } });
            continue;
          }
          const pending = pendingByKey.get(key);
          if (pending) {
            pending.quantity += added.quantity;
            continue;
          }
          const copy = { ...added };
          pendingByKey.set(key, copy);
          itemsToCreate.push(copy);
        }
        if (itemsToCreate.length > 0) {
          const aggregate = await tx.orderItem.aggregate({ where: { orderId: id }, _max: { batchNo: true } });
          await tx.orderItem.createMany({ data: itemsToCreate.map((item) => ({
            orderId: id, ...item, batchNo: (aggregate._max.batchNo ?? 0) + 1, kitchenStatus: 'NEW',
          })) });
        }
      }

      const totals = await recomputeOrderTotals(tx, id, order.discountSnapshot ?? null);
      const totalAmount = totals.totalDecimal;

      const auditChanges: Array<{ field: string; from: string; to: string }> = [];
      const cancelledItems: Array<{ name: string; quantity: number }> = [];
      for (const itemId of parsed.removeItemIds ?? []) {
        const item = itemsById.get(itemId);
        if (item) {
          const itemName = (item as { product?: { name?: string } }).product?.name ?? `Món #${item.productId}`;
          const mods = this.modifierNames(item.modifiersSnapshot);
          const desc = `${item.quantity}x ${itemName}${mods.length ? ` (${mods.join(', ')})` : ''}`;
          auditChanges.push({ field: 'Xoá / huỷ món', from: desc, to: 'Đã bỏ khỏi đơn' });
          cancelledItems.push({ name: itemName, quantity: item.quantity });
        }
      }
      for (const update of parsed.updates ?? []) {
        const item = itemsById.get(update.orderItemId);
        if (item) {
          const itemName = (item as { product?: { name?: string } }).product?.name ?? `Món #${item.productId}`;
          const oldMods = this.modifierNames(item.modifiersSnapshot);
          const replacement = replacementsByOrderItemId.get(update.orderItemId);
          const nextQty = update.quantity ?? item.quantity;
          if (nextQty < item.quantity) {
            cancelledItems.push({ name: itemName, quantity: item.quantity - nextQty });
          }
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
        tableId: order.tableId,
        tableLabel,
        changes: auditChanges,
        cancelledItems,
      };
    });

    this.gateway.emitOrderStatusUpdated?.(id, {
      orderId: id,
      status: result.orderStatus,
    });
    this.gateway.emitQrOrderNotice?.(id, {
      orderId: id,
      tableId: result.tableId,
      kind: 'ITEMS_UPDATED',
      totalAmount: result.response.totalAmount,
      ...(result.cancelledItems.length > 0 ? { cancelledItems: result.cancelledItems } : {}),
      timestamp: new Date().toISOString(),
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
        TO_TAKEAWAY: { title: 'Chuyển sang Mang về', verb: 'chuyển đơn sang Mang về' },
      };
      const label = tableActionLabels[input.action];
      const slip = res.kitchenTransferSlip;
      const detailText = slip
        ? `từ ${slip.fromLabel} sang ${slip.toLabel} (đơn ${slip.orderCode})`
        : input.action === 'TO_TAKEAWAY'
          ? `cho đơn #${id} sang ${formatOrderTakeawayLabel(res.takeawayNumber, res.takeawayLabelFormat)}`
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
          ...(slip ? { orderCode: slip.orderCode, fromLabel: slip.fromLabel, toLabel: slip.toLabel } : { targetTableId: input.targetTableId ?? null }),
        },
      });
    }
    return res;
  }

  async getApplicableDiscounts(id: number) {
    return getApplicableDiscountsHelper(this.deps, id);
  }

  async applyDiscount(id: number, input: ApplyPosDiscountRequest, user: AuthPrincipal) {
    return applyDiscountHelper(this.deps, id, input, user);
  }

  async removeDiscount(id: number, userId?: number) {
    return removeDiscountHelper(this.deps, id, userId);
  }

  async getProvisionalBill(id: number, userId?: number) {
    return getProvisionalBillHelper(this.deps, id, userId);
  }

  async getSplitProvisionalBill(id: number, input: SplitProvisionalBillRequest, userId?: number) {
    return getSplitProvisionalBillHelper(this.deps, id, input, userId);
  }

  async checkout(id: number, input: CheckoutOrderRequest, cashierId: number) {
    return checkoutHelper(this.deps, id, input, cashierId);
  }

  async splitCheckout(id: number, input: SplitCheckoutOrderRequest, cashierId: number) {
    return splitCheckoutHelper(this.deps, id, input, cashierId);
  }

  async splitKitchen(id: number, userId?: number) {
    const res = await this.kitchenSplitService.splitKitchen(id, userId);
    if (userId && Array.isArray(res.tickets) && res.tickets.length > 0) {
      const orderMeta = typeof this.prisma.order?.findUnique === 'function'
        ? await this.prisma.order.findUnique({
            where: { id },
            select: { orderCode: true, orderType: true, takeawayNumber: true, takeawayLabelFormat: true, table: { select: { name: true } } },
          })
        : null;
      const tableLabel =
        orderMeta?.table?.name ??
        (orderMeta?.orderType === 'TAKEAWAY'
          ? formatOrderTakeawayLabel(orderMeta.takeawayNumber, orderMeta.takeawayLabelFormat)
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

  private readonly resolveItems = resolveOrderItems;
  private readonly totalForItems = totalForItems;
  private readonly createdOrderResponse = createdOrderResponse;
  private readonly orderDetail = orderDetail;
  private readonly cancellationSlips = cancellationSlips;
  private readonly modifierSelections = modifierSelections;
  private readonly modifierNames = modifierNames;
  private readonly businessDay = businessDay;
  private readonly lockOrderSequence = lockOrderSequence;
  private readonly nextOrderCode = nextOrderCode;
  private readonly lockOrders = lockOrders;
  private readonly lockTables = lockTables;
  private readonly parseRequest = parseRequest;
  private readonly conflict = posConflict;
}
