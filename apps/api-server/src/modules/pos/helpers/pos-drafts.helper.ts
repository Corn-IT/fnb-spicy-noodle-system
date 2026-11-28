import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreatePosDraftRequestSchema,
  ErrorCodes,
  PosDraftListResponseSchema,
  PosDraftResponseSchema,
  PosDraftStateSchema,
  SubmitPosDraftRequestSchema,
  SubmitPosDraftResponseSchema,
  UpdatePosDraftRequestSchema,
  type CreatePosDraftRequest,
  type PosDraftState,
  type SubmitPosDraftRequest,
  type UpdatePosDraftRequest,
} from '@fnb/shared';
import { resolveStoreTakeawayLabelFormat } from '../../../common/utils/takeaway-format.util';
import { allocateTakeawayNumber } from '../takeaway-sequence.helper';
import {
  businessDay,
  createdOrderResponse,
  lockOrderSequence,
  lockTables,
  nextOrderCode,
  parseRequest,
  posConflict,
  resolveOrderItems,
  totalForItems,
  type OrderRow,
  type PosRuntimeDeps,
} from './pos-shared.helper';

function posDraftData(state: PosDraftState): Pick<Prisma.PosDraftUncheckedCreateInput, 'orderType' | 'tableId' | 'items' | 'note'> {
  return {
    orderType: state.orderType,
    tableId: state.tableId,
    items: state.items as Prisma.InputJsonValue,
    note: state.note,
  };
}

