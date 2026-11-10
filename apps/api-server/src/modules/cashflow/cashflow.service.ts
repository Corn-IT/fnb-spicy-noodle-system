import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CashflowSettlementFilterQuerySchema,
  CreateSettlementRequestSchema,
  ErrorCodes,
  InternalMdmRecord,
  UpdateDefaultBudgetSchema,
  type CashflowSettlementFilterQuery,
  type CreateSettlementRequest,
  type UpdateDefaultBudgetInput,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDayRange, businessDateString, dateOnly, dateAtVietnamMidnight } from '../../common/utils/business-date.util';

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

type SalesTotals = {
  totalCashSales: Prisma.Decimal | null;
  totalTransferSales: Prisma.Decimal | null;
};

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
  createdAt: Date;
};

@Injectable()
export class CashflowService {
  private readonly logger = new Logger(CashflowService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async preview(now = new Date()) {
    const date = businessDateString(now);
    const { shiftName, start, end } = this.getCurrentShiftRange(now, date);
    const [openingBudget, totals, imports] = await Promise.all([
      this.getOpeningBudget(this.prisma),
      this.getSalesTotals(this.prisma, start, end),
      this.getCashImports(this.prisma, start, end),
    ]);
    const expectedCashInDrawer = openingBudget.plus(totals.totalCashSales).minus(imports);
    return {
      settlementDate: date,
      shiftName,
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

    const { page, limit, fromDate, toDate } = parsed.data;
    const where: Prisma.CashDrawerSettlementWhereInput = {
      ...(fromDate || toDate ? {
        settlementDate: {
          ...(fromDate ? { gte: dateOnly(fromDate) } : {}),
          ...(toDate ? { lte: dateOnly(toDate) } : {}),
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
    const { start, end } = this.getShiftRange(request.settlementDate, request.shiftName);
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
    return this.toSettlementResponse(created);
  }

  async setDefaultBudget(input: UpdateDefaultBudgetInput) {
    const parsed = UpdateDefaultBudgetSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Ngân sách đầu ngày không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const decimalValue = new Prisma.Decimal(parsed.data.openingBudget.toString());
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
    const [totals] = await client.$queryRaw<SalesTotals[]>`
      SELECT
        COALESCE(SUM(CASE
          WHEN payment_method = 'CASH' THEN total_amount
          WHEN payment_method = 'SPLIT' THEN cash_amount
          ELSE 0
        END), 0)::numeric(12, 2) AS "totalCashSales",
        COALESCE(SUM(CASE
          WHEN payment_method = 'TRANSFER' THEN total_amount
          WHEN payment_method = 'SPLIT' THEN transfer_amount
          ELSE 0
        END), 0)::numeric(12, 2) AS "totalTransferSales"
      FROM orders
      WHERE status = 'PAID'
        AND payment_method IN ('CASH', 'TRANSFER', 'SPLIT')
        AND paid_at >= ${start}
        AND paid_at < ${end}
    `;
    return {
      totalCashSales: totals?.totalCashSales ?? ZERO,
      totalTransferSales: totals?.totalTransferSales ?? ZERO,
    };
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

  private getCurrentShiftRange(now: Date, date: string): { shiftName: string; start: Date; end: Date } {
    const localHour = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
    const shiftName = localHour >= 8 && localHour < 15 ? 'Ca Sáng' : localHour >= 15 && localHour < 22 ? 'Ca Tối' : 'Ca Khác';
    return { shiftName, ...this.getShiftRange(date, shiftName) };
  }

  private getShiftRange(date: string, shiftName: string): { start: Date; end: Date } {
    const normalizedName = shiftName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN');
    const customHours = shiftName.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    const range = businessDayRange(date);
    if (customHours) {
      return {
        start: this.timeAtBusinessDate(date, Number(customHours[1]), Number(customHours[2])),
        end: this.timeAtBusinessDate(date, Number(customHours[3]), Number(customHours[4])),
      };
    }
    if (normalizedName.includes('sang')) {
      return { start: this.timeAtBusinessDate(date, 8, 0), end: this.timeAtBusinessDate(date, 15, 0) };
    }
    if (normalizedName.includes('toi')) {
      return { start: this.timeAtBusinessDate(date, 15, 0), end: this.timeAtBusinessDate(date, 22, 0) };
    }
    return range;
  }

  private timeAtBusinessDate(date: string, hour: number, minute: number): Date {
    const start = dateAtVietnamMidnight(date);
    return new Date(start.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
  }

  private toSettlementResponse(settlement: SettlementRecord) {
    const cashToHandOver = settlement.actualCountedCash.minus(settlement.openingBudget);
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
