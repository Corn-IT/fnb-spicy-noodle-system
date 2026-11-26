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
import { DiscountWarningCodeSchema } from '../enums/discount.enum';
import { DiscountSnapshotSchema } from './discount.schema';
import { PaymentAccountBriefSchema } from './payment-qr.schema';

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
  isTakeaway: z.boolean().optional(),
}).strict();
export type CreateOrderItemInput = z.infer<typeof CreateOrderItemInputSchema>;

const OrderItemsInputSchema = z.array(CreateOrderItemInputSchema).min(1, 'Phải có ít nhất một món trong đơn hàng');

export const CreateQrOrderSchema = z.object({
  qrToken: QrTokenSchema,
  activeOrderId: IdSchema.optional(),
  guestSessionToken: z.string().trim().min(16).max(256).optional(),
  items: OrderItemsInputSchema,
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().trim().max(24).optional(),
  note: z.string().trim().max(1000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isTakeawayBatch: z.boolean().optional(),
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

const PosDraftFieldsSchema = z.object({
  orderType: OrderTypeSchema.nullable(),
  tableId: IdSchema.nullable(),
  items: z.array(CreateOrderItemInputSchema).max(100),
  note: z.string().trim().max(1000).nullable(),
}).strict();

const validatePosDraftTarget = (draft: PosDraftState, context: z.RefinementCtx) => {
  if (draft.orderType === null && draft.tableId !== null) {
    context.addIssue({ code: 'custom', message: 'Giỏ chưa gán loại đơn không được gắn bàn', path: ['tableId'] });
  }
  if (draft.orderType === 'TAKEAWAY' && draft.tableId !== null) {
    context.addIssue({ code: 'custom', message: 'Đơn mang về không được gắn bàn', path: ['tableId'] });
  }
};

export const PosDraftStateSchema = PosDraftFieldsSchema.superRefine(validatePosDraftTarget);
export type PosDraftState = z.infer<typeof PosDraftStateSchema>;

export const CreatePosDraftRequestSchema = PosDraftStateSchema;
export type CreatePosDraftRequest = z.infer<typeof CreatePosDraftRequestSchema>;

export const UpdatePosDraftRequestSchema = PosDraftFieldsSchema.extend({
  expectedRevision: z.number().int().positive(),
}).strict().superRefine((draft, context) => validatePosDraftTarget(draft, context));
export type UpdatePosDraftRequest = z.infer<typeof UpdatePosDraftRequestSchema>;

export const SubmitPosDraftRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(128),
}).strict();
export type SubmitPosDraftRequest = z.infer<typeof SubmitPosDraftRequestSchema>;

export const PosDraftResponseSchema = PosDraftFieldsSchema.extend({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  tableName: z.string().min(1).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict().superRefine((draft, context) => validatePosDraftTarget(draft, context));
export type PosDraftResponse = z.infer<typeof PosDraftResponseSchema>;

export const PosDraftListResponseSchema = z.object({
  drafts: z.array(PosDraftResponseSchema),
}).strict();
export type PosDraftListResponse = z.infer<typeof PosDraftListResponseSchema>;

export const SubmitPosDraftResponseSchema = z.object({
  draftId: z.string().min(1),
  order: z.object({
    orderId: IdSchema,
    orderCode: z.string().min(1),
    orderType: OrderTypeSchema,
    tableId: IdSchema.nullable(),
    takeawayNumber: IdSchema.nullable(),
    tableLabel: z.string().min(1).nullable(),
    status: OrderStatusSchema,
    subtotalAmount: MoneyAmountSchema.optional(),
    discountAmount: MoneyAmountSchema.optional(),
    totalAmount: MoneyAmountSchema,
  }).strict(),
  idempotentReplay: z.boolean(),
}).strict();
export type SubmitPosDraftResponse = z.infer<typeof SubmitPosDraftResponseSchema>;

export const PosDraftInvalidationPayloadSchema = z.object({
  draftId: z.string().min(1),
  action: z.enum(['SAVED', 'DELETED', 'SUBMITTED']),
  revision: z.number().int().positive().optional(),
  updatedAt: IsoDateTimeSchema,
}).strict();
export type PosDraftInvalidationPayload = z.infer<typeof PosDraftInvalidationPayloadSchema>;

export const UpdateOrderItemSchema = z.object({
  orderItemId: IdSchema,
  quantity: z.number().int().positive().optional(),
  modifiers: z.array(OrderItemModifierSelectionSchema).optional(),
  itemNote: z.string().trim().max(500).nullable().optional(),
  isTakeaway: z.boolean().optional(),
}).strict().refine((value) => value.quantity !== undefined || value.modifiers !== undefined || value.itemNote !== undefined || value.isTakeaway !== undefined, {
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
  subtotalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
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
  orderType: OrderTypeSchema.optional(),
  takeawayNumber: IdSchema.nullable().optional(),
  guestSessionToken: z.string().min(16).optional(),
  currentTableLabel: z.string().min(1),
  status: OrderStatusSchema,
  batchNo: z.number().int().positive(),
  totalAmount: MoneyAmountSchema,
}).strict();
export type QrOrderResponse = z.infer<typeof QrOrderResponseSchema>;

export const OrderItemSourceSchema = z.enum(['POS_COUNTER', 'QR_CODE']);
export type OrderItemSource = z.infer<typeof OrderItemSourceSchema>;

export const PosOrderSummarySchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  tableId: IdSchema.nullable(),
  tableLabel: z.string().min(1).nullable(),
  takeawayNumber: IdSchema.nullable(),
  status: OrderStatusSchema,
  subtotalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
  totalAmount: MoneyAmountSchema,
  createdAt: IsoDateTimeSchema,
  hasUnprintedAddon: z.boolean().optional(),
  unprintedAddonBatchNo: z.number().int().positive().nullable().optional(),
  pendingQrSince: IsoDateTimeSchema.nullable().optional(),
  pendingQrKind: z.enum(['NEW', 'ADDON']).nullable().optional(),
}).strict();
export type PosOrderSummary = z.infer<typeof PosOrderSummarySchema>;

export const QrAutoCancelledPayloadSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  tableId: IdSchema.nullable(),
  tableLabel: z.string().min(1).nullable(),
  kind: z.enum(['NEW', 'ADDON']),
  cancelledItemCount: z.number().int().nonnegative(),
  autoCancelMinutes: z.number().int().positive(),
  cancelledAt: IsoDateTimeSchema,
  reason: z.string().min(1),
}).strict();
export type QrAutoCancelledPayload = z.infer<typeof QrAutoCancelledPayloadSchema>;

