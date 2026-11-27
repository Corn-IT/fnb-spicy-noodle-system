import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreatePaymentAccountRequestSchema,
  ErrorCodes,
  PaymentAccountBriefSchema,
  PaymentAccountOrdersQuerySchema,
  PaymentAccountOrdersResponseSchema,
  PaymentAccountSchema,
  PaymentAccountStatus,
  ReorderPaymentAccountsRequestSchema,
  UpdatePaymentAccountRequestSchema,
  VietQrBankCodeSchema,
  findPaymentQrLimitHierarchyViolation,
  getVietQrBankShortName,
  type CreatePaymentAccountRequest,
  type PaymentAccount,
  type PaymentAccountBrief,
  type PaymentAccountOrdersQuery,
  type PaymentAccountOrdersResponse,
  type PaymentAccountStatus as PaymentAccountStatusType,
  type ReorderPaymentAccountsRequest,
  type UpdatePaymentAccountRequest,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatOrderTakeawayLabel } from '../../common/utils/takeaway-format.util';
import { normalizeVietnameseString } from '../../common/utils/normalized-string.util';

const ZERO = new Prisma.Decimal(0);

export interface PaymentAccountRow {
  id: number;
  label: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
  priority: number;
  isActive: boolean;
  dailyLimit: Prisma.Decimal | null;
  monthlyLimit: Prisma.Decimal | null;
  yearlyLimit: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountUsageStats {
  usedDay: Prisma.Decimal;
  usedMonth: Prisma.Decimal;
  usedYear: Prisma.Decimal;
}

export interface QrSelectionResult {
  account: PaymentAccountRow;
  brief: PaymentAccountBrief;
  rotated: boolean;
  overLimit: boolean;
}

type DbClient = PrismaService | Prisma.TransactionClient;

export function getVnPeriodBounds(now: Date): {
  dayStart: Date;
  monthStart: Date;
  yearStart: Date;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return {
    dayStart: new Date(`${year}-${month}-${day}T00:00:00.000+07:00`),
    monthStart: new Date(`${year}-${month}-01T00:00:00.000+07:00`),
    yearStart: new Date(`${year}-01-01T00:00:00.000+07:00`),
  };
}

export function normalizeAccountHolderName(raw: string): string {
  return normalizeVietnameseString(raw).toUpperCase();
}

@Injectable()
export class PaymentQrService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  async list(now = new Date()): Promise<PaymentAccount[]> {
    const accounts = await this.normalizePriorities(this.prisma);

    const [usageByAccount, countByAccount] = await Promise.all([
      this.computeUsageMap(this.prisma, now),
      this.computeOrderCountMap(this.prisma),
    ]);

    return accounts.map((row) =>
      this.toPaymentAccountDto(
        row,
        usageByAccount.get(row.id) ?? { usedDay: ZERO, usedMonth: ZERO, usedYear: ZERO },
        countByAccount.get(row.id) ?? 0,
      ),
    );
  }

