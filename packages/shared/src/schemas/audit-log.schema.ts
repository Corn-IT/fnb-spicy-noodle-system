import { z } from 'zod';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema, PaginationFields } from './common.schema';

export const AuditModuleValues = [
  'POS',
  'DISCOUNTS',
  'MENU',
  'INVOICES',
  'INVENTORY',
  'CASHFLOW',
  'EMPLOYEES',
  'SCHEDULES',
  'PAYROLL',
  'MDM',
  'RBAC',
  'PAYMENT_QR',
  'SETTINGS',
] as const;

export const AuditModuleSchema = z.enum(AuditModuleValues);
export type AuditModule = z.infer<typeof AuditModuleSchema>;

export interface AuditModuleActionOption {
  value: string;
  label: string;
}

export interface AuditModuleConfig {
  title: string;
  subtitle: string;
  moduleLabel: string;
  actions: readonly AuditModuleActionOption[];
}

export const AUDIT_MODULE_CONFIG: Record<AuditModule, AuditModuleConfig> = {
  POS: {
    title: 'Lịch sử Sơ đồ bàn & Đặt món',
    subtitle: 'Chỉ hiển thị các thao tác tạo đơn, duyệt QR, báo bếp, chuyển/gộp bàn và thanh toán tại quầy.',
    moduleLabel: 'Sơ đồ bàn & Đặt món',
    actions: [
      { value: 'Tạo đơn tại bàn,Tạo đơn mang về', label: 'Tạo đơn' },
      { value: 'Duyệt đơn QR,Từ chối đơn QR', label: 'Duyệt / Từ chối QR' },
      { value: 'Tách phiếu bếp', label: 'Báo bếp' },
      { value: 'Chuyển bàn,Gộp bàn,Đổi bàn', label: 'Chuyển / Gộp / Đổi bàn' },
      { value: 'Điều chỉnh món', label: 'Điều chỉnh món' },
      { value: 'Áp mã giảm giá,Áp giảm giá tay,Gỡ giảm giá', label: 'Giảm giá trên đơn' },
      { value: 'Huỷ đơn,Tự động huỷ đơn QR,Tự động huỷ món QR', label: 'Huỷ đơn (POS & Tự động QR)' },
      { value: 'Thanh toán đơn,Tách thanh toán', label: 'Thanh toán' },
      { value: 'Thêm bàn,Đổi tên bàn,Xoá bàn,Đổi mã QR bàn', label: 'Quản lý bàn' },
    ],
  },
  DISCOUNTS: {
    title: 'Lịch sử Quản lý Mã giảm giá',
    subtitle: 'Theo dõi thao tác tạo mới, cập nhật, bật/tắt và xoá/lưu trữ chương trình giảm giá.',
    moduleLabel: 'Quản lý Mã giảm giá',
    actions: [
      { value: 'Tạo mã giảm giá', label: 'Tạo mã giảm giá' },
      { value: 'Cập nhật mã giảm giá', label: 'Cập nhật mã giảm giá' },
      { value: 'Bật mã giảm giá,Tắt mã giảm giá', label: 'Bật / Tắt mã' },
      { value: 'Xoá mã giảm giá,Lưu trữ mã giảm giá', label: 'Xoá / Lưu trữ mã' },
    ],
  },
  MENU: {
    title: 'Lịch sử Thực đơn & Món ăn',
    subtitle: 'Theo dõi riêng thao tác thêm/sửa/xoá món ăn, tạm hết topping, nhập Excel, khu vực bếp và danh mục con.',
    moduleLabel: 'Thực đơn & Món ăn',
    actions: [
      { value: 'Thêm món ăn', label: 'Thêm món' },
      { value: 'Cập nhật món ăn', label: 'Cập nhật món / topping' },
      { value: 'Xoá món ăn', label: 'Xoá món' },
      { value: 'Nhập file Excel', label: 'Nhập file Excel' },
      { value: 'Thêm khu vực bếp,Cập nhật khu vực bếp,Xoá khu vực bếp', label: 'Khu vực bếp' },
      { value: 'Thêm danh mục món,Cập nhật danh mục món,Xoá danh mục món', label: 'Danh mục món' },
    ],
  },
  INVOICES: {
    title: 'Lịch sử Hoá đơn & Doanh thu',
    subtitle: 'Theo dõi riêng yêu cầu chỉnh sửa phương thức thanh toán, phê duyệt, từ chối và in lại hoá đơn.',
    moduleLabel: 'Hoá đơn & Doanh thu',
    actions: [
      { value: 'Gửi duyệt sửa PTTT', label: 'Gửi duyệt sửa PTTT' },
      { value: 'Sửa & duyệt PTTT,Duyệt sửa PTTT', label: 'Duyệt sửa PTTT' },
      { value: 'Từ chối sửa PTTT', label: 'Từ chối sửa PTTT' },
      { value: 'In lại hoá đơn', label: 'In lại hoá đơn' },
      { value: 'Huỷ hoá đơn', label: 'Huỷ hoá đơn' },
    ],
  },
  INVENTORY: {
    title: 'Lịch sử Nhập hàng & Tồn kho',
    subtitle: 'Theo dõi riêng thao tác tạo, chỉnh sửa và huỷ phiếu nhập nguyên liệu theo nguồn tiền két hoặc quỹ ngoài.',
    moduleLabel: 'Nhập hàng & Tồn kho',
    actions: [
      { value: 'Tạo phiếu nhập kho', label: 'Tạo phiếu nhập' },
      { value: 'Chỉnh sửa phiếu nhập kho', label: 'Sửa phiếu nhập' },
      { value: 'Huỷ phiếu nhập kho', label: 'Huỷ phiếu nhập' },
    ],
  },
  CASHFLOW: {
    title: 'Lịch sử Kết ca & Dòng tiền',
    subtitle: 'Theo dõi riêng thao tác chốt ca tiền mặt, bù tiền chênh lệch và cấu hình ngân sách đầu ca.',
    moduleLabel: 'Kết ca & Dòng tiền',
    actions: [
      { value: 'Chốt ca tiền mặt', label: 'Chốt ca' },
      { value: 'Bù chênh lệch kết ca', label: 'Bù chênh lệch' },
      { value: 'Cấu hình ngân sách', label: 'Ngân sách đầu ca' },
    ],
  },
  EMPLOYEES: {
    title: 'Lịch sử Quản lý Nhân sự',
    subtitle: 'Theo dõi riêng thao tác thêm mới, cập nhật hồ sơ, ngưng hoạt động, khôi phục hoặc xoá nhân sự.',
    moduleLabel: 'Quản lý Nhân sự',
    actions: [
      { value: 'Thêm nhân sự', label: 'Thêm nhân sự' },
      { value: 'Cập nhật hồ sơ', label: 'Cập nhật hồ sơ' },
      { value: 'Ngưng hoạt động,Khôi phục nhân sự', label: 'Đổi trạng thái' },
      { value: 'Xoá hồ sơ nhân sự', label: 'Xoá hồ sơ' },
    ],
  },
  SCHEDULES: {
    title: 'Lịch sử Bảng tính ngày công',
    subtitle: 'Theo dõi riêng thao tác chấm ngày công, xếp ca làm việc theo tuần và sao chép lịch từ tuần trước.',
    moduleLabel: 'Bảng tính ngày công',
    actions: [
      { value: 'Lưu lịch tuần', label: 'Lưu bảng công tuần' },
      { value: 'Sao chép lịch tuần', label: 'Sao chép tuần trước' },
    ],
  },
  PAYROLL: {
    title: 'Lịch sử Bảng tính lương',
    subtitle: 'Theo dõi riêng thao tác thay đổi cấu hình công thức tính lương và chỉnh sửa công/lương từng nhân viên.',
    moduleLabel: 'Bảng tính lương',
    actions: [
      { value: 'Cấu hình tính lương', label: 'Cấu hình tính lương' },
      { value: 'Chỉnh sửa lương nhân viên', label: 'Chỉnh sửa lương nhân viên' },
    ],
  },
  MDM: {
    title: 'Lịch sử Dữ liệu dùng chung',
    subtitle: 'Theo dõi riêng thao tác thêm, sửa, ẩn nguyên liệu, nhà cung cấp, đơn vị tính, chức vụ & chuyên môn.',
    moduleLabel: 'Dữ liệu dùng chung',
    actions: [
      { value: 'Thêm Nguyên liệu,Cập nhật Nguyên liệu,Xoá Nguyên liệu', label: 'Nguyên liệu' },
      { value: 'Thêm Nhà cung cấp,Cập nhật Nhà cung cấp,Xoá Nhà cung cấp', label: 'Nhà cung cấp' },
      { value: 'Thêm Đơn vị tính,Cập nhật Đơn vị tính,Xoá Đơn vị tính', label: 'Đơn vị tính' },
      { value: 'Thêm Chức vụ,Cập nhật Chức vụ,Xoá Chức vụ', label: 'Chức vụ' },
      { value: 'Thêm Chuyên môn,Cập nhật Chuyên môn,Xoá Chuyên môn', label: 'Chuyên môn' },
    ],
  },
  RBAC: {
    title: 'Lịch sử Phân quyền & Tài khoản',
    subtitle: 'Theo dõi riêng thao tác cấp tài khoản, phân quyền, đổi mật khẩu, khoá/mở tài khoản và nhật ký đăng nhập/đá phiên theo IP.',
    moduleLabel: 'Phân quyền & Tài khoản',
    actions: [
      { value: 'Đăng nhập,Chiếm phiên đăng nhập', label: 'Đăng nhập / Đá phiên' },
      { value: 'Đăng nhập thất bại', label: 'Đăng nhập thất bại' },
      { value: 'Đăng xuất,Thu hồi phiên', label: 'Đăng xuất / Thu hồi phiên' },
      { value: 'Tạo tài khoản', label: 'Tạo tài khoản' },
      { value: 'Cập nhật phân quyền', label: 'Cập nhật quyền' },
      { value: 'Khoá / Mở tài khoản', label: 'Khoá / Mở tài khoản' },
      { value: 'Đặt lại mật khẩu,Đổi mật khẩu', label: 'Mật khẩu' },
    ],
  },
  PAYMENT_QR: {
    title: 'Lịch sử Mã QR thanh toán',
    subtitle: 'Theo dõi thao tác thêm, sửa, xoá, đổi thứ tự ưu tiên và sự kiện tự động xoay vòng mã QR.',
    moduleLabel: 'Mã QR thanh toán',
    actions: [
      { value: 'Thêm mã QR', label: 'Thêm mã QR' },
      { value: 'Cập nhật mã QR', label: 'Cập nhật mã QR' },
      { value: 'Đổi thứ tự ưu tiên', label: 'Đổi thứ tự' },
      { value: 'Xoá mã QR', label: 'Xoá mã QR' },
      { value: 'Tự động xoay vòng QR,Vượt hạn mức tất cả QR', label: 'Xoay vòng / Hạn mức' },
    ],
  },
  SETTINGS: {
    title: 'Lịch sử Cài đặt Cửa hàng',
    subtitle: 'Theo dõi riêng thao tác thay đổi thông tin quán, logo/favicon, giao diện, phiếu in và tên menu.',
    moduleLabel: 'Cài đặt Cửa hàng',
    actions: [
      { value: 'Cập nhật cài đặt', label: 'Cập nhật cài đặt' },
      { value: 'Tải lên tài nguyên ảnh', label: 'Tải lên logo / favicon' },
      { value: 'Xoá tài nguyên ảnh', label: 'Xoá logo / favicon' },
    ],
  },
};

