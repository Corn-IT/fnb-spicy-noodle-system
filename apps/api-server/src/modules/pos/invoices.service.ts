import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  InvoiceFilterQuerySchema,
  OrderDetailResponseSchema,
  VoidInvoiceRequestSchema,
  type InvoiceFilterQuery,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(input: InvoiceFilterQuery) {
    const parsed = InvoiceFilterQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Bộ lọc hoá đơn không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const { page, limit, fromDate, toDate, keyword, searchField, status, paymentMethod } = parsed.data;
    const today = this.businessDate(new Date());
    const rangeStart = this.dateAtVietnamMidnight(fromDate ?? today);
    const rangeEnd = new Date(this.dateAtVietnamMidnight(toDate ?? today).getTime() + 24 * 60 * 60 * 1000);
    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: rangeStart, lt: rangeEnd },
      ...(status ? { status } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
    };

    const resolvedSearchField = searchField ?? (keyword ? 'order_code' : undefined);
    if (keyword && resolvedSearchField) {
      const contains = { contains: keyword, mode: 'insensitive' as const };
      if (resolvedSearchField === 'order_code') where.orderCode = contains;
      else if (resolvedSearchField === 'note') where.note = contains;
      else where.table = { is: { name: contains } };
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { table: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: orders.map((order) => ({
        orderId: order.id,
        orderCode: order.orderCode,
        orderType: order.orderType,
        tableId: order.tableId,
        tableLabel: order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
          ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
          : order.table?.name ?? null,
        takeawayNumber: order.takeawayNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount.toNumber(),
        createdAt: order.createdAt.toISOString(),
        note: order.note,
      })),
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

    return OrderDetailResponseSchema.parse({
      orderId: order.id,
      orderCode: order.orderCode,
      orderType: order.orderType,
      orderSource: order.orderSource,
      tableId: order.tableId,
      tableLabel: order.orderType === 'TAKEAWAY' && order.takeawayNumber !== null
        ? `Mang về #${String(order.takeawayNumber).padStart(2, '0')}`
        : order.table?.name ?? null,
      takeawayNumber: order.takeawayNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      cashAmount: order.cashAmount.toNumber(),
      transferAmount: order.transferAmount.toNumber(),
      totalAmount: order.totalAmount.toNumber(),
      note: order.note,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      tableTransferLogs: Array.isArray(order.tableTransferLogs) ? order.tableTransferLogs : [],
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
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

  async voidInvoice(id: number, input: VoidInvoiceRequest, _actorId: number) {
    void _actorId;
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
      const existing = await tx.order.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy hoá đơn' });
      if (existing.status !== 'PAID') {
        throw new ConflictException({ code: 'POS_ORDER_NOT_ACTIVE', message: 'Chỉ có thể huỷ hoá đơn đã thanh toán' });
      }
      return tx.order.update({
        where: { id },
        data: { status: 'VOIDED', voidReason: parsed.data.voidReason },
        select: { id: true, orderCode: true, status: true, voidReason: true },
      });
    });

    return { orderId: order.id, orderCode: order.orderCode, status: order.status, voidReason: order.voidReason };
  }

  private modifierNames(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string'
      ? [entry.name]
      : []);
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
