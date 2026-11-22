import { type UserPermissions } from '@fnb/shared';

export interface RbacModuleConfig {
  key: keyof UserPermissions;
  label: string;
  permissions: Array<{ key: string; label: string; superAdminOnly?: boolean }>;
}

export const RBAC_MODULE_CONFIGS: RbacModuleConfig[] = [
  {
    key: 'dashboard',
    label: 'Tổng quan (Dashboard)',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'viewProfit', label: 'Xem doanh thu chi tiết, két & lãi' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'pos',
    label: 'Bán hàng POS',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Tạo đơn' },
      { key: 'update', label: 'Sửa đơn' },
      { key: 'delete', label: 'Xoá đơn' },
      { key: 'splitKitchen', label: 'Tách bếp' },
      { key: 'tableAction', label: 'Đổi/Gộp bàn' },
      { key: 'checkout', label: 'Thanh toán' },
      { key: 'manualDiscount', label: 'Giảm giá tay trực tiếp' },
      { key: 'qrSecurity', label: 'Bảo mật QR' },
    ],
  },
  {
    key: 'menu',
    label: 'Quản trị Thực đơn',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Thêm món' },
      { key: 'update', label: 'Sửa món' },
      { key: 'delete', label: 'Xoá món' },
      { key: 'manageStations', label: 'Quản lý khu vực bếp' },
      { key: 'manageCategories', label: 'Quản lý danh mục con' },
      { key: 'import', label: 'Nhập file Excel' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'invoices',
    label: 'Quản lý Hoá đơn',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'reprint', label: 'In lại' },
      { key: 'update', label: 'Sửa PTTT' },
      { key: 'approve', label: 'Duyệt sửa PTTT' },
      { key: 'void', label: 'Huỷ đơn (Chỉ Super Admin)', superAdminOnly: true },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'inventory',
    label: 'Nhập hàng Kho',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Tạo phiếu' },
      { key: 'update', label: 'Sửa phiếu' },
      { key: 'delete', label: 'Xoá phiếu' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'cashflow',
    label: 'Ngân sách & Kết ca',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Chốt kết ca' },
      { key: 'compensate', label: 'Bù chênh lệch' },
      { key: 'config', label: 'Cấu hình ngân sách' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'paymentQr',
    label: 'Mã QR thanh toán',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Thêm mã QR' },
      { key: 'update', label: 'Sửa / Đổi ưu tiên / Bật-tắt' },
      { key: 'delete', label: 'Xoá mã QR chưa phát sinh đơn' },
    ],
  },
  {
    key: 'discounts',
    label: 'Mã giảm giá',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Tạo mã giảm giá' },
      { key: 'update', label: 'Sửa / Bật-tắt mã' },
      { key: 'delete', label: 'Xoá / Lưu trữ mã' },
    ],
  },
  {
    key: 'employees',
    label: 'Hồ sơ Nhân sự',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Thêm mới' },
      { key: 'update', label: 'Chỉnh sửa' },
      { key: 'delete', label: 'Tạm ngưng / Xoá' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'schedules',
    label: 'Bảng tính ngày công',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Thêm phân ca' },
      { key: 'update', label: 'Sửa công / Sao chép tuần' },
      { key: 'delete', label: 'Xoá ca khỏi ô' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'payroll',
    label: 'Bảng tính lương',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'update', label: 'Chỉnh sửa lương' },
      { key: 'config', label: 'Cấu hình công thức' },
      { key: 'export', label: 'Xuất file Excel' },
    ],
  },
  {
    key: 'mdm',
    label: 'Quản trị Master Data',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Thêm mới' },
      { key: 'update', label: 'Chỉnh sửa' },
      { key: 'delete', label: 'Xoá / Ngưng' },
    ],
  },
  {
    key: 'rbac',
    label: 'Phân quyền Hệ thống',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Tạo tài khoản', superAdminOnly: true },
      { key: 'update', label: 'Sửa quyền & kích hoạt', superAdminOnly: true },
      { key: 'resetPassword', label: 'Đặt lại mật khẩu', superAdminOnly: true },
    ],
  },
  {
    key: 'settings',
    label: 'Cài đặt Cửa hàng',
    permissions: [
      { key: 'view', label: 'Xem cấu hình' },
      { key: 'update', label: 'Cập nhật thương hiệu & menu' },
    ],
  },
];