export const AuditLogItemSchema = z.object({
  id: IdSchema,
  module: AuditModuleSchema,
  action: z.string().trim().min(1).max(32),
  actorId: IdSchema.nullable(),
  actorFullName: z.string().trim().min(1),
  actorUsername: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  ipAddress: z.string().nullable().optional().default(null),
  deviceLabel: z.string().nullable().optional().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateTimeSchema,
}).strict();
export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

const dateRangeRefine = (filter: { fromDate?: string; toDate?: string }) =>
  filter.fromDate === undefined || filter.toDate === undefined || filter.fromDate <= filter.toDate;

export const AuditLogScopedQuerySchema = z.object({
  ...PaginationFields,
  action: z.string().trim().min(1).optional(),
  keyword: z.string().trim().min(1).optional(),
  fromDate: IsoDateSchema.optional(),
  toDate: IsoDateSchema.optional(),
}).refine(dateRangeRefine, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type AuditLogScopedQuery = z.infer<typeof AuditLogScopedQuerySchema>;

export const AuditLogFilterQuerySchema = z.object({
  ...PaginationFields,
  module: AuditModuleSchema,
  action: z.string().trim().min(1).optional(),
  keyword: z.string().trim().min(1).optional(),
  fromDate: IsoDateSchema.optional(),
  toDate: IsoDateSchema.optional(),
}).refine(dateRangeRefine, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type AuditLogFilterQuery = z.infer<typeof AuditLogFilterQuerySchema>;

export const AuditLogListResponseSchema = z.object({
  items: z.array(AuditLogItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
}).strict();
export type AuditLogListResponse = z.infer<typeof AuditLogListResponseSchema>;