  async create(input: CreatePaymentAccountRequest, actorId?: number, now = new Date()): Promise<PaymentAccount> {
    const parsed = this.parseInput(CreatePaymentAccountRequestSchema, input);
    const normalizedHolder = normalizeAccountHolderName(parsed.accountName);

    const created = await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.paymentAccount.findUnique({
        where: {
          bankCode_accountNo: {
            bankCode: parsed.bankCode,
            accountNo: parsed.accountNo,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException({
          code: ErrorCodes.PAYMENT_QR_DUPLICATE_ACCOUNT,
          message: `Tài khoản ${getVietQrBankShortName(parsed.bankCode)} - ${parsed.accountNo} đã tồn tại`,
        });
      }

      const maxAgg = await tx.paymentAccount.aggregate({ _max: { priority: true } });
      const nextPriority = (maxAgg._max.priority ?? 0) + 1;

      const row = (await tx.paymentAccount.create({
        data: {
          label: parsed.label,
          bankCode: parsed.bankCode,
          accountNo: parsed.accountNo,
          accountName: normalizedHolder,
          priority: nextPriority,
          isActive: parsed.isActive,
          dailyLimit: parsed.dailyLimit !== null ? new Prisma.Decimal(parsed.dailyLimit) : null,
          monthlyLimit: parsed.monthlyLimit !== null ? new Prisma.Decimal(parsed.monthlyLimit) : null,
          yearlyLimit: parsed.yearlyLimit !== null ? new Prisma.Decimal(parsed.yearlyLimit) : null,
        },
      })) as PaymentAccountRow;

      const normalized = await this.normalizePriorities(
        tx,
        parsed.isActive ? { moveToActiveTailId: row.id } : { moveToInactiveTailId: row.id },
      );
      return normalized.find((a) => a.id === row.id) ?? row;
    });

    await this.auditLogService?.record({
      module: 'PAYMENT_QR',
      action: 'Thêm mã QR',
      detail: `${created.label} (${getVietQrBankShortName(created.bankCode)} - ${created.accountNo})`,
      actor: actorId,
      metadata: {
        paymentAccountId: created.id,
        label: created.label,
        bankCode: created.bankCode,
        accountNo: created.accountNo,
      },
    });

    const usageMap = await this.computeUsageMap(this.prisma, now);
    return this.toPaymentAccountDto(
      created,
      usageMap.get(created.id) ?? { usedDay: ZERO, usedMonth: ZERO, usedYear: ZERO },
      0,
    );
  }

  async update(
    id: number,
    input: UpdatePaymentAccountRequest,
    actorId?: number,
    now = new Date(),
  ): Promise<PaymentAccount> {
    const parsed = this.parseInput(UpdatePaymentAccountRequestSchema, input);

    const { updated, orderCount } = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.paymentAccount.findUnique({ where: { id } })) as PaymentAccountRow | null;
      if (!existing) {
        throw new NotFoundException({ message: 'Không tìm thấy mã QR thanh toán' });
      }

      const count = await tx.order.count({
        where: {
          paymentAccountId: id,
          status: 'PAID',
          paymentMethod: { in: ['TRANSFER', 'SPLIT'] },
        },
      });
      const bankChanging = parsed.bankCode !== undefined && parsed.bankCode !== existing.bankCode;
      const accountNoChanging = parsed.accountNo !== undefined && parsed.accountNo !== existing.accountNo;

      if (count > 0 && (bankChanging || accountNoChanging)) {
        throw new ConflictException({
          code: ErrorCodes.PAYMENT_QR_LOCKED_FIELD,
          message: 'Không thể đổi Ngân hàng hoặc Số tài khoản của mã QR đã có hoá đơn gắn kết',
        });
      }

      const nextBankCode = parsed.bankCode ?? existing.bankCode;
      const nextAccountNo = parsed.accountNo ?? existing.accountNo;
      if (bankChanging || accountNoChanging) {
        const duplicate = await tx.paymentAccount.findUnique({
          where: {
            bankCode_accountNo: {
              bankCode: nextBankCode,
              accountNo: nextAccountNo,
            },
          },
        });
        if (duplicate && duplicate.id !== id) {
          throw new ConflictException({
            code: ErrorCodes.PAYMENT_QR_DUPLICATE_ACCOUNT,
            message: `Tài khoản ${getVietQrBankShortName(nextBankCode)} - ${nextAccountNo} đã tồn tại`,
          });
        }
      }

      const nextDaily = parsed.dailyLimit !== undefined ? parsed.dailyLimit : existing.dailyLimit?.toNumber() ?? null;
      const nextMonthly = parsed.monthlyLimit !== undefined ? parsed.monthlyLimit : existing.monthlyLimit?.toNumber() ?? null;
      const nextYearly = parsed.yearlyLimit !== undefined ? parsed.yearlyLimit : existing.yearlyLimit?.toNumber() ?? null;
      const limitViolation = findPaymentQrLimitHierarchyViolation({
        dailyLimit: nextDaily,
        monthlyLimit: nextMonthly,
        yearlyLimit: nextYearly,
      });
      if (limitViolation) {
        throw new UnprocessableEntityException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: limitViolation.message,
        });
      }

      if (parsed.isActive === false && existing.isActive) {
        const activeAccounts = await tx.paymentAccount.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        if (!activeAccounts.some((a) => a.id !== id)) {
          throw new ConflictException({
            code: ErrorCodes.PAYMENT_QR_LAST_ACTIVE,
            message: 'Hệ thống phải giữ lại ít nhất 1 mã QR đang bật để thu ngân in phiếu tạm tính.',
          });
        }
      }

      const toggledToInactive = parsed.isActive === false && existing.isActive;
      const toggledToActive = parsed.isActive === true && !existing.isActive;

      const row = (await tx.paymentAccount.update({
        where: { id },
        data: {
          ...(parsed.label !== undefined ? { label: parsed.label } : {}),
          ...(parsed.bankCode !== undefined ? { bankCode: parsed.bankCode } : {}),
          ...(parsed.accountNo !== undefined ? { accountNo: parsed.accountNo } : {}),
          ...(parsed.accountName !== undefined
            ? { accountName: normalizeAccountHolderName(parsed.accountName) }
            : {}),
          ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
          ...(parsed.dailyLimit !== undefined
            ? { dailyLimit: parsed.dailyLimit !== null ? new Prisma.Decimal(parsed.dailyLimit) : null }
            : {}),
          ...(parsed.monthlyLimit !== undefined
            ? { monthlyLimit: parsed.monthlyLimit !== null ? new Prisma.Decimal(parsed.monthlyLimit) : null }
            : {}),
          ...(parsed.yearlyLimit !== undefined
            ? { yearlyLimit: parsed.yearlyLimit !== null ? new Prisma.Decimal(parsed.yearlyLimit) : null }
            : {}),
          updatedAt: new Date(),
        },
      })) as PaymentAccountRow;

      const normalized = await this.normalizePriorities(
        tx,
        toggledToInactive
          ? { moveToInactiveTailId: id }
          : toggledToActive
            ? { moveToActiveTailId: id }
            : undefined,
      );

      return { updated: normalized.find((a) => a.id === id) ?? row, orderCount: count };
    });

    await this.auditLogService?.record({
      module: 'PAYMENT_QR',
      action: 'Cập nhật mã QR',
      detail: `${updated.label} (${getVietQrBankShortName(updated.bankCode)} - ${updated.accountNo})`,
      actor: actorId,
      metadata: {
        paymentAccountId: updated.id,
        label: updated.label,
        isActive: updated.isActive,
      },
    });

    const usageMap = await this.computeUsageMap(this.prisma, now);
    return this.toPaymentAccountDto(
      updated,
      usageMap.get(updated.id) ?? { usedDay: ZERO, usedMonth: ZERO, usedYear: ZERO },
      orderCount,
    );
  }

  async reorder(input: ReorderPaymentAccountsRequest, actorId?: number, now = new Date()): Promise<PaymentAccount[]> {
    const parsed = this.parseInput(ReorderPaymentAccountsRequestSchema, input);

    await this.prisma.$transaction(async (tx) => {
      const all = (await tx.paymentAccount.findMany({
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      })) as PaymentAccountRow[];

      const existingIds = new Set(all.map((a) => a.id));
      for (const id of parsed.orderedIds) {
        if (!existingIds.has(id)) {
          throw new NotFoundException({ message: `Mã QR #${id} không tồn tại` });
        }
      }

      await this.normalizePriorities(tx, { preferredActiveIds: parsed.orderedIds });
    });

    await this.auditLogService?.record({
      module: 'PAYMENT_QR',
      action: 'Đổi thứ tự ưu tiên',
      detail: `Thứ tự ID: ${parsed.orderedIds.join(' → ')}`,
      actor: actorId,
      metadata: { orderedIds: parsed.orderedIds },
    });

    return this.list(now);
  }

  async remove(id: number, actorId?: number): Promise<{ deletedId: number }> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.paymentAccount.findUnique({ where: { id } })) as PaymentAccountRow | null;
      if (!existing) {
        throw new NotFoundException({ message: 'Không tìm thấy mã QR thanh toán' });
      }

      const allAccounts = await tx.paymentAccount.findMany({ select: { id: true } });
      if (allAccounts.length <= 1) {
        throw new ConflictException({
          code: ErrorCodes.PAYMENT_QR_LAST_ACTIVE,
          message: 'Không thể xoá mã QR duy nhất còn lại trong hệ thống.',
        });
      }

      if (existing.isActive) {
        throw new ConflictException({
          code: ErrorCodes.PAYMENT_QR_CANNOT_DELETE_ACTIVE,
          message: 'Mã QR đang ở trạng thái bật. Vui lòng chuyển sang Đang tắt trước khi xoá.',
        });
      }

      const count = await tx.order.count({
        where: {
          paymentAccountId: id,
          status: 'PAID',
          paymentMethod: { in: ['TRANSFER', 'SPLIT'] },
        },
      });
      if (count > 0) {
        throw new ConflictException({
          code: ErrorCodes.PAYMENT_QR_IN_USE,
          message: 'Mã QR đã có lịch sử hoá đơn nên không thể xoá cứng. Vui lòng giữ ở trạng thái Đang tắt.',
        });
      }

      // Detach any provisional/voided non-PAID references before deleting so RESTRICT FK never fails
      const orderDelegate = tx.order as unknown as {
        updateMany?: (args: {
          where: { paymentAccountId: number; status: { not: 'PAID' } };
          data: { paymentAccountId: null };
        }) => Promise<unknown>;
      };
      if (typeof orderDelegate.updateMany === 'function') {
        await orderDelegate.updateMany({
          where: { paymentAccountId: id, status: { not: 'PAID' } },
          data: { paymentAccountId: null },
        });
      }

      await tx.paymentAccount.delete({ where: { id } });
      await this.normalizePriorities(tx);
      return existing;
    });

    await this.auditLogService?.record({
      module: 'PAYMENT_QR',
      action: 'Xoá mã QR',
      detail: `${deleted.label} (${getVietQrBankShortName(deleted.bankCode)} - ${deleted.accountNo})`,
      actor: actorId,
      metadata: { paymentAccountId: id, label: deleted.label },
    });

    return { deletedId: id };
  }

  private async normalizePriorities(
    tx: DbClient,
    options?: {
      preferredActiveIds?: number[];
      moveToActiveTailId?: number;
      moveToInactiveTailId?: number;
    },
  ): Promise<PaymentAccountRow[]> {
    const all = (await tx.paymentAccount.findMany({
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    })) as PaymentAccountRow[];

    let activeRows = all.filter((a) => a.isActive);
    let inactiveRows = all.filter((a) => !a.isActive);

    if (options?.preferredActiveIds?.length) {
      const byId = new Map(activeRows.map((a) => [a.id, a]));
      const orderedActive: PaymentAccountRow[] = [];
      for (const id of options.preferredActiveIds) {
        const match = byId.get(id);
        if (match) {
          orderedActive.push(match);
          byId.delete(id);
        }
      }
      for (const rem of activeRows) {
        if (byId.has(rem.id)) {
          orderedActive.push(rem);
        }
      }
      activeRows = orderedActive;
    }

    if (options?.moveToActiveTailId !== undefined) {
      const target = activeRows.find((a) => a.id === options.moveToActiveTailId);
      if (target) {
        activeRows = [...activeRows.filter((a) => a.id !== target.id), target];
      }
    }

    if (options?.moveToInactiveTailId !== undefined) {
      const target = inactiveRows.find((a) => a.id === options.moveToInactiveTailId);
      if (target) {
        inactiveRows = [...inactiveRows.filter((a) => a.id !== target.id), target];
      }
    }

    const finalRows = [...activeRows, ...inactiveRows];
    for (let idx = 0; idx < finalRows.length; idx += 1) {
      const desiredPriority = idx + 1;
      if (finalRows[idx].priority !== desiredPriority) {
        finalRows[idx] = (await tx.paymentAccount.update({
          where: { id: finalRows[idx].id },
          data: { priority: desiredPriority, updatedAt: new Date() },
        })) as PaymentAccountRow;
      }
    }

    return finalRows;
  }

  async listOrders(id: number, queryInput: PaymentAccountOrdersQuery): Promise<PaymentAccountOrdersResponse> {
    const parsed = this.parseInput(PaymentAccountOrdersQuerySchema, queryInput);
    const existing = await this.prisma.paymentAccount.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ message: 'Không tìm thấy mã QR thanh toán' });
    }

    const where: Prisma.OrderWhereInput = {
      paymentAccountId: id,
      status: 'PAID',
      paymentMethod: { in: ['TRANSFER', 'SPLIT'] },
      ...(parsed.fromDate || parsed.toDate
        ? {
            paidAt: {
              ...(parsed.fromDate ? { gte: new Date(`${parsed.fromDate}T00:00:00.000+07:00`) } : {}),
              ...(parsed.toDate ? { lte: new Date(`${parsed.toDate}T23:59:59.999+07:00`) } : {}),
            },
          }
        : {}),
    };

    const skip = (parsed.page - 1) * parsed.limit;
    const orderModel = this.prisma.order as unknown as {
      count?: (args: unknown) => Promise<number>;
      groupBy?: (args: unknown) => Promise<
        Array<{
          paymentMethod: string | null;
          _sum: { totalAmount: Prisma.Decimal | null; transferAmount: Prisma.Decimal | null };
        }>
      >;
    };

    let totalCount = 0;
    let totalTransfer = ZERO;
    let pagedRows: Array<{
      id: number;
      orderCode: string;
      orderType: string;
      tableId?: number | null;
      takeawayNumber: number | null;
      paymentMethod: string | null;
      totalAmount: Prisma.Decimal;
      transferAmount: Prisma.Decimal;
      paidAt: Date | null;
      createdAt: Date;
      table?: { name: string } | null;
      cashier?: { username: string; employee?: { fullName: string } | null } | null;
    }> = [];

    let usedSqlAgg = false;
    if (typeof orderModel.count === 'function' && typeof orderModel.groupBy === 'function') {
      const [countRes, groupedSums, pageResult] = await Promise.all([
        orderModel.count({ where }),
        orderModel.groupBy({
          by: ['paymentMethod'],
          where,
          _sum: { totalAmount: true, transferAmount: true },
        }),
        this.prisma.order.findMany({
          where,
          orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
          skip,
          take: parsed.limit,
          include: {
            table: { select: { name: true } },
            cashier: {
              select: {
                username: true,
                employee: { select: { fullName: true } },
              },
            },
          },
        }),
      ]);
      if (groupedSums.every((g) => g._sum !== undefined)) {
        usedSqlAgg = true;
        totalCount = countRes;
        for (const g of groupedSums) {
          const sumVal =
            g.paymentMethod === 'SPLIT'
              ? (g._sum.transferAmount ?? ZERO)
              : (g._sum.totalAmount ?? ZERO);
          totalTransfer = totalTransfer.add(sumVal);
        }
        pagedRows = pageResult;
      }
    }
    if (!usedSqlAgg) {
      const allMatching = await this.prisma.order.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        include: {
          table: { select: { name: true } },
          cashier: {
            select: {
              username: true,
              employee: { select: { fullName: true } },
            },
          },
        },
      });
      for (const row of allMatching) {
        const amount = row.paymentMethod === 'SPLIT' ? row.transferAmount : row.totalAmount;
        totalTransfer = totalTransfer.add(amount);
      }
      totalCount = allMatching.length;
      pagedRows = allMatching.slice(skip, skip + parsed.limit);
    }

    return PaymentAccountOrdersResponseSchema.parse({
      page: parsed.page,
      limit: parsed.limit,
      total: totalCount,
      totalTransferAmount: totalTransfer.toNumber(),
      items: pagedRows.map((row) => {
        const tableLabel =
          row.table?.name ??
          (row.orderType === 'TAKEAWAY'
            ? formatOrderTakeawayLabel(row.takeawayNumber, (row as { takeawayLabelFormat?: unknown }).takeawayLabelFormat)
            : null);
        const effectiveTransfer =
          row.paymentMethod === 'SPLIT' ? row.transferAmount.toNumber() : row.totalAmount.toNumber();
        return {
          orderId: row.id,
          orderCode: row.orderCode,
          orderType: row.orderType,
          tableLabel,
          paymentMethod: row.paymentMethod === 'SPLIT' ? 'SPLIT' : 'TRANSFER',
          totalAmount: row.totalAmount.toNumber(),
          transferAmount: effectiveTransfer,
          paidAt: (row.paidAt ?? row.createdAt).toISOString(),
          cashierName: row.cashier?.employee?.fullName ?? row.cashier?.username ?? null,
        };
      }),
    });
  }

  async selectForAmount(
    client: DbClient,
    amount: Prisma.Decimal | number,
    now = new Date(),
  ): Promise<QrSelectionResult> {
    const decimalAmount = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
    if (decimalAmount.isNegative()) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Số tiền chọn mã QR không hợp lệ',
      });
    }
    const activeAccounts = (await client.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    })) as PaymentAccountRow[];

    if (activeAccounts.length === 0) {
      throw new ConflictException({
        code: ErrorCodes.PAYMENT_QR_NOT_CONFIGURED,
        message: 'Chưa có mã QR thanh toán nào đang bật. Vui lòng bật hoặc thêm mã QR trong trang Mã QR thanh toán.',
      });
    }

    const usageMap = await this.computeUsageMap(client, now);

    for (let idx = 0; idx < activeAccounts.length; idx += 1) {
      const candidate = activeAccounts[idx];
      const usage = usageMap.get(candidate.id) ?? { usedDay: ZERO, usedMonth: ZERO, usedYear: ZERO };
      if (this.resolveAccountStatus(candidate, usage) === PaymentAccountStatus.AVAILABLE) {
        return {
          account: candidate,
          brief: this.toBriefDto(candidate),
          rotated: idx > 0,
          overLimit: false,
        };
      }
    }

    // Decision D6: All active accounts would exceed their limits -> fall back to top priority with overLimit=true
    const fallback = activeAccounts[0];
    return {
      account: fallback,
      brief: this.toBriefDto(fallback),
      rotated: false,
      overLimit: true,
    };
  }

  buildVietQrUrl(
    account: Pick<PaymentAccountRow, 'bankCode' | 'accountNo' | 'accountName'>,
    amount: Prisma.Decimal | number,
    orderCode: string,
    tableCode?: string,
  ): string {
    const numericAmount = Math.max(
      0,
      Math.round(amount instanceof Prisma.Decimal ? amount.toNumber() : amount),
    );
    const cleanCode = orderCode.trim();
    const addInfo = tableCode ? `TT ${tableCode} ${cleanCode}` : `TT ${cleanCode}`;
    const query = new URLSearchParams({
      amount: String(numericAmount),
      addInfo,
      accountName: account.accountName.trim(),
    });
    return `https://img.vietqr.io/image/${encodeURIComponent(account.bankCode.trim())}-${encodeURIComponent(account.accountNo.trim())}-compact2.png?${query.toString()}`;
  }

  toBriefDto(row: PaymentAccountRow): PaymentAccountBrief {
    const parsedBank = VietQrBankCodeSchema.safeParse(row.bankCode);
    const bankCode = parsedBank.success ? parsedBank.data : 'VPB';
    return PaymentAccountBriefSchema.parse({
      id: row.id,
      label: row.label,
      bankCode,
      bankName: getVietQrBankShortName(bankCode),
      accountNo: row.accountNo,
      accountName: row.accountName,
    });
  }

  private resolveAccountStatus(
    account: PaymentAccountRow,
    usage: AccountUsageStats,
  ): PaymentAccountStatusType {
    if (!account.isActive) return PaymentAccountStatus.INACTIVE;
    if (account.dailyLimit !== null && usage.usedDay.greaterThanOrEqualTo(account.dailyLimit)) {
      return PaymentAccountStatus.DAY_FULL;
    }
    if (account.monthlyLimit !== null && usage.usedMonth.greaterThanOrEqualTo(account.monthlyLimit)) {
      return PaymentAccountStatus.MONTH_FULL;
    }
    if (account.yearlyLimit !== null && usage.usedYear.greaterThanOrEqualTo(account.yearlyLimit)) {
      return PaymentAccountStatus.YEAR_FULL;
    }
    return PaymentAccountStatus.AVAILABLE;
  }

  private toPaymentAccountDto(
    row: PaymentAccountRow,
    usage: AccountUsageStats,
    orderCount: number,
  ): PaymentAccount {
    const parsedBank = VietQrBankCodeSchema.safeParse(row.bankCode);
    const bankCode = parsedBank.success ? parsedBank.data : 'VPB';

    return PaymentAccountSchema.parse({
      id: row.id,
      label: row.label,
      bankCode,
      bankName: getVietQrBankShortName(bankCode),
      accountNo: row.accountNo,
      accountName: row.accountName,
      priority: row.priority,
      isActive: row.isActive,
      dailyLimit: row.dailyLimit ? row.dailyLimit.toNumber() : null,
      monthlyLimit: row.monthlyLimit ? row.monthlyLimit.toNumber() : null,
      yearlyLimit: row.yearlyLimit ? row.yearlyLimit.toNumber() : null,
      usedDay: usage.usedDay.toNumber(),
      usedMonth: usage.usedMonth.toNumber(),
      usedYear: usage.usedYear.toNumber(),
      status: this.resolveAccountStatus(row, usage),
      hasOrders: orderCount > 0,
      orderCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async computeUsageMap(
    client: DbClient,
    now: Date,
  ): Promise<Map<number, AccountUsageStats>> {
    const { dayStart, monthStart, yearStart } = getVnPeriodBounds(now);
    const orderModel = client.order as unknown as {
      groupBy?: (args: unknown) => Promise<
        Array<{
          paymentAccountId: number | null;
          paymentMethod: string | null;
          _sum: { totalAmount: Prisma.Decimal | null; transferAmount: Prisma.Decimal | null };
        }>
      >;
    };

    if (typeof orderModel.groupBy === 'function') {
      const sumByPeriod = async (since: Date) =>
        orderModel.groupBy!({
          by: ['paymentAccountId', 'paymentMethod'],
          where: {
            status: 'PAID',
            paymentMethod: { in: ['TRANSFER', 'SPLIT'] },
            paymentAccountId: { not: null },
            paidAt: { gte: since },
          },
          _sum: { totalAmount: true, transferAmount: true },
        });

      const [dayGroups, monthGroups, yearGroups] = await Promise.all([
        sumByPeriod(dayStart),
        sumByPeriod(monthStart),
        sumByPeriod(yearStart),
      ]);

      const allGroups = [...dayGroups, ...monthGroups, ...yearGroups];
      const hasValidSums = allGroups.every((r) => r._sum !== undefined);

      if (hasValidSums) {
        const map = new Map<number, AccountUsageStats>();
        const accumulate = (
          rows: Awaited<ReturnType<typeof sumByPeriod>>,
          field: 'usedDay' | 'usedMonth' | 'usedYear',
        ) => {
          for (const row of rows) {
            if (row.paymentAccountId === null) continue;
            const stats = map.get(row.paymentAccountId) ?? {
              usedDay: ZERO,
              usedMonth: ZERO,
              usedYear: ZERO,
            };
            const val =
              row.paymentMethod === 'SPLIT'
                ? new Prisma.Decimal(row._sum?.transferAmount ?? 0)
                : new Prisma.Decimal(row._sum?.totalAmount ?? 0);
            stats[field] = stats[field].add(val);
            map.set(row.paymentAccountId, stats);
          }
        };

        accumulate(yearGroups, 'usedYear');
        accumulate(monthGroups, 'usedMonth');
        accumulate(dayGroups, 'usedDay');
        return map;
      }
    }

    const paidOrders = (await client.order.findMany({
      where: {
        status: 'PAID',
        paymentMethod: { in: ['TRANSFER', 'SPLIT'] },
        paymentAccountId: { not: null },
        paidAt: { gte: yearStart },
      },
      select: {
        paymentAccountId: true,
        paymentMethod: true,
        totalAmount: true,
        transferAmount: true,
        paidAt: true,
      },
    })) as Array<{
      paymentAccountId: number | null;
      paymentMethod: string | null;
      totalAmount: Prisma.Decimal;
      transferAmount: Prisma.Decimal;
      paidAt: Date | null;
    }>;

    const map = new Map<number, AccountUsageStats>();
    for (const order of paidOrders) {
      if (order.paymentAccountId === null || !order.paidAt) continue;
      const stats = map.get(order.paymentAccountId) ?? {
        usedDay: ZERO,
        usedMonth: ZERO,
        usedYear: ZERO,
      };
      const transferValue =
        order.paymentMethod === 'SPLIT'
          ? new Prisma.Decimal(order.transferAmount)
          : new Prisma.Decimal(order.totalAmount);

      if (order.paidAt >= yearStart) {
        stats.usedYear = stats.usedYear.add(transferValue);
      }
      if (order.paidAt >= monthStart) {
        stats.usedMonth = stats.usedMonth.add(transferValue);
      }
      if (order.paidAt >= dayStart) {
        stats.usedDay = stats.usedDay.add(transferValue);
      }
      map.set(order.paymentAccountId, stats);
    }

    return map;
  }

  private async computeOrderCountMap(client: DbClient): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const orderModel = client.order as unknown as {
      groupBy?: (args: unknown) => Promise<Array<{ paymentAccountId: number | null; _count: { _all: number } }>>;
      findMany: (args: unknown) => Promise<Array<{ paymentAccountId: number | null }>>;
    };

    const where = {
      status: 'PAID' as const,
      paymentMethod: { in: ['TRANSFER', 'SPLIT'] as ('TRANSFER' | 'SPLIT')[] },
      paymentAccountId: { not: null },
    };

    if (typeof orderModel.groupBy === 'function') {
      const grouped = await orderModel.groupBy({
        by: ['paymentAccountId'],
        where,
        _count: { _all: true },
      });
      for (const entry of grouped) {
        if (entry.paymentAccountId !== null) {
          map.set(entry.paymentAccountId, entry._count._all);
        }
      }
      return map;
    }

    const rows = await orderModel.findMany({
      where,
      select: { paymentAccountId: true },
    });
    for (const row of rows) {
      if (row.paymentAccountId !== null) {
        map.set(row.paymentAccountId, (map.get(row.paymentAccountId) ?? 0) + 1);
      }
    }
    return map;
  }

  private parseInput<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { flatten: () => { fieldErrors: unknown } } } }, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu mã QR không hợp lệ',
        details: { fieldErrors: parsed.error?.flatten().fieldErrors },
      });
    }
    return parsed.data as T;
  }
}