export const QrNoticeKindSchema = z.enum([
  'GUEST_ORDER_CREATED',
  'GUEST_ADDON_ADDED',
  'ITEMS_UPDATED',
  'DISCOUNT_APPLIED',
  'DISCOUNT_REMOVED',
  'PROVISIONAL_BILL_PRINTED',
  'TABLE_MERGED_INTO',
]);
export type QrNoticeKind = z.infer<typeof QrNoticeKindSchema>;

export const QrCancelledItemNoticeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive(),
}).strict();
export type QrCancelledItemNotice = z.infer<typeof QrCancelledItemNoticeSchema>;

export const QrOrderNoticePayloadSchema = z.object({
  orderId: IdSchema,
  tableId: IdSchema.nullable().optional(),
  kind: QrNoticeKindSchema,
  orderStatus: z.enum(['PENDING', 'SERVING']).optional(),
  batchNo: z.number().int().positive().optional(),
  totalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
  cancelledItems: z.array(QrCancelledItemNoticeSchema).optional(),
  sourceTableLabel: z.string().trim().min(1).max(64).optional(),
  targetTableLabel: z.string().trim().min(1).max(64).optional(),
  timestamp: IsoDateTimeSchema,
}).strict();
export type QrOrderNoticePayload = z.infer<typeof QrOrderNoticePayloadSchema>;

