import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ApplicableDiscountsResponseSchema,
  ApplyPosDiscountRequestSchema,
  CheckoutOrderRequestSchema,
  DiscountSnapshotSchema,
  ErrorCodes,
  ProvisionalBillResponseSchema,
  SplitCheckoutOrderRequestSchema,
  SplitProvisionalBillRequestSchema,
  calculateOrderDiscount,
  getVietQrBankShortName,
  type ApplyPosDiscountRequest,
  type AuthPrincipal,
  type CheckoutOrderRequest,
  type DiscountSnapshot,
  type SplitCheckoutOrderRequest,
  type SplitProvisionalBillRequest,
} from '@fnb/shared';
import { formatPaymentMethodVi } from '../../../common/audit/audit-log.service';
import {
  formatOrderTakeawayLabel,
  normalizeTakeawayLabelFormat,
  resolveStoreTakeawayLabelFormat,
} from '../../../common/utils/takeaway-format.util';
import type { QrSelectionResult } from '../../payment-qr/payment-qr.service';
import {
  computeTotalsFromRows,
  extractDiscountSnapshot,
  hasOrderDiscount,
  snapshotToCalcRule,
  toCalcItems,
} from '../order-totals.helper';
import { allocateTakeawayNumber } from '../takeaway-sequence.helper';
import {
  businessDay,
  fromCents,
  lockOrderSequence,
  lockOrders,
  lockTables,
  modifierNames,
  nextOrderCode,
  orderDetail,
  orderTableCode,
  parseRequest,
  posConflict,
  pricedModifierNames,
  toCents,
  totalForItems,
  type OrderRow,
  type PosRuntimeDeps,
} from './pos-shared.helper';

