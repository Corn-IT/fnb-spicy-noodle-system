import { z } from 'zod';
import { PaymentSourceSchema, SettlementStatusSchema } from '../enums/mdm-cashflow.enum';
import {
  OrderSourceSchema,
  OrderTypeSchema,
  PaymentMethodSchema,
} from '../enums/order.enum';
import { KitchenStationSchema, ProductStationSchema } from '../enums/station.enum';
import { AuditLogItemSchema } from './audit-log.schema';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema, MoneyAmountSchema, SignedMoneyAmountSchema } from './common.schema';
import { PosTableGridResponseSchema } from './order.schema';
import { PaymentAccountSchema, PaymentAccountStatusSchema } from './payment-qr.schema';

export const DashboardPresetSchema = z.enum(['today', 'yesterday', '7d', 'month', 'custom']);
export type DashboardPreset = z.infer<typeof DashboardPresetSchema>;

export const DashboardQuerySchema = z.object({
  preset: DashboardPresetSchema.optional(),
  fromDate: IsoDateSchema.optional(),
  toDate: IsoDateSchema.optional(),
})
  .strict()
  .refine(
    (q) => q.fromDate === undefined || q.toDate === undefined || q.fromDate <= q.toDate,
    {
      message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
      path: ['toDate'],
    },
  )
  .refine(
    (q) => {
      if (!q.fromDate || !q.toDate) return true;
      const diffMs = Date.parse(`${q.toDate}T00:00:00Z`) - Date.parse(`${q.fromDate}T00:00:00Z`);
      return diffMs <= 366 * 24 * 60 * 60 * 1000;
    },
    {
      message: 'Khoảng thời gian thống kê tối đa 366 ngày',
      path: ['toDate'],
    },
  );
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

export const DashboardScopeSchema = z.object({
  canPos: z.boolean(),
  canInvoices: z.boolean(),
  canInventory: z.boolean(),
  canCashflow: z.boolean(),
  canPaymentQr: z.boolean(),
  canDiscounts: z.boolean(),
  canSchedules: z.boolean(),
  canPayroll: z.boolean(),
  canViewProfit: z.boolean(),
}).strict();
export type DashboardScope = z.infer<typeof DashboardScopeSchema>;

export const DashboardPendingQrAlertSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  tableId: IdSchema.nullable(),
  tableLabel: z.string().min(1),
  kind: z.enum(['NEW', 'ADDON']),
  totalAmount: MoneyAmountSchema,
  pendingSince: IsoDateTimeSchema,
  waitSeconds: z.number().int().nonnegative(),
  isOverdue: z.boolean(),
}).strict();

export const DashboardPendingPaymentEditAlertSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  tableLabel: z.string().min(1),
  totalAmount: MoneyAmountSchema,
  currentMethod: PaymentMethodSchema.nullable(),
  requestedMethod: PaymentMethodSchema,
  requestedByName: z.string().min(1),
  requestedAt: IsoDateTimeSchema,
}).strict();

export const DashboardNearLimitQrAlertSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  bankCode: z.string().min(1),
  accountNo: z.string().min(1),
  usedDay: MoneyAmountSchema,
  dailyLimit: MoneyAmountSchema.nullable(),
  dayPercent: z.number().nonnegative().nullable(),
  status: PaymentAccountStatusSchema,
}).strict();

export const DashboardRevenueKpiSchema = z.object({
  netPaidAmount: MoneyAmountSchema,
  subtotalAmount: MoneyAmountSchema,
  discountAmount: MoneyAmountSchema,
  paidOrderCount: z.number().int().nonnegative(),
  dineInCount: z.number().int().nonnegative(),
  takeawayCount: z.number().int().nonnegative(),
  qrSourceCount: z.number().int().nonnegative(),
  posSourceCount: z.number().int().nonnegative(),
  averageOrderValue: MoneyAmountSchema,
  previousNetPaidAmount: MoneyAmountSchema,
  growthPercent: z.number().nullable(),
}).strict();

export const DashboardCashDrawerKpiSchema = z.object({
  blindMode: z.boolean(),
  openingBudget: MoneyAmountSchema,
  totalCashSales: MoneyAmountSchema.nullable(),
  cashOnlySales: MoneyAmountSchema.nullable(),
  splitCashSales: MoneyAmountSchema.nullable(),
  totalCashImports: MoneyAmountSchema.nullable(),
  expectedCashInDrawer: SignedMoneyAmountSchema.nullable(),
  estimatedHandOver: SignedMoneyAmountSchema.nullable(),
  latestSettlement: z.object({
    id: IdSchema,
    settlementDate: IsoDateSchema,
    shiftName: z.string().min(1),
    status: SettlementStatusSchema,
    discrepancyAmount: SignedMoneyAmountSchema,
    actualCountedCash: MoneyAmountSchema,
  }).strict().nullable(),
}).strict();

