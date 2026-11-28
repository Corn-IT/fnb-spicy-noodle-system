import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ApproveQrOrderSchema,
  CreateDiningTableSchema,
  PosTableGridResponseSchema,
  QrTokenSchema,
  RotateTableQrResponseSchema,
  RotateTakeawayQrResponseSchema,
  ShortenLegacyQrTokensResponseSchema,
  UpdateDiningTableSchema,
  isLegacyLongQrToken,
  maskQrTokenForAudit,
  type ApproveQrOrderInput,
  type CreateDiningTableInput,
  type UpdateDiningTableInput,
} from '@fnb/shared';
import { getOrCreateTakeawayQrToken, rotateTakeawayQrToken } from '../../../common/security/takeaway-qr.util';
import { generateUniqueTableQrToken } from '../../../common/utils/qr-token.util';
import { formatOrderTakeawayLabel } from '../../../common/utils/takeaway-format.util';
import {
  lockOrders,
  lockTables,
  orderSummary,
  parseRequest,
  posConflict,
  type OrderRow,
  type PosRuntimeDeps,
} from './pos-shared.helper';

export async function getTableGridHelper(deps: PosRuntimeDeps) {
  const [tables, takeaways, takeawayQrToken] = await Promise.all([
    deps.prisma.diningTable.findMany({
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
            takeawayLabelFormat: true,
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
    deps.prisma.order.findMany({
      where: { orderType: 'TAKEAWAY', status: { in: ['PENDING', 'SERVING'] } },
      orderBy: [{ createdAt: 'asc' }, { takeawayNumber: 'asc' }],
      include: {
        items: { select: { batchNo: true, kitchenStatus: true, itemSource: true, createdAt: true } },
      },
    }),
    getOrCreateTakeawayQrToken(deps.prisma),
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
        activeOrder: table.activeOrder ? orderSummary(table.activeOrder as unknown as OrderRow, table.name) : null,
      };
    }),
    takeaways: takeaways.map((order) => orderSummary(order as unknown as OrderRow, null)),
    ...(takeawayQrToken ? { takeawayQrToken } : {}),
  });
}