function posDraftResponse(row: {
  id: string;
  orderType: string | null;
  tableId: number | null;
  items: Prisma.JsonValue;
  note: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  table?: { name: string } | null;
}) {
  const state = PosDraftStateSchema.parse({ orderType: row.orderType, tableId: row.tableId, items: row.items, note: row.note });
  return PosDraftResponseSchema.parse({
    ...state,
    id: row.id,
    revision: row.revision,
    tableName: row.table?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listPosDraftsHelper(deps: PosRuntimeDeps) {
  const rows = await deps.prisma.posDraft.findMany({
    where: { submittedOrderId: null },
    include: { table: { select: { name: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return PosDraftListResponseSchema.parse({ drafts: rows.map((row) => posDraftResponse(row)) });
}

export async function createPosDraftHelper(deps: PosRuntimeDeps, input: CreatePosDraftRequest, userId: number) {
  const state = parseRequest(CreatePosDraftRequestSchema, input);
  const row = await deps.prisma.posDraft.create({
    data: {
      ...posDraftData(state),
      createdBy: userId,
      updatedBy: userId,
    },
    include: { table: { select: { name: true } } },
  });
  const draft = posDraftResponse(row);
  await deps.auditLogService?.record({
    module: 'POS', action: 'Lưu giỏ nháp', detail: draft.id,
    message: 'lưu giỏ bán hàng nháp', actor: userId,
    metadata: { draftId: draft.id, revision: draft.revision, itemCount: draft.items.length },
  });
  deps.gateway.emitPosDraftsUpdated({ draftId: draft.id, action: 'SAVED', revision: draft.revision, updatedAt: draft.updatedAt });
  return draft;
}

export async function updatePosDraftHelper(deps: PosRuntimeDeps, id: string, input: UpdatePosDraftRequest, userId: number) {
  const parsed = parseRequest(UpdatePosDraftRequestSchema, input);
  const state = PosDraftStateSchema.parse({
    orderType: parsed.orderType,
    tableId: parsed.tableId,
    items: parsed.items,
    note: parsed.note,
  });
  const row = await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pos_drafts WHERE id = ${id} FOR UPDATE`;
    const current = await tx.posDraft.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ message: 'Không tìm thấy giỏ nháp' });
    if (current.submittedOrderId !== null) {
      throw posConflict(ErrorCodes.POS_DRAFT_ALREADY_SUBMITTED, 'Giỏ nháp này đã được tạo thành đơn');
    }
    if (current.revision !== parsed.expectedRevision) {
      throw posConflict(ErrorCodes.POS_DRAFT_CONCURRENT_MODIFICATION, 'Giỏ nháp đã được cập nhật ở thiết bị khác; hãy tải lại trước khi lưu');
    }
    return tx.posDraft.update({
      where: { id },
      data: { ...posDraftData(state), revision: { increment: 1 }, updatedBy: userId },
      include: { table: { select: { name: true } } },
    });
  });
  const draft = posDraftResponse(row);
  await deps.auditLogService?.record({
    module: 'POS', action: 'Cập nhật giỏ nháp', detail: draft.id,
    message: 'cập nhật giỏ bán hàng nháp', actor: userId,
    metadata: { draftId: draft.id, revision: draft.revision, itemCount: draft.items.length },
  });
  deps.gateway.emitPosDraftsUpdated({ draftId: draft.id, action: 'SAVED', revision: draft.revision, updatedAt: draft.updatedAt });
  return draft;
}

export async function deletePosDraftHelper(deps: PosRuntimeDeps, id: string, expectedRevision: number, userId: number) {
  const deletedAt = new Date().toISOString();
  await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pos_drafts WHERE id = ${id} FOR UPDATE`;
    const current = await tx.posDraft.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ message: 'Không tìm thấy giỏ nháp' });
    if (current.submittedOrderId !== null) {
      throw posConflict(ErrorCodes.POS_DRAFT_ALREADY_SUBMITTED, 'Không thể xoá giỏ nháp đã tạo thành đơn');
    }
    if (current.revision !== expectedRevision) {
      throw posConflict(ErrorCodes.POS_DRAFT_CONCURRENT_MODIFICATION, 'Giỏ nháp đã được cập nhật ở thiết bị khác; hãy tải lại trước khi xoá');
    }
    await tx.posDraft.delete({ where: { id } });
  });
  await deps.auditLogService?.record({
    module: 'POS', action: 'Xoá giỏ nháp', detail: id,
    message: 'xoá giỏ bán hàng nháp', actor: userId, metadata: { draftId: id },
  });
  deps.gateway.emitPosDraftsUpdated({ draftId: id, action: 'DELETED', updatedAt: deletedAt });
  return { id, deleted: true as const };
}

export async function submitPosDraftHelper(deps: PosRuntimeDeps, id: string, input: SubmitPosDraftRequest, cashierId: number) {
  const parsed = parseRequest(SubmitPosDraftRequestSchema, input);
  const result = await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pos_drafts WHERE id = ${id} FOR UPDATE`;
    const draft = await tx.posDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException({ message: 'Không tìm thấy giỏ nháp' });
    if (draft.submittedOrderId !== null) {
      if (draft.submitIdempotencyKey !== parsed.idempotencyKey) {
        throw posConflict(ErrorCodes.POS_DRAFT_ALREADY_SUBMITTED, 'Giỏ nháp đã được gửi bằng một yêu cầu khác');
      }
      const existing = await tx.order.findUnique({
        where: { id: draft.submittedOrderId },
        include: { table: { select: { name: true } } },
      }) as OrderRow | null;
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy đơn đã tạo từ giỏ nháp' });
      return { order: createdOrderResponse(existing, existing.table?.name ?? null), replay: true, draftUpdatedAt: draft.updatedAt };
    }
    if (draft.revision !== parsed.expectedRevision) {
      throw posConflict(ErrorCodes.POS_DRAFT_CONCURRENT_MODIFICATION, 'Giỏ nháp đã được cập nhật ở thiết bị khác; hãy tải lại trước khi gửi');
    }

    const state = PosDraftStateSchema.parse({
      orderType: draft.orderType,
      tableId: draft.tableId,
      items: draft.items,
      note: draft.note,
    });
    if (state.items.length === 0) throw new BadRequestException({ message: 'Giỏ nháp chưa có món' });
    if (state.orderType === null) throw new BadRequestException({ message: 'Hãy chọn bàn hoặc Mang về trước khi gửi giỏ nháp' });
    if (state.orderType === 'DINE_IN' && state.tableId === null) {
      throw new BadRequestException({ message: 'Hãy gán bàn trước khi gửi giỏ nháp' });
    }

    let table: { id: number; name: string; status: string; activeOrderId: number | null } | null = null;
    if (state.orderType === 'DINE_IN') {
      await lockTables(tx, [state.tableId!]);
      table = await tx.diningTable.findUnique({ where: { id: state.tableId! } });
      if (!table || table.status !== 'AVAILABLE' || table.activeOrderId !== null) {
        throw posConflict(ErrorCodes.POS_TABLE_NOT_AVAILABLE, 'Bàn đã có khách hoặc không còn trống; giỏ nháp vẫn được giữ lại');
      }
    }

    const now = new Date();
    const day = businessDay(now);
    await lockOrderSequence(tx, day.key);
    const orderCode = await nextOrderCode(tx, day);
    const takeawayNumber = state.orderType === 'TAKEAWAY' ? await allocateTakeawayNumber(tx, now) : null;
    const takeawayLabelFormat = state.orderType === 'TAKEAWAY'
      ? await resolveStoreTakeawayLabelFormat(tx)
      : null;
    const items = await resolveOrderItems(tx, state.items);
    const totalAmount = totalForItems(items);
    const order = await tx.order.create({
      data: {
        orderCode,
        orderType: state.orderType,
        orderSource: 'POS_COUNTER',
        tableId: state.orderType === 'DINE_IN' ? state.tableId : null,
        takeawayNumber,
        takeawayLabelFormat,
        status: 'SERVING',
        cashierId,
        note: state.note ?? undefined,
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
    await tx.posDraft.update({
      where: { id },
      data: { submittedOrderId: order.id, submitIdempotencyKey: parsed.idempotencyKey, submittedAt: now },
    });
    const response = createdOrderResponse(order as OrderRow, table?.name ?? null);
    await deps.auditLogService?.record({
      module: 'POS', action: 'Tạo đơn từ giỏ nháp', detail: `${response.orderCode} (${response.tableLabel ?? 'Mang về'})`,
      message: 'tạo đơn từ giỏ bán hàng nháp', actor: cashierId,
      metadata: { draftId: id, orderId: response.orderId, orderCode: response.orderCode, tableLabel: response.tableLabel },
      tx,
    });
    return { order: response, replay: false, draftUpdatedAt: now };
  });

  if (!result.replay) {
    const order = result.order;
    deps.gateway.emitTableGridSync({ orderId: order.orderId, tableId: order.tableId, status: order.status });
    deps.gateway.emitPosDraftsUpdated({ draftId: id, action: 'SUBMITTED', updatedAt: result.draftUpdatedAt.toISOString() });
  }
  return SubmitPosDraftResponseSchema.parse({ draftId: id, order: result.order, idempotentReplay: result.replay });
}