export const DashboardTransferKpiSchema = z.object({
  totalTransferSales: MoneyAmountSchema,
  transferOnlySales: MoneyAmountSchema,
  splitTransferSales: MoneyAmountSchema,
  transferOrderCount: z.number().int().nonnegative(),
  splitOrderCount: z.number().int().nonnegative(),
  sharePercent: z.number().nonnegative(),
  byAccount: z.array(z.object({
    accountId: IdSchema.nullable(),
    label: z.string().min(1),
    bankCode: z.string().nullable(),
    amount: MoneyAmountSchema,
    orderCount: z.number().int().nonnegative(),
  }).strict()),
}).strict();

export const DashboardInventoryKpiSchema = z.object({
  totalImportCost: MoneyAmountSchema,
  cashDrawerImportCost: MoneyAmountSchema,
  externalImportCost: MoneyAmountSchema,
  importCount: z.number().int().nonnegative(),
  costToRevenuePercent: z.number().nonnegative().nullable(),
}).strict();

export const DashboardOpenOrdersKpiSchema = z.object({
  totalOpenAmount: MoneyAmountSchema,
  occupiedTableCount: z.number().int().nonnegative(),
  pendingTableCount: z.number().int().nonnegative(),
  availableTableCount: z.number().int().nonnegative(),
  totalPhysicalTables: z.number().int().nonnegative(),
  takeawayOpenCount: z.number().int().nonnegative(),
  unprintedKitchenItemsCount: z.number().int().nonnegative(),
}).strict();

export const DashboardProfitKpiSchema = z.object({
  grossProfitAfterInventory: SignedMoneyAmountSchema,
  estimatedLaborCost: MoneyAmountSchema.nullable(),
  netOperatingProfit: SignedMoneyAmountSchema.nullable(),
  marginPercent: z.number().nullable(),
}).strict();

export const DashboardSeriesBucketSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  cashSales: MoneyAmountSchema,
  transferSales: MoneyAmountSchema,
  dineInSales: MoneyAmountSchema,
  takeawaySales: MoneyAmountSchema,
  totalSales: MoneyAmountSchema,
  orderCount: z.number().int().nonnegative(),
}).strict();

export const DashboardPaymentBreakdownItemSchema = z.object({
  method: PaymentMethodSchema,
  orderCount: z.number().int().nonnegative(),
  totalAmount: MoneyAmountSchema,
  cashPortion: MoneyAmountSchema,
  transferPortion: MoneyAmountSchema,
  sharePercent: z.number().nonnegative(),
}).strict();

export const DashboardKitchenStationStatSchema = z.object({
  station: KitchenStationSchema,
  label: z.string().min(1),
  printedQty: z.number().int().nonnegative(),
  pendingQty: z.number().int().nonnegative(),
  cancelledQty: z.number().int().nonnegative(),
  revenue: MoneyAmountSchema,
  sharePercent: z.number().nonnegative(),
}).strict();

export const DashboardSpiceLevelStatSchema = z.object({
  level: z.number().int().min(0).max(7),
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
}).strict();

export const DashboardTopProductItemSchema = z.object({
  productId: IdSchema,
  name: z.string().min(1),
  categoryName: z.string().nullable(),
  station: ProductStationSchema,
  qty: z.number().int().nonnegative(),
  revenue: MoneyAmountSchema,
  sharePercent: z.number().nonnegative(),
}).strict();

export const DashboardTopModifierItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().int().nonnegative(),
  revenue: MoneyAmountSchema,
}).strict();

export const DashboardDiscountStatSchema = z.object({
  discountId: IdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  usedCountInPeriod: z.number().int().nonnegative(),
  totalDiscountedInPeriod: MoneyAmountSchema,
  usageLimit: z.number().int().positive().nullable(),
  totalUsedCount: z.number().int().nonnegative(),
}).strict();

export const DashboardRecentImportItemSchema = z.object({
  id: IdSchema,
  itemName: z.string().min(1),
  supplierName: z.string().nullable(),
  unitName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: MoneyAmountSchema,
  totalCost: MoneyAmountSchema,
  paymentSource: PaymentSourceSchema,
  importDate: IsoDateSchema,
}).strict();

export const DashboardShiftEmployeeSchema = z.object({
  id: IdSchema,
  shortName: z.string().min(1),
  fullName: z.string().min(1),
  specialtyName: z.string().nullable(),
  mode: z.string().min(1),
}).strict();

export const DashboardShiftSlotSchema = z.object({
  timeSlot: z.string().min(1),
  employees: z.array(DashboardShiftEmployeeSchema),
}).strict();

export const DashboardRecentInvoiceItemSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  tableLabel: z.string().nullable(),
  takeawayNumber: z.number().int().positive().nullable(),
  orderSource: OrderSourceSchema,
  paymentMethod: PaymentMethodSchema.nullable(),
  paymentAccountLabel: z.string().nullable(),
  discountAmount: MoneyAmountSchema,
  totalAmount: MoneyAmountSchema,
  paidAt: IsoDateTimeSchema.nullable(),
}).strict();

export const DashboardOverviewResponseSchema = z.object({
  meta: z.object({
    preset: DashboardPresetSchema,
    fromDate: IsoDateSchema,
    toDate: IsoDateSchema,
    previousFromDate: IsoDateSchema,
    previousToDate: IsoDateSchema,
    generatedAt: IsoDateTimeSchema,
    isTodayIncluded: z.boolean(),
    scope: DashboardScopeSchema,
  }).strict(),
  alerts: z.object({
    pendingQrTables: z.array(DashboardPendingQrAlertSchema),
    pendingPaymentEdits: z.array(DashboardPendingPaymentEditAlertSchema),
    nearLimitQrAccounts: z.array(DashboardNearLimitQrAlertSchema),
  }).strict(),
  kpis: z.object({
    revenue: DashboardRevenueKpiSchema.nullable(),
    cashDrawer: DashboardCashDrawerKpiSchema.nullable(),
    transfer: DashboardTransferKpiSchema.nullable(),
    inventory: DashboardInventoryKpiSchema.nullable(),
    openOrders: DashboardOpenOrdersKpiSchema.nullable(),
    profit: DashboardProfitKpiSchema.nullable(),
  }).strict(),
  revenueSeries: z.object({
    granularity: z.enum(['hour', 'day']),
    buckets: z.array(DashboardSeriesBucketSchema),
    peakBucketLabel: z.string().nullable(),
    peakBucketAmount: MoneyAmountSchema,
    peakBucketOrders: z.number().int().nonnegative(),
    happyHourAmount: MoneyAmountSchema,
    happyHourOrderCount: z.number().int().nonnegative(),
  }).strict().nullable(),
  paymentBreakdown: z.array(DashboardPaymentBreakdownItemSchema),
  paymentQrAccounts: z.array(PaymentAccountSchema),
  liveTables: PosTableGridResponseSchema.nullable(),
  kitchenStations: z.object({
    comboDecomposedCount: z.number().int().nonnegative(),
    stations: z.array(DashboardKitchenStationStatSchema),
    spiceLevels: z.array(DashboardSpiceLevelStatSchema),
  }).strict().nullable(),
  topProducts: z.object({
    items: z.array(DashboardTopProductItemSchema),
    topModifiers: z.array(DashboardTopModifierItemSchema),
  }).strict().nullable(),
  discountsAndRisk: z.object({
    totalDiscountAmount: MoneyAmountSchema,
    manualDiscountCount: z.number().int().nonnegative(),
    manualDiscountAmount: MoneyAmountSchema,
    codeDiscountStats: z.array(DashboardDiscountStatSchema),
    voidedOrderCount: z.number().int().nonnegative(),
    voidedAmount: MoneyAmountSchema,
    cancelledPrintedItemCount: z.number().int().nonnegative(),
    tableTransferCounts: z.object({
      move: z.number().int().nonnegative(),
      merge: z.number().int().nonnegative(),
      swap: z.number().int().nonnegative(),
    }).strict(),
  }).strict().nullable(),
  recentInventoryImports: z.array(DashboardRecentImportItemSchema),
  staffing: z.object({
    todayDate: IsoDateSchema,
    todayWeekdayLabel: z.string().min(1),
    totalScheduledEmployees: z.number().int().nonnegative(),
    shifts: z.array(DashboardShiftSlotSchema),
    payrollSummary: z.object({
      fromDate: IsoDateSchema,
      toDate: IsoDateSchema,
      totalEmployees: z.number().int().nonnegative(),
      totalFullShiftDays: z.number().nonnegative(),
      totalCustomHours: z.number().nonnegative(),
      totalSalary: MoneyAmountSchema,
    }).strict().nullable(),
  }).strict().nullable(),
  recentInvoices: z.array(DashboardRecentInvoiceItemSchema),
  recentAuditLogs: z.array(AuditLogItemSchema),
}).strict();

export type DashboardOverviewResponse = z.infer<typeof DashboardOverviewResponseSchema>;
export type DashboardRevenueKpi = z.infer<typeof DashboardRevenueKpiSchema>;
export type DashboardCashDrawerKpi = z.infer<typeof DashboardCashDrawerKpiSchema>;
export type DashboardKitchenStationStat = z.infer<typeof DashboardKitchenStationStatSchema>;
export type DashboardTopProductItem = z.infer<typeof DashboardTopProductItemSchema>;
