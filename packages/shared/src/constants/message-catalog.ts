import { ErrorCodes, type ErrorCode } from './error-codes';
import { HTTP_ERROR_CATALOG } from './http-error-catalog';

export const STORE_MESSAGES_NORMALIZED_NAME = 'store_messages';

export const MessageModuleValues = [
  'QR_CUSTOMER',
  'POS',
  'MENU',
  'PAYMENT_QR',
  'INVOICES',
  'INVENTORY',
  'CASHFLOW',
  'EMPLOYEES',
  'SCHEDULES',
  'PAYROLL',
  'MASTER_DATA',
  'RBAC',
  'PROFILE',
  'SETTINGS',
  'SYSTEM_ERROR',
] as const;

export type MessageModule = (typeof MessageModuleValues)[number];

export const MESSAGE_MODULE_LABELS: Record<MessageModule, string> = {
  QR_CUSTOMER: 'Trang khách QR (Mobile)',
  POS: 'Bán hàng & Bàn (POS)',
  MENU: 'Quản trị Thực đơn',
  PAYMENT_QR: 'Mã QR Thanh toán',
  INVOICES: 'Quản lý Hoá đơn',
  INVENTORY: 'Nhập hàng Kho',
  CASHFLOW: 'Ngân sách & Kết ca',
  EMPLOYEES: 'Hồ sơ Nhân sự',
  SCHEDULES: 'Bảng tính Ngày công',
  PAYROLL: 'Bảng tính Lương',
  MASTER_DATA: 'Quản trị Master Data',
  RBAC: 'Phân quyền Hệ thống',
  PROFILE: 'Đăng nhập & Hồ sơ cá nhân',
  SETTINGS: 'Cài đặt Cửa hàng',
  SYSTEM_ERROR: 'Thông báo Lỗi Hệ thống (API)',
};

export const MessageKindValues = [
  'banner',
  'status',
  'blocker',
  'toast',
  'confirm',
  'error',
] as const;

export type MessageKind = (typeof MessageKindValues)[number];

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  banner: 'Banner cảnh báo',
  status: 'Trạng thái đơn',
  blocker: 'Màn hình chặn QR',
  toast: 'Thông báo Pop-up (Toast)',
  confirm: 'Hộp thoại Xác nhận',
  error: 'Lỗi API hệ thống',
};

export interface MessageCatalogItem {
  readonly key: string;
  readonly module: MessageModule;
  readonly kind: MessageKind;
  readonly label: string;
  readonly defaultTitle: string;
  readonly defaultDescription?: string;
  readonly variables: readonly string[];
  readonly maxTitleLength: number;
  readonly maxDescriptionLength?: number;
}

export interface StoreMessageOverride {
  title?: string;
  description?: string;
}

export type StoreMessagesMap = Record<string, StoreMessageOverride>;

interface MessageDefInput {
  key: string;
  module: MessageModule;
  kind: MessageKind;
  label: string;
  defaultTitle: string;
  defaultDescription?: string;
  variables?: readonly string[];
  maxTitleLength?: number;
  maxDescriptionLength?: number;
}

function defineMessage(input: MessageDefInput): MessageCatalogItem {
  return {
    key: input.key,
    module: input.module,
    kind: input.kind,
    label: input.label,
    defaultTitle: input.defaultTitle,
    ...(input.defaultDescription !== undefined ? { defaultDescription: input.defaultDescription } : {}),
    variables: input.variables ?? [],
    maxTitleLength: input.maxTitleLength ?? 200,
    ...(input.defaultDescription !== undefined
      ? { maxDescriptionLength: input.maxDescriptionLength ?? 500 }
      : {}),
  };
}

