import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OrderDetailResponseSchema,
  PosOrderCreationResponseSchema,
  filterAllowedSubstituteModifiers,
  formatTakeawayShortCode,
  isSubstituteTargetAllowed,
  parseAllowedSubstituteNamesFromJson,
  type CreateOrderItemInput,
} from '@fnb/shared';
import type { ZodType } from 'zod';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  formatOrderTakeawayLabel,
  normalizeTakeawayLabelFormat,
} from '../../../common/utils/takeaway-format.util';
import { PosSocketGateway } from '../../../gateways/pos-socket.gateway';
import { DiscountsService } from '../../discounts/discounts.service';
import { PaymentQrService } from '../../payment-qr/payment-qr.service';
import {
  computeTotalsFromRows,
  extractDiscountSnapshot,
} from '../order-totals.helper';
import { WebPushService } from '../web-push.service';

export type PricingModifier = {
  id: number;
  name: string;
  extraPrice: Prisma.Decimal;
  isDefaultChecked?: boolean;
  isAvailable?: boolean;
  defaultSubstituteName?: string | null;
  allowedSubstituteNames?: Prisma.JsonValue | null;
};

export type PricingGroup = {
  id: number;
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect?: boolean;
  allowSubstitution?: boolean;
  modifiers: PricingModifier[];
};

export type PricingProduct = {
  id: number;
  name: string;
  price: Prisma.Decimal;
  station: string;
  isAvailable: boolean;
  modifierGroups: PricingGroup[];
};

export type ResolvedOrderItem = {
  productId: number;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersSnapshot: Prisma.InputJsonValue;
  itemNote: string | null;
  isTakeaway: boolean;
};