export const QrTableRotatedPayloadSchema = z.object({
  tableId: IdSchema,
  rotatedAt: IsoDateTimeSchema,
}).strict();
export type QrTableRotatedPayload = z.infer<typeof QrTableRotatedPayloadSchema>;

export const PosTableGridResponseSchema = z.object({
  tables: z.array(z.object({
    id: IdSchema,
    name: z.string().min(1),
    qrToken: QrTokenSchema.optional(),
    status: z.enum(['AVAILABLE', 'PENDING', 'OCCUPIED']),
    activeOrderId: IdSchema.nullable(),
    activeOrder: PosOrderSummarySchema.nullable(),
  }).strict()),
  takeaways: z.array(PosOrderSummarySchema),
  takeawayQrToken: QrTokenSchema.optional(),
}).strict();
export type PosTableGridResponse = z.infer<typeof PosTableGridResponseSchema>;

export const RotateTakeawayQrResponseSchema = z.object({
  qrToken: QrTokenSchema,
}).strict();
export type RotateTakeawayQrResponse = z.infer<typeof RotateTakeawayQrResponseSchema>;

export const ShortenLegacyQrTokensResponseSchema = z.object({
  updatedTables: z.number().int().min(0),
  updatedTakeaway: z.boolean(),
}).strict();
export type ShortenLegacyQrTokensResponse = z.infer<typeof ShortenLegacyQrTokensResponseSchema>;

export const RotateTableQrResponseSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  qrToken: QrTokenSchema,
  status: z.enum(['AVAILABLE', 'PENDING', 'OCCUPIED']),
  activeOrderId: IdSchema.nullable(),
}).strict();
export type RotateTableQrResponse = z.infer<typeof RotateTableQrResponseSchema>;

const OrderDetailItemSchema = z.object({
  id: IdSchema,
  productId: IdSchema,
  categoryId: IdSchema.nullable().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: MoneyAmountSchema,
  lineTotal: MoneyAmountSchema,
  modifiers: z.array(z.string()),
  pricedModifiers: z.array(z.string()).optional(),
  itemNote: z.string().nullable(),
  batchNo: z.number().int().positive(),
  kitchenStatus: z.enum(['NEW', 'PRINTED', 'CANCELLED']),
  isTakeaway: z.boolean().optional(),
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
  subtotalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
  discountId: IdSchema.nullable().optional(),
  discountSnapshot: DiscountSnapshotSchema.nullable().optional(),
  discountWarning: DiscountWarningCodeSchema.nullable().optional(),
  totalAmount: MoneyAmountSchema,
  note: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  paidAt: IsoDateTimeSchema.nullable(),
  pendingPaymentEdit: z.object({
    paymentMethod: PaymentMethodSchema,
    cashAmount: MoneyAmountSchema,
    transferAmount: MoneyAmountSchema,
    reason: z.string().trim().min(1),
    requestedBy: IdSchema,
    requestedByName: z.string().trim().min(1),
    requestedByUsername: z.string().trim().min(1),
    requestedAt: IsoDateTimeSchema,
  }).strict().nullable().optional(),
  tableTransferLogs: z.array(z.unknown()),
  items: z.array(OrderDetailItemSchema),
}).strict();
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;

export const KitchenCancellationSlipSchema = z.object({
  station: KitchenStationSchema,
  tableLabel: z.string().min(1),
  itemName: z.string().min(1),
  quantity: z.number().int().positive(),
}).strict();
export type KitchenCancellationSlip = z.infer<typeof KitchenCancellationSlipSchema>;

export const CancelOrderResponseSchema = z.object({
  orderId: IdSchema,
  status: z.literal('VOIDED'),
  tableId: IdSchema.nullable(),
  requireCancellationSlip: z.boolean().default(false),
  kitchenCancellationSlips: z.array(KitchenCancellationSlipSchema).default([]),
}).strict();
export type CancelOrderResponse = z.infer<typeof CancelOrderResponseSchema>;