async function recordQrSelectionAudit(
  deps: PosRuntimeDeps,
  selection: QrSelectionResult,
  orderCode: string,
  amount: number,
  actorId?: number,
): Promise<void> {
  if (!selection.rotated && !selection.overLimit) return;
  const bankLabel = `${getVietQrBankShortName(selection.account.bankCode)} - ${selection.account.accountNo}`;
  const action = selection.overLimit ? 'Vượt hạn mức tất cả QR' : 'Tự động xoay vòng QR';
  await deps.auditLogService?.record({
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

export async function getApplicableDiscountsHelper(deps: PosRuntimeDeps, id: number) {
  const order = (await deps.prisma.order.findUnique({
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
  const items = await deps.getDiscountSvc().findApplicableForOrderItems(calcItems);

  return ApplicableDiscountsResponseSchema.parse({
    subtotalAmount,
    currentDiscountSnapshot,
    items,
  });
}

export async function applyDiscountHelper(deps: PosRuntimeDeps, id: number, input: ApplyPosDiscountRequest, user: AuthPrincipal) {
  const parsed = parseRequest(ApplyPosDiscountRequestSchema, input);
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

  const discountSvc = deps.getDiscountSvc();
  const result = await deps.prisma.$transaction(async (tx) => {
    const head = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
    if (!head) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    await lockOrders(tx, [id]);
    if (head.tableId !== null) await lockTables(tx, [head.tableId]);

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
      throw posConflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Chỉ có thể áp dụng giảm giá cho đơn đang phục vụ');
    }

    const activeItems = (order.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED');
    const calcItems = toCalcItems(activeItems);
    const subtotalOnly = calculateOrderDiscount(calcItems, null).subtotalAmount;
    if (activeItems.length === 0 || subtotalOnly <= 0) {
      throw posConflict(ErrorCodes.DISCOUNT_NOT_APPLICABLE, 'Đơn hàng chưa có món hợp lệ để giảm giá');
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
      const resolved = await discountSvc.findValidDiscountByCodeOrId(
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
        throw posConflict(
          ErrorCodes.DISCOUNT_NOT_APPLICABLE,
          previewCalc.warningMessage ?? 'Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã giảm giá',
        );
      }
      if (previewCalc.warningCode === 'NOT_APPLICABLE' || previewCalc.discountAmount <= 0) {
        throw posConflict(
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
      detail: orderDetail(hydrated),
      orderCode: order.orderCode,
      tableId: order.tableId,
      snapshot: nextSnapshot,
      discountAmount: totals.discountAmount,
    };
  });

  deps.gateway.emitOrderStatusUpdated?.(id, {
    orderId: id,
    status: 'SERVING',
  });
  deps.gateway.emitQrOrderNotice?.(id, {
    orderId: id,
    tableId: result.tableId,
    kind: 'DISCOUNT_APPLIED',
    discountAmount: result.discountAmount,
    totalAmount: result.detail.totalAmount,
    timestamp: new Date().toISOString(),
  });
  deps.gateway.emitTableGridSync({
    orderId: id,
    tableId: result.tableId,
    totalAmount: result.detail.totalAmount,
  });
  await deps.auditLogService?.record({
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

export async function removeDiscountHelper(deps: PosRuntimeDeps, id: number, userId?: number) {
  const result = await deps.prisma.$transaction(async (tx) => {
    const head = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
    if (!head) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    await lockOrders(tx, [id]);
    if (head.tableId !== null) await lockTables(tx, [head.tableId]);

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
      throw posConflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Chỉ có thể gỡ giảm giá cho đơn đang phục vụ');
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
      detail: orderDetail(hydrated),
      orderCode: order.orderCode,
      tableId: order.tableId,
      hadDiscount: previousSnapshot !== null,
      previousCode: previousSnapshot?.code ?? null,
    };
  });

  deps.gateway.emitOrderStatusUpdated?.(id, {
    orderId: id,
    status: 'SERVING',
  });
  if (result.hadDiscount) {
    deps.gateway.emitQrOrderNotice?.(id, {
      orderId: id,
      tableId: result.tableId,
      kind: 'DISCOUNT_REMOVED',
      totalAmount: result.detail.totalAmount,
      timestamp: new Date().toISOString(),
    });
  }
  deps.gateway.emitTableGridSync({
    orderId: id,
    tableId: result.tableId,
    totalAmount: result.detail.totalAmount,
  });
  if (userId && result.hadDiscount) {
    await deps.auditLogService?.record({
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

export async function getProvisionalBillHelper(deps: PosRuntimeDeps, id: number, userId?: number) {
  const qrService = deps.getQrService();
  const { order, qrSelection } = await deps.prisma.$transaction(async (tx) => {
    await lockOrders(tx, [id]);
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
      throw posConflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể in tạm tính cho đơn đang phục vụ');
    }

    const selection = await qrService.selectForAmount(tx, found.totalAmount);
    await tx.order.update({
      where: { id: found.id },
      data: { paymentAccountId: selection.account.id },
    });

    return { order: found, qrSelection: selection };
  });

  await recordQrSelectionAudit(deps, qrSelection, order.orderCode, order.totalAmount.toNumber(), userId);
  deps.gateway.emitQrOrderNotice?.(order.id, {
    orderId: order.id,
    tableId: order.tableId,
    kind: 'PROVISIONAL_BILL_PRINTED',
    totalAmount: order.totalAmount.toNumber(),
    timestamp: new Date().toISOString(),
  });

  const tableCode = orderTableCode(order);
  const totals = computeTotalsFromRows(order.items ?? [], order.discountSnapshot);
  const vietQrPayload = qrService.buildVietQrUrl(
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
    takeawayLabelFormat: normalizeTakeawayLabelFormat(order.takeawayLabelFormat),
    items: (order.items ?? [])
      .filter((item) => item.kitchenStatus !== 'CANCELLED')
      .map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
        modifiers: modifierNames(item.modifiersSnapshot),
        pricedModifiers: pricedModifierNames(item.modifiersSnapshot),
        note: item.itemNote,
        ...(item.isTakeaway ? { isTakeaway: true } : {}),
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

export async function getSplitProvisionalBillHelper(
  deps: PosRuntimeDeps,
  id: number,
  input: SplitProvisionalBillRequest,
  userId?: number,
) {
  const parsed = parseRequest(SplitProvisionalBillRequestSchema, input);
  const order = (await deps.prisma.order.findUnique({
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
    throw posConflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể in tạm tính tách đơn cho đơn đang phục vụ');
  }
  if (hasOrderDiscount(order)) {
    throw posConflict(
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
    pricedModifiers: string[];
    note: string | null;
    isTakeaway?: boolean;
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
      modifiers: modifierNames(item.modifiersSnapshot),
      pricedModifiers: pricedModifierNames(item.modifiersSnapshot),
      note: item.itemNote,
      ...(item.isTakeaway ? { isTakeaway: true } : {}),
    });
  }
  splitTotal = splitTotal.toDecimalPlaces(2);

  const qrService = deps.getQrService();
  const qrSelection = await qrService.selectForAmount(deps.prisma, splitTotal);
  await recordQrSelectionAudit(deps, qrSelection, `${order.orderCode} (Tách đơn)`, splitTotal.toNumber(), userId);
  deps.gateway.emitQrOrderNotice?.(order.id, {
    orderId: order.id,
    tableId: order.tableId,
    kind: 'PROVISIONAL_BILL_PRINTED',
    totalAmount: splitTotal.toNumber(),
    timestamp: new Date().toISOString(),
  });

  const tableCode = orderTableCode(order);
  const vietQrPayload = qrService.buildVietQrUrl(
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
    takeawayLabelFormat: normalizeTakeawayLabelFormat(order.takeawayLabelFormat),
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

export async function checkoutHelper(deps: PosRuntimeDeps, id: number, input: CheckoutOrderRequest, cashierId: number) {
  const parsed = parseRequest(CheckoutOrderRequestSchema, input);
  const qrService = deps.getQrService();
  const result = await deps.prisma.$transaction(async (tx) => {
    const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
    if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    await lockOrders(tx, [id]);
    const order = await tx.order.findUnique({ where: { id }, include: { table: { select: { name: true } } } }) as OrderRow | null;
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
    if (order.status !== 'SERVING') throw posConflict('POS_ORDER_NOT_ACTIVE', 'Đơn hàng không còn mở để thanh toán');
    if (order.tableId !== null) await lockTables(tx, [order.tableId]);

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
        throw posConflict(
          ErrorCodes.DISCOUNT_USAGE_EXHAUSTED,
          'Mã giảm giá đã hết lượt sử dụng trong lúc chờ thanh toán',
        );
      }
    }

    const totalCents = toCents(order.totalAmount);
    if (parsed.totalAmount !== undefined && toCents(parsed.totalAmount) !== totalCents) {
      throw posConflict('POS_CONCURRENT_MODIFICATION', 'Tổng tiền đơn hàng đã thay đổi, vui lòng tải lại hoá đơn');
    }
    let cashCents = 0;
    let transferCents = 0;
    if (parsed.paymentMethod === 'CASH') cashCents = totalCents;
    else if (parsed.paymentMethod === 'TRANSFER') transferCents = totalCents;
    else {
      cashCents = toCents(parsed.cashAmount);
      transferCents = toCents(parsed.transferAmount);
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
      const qrSelection = await qrService.selectForAmount(tx, fromCents(transferCents), paidAt);
      resolvedPaymentAccountId = qrSelection.account.id;
    }

    const updated = await tx.order.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentMethod: parsed.paymentMethod,
        paymentAccountId: resolvedPaymentAccountId,
        cashAmount: fromCents(cashCents),
        transferAmount: fromCents(transferCents),
        paidAt,
        cashierId,
      },
    });
    if (order.tableId !== null) {
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE', activeOrderId: null } });
    }
    const tableLabel = order.table?.name ?? (order.orderType === 'TAKEAWAY' ? formatOrderTakeawayLabel(order.takeawayNumber, order.takeawayLabelFormat) : null);
    return { order: updated as OrderRow, paidAt, tableId: order.tableId, tableLabel };
  });

  const payload = { orderId: id, status: 'PAID', paidAt: result.paidAt.toISOString() };
  deps.gateway.emitOrderStatusUpdated(id, payload);
  deps.gateway.emitTableGridSync({ orderId: id, tableId: result.tableId, status: 'PAID' });
  const methodLabel = formatPaymentMethodVi(parsed.paymentMethod);
  const totalFormatted = `${result.order.totalAmount.toNumber().toLocaleString('vi-VN')}đ`;
  await deps.auditLogService?.record({
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

export async function splitCheckoutHelper(deps: PosRuntimeDeps, id: number, input: SplitCheckoutOrderRequest, cashierId: number) {
  const parsed = parseRequest(SplitCheckoutOrderRequestSchema, input);
  const qrService = deps.getQrService();

  const result = await deps.prisma.$transaction(async (tx) => {
    const snapshot = await tx.order.findUnique({
      where: { id },
      select: { id: true, tableId: true },
    });
    if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });

    // Invariant 5: Lock orders first, then dining_tables
    await lockOrders(tx, [id]);
    if (snapshot.tableId !== null) await lockTables(tx, [snapshot.tableId]);

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
      throw posConflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể tách thanh toán cho đơn đang phục vụ');
    }
    if (hasOrderDiscount(order)) {
      throw posConflict(
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

    const splitTotalCents = toCents(splitTotal);
    let cashCents = 0;
    let transferCents = 0;
    if (parsed.paymentMethod === 'CASH') {
      cashCents = splitTotalCents;
    } else if (parsed.paymentMethod === 'TRANSFER') {
      transferCents = splitTotalCents;
    } else {
      cashCents = toCents(parsed.cashAmount);
      transferCents = toCents(parsed.transferAmount);
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
          const qrSelection = await qrService.selectForAmount(tx, fromCents(transferCents), paidAt);
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
          cashAmount: fromCents(cashCents),
          transferAmount: fromCents(transferCents),
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

    const day = businessDay(paidAt);
    await lockOrderSequence(tx, day.key);
    const splitOrderCode = await nextOrderCode(tx, day);
    const splitTakeawayNumber =
      order.orderType === 'TAKEAWAY' ? await allocateTakeawayNumber(tx, paidAt) : null;
    const splitTakeawayLabelFormat =
      order.orderType === 'TAKEAWAY'
        ? (normalizeTakeawayLabelFormat(order.takeawayLabelFormat) ?? await resolveStoreTakeawayLabelFormat(tx))
        : null;

    const paidOrder = await tx.order.create({
      data: {
        orderCode: splitOrderCode,
        orderType: order.orderType as 'DINE_IN' | 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: order.orderType === 'DINE_IN' ? order.tableId : null,
        takeawayNumber: splitTakeawayNumber,
        takeawayLabelFormat: splitTakeawayLabelFormat,
        status: 'PAID',
        paymentMethod: parsed.paymentMethod,
        paymentAccountId: resolvedPaymentAccountId,
        cashAmount: fromCents(cashCents),
        transferAmount: fromCents(transferCents),
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
            ...(item.isTakeaway ? { isTakeaway: true } : {}),
            kitchenStatus: item.kitchenStatus as 'NEW' | 'PRINTED',
          },
        });
      }
    }

    const remainingItems = await tx.orderItem.findMany({
      where: { orderId: order.id, kitchenStatus: { in: ['NEW', 'PRINTED'] } },
      select: { quantity: true, unitPrice: true },
    });
    const remainingTotal = totalForItems(remainingItems);
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
    deps.gateway.emitOrderStatusUpdated(id, {
      orderId: id,
      status: 'PAID',
      paidAt: result.paidAt.toISOString(),
    });
  } else {
    deps.gateway.emitOrderStatusUpdated?.(id, {
      orderId: id,
      status: 'SERVING',
    });
  }
  deps.gateway.emitTableGridSync({
    orderId: id,
    tableId: result.tableId,
    status: result.status,
  });
  const splitMethodLabel = formatPaymentMethodVi(parsed.paymentMethod);
  const paidFormatted = `${result.paidTotalAmount.toLocaleString('vi-VN')}đ`;
  await deps.auditLogService?.record({
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
