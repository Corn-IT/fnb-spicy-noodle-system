import { z } from 'zod';
import { SettlementStatusSchema } from '../enums/mdm-cashflow.enum';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema, MoneyAmountSchema, PaginationFields, SignedMoneyAmountSchema } from './common.schema';

const DenominationCountSchema = z.number().int().nonnegative();

export const DenominationsDetailSchema = z.object({
  '500000': DenominationCountSchema,
  '200000': DenominationCountSchema,
  '100000': DenominationCountSchema,
  '50000': DenominationCountSchema,
  '20000': DenominationCountSchema,
  '10000': DenominationCountSchema,
  '5000': DenominationCountSchema,
  '2000': DenominationCountSchema,
  '1000': DenominationCountSchema,
}).strict();
export type DenominationsDetail = z.infer<typeof DenominationsDetailSchema>;

const denominationTotal = (counts: DenominationsDetail): number =>
  Object.entries(counts).reduce((sum, [value, count]) => sum + Number(value) * count, 0);

const toCents = (amount: number): number => Math.round(amount * 100);

export const CreateSettlementRequestSchema = z.object({
  settlementDate: IsoDateSchema,
  shiftName: z.string().trim().min(1).max(80),
  actualCountedCash: MoneyAmountSchema,
  denominationsDetail: DenominationsDetailSchema,
  note: z.string().trim().max(1000).optional(),
}).strict()
  .refine((request) => denominationTotal(request.denominationsDetail) === request.actualCountedCash, {
    message: 'Tổng tiền theo mệnh giá phải bằng số tiền thực đếm',
    path: ['denominationsDetail'],
  });
export type CreateSettlementRequest = z.infer<typeof CreateSettlementRequestSchema>;

export const CashflowSettlementFilterQuerySchema = z.object({
  ...PaginationFields,
  fromDate: IsoDateSchema.optional(),
  toDate: IsoDateSchema.optional(),
}).refine((filter) => filter.fromDate === undefined || filter.toDate === undefined || filter.fromDate <= filter.toDate, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type CashflowSettlementFilterQuery = z.infer<typeof CashflowSettlementFilterQuerySchema>;

export const UpdateDefaultBudgetSchema = z.object({
  openingBudget: MoneyAmountSchema,
}).strict();
export type UpdateDefaultBudgetInput = z.infer<typeof UpdateDefaultBudgetSchema>;

export const SettlementResponseSchema = z.object({
  id: IdSchema,
  settlementDate: IsoDateSchema,
  shiftName: z.string().min(1),
  openingBudget: MoneyAmountSchema,
  totalCashSales: MoneyAmountSchema,
  totalTransferSales: MoneyAmountSchema,
  totalCashImports: MoneyAmountSchema,
  expectedCashInDrawer: MoneyAmountSchema,
  actualCountedCash: MoneyAmountSchema,
  discrepancyAmount: SignedMoneyAmountSchema,
  cashRetainedInDrawer: MoneyAmountSchema,
  cashToHandOver: MoneyAmountSchema,
  status: SettlementStatusSchema,
  denominationsDetail: DenominationsDetailSchema,
  note: z.string().nullable(),
  closedBy: IdSchema,
  createdAt: IsoDateTimeSchema,
}).strict()
  .refine((settlement) => toCents(settlement.expectedCashInDrawer) === toCents(settlement.openingBudget)
    + toCents(settlement.totalCashSales) - toCents(settlement.totalCashImports), {
    message: 'Tiền lý thuyết phải bằng ngân sách đầu ca + doanh thu tiền mặt - chi tiền két',
    path: ['expectedCashInDrawer'],
  })
  .refine((settlement) => toCents(settlement.discrepancyAmount)
    === toCents(settlement.actualCountedCash) - toCents(settlement.expectedCashInDrawer), {
    message: 'Tiền chênh lệch phải bằng tiền thực đếm - tiền lý thuyết',
    path: ['discrepancyAmount'],
  })
  .refine((settlement) => settlement.status === (
    toCents(settlement.discrepancyAmount) === 0 ? 'MATCHED'
      : toCents(settlement.discrepancyAmount) > 0 ? 'SURPLUS' : 'SHORTAGE'
  ), {
    message: 'Trạng thái kết ca không khớp số tiền chênh lệch',
    path: ['status'],
  })
  .refine((settlement) => toCents(settlement.discrepancyAmount) === 0 || Boolean(settlement.note?.trim()), {
    message: 'Cần ghi chú giải trình khi có chênh lệch',
    path: ['note'],
  })
  .refine((settlement) => denominationTotal(settlement.denominationsDetail) === settlement.actualCountedCash, {
    message: 'Tổng tiền theo mệnh giá phải bằng số tiền thực đếm',
    path: ['denominationsDetail'],
  });
export type SettlementResponse = z.infer<typeof SettlementResponseSchema>;