export const MESSAGE_CATALOG: readonly MessageCatalogItem[] = [
  // =========================================================================
  // 1. QR_CUSTOMER — Trang khách QR (Mobile)
  // =========================================================================
  defineMessage({
    key: 'qr.banner.tableMoveNotice',
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Cảnh báo chuyển bàn nổi bật (Banner vàng)',
    defaultTitle: 'Quý khách chuyển bàn vui lòng thông báo với lễ tân',
  }),
  defineMessage({
    key: 'qr.loading.menu',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Đang tải thực đơn QR',
    defaultTitle: 'Đang tải thực đơn bàn...',
  }),
  defineMessage({
    key: 'qr.lock.wifiTitle',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Chặn ngoài Wi-Fi quán (Tiêu đề màn hình khoá)',
    defaultTitle: 'Vui lòng kết nối Wi-Fi của quán',
    defaultDescription: 'Truy cập bị giới hạn bởi cấu hình bảo mật quán.',
  }),
  defineMessage({
    key: 'qr.lock.geoOutOfRangeTitle',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Chặn ngoài phạm vi GPS (Tiêu đề màn hình khoá)',
    defaultTitle: 'Ngoài phạm vi đặt món tại bàn',
    defaultDescription: 'Chỉ khách đang có mặt tại quán mới có thể quét mã gọi món.',
  }),
  defineMessage({
    key: 'qr.lock.geoRequiredTitle',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Yêu cầu xác nhận GPS (Tiêu đề màn hình khoá)',
    defaultTitle: 'Xác nhận vị trí tại quán',
    defaultDescription: 'Vui lòng xác nhận vị trí GPS tại quán để mở thực đơn và đặt món.',
  }),
  defineMessage({
    key: 'qr.lock.gpsUnsupportedError',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Thiết bị không hỗ trợ GPS',
    defaultTitle: 'Trình duyệt trên thiết bị của bạn không hỗ trợ định vị GPS.',
  }),
  defineMessage({
    key: 'qr.lock.gpsDeniedError',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Khách từ chối quyền vị trí trên trình duyệt',
    defaultTitle: 'Bạn đã từ chối quyền truy cập vị trí. Vui lòng cho phép trình duyệt truy cập vị trí hoặc kết nối Wi-Fi của quán.',
  }),
  defineMessage({
    key: 'qr.lock.gpsUnavailableError',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Không xác định được vị trí GPS',
    defaultTitle: 'Không thể xác định vị trí hiện tại. Vui lòng bật Định vị (GPS) trên điện thoại và thử lại.',
  }),
  defineMessage({
    key: 'qr.lock.invalidQr',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Mã QR không hợp lệ hoặc hết hạn',
    defaultTitle: 'Mã QR không hợp lệ hoặc đã hết hạn',
    defaultDescription: 'Vui lòng liên hệ nhân viên phục vụ để được hỗ trợ.',
  }),
  defineMessage({
    key: 'qr.lock.wifiPasswordCopiedToast',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Sao chép mật khẩu Wi-Fi thành công',
    defaultTitle: 'Đã sao chép mật khẩu Wi-Fi',
  }),
  defineMessage({
    key: 'qr.status.orderPending',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Trạng thái sau khi gửi đơn mới (PENDING)',
    defaultTitle: 'Đã gửi đơn, vui lòng chờ thu ngân xác nhận',
  }),
  defineMessage({
    key: 'qr.status.orderServing',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Trạng thái đang phục vụ / bếp chế biến (SERVING)',
    defaultTitle: 'Bếp đang chế biến món ăn của quý khách',
  }),
  defineMessage({
    key: 'qr.status.orderServingShort',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Trạng thái bếp chế biến (cập nhật Realtime)',
    defaultTitle: 'Bếp đang chế biến',
  }),
  defineMessage({
    key: 'qr.status.orderPaid',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Trạng thái đã thanh toán (PAID)',
    defaultTitle: 'Cảm ơn quý khách và hẹn gặp lại!',
  }),
  defineMessage({
    key: 'qr.status.orderVoided',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Trạng thái đơn bị huỷ (VOIDED)',
    defaultTitle: 'Đơn hàng đã bị huỷ',
  }),
  defineMessage({
    key: 'qr.status.orderAutoCancelled',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Đơn QR mới tự động huỷ do quá thời gian chờ xác nhận',
    defaultTitle:
      'Đơn gọi món của bạn đã tự động huỷ do quá {minutes} phút chưa được xác nhận tại quầy. Vui lòng gọi lại món hoặc liên hệ nhân viên.',
    variables: ['minutes'],
  }),
  defineMessage({
    key: 'qr.status.addonAutoCancelled',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Món gọi thêm QR tự động huỷ do quá thời gian chờ xác nhận',
    defaultTitle:
      'Các món gọi thêm quá {minutes} phút chưa xác nhận đã tự động huỷ. Bàn vẫn giữ nguyên các món đã xác nhận trước đó.',
    variables: ['minutes'],
  }),
  defineMessage({
    key: 'qr.status.redirectFallback',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Thông báo chuyển bàn / gộp bàn Realtime',
    defaultTitle: 'Đơn hàng của bạn đã được chuyển sang {tableLabel}.',
    variables: ['tableLabel'],
  }),
  defineMessage({
    key: 'qr.order.submitSuccess',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Khách gửi gọi món QR thành công',
    defaultTitle: 'Đã gửi đặt món thành công',
    defaultDescription: 'Lượt gọi #{batchNo} tại {tableLabel}',
    variables: ['batchNo', 'tableLabel'],
  }),
  defineMessage({
    key: 'qr.order.submitError',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Khách gửi gọi món QR thất bại',
    defaultTitle: 'Không thể gửi đơn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'qr.modifier.minSubstituteRequired',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Cảnh báo phải giữ tối thiểu 1 thành phần thay thế',
    defaultTitle: 'Cần giữ lại ít nhất 1 đồ ăn chính',
    defaultDescription: 'Nhóm "{groupName}" phải giữ tối thiểu 1 thành phần để thay thế cho các món bỏ chọn.',
    variables: ['groupName'],
  }),
  defineMessage({
    key: 'qr.notice.guestAddonAdded',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo bàn vừa có lượt gọi thêm (đa máy)',
    defaultTitle: 'Bàn vừa gọi thêm món (Lượt #{batchNo})',
    variables: ['batchNo'],
  }),
  defineMessage({
    key: 'qr.notice.itemCancelled',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo quầy huỷ / giảm số lượng món',
    defaultTitle: 'Quầy đã huỷ {qty} × {itemName}',
    variables: ['qty', 'itemName'],
  }),
  defineMessage({
    key: 'qr.notice.itemsAdjusted',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo quầy điều chỉnh danh sách món',
    defaultTitle: 'Quầy đã điều chỉnh món trong đơn — Tổng mới: {total}',
    variables: ['total'],
  }),
  defineMessage({
    key: 'qr.notice.discountApplied',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo quầy áp dụng giảm giá',
    defaultTitle: 'Quầy đã áp dụng giảm giá (-{discountAmount}) — Tổng mới: {total}',
    variables: ['discountAmount', 'total'],
  }),
  defineMessage({
    key: 'qr.notice.discountRemoved',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo quầy gỡ giảm giá',
    defaultTitle: 'Quầy đã gỡ giảm giá — Tổng mới: {total}',
    variables: ['total'],
  }),
  defineMessage({
    key: 'qr.notice.provisionalPrinted',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo quầy đã in phiếu tạm tính',
    defaultTitle: 'Quầy đã in phiếu tạm tính: {total}',
    variables: ['total'],
  }),
  defineMessage({
    key: 'qr.notice.tableMergedInto',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo bàn khác vừa gộp vào bàn hiện tại',
    defaultTitle: '{sourceTable} đã được gộp vào bàn của bạn ({targetTable})',
    variables: ['sourceTable', 'targetTable'],
  }),
  defineMessage({
    key: 'qr.notice.menuUpdated',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Thông báo thực đơn vừa cập nhật',
    defaultTitle: 'Thực đơn vừa được cập nhật',
  }),
  defineMessage({
    key: 'qr.notice.reconnecting',
    module: 'QR_CUSTOMER',
    kind: 'status',
    label: 'Chỉ báo mất kết nối socket trên trang QR',
    defaultTitle: 'Mất kết nối, đang kết nối lại…',
  }),
  defineMessage({
    key: 'qr.lock.qrRotated',
    module: 'QR_CUSTOMER',
    kind: 'blocker',
    label: 'Mã QR bàn đã được làm mới (hết hiệu lực)',
    defaultTitle: 'Mã QR bàn đã được làm mới',
    defaultDescription: 'Mã QR này không còn hiệu lực. Vui lòng quét lại mã QR mới tại bàn để tiếp tục.',
  }),
  defineMessage({
    key: 'qr.cart.unavailableItem',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Cảnh báo món trong giỏ đã hết hoặc tạm ngưng',
    defaultTitle: 'Có món đã hết trong giỏ ({names}) — vui lòng xoá để tiếp tục',
    variables: ['names'],
  }),
  defineMessage({
    key: 'qr.cart.priceChanged',
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Cảnh báo giá món trong giỏ vừa cập nhật',
    defaultTitle: 'Giá một số món trong giỏ vừa được cập nhật theo thực đơn mới',
  }),

  // =========================================================================
  // 2. POS — Bán hàng & Bàn (POS)
  // =========================================================================
  defineMessage({
    key: 'pos.order.addItemSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Thêm món vào đơn đang mở',
    defaultTitle: 'Đã thêm món vào đơn',
    defaultDescription: '{quantity}x {itemName}',
    variables: ['quantity', 'itemName'],
  }),
  defineMessage({
    key: 'pos.order.addItemError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi thêm món vào đơn',
    defaultTitle: 'Lỗi thêm món',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.order.createSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Tạo đơn mới thành công',
    defaultTitle: 'Đã tạo đơn thành công',
    defaultDescription: '{targetLabel}',
    variables: ['targetLabel'],
  }),
  defineMessage({
    key: 'pos.order.createError',
    module: 'POS',
    kind: 'toast',
    label: 'Không thể tạo đơn mới',
    defaultTitle: 'Không thể tạo đơn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.order.approveQrSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Duyệt đơn QR thành công',
    defaultTitle: 'Đã duyệt đơn QR',
    defaultDescription: 'Đơn đã chuyển sang trạng thái Đang phục vụ.',
  }),
  defineMessage({
    key: 'pos.order.approveQrError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi duyệt đơn QR',
    defaultTitle: 'Lỗi duyệt đơn QR',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.order.cancelItemSlipSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Huỷ món đã in & sinh Phiếu Báo Huỷ',
    defaultTitle: 'Đã huỷ món bếp & sinh Phiếu Báo Huỷ',
    defaultDescription: 'Đã gửi lệnh in báo huỷ tới {stationCount} trạm bếp.',
    variables: ['stationCount'],
  }),
  defineMessage({
    key: 'pos.kitchen.splitSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Tách đơn in bếp thành công',
    defaultTitle: 'Đã tách đơn Lượt {batchNo}',
    defaultDescription: 'Đã gửi {ticketCount} phiếu in nhiệt xuống bếp.',
    variables: ['batchNo', 'ticketCount'],
  }),
  defineMessage({
    key: 'pos.kitchen.splitNoNewItems',
    module: 'POS',
    kind: 'toast',
    label: 'Không có món mới cần tách bếp',
    defaultTitle: 'Thông báo tách bếp',
    defaultDescription: '{message}',
    variables: ['message'],
  }),
  defineMessage({
    key: 'pos.kitchen.splitError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi tách bếp',
    defaultTitle: 'Lỗi tách bếp',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.kitchen.reprintBatchSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'In lại phiếu bếp theo lượt thành công',
    defaultTitle: 'Đã in lại phiếu bếp Lượt {batchNo}',
    defaultDescription: 'Đã gửi {ticketCount} bản sao phiếu in (có dấu bản sao chống làm trùng).',
    variables: ['batchNo', 'ticketCount'],
  }),
  defineMessage({
    key: 'pos.kitchen.reprintAllSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'In lại toàn bộ phiếu bếp thành công',
    defaultTitle: 'Đã in lại toàn bộ phiếu bếp',
    defaultDescription: 'Đã gửi {ticketCount} bản sao phiếu in (có dấu bản sao chống làm trùng).',
    variables: ['ticketCount'],
  }),
  defineMessage({
    key: 'pos.kitchen.reprintEmpty',
    module: 'POS',
    kind: 'toast',
    label: 'Không có món đã in để in lại',
    defaultTitle: 'Thông báo in lại phiếu bếp',
    defaultDescription: '{message}',
    variables: ['message'],
  }),
  defineMessage({
    key: 'pos.kitchen.reprintError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi in lại phiếu bếp',
    defaultTitle: 'Lỗi in lại phiếu bếp',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.paymentQr.overLimitWarning',
    module: 'POS',
    kind: 'toast',
    label: 'Cảnh báo tất cả mã QR đã chạm hạn mức',
    defaultTitle: 'Tất cả mã QR đã đạt hạn mức',
    defaultDescription: 'Đang tạm in bằng {accountLabel} ({bankName} - {accountNo}).',
    variables: ['accountLabel', 'bankName', 'accountNo'],
  }),
  defineMessage({
    key: 'pos.paymentQr.rotatedInfo',
    module: 'POS',
    kind: 'toast',
    label: 'Thông báo tự động xoay sang mã QR mới',
    defaultTitle: 'Đã tự động chuyển sang mã QR mới',
    defaultDescription: 'Đang dùng: {accountLabel} ({bankName} - {accountNo}).',
    variables: ['accountLabel', 'bankName', 'accountNo'],
  }),
  defineMessage({
    key: 'pos.provisional.printSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'In phiếu tạm tính (VietQR) thành công',
    defaultTitle: 'Đã in phiếu tạm tính (VietQR)',
    defaultDescription: 'Mã đơn {orderCode} vẫn giữ nguyên trạng thái Đang phục vụ.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'pos.provisional.printError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi in tạm tính',
    defaultTitle: 'Lỗi in tạm tính',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.checkout.successWithPrint',
    module: 'POS',
    kind: 'toast',
    label: 'Thanh toán hoàn tất (Có in hoá đơn)',
    defaultTitle: 'Thanh toán hoàn tất',
    defaultDescription: 'Đã đóng đơn, giải phóng bàn và in hoá đơn.',
  }),
  defineMessage({
    key: 'pos.checkout.successNoPrint',
    module: 'POS',
    kind: 'toast',
    label: 'Thanh toán hoàn tất (Không in)',
    defaultTitle: 'Thanh toán hoàn tất',
    defaultDescription: 'Đã đóng đơn và giải phóng bàn (Không in).',
  }),
  defineMessage({
    key: 'pos.checkout.error',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi thanh toán',
    defaultTitle: 'Lỗi thanh toán',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.split.provisionalSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'In tạm tính tách đơn thành công',
    defaultTitle: 'Đã in phiếu tạm tính tách đơn',
    defaultDescription: 'Đã in tạm tính {itemCount} dòng món ({amount} đ).',
    variables: ['itemCount', 'amount'],
  }),
  defineMessage({
    key: 'pos.split.provisionalError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi in tạm tính tách đơn',
    defaultTitle: 'Lỗi in tạm tính tách đơn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.split.checkoutFullSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Thanh toán tách đơn hết toàn bộ đơn',
    defaultTitle: 'Đã thanh toán toàn bộ đơn',
    defaultDescription: 'Tất cả món đã được thanh toán và bàn đã được giải phóng.',
  }),
  defineMessage({
    key: 'pos.split.checkoutPartialSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Thanh toán tách một phần đơn thành công',
    defaultTitle: 'Đã tách đơn & thanh toán thành công',
    defaultDescription: 'Hoá đơn tách {paidOrderCode} đã thanh toán. Đơn gốc còn {remainingAmount} đ.',
    variables: ['paidOrderCode', 'remainingAmount'],
  }),
  defineMessage({
    key: 'pos.split.checkoutError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi thanh toán tách đơn',
    defaultTitle: 'Lỗi thanh toán tách đơn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.tableAction.successPrinted',
    module: 'POS',
    kind: 'toast',
    label: 'Chuyển/gộp/đổi bàn thành công (Có in bếp)',
    defaultTitle: 'Đã {actionText} bàn thành công',
    defaultDescription: 'Đã in Phiếu Thông báo Chuyển bàn xuống bếp.',
    variables: ['actionText'],
  }),
  defineMessage({
    key: 'pos.tableAction.successSynced',
    module: 'POS',
    kind: 'toast',
    label: 'Chuyển/gộp/đổi bàn thành công (Đồng bộ QR)',
    defaultTitle: 'Đã {actionText} bàn thành công',
    defaultDescription: 'Đã đồng bộ sơ đồ bàn và phiên QR của khách.',
    variables: ['actionText'],
  }),
  defineMessage({
    key: 'pos.tableAction.error',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi thao tác bàn',
    defaultTitle: 'Không thể thao tác bàn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.order.voidTakeawaySuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Huỷ đơn mang về thành công',
    defaultTitle: 'Đã huỷ đơn mang về',
    defaultDescription: 'Đơn mang về đã được huỷ thành công.',
  }),
  defineMessage({
    key: 'pos.order.voidTableSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Huỷ đơn bàn & giải phóng bàn thành công',
    defaultTitle: 'Đã huỷ đơn & giải phóng bàn',
    defaultDescription: 'Bàn đã chuyển về trạng thái Bàn trống.',
  }),
  defineMessage({
    key: 'pos.order.voidError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi huỷ đơn',
    defaultTitle: 'Lỗi huỷ đơn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.discount.applySuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Áp dụng giảm giá thành công',
    defaultTitle: 'Đã áp dụng giảm giá (-{amount} đ)',
    variables: ['amount'],
  }),
  defineMessage({
    key: 'pos.discount.applyError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi áp dụng giảm giá',
    defaultTitle: 'Không thể áp dụng giảm giá',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.discount.removeSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Gỡ bỏ giảm giá thành công',
    defaultTitle: 'Đã gỡ bỏ giảm giá khỏi đơn hàng',
  }),
  defineMessage({
    key: 'pos.discount.removeError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi gỡ giảm giá',
    defaultTitle: 'Không thể gỡ giảm giá',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'discounts.createSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Tạo mã giảm giá thành công',
    defaultTitle: 'Đã tạo mã giảm giá {code}',
    variables: ['code'],
  }),
  defineMessage({
    key: 'discounts.createError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi tạo mã giảm giá',
    defaultTitle: 'Không thể tạo mã giảm giá',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'discounts.updateSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Cập nhật mã giảm giá thành công',
    defaultTitle: 'Đã cập nhật mã {code}',
    variables: ['code'],
  }),
  defineMessage({
    key: 'discounts.updateError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi cập nhật mã giảm giá',
    defaultTitle: 'Không thể cập nhật mã giảm giá',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'discounts.toggleSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Đổi trạng thái mã giảm giá thành công',
    defaultTitle: '{message}',
    variables: ['message'],
  }),
  defineMessage({
    key: 'discounts.toggleError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi đổi trạng thái mã giảm giá',
    defaultTitle: 'Không thể đổi trạng thái mã',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'discounts.deleteSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Xoá hoặc lưu trữ mã giảm giá thành công',
    defaultTitle: '{message}',
    variables: ['message'],
  }),
  defineMessage({
    key: 'discounts.deleteError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi xoá hoặc lưu trữ mã giảm giá',
    defaultTitle: 'Thao tác thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.socket.newQrOrder',
    module: 'POS',
    kind: 'toast',
    label: 'Cảnh báo thu ngân có đơn QR mới',
    defaultTitle: '🔔 Đơn QR mới tại {tableLabel}',
    defaultDescription: 'Vui lòng kiểm tra và bấm Duyệt đơn / Tách bếp.',
    variables: ['tableLabel'],
  }),
  defineMessage({
    key: 'pos.socket.qrAppendItems',
    module: 'POS',
    kind: 'toast',
    label: 'Cảnh báo bàn gọi thêm món qua QR',
    defaultTitle: '🔔 {tableLabel} gọi thêm món',
    defaultDescription: 'Khách vừa đặt thêm món qua QR (Lượt {batchNo}).',
    variables: ['tableLabel', 'batchNo'],
  }),
  defineMessage({
    key: 'pos.order.closedElsewhere',
    module: 'POS',
    kind: 'toast',
    label: 'Đơn đang mở đã được đóng ở máy khác (thanh toán / huỷ / gộp)',
    defaultTitle: '{tableLabel} đã {action} ở máy khác',
    defaultDescription: 'Màn hình đã quay về sơ đồ bàn.',
    variables: ['tableLabel', 'action'],
  }),
  defineMessage({
    key: 'pos.socket.qrAutoCancelled',
    module: 'POS',
    kind: 'toast',
    label: 'Thông báo hệ thống tự động huỷ đơn/món QR quá hạn',
    defaultTitle: '⏰ Tự động huỷ đơn QR quá hạn tại {tableLabel}',
    defaultDescription: '{detail}',
    variables: ['tableLabel', 'detail'],
  }),
  defineMessage({
    key: 'pos.voice.qrNewOrder',
    module: 'POS',
    kind: 'toast',
    label: 'Câu đọc phát thanh: Đơn QR mới',
    defaultTitle: '{tableLabel} có đơn mới',
    variables: ['tableLabel', 'orderCode'],
    maxTitleLength: 160,
  }),
  defineMessage({
    key: 'pos.voice.qrAddonOrder',
    module: 'POS',
    kind: 'toast',
    label: 'Câu đọc phát thanh: Khách gọi thêm món QR',
    defaultTitle: '{tableLabel} có đơn gọi thêm',
    variables: ['tableLabel', 'batchNo', 'orderCode'],
    maxTitleLength: 160,
  }),
  defineMessage({
    key: 'pos.voice.qrNewReminder',
    module: 'POS',
    kind: 'toast',
    label: 'Câu đọc phát thanh nhắc lại: Đơn QR mới chưa xác nhận',
    defaultTitle: 'Nhắc lại: {tableLabel} có đơn mới chưa xác nhận',
    variables: ['tableLabel', 'orderCode'],
    maxTitleLength: 160,
  }),
  defineMessage({
    key: 'pos.voice.qrAddonReminder',
    module: 'POS',
    kind: 'toast',
    label: 'Câu đọc phát thanh nhắc lại: Gọi thêm QR chưa xác nhận',
    defaultTitle: 'Nhắc lại: {tableLabel} có đơn gọi thêm chưa xác nhận',
    variables: ['tableLabel', 'batchNo', 'orderCode'],
    maxTitleLength: 160,
  }),
  defineMessage({
    key: 'pos.voice.qrMultiReminder',
    module: 'POS',
    kind: 'toast',
    label: 'Câu đọc phát thanh nhắc lại gộp nhiều bàn quá hạn',
    defaultTitle: 'Nhắc lại: {tableLabels} đang chờ xác nhận đơn',
    variables: ['tableLabels', 'count'],
    maxTitleLength: 200,
  }),
  defineMessage({
    key: 'pos.voice.engineConfig',
    module: 'POS',
    kind: 'status',
    label: 'Cấu hình giọng đọc & tốc độ phát thanh QR',
    defaultTitle: 'vi-female-standard|rate=1|volume=1|chime=1',
    maxTitleLength: 200,
  }),
  defineMessage({
    key: 'pos.voice.reminderConfig',
    module: 'POS',
    kind: 'status',
    label: 'Cấu hình nhắc lại & tự động huỷ đơn QR quá hạn',
    defaultTitle: 'rem=1|remDelay=5|remInt=60|remMax=2|autoCancel=1|autoCancelMin=12',
    maxTitleLength: 200,
  }),
  defineMessage({
    key: 'pos.table.editOccupiedError',
    module: 'POS',
    kind: 'toast',
    label: 'Không thể đổi tên bàn đang có khách',
    defaultTitle: 'Không thể sửa tên bàn',
    defaultDescription: 'Bàn "{tableName}" đang phục vụ. Vui lòng hoàn tất thanh toán trước khi đổi tên bàn.',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.missingName',
    module: 'POS',
    kind: 'toast',
    label: 'Thiếu tên bàn',
    defaultTitle: 'Vui lòng nhập tên bàn',
  }),
  defineMessage({
    key: 'pos.table.invalidLength',
    module: 'POS',
    kind: 'toast',
    label: 'Độ dài tên bàn không hợp lệ',
    defaultTitle: 'Tên bàn không hợp lệ',
    defaultDescription: 'Tên bàn phải từ 2 đến 30 ký tự.',
  }),
  defineMessage({
    key: 'pos.table.reservedTakeawayName',
    module: 'POS',
    kind: 'toast',
    label: 'Cấm đặt tên bàn là Mang về (Invariant 2)',
    defaultTitle: 'Tên bàn không hợp lệ',
    defaultDescription: 'Không được tạo bàn tên "Mang về" trong sơ đồ bàn vật lý.',
  }),
  defineMessage({
    key: 'pos.table.duplicateName',
    module: 'POS',
    kind: 'toast',
    label: 'Trùng tên bàn',
    defaultTitle: 'Trùng tên bàn',
    defaultDescription: 'Tên bàn "{tableName}" đã tồn tại trong sơ đồ.',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.renameSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Đổi tên bàn thành công',
    defaultTitle: 'Đã đổi tên bàn thành "{tableName}"',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.createSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Thêm bàn mới thành công',
    defaultTitle: 'Đã thêm "{tableName}" vào sơ đồ bàn',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.saveError',
    module: 'POS',
    kind: 'toast',
    label: 'Lưu bàn thất bại',
    defaultTitle: 'Lưu bàn thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.table.deleteOccupiedError',
    module: 'POS',
    kind: 'toast',
    label: 'Không thể xoá bàn đang có đơn mở',
    defaultTitle: 'Không thể xoá bàn đang có khách',
    defaultDescription: 'Bàn "{tableName}" đang có đơn mở. Vui lòng thanh toán hoặc chuyển bàn trước.',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.deleteSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Xoá bàn thành công',
    defaultTitle: 'Đã xoá "{tableName}" khỏi sơ đồ bàn',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.deleteError',
    module: 'POS',
    kind: 'toast',
    label: 'Không thể xoá bàn',
    defaultTitle: 'Không thể xoá bàn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.table.qrCopied',
    module: 'POS',
    kind: 'toast',
    label: 'Sao chép link QR bàn / Mang về thành công',
    defaultTitle: 'Đã sao chép link QR: {tableName}',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.qrCopyFallback',
    module: 'POS',
    kind: 'toast',
    label: 'Hiển thị link QR khi không sao chép tự động được',
    defaultTitle: 'Link QR ({tableName}): {url}',
    variables: ['tableName', 'url'],
  }),
  defineMessage({
    key: 'pos.table.qrDownloaded',
    module: 'POS',
    kind: 'toast',
    label: 'Tải ảnh mã QR PNG thành công',
    defaultTitle: 'Đã tải ảnh mã QR: {tableName}',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.qrZipExported',
    module: 'POS',
    kind: 'toast',
    label: 'Xuất bộ ảnh mã QR (.zip) thành công',
    defaultTitle: 'Đã xuất {count} ảnh mã QR (.zip)',
    variables: ['count'],
  }),
  defineMessage({
    key: 'pos.table.qrRotateSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Đổi mã QR mới thành công',
    defaultTitle: 'Đã đổi mã QR mới cho {tableName}',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.table.qrShortenAllSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Thu gọn hàng loạt mã QR thành công',
    defaultTitle: 'Đã chuyển {count} mã QR sang dạng ngắn dễ nhập',
    variables: ['count'],
  }),
  defineMessage({
    key: 'pos.table.qrExportError',
    module: 'POS',
    kind: 'toast',
    label: 'Lỗi xuất ảnh mã QR',
    defaultTitle: 'Không thể xuất ảnh mã QR',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.qrSecurity.addIpSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Đã thêm IP mạng quán hiện tại',
    defaultTitle: 'Đã thêm IP mạng hiện tại ({ip})',
    variables: ['ip'],
  }),
  defineMessage({
    key: 'pos.qrSecurity.gpsUnsupported',
    module: 'POS',
    kind: 'toast',
    label: 'Trình duyệt không hỗ trợ GPS',
    defaultTitle: 'Trình duyệt không hỗ trợ định vị GPS',
    defaultDescription: 'Vui lòng nhập toạ độ Vĩ độ / Kinh độ của quán thủ công.',
  }),
  defineMessage({
    key: 'pos.qrSecurity.gpsSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Lấy toạ độ GPS quán thành công',
    defaultTitle: 'Đã lấy toạ độ GPS của quán thành công',
    defaultDescription: 'Vĩ độ: {lat}, Kinh độ: {lng}',
    variables: ['lat', 'lng'],
  }),
  defineMessage({
    key: 'pos.qrSecurity.gpsPermissionDenied',
    module: 'POS',
    kind: 'toast',
    label: 'Từ chối quyền GPS khi cấu hình',
    defaultTitle: 'Không thể lấy vị trí GPS tự động',
    defaultDescription: 'Bạn đã từ chối quyền vị trí trên trình duyệt. Hãy bật quyền vị trí hoặc nhập toạ độ thủ công.',
  }),
  defineMessage({
    key: 'pos.qrSecurity.gpsFailed',
    module: 'POS',
    kind: 'toast',
    label: 'Không thể lấy vị trí GPS tự động',
    defaultTitle: 'Không thể lấy vị trí GPS tự động',
    defaultDescription: 'Vui lòng kiểm tra kết nối định vị của thiết bị.',
  }),
  defineMessage({
    key: 'pos.qrSecurity.invalidCoords',
    module: 'POS',
    kind: 'toast',
    label: 'Toạ độ GPS không hợp lệ',
    defaultTitle: 'Toạ độ GPS không hợp lệ',
    defaultDescription: 'Vĩ độ phải từ -90 đến 90, Kinh độ phải từ -180 đến 180.',
  }),
  defineMessage({
    key: 'pos.qrSecurity.missingCoords',
    module: 'POS',
    kind: 'toast',
    label: 'Thiếu toạ độ GPS quán',
    defaultTitle: 'Thiếu toạ độ GPS của quán',
    defaultDescription: 'Khi bật Phương án 2 (Giới hạn Định vị), vui lòng bấm "Lấy toạ độ quán hiện tại" hoặc nhập Vĩ độ & Kinh độ.',
  }),
  defineMessage({
    key: 'pos.qrSecurity.saveSuccess',
    module: 'POS',
    kind: 'toast',
    label: 'Lưu cấu hình Bảo mật QR thành công',
    defaultTitle: 'Đã lưu cấu hình Bảo mật QR thành công',
    defaultDescription: '{summary}',
    variables: ['summary'],
  }),
  defineMessage({
    key: 'pos.qrSecurity.saveError',
    module: 'POS',
    kind: 'toast',
    label: 'Lưu cấu hình Bảo mật QR thất bại',
    defaultTitle: 'Không thể lưu cấu hình bảo mật QR',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'pos.confirm.checkout',
    module: 'POS',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận thanh toán & đóng đơn',
    defaultTitle: 'Xác nhận Thanh toán (Đóng đơn) — {tableLabel} ({orderCode})',
    defaultDescription: 'Tổng thanh toán: {totalAmount} đ. Sau khi xác nhận, đơn chuyển sang Đã thanh toán và giải phóng bàn về trống.',
    variables: ['tableLabel', 'orderCode', 'totalAmount'],
  }),
  defineMessage({
    key: 'pos.confirm.deleteTable',
    module: 'POS',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận xoá bàn vật lý',
    defaultTitle: 'Xác nhận xoá bàn {tableName}?',
    defaultDescription: 'Bạn có chắc chắn muốn xoá bàn {tableName} khỏi sơ đồ bàn vật lý?',
    variables: ['tableName'],
  }),
  defineMessage({
    key: 'pos.dialog.tableAction',
    module: 'POS',
    kind: 'confirm',
    label: 'Hộp thoại Chuyển / Gộp / Hoán đổi bàn',
    defaultTitle: 'Chuyển / Gộp / Hoán đổi Bàn — {tableLabel}',
    defaultDescription: 'Chọn thao tác bàn và bàn đích. Nếu đã có món in bếp, hệ thống sẽ tự động in Phiếu Thông báo Đổi bàn.',
    variables: ['tableLabel'],
  }),

  // =========================================================================
  // 3. MENU — Quản trị Thực đơn
  // =========================================================================
  defineMessage({
    key: 'menu.product.toggleVisibleSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Hiển thị lại món trên POS & QR',
    defaultTitle: 'Đã hiển thị lại món "{productName}"',
    variables: ['productName'],
  }),
  defineMessage({
    key: 'menu.product.toggleHiddenSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Ẩn món trên POS & QR',
    defaultTitle: 'Đã ẩn món "{productName}" trên POS & QR',
    variables: ['productName'],
  }),
  defineMessage({
    key: 'menu.product.toggleError',
    module: 'MENU',
    kind: 'toast',
    label: 'Lỗi đổi trạng thái món',
    defaultTitle: 'Không thể đổi trạng thái món',
  }),
  defineMessage({
    key: 'menu.product.softHiddenWarning',
    module: 'MENU',
    kind: 'toast',
    label: 'Ẩn món thay vì xoá vì đã có hoá đơn',
    defaultTitle: 'Đã ẩn "{productName}"',
    defaultDescription: 'Món đã có lịch sử hoá đơn nên được giữ lại dữ liệu và chuyển sang Đang ẩn.',
    variables: ['productName'],
  }),
  defineMessage({
    key: 'menu.product.deleteSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Xoá món khỏi thực đơn thành công',
    defaultTitle: 'Đã xoá "{productName}" khỏi Thực đơn',
    variables: ['productName'],
  }),
  defineMessage({
    key: 'menu.product.deleteError',
    module: 'MENU',
    kind: 'toast',
    label: 'Không thể xoá món ăn',
    defaultTitle: 'Không thể xoá món ăn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.excel.exportSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Xuất file Excel thực đơn thành công',
    defaultTitle: 'Đã xuất {count} món ăn ra file Excel',
    variables: ['count'],
  }),
  defineMessage({
    key: 'menu.excel.readError',
    module: 'MENU',
    kind: 'toast',
    label: 'Lỗi đọc file Excel thực đơn',
    defaultTitle: 'Không thể đọc file Excel',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.excel.importSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Nhập file Excel thực đơn thành công',
    defaultTitle: 'Nhập file Excel thực đơn thành công',
    defaultDescription: 'Tạo mới {createdCount} món, cập nhật {updatedCount} món, xoá {deletedCount} món.{skippedText}',
    variables: ['createdCount', 'updatedCount', 'deletedCount', 'skippedText'],
  }),
  defineMessage({
    key: 'menu.excel.importError',
    module: 'MENU',
    kind: 'toast',
    label: 'Đồng bộ file Excel thất bại',
    defaultTitle: 'Đồng bộ file Excel thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.product.missingName',
    module: 'MENU',
    kind: 'toast',
    label: 'Thiếu tên sản phẩm',
    defaultTitle: 'Vui lòng nhập tên sản phẩm',
  }),
  defineMessage({
    key: 'menu.product.invalidPrice',
    module: 'MENU',
    kind: 'toast',
    label: 'Đơn giá bán không hợp lệ',
    defaultTitle: 'Đơn giá bán không hợp lệ',
  }),
  defineMessage({
    key: 'menu.product.comboRequiresItems',
    module: 'MENU',
    kind: 'toast',
    label: 'Combo thiếu món thành phần',
    defaultTitle: 'Món Combo phải có ít nhất 1 món thành phần thuộc bếp thực',
  }),
  defineMessage({
    key: 'menu.product.modifierGroupMissingName',
    module: 'MENU',
    kind: 'toast',
    label: 'Thiếu tên nhóm tuỳ chọn',
    defaultTitle: 'Vui lòng nhập tên cho tất cả nhóm tuỳ chọn',
  }),
  defineMessage({
    key: 'menu.product.modifierOptionMissingName',
    module: 'MENU',
    kind: 'toast',
    label: 'Nhóm tuỳ chọn có mục chưa nhập tên',
    defaultTitle: 'Nhóm "{groupName}" có tuỳ chọn chưa nhập tên',
    variables: ['groupName'],
  }),
  defineMessage({
    key: 'menu.product.updateSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Cập nhật món ăn thành công',
    defaultTitle: 'Đã cập nhật sản phẩm',
    defaultDescription: '{productName} đã đồng bộ sang Thực đơn gọi món nhanh & QR.',
    variables: ['productName'],
  }),
  defineMessage({
    key: 'menu.product.createSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Thêm món mới thành công',
    defaultTitle: 'Đã thêm món mới vào Thực đơn',
    defaultDescription: '{productName} đã sẵn sàng trên màn hình POS & QR.',
    variables: ['productName'],
  }),
  defineMessage({
    key: 'menu.product.saveError',
    module: 'MENU',
    kind: 'toast',
    label: 'Lưu sản phẩm thất bại',
    defaultTitle: 'Lưu thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.category.missingName',
    module: 'MENU',
    kind: 'toast',
    label: 'Thiếu tên danh mục con',
    defaultTitle: 'Vui lòng nhập tên danh mục con',
  }),
  defineMessage({
    key: 'menu.category.updateSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Cập nhật danh mục con thành công',
    defaultTitle: 'Đã cập nhật danh mục con',
  }),
  defineMessage({
    key: 'menu.category.createSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Thêm danh mục con thành công',
    defaultTitle: 'Đã thêm danh mục Thực đơn mới',
    defaultDescription: 'Gắn với khu vực {stationLabel}',
    variables: ['stationLabel'],
  }),
  defineMessage({
    key: 'menu.category.saveError',
    module: 'MENU',
    kind: 'toast',
    label: 'Không thể lưu danh mục con',
    defaultTitle: 'Không thể lưu danh mục con',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.category.toggleHidden',
    module: 'MENU',
    kind: 'toast',
    label: 'Ẩn danh mục con trên POS & QR',
    defaultTitle: 'Đã ẩn danh mục "{categoryName}" trên POS & QR',
    variables: ['categoryName'],
  }),
  defineMessage({
    key: 'menu.category.toggleVisible',
    module: 'MENU',
    kind: 'toast',
    label: 'Hiển thị lại danh mục con',
    defaultTitle: 'Đã hiển thị lại danh mục "{categoryName}"',
    variables: ['categoryName'],
  }),
  defineMessage({
    key: 'menu.category.toggleError',
    module: 'MENU',
    kind: 'toast',
    label: 'Lỗi đổi trạng thái danh mục con',
    defaultTitle: 'Cập nhật thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.category.deleteSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Xoá danh mục con thành công',
    defaultTitle: 'Đã xoá danh mục "{categoryName}"',
    variables: ['categoryName'],
  }),
  defineMessage({
    key: 'menu.category.deleteError',
    module: 'MENU',
    kind: 'toast',
    label: 'Không thể xoá danh mục con',
    defaultTitle: 'Không thể xoá danh mục',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.station.missingName',
    module: 'MENU',
    kind: 'toast',
    label: 'Thiếu tên Khu vực Bếp',
    defaultTitle: 'Vui lòng nhập tên Khu vực Bếp (Tầng 1)',
  }),
  defineMessage({
    key: 'menu.station.updateSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Cập nhật Khu vực Bếp thành công',
    defaultTitle: 'Đã cập nhật khu vực "{stationName}"',
    variables: ['stationName'],
  }),
  defineMessage({
    key: 'menu.station.createSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Thêm Khu vực Bếp thành công',
    defaultTitle: 'Đã thêm khu vực "{stationName}"',
    defaultDescription: 'Mã trạm bếp: {stationCode}',
    variables: ['stationName', 'stationCode'],
  }),
  defineMessage({
    key: 'menu.station.saveError',
    module: 'MENU',
    kind: 'toast',
    label: 'Lưu Khu vực Bếp thất bại',
    defaultTitle: 'Lưu thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.station.toggleHidden',
    module: 'MENU',
    kind: 'toast',
    label: 'Ẩn Khu vực Bếp trên POS & QR',
    defaultTitle: 'Đã ẩn khu vực "{stationName}" trên POS & QR',
    variables: ['stationName'],
  }),
  defineMessage({
    key: 'menu.station.toggleVisible',
    module: 'MENU',
    kind: 'toast',
    label: 'Hiển thị lại Khu vực Bếp',
    defaultTitle: 'Đã hiển thị lại khu vực "{stationName}"',
    variables: ['stationName'],
  }),
  defineMessage({
    key: 'menu.station.toggleError',
    module: 'MENU',
    kind: 'toast',
    label: 'Lỗi cập nhật Khu vực Bếp',
    defaultTitle: 'Lỗi cập nhật',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.station.systemDeleteWarning',
    module: 'MENU',
    kind: 'toast',
    label: 'Cảnh báo không thể xoá khu vực mặc định',
    defaultTitle: 'Khu vực bếp mặc định của hệ thống',
    defaultDescription: 'Vui lòng dùng nút Ẩn (biểu tượng con mắt) nếu bạn không muốn hiển thị khu vực này.',
  }),
  defineMessage({
    key: 'menu.station.deleteSuccess',
    module: 'MENU',
    kind: 'toast',
    label: 'Xoá Khu vực Bếp thành công',
    defaultTitle: 'Đã xoá khu vực "{stationName}"',
    variables: ['stationName'],
  }),
  defineMessage({
    key: 'menu.station.deleteError',
    module: 'MENU',
    kind: 'toast',
    label: 'Không thể xoá Khu vực Bếp',
    defaultTitle: 'Không thể xoá Khu vực Bếp',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'menu.confirm.importExcel',
    module: 'MENU',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận đồng bộ Thực đơn từ Excel',
    defaultTitle: 'Xác nhận đồng bộ Thực đơn từ file Excel',
    defaultDescription: 'Dựa vào cột "Tên món": món mới sẽ tự động tạo, món đã có sẽ cập nhật (các ô không bắt buộc để trống sẽ xoá trắng), và món không còn / bị xoá trống trong file sẽ bị gỡ khỏi Thực đơn (vẫn giữ tên trên lịch sử hoá đơn cũ).',
  }),
  defineMessage({
    key: 'menu.confirm.deleteProduct',
    module: 'MENU',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận xoá món khỏi thực đơn',
    defaultTitle: 'Xác nhận xoá món khỏi Thực đơn',
    defaultDescription: 'Bạn đang chọn xoá món {productName}. Món sẽ bị gỡ khỏi Thực đơn, POS và QR (nhưng vẫn bảo toàn tên món trên các hoá đơn lịch sử đã thanh toán).',
    variables: ['productName'],
  }),

  // =========================================================================
  // 4. PAYMENT_QR — Mã QR Thanh toán
  // =========================================================================
  defineMessage({
    key: 'paymentQr.createSuccess',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Thêm mã QR thanh toán mới thành công',
    defaultTitle: 'Đã thêm mã QR mới',
    defaultDescription: 'Đã thêm {label} ({bankCode} - {accountNo}).',
    variables: ['label', 'bankCode', 'accountNo'],
  }),
  defineMessage({
    key: 'paymentQr.createError',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Không thể thêm mã QR thanh toán',
    defaultTitle: 'Không thể thêm mã QR',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'paymentQr.updateSuccess',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Cập nhật cấu hình mã QR thành công',
    defaultTitle: 'Đã cập nhật mã QR',
    defaultDescription: 'Cấu hình mã QR và hạn mức đã được lưu.',
  }),
  defineMessage({
    key: 'paymentQr.updateError',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Không thể cập nhật mã QR',
    defaultTitle: 'Không thể cập nhật mã QR',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'paymentQr.activateSuccess',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Bật mã QR thanh toán thành công',
    defaultTitle: 'Đã bật mã QR — {stateLabel}',
    defaultDescription: '{label} ({bankName} - {accountNo})',
    variables: ['stateLabel', 'label', 'bankName', 'accountNo'],
  }),
  defineMessage({
    key: 'paymentQr.deactivateSuccess',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Tắt mã QR thanh toán thành công',
    defaultTitle: 'Đã chuyển sang Đang tắt',
    defaultDescription: '{label} ({bankName} - {accountNo})',
    variables: ['label', 'bankName', 'accountNo'],
  }),
  defineMessage({
    key: 'paymentQr.toggleError',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Lỗi cập nhật trạng thái mã QR',
    defaultTitle: 'Lỗi cập nhật trạng thái',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'paymentQr.lastActiveWarning',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Cảnh báo không thể tắt mã QR cuối cùng',
    defaultTitle: 'Không thể tắt mã QR cuối cùng',
    defaultDescription: 'Hệ thống bắt buộc phải có ít nhất 1 mã QR đang bật để thu ngân in phiếu tạm tính. Hãy bật hoặc thêm mã QR khác trước khi tắt mã này.',
  }),
  defineMessage({
    key: 'paymentQr.reorderSuccess',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Cập nhật thứ tự ưu tiên xoay vòng QR',
    defaultTitle: 'Đã cập nhật thứ tự ưu tiên xoay vòng',
  }),
  defineMessage({
    key: 'paymentQr.reorderError',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Lỗi đổi thứ tự ưu tiên xoay vòng QR',
    defaultTitle: 'Không thể đổi thứ tự ưu tiên',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'paymentQr.deleteSuccess',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Xoá mã QR thành công',
    defaultTitle: 'Đã xoá mã QR',
    defaultDescription: 'Đã xoá {label}.',
    variables: ['label'],
  }),
  defineMessage({
    key: 'paymentQr.deleteError',
    module: 'PAYMENT_QR',
    kind: 'toast',
    label: 'Không thể xoá mã QR',
    defaultTitle: 'Không thể xoá mã QR',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'paymentQr.confirm.deactivateActive',
    module: 'PAYMENT_QR',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận tắt mã QR đang dùng',
    defaultTitle: 'Xác nhận tắt mã QR đang dùng',
    defaultDescription: 'Bạn sắp chuyển mã QR {label} ({bankName} - {accountNo}) sang trạng thái Đang tắt.',
    variables: ['label', 'bankName', 'accountNo'],
  }),
  defineMessage({
    key: 'paymentQr.confirm.delete',
    module: 'PAYMENT_QR',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận xoá mã QR thanh toán',
    defaultTitle: 'Xác nhận xoá mã QR thanh toán',
    defaultDescription: 'Bạn có chắc chắn muốn xoá mã QR {label} ({bankName} - {accountNo})? Thao tác này chỉ áp dụng cho mã QR đã tắt và chưa từng phát sinh hoá đơn.',
    variables: ['label', 'bankName', 'accountNo'],
  }),

  // =========================================================================
  // 5. INVOICES — Quản lý Hoá đơn
  // =========================================================================
  defineMessage({
    key: 'invoices.reprintSuccess',
    module: 'INVOICES',
    kind: 'toast',
    label: 'In lại hoá đơn thành công',
    defaultTitle: 'Đã gửi lệnh in lại hoá đơn',
    defaultDescription: 'Hoá đơn {orderCode} đang được in ra máy in nhiệt 80mm.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'invoices.reprintError',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Không thể in lại hoá đơn',
    defaultTitle: 'Không thể in lại hoá đơn',
    defaultDescription: 'Vui lòng kiểm tra lại kết nối hoặc quyền in hoá đơn.',
  }),
  defineMessage({
    key: 'invoices.exportExcelSuccess',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Xuất file Excel hoá đơn thành công',
    defaultTitle: 'Đã xuất {count} hoá đơn ra file Excel',
    variables: ['count'],
  }),
  defineMessage({
    key: 'invoices.exportExcelError',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Xuất file Excel hoá đơn thất bại',
    defaultTitle: 'Không thể xuất file Excel hoá đơn',
  }),
  defineMessage({
    key: 'invoices.paymentEdit.appliedSuccess',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Cập nhật PTTT hoá đơn (áp dụng ngay)',
    defaultTitle: 'Đã cập nhật phương thức thanh toán',
    defaultDescription: 'Hoá đơn {orderCode} đã cập nhật và đồng bộ kết ca.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'invoices.paymentEdit.pendingSuccess',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Gửi yêu cầu sửa PTTT chờ duyệt',
    defaultTitle: 'Đã gửi yêu cầu sửa PTTT chờ duyệt',
    defaultDescription: 'Yêu cầu sửa hoá đơn {orderCode} đang chờ cấp có thẩm quyền duyệt.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'invoices.paymentEdit.error',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Cập nhật PTTT thất bại',
    defaultTitle: 'Cập nhật PTTT thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'invoices.paymentReview.approveSuccess',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Duyệt sửa PTTT thành công',
    defaultTitle: 'Đã duyệt chỉnh sửa phương thức thanh toán',
    defaultDescription: 'Hoá đơn {orderCode} đã cập nhật PTTT và đồng bộ tiền kết ca.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'invoices.paymentReview.rejectSuccess',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Từ chối yêu cầu sửa PTTT',
    defaultTitle: 'Đã từ chối yêu cầu chỉnh sửa',
    defaultDescription: 'Đã giữ nguyên phương thức thanh toán ban đầu cho hoá đơn {orderCode}.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'invoices.paymentReview.error',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Xử lý duyệt PTTT thất bại',
    defaultTitle: 'Xử lý duyệt thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'invoices.confirm.editPaymentMethod',
    module: 'INVOICES',
    kind: 'confirm',
    label: 'Hộp thoại chỉnh sửa phương thức thanh toán',
    defaultTitle: 'Chỉnh sửa phương thức thanh toán',
    defaultDescription: 'Hoá đơn {orderCode} — Tổng tiền: {totalAmount} đ. {modeNote}',
    variables: ['orderCode', 'totalAmount', 'modeNote'],
  }),
  defineMessage({
    key: 'invoices.confirm.reviewPaymentEdit',
    module: 'INVOICES',
    kind: 'confirm',
    label: 'Hộp thoại duyệt yêu cầu sửa PTTT',
    defaultTitle: 'Duyệt yêu cầu sửa phương thức thanh toán',
    defaultDescription: 'Hoá đơn {orderCode} ({totalAmount} đ)',
    variables: ['orderCode', 'totalAmount'],
  }),
  defineMessage({
    key: 'invoices.void.success',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Huỷ hoá đơn (Void) thành công',
    defaultTitle: 'Đã huỷ hoá đơn thanh toán',
    defaultDescription: 'Hoá đơn {orderCode} đã chuyển sang VOIDED và đồng bộ lại dòng tiền.',
    variables: ['orderCode'],
  }),
  defineMessage({
    key: 'invoices.void.error',
    module: 'INVOICES',
    kind: 'toast',
    label: 'Huỷ hoá đơn (Void) thất bại',
    defaultTitle: 'Không thể huỷ hoá đơn',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'invoices.confirm.voidInvoice',
    module: 'INVOICES',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận huỷ hoá đơn (Void)',
    defaultTitle: 'Xác nhận huỷ hoá đơn (Void)',
    defaultDescription: 'Hoá đơn {orderCode} — Tổng tiền: {totalAmount} đ. Thao tác này không thể hoàn tác.',
    variables: ['orderCode', 'totalAmount'],
  }),

  // =========================================================================
  // 6. INVENTORY — Nhập hàng Kho
  // =========================================================================
  defineMessage({
    key: 'inventory.create.emptySkippedSuccess',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Lưu phiếu nhập (bỏ qua dòng trống)',
    defaultTitle: 'Đã lưu phiếu nhập hàng',
    defaultDescription: 'Không có dòng nguyên liệu nào được nhập, đã bỏ qua các dòng trống.',
  }),
  defineMessage({
    key: 'inventory.create.invalidData',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Dữ liệu phiếu nhập chưa hợp lệ',
    defaultTitle: 'Dữ liệu phiếu nhập chưa hợp lệ',
    defaultDescription: 'Vui lòng chọn nhà cung cấp và điền đầy đủ nguyên liệu, ĐVT, đơn giá, số lượng.',
  }),
  defineMessage({
    key: 'inventory.create.success',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Tạo phiếu nhập hàng thành công',
    defaultTitle: 'Đã lưu phiếu nhập hàng',
    defaultDescription: 'Đã nhập {itemCount} mặt hàng vào kho thành công.',
    variables: ['itemCount'],
  }),
  defineMessage({
    key: 'inventory.create.error',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Lỗi khi lưu phiếu nhập kho',
    defaultTitle: 'Lỗi khi lưu phiếu nhập kho',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'inventory.update.invalidData',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Dữ liệu chỉnh sửa phiếu nhập chưa hợp lệ',
    defaultTitle: 'Dữ liệu chỉnh sửa chưa hợp lệ',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'inventory.update.success',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Cập nhật phiếu nhập thành công',
    defaultTitle: 'Cập nhật phiếu nhập thành công',
  }),
  defineMessage({
    key: 'inventory.update.error',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Không thể cập nhật phiếu nhập',
    defaultTitle: 'Không thể cập nhật phiếu nhập',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'inventory.delete.success',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Xoá phiếu nhập hàng thành công',
    defaultTitle: 'Đã xoá phiếu nhập hàng',
    defaultDescription: 'Đã xoá mềm dòng nhập "{itemName}".',
    variables: ['itemName'],
  }),
  defineMessage({
    key: 'inventory.delete.error',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Không thể xoá phiếu nhập',
    defaultTitle: 'Không thể xoá phiếu nhập',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'inventory.exportExcelSuccess',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Xuất file Excel phiếu nhập thành công',
    defaultTitle: 'Đã xuất {count} phiếu nhập ra file Excel',
    variables: ['count'],
  }),
  defineMessage({
    key: 'inventory.exportExcelError',
    module: 'INVENTORY',
    kind: 'toast',
    label: 'Xuất file Excel phiếu nhập thất bại',
    defaultTitle: 'Không thể xuất file Excel phiếu nhập',
  }),
  defineMessage({
    key: 'inventory.confirm.delete',
    module: 'INVENTORY',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận xoá phiếu nhập hàng',
    defaultTitle: 'Xác nhận xoá phiếu nhập hàng',
    defaultDescription: 'Bạn có chắc chắn muốn xoá dòng nhập {itemName} ({totalCost} đ)?',
    variables: ['itemName', 'totalCost'],
  }),

  // =========================================================================
  // 7. CASHFLOW — Ngân sách & Kết ca
  // =========================================================================
  defineMessage({
    key: 'cashflow.settle.success',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Chốt sổ kết ca thành công',
    defaultTitle: 'Đã chốt sổ kết ca thành công',
    defaultDescription: 'Đã lưu biên bản kết ca ngày {settlementDate}.',
    variables: ['settlementDate'],
  }),
  defineMessage({
    key: 'cashflow.settle.error',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Không thể kết ca',
    defaultTitle: 'Không thể kết ca',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'cashflow.compensate.invalidNote',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Ghi chú bù chênh lệch chưa hợp lệ',
    defaultTitle: 'Ghi chú chưa hợp lệ',
    defaultDescription: 'Vui lòng nhập ghi chú bù chênh lệch tối thiểu 3 ký tự.',
  }),
  defineMessage({
    key: 'cashflow.compensate.invalidAmount',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Số tiền bù chưa hợp lệ',
    defaultTitle: 'Số tiền bù chưa hợp lệ',
    defaultDescription: 'Vui lòng nhập số tiền bù lớn hơn 0 đ.',
  }),
  defineMessage({
    key: 'cashflow.compensate.balancedSuccess',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Đã bù chênh lệch kết ca cân bằng về 0 đ',
    defaultTitle: 'Đã bù chênh lệch kết ca',
    defaultDescription: 'Biên bản ngày {settlementDate} đã cân bằng về 0 đ.',
    variables: ['settlementDate'],
  }),
  defineMessage({
    key: 'cashflow.compensate.partialSuccess',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Đã bù một phần chênh lệch kết ca',
    defaultTitle: 'Đã bù chênh lệch kết ca',
    defaultDescription: 'Biên bản ngày {settlementDate} còn lệch {discrepancyFormatted} đ.',
    variables: ['settlementDate', 'discrepancyFormatted'],
  }),
  defineMessage({
    key: 'cashflow.compensate.error',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Không thể bù chênh lệch',
    defaultTitle: 'Không thể bù chênh lệch',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'cashflow.exportExcelSuccess',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Xuất file Excel đối soát kết ca',
    defaultTitle: 'Xuất file Excel thành công',
    defaultDescription: 'Đã xuất {count} biên bản đối soát kết ca.',
    variables: ['count'],
  }),
  defineMessage({
    key: 'cashflow.exportExcelError',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Lỗi xuất file Excel kết ca',
    defaultTitle: 'Không thể xuất file Excel',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'cashflow.budget.invalidAmount',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Ngân sách đầu ngày không hợp lệ',
    defaultTitle: 'Ngân sách không hợp lệ',
    defaultDescription: 'Vui lòng nhập số tiền hợp lệ (>= 0).',
  }),
  defineMessage({
    key: 'cashflow.budget.saveSuccess',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Cập nhật ngân sách đầu ngày thành công',
    defaultTitle: 'Đã cập nhật ngân sách đầu ngày',
    defaultDescription: 'Ngân sách tiền lẻ mặc định đã đổi thành {amountFormatted}.',
    variables: ['amountFormatted'],
  }),
  defineMessage({
    key: 'cashflow.budget.saveError',
    module: 'CASHFLOW',
    kind: 'toast',
    label: 'Không thể lưu ngân sách mặc định',
    defaultTitle: 'Không thể lưu ngân sách mặc định',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'cashflow.confirm.compensate',
    module: 'CASHFLOW',
    kind: 'confirm',
    label: 'Hộp thoại bù chênh lệch tiền kết ca',
    defaultTitle: 'Bù chênh lệch tiền kết ca',
    defaultDescription: 'Biên bản ngày {settlementDate} hiện đang lệch {discrepancyFormatted} đ. Nhập số tiền cần {directionNote} để điều chỉnh chênh lệch.',
    variables: ['settlementDate', 'discrepancyFormatted', 'directionNote'],
  }),

  // =========================================================================
  // 8. EMPLOYEES — Hồ sơ Nhân sự
  // =========================================================================
  defineMessage({
    key: 'employees.form.missingRequired',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Thiếu thông tin bắt buộc khi tạo/sửa nhân viên',
    defaultTitle: 'Vui lòng điền đầy đủ Họ tên, Chức vụ và Chuyên môn',
  }),
  defineMessage({
    key: 'employees.form.createSuccess',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Tạo nhân viên mới thành công',
    defaultTitle: 'Tạo nhân viên thành công',
  }),
  defineMessage({
    key: 'employees.form.updateSuccess',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Cập nhật nhân viên thành công',
    defaultTitle: 'Cập nhật nhân viên thành công',
  }),
  defineMessage({
    key: 'employees.form.createError',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Tạo nhân viên thất bại',
    defaultTitle: 'Tạo nhân viên thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'employees.form.updateError',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Cập nhật nhân viên thất bại',
    defaultTitle: 'Cập nhật thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'employees.delete.permanentSuccess',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Xoá vĩnh viễn nhân sự thành công',
    defaultTitle: 'Đã xoá vĩnh viễn nhân sự',
    defaultDescription: 'Hồ sơ {fullName} đã được xoá hoàn toàn khỏi hệ thống.',
    variables: ['fullName'],
  }),
  defineMessage({
    key: 'employees.delete.permanentError',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Xoá vĩnh viễn nhân sự thất bại',
    defaultTitle: 'Xoá vĩnh viễn nhân sự thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'employees.exportExcelSuccess',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Xuất file Excel nhân sự thành công',
    defaultTitle: 'Xuất file Excel thành công',
    defaultDescription: 'Đã xuất {count} hồ sơ nhân sự.',
    variables: ['count'],
  }),
  defineMessage({
    key: 'employees.exportExcelError',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Lỗi xuất file Excel nhân sự',
    defaultTitle: 'Không thể xuất file Excel',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'employees.status.activateSuccess',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Kích hoạt lại nhân viên thành công',
    defaultTitle: 'Đã kích hoạt nhân viên',
    defaultDescription: '{detail}',
    variables: ['detail'],
  }),
  defineMessage({
    key: 'employees.status.deactivateSuccess',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Tạm ngưng nhân viên thành công',
    defaultTitle: 'Đã tạm ngưng nhân viên',
    defaultDescription: '{detail}',
    variables: ['detail'],
  }),
  defineMessage({
    key: 'employees.status.updateError',
    module: 'EMPLOYEES',
    kind: 'toast',
    label: 'Lỗi cập nhật trạng thái nhân viên',
    defaultTitle: 'Không thể cập nhật trạng thái nhân viên',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'employees.confirm.permanentDelete',
    module: 'EMPLOYEES',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận xoá vĩnh viễn nhân sự',
    defaultTitle: 'Xác nhận xoá vĩnh viễn nhân sự',
    defaultDescription: 'Hồ sơ {fullName}{accountNote} sẽ bị xoá hoàn toàn khỏi hệ thống và không thể khôi phục.',
    variables: ['fullName', 'accountNote'],
  }),
  defineMessage({
    key: 'employees.confirm.toggleStatus',
    module: 'EMPLOYEES',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận kích hoạt / tạm ngưng nhân viên',
    defaultTitle: '{actionTitle}',
    defaultDescription: '{detail}',
    variables: ['actionTitle', 'detail'],
  }),

  // =========================================================================
  // 9. SCHEDULES — Bảng tính Ngày công
  // =========================================================================
  defineMessage({
    key: 'schedules.saveSuccess',
    module: 'SCHEDULES',
    kind: 'toast',
    label: 'Lưu bảng tính ngày công thành công',
    defaultTitle: 'Đã lưu bảng tính ngày công tuần thành công',
  }),
  defineMessage({
    key: 'schedules.saveError',
    module: 'SCHEDULES',
    kind: 'toast',
    label: 'Lưu bảng tính ngày công thất bại',
    defaultTitle: 'Lưu bảng tính ngày công thất bại',
  }),
  defineMessage({
    key: 'schedules.copyWeekSuccess',
    module: 'SCHEDULES',
    kind: 'toast',
    label: 'Sao chép lịch từ tuần trước thành công',
    defaultTitle: 'Đã sao chép lịch từ tuần trước thành công',
  }),
  defineMessage({
    key: 'schedules.copyWeekError',
    module: 'SCHEDULES',
    kind: 'toast',
    label: 'Sao chép lịch thất bại',
    defaultTitle: 'Sao chép lịch thất bại',
  }),
  defineMessage({
    key: 'schedules.exportExcelSuccess',
    module: 'SCHEDULES',
    kind: 'toast',
    label: 'Xuất file Excel bảng tính ngày công',
    defaultTitle: 'Xuất file Excel thành công',
    defaultDescription: 'Đã xuất bảng tính ngày công tuần {weekStartDate} → {weekEndDate}.',
    variables: ['weekStartDate', 'weekEndDate'],
  }),
  defineMessage({
    key: 'schedules.confirm.unsavedChanges',
    module: 'SCHEDULES',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận rời trang khi chưa lưu thay đổi',
    defaultTitle: 'Thay đổi chưa được lưu',
    defaultDescription: 'Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang?',
  }),

  // =========================================================================
  // 10. PAYROLL — Bảng tính Lương
  // =========================================================================
  defineMessage({
    key: 'payroll.config.saveSuccess',
    module: 'PAYROLL',
    kind: 'toast',
    label: 'Lưu cấu hình công thức tính lương thành công',
    defaultTitle: 'Đã cập nhật cấu hình công thức tính lương',
  }),
  defineMessage({
    key: 'payroll.config.saveError',
    module: 'PAYROLL',
    kind: 'toast',
    label: 'Lưu cấu hình tính lương thất bại',
    defaultTitle: 'Lưu cấu hình tính lương thất bại',
  }),
  defineMessage({
    key: 'payroll.employee.updateSuccess',
    module: 'PAYROLL',
    kind: 'toast',
    label: 'Cập nhật bảng lương nhân viên thành công',
    defaultTitle: 'Đã cập nhật bảng lương của {fullName}',
    variables: ['fullName'],
  }),
  defineMessage({
    key: 'payroll.employee.updateError',
    module: 'PAYROLL',
    kind: 'toast',
    label: 'Cập nhật lương nhân viên thất bại',
    defaultTitle: 'Cập nhật lương nhân viên thất bại',
  }),
  defineMessage({
    key: 'payroll.exportExcelSuccess',
    module: 'PAYROLL',
    kind: 'toast',
    label: 'Xuất file Excel bảng tính lương',
    defaultTitle: 'Xuất file Excel thành công',
    defaultDescription: 'Đã xuất bảng tính lương kỳ {fromDate} → {toDate}.',
    variables: ['fromDate', 'toDate'],
  }),

  // =========================================================================
  // 11. MASTER_DATA — Quản trị Master Data
  // =========================================================================
  defineMessage({
    key: 'mdm.missingName',
    module: 'MASTER_DATA',
    kind: 'toast',
    label: 'Thiếu tên danh mục Master Data',
    defaultTitle: 'Vui lòng nhập tên danh mục',
  }),
  defineMessage({
    key: 'mdm.updateSuccess',
    module: 'MASTER_DATA',
    kind: 'toast',
    label: 'Cập nhật danh mục thành công',
    defaultTitle: 'Cập nhật thành công',
  }),
  defineMessage({
    key: 'mdm.createSuccess',
    module: 'MASTER_DATA',
    kind: 'toast',
    label: 'Lưu danh mục Master Data thành công',
    defaultTitle: 'Lưu danh mục thành công',
    defaultDescription: 'Tên đã tồn tại sẽ dùng lại bản ghi đã chuẩn hoá, không tạo trùng.',
  }),
  defineMessage({
    key: 'mdm.saveError',
    module: 'MASTER_DATA',
    kind: 'toast',
    label: 'Lưu danh mục thất bại',
    defaultTitle: 'Thao tác thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'mdm.deleteSuccess',
    module: 'MASTER_DATA',
    kind: 'toast',
    label: 'Xoá danh mục thành công',
    defaultTitle: 'Đã xoá danh mục',
  }),
  defineMessage({
    key: 'mdm.deleteError',
    module: 'MASTER_DATA',
    kind: 'toast',
    label: 'Xoá danh mục thất bại',
    defaultTitle: 'Xoá thất bại',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'mdm.confirm.delete',
    module: 'MASTER_DATA',
    kind: 'confirm',
    label: 'Hộp thoại xác nhận xoá danh mục Master Data',
    defaultTitle: 'Xác nhận xoá danh mục',
    defaultDescription:
      'Danh mục chưa có dữ liệu liên kết sẽ bị xoá vĩnh viễn. Nếu chỉ muốn tạm ngưng sử dụng, hãy bấm vào cột Trạng thái để chuyển sang Ngưng.',
  }),

  // =========================================================================
  // 12. RBAC — Phân quyền Hệ thống
  // =========================================================================
  defineMessage({
    key: 'rbac.user.createSuccess',
    module: 'RBAC',
    kind: 'toast',
    label: 'Cấp tài khoản đăng nhập mới thành công',
    defaultTitle: 'Đã cấp tài khoản đăng nhập mới',
    defaultDescription: 'Tài khoản "{username}" đã được kích hoạt.',
    variables: ['username'],
  }),
  defineMessage({
    key: 'rbac.permissions.updateSuccess',
    module: 'RBAC',
    kind: 'toast',
    label: 'Cập nhật phân quyền thành công',
    defaultTitle: 'Cập nhật phân quyền thành công',
  }),
  defineMessage({
    key: 'rbac.permissions.updateError',
    module: 'RBAC',
    kind: 'toast',
    label: 'Cập nhật phân quyền thất bại',
    defaultTitle: 'Cập nhật phân quyền thất bại',
  }),
  defineMessage({
    key: 'rbac.password.tooShort',
    module: 'RBAC',
    kind: 'toast',
    label: 'Mật khẩu đặt lại dưới 6 ký tự',
    defaultTitle: 'Mật khẩu mới phải từ 6 ký tự trở lên',
  }),
  defineMessage({
    key: 'rbac.password.mismatch',
    module: 'RBAC',
    kind: 'toast',
    label: 'Xác nhận mật khẩu chưa khớp',
    defaultTitle: 'Xác nhận mật khẩu chưa khớp',
  }),
  defineMessage({
    key: 'rbac.password.resetSuccess',
    module: 'RBAC',
    kind: 'toast',
    label: 'Đặt lại mật khẩu thành công',
    defaultTitle: 'Đã đặt lại mật khẩu cho @{username}',
    variables: ['username'],
  }),
  defineMessage({
    key: 'rbac.password.resetError',
    module: 'RBAC',
    kind: 'toast',
    label: 'Đặt lại mật khẩu thất bại',
    defaultTitle: 'Không thể đặt lại mật khẩu tài khoản',
  }),
  defineMessage({
    key: 'rbac.session.revokeSuccess',
    module: 'RBAC',
    kind: 'toast',
    label: 'Đăng xuất từ xa thành công',
    defaultTitle: 'Đã thu hồi phiên đăng nhập của @{username}',
    defaultDescription: 'Tài khoản đã bị đăng xuất khỏi thiết bị đang hoạt động.',
    variables: ['username'],
  }),
  defineMessage({
    key: 'rbac.session.revokeError',
    module: 'RBAC',
    kind: 'toast',
    label: 'Đăng xuất từ xa thất bại',
    defaultTitle: 'Không thể thu hồi phiên đăng nhập',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),

  // =========================================================================
  // 13. PROFILE — Đăng nhập & Hồ sơ cá nhân
  // =========================================================================
  defineMessage({
    key: 'profile.loginSuccess',
    module: 'PROFILE',
    kind: 'toast',
    label: 'Đăng nhập hệ thống thành công',
    defaultTitle: 'Đăng nhập thành công',
    defaultDescription: 'Xin chào @{username}',
    variables: ['username'],
  }),
  defineMessage({
    key: 'profile.saveSuccess',
    module: 'PROFILE',
    kind: 'toast',
    label: 'Lưu hồ sơ cá nhân thành công',
    defaultTitle: 'Đã lưu hồ sơ cá nhân',
    defaultDescription: 'Thông tin hồ sơ nhân sự đã được lưu và đồng bộ thành công.',
  }),
  defineMessage({
    key: 'profile.changePasswordSuccess',
    module: 'PROFILE',
    kind: 'toast',
    label: 'Đổi mật khẩu cá nhân thành công',
    defaultTitle: 'Đã đổi mật khẩu',
    defaultDescription: 'Mật khẩu mới đã được lưu an toàn và phiên làm việc hiện tại vẫn được giữ nguyên.',
  }),
  defineMessage({
    key: 'profile.avatarUploadSuccess',
    module: 'PROFILE',
    kind: 'toast',
    label: 'Cập nhật ảnh đại diện cá nhân thành công',
    defaultTitle: 'Đã cập nhật ảnh đại diện',
    defaultDescription: 'Ảnh đại diện mới đã được đồng bộ lên thanh điều hướng và hồ sơ nhân sự.',
  }),
  defineMessage({
    key: 'profile.avatarRemoveSuccess',
    module: 'PROFILE',
    kind: 'toast',
    label: 'Xoá ảnh đại diện cá nhân thành công',
    defaultTitle: 'Đã xoá ảnh đại diện',
    defaultDescription: 'Ảnh đại diện đã được đưa về chữ cái viết tắt mặc định.',
  }),

  // =========================================================================
  // 14. SETTINGS — Cài đặt Cửa hàng
  // =========================================================================
  defineMessage({
    key: 'settings.saveSuccess',
    module: 'SETTINGS',
    kind: 'toast',
    label: 'Lưu cấu hình cửa hàng thành công',
    defaultTitle: 'Đã lưu cấu hình cửa hàng',
    defaultDescription: 'Thay đổi giao diện và thương hiệu đã được áp dụng đồng bộ.',
  }),
  defineMessage({
    key: 'settings.asset.uploadSuccess',
    module: 'SETTINGS',
    kind: 'toast',
    label: 'Cập nhật hình ảnh thương hiệu thành công',
    defaultTitle: 'Đã cập nhật hình ảnh',
  }),
  defineMessage({
    key: 'settings.asset.deleteSuccess',
    module: 'SETTINGS',
    kind: 'toast',
    label: 'Xoá hình ảnh thương hiệu thành công',
    defaultTitle: 'Đã xoá hình ảnh',
  }),
  defineMessage({
    key: 'settings.saveError',
    module: 'SETTINGS',
    kind: 'toast',
    label: 'Lưu cấu hình cửa hàng thất bại',
    defaultTitle: 'Không thể lưu cấu hình',
    defaultDescription: '{reason}',
    variables: ['reason'],
  }),
  defineMessage({
    key: 'settings.refreshSuccess',
    module: 'SETTINGS',
    kind: 'toast',
    label: 'Tải lại cấu hình mới nhất thành công',
    defaultTitle: 'Đã tải lại cấu hình mới nhất',
  }),
  defineMessage({
    key: 'dashboard.exportExcelSuccess',
    module: 'SETTINGS',
    kind: 'toast',
    label: 'Xuất file Excel báo cáo Tổng quan thành công',
    defaultTitle: 'Đã xuất file Excel báo cáo Tổng quan.',
  }),

  // =========================================================================
  // 15. SYSTEM_ERROR — Toàn bộ 35 Mã lỗi API (ErrorCodes)
  // =========================================================================
  defineMessage({
    key: `error.${ErrorCodes.AUTH_TOKEN_MISSING}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Thiếu token đăng nhập (AUTH_TOKEN_MISSING)',
    defaultTitle: 'Yêu cầu đăng nhập để truy cập tài nguyên',
  }),
  defineMessage({
    key: `error.${ErrorCodes.AUTH_TOKEN_EXPIRED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Phiên đăng nhập hết hạn (AUTH_TOKEN_EXPIRED)',
    defaultTitle: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
  }),
  defineMessage({
    key: `error.${ErrorCodes.AUTH_TOKEN_INVALID}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Token đăng nhập không hợp lệ (AUTH_TOKEN_INVALID)',
    defaultTitle: 'Phiên đăng nhập không hợp lệ',
  }),
  defineMessage({
    key: `error.${ErrorCodes.AUTH_CREDENTIALS_INVALID}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Sai tài khoản hoặc mật khẩu (AUTH_CREDENTIALS_INVALID)',
    defaultTitle: 'Tên đăng nhập hoặc mật khẩu không chính xác',
  }),
  defineMessage({
    key: `error.${ErrorCodes.AUTH_SESSION_REPLACED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Phiên bị thay thế do đăng nhập máy khác (AUTH_SESSION_REPLACED)',
    defaultTitle: 'Tài khoản đã đăng nhập trên thiết bị khác',
    defaultDescription: 'Phiên làm việc trên máy này đã tự động kết thúc để đảm bảo mỗi tài khoản chỉ dùng trên 1 thiết bị.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.AUTH_SESSION_REVOKED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Phiên đăng nhập bị thu hồi từ xa (AUTH_SESSION_REVOKED)',
    defaultTitle: 'Phiên đăng nhập đã bị thu hồi',
    defaultDescription: 'Quản trị viên đã thu hồi phiên, đặt lại mật khẩu hoặc tạm khoá tài khoản này.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.AUTH_SESSION_CONFLICT_ONLINE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Xung đột phiên đăng nhập đang trực tuyến (AUTH_SESSION_CONFLICT_ONLINE)',
    defaultTitle: 'Tài khoản đang hoạt động ở trình duyệt hoặc thiết bị khác',
    defaultDescription: 'Xác nhận nếu bạn muốn đăng xuất phiên kia để tiếp tục đăng nhập trên thiết bị này.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.RBAC_PERMISSION_DENIED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Không đủ quyền truy cập 403 (RBAC_PERMISSION_DENIED)',
    defaultTitle: 'Không đủ quyền truy cập (403)',
    defaultDescription: 'Bạn không có quyền thực hiện thao tác này',
  }),
  defineMessage({
    key: `error.${ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Yêu cầu quyền Super Admin (RBAC_SUPER_ADMIN_REQUIRED)',
    defaultTitle: 'Yêu cầu quyền Super Admin (403)',
    defaultDescription: 'Chỉ Super Admin mới được thực hiện thao tác này',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_TABLE_NOT_AVAILABLE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Bàn đích không còn trống (POS_TABLE_NOT_AVAILABLE)',
    defaultTitle: 'Bàn đích hiện không trống',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_TABLE_NOT_OCCUPIED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Bàn đích chưa có khách (POS_TABLE_NOT_OCCUPIED)',
    defaultTitle: 'Bàn đích chưa có khách hoặc chưa có đơn đang mở',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_ORDER_NOT_ACTIVE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Đơn hàng không còn mở (POS_ORDER_NOT_ACTIVE)',
    defaultTitle: 'Đơn hàng không còn mở để thao tác',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_NO_NEW_ITEMS_TO_SPLIT}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Không có món mới để tách bếp (POS_NO_NEW_ITEMS_TO_SPLIT)',
    defaultTitle: 'Không có món mới nào cần tách xuống bếp',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_TAKEAWAY_CANNOT_MERGE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Không thể gộp đơn mang về (POS_TAKEAWAY_CANNOT_MERGE)',
    defaultTitle: 'Không thể gộp đơn mang về',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_CONCURRENT_MODIFICATION}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Xung đột cập nhật sơ đồ bàn (POS_CONCURRENT_MODIFICATION)',
    defaultTitle: 'Đơn hoặc bàn vừa thay đổi bởi nhân viên khác, vui lòng tải lại sơ đồ bàn',
  }),
  defineMessage({
    key: `error.${ErrorCodes.CASHFLOW_ALREADY_SETTLED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Ca làm việc đã được kết ca (CASHFLOW_ALREADY_SETTLED)',
    defaultTitle: 'Ca làm việc này đã được kết ca',
  }),
  defineMessage({
    key: `error.${ErrorCodes.CASHFLOW_BUDGET_NOT_SET}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Chưa cấu hình ngân sách đầu ca (CASHFLOW_BUDGET_NOT_SET)',
    defaultTitle: 'Chưa cấu hình ngân sách tiền lẻ đầu ca',
  }),
  defineMessage({
    key: `error.${ErrorCodes.CASHFLOW_DISCREPANCY_NOTE_REQUIRED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Thiếu ghi chú giải trình lệch két (CASHFLOW_DISCREPANCY_NOTE_REQUIRED)',
    defaultTitle: 'Vui lòng nhập ghi chú giải trình khi tiền thực đếm chênh lệch với tiền lý thuyết',
  }),
  defineMessage({
    key: `error.${ErrorCodes.INVENTORY_ALREADY_DELETED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Phiếu nhập hàng đã bị xoá (INVENTORY_ALREADY_DELETED)',
    defaultTitle: 'Phiếu nhập hàng đã được xoá, không thể thao tác',
  }),
  defineMessage({
    key: `error.${ErrorCodes.INVENTORY_PAST_SHIFT_FORBIDDEN}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Không được xoá phiếu nhập ngày trước (INVENTORY_PAST_SHIFT_FORBIDDEN)',
    defaultTitle: 'Chỉ Quản lý hoặc Super Admin được xoá phiếu nhập của ngày trước',
  }),
  defineMessage({
    key: `error.${ErrorCodes.MDM_NAME_TAKEN}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Tên danh mục Master Data đã tồn tại (MDM_NAME_TAKEN)',
    defaultTitle: 'Tên danh mục đã tồn tại',
  }),
  defineMessage({
    key: `error.${ErrorCodes.HR_CITIZEN_ID_DUPLICATE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Số CCCD đã được sử dụng (HR_CITIZEN_ID_DUPLICATE)',
    defaultTitle: 'Số CCCD đã được sử dụng',
  }),
  defineMessage({
    key: `error.${ErrorCodes.HR_USERNAME_TAKEN}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Tên đăng nhập đã tồn tại (HR_USERNAME_TAKEN)',
    defaultTitle: 'Tên đăng nhập đã được sử dụng',
  }),
  defineMessage({
    key: `error.${ErrorCodes.HR_EMPLOYEE_DELETED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Nhân viên không tồn tại hoặc đã xoá (HR_EMPLOYEE_DELETED)',
    defaultTitle: 'Nhân viên đã được xoá hoặc không còn hoạt động',
  }),
  defineMessage({
    key: `error.${ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Nhân viên đã có tài khoản đăng nhập (HR_EMPLOYEE_ACCOUNT_EXISTS)',
    defaultTitle: 'Nhân viên đã có tài khoản đăng nhập',
  }),
  defineMessage({
    key: `error.${ErrorCodes.VALIDATION_FAILED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Dữ liệu gửi lên không hợp lệ (VALIDATION_FAILED)',
    defaultTitle: 'Dữ liệu không hợp lệ',
  }),
  defineMessage({
    key: `error.${ErrorCodes.QR_WIFI_REQUIRED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Yêu cầu kết nối Wi-Fi quán để quét QR (QR_WIFI_REQUIRED)',
    defaultTitle: 'Vui lòng kết nối mạng Wi-Fi của quán để quét mã và gọi món tại bàn.',
    variables: ['wifiSsid'],
  }),
  defineMessage({
    key: `error.${ErrorCodes.QR_GEO_REQUIRED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Yêu cầu bật GPS tại quán để quét QR (QR_GEO_REQUIRED)',
    defaultTitle: 'Vui lòng xác nhận vị trí GPS tại quán để mở thực đơn và đặt món.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.QR_GEO_OUT_OF_RANGE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Khách đứng ngoài bán kính GPS của quán (QR_GEO_OUT_OF_RANGE)',
    defaultTitle: 'Bạn đang ở cách quán khoảng {distanceMeters}m (vượt quá bán kính an toàn {geoRadiusMeters}m). Chỉ khách đang có mặt tại quán mới có thể quét mã gọi món.',
    variables: ['distanceMeters', 'geoRadiusMeters'],
  }),
  defineMessage({
    key: `error.${ErrorCodes.PAYMENT_QR_NOT_CONFIGURED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Chưa cấu hình mã QR thanh toán (PAYMENT_QR_NOT_CONFIGURED)',
    defaultTitle: 'Chưa có mã QR thanh toán nào đang bật. Vui lòng bật hoặc thêm mã QR trong trang Mã QR thanh toán.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.PAYMENT_QR_LOCKED_FIELD}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Khoá sửa Ngân hàng / STK mã QR đã gắn hoá đơn (PAYMENT_QR_LOCKED_FIELD)',
    defaultTitle: 'Không thể đổi Ngân hàng hoặc Số tài khoản của mã QR đã có hoá đơn gắn kết',
  }),
  defineMessage({
    key: `error.${ErrorCodes.PAYMENT_QR_IN_USE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Mã QR đã phát sinh hoá đơn không thể xoá cứng (PAYMENT_QR_IN_USE)',
    defaultTitle: 'Mã QR đã có lịch sử hoá đơn nên không thể xoá cứng. Vui lòng giữ ở trạng thái Đang tắt.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.PAYMENT_QR_CANNOT_DELETE_ACTIVE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Không thể xoá mã QR đang bật (PAYMENT_QR_CANNOT_DELETE_ACTIVE)',
    defaultTitle: 'Mã QR đang ở trạng thái bật. Vui lòng chuyển sang Đang tắt trước khi xoá.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.PAYMENT_QR_LAST_ACTIVE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Phải giữ lại ít nhất 1 mã QR đang bật (PAYMENT_QR_LAST_ACTIVE)',
    defaultTitle: 'Hệ thống phải giữ lại ít nhất 1 mã QR đang bật để thu ngân in phiếu tạm tính.',
  }),
  defineMessage({
    key: `error.${ErrorCodes.PAYMENT_QR_DUPLICATE_ACCOUNT}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Tài khoản ngân hàng VietQR đã tồn tại (PAYMENT_QR_DUPLICATE_ACCOUNT)',
    defaultTitle: 'Tài khoản ngân hàng và số tài khoản này đã tồn tại',
  }),
  defineMessage({
    key: `error.${ErrorCodes.STORE_ASSET_INVALID_TYPE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Định dạng ảnh cửa hàng không hợp lệ (STORE_ASSET_INVALID_TYPE)',
    defaultTitle: 'Định dạng ảnh không được hỗ trợ (chỉ nhận PNG, JPEG hoặc WebP)',
  }),
  defineMessage({
    key: `error.${ErrorCodes.STORE_ASSET_TOO_LARGE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Ảnh cửa hàng vượt quá dung lượng tối đa (STORE_ASSET_TOO_LARGE)',
    defaultTitle: 'Dung lượng ảnh vượt quá giới hạn cho phép',
  }),
  defineMessage({
    key: `error.${ErrorCodes.STORE_SETTINGS_CONFLICT}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Xung đột đồng thời khi lưu cài đặt (STORE_SETTINGS_CONFLICT)',
    defaultTitle: 'Cấu hình đã bị người khác thay đổi, vui lòng tải lại trước khi lưu',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_NOT_FOUND}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Không tìm thấy mã giảm giá (DISCOUNT_NOT_FOUND)',
    defaultTitle: 'Mã giảm giá không tồn tại hoặc không hợp lệ',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_INACTIVE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Mã giảm giá đang tắt (DISCOUNT_INACTIVE)',
    defaultTitle: 'Mã giảm giá đang bị tạm ngưng hoặc đã lưu trữ',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_EXPIRED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Mã giảm giá hết hạn (DISCOUNT_EXPIRED)',
    defaultTitle: 'Mã giảm giá đã hết hạn sử dụng',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_NOT_STARTED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Mã giảm giá chưa đến giờ mở (DISCOUNT_NOT_STARTED)',
    defaultTitle: 'Mã giảm giá chưa đến thời gian bắt đầu áp dụng',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_OUT_OF_TIME_WINDOW}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Ngoài khung giờ / thứ áp dụng mã (DISCOUNT_OUT_OF_TIME_WINDOW)',
    defaultTitle: 'Hiện tại nằm ngoài khung giờ hoặc ngày áp dụng của mã giảm giá',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_USAGE_EXHAUSTED}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Mã giảm giá hết lượt (DISCOUNT_USAGE_EXHAUSTED)',
    defaultTitle: 'Mã giảm giá đã hết lượt sử dụng',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_NOT_APPLICABLE}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Đơn chưa đạt điều kiện áp mã (DISCOUNT_NOT_APPLICABLE)',
    defaultTitle: 'Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá',
  }),
  defineMessage({
    key: `error.${ErrorCodes.DISCOUNT_LOCKED_FIELDS}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Khoá trường giá trị/phạm vi mã đã sử dụng (DISCOUNT_LOCKED_FIELDS)',
    defaultTitle: 'Mã đã có lượt sử dụng nên không thể sửa giá trị, phạm vi hoặc điều kiện tối thiểu',
  }),
  defineMessage({
    key: `error.${ErrorCodes.POS_DISCOUNT_BLOCKS_SPLIT}`,
    module: 'SYSTEM_ERROR',
    kind: 'error',
    label: 'Chặn tách thanh toán khi đơn đang gắn giảm giá (POS_DISCOUNT_BLOCKS_SPLIT)',
    defaultTitle: 'Đơn đang áp dụng giảm giá, vui lòng gỡ mã giảm giá trước khi tách thanh toán',
  }),
  ...HTTP_ERROR_CATALOG.map((httpItem) =>
    defineMessage({
      key: httpItem.messageKey,
      module: 'SYSTEM_ERROR',
      kind: 'error',
      label: `Màn hình / Lỗi hệ thống: ${httpItem.statusLabel}`,
      defaultTitle: httpItem.defaultTitle,
      defaultDescription: httpItem.defaultDescription,
      variables: httpItem.key === '429' ? ['retryAfterSeconds'] : [],
      maxTitleLength: 180,
      maxDescriptionLength: 450,
    }),
  ),
] as const;

export const MESSAGE_CATALOG_BY_KEY: ReadonlyMap<string, MessageCatalogItem> = new Map(
  MESSAGE_CATALOG.map((item) => [item.key, item]),
);

const QR_ERROR_KEYS = new Set<string>([
  `error.${ErrorCodes.QR_WIFI_REQUIRED}`,
  `error.${ErrorCodes.QR_GEO_REQUIRED}`,
  `error.${ErrorCodes.QR_GEO_OUT_OF_RANGE}`,
]);

export const TOTAL_ERROR_CODE_COUNT: number = Object.keys(ErrorCodes).length;

export function isValidMessageKey(key: string): boolean {
  return MESSAGE_CATALOG_BY_KEY.has(key);
}

/**
 * Extracts all `{token}` names inside a template string in encounter order.
 */
export function extractPlaceholders(template: string): string[] {
  const matches: string[] = [];
  const pattern = /\{([^}]*)\}/g;
  let match: RegExpExecArray | null = pattern.exec(template);
  while (match !== null) {
    matches.push(match[1]);
    match = pattern.exec(template);
  }
  return matches;
}

export interface MessageValidationIssue {
  key: string;
  field?: 'title' | 'description';
  message: string;
}

/**
 * Validates one override entry against its catalog definition and allowed `{var}` placeholders.
 */
export function validateMessagePlaceholders(
  key: string,
  override: StoreMessageOverride,
): MessageValidationIssue[] {
  const item = MESSAGE_CATALOG_BY_KEY.get(key);
  if (!item) {
    return [{ key, message: `Mã thông báo "${key}" không tồn tại trong hệ thống` }];
  }

  const issues: MessageValidationIssue[] = [];
  const allowed = new Set(item.variables);

  const checkField = (field: 'title' | 'description', rawValue: string | undefined, maxLen: number) => {
    if (typeof rawValue !== 'string') return;
    const trimmed = rawValue.trim();
    if (trimmed.length > maxLen) {
      issues.push({
        key,
        field,
        message: `${item.label}: nội dung vượt quá tối đa ${maxLen} ký tự`,
      });
    }
    const placeholders = extractPlaceholders(trimmed);
    const invalidTokens = placeholders.filter((token) => token.length === 0 || !allowed.has(token));
    if (invalidTokens.length > 0) {
      const formattedInvalid = invalidTokens.map((t) => `{${t}}`).join(', ');
      const allowedList =
        item.variables.length > 0
          ? item.variables.map((v) => `{${v}}`).join(', ')
          : 'không có biến nào';
      issues.push({
        key,
        field,
        message: `${item.label}: biến ${formattedInvalid} không hợp lệ (biến cho phép: ${allowedList})`,
      });
    }
  };

  checkField('title', override.title, item.maxTitleLength);
  if (override.description !== undefined) {
    checkField('description', override.description, item.maxDescriptionLength ?? 500);
  }

  return issues;
}

export function validateStoreMessagesMap(messages: StoreMessagesMap | undefined | null): MessageValidationIssue[] {
  if (!messages) return [];
  const allIssues: MessageValidationIssue[] = [];
  for (const [key, override] of Object.entries(messages)) {
    if (!override) continue;
    allIssues.push(...validateMessagePlaceholders(key, override));
  }
  return allIssues;
}

export type MessageVars = Record<string, string | number | null | undefined>;

/**
 * Replaces `{var}` placeholders with values from `vars`; missing keys resolve to `""`.
 */
export function interpolateMessageTemplate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, token: string) => {
    const val = vars[token];
    return val === undefined || val === null ? '' : String(val);
  });
}

export interface ResolvedStoreMessage {
  title: string;
  description?: string;
  isOverridden: boolean;
}

/**
 * Resolves a message key against store overrides, falling back to `MESSAGE_CATALOG` defaults,
 * and interpolates `{var}` placeholders safely as plain text.
 */
export function resolveStoreMessage(
  overrides: StoreMessagesMap | undefined | null,
  key: string,
  vars?: MessageVars,
): ResolvedStoreMessage {
  const item = MESSAGE_CATALOG_BY_KEY.get(key);
  const override = overrides?.[key];
  if (!item) {
    const fallbackTitle = override?.title?.trim() || key;
    const fallbackDesc = override?.description?.trim();
    return {
      title: interpolateMessageTemplate(fallbackTitle, vars),
      ...(fallbackDesc ? { description: interpolateMessageTemplate(fallbackDesc, vars) } : {}),
      isOverridden: Boolean(override),
    };
  }

  const trimmedTitle = override?.title?.trim();
  const titleTemplate = trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : item.defaultTitle;

  const trimmedDesc = override?.description?.trim();
  const descTemplate =
    item.defaultDescription !== undefined
      ? trimmedDesc && trimmedDesc.length > 0
        ? trimmedDesc
        : item.defaultDescription
      : trimmedDesc && trimmedDesc.length > 0
        ? trimmedDesc
        : undefined;

  return {
    title: interpolateMessageTemplate(titleTemplate, vars),
    ...(descTemplate !== undefined ? { description: interpolateMessageTemplate(descTemplate, vars) } : {}),
    isOverridden: Boolean(
      (trimmedTitle && trimmedTitle !== item.defaultTitle) ||
        (trimmedDesc && trimmedDesc !== (item.defaultDescription ?? '')),
    ),
  };
}

/**
 * Strips empty, unknown, or equal-to-default entries so DB storage stays strictly sparse.
 */
export function sanitizeStoreMessages(
  messages: Record<string, StoreMessageOverride | undefined> | undefined | null,
): StoreMessagesMap {
  if (!messages) return {};
  const sparse: StoreMessagesMap = {};
  for (const [key, raw] of Object.entries(messages)) {
    const item = MESSAGE_CATALOG_BY_KEY.get(key);
    if (!item || !raw) continue;
    const cleaned: StoreMessageOverride = {};
    const trimmedTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (trimmedTitle.length > 0 && trimmedTitle !== item.defaultTitle) {
      cleaned.title = trimmedTitle;
    }
    const trimmedDesc = typeof raw.description === 'string' ? raw.description.trim() : '';
    if (
      item.defaultDescription !== undefined &&
      trimmedDesc.length > 0 &&
      trimmedDesc !== item.defaultDescription
    ) {
      cleaned.description = trimmedDesc;
    }
    if (cleaned.title !== undefined || cleaned.description !== undefined) {
      sparse[key] = cleaned;
    }
  }
  return sparse;
}

/**
 * Extracts only QR-customer-facing and QR-security-error overrides for public guest endpoints.
 */
export function extractQrMessages(
  messages: StoreMessagesMap | undefined | null,
): StoreMessagesMap {
  if (!messages) return {};
  const qrOnly: StoreMessagesMap = {};
  for (const [key, override] of Object.entries(messages)) {
    const item = MESSAGE_CATALOG_BY_KEY.get(key);
    if (!item || !override) continue;
    if (item.module === 'QR_CUSTOMER' || QR_ERROR_KEYS.has(key)) {
      qrOnly[key] = { ...override };
    }
  }
  return qrOnly;
}

export function resolveErrorCodeMessage(
  overrides: StoreMessagesMap | undefined | null,
  code: ErrorCode | string | undefined,
  fallbackServerMessage: string,
  vars?: MessageVars,
): ResolvedStoreMessage {
  const key = code ? `error.${code}` : '';
  const override = key ? overrides?.[key] : undefined;
  const hasCustomOverride = Boolean(
    override &&
      ((override.title && override.title.trim().length > 0) ||
        (override.description && override.description.trim().length > 0)),
  );
  if (key && MESSAGE_CATALOG_BY_KEY.has(key) && hasCustomOverride) {
    return resolveStoreMessage(overrides, key, vars);
  }
  if (key && MESSAGE_CATALOG_BY_KEY.has(key)) {
    const catalogItem = MESSAGE_CATALOG_BY_KEY.get(key)!;
    // Keep server contextual message if no override was saved, while preserving title+description split on 403 defaults
    if (catalogItem.defaultDescription !== undefined) {
      return {
        title: catalogItem.defaultTitle,
        description: fallbackServerMessage.trim().length > 0
          ? fallbackServerMessage
          : interpolateMessageTemplate(catalogItem.defaultDescription, vars),
        isOverridden: false,
      };
    }
    if (fallbackServerMessage.trim().length > 0) {
      return {
        title: fallbackServerMessage,
        isOverridden: false,
      };
    }
    return resolveStoreMessage(overrides, key, vars);
  }
  return {
    title: fallbackServerMessage,
    isOverridden: false,
  };
}