export const PatchOrderItemsResponseSchema = z.object({
  orderId: IdSchema,
  subtotalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
  discountWarning: DiscountWarningCodeSchema.nullable().optional(),
  totalAmount: MoneyAmountSchema,
  requireCancellationSlip: z.boolean(),
  kitchenCancellationSlips: z.array(KitchenCancellationSlipSchema),
}).strict();
export type PatchOrderItemsResponse = z.infer<typeof PatchOrderItemsResponseSchema>;

const KitchenTicketItemSchema = z.object({
  name: z.string().trim().min(1),
  qty: z.number().int().positive(),
  modifiers: z.array(z.string()),
  note: z.string(),
  unitPrice: MoneyAmountSchema.optional(),
  categoryId: IdSchema.nullable().optional(),
  isTakeaway: z.boolean().optional(),
}).strict();

const KitchenTicketSchema = z.object({
  station: KitchenStationSchema,
  stationTitle: z.string().min(1),
  logoType: z.enum(['CHEF_HAT_NOODLE', 'FRENCH_FRIES', 'DRINK_CUP']),
  batchNo: z.number().int().positive(),
  batchLabel: z.string().min(1).optional(),
  transferNotice: z.string().min(1).optional(),
  reprintLabel: z.string().min(1).optional(),
  items: z.array(KitchenTicketItemSchema).min(1),
}).strict();

export const SplitKitchenResponseSchema = z.object({
  tickets: z.array(KitchenTicketSchema).max(3),
  batchNo: z.number().int().positive().nullable().optional(),
  isAddonBatch: z.boolean().optional(),
  message: z.string().optional(),
}).strict();
export type SplitKitchenResponse = z.infer<typeof SplitKitchenResponseSchema>;

export const ReprintKitchenRequestSchema = z.object({
  batchNo: z.number().int().positive().optional(),
  station: KitchenStationSchema.optional(),
}).strict();
export type ReprintKitchenRequest = z.infer<typeof ReprintKitchenRequestSchema>;

export const TableActionRequestSchema = z.object({
  action: TableActionTypeSchema,
  targetTableId: IdSchema.nullable().optional(),
  reason: z.string().trim().min(1).max(500),
}).strict().refine((input) => {
  if (input.action === 'TO_TAKEAWAY') {
    return input.targetTableId === null || input.targetTableId === undefined;
  }
  return typeof input.targetTableId === 'number' && input.targetTableId > 0;
}, {
  message: 'Thao tác chuyển/gộp/hoán đổi bàn cần targetTableId; chuyển sang mang về không được gắn bàn',
  path: ['targetTableId'],
});
export type TableActionRequest = z.infer<typeof TableActionRequestSchema>;

export const TableActionResponseSchema = z.object({
  action: TableActionTypeSchema,
  sourceTableId: IdSchema.nullable(),
  targetTableId: IdSchema.nullable(),
  takeawayNumber: IdSchema.nullable().optional(),
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
    pricedModifiers: z.array(z.string()).optional(),
    note: z.string().nullable(),
    isTakeaway: z.boolean().optional(),
  })),
  subtotalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
  discountSnapshot: DiscountSnapshotSchema.nullable().optional(),
  discountWarning: DiscountWarningCodeSchema.nullable().optional(),
  totalAmount: MoneyAmountSchema,
  status: z.literal('SERVING'),
  vietQrPayload: z.string().optional(),
  paymentAccount: PaymentAccountBriefSchema.optional(),
  qrRotated: z.boolean().optional(),
  qrOverLimit: z.boolean().optional(),
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
  searchField: z.enum(['order_code', 'table', 'note', 'discount_code']).optional(),
  discountCode: z.string().trim().min(1).max(32).optional(),
  status: OrderStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  orderType: OrderTypeSchema.optional(),
}).refine((filter) => filter.fromDate === undefined || filter.toDate === undefined || filter.fromDate <= filter.toDate, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type InvoiceFilterQuery = z.infer<typeof InvoiceFilterQuerySchema>;

export const VoidInvoiceRequestSchema = z.object({
  voidReason: z.string().trim().min(10, 'Lý do huỷ hoá đơn phải có ít nhất 10 ký tự').max(500),
}).strict();
export type VoidInvoiceRequest = z.infer<typeof VoidInvoiceRequestSchema>;

export const PendingPaymentEditSchema = z.object({
  paymentMethod: PaymentMethodSchema,
  cashAmount: MoneyAmountSchema,
  transferAmount: MoneyAmountSchema,
  reason: z.string().trim().min(3).max(500),
  requestedBy: IdSchema,
  requestedByName: z.string().trim().min(1),
  requestedByUsername: z.string().trim().min(1),
  requestedAt: IsoDateTimeSchema,
}).strict();
export type PendingPaymentEdit = z.infer<typeof PendingPaymentEditSchema>;

export const UpdateInvoicePaymentMethodSchema = z.object({
  paymentMethod: PaymentMethodSchema,
  cashAmount: MoneyAmountSchema.default(0),
  transferAmount: MoneyAmountSchema.default(0),
  reason: z.string().trim().min(3, 'Lý do điều chỉnh phải có ít nhất 3 ký tự').max(500),
}).strict();
export type UpdateInvoicePaymentMethodInput = z.infer<typeof UpdateInvoicePaymentMethodSchema>;

export const ReviewInvoicePaymentEditSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reviewNote: z.string().trim().max(500).optional(),
}).strict();
export type ReviewInvoicePaymentEditInput = z.infer<typeof ReviewInvoicePaymentEditSchema>;

