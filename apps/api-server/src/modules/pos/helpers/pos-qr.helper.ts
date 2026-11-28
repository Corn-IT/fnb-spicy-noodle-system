import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateQrOrderSchema,
  QrOrderResponseSchema,
  normalizeQrToken,
  type CreateQrOrderInput,
  type QrOrderResponse,
} from '@fnb/shared';
import {
  formatTakeawayCustomerNote,
  isTakeawayQrToken,
  signTakeawayGuestSessionToken,
  verifyTakeawayGuestSessionToken,
} from '../../../common/security/takeaway-qr.util';
import {
  formatOrderTakeawayLabel,
  normalizeTakeawayLabelFormat,
  resolveStoreTakeawayLabelFormat,
} from '../../../common/utils/takeaway-format.util';
import { allocateTakeawayNumber } from '../takeaway-sequence.helper';
import {
  RetryQrOrderWithActiveSession,
  appendOrderItems,
  businessDay,
  lockOrderSequence,
  lockOrders,
  lockTables,
  nextOrderCode,
  parseRequest,
  posConflict,
  resolveOrderItems,
  totalForItems,
  type OrderRow,
  type PosRuntimeDeps,
} from './pos-shared.helper';

export function isQrOrderAccessibleFromTable(
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

export async function createTakeawayQrOrderTx(
  tx: Prisma.TransactionClient,
  parsed: CreateQrOrderInput,
): Promise<{ kind: 'new' | 'addon'; response: ReturnType<typeof QrOrderResponseSchema.parse>; payload: unknown }> {
  if (parsed.activeOrderId !== undefined) {
    await lockOrders(tx, [parsed.activeOrderId]);
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
      throw posConflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để gọi thêm món');
    }
    const takeawayFormat = normalizeTakeawayLabelFormat(target.takeawayLabelFormat) ?? 'NUMBER';
    const takeawayLabel = formatOrderTakeawayLabel(target.takeawayNumber, takeawayFormat);
    const addon = await appendOrderItems(tx, target, parsed.items);
    const guestSessionToken = signTakeawayGuestSessionToken(target.id, target.orderCode);
    const response = QrOrderResponseSchema.parse({
      orderId: target.id,
      activeOrderId: target.id,
      orderCode: target.orderCode,
      orderType: 'TAKEAWAY',
      takeawayNumber: target.takeawayNumber,
      takeawayLabelFormat: takeawayFormat,
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
  const day = businessDay(now);
  await lockOrderSequence(tx, day.key);
  const orderCode = await nextOrderCode(tx, day);
  const takeawayNumber = await allocateTakeawayNumber(tx, now);
  const takeawayLabelFormat = await resolveStoreTakeawayLabelFormat(tx);
  const items = await resolveOrderItems(tx, parsed.items);
  const totalAmount = totalForItems(items);
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
      takeawayLabelFormat,
      status: 'PENDING',
      note: formattedNote,
      subtotalAmount: totalAmount,
      discountAmount: new Prisma.Decimal(0),
      totalAmount,
      createdAt: now,
      items: { create: items.map((item) => ({ ...item, batchNo: 1, itemSource: 'QR_CODE' })) },
    },
  });
  const takeawayLabel = formatOrderTakeawayLabel(takeawayNumber, takeawayLabelFormat);
  const guestSessionToken = signTakeawayGuestSessionToken(order.id, orderCode);
  const response = QrOrderResponseSchema.parse({
    orderId: order.id,
    activeOrderId: order.id,
    orderCode,
    orderType: 'TAKEAWAY',
    takeawayNumber,
    takeawayLabelFormat,
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

export async function createQrOrderHelper(deps: PosRuntimeDeps, input: CreateQrOrderInput): Promise<QrOrderResponse> {
  const parsed = parseRequest(CreateQrOrderSchema, input);
  const normalizedQrToken = normalizeQrToken(parsed.qrToken);
  let result: { kind: 'new' | 'addon'; response: ReturnType<typeof QrOrderResponseSchema.parse>; payload: unknown };
  try {
    result = await deps.prisma.$transaction(async (tx) => {
      const qrTable = await tx.diningTable.findUnique({ where: { qrToken: normalizedQrToken } });
      if (!qrTable) {
        const isTakeaway = await isTakeawayQrToken(tx, normalizedQrToken);
        if (!isTakeaway) {
          throw new NotFoundException({ message: 'Mã QR bàn không hợp lệ' });
        }
        return createTakeawayQrOrderTx(tx, { ...parsed, qrToken: normalizedQrToken });
      }

      const existingOrderId = parsed.activeOrderId ?? qrTable.activeOrderId;
      if (existingOrderId !== null && existingOrderId !== undefined) {
        const sourceBeforeLock = await tx.order.findUnique({
          where: { id: existingOrderId },
          select: { id: true, mergedIntoOrderId: true },
        });
        if (!sourceBeforeLock) throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng QR' });
        const lockIds = [existingOrderId, sourceBeforeLock.mergedIntoOrderId].filter((id): id is number => id !== null);
        await lockOrders(tx, lockIds);

        const source = await tx.order.findUnique({
          where: { id: existingOrderId },
          include: { table: { select: { id: true, name: true } } },
        }) as OrderRow | null;
        if (!source) throw new NotFoundException({ message: 'Không tìm thấy phiên đơn hàng QR' });
        if (!isQrOrderAccessibleFromTable(source, qrTable)) {
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
        if (!['PENDING', 'SERVING'].includes(target.status)) {
          throw posConflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để gọi thêm món');
        }
        if (target.orderType === 'DINE_IN' && !target.table) {
          throw posConflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để gọi thêm món');
        }

        const addonItems = parsed.isTakeawayBatch
          ? parsed.items.map((item) => ({ ...item, isTakeaway: true }))
          : parsed.items;
        const response = await appendOrderItems(tx, target, addonItems);
        const resolvedTableLabel = target.orderType === 'TAKEAWAY'
          ? formatOrderTakeawayLabel(target.takeawayNumber, target.takeawayLabelFormat)
          : target.table!.name;
        return {
          kind: 'addon' as const,
          response: QrOrderResponseSchema.parse({
            orderId: target.id,
            activeOrderId: target.id,
            orderCode: target.orderCode,
            currentTableLabel: resolvedTableLabel,
            status: target.status,
            batchNo: response.batchNo,
            totalAmount: response.totalAmount,
          }),
          payload: {
            ...response,
            orderId: target.id,
            tableId: target.table?.id ?? null,
            tableLabel: resolvedTableLabel,
          },
        };
      }

      await lockTables(tx, [qrTable.id]);
      const table = await tx.diningTable.findUnique({ where: { id: qrTable.id } });
      if (!table) throw new NotFoundException({ message: 'Không tìm thấy bàn' });
      if (table.activeOrderId !== null) throw new RetryQrOrderWithActiveSession(table.activeOrderId);
      if (table.status !== 'AVAILABLE') throw posConflict('POS_TABLE_NOT_AVAILABLE', 'Bàn hiện không nhận đơn QR mới');

      const now = new Date();
      const day = businessDay(now);
      await lockOrderSequence(tx, day.key);
      const orderCode = await nextOrderCode(tx, day);
      const items = await resolveOrderItems(tx, parsed.items);
      const totalAmount = totalForItems(items);
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
      return createQrOrderHelper(deps, { ...parsed, activeOrderId: error.activeOrderId });
    }
    throw error;
  }

  if (result.kind === 'new') {
    deps.gateway.emitQrNewOrder(result.payload);
    const tableLabel =
      (result.payload as { tableLabel?: string })?.tableLabel ??
      result.response.currentTableLabel ??
      'Bàn mới';
    void deps.webPushService
      ?.notifyQrNewOrder({
        orderId: result.response.orderId,
        orderCode: result.response.orderCode,
        tableLabel,
      })
      .catch(() => undefined);
    const tableId = (result.payload as { tableId?: number | null })?.tableId ?? null;
    if (typeof tableId === 'number') {
      deps.gateway.emitTableOrderNotice?.(tableId, {
        orderId: result.response.orderId,
        tableId,
        kind: 'GUEST_ORDER_CREATED',
        batchNo: result.response.batchNo,
        totalAmount: result.response.totalAmount,
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    deps.gateway.emitQrAddonOrder(result.payload);
    const tableLabel =
      (result.payload as { tableLabel?: string })?.tableLabel ??
      result.response.currentTableLabel ??
      'Bàn';
    void deps.webPushService
      ?.notifyQrAddonOrder({
        orderId: result.response.orderId,
        orderCode: result.response.orderCode,
        tableLabel,
        batchNo: result.response.batchNo,
      })
      .catch(() => undefined);
    const tableId = (result.payload as { tableId?: number | null })?.tableId ?? null;
    deps.gateway.emitQrOrderNotice?.(result.response.orderId, {
      orderId: result.response.orderId,
      tableId,
      kind: 'GUEST_ADDON_ADDED',
      batchNo: result.response.batchNo,
      totalAmount: result.response.totalAmount,
      timestamp: new Date().toISOString(),
    });
  }
  return result.response;
}

export async function checkQrOrderStillPendingHelper(
  deps: PosRuntimeDeps,
  input: {
    orderId: number;
    kind?: string;
    batchNo?: number;
  },
): Promise<{ stillPending: boolean }> {
  if (!Number.isSafeInteger(input.orderId) || input.orderId <= 0) {
    return { stillPending: true };
  }
  if (typeof deps.prisma.order?.findUnique !== 'function') {
    return { stillPending: true };
  }

  const order = await deps.prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true, orderSource: true },
  });
  if (!order) {
    return { stillPending: false };
  }

  const normalizedKind = (input.kind ?? 'QR_NEW').trim().toUpperCase();
  const isNewPending = order.status === 'PENDING' && order.orderSource === 'QR_CODE';

  if (normalizedKind === 'QR_NEW' || normalizedKind === 'NEW') {
    return { stillPending: isNewPending };
  }

  const checkAddonPending = async (): Promise<boolean> => {
    if (
      !['PENDING', 'SERVING'].includes(order.status) ||
      typeof deps.prisma.orderItem?.findFirst !== 'function'
    ) {
      return false;
    }
    const unprintedAddon = await deps.prisma.orderItem.findFirst({
      where: {
        orderId: order.id,
        kitchenStatus: 'NEW',
        itemSource: 'QR_CODE',
        batchNo: { gte: input.batchNo ?? 2 },
      },
      select: { id: true },
    });
    return Boolean(unprintedAddon);
  };

  if (normalizedKind === 'QR_ADDON' || normalizedKind === 'ADDON') {
    return { stillPending: await checkAddonPending() };
  }

  if (isNewPending) {
    return { stillPending: true };
  }
  return { stillPending: await checkAddonPending() };
}