export async function rotateTakeawayQrHelper(deps: PosRuntimeDeps, userId?: number) {
  const result = await rotateTakeawayQrToken(deps.prisma);
  deps.gateway.emitTableGridSync({ takeawayQrRotated: true });
  if (userId) {
    const oldShort = maskQrTokenForAudit(result.previousQrToken);
    const newShort = maskQrTokenForAudit(result.qrToken);
    await deps.auditLogService?.record({
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

export async function shortenLegacyQrTokensHelper(deps: PosRuntimeDeps, userId?: number) {
  const { updatedTables, updatedTakeaway } = await deps.prisma.$transaction(async (tx) => {
    const activeTables = await tx.diningTable.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, qrToken: true },
    });
    const legacyTables = activeTables.filter((t) => isLegacyLongQrToken(t.qrToken));
    if (legacyTables.length > 0) {
      await lockTables(
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
    deps.gateway.emitTableGridSync({ shortenedLegacyQrTokens: true });
    if (userId) {
      const total = updatedTables + (updatedTakeaway ? 1 : 0);
      await deps.auditLogService?.record({
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

export async function createTableHelper(deps: PosRuntimeDeps, input: CreateDiningTableInput, userId?: number) {
  const parsed = parseRequest(CreateDiningTableSchema, input);
  const trimmedName = parsed.name.trim();
  if (/mang\s*v[eề]|takeaway/i.test(trimmedName)) {
    throw new BadRequestException({
      code: 'INVALID_TABLE_NAME',
      message: 'Không được tạo bàn tên "Mang về" trong sơ đồ bàn vật lý (Invariant 2)',
    });
  }

  if (typeof deps.prisma.diningTable?.findFirst === 'function') {
    const duplicate = await deps.prisma.diningTable.findFirst({
      where: {
        status: { in: ['AVAILABLE', 'PENDING', 'OCCUPIED'] },
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw posConflict('POS_TABLE_DUPLICATE', `Tên bàn "${trimmedName}" đã tồn tại`);
    }
  }

  const qrToken = await generateUniqueTableQrToken(deps.prisma, trimmedName);
  const created = await deps.prisma.diningTable.create({
    data: {
      name: trimmedName,
      qrToken,
      status: 'AVAILABLE',
      activeOrderId: null,
    },
  });
  deps.gateway.emitTableGridSync({ tableId: created.id });
  if (userId) {
    await deps.auditLogService?.record({
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

export async function updateTableHelper(deps: PosRuntimeDeps, id: number, input: UpdateDiningTableInput, userId?: number) {
  const parsed = parseRequest(UpdateDiningTableSchema, input);
  const trimmedName = parsed.name.trim();
  if (/mang\s*v[eề]|takeaway/i.test(trimmedName)) {
    throw new BadRequestException({
      code: 'INVALID_TABLE_NAME',
      message: 'Không được đổi tên bàn thành "Mang về" (Invariant 2)',
    });
  }

  const existing = await deps.prisma.diningTable.findUnique({ where: { id } });
  if (!existing || existing.status === 'DELETED') {
    throw new NotFoundException({ message: 'Không tìm thấy bàn vật lý' });
  }

  if (existing.status !== 'AVAILABLE' || existing.activeOrderId !== null) {
    throw posConflict(
      'POS_TABLE_NOT_AVAILABLE',
      `Không thể đổi tên bàn "${existing.name}" khi bàn đang có khách hoặc đang có đơn phục vụ. Vui lòng hoàn tất thanh toán trước khi đổi tên bàn.`,
    );
  }

  if (typeof deps.prisma.diningTable?.findFirst === 'function') {
    const duplicate = await deps.prisma.diningTable.findFirst({
      where: {
        id: { not: id },
        status: { in: ['AVAILABLE', 'PENDING', 'OCCUPIED'] },
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw posConflict('POS_TABLE_DUPLICATE', `Tên bàn "${trimmedName}" đã tồn tại`);
    }
  }

  const updated = await deps.prisma.diningTable.update({
    where: { id },
    data: { name: trimmedName },
  });
  deps.gateway.emitTableGridSync({ tableId: updated.id });
  if (userId) {
    await deps.auditLogService?.record({
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

export async function deleteTableHelper(deps: PosRuntimeDeps, id: number, userId?: number) {
  const result = await deps.prisma.$transaction(async (tx) => {
    await lockTables(tx, [id]);
    const existing = await tx.diningTable.findUnique({ where: { id } });
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException({ message: 'Không tìm thấy bàn vật lý' });
    }

    if (existing.status !== 'AVAILABLE' || existing.activeOrderId !== null) {
      throw posConflict(
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

  deps.gateway.emitTableGridSync({ tableId: id });
  if (userId) {
    await deps.auditLogService?.record({
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

export async function rotateTableQrHelper(deps: PosRuntimeDeps, id: number, userId?: number) {
  const result = await deps.prisma.$transaction(async (tx) => {
    await lockTables(tx, [id]);
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

  deps.gateway.emitTableGridSync({ tableId: id });
  deps.gateway.emitTableQrRotated?.(id, result.table.activeOrderId);
  if (userId) {
    const oldShort = maskQrTokenForAudit(result.previousQrToken);
    const newShort = maskQrTokenForAudit(result.table.qrToken);
    await deps.auditLogService?.record({
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

export async function approveQrOrderHelper(deps: PosRuntimeDeps, id: number, input: ApproveQrOrderInput, cashierId: number) {
  const parsed = parseRequest(ApproveQrOrderSchema, input);
  const order = await deps.prisma.$transaction(async (tx) => {
    const snapshot = await tx.order.findUnique({ where: { id }, select: { id: true, tableId: true } });
    if (!snapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng QR' });
    await lockOrders(tx, [id]);
    if (snapshot.tableId !== null) await lockTables(tx, [snapshot.tableId]);
    const current = await tx.order.findUnique({ where: { id }, include: { table: { select: { name: true } } } }) as OrderRow | null;
    if (!current) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng QR' });
    if (current.status !== 'PENDING' || current.orderSource !== 'QR_CODE') {
      throw posConflict('POS_ORDER_NOT_ACTIVE', 'Chỉ có thể duyệt đơn QR đang chờ xác nhận');
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
      tableLabel: current.table?.name ?? (current.orderType === 'TAKEAWAY' ? formatOrderTakeawayLabel(current.takeawayNumber, current.takeawayLabelFormat) : null),
    };
  });
  deps.gateway.emitOrderStatusUpdated(id, {
    status: order.order.status,
    message: parsed.approved
      ? 'Quầy đã xác nhận đơn, đang chờ chuyển xuống bếp'
      : 'Đơn hàng đã bị từ chối',
    ...(!parsed.approved && parsed.reason ? { reason: parsed.reason } : {}),
  });
  deps.gateway.emitTableGridSync({ orderId: id, status: order.order.status });
  await deps.auditLogService?.record({
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