export const CreateDiningTableSchema = z.object({
  name: z.string().trim().min(1, 'Tên bàn không được để trống').max(32),
}).strict();
export type CreateDiningTableInput = z.infer<typeof CreateDiningTableSchema>;

export const UpdateDiningTableSchema = z.object({
  name: z.string().trim().min(1, 'Tên bàn không được để trống').max(32),
}).strict();
export type UpdateDiningTableInput = z.infer<typeof UpdateDiningTableSchema>;

export const SplitCheckoutItemSelectionSchema = z.object({
  orderItemId: IdSchema,
  quantity: z.number().int().positive(),
}).strict();
export type SplitCheckoutItemSelection = z.infer<typeof SplitCheckoutItemSelectionSchema>;

export const SplitProvisionalBillRequestSchema = z.object({
  items: z.array(SplitCheckoutItemSelectionSchema).min(1, 'Phải chọn ít nhất một món để in tạm tính tách đơn'),
}).strict();
export type SplitProvisionalBillRequest = z.infer<typeof SplitProvisionalBillRequestSchema>;

export const SplitCheckoutOrderRequestSchema = z.object({
  items: z.array(SplitCheckoutItemSelectionSchema).min(1, 'Phải chọn ít nhất một món để tách thanh toán'),
  paymentMethod: PaymentMethodSchema,
  cashAmount: MoneyAmountSchema.default(0),
  transferAmount: MoneyAmountSchema.default(0),
  printReceipt: z.boolean().default(true),
  paymentAccountId: IdSchema.optional(),
}).strict();
export type SplitCheckoutOrderRequest = z.infer<typeof SplitCheckoutOrderRequestSchema>;

export const QrSecurityConfigSchema = z.object({
  wifiProtectionEnabled: z.boolean().default(false),
  autoSyncPosIp: z.boolean().default(true),
  allowedWifiIps: z.array(z.string().trim().min(1).max(64)).default([]),
  wifiSsid: z.string().trim().max(120).default(''),
  wifiPassword: z.string().trim().max(120).default(''),
  geoProtectionEnabled: z.boolean().default(false),
  shopLatitude: z.number().min(-90).max(90).nullable().default(null),
  shopLongitude: z.number().min(-180).max(180).nullable().default(null),
  geoRadiusMeters: z.number().int().min(20).max(5000).default(200),
  applySecurityToTakeaway: z.boolean().default(false),
}).strict();
export type QrSecurityConfig = z.infer<typeof QrSecurityConfigSchema>;

export const UpdateQrSecurityConfigSchema = QrSecurityConfigSchema;
export type UpdateQrSecurityConfigInput = z.input<typeof UpdateQrSecurityConfigSchema>;

