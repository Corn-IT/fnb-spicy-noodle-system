import { ConflictException, Inject, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  InvoiceFilterQuerySchema,
  OrderDetailResponseSchema,
  PendingPaymentEditSchema,
  ReviewInvoicePaymentEditSchema,
  UpdateInvoicePaymentMethodSchema,
  VoidInvoiceRequestSchema,
  parseTakeawayLabelNumber,
  type AuthPrincipal,
  type InvoiceFilterQuery,
  type ReviewInvoicePaymentEditInput,
  type UpdateInvoicePaymentMethodInput,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { AuditLogService, formatPaymentMethodVi } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildIyFallbackKeywords, queryMatchingIdsBySearchNorm } from '../../common/utils/search-normalize.util';
import { recalculateSettledCashflowsForTimestamp } from '../../common/utils/cashflow-settlement.util';
import {
  formatOrderTakeawayLabel,
  normalizeTakeawayLabelFormat,
} from '../../common/utils/takeaway-format.util';
import { PaymentQrService } from '../payment-qr/payment-qr.service';
import { extractDiscountSnapshot } from './order-totals.helper';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PaymentQrService) private readonly paymentQrService?: PaymentQrService,
  ) {}

  private async resolvePaymentAccountIdForEdit(
    tx: Prisma.TransactionClient,
    currentPaymentAccountId: number | null | undefined,
    targetPaymentMethod: string,
    transferAmount: Prisma.Decimal,
    paidAt: Date | null | undefined,
  ): Promise<number | null | undefined> {
    if (targetPaymentMethod === 'CASH') return null;
    if (currentPaymentAccountId) return currentPaymentAccountId;
    const txWithQr = tx as unknown as { paymentAccount?: { findMany?: unknown } };
    if (typeof txWithQr.paymentAccount?.findMany !== 'function') return undefined;
    const qrService = this.paymentQrService ?? new PaymentQrService(this.prisma, this.auditLogService);
    const selection = await qrService.selectForAmount(tx, transferAmount, paidAt ?? new Date());
    return selection.account.id;
  }

  async list(input: InvoiceFilterQuery) {
    const parsed = InvoiceFilterQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Bộ lọc hoá đơn không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const { page, limit, fromDate, toDate, keyword, searchField, discountCode, paymentMethod, orderType } = parsed.data;
    const today = this.businessDate(new Date());
    const rangeStart = this.dateAtVietnamMidnight(fromDate ?? today);
    const rangeEnd = new Date(this.dateAtVietnamMidnight(toDate ?? today).getTime() + 24 * 60 * 60 * 1000);

    const andConditions: Prisma.OrderWhereInput[] = [
      {
        OR: [
          { createdAt: { gte: rangeStart, lt: rangeEnd } },
          { paidAt: { gte: rangeStart, lt: rangeEnd } },
        ],
      },
    ];

    andConditions.push({ status: 'PAID' });
    if (paymentMethod) andConditions.push({ paymentMethod });
    if (orderType) andConditions.push({ orderType });
    if (discountCode) {
      andConditions.push({
        discount: { is: { code: { contains: discountCode.trim(), mode: 'insensitive' as const } } },
      });
    }

    const resolvedSearchField = searchField ?? (keyword ? 'order_code' : undefined);
    if (keyword && resolvedSearchField) {
      const contains = { contains: keyword, mode: 'insensitive' as const };
      if (resolvedSearchField === 'order_code') {
        andConditions.push({ orderCode: contains });
      } else if (resolvedSearchField === 'note') {
        andConditions.push({ note: contains });
      } else if (resolvedSearchField === 'discount_code') {
        andConditions.push({ discount: { is: { code: { contains: keyword.trim(), mode: 'insensitive' as const } } } });
      } else {
        const digitsOnly = keyword.replace(/\D/g, '');
        const parsedDigits = digitsOnly ? parseInt(digitsOnly, 10) : NaN;
        const parsedLabelNum = parseTakeawayLabelNumber(keyword);
        const resolvedTakeawayNum = parsedLabelNum ?? (!isNaN(parsedDigits) ? parsedDigits : null);
        const isTakeawayKeyword = /mang\s*v[eề]|takeaway/i.test(keyword);
        const matchedTableIds = await queryMatchingIdsBySearchNorm(
          this.prisma,
          'dining_tables',
          ['name'],
          keyword,
        );
        const tableConditions: Prisma.OrderWhereInput[] =
          matchedTableIds !== null
            ? [{ tableId: { in: matchedTableIds } }]
            : buildIyFallbackKeywords(keyword).map((v) => ({
                table: { is: { name: { contains: v, mode: 'insensitive' as const } } },
              }));
        andConditions.push({
          OR: [
            ...tableConditions,
            ...(isTakeawayKeyword ? [{ orderType: 'TAKEAWAY' as const }] : []),
            ...(resolvedTakeawayNum !== null ? [{ orderType: 'TAKEAWAY' as const, takeawayNumber: resolvedTakeawayNum }] : []),
          ],
        });
      }
    }

    const where: Prisma.OrderWhereInput = { AND: andConditions };

    const [total, orders, aggregateResult] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { table: { select: { id: true, name: true } } },
      }),
      typeof this.prisma.order?.aggregate === 'function'
        ? this.prisma.order.aggregate({
            where,
            _sum: {
              totalAmount: true,
              cashAmount: true,
              transferAmount: true,
              discountAmount: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const totalPaidAmount = aggregateResult?._sum?.totalAmount?.toNumber()
      ?? orders.reduce((sum, order) => sum + order.totalAmount.toNumber(), 0);
    const totalCashAmount = aggregateResult?._sum?.cashAmount?.toNumber() ?? 0;
    const totalTransferAmount = aggregateResult?._sum?.transferAmount?.toNumber() ?? 0;
    const totalDiscountAmount = (aggregateResult?._sum as { discountAmount?: Prisma.Decimal | null } | undefined)?.discountAmount?.toNumber() ?? 0;

    return {
      page,
      limit,
      total,
      summary: {
        totalPaidAmount,
        totalCashAmount,
        totalTransferAmount,
        totalDiscountAmount,
        paidCount: total,
      },
      items: orders.map((order) => {
        const rec = order as typeof order & {
          cashAmount?: Prisma.Decimal;
          transferAmount?: Prisma.Decimal;
          subtotalAmount?: Prisma.Decimal;
          discountAmount?: Prisma.Decimal;
          discountId?: number | null;
          discountSnapshot?: Prisma.JsonValue | null;
          pendingPaymentEdit?: Prisma.JsonValue | null;
          takeawayLabelFormat?: string | null;
        };
        const takeawayLabelFormat = order.orderType === 'TAKEAWAY'
          ? (normalizeTakeawayLabelFormat(rec.takeawayLabelFormat) ?? 'NUMBER')
          : null;
        const parsedPending = rec.pendingPaymentEdit ? PendingPaymentEditSchema.safeParse(rec.pendingPaymentEdit) : null;
        return {
          orderId: order.id,
          orderCode: order.orderCode,
          orderType: order.orderType,
          tableId: order.tableId,
          tableLabel: order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
            ? formatOrderTakeawayLabel(order.takeawayNumber, takeawayLabelFormat)
            : order.table?.name ?? null,
          takeawayNumber: order.takeawayNumber,
          takeawayLabelFormat,
          status: order.status,
          paymentMethod: order.paymentMethod,
          cashAmount: rec.cashAmount ? rec.cashAmount.toNumber() : 0,
          transferAmount: rec.transferAmount ? rec.transferAmount.toNumber() : 0,
          subtotalAmount: rec.subtotalAmount ? rec.subtotalAmount.toNumber() : order.totalAmount.toNumber(),
          discountAmount: rec.discountAmount ? rec.discountAmount.toNumber() : 0,
          discountId: rec.discountId ?? null,
          discountSnapshot: extractDiscountSnapshot(rec.discountSnapshot),
          totalAmount: order.totalAmount.toNumber(),
          createdAt: order.createdAt.toISOString(),
          paidAt: order.paidAt?.toISOString() ?? null,
          note: order.note,
          pendingPaymentEdit: parsedPending?.success ? parsedPending.data : null,
        };
      }),
    };
  }

  async get(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, name: true } },
        items: {
          orderBy: [{ batchNo: 'asc' }, { id: 'asc' }],
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException({ message: 'Không tìm thấy hoá đơn' });

    const takeawayLabelFormat = order.orderType === 'TAKEAWAY'
      ? (normalizeTakeawayLabelFormat((order as { takeawayLabelFormat?: unknown }).takeawayLabelFormat) ?? 'NUMBER')
      : null;

    return OrderDetailResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      orderSource: order.orderSource,
      tableId: order.tableId,
      tableLabel: order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
        ? formatOrderTakeawayLabel(order.takeawayNumber, takeawayLabelFormat)
        : order.table?.name ?? null,
      takeawayNumber: order.takeawayNumber,
      takeawayLabelFormat,
      status: order.status,
      paymentMethod: order.paymentMethod,
      cashAmount: order.cashAmount.toNumber(),
      transferAmount: order.transferAmount.toNumber(),
      subtotalAmount: (() => {
        const raw = (order as { subtotalAmount?: Prisma.Decimal }).subtotalAmount;
        return raw ? raw.toNumber() : order.totalAmount.toNumber();
      })(),
      discountAmount: (() => {
        const raw = (order as { discountAmount?: Prisma.Decimal }).discountAmount;
        return raw ? raw.toNumber() : 0;
      })(),
      discountId: (order as { discountId?: number | null }).discountId ?? null,
      discountSnapshot: extractDiscountSnapshot((order as { discountSnapshot?: unknown }).discountSnapshot),
      totalAmount: order.totalAmount.toNumber(),
      note: order.note,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      pendingPaymentEdit: (() => {
        const raw = (order as { pendingPaymentEdit?: unknown }).pendingPaymentEdit;
        const parsed = raw ? PendingPaymentEditSchema.safeParse(raw) : null;
        return parsed?.success ? parsed.data : null;
      })(),
      tableTransferLogs: Array.isArray(order.tableTransferLogs) ? order.tableTransferLogs : [],
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
        modifiers: this.modifierNames(item.modifiersSnapshot),
        pricedModifiers: this.pricedModifierNames(item.modifiersSnapshot),
        itemNote: item.itemNote,
        batchNo: item.batchNo,
        kitchenStatus: item.kitchenStatus,
        ...((item as { isTakeaway?: boolean }).isTakeaway ? { isTakeaway: true } : {}),
      })),
    });
  }

  async reprint(id: number, actor: AuthPrincipal) {
    const detail = await this.get(id);
    if (detail.status !== 'PAID') {
      throw new ConflictException({
        code: detail.status === 'VOIDED' ? 'POS_INVOICE_VOIDED' : 'POS_ORDER_NOT_ACTIVE',
        message:
          detail.status === 'VOIDED'
            ? 'Không thể in lại hoá đơn đã huỷ (VOIDED)'
            : 'Chỉ được phép in lại hoá đơn đã thanh toán',
      });
    }
    await this.auditLogService?.record({
      module: 'INVOICES',
      action: 'In lại hoá đơn',
      detail: detail.orderCode,
      message: `in lại hoá đơn ${detail.orderCode}${detail.tableLabel ? ` (${detail.tableLabel})` : ''}`,
      actor: actor.id,
      metadata: { orderId: id, orderCode: detail.orderCode, tableLabel: detail.tableLabel },
    });
    return detail;
  }

  async voidInvoice(id: number, input: VoidInvoiceRequest, actorId: number) {
    const parsed = VoidInvoiceRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Lý do huỷ hoá đơn không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} ORDER BY id ASC FOR UPDATE`;
      const existing = await tx.order.findUnique({
        where: { id },
        select: { id: true, status: true, discountId: true, discountAmount: true },
      }) as { id: number; status: string; discountId?: number | null; discountAmount?: Prisma.Decimal | null } | null;
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy hoá đơn' });
      if (existing.status !== 'PAID') {
        throw new ConflictException({ code: 'POS_ORDER_NOT_ACTIVE', message: 'Chỉ có thể huỷ hoá đơn đã thanh toán' });
      }
      if (existing.discountId !== null && existing.discountId !== undefined && Number(existing.discountAmount ?? 0) > 0) {
        await tx.$queryRaw`SELECT id FROM discounts WHERE id = ${existing.discountId} ORDER BY id ASC FOR UPDATE`;
        await tx.$executeRaw`
          UPDATE discounts
          SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
          WHERE id = ${existing.discountId}
        `;
      }
      return tx.order.update({
        where: { id },
        data: { status: 'VOIDED', voidReason: parsed.data.voidReason },
        select: { id: true, orderCode: true, status: true, voidReason: true },
      });
    });

    await this.auditLogService?.record({
      module: 'INVOICES',
      action: 'Huỷ hoá đơn',
      detail: `${order.orderCode} (Lý do: ${parsed.data.voidReason})`,
      message: `huỷ hoá đơn đã thanh toán ${order.orderCode} (Lý do: ${parsed.data.voidReason})`,
      actor: actorId,
      metadata: {
        orderId: order.id,
        orderCode: order.orderCode,
        voidReason: parsed.data.voidReason,
      },
    });

    return { orderId: order.id, orderCode: order.orderCode, status: order.status, voidReason: order.voidReason };
  }

  async requestPaymentMethodEdit(id: number, input: UpdateInvoicePaymentMethodInput, actor: AuthPrincipal) {
    const parsed = UpdateInvoicePaymentMethodSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu chỉnh sửa phương thức thanh toán không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const canAutoApprove = actor.isSuperAdmin || Boolean(actor.permissions?.invoices?.approve);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} ORDER BY id ASC FOR UPDATE`;
      const existing = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderCode: true,
          status: true,
          paymentMethod: true,
          paymentAccountId: true,
          totalAmount: true,
          paidAt: true,
        },
      });
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy hoá đơn' });
      if (existing.status !== 'PAID') {
        throw new ConflictException({
          code: 'POS_ORDER_NOT_ACTIVE',
          message: 'Chỉ được phép chỉnh sửa phương thức thanh toán cho hoá đơn đã thanh toán',
        });
      }

      const totalCents = existing.totalAmount.mul(100).toDecimalPlaces(0).toNumber();
      let cashCents = 0;
      let transferCents = 0;
      if (parsed.data.paymentMethod === 'CASH') {
        cashCents = totalCents;
      } else if (parsed.data.paymentMethod === 'TRANSFER') {
        transferCents = totalCents;
      } else {
        cashCents = new Prisma.Decimal(parsed.data.cashAmount).mul(100).toDecimalPlaces(0).toNumber();
        transferCents = new Prisma.Decimal(parsed.data.transferAmount).mul(100).toDecimalPlaces(0).toNumber();
        if (cashCents <= 0 || transferCents <= 0 || cashCents + transferCents !== totalCents) {
          throw new UnprocessableEntityException({
            code: 'VALIDATION_FAILED',
            message: 'Tiền mặt và chuyển khoản phải lớn hơn 0 và cộng lại bằng tổng hoá đơn',
          });
        }
      }

      const cashAmountDec = new Prisma.Decimal(cashCents).div(100).toDecimalPlaces(2);
      const transferAmountDec = new Prisma.Decimal(transferCents).div(100).toDecimalPlaces(2);

      if (canAutoApprove) {
        const nextPaymentAccountId = await this.resolvePaymentAccountIdForEdit(
          tx,
          (existing as { paymentAccountId?: number | null }).paymentAccountId,
          parsed.data.paymentMethod,
          transferAmountDec,
          existing.paidAt,
        );
        await tx.order.update({
          where: { id },
          data: {
            paymentMethod: parsed.data.paymentMethod,
            ...(nextPaymentAccountId !== undefined ? { paymentAccountId: nextPaymentAccountId } : {}),
            cashAmount: cashAmountDec,
            transferAmount: transferAmountDec,
            pendingPaymentEdit: Prisma.DbNull,
          },
        });
        const syncedSettlementIds = await recalculateSettledCashflowsForTimestamp(tx, existing.paidAt);
        const fromLabel = formatPaymentMethodVi(existing.paymentMethod);
        const toLabel = formatPaymentMethodVi(parsed.data.paymentMethod);
        await this.auditLogService?.record({
          module: 'INVOICES',
          action: 'Sửa & duyệt PTTT',
          detail: `${existing.orderCode} (${fromLabel} -> ${toLabel})`,
          message: 'chỉnh sửa và duyệt đổi phương thức thanh toán',
          actor: actor.id,
          metadata: {
            orderId: id,
            orderCode: existing.orderCode,
            fromPaymentMethodLabel: fromLabel,
            toPaymentMethodLabel: toLabel,
            reason: parsed.data.reason,
            syncedSettlementIds,
            changes: [{ field: 'Phương thức thanh toán', from: fromLabel, to: toLabel }],
          },
          tx,
        });
        return {
          orderId: id,
          orderCode: existing.orderCode,
          status: 'APPLIED' as const,
          paymentMethod: parsed.data.paymentMethod,
          cashAmount: cashAmountDec.toNumber(),
          transferAmount: transferAmountDec.toNumber(),
          pendingPaymentEdit: null,
          syncedSettlementIds,
        };
      }

      const userInfo = typeof tx.user?.findUnique === 'function'
        ? await tx.user.findUnique({
            where: { id: actor.id },
            select: { username: true, employee: { select: { fullName: true } } },
          })
        : null;

      const pendingEdit = PendingPaymentEditSchema.parse({
        paymentMethod: parsed.data.paymentMethod,
        cashAmount: cashAmountDec.toNumber(),
        transferAmount: transferAmountDec.toNumber(),
        reason: parsed.data.reason,
        requestedBy: actor.id,
        requestedByName: userInfo?.employee?.fullName ?? actor.username,
        requestedByUsername: userInfo?.username ?? actor.username,
        requestedAt: new Date().toISOString(),
      });

      await tx.order.update({
        where: { id },
        data: { pendingPaymentEdit: pendingEdit as unknown as Prisma.InputJsonObject },
      });

      const fromLabel = formatPaymentMethodVi(existing.paymentMethod);
      const toLabel = formatPaymentMethodVi(parsed.data.paymentMethod);
      await this.auditLogService?.record({
        module: 'INVOICES',
        action: 'Gửi duyệt sửa PTTT',
        detail: `${existing.orderCode} (${fromLabel} -> ${toLabel})`,
        message: 'gửi yêu cầu sửa phương thức thanh toán',
        actor: actor.id,
        metadata: {
          orderId: id,
          orderCode: existing.orderCode,
          fromPaymentMethodLabel: fromLabel,
          toPaymentMethodLabel: toLabel,
          reason: parsed.data.reason,
          changes: [{ field: 'Phương thức thanh toán (đề xuất)', from: fromLabel, to: toLabel }],
        },
        tx,
      });

      return {
        orderId: id,
        orderCode: existing.orderCode,
        status: 'PENDING_APPROVAL' as const,
        pendingPaymentEdit: pendingEdit,
      };
    });

    return outcome;
  }

  async reviewPaymentMethodEdit(id: number, input: ReviewInvoicePaymentEditInput, actor: AuthPrincipal) {
    const parsed = ReviewInvoicePaymentEditSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu duyệt chỉnh sửa hoá đơn không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} ORDER BY id ASC FOR UPDATE`;
      const existing = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderCode: true,
          status: true,
          paymentMethod: true,
          paymentAccountId: true,
          paidAt: true,
          pendingPaymentEdit: true,
        },
      });
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy hoá đơn' });
      const pendingParsed = existing.pendingPaymentEdit
        ? PendingPaymentEditSchema.safeParse(existing.pendingPaymentEdit)
        : null;
      if (!pendingParsed?.success) {
        throw new ConflictException({
          code: 'INVOICE_NO_PENDING_EDIT',
          message: 'Hoá đơn này không có yêu cầu chỉnh sửa PTTT nào đang chờ duyệt',
        });
      }

      if (parsed.data.decision === 'REJECT') {
        await tx.order.update({
          where: { id },
          data: { pendingPaymentEdit: Prisma.DbNull },
        });
        await this.auditLogService?.record({
          module: 'INVOICES',
          action: 'Từ chối sửa PTTT',
          detail: `${existing.orderCode}${parsed.data.reviewNote ? ` (${parsed.data.reviewNote})` : ''}`,
          message: `từ chối yêu cầu sửa phương thức thanh toán hoá đơn ${existing.orderCode}${parsed.data.reviewNote ? ` (Ghi chú: ${parsed.data.reviewNote})` : ''}`,
          actor: actor.id,
          metadata: {
            orderId: id,
            orderCode: existing.orderCode,
            decisionLabel: 'Từ chối',
            ...(parsed.data.reviewNote ? { reason: parsed.data.reviewNote } : {}),
          },
          tx,
        });
        return { orderId: id, orderCode: existing.orderCode, status: 'REJECTED' as const };
      }

      const pending = pendingParsed.data;
      const transferDec = new Prisma.Decimal(pending.transferAmount);
      const nextPaymentAccountId = await this.resolvePaymentAccountIdForEdit(
        tx,
        (existing as { paymentAccountId?: number | null }).paymentAccountId,
        pending.paymentMethod,
        transferDec,
        existing.paidAt,
      );
      await tx.order.update({
        where: { id },
        data: {
          paymentMethod: pending.paymentMethod,
          ...(nextPaymentAccountId !== undefined ? { paymentAccountId: nextPaymentAccountId } : {}),
          cashAmount: new Prisma.Decimal(pending.cashAmount),
          transferAmount: transferDec,
          pendingPaymentEdit: Prisma.DbNull,
        },
      });
      const syncedSettlementIds = await recalculateSettledCashflowsForTimestamp(tx, existing.paidAt);

      const fromLabel = formatPaymentMethodVi(existing.paymentMethod);
      const toLabel = formatPaymentMethodVi(pending.paymentMethod);
      await this.auditLogService?.record({
        module: 'INVOICES',
        action: 'Duyệt sửa PTTT',
        detail: `${existing.orderCode} (${fromLabel} -> ${toLabel})`,
        message: 'duyệt sửa phương thức thanh toán',
        actor: actor.id,
        metadata: {
          orderId: id,
          orderCode: existing.orderCode,
          decisionLabel: 'Đã duyệt',
          fromPaymentMethodLabel: fromLabel,
          toPaymentMethodLabel: toLabel,
          syncedSettlementIds,
          changes: [{ field: 'Phương thức thanh toán', from: fromLabel, to: toLabel }],
        },
        tx,
      });

      return {
        orderId: id,
        orderCode: existing.orderCode,
        status: 'APPROVED' as const,
        paymentMethod: pending.paymentMethod,
        cashAmount: pending.cashAmount,
        transferAmount: pending.transferAmount,
        syncedSettlementIds,
      };
    });
  }

  private modifierNames(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string'
      ? [entry.name]
      : []);
  }

  private pricedModifierNames(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string') return [];
      const extra = 'extraPrice' in entry ? Number((entry as { extraPrice?: unknown }).extraPrice) : 0;
      return Number.isFinite(extra) && extra > 0 ? [entry.name] : [];
    });
  }

  private businessDate(now: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private dateAtVietnamMidnight(day: string): Date {
    return new Date(`${day}T00:00:00.000+07:00`);
  }
}
