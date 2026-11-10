import { z } from 'zod';
import { KitchenStationSchema } from '../enums/station.enum';
import {
  OrderSourceSchema,
  OrderStatusSchema,
  OrderTypeSchema,
  PaymentMethodSchema,
  TableActionTypeSchema,
} from '../enums/order.enum';
import { IdSchema, IsoDateTimeSchema, MoneyAmountSchema, PaginationFields, QrTokenSchema } from './common.schema';

export const OrderItemModifierSnapshotSchema = z.object({
  groupId: IdSchema,
  modifierId: IdSchema,
  name: z.string().trim().min(1),
  extraPrice: MoneyAmountSchema,
}).strict();
export type OrderItemModifierSnapshot = z.infer<typeof OrderItemModifierSnapshotSchema>;

export const OrderItemModifierSelectionSchema = z.object({
  groupId: IdSchema,
  modifierId: IdSchema,
  action: z.enum(['SELECTED', 'REMOVED_DEFAULT', 'SUBSTITUTED']).optional(),
  substituteModifierId: IdSchema.optional(),
  substituteName: z.string().trim().max(120).optional(),
}).strict();
export type OrderItemModifierSelection = z.infer<typeof OrderItemModifierSelectionSchema>;

export const CreateOrderItemInputSchema = z.object({
  productId: IdSchema,
  quantity: z.number().int().positive(),
  modifiers: z.array(OrderItemModifierSelectionSchema).default([]),
  itemNote: z.string().trim().max(500).optional(),
}).strict();
export type CreateOrderItemInput = z.infer<typeof CreateOrderItemInputSchema>;

const OrderItemsInputSchema = z.array(CreateOrderItemInputSchema).min(1, 'Phải có ít nhất một món trong đơn hàng');

export const CreateQrOrderSchema = z.object({
  qrToken: QrTokenSchema,
  activeOrderId: IdSchema.optional(),
  items: OrderItemsInputSchema,
  note: z.string().trim().max(1000).optional(),
}).strict();
export type CreateQrOrderInput = z.infer<typeof CreateQrOrderSchema>;

export const CreatePosOrderSchema = z.object({
  orderType: OrderTypeSchema,
  tableId: IdSchema.nullable().optional(),
  items: OrderItemsInputSchema,
  note: z.string().trim().max(1000).optional(),
}).strict().refine((order) => {
  if (order.orderType === 'DINE_IN') return order.tableId !== null && order.tableId !== undefined;
  return order.tableId === null || order.tableId === undefined;
}, {
  message: 'Đơn tại bàn cần tableId; đơn mang về không được gắn bàn',
  path: ['tableId'],
});
export type CreatePosOrderInput = z.infer<typeof CreatePosOrderSchema>;

export const UpdateOrderItemSchema = z.object({
  orderItemId: IdSchema,
  quantity: z.number().int().positive().optional(),
  modifiers: z.array(OrderItemModifierSelectionSchema).optional(),
  itemNote: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => value.quantity !== undefined || value.modifiers !== undefined || value.itemNote !== undefined, {
  message: 'Phải cung cấp ít nhất một trường cần cập nhật',
});
export type UpdateOrderItemInput = z.infer<typeof UpdateOrderItemSchema>;

export const PatchOrderItemsSchema = z.object({
  addItems: z.array(CreateOrderItemInputSchema).optional(),
  updates: z.array(UpdateOrderItemSchema).optional(),
  removeItemIds: z.array(IdSchema).optional(),
}).strict().refine((input) => Boolean(input.addItems?.length || input.updates?.length || input.removeItemIds?.length), {
  message: 'Phải có ít nhất một thao tác thêm, sửa hoặc huỷ món',
});
export type PatchOrderItemsInput = z.infer<typeof PatchOrderItemsSchema>;

export const ApproveQrOrderSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(10).max(500).optional(),
}).strict().refine((input) => input.approved || input.reason !== undefined, {
  message: 'Từ chối đơn QR phải có lý do ít nhất 10 ký tự',
  path: ['reason'],
});
export type ApproveQrOrderInput = z.infer<typeof ApproveQrOrderSchema>;

