import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

const publicContractNames = [
  'KitchenStation', 'KitchenStationSchema', 'ProductStation', 'ProductStationSchema',
  'OrderType', 'OrderTypeSchema', 'OrderSource', 'OrderSourceSchema', 'OrderStatus', 'OrderStatusSchema',
  'KitchenStatus', 'KitchenStatusSchema', 'PaymentMethod', 'PaymentMethodSchema', 'TableStatus', 'TableStatusSchema',
  'TableActionType', 'TableActionTypeSchema', 'MdmCategory', 'MdmCategorySchema', 'PaymentSource', 'PaymentSourceSchema',
  'SettlementStatus', 'SettlementStatusSchema', 'ErrorCodes', 'SocketNamespace', 'SocketEvents', 'SocketRooms',
  'ApiErrorResponseSchema', 'PaginationQuerySchema', 'PaginatedResponseSchema', 'ModulePermissionsSchema',
  'UserPermissionsSchema', 'LoginRequestSchema', 'AuthPrincipalSchema', 'AuthUserSchema', 'AuthResponseSchema',
  'RefreshRequestSchema', 'CreateUserSchema', 'UpdatePermissionsSchema', 'UserListQuerySchema', 'UserAdminRecordSchema', 'UserListResponseSchema',
  'MdmItemSchema', 'MdmLookupQuerySchema', 'MdmListResponseSchema', 'UpsertMdmSchema', 'UpdateMdmSchema', 'ModifierSchema', 'ModifierGroupSchema', 'ComboItemSchema',
  'ProductSchema', 'CreateProductSchema', 'UpdateProductSchema', 'DiningTableSchema', 'PublicMenuResponseSchema',
  'OrderItemModifierSnapshotSchema', 'CreateOrderItemInputSchema', 'CreateQrOrderSchema', 'CreatePosOrderSchema',
  'OrderItemModifierSelectionSchema', 'ApproveQrOrderSchema', 'PatchOrderItemsSchema', 'PosOrderCreationResponseSchema',
  'PosDraftStateSchema', 'CreatePosDraftRequestSchema', 'UpdatePosDraftRequestSchema', 'SubmitPosDraftRequestSchema',
  'PosDraftResponseSchema', 'PosDraftListResponseSchema', 'SubmitPosDraftResponseSchema', 'PosDraftInvalidationPayloadSchema',
  'QrOrderResponseSchema', 'PosOrderSummarySchema', 'PosTableGridResponseSchema', 'OrderDetailResponseSchema',
  'UpdateOrderItemSchema', 'SplitKitchenResponseSchema', 'TableActionRequestSchema', 'TableActionResponseSchema',
  'ProvisionalBillResponseSchema', 'CheckoutOrderRequestSchema', 'InvoiceFilterQuerySchema', 'VoidInvoiceRequestSchema',
  'InventoryImportItemInputSchema', 'CreateInventoryImportBatchSchema', 'InventoryImportFilterQuerySchema',
  'DenominationsDetailSchema', 'CreateSettlementRequestSchema', 'CashflowSettlementFilterQuerySchema',
  'UpdateDefaultBudgetSchema', 'SettlementResponseSchema',
  'CreateEmployeeSchema', 'UpdateEmployeeSchema', 'EmployeeFilterQuerySchema', 'ScheduleCellSchema',
  'BulkSaveScheduleRequestSchema', 'CopyPreviousWeekRequestSchema', 'UiPreferencesSchema', 'UpdateProfileSchema',
  'UpdateUiPreferencesSchema', 'EmployeeProfileSchema', 'ProfileResponseSchema',
] as const;

const item = { productId: 1, quantity: 2, modifiers: [], itemNote: 'no onions' };
const denominations = {
  '500000': 1, '200000': 0, '100000': 0, '50000': 0, '20000': 0,
  '10000': 0, '5000': 0, '2000': 0, '1000': 0,
};

