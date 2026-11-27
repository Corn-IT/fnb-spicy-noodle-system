import { ConflictException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCodes,
  KitchenStationSchema,
  TableActionRequestSchema,
  TableActionResponseSchema,
} from '@fnb/shared';
import type { ErrorCode, KitchenStation, TableActionRequest, TableActionResponse } from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  formatOrderTakeawayLabel,
  resolveStoreTakeawayLabelFormat,
} from '../../common/utils/takeaway-format.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';
import { recomputeOrderTotals } from './order-totals.helper';
import { allocateTakeawayNumber } from './takeaway-sequence.helper';

const activeStatuses = ['PENDING', 'SERVING'];

@Injectable()
export class TableTransferService {
  private readonly logger = new Logger(TableTransferService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PosSocketGateway) private readonly gateway: PosSocketGateway,
  ) {}

  async executeTableAction(orderId: number, input: TableActionRequest, _userId?: number): Promise<TableActionResponse> {
    const parsedInput = TableActionRequestSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu không hợp lệ',
        details: { fieldErrors: parsedInput.error.flatten().fieldErrors },
      });
    }
    const parsed = parsedInput.data;

    const result = await this.prisma.$transaction(async (tx) => {
      const sourceSnapshot = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderType: true, tableId: true, takeawayNumber: true },
      });
      if (!sourceSnapshot) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });

      const targetSnapshot = parsed.action === 'TO_TAKEAWAY'
        ? null
        : await tx.diningTable.findUnique({
            where: { id: parsed.targetTableId! },
            select: { id: true, activeOrderId: true },
          });
      if (parsed.action !== 'TO_TAKEAWAY' && !targetSnapshot) {
        throw new NotFoundException({ message: 'Không tìm thấy bàn đích' });
      }

      const relatedOrderIds = [
        orderId,
        ...(parsed.action === 'MOVE' || parsed.action === 'TO_TAKEAWAY' || !targetSnapshot || targetSnapshot.activeOrderId === null
          ? []
          : [targetSnapshot.activeOrderId]),
      ];
      await this.lockOrders(tx, relatedOrderIds);
      await this.lockTables(tx, [sourceSnapshot.tableId, targetSnapshot?.id ?? null]);

      const source = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          table: { select: { id: true, name: true } },
          items: {
            include: { product: { include: { comboParents: { include: { childProduct: { select: { station: true } } } } } } },
          },
        },
      });
      if (!source) throw new NotFoundException({ message: 'Không tìm thấy đơn hàng' });
      if (source.tableId !== sourceSnapshot.tableId || source.orderType !== sourceSnapshot.orderType) {
        throw this.conflict(ErrorCodes.POS_CONCURRENT_MODIFICATION, 'Đơn nguồn vừa thay đổi, vui lòng tải lại sơ đồ bàn');
      }
      if (!activeStatuses.includes(source.status)) {
        throw this.conflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Đơn hàng không còn mở để chuyển bàn');
      }

      const sourceTable = source.tableId === null
        ? null
        : await tx.diningTable.findUnique({ where: { id: source.tableId } });
      if (source.tableId !== null && !sourceTable) {
        throw new NotFoundException({ message: 'Không tìm thấy bàn nguồn' });
      }
      if (sourceTable && sourceTable.activeOrderId !== source.id) {
        throw this.conflict(ErrorCodes.POS_CONCURRENT_MODIFICATION, 'Bàn nguồn không còn trỏ tới đơn này, vui lòng tải lại sơ đồ bàn');
      }

      const sourceStations = this.printedStations(source.items);
      const sourceLabel = source.orderType === 'TAKEAWAY'
        ? formatOrderTakeawayLabel(source.takeawayNumber, (source as { takeawayLabelFormat?: unknown }).takeawayLabelFormat)
        : (sourceTable?.name ?? `Bàn #${source.tableId}`);
      const sourceNoticeStatus: 'PENDING' | 'SERVING' = source.status === 'PENDING' ? 'PENDING' : 'SERVING';

      // Case 1: DINE_IN -> TAKEAWAY (TO_TAKEAWAY)
      if (parsed.action === 'TO_TAKEAWAY') {
        if (source.orderType !== 'DINE_IN' || source.tableId === null || !sourceTable) {
          throw this.conflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Chỉ có thể chuyển đơn tại bàn sang Mang về');
        }
        const now = new Date();
        const takeawayNumber = await allocateTakeawayNumber(tx, now);
        const takeawayLabelFormat = await resolveStoreTakeawayLabelFormat(tx);
        const toLabel = formatOrderTakeawayLabel(takeawayNumber, takeawayLabelFormat);
        const logEntry = {
          action: parsed.action,
          fromTable: sourceLabel,
          toTable: toLabel,
          timestamp: now.toISOString(),
          reason: parsed.reason,
        };

        if (typeof (tx.orderItem as { updateMany?: unknown })?.updateMany === 'function') {
          await tx.orderItem.updateMany({
            where: { orderId: source.id },
            data: { isTakeaway: false },
          });
        }
        await tx.order.update({
          where: { id: source.id },
          data: {
            orderType: 'TAKEAWAY',
            tableId: null,
            takeawayNumber,
            takeawayLabelFormat,
            tableTransferLogs: this.appendLog(source.tableTransferLogs, logEntry),
          },
        });
        await tx.diningTable.update({
          where: { id: sourceTable.id },
          data: { status: 'AVAILABLE', activeOrderId: null },
        });

        const kitchenTransferSlip = sourceStations.length > 0 ? {
          orderCode: source.orderCode,
          fromLabel: sourceLabel,
          toLabel,
          affectedStations: sourceStations,
        } : undefined;

        return {
          response: TableActionResponseSchema.parse({
            action: parsed.action,
            sourceTableId: sourceTable.id,
            targetTableId: null,
            takeawayNumber,
            takeawayLabelFormat,
            requireKitchenNoticePrint: kitchenTransferSlip !== undefined,
            kitchenTransferSlip,
          }),
          action: parsed.action,
          previousOrderId: source.id,
          redirectedOrderId: source.id,
          sourceNoticeStatus,
          newTableId: null as number | null,
          newTableLabel: toLabel,
          previousTableLabel: sourceLabel,
          tableIds: [sourceTable.id],
          secondRedirect: undefined,
        };
      }

      const targetTable = await tx.diningTable.findUnique({ where: { id: parsed.targetTableId! } });
      if (!targetTable) {
        throw new NotFoundException({ message: 'Không tìm thấy bàn đích' });
      }
      if (targetTable.activeOrderId !== targetSnapshot!.activeOrderId) {
        throw this.conflict(ErrorCodes.POS_CONCURRENT_MODIFICATION, 'Bàn đích vừa thay đổi, vui lòng tải lại sơ đồ bàn');
      }

      const targetOrderId = targetTable.activeOrderId;
      if (parsed.action !== 'MOVE' && targetOrderId === source.id) {
        throw this.conflict(ErrorCodes.POS_TABLE_NOT_OCCUPIED, 'Bàn đích phải có một đơn đang mở khác');
      }

      const logEntry = {
        action: parsed.action,
        fromTable: sourceLabel,
        toTable: targetTable.name,
        timestamp: new Date().toISOString(),
        reason: parsed.reason,
      };
      let redirectedOrderId = source.id;
      let secondRedirect: { orderId: number; fromTable: string; toTable: string; orderStatus: 'PENDING' | 'SERVING' } | undefined;
      let affectedStations = sourceStations;

      if (parsed.action === 'MOVE') {
        if (targetTable.status !== 'AVAILABLE' || targetOrderId !== null) {
          throw this.conflict(ErrorCodes.POS_TABLE_NOT_AVAILABLE, 'Bàn đích hiện không trống');
        }
        if (source.orderType === 'TAKEAWAY') {
          if (typeof (tx.orderItem as { updateMany?: unknown })?.updateMany === 'function') {
            await tx.orderItem.updateMany({
              where: { orderId: source.id },
              data: { isTakeaway: false },
            });
          }
          await tx.order.update({
            where: { id: source.id },
            data: {
              orderType: 'DINE_IN',
              tableId: targetTable.id,
              takeawayNumber: null,
              takeawayLabelFormat: null,
              tableTransferLogs: this.appendLog(source.tableTransferLogs, logEntry),
            },
          });
        } else {
          await tx.order.update({
            where: { id: source.id },
            data: { tableId: targetTable.id, tableTransferLogs: this.appendLog(source.tableTransferLogs, logEntry) },
          });
          if (sourceTable) {
            await tx.diningTable.update({
              where: { id: sourceTable.id },
              data: { status: 'AVAILABLE', activeOrderId: null },
            });
          }
        }
        await tx.diningTable.update({
          where: { id: targetTable.id },
          data: { status: source.status === 'PENDING' ? 'PENDING' : 'OCCUPIED', activeOrderId: source.id },
        });
      } else if (parsed.action === 'MERGE') {
        if (targetTable.status !== 'OCCUPIED' || targetOrderId === null) {
          throw this.conflict(ErrorCodes.POS_TABLE_NOT_OCCUPIED, 'Bàn đích chưa có khách');
        }
        const targetOrder = await tx.order.findUnique({ where: { id: targetOrderId } });
        if (!targetOrder || !activeStatuses.includes(targetOrder.status) || targetOrder.tableId !== targetTable.id) {
          throw this.conflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Đơn đích không còn mở');
        }
        await tx.orderItem.updateMany({
          where: { orderId: source.id },
          data: {
            orderId: targetOrder.id,
            ...(source.orderType === 'TAKEAWAY' ? { isTakeaway: false } : {}),
          },
        });
        const canRecomputeItems = typeof (tx.orderItem as { findMany?: unknown })?.findMany === 'function';
        if (canRecomputeItems) {
          await recomputeOrderTotals(
            tx,
            targetOrder.id,
            (targetOrder as { discountSnapshot?: unknown }).discountSnapshot ?? null,
            { tableTransferLogs: this.appendLog(targetOrder.tableTransferLogs, logEntry) },
          );
          await tx.order.update({
            where: { id: source.id },
            data: {
              status: 'MERGED',
              mergedIntoOrderId: targetOrder.id,
              subtotalAmount: new Prisma.Decimal(0),
              discountAmount: new Prisma.Decimal(0),
              discountId: null,
              discountSnapshot: Prisma.JsonNull,
              totalAmount: new Prisma.Decimal(0),
              tableTransferLogs: this.appendLog(source.tableTransferLogs, logEntry),
            },
          });
        } else {
          await tx.order.update({
            where: { id: targetOrder.id },
            data: {
              totalAmount: targetOrder.totalAmount.add(source.totalAmount),
              tableTransferLogs: this.appendLog(targetOrder.tableTransferLogs, logEntry),
            },
          });
          await tx.order.update({
            where: { id: source.id },
            data: {
              status: 'MERGED',
              mergedIntoOrderId: targetOrder.id,
              totalAmount: new Prisma.Decimal(0),
              tableTransferLogs: this.appendLog(source.tableTransferLogs, logEntry),
            },
          });
        }
        if (sourceTable) {
          await tx.diningTable.update({
            where: { id: sourceTable.id },
            data: { status: 'AVAILABLE', activeOrderId: null },
          });
        }
        redirectedOrderId = targetOrder.id;
      } else {
        // SWAP requires both orders to be DINE_IN at OCCUPIED tables
        if (
          source.orderType !== 'DINE_IN' ||
          source.tableId === null ||
          !sourceTable ||
          sourceTable.status !== 'OCCUPIED' ||
          targetTable.status !== 'OCCUPIED' ||
          targetOrderId === null ||
          source.status !== 'SERVING'
        ) {
          throw this.conflict(ErrorCodes.POS_TABLE_NOT_OCCUPIED, 'Cần hai bàn đang có đơn để đổi bàn');
        }
        const targetOrder = await tx.order.findUnique({
          where: { id: targetOrderId },
          include: {
            items: {
              include: { product: { include: { comboParents: { include: { childProduct: { select: { station: true } } } } } } },
            },
          },
        });
        if (!targetOrder || targetOrder.status !== 'SERVING' || targetOrder.tableId !== targetTable.id) {
          throw this.conflict(ErrorCodes.POS_ORDER_NOT_ACTIVE, 'Đơn ở bàn đích không còn mở');
        }
        const targetLogEntry = { ...logEntry, fromTable: targetTable.name, toTable: sourceTable.name };

        // Free the partial unique index before assigning each active order to the other table.
        await tx.order.updateMany({ where: { id: { in: [source.id, targetOrder.id] } }, data: { status: 'MERGED' } });
        await tx.order.update({ where: { id: source.id }, data: { tableId: targetTable.id } });
        await tx.order.update({ where: { id: targetOrder.id }, data: { tableId: sourceTable.id } });
        await tx.order.update({
          where: { id: source.id },
          data: { status: source.status, tableTransferLogs: this.appendLog(source.tableTransferLogs, logEntry) },
        });
        await tx.order.update({
          where: { id: targetOrder.id },
          data: { status: targetOrder.status, tableTransferLogs: this.appendLog(targetOrder.tableTransferLogs, targetLogEntry) },
        });
        await tx.diningTable.update({
          where: { id: sourceTable.id },
          data: { status: 'OCCUPIED', activeOrderId: targetOrder.id },
        });
        await tx.diningTable.update({
          where: { id: targetTable.id },
          data: { status: 'OCCUPIED', activeOrderId: source.id },
        });
        affectedStations = [...new Set([...sourceStations, ...this.printedStations(targetOrder.items)])];
        secondRedirect = {
          orderId: targetOrder.id,
          fromTable: targetTable.name,
          toTable: sourceTable.name,
          orderStatus: targetOrder.status,
        };
      }

      const kitchenTransferSlip = affectedStations.length > 0 ? {
        orderCode: source.orderCode,
        fromLabel: sourceLabel,
        toLabel: targetTable.name,
        affectedStations,
      } : undefined;
      return {
        response: TableActionResponseSchema.parse({
          action: parsed.action,
          sourceTableId: sourceTable?.id ?? null,
          targetTableId: targetTable.id,
          requireKitchenNoticePrint: kitchenTransferSlip !== undefined,
          kitchenTransferSlip,
        }),
        action: parsed.action,
        previousOrderId: source.id,
        redirectedOrderId,
        sourceNoticeStatus,
        newTableId: targetTable.id as number | null,
        newTableLabel: targetTable.name,
        previousTableLabel: sourceLabel,
        tableIds: [sourceTable?.id ?? null, targetTable.id].filter((id): id is number => id !== null),
        secondRedirect,
      };
    });

    this.emitRedirect(
      result.previousOrderId,
      result.redirectedOrderId,
      result.previousTableLabel,
      result.newTableId ?? 0,
      result.newTableLabel,
    );
    if (result.secondRedirect) {
      this.emitRedirect(
        result.secondRedirect.orderId,
        result.secondRedirect.orderId,
        result.secondRedirect.fromTable,
        result.tableIds[0]!,
        result.secondRedirect.toTable,
      );
    }
    const nowIso = new Date().toISOString();
    if (result.action === 'MERGE' && result.newTableId !== null) {
      this.gateway.emitTableOrderNotice?.(
        result.newTableId,
        {
          orderId: result.redirectedOrderId,
          tableId: result.newTableId,
          kind: 'TABLE_MERGED_INTO',
          sourceTableLabel: result.previousTableLabel,
          targetTableLabel: result.newTableLabel,
          timestamp: nowIso,
        },
        result.redirectedOrderId,
      );
    } else if (result.action === 'MOVE' && result.newTableId !== null) {
      this.gateway.emitTableOrderNotice?.(result.newTableId, {
        orderId: result.redirectedOrderId,
        tableId: result.newTableId,
        kind: 'GUEST_ORDER_CREATED',
        orderStatus: result.sourceNoticeStatus,
        timestamp: nowIso,
      });
    } else if (result.action === 'SWAP' && result.secondRedirect && result.newTableId !== null) {
      this.gateway.emitTableOrderNotice?.(result.tableIds[0]!, {
        orderId: result.secondRedirect.orderId,
        tableId: result.tableIds[0]!,
        kind: 'GUEST_ORDER_CREATED',
        orderStatus: result.secondRedirect.orderStatus,
        timestamp: nowIso,
      });
      this.gateway.emitTableOrderNotice?.(result.newTableId, {
        orderId: result.redirectedOrderId,
        tableId: result.newTableId,
        kind: 'GUEST_ORDER_CREATED',
        orderStatus: result.sourceNoticeStatus,
        timestamp: nowIso,
      });
    }
    this.gateway.emitTableGridSync({ tableIds: result.tableIds });
    this.logger.log(`Table transfer: orderId=${orderId}, action=${parsed.action}, from=${result.previousTableLabel}, to=${result.newTableLabel}, userId=${_userId ?? 'unknown'}`);
    return result.response;
  }

  private async lockOrders(tx: Prisma.TransactionClient, orderIds: number[]): Promise<void> {
    const ids = [...new Set(orderIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM orders WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
  }

  private async lockTables(tx: Prisma.TransactionClient, tableIds: Array<number | null>): Promise<void> {
    const ids = [...new Set(tableIds.filter((id): id is number => id !== null))].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM dining_tables WHERE id IN (${Prisma.join(ids)}) ORDER BY id ASC FOR UPDATE`;
  }

  private printedStations(items: Array<{
    kitchenStatus: string;
    product: { station: string; comboParents: Array<{ childProduct: { station: string } }> };
  }>): KitchenStation[] {
    const stations = items
      .filter((item) => item.kitchenStatus === 'PRINTED')
      .flatMap((item) => item.product.station === 'COMBO'
        ? item.product.comboParents.map((part) => part.childProduct.station)
        : [item.product.station]);
    return [...new Set(stations.flatMap((station) => {
      const parsed = KitchenStationSchema.safeParse(station);
      return parsed.success ? [parsed.data] : [];
    }))];
  }

  private appendLog(existing: Prisma.JsonValue, entry: Record<string, unknown>): Prisma.InputJsonValue {
    const logs = Array.isArray(existing) ? existing : [];
    return [...logs, entry] as Prisma.InputJsonValue;
  }

  private emitRedirect(
    previousOrderId: number,
    newActiveOrderId: number,
    previousTableLabel: string,
    newTableId: number,
    newTableLabel: string,
  ): void {
    this.gateway.emitOrderSessionRedirected(previousOrderId, {
      previousOrderId,
      newActiveOrderId,
      previousTableLabel,
      newTableId,
      newTableLabel,
      message: `Đơn hàng của bạn đã được chuyển sang ${newTableLabel}.`,
    });
  }

  private conflict(code: ErrorCode, message: string): ConflictException {
    return new ConflictException({ code, message });
  }
}