export const PosOrderCreationResponseSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  tableId: IdSchema.nullable(),
  takeawayNumber: IdSchema.nullable(),
  tableLabel: z.string().min(1).nullable(),
  status: OrderStatusSchema,
  totalAmount: MoneyAmountSchema,
}).strict().refine((order) => order.orderType === 'TAKEAWAY'
  ? order.tableId === null && order.takeawayNumber !== null
  : order.tableId !== null && order.takeawayNumber === null, {
  message: 'Thông tin bàn và số mang về không khớp loại đơn',
});
export type PosOrderCreationResponse = z.infer<typeof PosOrderCreationResponseSchema>;

export const QrOrderResponseSchema = z.object({
  orderId: IdSchema,
  activeOrderId: IdSchema,
  orderCode: z.string().min(1),
  currentTableLabel: z.string().min(1),
  status: OrderStatusSchema,
  batchNo: z.number().int().positive(),
  totalAmount: MoneyAmountSchema,
}).strict();
export type QrOrderResponse = z.infer<typeof QrOrderResponseSchema>;

export const PosOrderSummarySchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  tableId: IdSchema.nullable(),
  tableLabel: z.string().min(1).nullable(),
  takeawayNumber: IdSchema.nullable(),
  status: OrderStatusSchema,
  totalAmount: MoneyAmountSchema,
  createdAt: IsoDateTimeSchema,
}).strict();
export type PosOrderSummary = z.infer<typeof PosOrderSummarySchema>;

export const PosTableGridResponseSchema = z.object({
  tables: z.array(z.object({
    id: IdSchema,
    name: z.string().min(1),
    status: z.enum(['AVAILABLE', 'PENDING', 'OCCUPIED']),
    activeOrderId: IdSchema.nullable(),
    activeOrder: PosOrderSummarySchema.nullable(),
  }).strict()),
  takeaways: z.array(PosOrderSummarySchema),
}).strict();
export type PosTableGridResponse = z.infer<typeof PosTableGridResponseSchema>;

const OrderDetailItemSchema = z.object({
  id: IdSchema,
  productId: IdSchema,
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: MoneyAmountSchema,
  lineTotal: MoneyAmountSchema,
  modifiers: z.array(z.string()),
  itemNote: z.string().nullable(),
  batchNo: z.number().int().positive(),
  kitchenStatus: z.enum(['NEW', 'PRINTED', 'CANCELLED']),
}).strict();

export const OrderDetailResponseSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  orderSource: OrderSourceSchema,
  tableId: IdSchema.nullable(),
  tableLabel: z.string().min(1).nullable(),
  takeawayNumber: IdSchema.nullable(),
  status: OrderStatusSchema,
  paymentMethod: PaymentMethodSchema.nullable(),
  cashAmount: MoneyAmountSchema,
  transferAmount: MoneyAmountSchema,
  totalAmount: MoneyAmountSchema,
  note: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  paidAt: IsoDateTimeSchema.nullable(),
  tableTransferLogs: z.array(z.unknown()),
  items: z.array(OrderDetailItemSchema),
}).strict();
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;

export const PatchOrderItemsResponseSchema = z.object({
  orderId: IdSchema,
  totalAmount: MoneyAmountSchema,
  requireCancellationSlip: z.boolean(),
  kitchenCancellationSlips: z.array(z.object({
    station: KitchenStationSchema,
    tableLabel: z.string().min(1),
    itemName: z.string().min(1),
    quantity: z.number().int().positive(),
  }).strict()),
}).strict();
export type PatchOrderItemsResponse = z.infer<typeof PatchOrderItemsResponseSchema>;

const KitchenTicketItemSchema = z.object({
  name: z.string().trim().min(1),
  qty: z.number().int().positive(),
  modifiers: z.array(z.string()),
  note: z.string(),
}).strict();

const KitchenTicketSchema = z.object({
  station: KitchenStationSchema,
  stationTitle: z.string().min(1),
  logoType: z.enum(['CHEF_HAT_NOODLE', 'FRENCH_FRIES', 'DRINK_CUP']),
  batchNo: z.number().int().positive(),
  batchLabel: z.string().min(1).optional(),
  transferNotice: z.string().min(1).optional(),
  items: z.array(KitchenTicketItemSchema).min(1),
}).strict();