export type OrderRow = {
  id: number;
  orderCode: string;
  orderType: string;
  orderSource?: string;
  tableId: number | null;
  takeawayNumber: number | null;
  takeawayLabelFormat?: string | null;
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
    isTakeaway?: boolean;
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

export interface PosRuntimeDeps {
  prisma: PrismaService;
  gateway: PosSocketGateway;
  auditLogService?: AuditLogService;
  webPushService?: WebPushService;
  getQrService: () => PaymentQrService;
  getDiscountSvc: () => DiscountsService;
}

export const physicalStations = new Set(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']);

export class RetryQrOrderWithActiveSession extends Error {
  constructor(readonly activeOrderId: number) {
    super('Retry QR order after discovering an active table session');
  }
}

export function posConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

export function parseRequest<T>(schema: ZodType<T>, input: unknown): T {
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

export function toCents(amount: Prisma.Decimal | number): number {
  return new Prisma.Decimal(amount).mul(100).toDecimalPlaces(0).toNumber();
}

export function fromCents(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).div(100).toDecimalPlaces(2);
}

export function businessDay(now: Date): { key: string; start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  const key = `${part('year')}${part('month')}${part('day')}`;
  const start = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000+07:00`);
  return { key, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function lockOrderSequence(tx: Prisma.TransactionClient, businessDate: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fnb-pos-order-sequence:${businessDate}`}))`;
}

export async function nextOrderCode(tx: Prisma.TransactionClient, day: { key: string; start: Date; end: Date }): Promise<string> {
  const lastOrder = await tx.order.findFirst({
    where: { createdAt: { gte: day.start, lt: day.end }, orderCode: { startsWith: `HD-${day.key}-` } },
    orderBy: { orderCode: 'desc' },
    select: { orderCode: true },
  });
  const sequence = lastOrder ? Number(lastOrder.orderCode.slice(-4)) + 1 : 1;
  if (!Number.isSafeInteger(sequence) || sequence > 9999) throw new ConflictException({ message: 'Đã vượt giới hạn mã hoá đơn trong ngày' });
  return `HD-${day.key}-${String(sequence).padStart(4, '0')}`;
}

export async function lockOrders(tx: Prisma.TransactionClient, orderIds: number[]): Promise<void> {
  const ids = [...new Set(orderIds)].sort((left, right) => left - right);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM orders WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
}

export async function lockTables(tx: Prisma.TransactionClient, tableIds: number[]): Promise<void> {
  const ids = [...new Set(tableIds)].sort((left, right) => left - right);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM dining_tables WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
}

export function totalForItems(items: Array<{ unitPrice: Prisma.Decimal; quantity: number }>): Prisma.Decimal {
  return items.reduce((total, item) => total.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0)).toDecimalPlaces(2);
}

export function modifierSelections(value: unknown): CreateOrderItemInput['modifiers'] {
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

export function modifierNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string') return [];
    return [entry.name];
  });
}

export function pricedModifierNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string') return [];
    const extra = 'extraPrice' in entry ? Number((entry as { extraPrice?: unknown }).extraPrice) : 0;
    return Number.isFinite(extra) && extra > 0 ? [entry.name] : [];
  });
}

export function orderTableCode(order: { table?: { name?: string | null } | null; tableId?: number | null; orderType?: string | null; takeawayNumber?: number | null; takeawayLabelFormat?: string | null }): string {
  if (order.orderType === 'TAKEAWAY' || order.takeawayNumber) {
    return formatTakeawayShortCode(order.takeawayNumber, normalizeTakeawayLabelFormat(order.takeawayLabelFormat));
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

export function createdOrderResponse(order: OrderRow, tableLabel: string | null) {
  const takeawayLabelFormat = order.orderType === 'TAKEAWAY'
    ? (normalizeTakeawayLabelFormat(order.takeawayLabelFormat) ?? 'NUMBER')
    : null;
  const label = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
    ? formatOrderTakeawayLabel(order.takeawayNumber, takeawayLabelFormat)
    : tableLabel;
  return PosOrderCreationResponseSchema.parse({
    orderId: order.id,
    orderCode: order.orderCode,
    orderType: order.orderType,
    tableId: order.tableId,
    takeawayNumber: order.takeawayNumber,
    takeawayLabelFormat,
    tableLabel: label,
    status: order.status,
    subtotalAmount: order.subtotalAmount !== undefined ? order.subtotalAmount.toNumber() : order.totalAmount.toNumber(),
    discountAmount: order.discountAmount !== undefined ? order.discountAmount.toNumber() : 0,
    totalAmount: order.totalAmount.toNumber(),
  });
}

export function orderSummary(order: OrderRow, tableLabel: string | null) {
  const takeawayLabelFormat = order.orderType === 'TAKEAWAY'
    ? (normalizeTakeawayLabelFormat(order.takeawayLabelFormat) ?? 'NUMBER')
    : null;
  const resolvedTableLabel = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
    ? formatOrderTakeawayLabel(order.takeawayNumber, takeawayLabelFormat)
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
    takeawayLabelFormat,
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

export function orderDetail(order: OrderRow) {
  const takeawayLabelFormat = order.orderType === 'TAKEAWAY'
    ? (normalizeTakeawayLabelFormat(order.takeawayLabelFormat) ?? 'NUMBER')
    : null;
  const tableLabel = order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
    ? formatOrderTakeawayLabel(order.takeawayNumber, takeawayLabelFormat)
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
    takeawayLabelFormat,
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
      modifiers: modifierNames(item.modifiersSnapshot),
      pricedModifiers: pricedModifierNames(item.modifiersSnapshot),
      modifierSelections: modifierSelections(item.modifiersSnapshot),
      itemNote: item.itemNote,
      batchNo: item.batchNo,
      kitchenStatus: item.kitchenStatus,
      ...(item.isTakeaway ? { isTakeaway: true } : {}),
    })),
  });
}

export async function cancellationSlips(
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
    if (!physicalStations.has(item.product.station)) throw posConflict('POS_ORDER_NOT_ACTIVE', 'Món bếp chưa được gán trạm hợp lệ');
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

export async function resolveOrderItems(tx: Prisma.TransactionClient, itemInputs: CreateOrderItemInput[]): Promise<ResolvedOrderItem[]> {
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

      const isSizeGroup = /^size$/i.test(group.name.trim());

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
          const allowedList = parseAllowedSubstituteNamesFromJson(modifier.allowedSubstituteNames);
          const allowedRemaining = filterAllowedSubstituteModifiers(
            {
              id: modifier.id,
              name: modifier.name,
              allowedSubstituteNames: allowedList,
            },
            remainingGroupModifiers,
          );

          if (allowedList !== null && allowedRemaining.length === 0) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_FAILED',
              message: `Món "${modifier.name}" không được phép đổi sang các món còn lại`,
            });
          }

          if (selection.substituteModifierId) {
            const targetMod = group.modifiers.find((m) => m.id === selection.substituteModifierId);
            if (!targetMod || targetMod.isAvailable === false) {
              throw new UnprocessableEntityException({
                code: 'VALIDATION_FAILED',
                message: 'Món thay thế hiện không khả dụng hoặc tạm hết',
              });
            }
            if (
              !isSubstituteTargetAllowed(
                { name: modifier.name, allowedSubstituteNames: allowedList },
                targetMod.name,
              )
            ) {
              throw new UnprocessableEntityException({
                code: 'VALIDATION_FAILED',
                message: `Món "${modifier.name}" không được phép đổi sang "${targetMod.name}"`,
              });
            }
          }

          const explicitSubModifier = selection.substituteModifierId
            ? allowedRemaining.find((m) => m.id === selection.substituteModifierId)
            : undefined;
          if (allowedList !== null && selection.substituteModifierId && !explicitSubModifier) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_FAILED',
              message: 'Món thay thế được chọn không hợp lệ hoặc không còn trong đơn',
            });
          }

          const requestedSubstituteName = selection.substituteName?.trim();
          if (
            allowedList !== null &&
            requestedSubstituteName &&
            !isSubstituteTargetAllowed(
              { name: modifier.name, allowedSubstituteNames: allowedList },
              requestedSubstituteName,
            )
          ) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_FAILED',
              message: `Món "${modifier.name}" không được phép đổi sang "${requestedSubstituteName}"`,
            });
          }

          const explicitNamedModifier = requestedSubstituteName
            ? allowedRemaining.find((m) => m.name.trim() === requestedSubstituteName)
            : undefined;
          if (allowedList !== null && requestedSubstituteName && !explicitNamedModifier) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_FAILED',
              message: 'Món thay thế được chọn không hợp lệ hoặc tạm hết',
            });
          }

          const trimmedDefaultSub = modifier.defaultSubstituteName?.trim();
          const defaultSubIsAvailable = Boolean(
            trimmedDefaultSub &&
              (allowedList !== null
                ? allowedRemaining.some((m) => m.name.trim() === trimmedDefaultSub)
                : !group.modifiers.some(
                    (m) => m.name === trimmedDefaultSub && m.isAvailable === false,
                  )),
          );

          const replacementName =
            allowedRemaining.length === 1
              ? allowedRemaining[0]!.name
              : (explicitSubModifier?.name ??
                  explicitNamedModifier?.name ??
                  (allowedList === null ? requestedSubstituteName : undefined) ??
                  (defaultSubIsAvailable ? trimmedDefaultSub : undefined) ??
                  allowedRemaining[0]?.name ??
                  '');

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
        if (modifier.isDefaultChecked && modifier.extraPrice.equals(0) && !isSizeGroup) {
          continue;
        }
        snapshots.push({ groupId: group.id, modifierId: modifier.id, name: modifier.name, extraPrice: modifier.extraPrice });
      }

      if (isSizeGroup && positiveSelections.length === 0) {
        const defaultSizeMod = group.modifiers.find((m) => m.isDefaultChecked && m.isAvailable !== false);
        if (defaultSizeMod) {
          modifierTotal = modifierTotal.add(defaultSizeMod.extraPrice);
          snapshots.push({
            groupId: group.id,
            modifierId: defaultSizeMod.id,
            name: defaultSizeMod.name,
            extraPrice: defaultSizeMod.extraPrice,
          });
        }
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
      isTakeaway: Boolean(input.isTakeaway),
    };
  });
}

export async function appendOrderItems(tx: Prisma.TransactionClient, order: OrderRow, itemInputs: CreateOrderItemInput[]) {
  const items = await resolveOrderItems(tx, itemInputs);
  const aggregate = await tx.orderItem.aggregate({ where: { orderId: order.id }, _max: { batchNo: true } });
  const batchNo = (aggregate._max.batchNo ?? 0) + 1;
  const addedTotal = totalForItems(items);
  await tx.orderItem.createMany({
    data: items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      modifiersSnapshot: item.modifiersSnapshot,
      itemNote: item.itemNote,
      ...(item.isTakeaway ? { isTakeaway: true } : {}),
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
