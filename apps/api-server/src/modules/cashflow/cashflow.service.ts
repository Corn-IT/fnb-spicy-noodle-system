import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CashflowSettlementFilterQuerySchema,
  CompensateSettlementRequestSchema,
  CreateSettlementRequestSchema,
  ErrorCodes,
  InternalMdmRecord,
  UpdateDefaultBudgetSchema,
  type CashflowSettlementFilterQuery,
  type CompensateSettlementRequest,
  type CreateSettlementRequest,
  type UpdateDefaultBudgetInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateString, businessDayRange, dateOnly } from '../../common/utils/business-date.util';
import { getShiftRange, queryShiftSalesTotals } from '../../common/utils/cashflow-settlement.util';

const DEFAULT_BUDGET_KEY = InternalMdmRecord.CASHFLOW_DEFAULT_OPENING_BUDGET;
const ZERO = new Prisma.Decimal(0);
const DENOMINATION_VALUES = {
  '500000': 500000,
  '200000': 200000,
  '100000': 100000,
  '50000': 50000,
  '20000': 20000,
  '10000': 10000,
  '5000': 5000,
  '2000': 2000,
  '1000': 1000,
} as const;

type SettlementRecord = {
  id: number;
  settlementDate: Date;
  shiftName: string;
  openingBudget: Prisma.Decimal;
  totalCashSales: Prisma.Decimal;
  totalTransferSales: Prisma.Decimal;
  totalCashImports: Prisma.Decimal;
  expectedCashInDrawer: Prisma.Decimal;
  actualCountedCash: Prisma.Decimal;
  discrepancyAmount: Prisma.Decimal;
  status: string;
  denominationsDetail: Prisma.JsonValue;
  note: string | null;
  closedBy: number;
  closer?: { username: string; employee?: { fullName: string } | null } | null;
  createdAt: Date;
};

@Injectable()
export class CashflowService {
  private readonly logger = new Logger(CashflowService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
  ) {}

  async getDefaultOpeningBudget(): Promise<number> {
    const budget = await this.getOpeningBudget(this.prisma, false);
    return budget.toNumber();
  }

  async preview(now = new Date(), isSuperAdmin = true) {
    const date = businessDateString(now);
    const { shiftName, start, end } = this.getCurrentShiftRange(now, date);
    if (!isSuperAdmin) {
      const openingBudget = await this.getOpeningBudget(this.prisma);
      return {
        settlementDate: date,
        shiftName,
        blindMode: true,
        openingBudget: openingBudget.toNumber(),
        totalCashSales: null,
        totalTransferSales: null,
        totalCashImports: null,
        expectedCashInDrawer: null,
      };
    }

    const [openingBudget, totals, imports] = await Promise.all([
      this.getOpeningBudget(this.prisma),
      this.getSalesTotals(this.prisma, start, end),
      this.getCashImports(this.prisma, start, end),
    ]);
    const expectedCashInDrawer = openingBudget.plus(totals.totalCashSales).minus(imports);
    return {
      settlementDate: date,
      shiftName,
      blindMode: false,
      openingBudget: openingBudget.toNumber(),
      totalCashSales: totals.totalCashSales.toNumber(),
      totalTransferSales: totals.totalTransferSales.toNumber(),
      totalCashImports: imports.toNumber(),
      expectedCashInDrawer: expectedCashInDrawer.toNumber(),
    };
  }