export const SplitKitchenResponseSchema = z.object({
  tickets: z.array(KitchenTicketSchema).max(3),
  batchNo: z.number().int().positive().nullable().optional(),
  isAddonBatch: z.boolean().optional(),
  message: z.string().optional(),
}).strict();
export type SplitKitchenResponse = z.infer<typeof SplitKitchenResponseSchema>;

export const TableActionRequestSchema = z.object({
  action: TableActionTypeSchema,
  targetTableId: IdSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();
export type TableActionRequest = z.infer<typeof TableActionRequestSchema>;

export const TableActionResponseSchema = z.object({
  action: TableActionTypeSchema,
  sourceTableId: IdSchema,
  targetTableId: IdSchema,
  requireKitchenNoticePrint: z.boolean(),
  kitchenTransferSlip: z.object({
    orderCode: z.string().min(1),
    fromLabel: z.string().min(1),
    toLabel: z.string().min(1),
    affectedStations: z.array(KitchenStationSchema),
  }).strict().optional(),
}).strict();
export type TableActionResponse = z.infer<typeof TableActionResponseSchema>;

export const ProvisionalBillResponseSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  tableId: IdSchema.nullable(),
  takeawayNumber: IdSchema.nullable(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: MoneyAmountSchema,
    lineTotal: MoneyAmountSchema,
    modifiers: z.array(z.string()),
    note: z.string().nullable(),
  })),
  totalAmount: MoneyAmountSchema,
  status: z.literal('SERVING'),
  vietQrPayload: z.string().optional(),
}).strict().refine((bill) => {
  if (bill.orderType === 'DINE_IN') return bill.tableId !== null && bill.takeawayNumber === null;
  return bill.tableId === null && bill.takeawayNumber !== null;
}, { message: 'Thông tin bàn và số mang về không khớp loại đơn' });
export type ProvisionalBillResponse = z.infer<typeof ProvisionalBillResponseSchema>;

export const CheckoutOrderRequestSchema = z.object({
  paymentMethod: PaymentMethodSchema,
  totalAmount: MoneyAmountSchema.optional(),
  cashAmount: MoneyAmountSchema.default(0),
  transferAmount: MoneyAmountSchema.default(0),
  printReceipt: z.boolean().default(true),
}).strict().refine((payment) => {
  if (payment.totalAmount === undefined) return true;
  switch (payment.paymentMethod) {
    case 'CASH': return payment.cashAmount === payment.totalAmount && payment.transferAmount === 0;
    case 'TRANSFER': return payment.transferAmount === payment.totalAmount && payment.cashAmount === 0;
    case 'SPLIT': return payment.cashAmount > 0 && payment.transferAmount > 0
      && Math.round(payment.cashAmount * 100) + Math.round(payment.transferAmount * 100) === Math.round(payment.totalAmount * 100);
  }
}, {
  message: 'Số tiền thanh toán phải bằng tổng đơn và khớp với phương thức CASH, TRANSFER hoặc SPLIT',
  path: ['paymentMethod'],
});
export type CheckoutOrderRequest = z.infer<typeof CheckoutOrderRequestSchema>;

export const InvoiceFilterQuerySchema = z.object({
  ...PaginationFields,
  fromDate: z.iso.date().optional(),
  toDate: z.iso.date().optional(),
  keyword: z.string().trim().min(1).optional(),
  searchField: z.enum(['order_code', 'table', 'note']).optional(),
  status: OrderStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
}).refine((filter) => filter.fromDate === undefined || filter.toDate === undefined || filter.fromDate <= filter.toDate, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type InvoiceFilterQuery = z.infer<typeof InvoiceFilterQuerySchema>;

export const VoidInvoiceRequestSchema = z.object({
  voidReason: z.string().trim().min(10, 'Lý do huỷ hoá đơn phải có ít nhất 10 ký tự').max(500),
}).strict();
export type VoidInvoiceRequest = z.infer<typeof VoidInvoiceRequestSchema>;