export const QrSecurityConfigResponseSchema = QrSecurityConfigSchema.extend({
  detectedClientIp: z.string().trim().min(1),
  syncedPosIp: z.string().trim().nullable().default(null),
  updatedAt: z.string().nullable().optional(),
}).strict();
export type QrSecurityConfigResponse = z.infer<typeof QrSecurityConfigResponseSchema>;

export const ThermalPrinterDriverSchema = z.enum(['BROWSER', 'RAWBT_USB', 'LAN_ESCPOS']);
export type ThermalPrinterDriver = z.infer<typeof ThermalPrinterDriverSchema>;

export const ThermalPaperWidthDotsSchema = z.union([z.literal(576), z.literal(384)]);
export type ThermalPaperWidthDots = z.infer<typeof ThermalPaperWidthDotsSchema>;

/**
 * Validates that a LAN printer host is a private RFC1918 IPv4 address
 * (192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12) or 127.0.0.1 local print relay.
 * Prevents SSRF to public internet hosts or cloud metadata services (169.254.x.x).
 */
export function isAllowedLanPrinterHost(rawHost: string): boolean {
  const host = rawHost.trim();
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4Match) return false;

  const octets = [
    Number(ipv4Match[1]),
    Number(ipv4Match[2]),
    Number(ipv4Match[3]),
    Number(ipv4Match[4]),
  ];
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false;
  }

  const [a, b, c, d] = octets;
  if (a === 127 && b === 0 && c === 0 && d === 1) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

export const ThermalPrinterDeviceConfigSchema = z.object({
  driver: ThermalPrinterDriverSchema.default('BROWSER'),
  paperWidthDots: ThermalPaperWidthDotsSchema.default(576),
  cashDrawerKick: z.boolean().default(true),
  rawbtWsUrl: z.string().trim().min(1).max(200).default('ws://127.0.0.1:40213/'),
  rawbtFallbackToIntent: z.boolean().default(true),
  lanHost: z.string().trim().min(1).max(64).default('192.168.1.200'),
  lanPort: z.number().int().min(1).max(65535).default(9100),
  lanTimeoutMs: z.number().int().min(500).max(15000).default(4000),
  leftMarginMm: z.number().min(0).max(8).default(0),
  rightMarginMm: z.number().min(0).max(8).default(0),
  feedLinesBeforeCut: z.number().int().min(0).max(5).default(0),
}).strict();
export type ThermalPrinterDeviceConfig = z.infer<typeof ThermalPrinterDeviceConfigSchema>;

export const DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG: ThermalPrinterDeviceConfig = {
  driver: 'BROWSER',
  paperWidthDots: 576,
  cashDrawerKick: true,
  rawbtWsUrl: 'ws://127.0.0.1:40213/',
  rawbtFallbackToIntent: true,
  lanHost: '192.168.1.200',
  lanPort: 9100,
  lanTimeoutMs: 4000,
  leftMarginMm: 0,
  rightMarginMm: 0,
  feedLinesBeforeCut: 0,
};

export const LanEscPosPrintRequestSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, 'Địa chỉ IP máy in LAN không được để trống')
    .max(64)
    .refine(isAllowedLanPrinterHost, {
      message:
        'Địa chỉ IP máy in phải nằm trong dải mạng nội bộ LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x hoặc 127.0.0.1)',
    }),
  port: z.number().int().min(1).max(65535).default(9100),
  payloadBase64: z
    .string()
    .trim()
    .min(1, 'Dữ liệu lệnh in ESC/POS không được để trống')
    .max(2_000_000, 'Dữ liệu lệnh in ESC/POS vượt quá kích thước cho phép'),
  timeoutMs: z.number().int().min(500).max(15000).default(4000),
}).strict();
export type LanEscPosPrintRequest = z.infer<typeof LanEscPosPrintRequestSchema>;

export const LanEscPosPrintResponseSchema = z.object({
  success: z.boolean(),
  host: z.string(),
  port: z.number().int(),
  bytesSent: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
}).strict();
export type LanEscPosPrintResponse = z.infer<typeof LanEscPosPrintResponseSchema>;