  async listSettlements(input: CashflowSettlementFilterQuery) {
    const parsed = CashflowSettlementFilterQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Bộ lọc kết ca không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const { page, limit, fromDate, toDate, closerKeyword } = parsed.data;
    const where: Prisma.CashDrawerSettlementWhereInput = {
      ...(fromDate || toDate ? {
        settlementDate: {
          ...(fromDate ? { gte: dateOnly(fromDate) } : {}),
          ...(toDate ? { lte: dateOnly(toDate) } : {}),
        },
      } : {}),
      ...(closerKeyword ? {
        closer: {
          OR: [
            { username: { contains: closerKeyword, mode: 'insensitive' } },
            { employee: { is: { fullName: { contains: closerKeyword, mode: 'insensitive' } } } },
          ],
        },
      } : {}),
    };
    const [total, settlements] = await Promise.all([
      this.prisma.cashDrawerSettlement.count({ where }),
      this.prisma.cashDrawerSettlement.findMany({
        where,
        orderBy: [{ settlementDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          closer: {
            select: {
              username: true,
              employee: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);
    return { page, limit, total, items: settlements.map((settlement) => this.toSettlementResponse(settlement)) };
  }

  async settleShift(input: CreateSettlementRequest, userId: number) {
    const parsed = CreateSettlementRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu kết ca không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const request = parsed.data;
    const settlementDate = dateOnly(request.settlementDate);
    const { start, end } = getShiftRange(request.settlementDate, request.shiftName);
    const actualCountedCash = this.countDenominations(request);
    if (!actualCountedCash.equals(new Prisma.Decimal(request.actualCountedCash.toString()))) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Tổng tiền theo mệnh giá phải bằng số tiền thực đếm',
      });
    }

    let created: SettlementRecord;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.cashDrawerSettlement.findUnique({
          where: { settlementDate_shiftName: { settlementDate, shiftName: request.shiftName } },
        });
        if (existing) throw this.alreadySettled();

        const openingBudget = await this.getOpeningBudget(tx, true);
        const [totals, totalCashImports] = await Promise.all([
          this.getSalesTotals(tx, start, end),
          this.getCashImports(tx, start, end),
        ]);
        const expectedCashInDrawer = openingBudget.plus(totals.totalCashSales).minus(totalCashImports);
        const discrepancyAmount = actualCountedCash.minus(expectedCashInDrawer);
        if (!discrepancyAmount.isZero() && !request.note?.trim()) {
          throw new UnprocessableEntityException({
            code: ErrorCodes.CASHFLOW_DISCREPANCY_NOTE_REQUIRED,
            message: 'Vui lòng nhập ghi chú giải trình khi tiền thực đếm chênh lệch với tiền lý thuyết',
          });
        }

        const status = discrepancyAmount.isZero()
          ? 'MATCHED'
          : discrepancyAmount.greaterThan(0) ? 'SURPLUS' : 'SHORTAGE';
        return tx.cashDrawerSettlement.create({
          data: {
            settlementDate,
            shiftName: request.shiftName,
            openingBudget,
            totalCashSales: totals.totalCashSales,
            totalTransferSales: totals.totalTransferSales,
            totalCashImports,
            expectedCashInDrawer,
            actualCountedCash,
            discrepancyAmount,
            status,
            denominationsDetail: request.denominationsDetail as Prisma.InputJsonObject,
            note: request.note?.trim() || null,
            closedBy: userId,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw this.alreadySettled();
      throw error;
    }

    this.logger.log(
      `Settlement completed: date=${request.settlementDate}, shift=${request.shiftName}, expected=${created.expectedCashInDrawer.toFixed(2)}, actual=${created.actualCountedCash.toFixed(2)}, discrepancy=${created.discrepancyAmount.toFixed(2)}`,
    );
    const actualFormatted = `${created.actualCountedCash.toNumber().toLocaleString('vi-VN')}đ`;
    const diffValue = created.discrepancyAmount.toNumber();
    await this.auditLogService?.record({
      module: 'CASHFLOW',
      action: 'Chốt ca tiền mặt',
      detail: `${request.settlementDate} (${actualFormatted})`,
      message: 'chốt đối soát kết ca tiền mặt',
      actor: userId,
      metadata: {
        settlementId: created.id,
        settlementDate: request.settlementDate,
        actualCountedCash: created.actualCountedCash.toNumber(),
        discrepancyAmount: diffValue,
      },
    });
    return this.toSettlementResponse(created);
  }

  async compensateSettlement(id: number, input: CompensateSettlementRequest, userId: number) {
    const parsed = CompensateSettlementRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Ghi chú bù tiền kết ca không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.cashDrawerSettlement.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException({ message: 'Không tìm thấy bản ghi kết ca' });
      if (existing.discrepancyAmount.isZero()) {
        throw new ConflictException({
          code: 'CASHFLOW_NO_DISCREPANCY',
          message: 'Bản ghi kết ca đã khớp quỹ (chênh lệch 0đ), không cần bù chênh lệch',
        });
      }

      const actorInfo = typeof tx.user?.findUnique === 'function'
        ? await tx.user.findUnique({
            where: { id: userId },
            select: { username: true, employee: { select: { fullName: true } } },
          })
        : null;
      const actorName = actorInfo?.employee?.fullName ?? `User #${userId}`;
      const actorUsername = actorInfo?.username ?? `user_${userId}`;
      const prevDiff = existing.discrepancyAmount.toNumber();
      const compDecimal = parsed.data.compensationAmount !== undefined
        ? new Prisma.Decimal(parsed.data.compensationAmount.toString())
        : existing.discrepancyAmount.abs();
      const newActualCash = existing.discrepancyAmount.lessThan(0)
        ? existing.actualCountedCash.plus(compDecimal)
        : existing.actualCountedCash.minus(compDecimal);
      if (newActualCash.lessThan(0)) {
        throw new UnprocessableEntityException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: 'Số tiền thực đếm sau khi bù trừ không được âm',
        });
      }
      const newDiscrepancy = newActualCash.minus(existing.expectedCashInDrawer);
      const newStatus = newDiscrepancy.isZero()
        ? 'MATCHED'
        : newDiscrepancy.greaterThan(0) ? 'SURPLUS' : 'SHORTAGE';
      const compFormatted = `${compDecimal.toNumber().toLocaleString('vi-VN')}đ`;
      const prevDiffFormatted = `${prevDiff > 0 ? '+' : ''}${prevDiff.toLocaleString('vi-VN')}đ`;
      const newDiffNum = newDiscrepancy.toNumber();
      const newDiffFormatted = `${newDiffNum > 0 ? '+' : ''}${newDiffNum.toLocaleString('vi-VN')}đ`;
      const tag = `[Đã bù ${compFormatted} (lệch ${prevDiffFormatted} → ${newDiffFormatted}) bởi ${actorName} (${actorUsername}): ${parsed.data.note}]`;
      const mergedNote = existing.note?.trim() ? `${existing.note.trim()}\n${tag}` : tag;

      const saved = await tx.cashDrawerSettlement.update({
        where: { id },
        data: {
          actualCountedCash: newActualCash,
          discrepancyAmount: newDiscrepancy,
          status: newStatus,
          note: mergedNote,
        },
        include: {
          closer: {
            select: {
              username: true,
              employee: { select: { fullName: true } },
            },
          },
        },
      });

      const settlementDateText = businessDateString(existing.settlementDate);
      const oldActualNum =
        typeof (existing.actualCountedCash as { toNumber?: () => number })?.toNumber === 'function'
          ? (existing.actualCountedCash as { toNumber: () => number }).toNumber()
          : Number(existing.actualCountedCash ?? 0);
      const newActualNum = oldActualNum + compDecimal.toNumber();
      const oldActualFormatted = `${oldActualNum.toLocaleString('vi-VN')}đ`;
      const newActualFormatted = `${newActualNum.toLocaleString('vi-VN')}đ`;
      const changes = [
        { field: 'Tiền thực đếm', from: oldActualFormatted, to: newActualFormatted },
        { field: 'Chênh lệch', from: prevDiffFormatted, to: newDiffFormatted },
        { field: 'Số tiền bù', from: '0đ', to: compFormatted },
      ];
      await this.auditLogService?.record({
        module: 'CASHFLOW',
        action: 'Bù chênh lệch kết ca',
        detail: `${settlementDateText} (${compFormatted})`,
        message: `bù chênh lệch kết ca (${parsed.data.note})`,
        actor: { id: userId, fullName: actorName, username: actorUsername },
        metadata: {
          settlementId: id,
          settlementDate: settlementDateText,
          compensationAmount: compDecimal.toNumber(),
          previousDiscrepancy: prevDiff,
          newDiscrepancy: newDiffNum,
          note: parsed.data.note,
          changes,
        },
        tx,
      });

      return saved;
    });

    return this.toSettlementResponse(updated);
  }

  async setDefaultBudget(input: UpdateDefaultBudgetInput, userId?: number) {
    const parsed = UpdateDefaultBudgetSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Ngân sách đầu ngày không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const decimalValue = new Prisma.Decimal(parsed.data.openingBudget.toString());
    let previousBudgetValue: number | null = null;
    if (typeof this.prisma.masterData?.findUnique === 'function') {
      const prevMaster = await this.prisma.masterData.findUnique({
        where: { category_normalizedName: { category: 'UNIT', normalizedName: DEFAULT_BUDGET_KEY } },
      });
      const rawPrev = (prevMaster?.metadata as Record<string, unknown> | null)?.opening_budget;
      if (rawPrev !== undefined && rawPrev !== null) {
        const parsedPrev = Number(rawPrev);
        if (!Number.isNaN(parsedPrev)) previousBudgetValue = parsedPrev;
      }
    }
    await this.prisma.masterData.upsert({
      where: { category_normalizedName: { category: 'UNIT', normalizedName: DEFAULT_BUDGET_KEY } },
      create: {
        category: 'UNIT',
        name: 'Internal Cashflow Default Budget',
        normalizedName: DEFAULT_BUDGET_KEY,
        metadata: { opening_budget: decimalValue.toFixed(2) },
        isActive: false,
      },
      update: { metadata: { opening_budget: decimalValue.toFixed(2) }, isActive: false },
    });
    if (userId) {
      const budgetFormatted = `${decimalValue.toNumber().toLocaleString('vi-VN')}đ`;
      const changes =
        previousBudgetValue !== null && previousBudgetValue !== decimalValue.toNumber()
          ? [
              {
                field: 'Ngân sách đầu ngày',
                from: `${previousBudgetValue.toLocaleString('vi-VN')}đ`,
                to: budgetFormatted,
              },
            ]
          : undefined;
      await this.auditLogService?.record({
        module: 'CASHFLOW',
        action: 'Cấu hình ngân sách',
        detail: budgetFormatted,
        message: 'cấu hình ngân sách đầu ngày mặc định',
        actor: userId,
        metadata: {
          openingBudget: decimalValue.toNumber(),
          ...(changes ? { changes } : {}),
        },
      });
    }
    return { openingBudget: decimalValue.toNumber() };
  }

  private async getOpeningBudget(
    client: PrismaService | Prisma.TransactionClient,
    required = false,
  ): Promise<Prisma.Decimal> {
    const config = await client.masterData.findUnique({
      where: { category_normalizedName: { category: 'UNIT', normalizedName: DEFAULT_BUDGET_KEY } },
    });
    const metadata = config?.metadata;
    const configuredBudget = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.opening_budget
      : undefined;
    if (typeof configuredBudget !== 'string' && typeof configuredBudget !== 'number') {
      if (required) {
        throw new BadRequestException({
          code: ErrorCodes.CASHFLOW_BUDGET_NOT_SET,
          message: 'Chưa cấu hình ngân sách tiền lẻ đầu ca',
        });
      }
      return ZERO;
    }
    return new Prisma.Decimal(configuredBudget);
  }

  private async getSalesTotals(
    client: PrismaService | Prisma.TransactionClient,
    start: Date,
    end: Date,
  ): Promise<{ totalCashSales: Prisma.Decimal; totalTransferSales: Prisma.Decimal }> {
    return queryShiftSalesTotals(client, start, end);
  }

  private async getCashImports(
    client: PrismaService | Prisma.TransactionClient,
    start: Date,
    end: Date,
  ): Promise<Prisma.Decimal> {
    const total = await client.inventoryImport.aggregate({
      where: { paymentSource: 'CASH_DRAWER', isDeleted: false, createdAt: { gte: start, lt: end } },
      _sum: { totalCost: true },
    });
    return total._sum.totalCost ?? ZERO;
  }

  private countDenominations(request: CreateSettlementRequest): Prisma.Decimal {
    return Object.entries(DENOMINATION_VALUES).reduce((sum, [value, denomination]) => {
      const count = request.denominationsDetail[value as keyof typeof request.denominationsDetail];
      return sum.plus(new Prisma.Decimal(denomination).mul(count));
    }, ZERO);
  }

  private getCurrentShiftRange(_now: Date, date: string): { shiftName: string; start: Date; end: Date } {
    return { shiftName: 'CA_NGAY', ...businessDayRange(date) };
  }

  private toSettlementResponse(settlement: SettlementRecord) {
    const cashToHandOver = settlement.actualCountedCash.minus(settlement.openingBudget);
    const closedByName = settlement.closer?.employee?.fullName;
    const closedByUsername = settlement.closer?.username;
    return {
      id: settlement.id,
      settlementDate: businessDateString(settlement.settlementDate),
      shiftName: settlement.shiftName,
      openingBudget: settlement.openingBudget.toNumber(),
      totalCashSales: settlement.totalCashSales.toNumber(),
      totalTransferSales: settlement.totalTransferSales.toNumber(),
      totalCashImports: settlement.totalCashImports.toNumber(),
      expectedCashInDrawer: settlement.expectedCashInDrawer.toNumber(),
      actualCountedCash: settlement.actualCountedCash.toNumber(),
      discrepancyAmount: settlement.discrepancyAmount.toNumber(),
      cashRetainedInDrawer: settlement.openingBudget.toNumber(),
      cashToHandOver: cashToHandOver.greaterThan(0) ? cashToHandOver.toNumber() : 0,
      status: settlement.status,
      denominationsDetail: settlement.denominationsDetail,
      note: settlement.note,
      closedBy: settlement.closedBy,
      ...(closedByName ? { closedByName } : {}),
      ...(closedByUsername ? { closedByUsername } : {}),
      createdAt: settlement.createdAt.toISOString(),
    };
  }

  private alreadySettled(): ConflictException {
    return new ConflictException({
      code: ErrorCodes.CASHFLOW_ALREADY_SETTLED,
      message: 'Ca làm việc này đã được kết ca',
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