describe('@fnb/shared contracts', () => {
  it('exports every contract named by Story 01', () => {
    for (const name of publicContractNames) {
      expect(contracts, `${name} must be exported by the package barrel`).toHaveProperty(name);
    }
  });

  it('uses separate physical kitchen stations and product stations', () => {
    expect(contracts.KitchenStationSchema.safeParse('BEP_NAU').success).toBe(true);
    expect(contracts.KitchenStationSchema.safeParse('COMBO').success).toBe(false);
    expect(contracts.ProductStationSchema.safeParse('COMBO').success).toBe(true);
  });

  it('parses each shared operational value set and rejects unknown values', () => {
    const enums = [
      [contracts.OrderTypeSchema, 'TAKEAWAY'], [contracts.OrderSourceSchema, 'QR_CODE'],
      [contracts.OrderStatusSchema, 'SERVING'], [contracts.KitchenStatusSchema, 'PRINTED'],
      [contracts.PaymentMethodSchema, 'SPLIT'], [contracts.TableStatusSchema, 'OCCUPIED'],
      [contracts.TableActionTypeSchema, 'MOVE'], [contracts.MdmCategorySchema, 'INGREDIENT'],
      [contracts.PaymentSourceSchema, 'CASH_DRAWER'], [contracts.SettlementStatusSchema, 'SHORTAGE'],
    ] as const;
    for (const [schema, value] of enums) {
      expect(schema.safeParse(value).success).toBe(true);
      expect(schema.safeParse('UNKNOWN').success).toBe(false);
    }
  });

  it('defines stable error-code and socket room contracts', () => {
    expect(Object.values(contracts.ErrorCodes)).toEqual([
      'AUTH_TOKEN_MISSING', 'AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_CREDENTIALS_INVALID',
      'AUTH_SESSION_REPLACED', 'AUTH_SESSION_REVOKED', 'AUTH_SESSION_CONFLICT_ONLINE',
      'RBAC_PERMISSION_DENIED', 'RBAC_SUPER_ADMIN_REQUIRED', 'POS_TABLE_NOT_AVAILABLE', 'POS_TABLE_NOT_OCCUPIED',
      'POS_ORDER_NOT_ACTIVE', 'POS_NO_NEW_ITEMS_TO_SPLIT', 'POS_TAKEAWAY_CANNOT_MERGE', 'POS_CONCURRENT_MODIFICATION',
      'CASHFLOW_ALREADY_SETTLED', 'CASHFLOW_BUDGET_NOT_SET', 'CASHFLOW_DISCREPANCY_NOTE_REQUIRED',
      'INVENTORY_ALREADY_DELETED', 'INVENTORY_PAST_SHIFT_FORBIDDEN', 'MDM_NAME_TAKEN',
      'HR_CITIZEN_ID_DUPLICATE', 'HR_USERNAME_TAKEN', 'HR_EMPLOYEE_DELETED', 'HR_EMPLOYEE_ACCOUNT_EXISTS', 'VALIDATION_FAILED',
      'QR_WIFI_REQUIRED', 'QR_GEO_REQUIRED', 'QR_GEO_OUT_OF_RANGE',
      'PAYMENT_QR_NOT_CONFIGURED', 'PAYMENT_QR_LOCKED_FIELD', 'PAYMENT_QR_IN_USE', 'PAYMENT_QR_CANNOT_DELETE_ACTIVE', 'PAYMENT_QR_LAST_ACTIVE', 'PAYMENT_QR_DUPLICATE_ACCOUNT',
      'STORE_ASSET_INVALID_TYPE', 'STORE_ASSET_TOO_LARGE', 'STORE_SETTINGS_CONFLICT',
      'DISCOUNT_NOT_FOUND', 'DISCOUNT_INACTIVE', 'DISCOUNT_EXPIRED', 'DISCOUNT_NOT_STARTED', 'DISCOUNT_OUT_OF_TIME_WINDOW', 'DISCOUNT_USAGE_EXHAUSTED', 'DISCOUNT_NOT_APPLICABLE', 'DISCOUNT_LOCKED_FIELDS', 'POS_DISCOUNT_BLOCKS_SPLIT',
      'POS_DRAFT_CONCURRENT_MODIFICATION', 'POS_DRAFT_ALREADY_SUBMITTED',
    ]);
    expect(contracts.ErrorCodes.AUTH_TOKEN_EXPIRED).toBe('AUTH_TOKEN_EXPIRED');
    expect(contracts.ErrorCodes.CASHFLOW_DISCREPANCY_NOTE_REQUIRED).toBe('CASHFLOW_DISCREPANCY_NOTE_REQUIRED');
    expect(contracts.SocketNamespace).toBe('/pos');
    expect(contracts.SocketEvents.ORDER_QR_NEW).toBe('order:qr_new');
    expect(contracts.SocketEvents.POS_DRAFTS_UPDATED).toBe('pos:drafts_updated');
    expect(contracts.SocketRooms.orderSession(42)).toBe('order_session_42');
  });

  it('validates standardized errors and coerces bounded pagination query strings', () => {
    expect(contracts.ApiErrorResponseSchema.safeParse({
      statusCode: 422, error: 'Unprocessable Entity', message: 'Dữ liệu không hợp lệ',
      code: contracts.ErrorCodes.VALIDATION_FAILED, requestId: '6b31e399-6781-44d5-9b68-7d19ef3171ef',
      details: { fieldErrors: { name: ['required'] } },
    }).success).toBe(true);
    expect(contracts.ApiErrorResponseSchema.safeParse({ statusCode: 700, error: '', message: '' }).success).toBe(false);
    expect(contracts.PaginationQuerySchema.parse({ page: '2', limit: '50' })).toMatchObject({ page: 2, limit: 50 });
    expect(contracts.PaginationQuerySchema.safeParse({ page: '0', limit: '101' }).success).toBe(false);
    expect(contracts.PaginatedResponseSchema(contracts.ApiErrorResponseSchema).safeParse({
      data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }).success).toBe(true);
  });

  it('synchronizes RBAC permissions with all nine modules and false defaults', () => {
    const parsed = contracts.UserPermissionsSchema.parse({ pos: { view: true, checkout: true } });
    expect(parsed.pos).toMatchObject({ view: true, create: false, splitKitchen: false, checkout: true, qrSecurity: false });
    expect(parsed.menu).toEqual({
      view: true, create: false, update: false, delete: false, manageStations: false, manageCategories: false, import: false, export: false,
    });
    expect(parsed.invoices).toEqual({ view: false, reprint: false, update: false, approve: false, void: false, export: false });
    expect(parsed.inventory).toMatchObject({ view: false, create: false, update: false, delete: false, export: false });
    expect(parsed.cashflow).toMatchObject({ view: false, create: false, compensate: false, config: false, export: false });
    expect(parsed.employees).toMatchObject({ view: false, create: false, update: false, delete: false, export: false });
    expect(parsed.schedules).toEqual({ view: false, create: false, update: false, delete: false, export: false });
    expect(parsed.payroll).toEqual({ view: false, update: false, config: false, export: false });
    expect(parsed.mdm).toEqual({ view: false, create: false, update: false, delete: false });
    expect(parsed.rbac).toEqual({ view: false, create: false, update: false, resetPassword: false });
    expect(parsed.paymentQr).toEqual({ view: false, create: false, update: false, delete: false });

    const legacyParsed = contracts.UserPermissionsSchema.parse({
      mdm: { view: true, write: true },
      rbac: { view: true, manage: true },
    });
    expect(legacyParsed.mdm).toEqual({ view: true, create: true, update: true, delete: true });
    expect(legacyParsed.rbac).toEqual({ view: true, create: true, update: true, resetPassword: true });

    expect(contracts.UserPermissionsSchema.safeParse({ pos: { view: 'yes' } }).success).toBe(false);
    expect(contracts.LoginRequestSchema.safeParse({ username: 'cashier', password: 'short' }).success).toBe(false);
    expect(contracts.AuthResponseSchema.safeParse({
      accessToken: 'access',
      user: {
        id: 1, employeeId: 2, username: 'cashier', isSuperAdmin: false, permissions: parsed,
        employee: { fullName: 'Cashier One', shortName: 'C.One', avatarUrl: null, position: null, specialty: null },
        uiPreferences: { theme: 'system', sidebarWidth: 260, columnWidths: {} },
      },
    }).success).toBe(true);
    expect(contracts.RefreshRequestSchema.parse(undefined)).toEqual({});
    expect(contracts.CreateUserSchema.safeParse({ employeeId: 1, username: 'cashier', password: 'Password1' }).success).toBe(true);
    expect(contracts.UpdatePermissionsSchema.safeParse({ permissions: parsed }).success).toBe(true);
    expect(contracts.UpdatePermissionsSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(contracts.UpdatePermissionsSchema.safeParse({}).success).toBe(false);
    expect(contracts.UpdatePermissionsSchema.safeParse({ permissions: { pos: { view: 'yes' } } }).success).toBe(false);
    expect(contracts.AuthResponseSchema.safeParse({ accessToken: '', refreshToken: '', user: {} }).success).toBe(false);
  });

  it('parses user list filters with safe pagination defaults and a trimmed keyword', () => {
    expect(contracts.UserListQuerySchema.parse({ keyword: '  cashier  ' })).toEqual({
      page: 1,
      limit: 20,
      keyword: 'cashier',
    });
    expect(contracts.UserListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(contracts.UserListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(contracts.UserListQuerySchema.safeParse({ keyword: ' ' }).success).toBe(false);
  });

  it('keeps account activity and linked employee ids in the RBAC user contract', () => {
    const record = contracts.UserAdminRecordSchema.parse({
      id: 4,
      employeeId: 12,
      username: 'cashier01',
      isSuperAdmin: false,
      isActive: true,
      permissions: {},
      employee: {
        id: 12,
        fullName: 'Trần Thị Lan',
        shortName: 'T.Lan',
        avatarUrl: null,
        position: null,
        specialty: null,
      },
      uiPreferences: { theme: 'light', sidebarWidth: 260, columnWidths: {} },
    });
    expect(record).toMatchObject({ isActive: true, employee: { id: 12, shortName: 'T.Lan' } });
    expect(contracts.UserListResponseSchema.parse({ page: 1, limit: 50, total: 1, items: [record] }).items).toEqual([record]);
  });

  it('validates master-data items, lookup filters, and upsert inputs', () => {
    expect(contracts.MdmItemSchema.safeParse({
      id: 1, category: 'INGREDIENT', name: 'Bún bò Huế', normalizedName: 'bun bo hue', metadata: {},
      isActive: true, createdAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(true);
    expect(contracts.MdmLookupQuerySchema.parse({ category: 'UNIT', limit: '25' })).toMatchObject({ category: 'UNIT', limit: 25 });
    expect(contracts.MdmLookupQuerySchema.parse({ category: 'UNIT', keyword: 'kg' }).keyword).toBe('kg');
    expect(contracts.MdmLookupQuerySchema.parse({ category: 'UNIT', activeOnly: 'false' }).activeOnly).toBe(false);
    expect(contracts.MdmListResponseSchema.parse({ page: 1, limit: 20, total: 0, items: [] })).toEqual({
      page: 1, limit: 20, total: 0, items: [],
    });
    expect(contracts.UpsertMdmSchema.safeParse({ category: 'UNIT', name: 'Kg' }).success).toBe(true);
    expect(contracts.UpdateMdmSchema.safeParse({ name: 'Thùng' }).success).toBe(true);
    expect(contracts.UpdateMdmSchema.safeParse({}).success).toBe(false);
    expect(contracts.UpsertMdmSchema.safeParse({ category: 'OTHER', name: '' }).success).toBe(false);
    expect(contracts.MdmItemSchema.safeParse({ id: 0, category: 'UNIT', name: '', normalizedName: '', isActive: true, createdAt: 'bad' }).success).toBe(false);
  });

  it('validates products, modifiers, and non-recursive combo components', () => {
    const modifier = { id: 1, name: 'Cấp độ 3', extraPrice: 0 };
    expect(contracts.ModifierSchema.safeParse(modifier).success).toBe(true);
    expect(contracts.ModifierSchema.safeParse({ ...modifier, extraPrice: 1.001 }).success).toBe(false);
    expect(contracts.ModifierGroupSchema.safeParse({ id: 1, name: 'Cấp độ cay', isRequired: true, maxSelect: 1, modifiers: [modifier] }).success).toBe(true);
    expect(contracts.ModifierGroupSchema.safeParse({ id: 1, name: 'Cấp độ cay', isRequired: true, maxSelect: 0, modifiers: [] }).success).toBe(false);
    expect(contracts.ComboItemSchema.safeParse({ productId: 2, quantity: 1 }).success).toBe(true);
    expect(contracts.ComboItemSchema.safeParse({ productId: 2, quantity: 1, comboItems: [] }).success).toBe(false);
    expect(contracts.CreateProductSchema.safeParse({ name: 'Mì cay', price: 45000, station: 'BEP_NAU' }).success).toBe(true);
    expect(contracts.CreateProductSchema.safeParse({ name: 'Combo', price: 90000, station: 'COMBO' }).success).toBe(false);
    expect(contracts.CreateProductSchema.safeParse({
      name: 'Combo', price: 90000, station: 'COMBO', comboItems: [{ productId: 2, quantity: 1 }],
    }).success).toBe(true);
    expect(contracts.UpdateProductSchema.safeParse({ name: 'Soup' }).success).toBe(true);
    expect(contracts.CreateProductSchema.safeParse({ name: 'Soup', price: 1.005, station: 'BEP_NAU' }).success).toBe(false);
    expect(contracts.CreateProductSchema.safeParse({ name: 'Soup', price: 10_000_000_000, station: 'BEP_NAU' }).success).toBe(false);
    expect(contracts.UpdateProductSchema.safeParse({ station: 'COMBO' }).success).toBe(false);
    expect(contracts.UpdateProductSchema.safeParse({ station: 'COMBO', comboItems: [{ productId: 2, quantity: 1 }] }).success).toBe(true);
    expect(contracts.CreateProductSchema.safeParse({
      name: 'Mì', price: 45000, station: 'BEP_NAU', comboItems: [{ productId: 2, quantity: 1 }],
    }).success).toBe(false);
    expect(contracts.ProductSchema.safeParse({
      id: 1, name: 'Mì cay', price: 45000, station: 'BEP_NAU', isAvailable: true, sortOrder: 0,
      modifierGroups: [], comboItems: [],
    }).success).toBe(true);
    expect(contracts.ProductSchema.safeParse({ id: 1, name: 'Mì', price: 1.001, station: 'BEP_NAU', isAvailable: true, sortOrder: 0, modifierGroups: [], comboItems: [] }).success).toBe(false);
    expect(contracts.DiningTableSchema.safeParse({ id: 1, name: 'Bàn 01', qrToken: 'a'.repeat(64), status: 'AVAILABLE', activeOrderId: null }).success).toBe(true);
    expect(contracts.DiningTableSchema.safeParse({ id: 1, name: 'Bàn 01', qrToken: 'short', status: 'AVAILABLE', activeOrderId: null }).success).toBe(false);
    expect(contracts.PublicMenuResponseSchema.safeParse({
      table: { tableId: 1, tableName: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null }, products: [],
    }).success).toBe(true);
    expect(contracts.PublicMenuResponseSchema.safeParse({ products: [{ name: 'Mì' }] }).success).toBe(false);
  });

  it('defines trusted menu and POS request contracts for the backend APIs', () => {
    const createProduct = contracts.CreateProductSchema.safeParse({
      name: 'Mì bò', price: 45000, station: 'BEP_NAU',
      modifierGroups: [{
        name: 'Cấp độ cay', isRequired: true, maxSelect: 1,
        modifiers: [{ name: 'Cấp độ 3', extraPrice: 0 }],
      }],
    });
    expect(createProduct.success).toBe(true);

    expect(contracts.CreateOrderItemInputSchema.safeParse({
      productId: 1, quantity: 1, modifiers: [{ groupId: 10, modifierId: 101 }],
    }).success).toBe(true);
    expect(contracts.CreateOrderItemInputSchema.safeParse({
      productId: 1, quantity: 1, modifiers: [{ groupId: 10, modifierId: 101, name: 'Fake', extraPrice: 100000 }],
    }).success).toBe(false);
    expect(contracts.CheckoutOrderRequestSchema.safeParse({ paymentMethod: 'CASH', printReceipt: false }).success).toBe(true);
    expect(contracts.InvoiceFilterQuerySchema.parse({ searchField: 'table', keyword: '07' })).toMatchObject({
      searchField: 'table', keyword: '07',
    });
    expect(contracts.PublicMenuResponseSchema.safeParse({
      table: { tableId: 7, tableName: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null },
      products: [], updatedAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(true);
  });

  it('validates QR approval, item mutation, and POS response contracts', () => {
    expect(contracts.ApproveQrOrderSchema.safeParse({ approved: true }).success).toBe(true);
    expect(contracts.ApproveQrOrderSchema.safeParse({ approved: false, reason: 'Không đủ thông tin' }).success).toBe(true);
    expect(contracts.ApproveQrOrderSchema.safeParse({ approved: false, reason: 'ngắn' }).success).toBe(false);
    expect(contracts.PatchOrderItemsSchema.safeParse({ removeItemIds: [1] }).success).toBe(true);
    expect(contracts.PatchOrderItemsSchema.safeParse({}).success).toBe(false);
    expect(contracts.PosOrderCreationResponseSchema.safeParse({
      orderId: 21, orderCode: 'HD-20261107-0001', orderType: 'TAKEAWAY', tableId: null,
      takeawayNumber: 1, tableLabel: 'Mang về #01', status: 'SERVING', totalAmount: 200,
    }).success).toBe(true);
    expect(contracts.QrOrderResponseSchema.safeParse({
      orderId: 21, activeOrderId: 21, orderCode: 'HD-20261107-0001', currentTableLabel: 'Bàn 01',
      status: 'PENDING', batchNo: 1, totalAmount: 200,
    }).success).toBe(true);
    expect(contracts.PosTableGridResponseSchema.safeParse({ tables: [], takeaways: [] }).success).toBe(true);
    expect(contracts.OrderDetailResponseSchema.safeParse({
      orderId: 21, orderCode: 'HD-20261107-0001', orderType: 'TAKEAWAY', orderSource: 'POS_COUNTER',
      tableId: null, tableLabel: 'Mang về #01', takeawayNumber: 1, status: 'SERVING', paymentMethod: null,
      cashAmount: 0, transferAmount: 0, totalAmount: 200, note: null, createdAt: '2026-11-07T08:00:00.000Z',
      paidAt: null, tableTransferLogs: [], items: [],
    }).success).toBe(true);
  });

  it('enforces dine-in versus takeaway targets and positive item quantities', () => {
    expect(contracts.CreateOrderItemInputSchema.safeParse(item).success).toBe(true);
    expect(contracts.OrderItemModifierSnapshotSchema.safeParse({ groupId: 1, modifierId: 2, name: 'Cấp 3', extraPrice: 1.001 }).success).toBe(false);
    expect(contracts.CreateOrderItemInputSchema.safeParse({ ...item, quantity: 0 }).success).toBe(false);
    expect(contracts.CreateQrOrderSchema.safeParse({ qrToken: 'a'.repeat(64), items: [item] }).success).toBe(true);
    expect(contracts.CreateQrOrderSchema.safeParse({ qrToken: '', items: [] }).success).toBe(false);
    expect(contracts.CreatePosOrderSchema.safeParse({ orderType: 'DINE_IN', tableId: 3, items: [item] }).success).toBe(true);
    expect(contracts.CreatePosOrderSchema.safeParse({ orderType: 'DINE_IN', tableId: null, items: [item] }).success).toBe(false);
    expect(contracts.CreatePosOrderSchema.safeParse({ orderType: 'TAKEAWAY', tableId: null, items: [item] }).success).toBe(true);
    expect(contracts.CreatePosOrderSchema.safeParse({ orderType: 'TAKEAWAY', tableId: 3, items: [item] }).success).toBe(false);
    expect(contracts.CreatePosDraftRequestSchema.safeParse({ orderType: null, tableId: null, items: [item], note: null }).success).toBe(true);
    expect(contracts.CreatePosDraftRequestSchema.safeParse({ orderType: null, tableId: 3, items: [item], note: null }).success).toBe(false);
    expect(contracts.CreatePosDraftRequestSchema.safeParse({ orderType: 'DINE_IN', tableId: null, items: [item], note: null }).success).toBe(true);
    expect(contracts.CreatePosDraftRequestSchema.safeParse({ orderType: 'TAKEAWAY', tableId: 3, items: [item], note: null }).success).toBe(false);
    expect(contracts.CreatePosDraftRequestSchema.safeParse({ orderType: 'TAKEAWAY', tableId: null, items: [{ ...item, unitPrice: 100 }], note: null }).success).toBe(false);
    expect(contracts.UpdateOrderItemSchema.safeParse({ orderItemId: 1, quantity: 1 }).success).toBe(true);
    expect(contracts.UpdateOrderItemSchema.safeParse({ orderItemId: 1 }).success).toBe(false);
    expect(contracts.SplitKitchenResponseSchema.safeParse({ tickets: [] }).success).toBe(true);
    expect(contracts.SplitKitchenResponseSchema.safeParse({ batchNo: null, tickets: [], message: 'Không có món mới cần tách' }).success).toBe(true);
    expect(contracts.SplitKitchenResponseSchema.safeParse({
      batchNo: 2,
      tickets: [{
        station: 'BEP_NAU', stationTitle: 'BẾP NẤU (MÌ CAY)', logoType: 'CHEF_HAT_NOODLE', batchNo: 2,
        batchLabel: '[GỌI THÊM - LƯỢT 2]', transferNotice: '[GHI CHÚ ĐỔI BÀN: Chuyển từ Bàn 01 sang Bàn 07]',
        items: [{ name: 'Mì bò', qty: 1, modifiers: [], note: '' }],
      }],
    }).success).toBe(true);
    expect(contracts.SplitKitchenResponseSchema.safeParse({ tickets: [{ station: 'COMBO', stationTitle: 'Combo', logoType: 'DRINK_CUP', items: [{ name: 'Mì', qty: 1, modifiers: [], note: '' }] }] }).success).toBe(false);
    expect(contracts.TableActionRequestSchema.safeParse({ action: 'MOVE', targetTableId: 2, reason: 'Customer request' }).success).toBe(true);
    expect(contracts.TableActionRequestSchema.safeParse({ action: 'MOVE', targetTableId: 0, reason: ' ' }).success).toBe(false);
    expect(contracts.TableActionResponseSchema.safeParse({ action: 'MOVE', sourceTableId: 1, targetTableId: 2, requireKitchenNoticePrint: false }).success).toBe(true);
    expect(contracts.TableActionResponseSchema.safeParse({
      action: 'MOVE', sourceTableId: 1, targetTableId: 2, requireKitchenNoticePrint: true,
      kitchenTransferSlip: { orderCode: 'HD-20261107-0001', fromLabel: 'Bàn 01', toLabel: 'Bàn 07', affectedStations: ['BEP_NAU'] },
    }).success).toBe(true);
    expect(contracts.TableActionResponseSchema.safeParse({ action: 'OTHER', sourceTableId: 1, targetTableId: 2, requireKitchenNoticePrint: false }).success).toBe(false);
    expect(contracts.ProvisionalBillResponseSchema.safeParse({
      orderId: 1, orderCode: 'HD-20261107-0001', orderType: 'DINE_IN', tableId: 1, takeawayNumber: null,
      items: [], totalAmount: 0, status: 'SERVING',
    }).success).toBe(true);
    expect(contracts.ProvisionalBillResponseSchema.safeParse({
      orderId: 1, orderCode: 'HD-1', orderType: 'DINE_IN', tableId: null, takeawayNumber: 1,
      items: [], totalAmount: 0, status: 'SERVING',
    }).success).toBe(false);
    expect(contracts.ProvisionalBillResponseSchema.safeParse({
      orderId: 1, orderCode: 'HD-20261107-0002', orderType: 'TAKEAWAY', tableId: null, takeawayNumber: 2,
      items: [], totalAmount: 0, status: 'SERVING',
    }).success).toBe(true);
    expect(contracts.InvoiceFilterQuerySchema.safeParse({ page: '1', limit: '20' }).success).toBe(true);
    expect(contracts.InvoiceFilterQuerySchema.safeParse({ page: '1', limit: '20', orderType: 'TAKEAWAY' }).success).toBe(true);
    expect(contracts.InvoiceFilterQuerySchema.safeParse({ page: '1', limit: '20', orderType: 'DINE_IN' }).success).toBe(true);
    expect(contracts.InvoiceFilterQuerySchema.safeParse({ fromDate: '2026-11-08', toDate: '2026-11-07' }).success).toBe(false);
    expect(contracts.VoidInvoiceRequestSchema.safeParse({ voidReason: 'Lý do hợp lệ để huỷ' }).success).toBe(true);
    expect(contracts.VoidInvoiceRequestSchema.safeParse({ voidReason: 'ngắn' }).success).toBe(false);
    expect(contracts.CheckoutOrderRequestSchema.parse({
      paymentMethod: 'CASH', totalAmount: 100000, cashAmount: 100000,
    })).toMatchObject({ transferAmount: 0, printReceipt: true });
    expect(contracts.CheckoutOrderRequestSchema.safeParse({
      paymentMethod: 'TRANSFER', totalAmount: 100000, transferAmount: 100000,
    }).success).toBe(true);
    expect(contracts.CheckoutOrderRequestSchema.safeParse({
      paymentMethod: 'SPLIT', totalAmount: 100000, cashAmount: 50000, transferAmount: 50000,
    }).success).toBe(true);
    expect(contracts.CheckoutOrderRequestSchema.safeParse({
      paymentMethod: 'SPLIT', totalAmount: 100000, cashAmount: 50000, transferAmount: 40000,
    }).success).toBe(false);
    expect(contracts.CheckoutOrderRequestSchema.safeParse({
      paymentMethod: 'SPLIT', totalAmount: 100000, cashAmount: 0, transferAmount: 100000,
    }).success).toBe(false);
  });

  it('validates inventory batches and filters without using integers for money', () => {
    const importItem = { ingredientMdmId: 1, itemNameSnapshot: 'Bò', unitName: 'Kg', unitPrice: 125000.5, quantity: 1.25 };
    expect(contracts.InventoryImportItemInputSchema.safeParse(importItem).success).toBe(true);
    expect(contracts.InventoryImportItemInputSchema.safeParse({ ...importItem, unitPrice: -1 }).success).toBe(false);
    expect(contracts.CreateInventoryImportBatchSchema.safeParse({ items: [importItem], supplierName: 'Công ty Rau Sạch', paymentSource: 'CASH_DRAWER', importDate: '2026-11-07' }).success).toBe(true);
    expect(contracts.CreateInventoryImportBatchSchema.safeParse({ items: [importItem], paymentSource: 'CASH_DRAWER', importDate: '2026-11-07' }).success).toBe(false);
    expect(contracts.CreateInventoryImportBatchSchema.safeParse({ items: [], paymentSource: 'EXTERNAL', importDate: 'bad' }).success).toBe(false);
    expect(contracts.InventoryImportFilterQuerySchema.safeParse({ page: '1', limit: '20' }).success).toBe(true);
    expect(contracts.InventoryImportFilterQuerySchema.safeParse({ fromDate: '2026-11-08', toDate: '2026-11-07' }).success).toBe(false);
  });

  it('accepts SUPPLIER as a managed master-data category', () => {
    expect(contracts.MdmCategorySchema.safeParse('SUPPLIER').success).toBe(true);
  });

  it('validates denomination counts and requires a note when the drawer is discrepant', () => {
    expect(contracts.DenominationsDetailSchema.safeParse(denominations).success).toBe(true);
    expect(contracts.DenominationsDetailSchema.safeParse({ ...denominations, '500000': -1 }).success).toBe(false);
    expect(contracts.DenominationsDetailSchema.safeParse({ ...denominations, '75000': 1 }).success).toBe(false);
    const settlement = {
      settlementDate: '2026-11-07', shiftName: 'Ca Sáng',
      actualCountedCash: 500000, denominationsDetail: denominations,
    };
    const shortDenominations = {
      ...denominations, '500000': 0, '200000': 2, '50000': 1,
      '20000': 2, '5000': 1, '2000': 2,
    };
    expect(contracts.CreateSettlementRequestSchema.safeParse(settlement).success).toBe(true);
    expect(contracts.CreateSettlementRequestSchema.safeParse({ ...settlement, actualCountedCash: 499000 }).success).toBe(false);
    expect(contracts.CreateSettlementRequestSchema.safeParse({
      ...settlement, actualCountedCash: 499000, denominationsDetail: shortDenominations,
    }).success).toBe(true);
    expect(contracts.CreateSettlementRequestSchema.safeParse({
      ...settlement, actualCountedCash: 499000, denominationsDetail: shortDenominations, note: 'Thiếu tiền cuối ca',
    }).success).toBe(true);
    expect(contracts.CreateSettlementRequestSchema.safeParse({ ...settlement, expectedCashInDrawer: 500000 }).success).toBe(false);
    expect(contracts.UpdateDefaultBudgetSchema.safeParse({ openingBudget: 1500000.25 }).success).toBe(true);
    expect(contracts.UpdateDefaultBudgetSchema.safeParse({ openingBudget: -1 }).success).toBe(false);
    expect(contracts.SettlementResponseSchema.safeParse({
      id: 1, ...settlement, openingBudget: 200000, totalCashSales: 400000, totalTransferSales: 100000,
      expectedCashInDrawer: 500000,
      totalCashImports: 100000, discrepancyAmount: 0, status: 'MATCHED', note: null, closedBy: 2,
      cashRetainedInDrawer: 200000, cashToHandOver: 300000,
      createdAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(true);
    expect(contracts.SettlementResponseSchema.safeParse({
      id: 1, ...settlement, openingBudget: 200000, totalCashSales: 500000, totalTransferSales: 100000,
      expectedCashInDrawer: 600000,
      totalCashImports: 100000, discrepancyAmount: 0, status: 'MATCHED', note: null, closedBy: 2,
      cashRetainedInDrawer: 200000, cashToHandOver: 300000,
      createdAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(false);
    expect(contracts.SettlementResponseSchema.safeParse({
      id: 2, ...settlement, actualCountedCash: 501000, denominationsDetail: { ...denominations, '1000': 1 },
      expectedCashInDrawer: 500000,
      openingBudget: 200000, totalCashSales: 400000, totalTransferSales: 100000, totalCashImports: 100000,
      discrepancyAmount: 1000, status: 'SURPLUS', note: 'Thừa tiền cuối ca', closedBy: 2,
      cashRetainedInDrawer: 200000, cashToHandOver: 301000,
      createdAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(true);
    expect(contracts.SettlementResponseSchema.safeParse({
      id: 3, ...settlement, actualCountedCash: 499000, denominationsDetail: shortDenominations,
      expectedCashInDrawer: 500000,
      openingBudget: 200000, totalCashSales: 400000, totalTransferSales: 100000, totalCashImports: 100000,
      discrepancyAmount: -1000, status: 'SHORTAGE', note: 'Thiếu tiền cuối ca', closedBy: 2,
      cashRetainedInDrawer: 200000, cashToHandOver: 299000,
      createdAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(true);
    expect(contracts.SettlementResponseSchema.safeParse({
      id: 1, ...settlement, openingBudget: 200000, totalCashSales: 400000, totalTransferSales: 100000,
      expectedCashInDrawer: 500000,
      totalCashImports: 100000, discrepancyAmount: 0, status: 'SURPLUS', note: null, closedBy: 2,
      cashRetainedInDrawer: 200000, cashToHandOver: 300000,
      createdAt: '2026-11-07T08:00:00.000Z',
    }).success).toBe(false);
  });

  it('rejects settlement history filters whose start date is after the end date', () => {
    expect(contracts.CashflowSettlementFilterQuerySchema.safeParse({
      fromDate: '2026-11-09',
      toDate: '2026-11-08',
    }).success).toBe(false);
  });

  it('validates employee and weekly schedule contracts', () => {
    expect(contracts.CreateEmployeeSchema.safeParse({ fullName: 'Nguyễn Văn Anh', positionId: 1, specialtyId: 2 }).success).toBe(true);
    expect(contracts.CreateEmployeeSchema.safeParse({
      fullName: 'Nguyễn Văn Anh', positionId: 1, specialtyId: 2,
      account: { username: 'nhanvien', password: 'secret1' },
    }).success).toBe(true);
    expect(contracts.CreateEmployeeSchema.safeParse({ fullName: ' ', positionId: 1 }).success).toBe(false);
    expect(contracts.UpdateEmployeeSchema.safeParse({ phone: '0900000000' }).success).toBe(true);
    expect(contracts.UpdateEmployeeSchema.safeParse({}).success).toBe(false);
    expect(contracts.EmployeeFilterQuerySchema.safeParse({ page: '1', limit: '20', positionId: '2' }).success).toBe(true);
    expect(contracts.EmployeeFilterQuerySchema.parse({ inactiveOnly: 'true' })).toMatchObject({ inactiveOnly: true });
    expect(contracts.EmployeeFilterQuerySchema.safeParse({ page: '0', limit: '20' }).success).toBe(false);
    const cells = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, timeSlot: 'Ca sáng', employeeIds: [1] }));
    expect(contracts.ScheduleCellSchema.safeParse(cells[0]).success).toBe(true);
    expect(contracts.ScheduleCellSchema.safeParse({ dayOfWeek: 7, timeSlot: 'Ca sáng', employeeIds: [1, 1] }).success).toBe(false);
    expect(contracts.BulkSaveScheduleRequestSchema.safeParse({ weekStartDate: '2026-11-02', cells }).success).toBe(true);
    expect(contracts.ScheduleWeekQuerySchema.safeParse({ weekStartDate: '2026-11-02' }).success).toBe(true);
    expect(contracts.ScheduleWeekQuerySchema.safeParse({ weekStartDate: '2026-11-03' }).success).toBe(false);
    expect(contracts.BulkSaveScheduleRequestSchema.safeParse({ weekStartDate: '2026-11-03', cells }).success).toBe(false);
    expect(contracts.BulkSaveScheduleRequestSchema.safeParse({ weekStartDate: '2026-11-02', cells: cells.slice(0, 6) }).success).toBe(false);
    expect(contracts.CopyPreviousWeekRequestSchema.safeParse({ sourceWeekStartDate: '2026-10-26', targetWeekStartDate: '2026-11-02' }).success).toBe(true);
    expect(contracts.CopyPreviousWeekRequestSchema.safeParse({ sourceWeekStartDate: '2026-11-02', targetWeekStartDate: '2026-11-02' }).success).toBe(false);
    expect(contracts.CopyPreviousWeekRequestSchema.safeParse({ sourceWeekStartDate: '2026-10-19', targetWeekStartDate: '2026-11-02' }).success).toBe(false);
  });

  it('validates UI preferences and profile update fields', () => {
    expect(contracts.UiPreferencesSchema.safeParse({ theme: 'dark', sidebarWidth: 280, columnWidths: { orders: 320 } }).success).toBe(true);
    expect(contracts.UiPreferencesSchema.safeParse({ theme: 'dark', sidebarWidth: 20, columnWidths: {} }).success).toBe(false);
    expect(contracts.UpdateProfileSchema.safeParse({ fullName: 'Nguyễn Văn Anh', phone: '0900000000' }).success).toBe(true);
    expect(contracts.UpdateUiPreferencesSchema.safeParse({ theme: 'light' }).success).toBe(true);
    expect(contracts.UpdateUiPreferencesSchema.safeParse({}).success).toBe(false);
    expect(contracts.UpdateProfileSchema.safeParse({}).success).toBe(false);
    expect(contracts.ChangePasswordSchema.safeParse({
      currentPassword: 'current-pass',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    }).success).toBe(true);
    expect(contracts.ChangePasswordSchema.safeParse({
      currentPassword: 'current-pass',
      newPassword: 'new-pass-123',
      confirmPassword: 'different-pass',
    }).success).toBe(false);
    expect(contracts.ProfileResponseSchema.safeParse({
      id: 1, username: 'cashier01', isSuperAdmin: false,
      permissions: contracts.UserPermissionsSchema.parse({}),
      uiPreferences: { theme: 'dark', sidebarWidth: 280, columnWidths: {} },
      employee: {
        id: 2, fullName: 'Cashier One', shortName: 'C.One', phone: null, address: null,
        bankName: null, bankAccountNo: null, bankAccountName: null, avatarUrl: null,
        position: null, specialty: null,
      },
    }).success).toBe(true);
  });

  it('validates VietQR bank constants and payment account rotation schemas', () => {
    expect(contracts.VIETQR_BANKS.length).toBeGreaterThanOrEqual(20);
    expect(contracts.findVietQrBank('vpb')?.shortName).toBe('VPBank');
    expect(contracts.getVietQrBankShortName('VCB')).toBe('Vietcombank');

    expect(contracts.CreatePaymentAccountRequestSchema.parse({
      label: 'TK Chính',
      bankCode: 'VPB',
      accountNo: '186877721',
      accountName: 'THAN THI LOAN',
      dailyLimit: 50000000,
    })).toEqual({
      label: 'TK Chính',
      bankCode: 'VPB',
      accountNo: '186877721',
      accountName: 'THAN THI LOAN',
      isActive: true,
      dailyLimit: 50000000,
      monthlyLimit: null,
      yearlyLimit: null,
    });

    expect(contracts.CreatePaymentAccountRequestSchema.safeParse({
      label: 'TK 2',
      bankCode: 'VPB',
      accountNo: '186877721',
      accountName: 'THAN THI LOAN',
      dailyLimit: 0,
    }).success).toBe(false);

    expect(contracts.CreatePaymentAccountRequestSchema.safeParse({
      label: 'TK Sai Hạn Mức',
      bankCode: 'VPB',
      accountNo: '186877721',
      accountName: 'THAN THI LOAN',
      dailyLimit: 500000,
      monthlyLimit: 100000,
    }).success).toBe(false);

    expect(contracts.CreatePaymentAccountRequestSchema.safeParse({
      label: 'TK Đúng Hạn Mức',
      bankCode: 'VPB',
      accountNo: '186877721',
      accountName: 'THAN THI LOAN',
      dailyLimit: 500000,
      monthlyLimit: 5000000,
      yearlyLimit: 50000000,
    }).success).toBe(true);

    expect(contracts.ReorderPaymentAccountsRequestSchema.safeParse({
      orderedIds: [1, 2, 3],
    }).success).toBe(true);
    expect(contracts.ReorderPaymentAccountsRequestSchema.safeParse({
      orderedIds: [1, 1],
    }).success).toBe(false);

    expect(contracts.SplitProvisionalBillRequestSchema.safeParse({
      items: [{ orderItemId: 1, quantity: 2 }],
    }).success).toBe(true);
    expect(contracts.SplitProvisionalBillRequestSchema.safeParse({
      items: [],
    }).success).toBe(false);
  });

  it('validates user session history query and response contracts', () => {
    expect(contracts.UserSessionHistoryQuerySchema.parse({})).toEqual({ limit: 5 });
    expect(contracts.UserSessionHistoryQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(contracts.UserSessionHistoryQuerySchema.safeParse({ limit: 25 }).success).toBe(false);
    expect(contracts.UserSessionHistoryResponseSchema.safeParse({
      user: {
        id: 4,
        username: 'thungan',
        fullName: 'Trần Thị Lan',
        isSuperAdmin: false,
        isActive: true,
      },
      currentSession: {
        isActiveSession: true,
        isSocketOnline: true,
        ipAddress: '192.168.1.25',
        deviceLabel: 'Windows · Chrome',
        startedAt: '2026-11-17T12:00:00.000Z',
      },
      items: [
        {
          id: 91,
          eventType: 'SESSION_REPLACED',
          actionLabel: 'Đăng nhập mới (đá phiên cũ)',
          summary: 'đăng nhập từ Windows · Chrome',
          actorUsername: 'thungan',
          actorFullName: 'Trần Thị Lan',
          ipAddress: '192.168.1.25',
          deviceLabel: 'Windows · Chrome',
          previousIp: '192.168.1.12',
          previousDevice: 'iPhone · Safari',
          createdAt: '2026-11-17T12:00:00.000Z',
        },
        {
          id: 90,
          eventType: 'LOGIN_FAILED',
          actionLabel: 'Đăng nhập thất bại',
          summary: 'thử đăng nhập thất bại (Sai mật khẩu)',
          actorUsername: 'thungan',
          actorFullName: 'Trần Thị Lan',
          ipAddress: '192.168.1.88',
          deviceLabel: 'Android · Chrome',
          previousIp: null,
          previousDevice: null,
          createdAt: '2026-11-17T11:55:00.000Z',
        },
      ],
    }).success).toBe(true);

    expect(contracts.PermissionsUpdatedSocketPayloadSchema.safeParse({
      userId: 4,
      permissions: contracts.defaultUserPermissions,
      updatedAt: '2026-11-17T12:00:00.000Z',
    }).success).toBe(true);
  });

  it('validates the account preferences socket payload and the matching event name', () => {
    const prefs = contracts.UiPreferencesSchema.parse({ sidebarCollapsed: true, navGroupOrder: ['finance', 'sales'] });
    expect(contracts.AccountPreferencesUpdatedSocketPayloadSchema.safeParse({
      userId: 4,
      uiPreferences: prefs,
      updatedAt: '2026-11-23T12:00:00.000Z',
    }).success).toBe(true);
    expect(contracts.AccountPreferencesUpdatedSocketPayloadSchema.safeParse({
      userId: 4,
      uiPreferences: { sidebarCollapsed: 'yes' },
      updatedAt: '2026-11-23T12:00:00.000Z',
    }).success).toBe(false);
    expect(contracts.SocketEvents.ACCOUNT_PREFERENCES_UPDATED).toBe('account:preferences_updated');
  });

  it('validates takeaway QR menu, order, and security config contracts', () => {
    expect(contracts.PublicMenuResponseSchema.safeParse({
      orderMode: 'TAKEAWAY',
      table: { tableId: null, tableName: 'Mang về', status: 'AVAILABLE', activeOrderId: null },
      products: [],
    }).success).toBe(true);
    expect(contracts.CreateQrOrderSchema.safeParse({
      qrToken: 't'.repeat(64),
      customerName: 'Anh Nam',
      customerPhone: '0909123456',
      note: 'Ít hành',
      items: [{ productId: 1, quantity: 1 }],
    }).success).toBe(true);
    expect(contracts.QrOrderResponseSchema.safeParse({
      orderId: 50,
      activeOrderId: 50,
      orderCode: 'HD-20261122-0001',
      orderType: 'TAKEAWAY',
      takeawayNumber: 1,
      guestSessionToken: 's'.repeat(32),
      currentTableLabel: 'Mang về #01',
      status: 'PENDING',
      batchNo: 1,
      totalAmount: 45000,
    }).success).toBe(true);
    expect(contracts.RotateTakeawayQrResponseSchema.safeParse({ qrToken: 'k'.repeat(64) }).success).toBe(true);
    expect(contracts.QrSecurityConfigSchema.parse({}).applySecurityToTakeaway).toBe(false);
    expect(contracts.QrSecurityConfigSchema.parse({ applySecurityToTakeaway: true }).applySecurityToTakeaway).toBe(true);
    expect(contracts.SocketRooms.tableSession(7)).toBe('table_session_7');
    expect(contracts.SocketEvents.QR_ORDER_NOTICE).toBe('qr:order_notice');
    expect(contracts.SocketEvents.TABLE_QR_ROTATED).toBe('table:qr_rotated');
    expect(contracts.QrOrderNoticePayloadSchema.safeParse({
      orderId: 50,
      tableId: 3,
      kind: 'ITEMS_UPDATED',
      totalAmount: 40000,
      cancelledItems: [{ name: 'Mì Xúc Xích', quantity: 1 }],
      timestamp: '2026-11-22T12:00:00.000Z',
    }).success).toBe(true);
    // Rejects sensitive/unexpected internal fields on guest socket payload (.strict())
    expect(contracts.QrOrderNoticePayloadSchema.safeParse({
      orderId: 50,
      kind: 'PROVISIONAL_BILL_PRINTED',
      totalAmount: 40000,
      cashierId: 3,
      timestamp: '2026-11-22T12:00:00.000Z',
    }).success).toBe(false);
    expect(contracts.QrTableRotatedPayloadSchema.safeParse({
      tableId: 3,
      rotatedAt: '2026-11-22T12:00:00.000Z',
    }).success).toBe(true);
  });

  it('validates physical thermal printer device config and LAN ESC/POS print contracts with SSRF protection', () => {
    expect(contracts.ThermalPrinterDeviceConfigSchema.parse({})).toEqual(
      contracts.DEFAULT_THERMAL_PRINTER_DEVICE_CONFIG,
    );
    expect(
      contracts.ThermalPrinterDeviceConfigSchema.safeParse({
        driver: 'RAWBT_USB',
        paperWidthDots: 576,
        cashDrawerKick: true,
        rawbtWsUrl: 'ws://127.0.0.1:40213/',
        rawbtFallbackToIntent: true,
        lanHost: '192.168.1.200',
        lanPort: 9100,
        lanTimeoutMs: 4000,
      }).success,
    ).toBe(true);
    expect(
      contracts.ThermalPrinterDeviceConfigSchema.safeParse({
        driver: 'UNKNOWN_DRIVER',
      }).success,
    ).toBe(false);

    // Private RFC1918 and loopback IPs allowed
    expect(contracts.isAllowedLanPrinterHost('192.168.1.200')).toBe(true);
    expect(contracts.isAllowedLanPrinterHost('10.0.0.55')).toBe(true);
    expect(contracts.isAllowedLanPrinterHost('172.16.0.10')).toBe(true);
    expect(contracts.isAllowedLanPrinterHost('172.31.255.250')).toBe(true);
    expect(contracts.isAllowedLanPrinterHost('127.0.0.1')).toBe(true);

    // Public IPs, cloud metadata IPs, out-of-range octets, and domains rejected (SSRF protection)
    expect(contracts.isAllowedLanPrinterHost('8.8.8.8')).toBe(false);
    expect(contracts.isAllowedLanPrinterHost('169.254.169.254')).toBe(false);
    expect(contracts.isAllowedLanPrinterHost('172.15.0.1')).toBe(false);
    expect(contracts.isAllowedLanPrinterHost('172.32.0.1')).toBe(false);
    expect(contracts.isAllowedLanPrinterHost('192.168.1.999')).toBe(false);
    expect(contracts.isAllowedLanPrinterHost('printer.example.com')).toBe(false);

    expect(
      contracts.LanEscPosPrintRequestSchema.safeParse({
        host: '192.168.1.200',
        port: 9100,
        payloadBase64: 'G0A=',
      }).success,
    ).toBe(true);
    expect(
      contracts.LanEscPosPrintRequestSchema.safeParse({
        host: '169.254.169.254',
        port: 9100,
        payloadBase64: 'G0A=',
      }).success,
    ).toBe(false);
    expect(
      contracts.LanEscPosPrintResponseSchema.safeParse({
        success: true,
        host: '192.168.1.200',
        port: 9100,
        bytesSent: 128,
        durationMs: 15,
      }).success,
    ).toBe(true);
  });

  it('validates TO_TAKEAWAY table action, isTakeaway item flag, and drink size formatting helpers', () => {
    expect(contracts.TableActionTypeSchema.safeParse('TO_TAKEAWAY').success).toBe(true);
    expect(
      contracts.TableActionRequestSchema.safeParse({
        action: 'TO_TAKEAWAY',
        targetTableId: null,
        reason: 'Khách xin gói mang về',
      }).success,
    ).toBe(true);
    expect(
      contracts.TableActionRequestSchema.safeParse({
        action: 'TO_TAKEAWAY',
        targetTableId: 5,
        reason: 'Khách xin gói mang về',
      }).success,
    ).toBe(false);
    expect(
      contracts.TableActionResponseSchema.safeParse({
        action: 'TO_TAKEAWAY',
        sourceTableId: 1,
        targetTableId: null,
        takeawayNumber: 5,
        requireKitchenNoticePrint: true,
        kitchenTransferSlip: {
          orderCode: 'HD-20261124-0001',
          fromLabel: 'Bàn 01',
          toLabel: 'Mang về #05',
          affectedStations: ['BEP_NAU'],
        },
      }).success,
    ).toBe(true);
    expect(
      contracts.CreateOrderItemInputSchema.safeParse({
        productId: 1,
        quantity: 2,
        isTakeaway: true,
      }).success,
    ).toBe(true);
    expect(
      contracts.UpdateOrderItemSchema.safeParse({
        orderItemId: 1,
        isTakeaway: false,
      }).success,
    ).toBe(true);
    expect(contracts.isDrinkSizeCategoryName('Trà Sữa')).toBe(true);
    expect(contracts.isDrinkSizeCategoryName('Nước Ngọt - Bia - Rượu')).toBe(false);
    expect(contracts.isDrinkSizeCategoryName('Đồ Uống Nóng')).toBe(false);
    expect(contracts.isDrinkSizeCategoryName('Đồ Ăn Vặt (Quầy Nước)')).toBe(false);
    expect(contracts.isDrinkSizeCategoryName(undefined)).toBe(false);
    expect(contracts.isDrinkSizeCategoryName('')).toBe(false);

    expect(
      contracts.formatProductNameWithSize('Trà Đào', ['Size L', 'Ít đá'], ['Size L']),
    ).toEqual({
      displayName: 'Trà Đào (L)',
      sizeCode: 'L',
      remainingModifiers: ['Ít đá'],
      remainingPricedModifiers: [],
    });
    expect(
      contracts.formatProductNameWithSize('Trà Đào', ['M', 'Giảm ngọt'], []),
    ).toEqual({
      displayName: 'Trà Đào (M)',
      sizeCode: 'M',
      remainingModifiers: ['Giảm ngọt'],
      remainingPricedModifiers: [],
    });
    expect(contracts.formatProductNameWithSize('Trà Đào', ['L'])).toEqual({
      displayName: 'Trà Đào (L)',
      sizeCode: 'L',
      remainingModifiers: [],
      remainingPricedModifiers: [],
    });
  });
});
