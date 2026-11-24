import {
  Ban,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  PackagePlus,
  Printer,
  QrCode,
  Settings,
  Store,
  Tag,
  UserCircle,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';

import type { PermissionModuleKey } from '@/components/layout/command-palette';
import { POS_DEFAULT_PATH, POS_TOUCH_PATH } from '@/lib/pos-device-mode';
import type { AuthenticatedUser } from '@/stores/auth.store';

export const TOUCH_PATHS = {
  POS: POS_TOUCH_PATH,
  HUB: `${POS_TOUCH_PATH}/hub`,
  INVOICES: `${POS_TOUCH_PATH}/invoices`,
  CASHFLOW: `${POS_TOUCH_PATH}/cashflow`,
  INVENTORY: `${POS_TOUCH_PATH}/inventory`,
  STOCK_STATUS: `${POS_TOUCH_PATH}/stock-status`,
  PRINTER: `${POS_TOUCH_PATH}/printer`,
  DASHBOARD: `${POS_TOUCH_PATH}/dashboard`,
  MENU: `${POS_TOUCH_PATH}/menu`,
  DISCOUNTS: `${POS_TOUCH_PATH}/discounts`,
  PAYMENT_QR: `${POS_TOUCH_PATH}/payment-qr`,
  SETTINGS: `${POS_TOUCH_PATH}/settings`,
  PROFILE: `${POS_TOUCH_PATH}/profile`,
} as const;

export type TouchPath = (typeof TOUCH_PATHS)[keyof typeof TOUCH_PATHS];

export interface TouchRouteMeta {
  key: string;
  touchPath: TouchPath;
  desktopPath: string;
  /**
   * Path dữ liệu truyền cho `prefetchRouteData`. Mặc định dùng `desktopPath`; đặt `null`
   * cho màn không cần prefetch API (như Hub hoặc Máy in lưu ở localStorage) để tránh gọi API ngoài quyền.
   */
  prefetchDataPath?: string | null;
  /** Path dùng để tra cứu nhãn tuỳ biến từ `settings.navLabels` nếu có. */
  navLabelPath?: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  module?: PermissionModuleKey;
  /** Nhóm hiển thị trên trang Hub. */
  hubSection?: 'featured' | 'grid';
  featuredTone?: 'blue' | 'sky' | 'amber' | 'emerald';
  /** Nút quay lại trên SubpageHeader nên trỏ về Hub thay vì Bán hàng. */
  backTarget?: 'hub' | 'pos';
}

export const TOUCH_ROUTE_CATALOG: readonly TouchRouteMeta[] = [
  {
    key: 'pos',
    touchPath: TOUCH_PATHS.POS,
    desktopPath: POS_DEFAULT_PATH,
    navLabelPath: '/pos',
    label: 'Bán hàng POS',
    shortLabel: 'Bán hàng',
    description: 'Sơ đồ bàn, đơn mang về, tách bếp và thanh toán',
    icon: Store,
    module: 'pos',
  },
  {
    key: 'hub',
    touchPath: TOUCH_PATHS.HUB,
    desktopPath: POS_DEFAULT_PATH,
    prefetchDataPath: null,
    label: 'Trung tâm Quản lý',
    shortLabel: 'Quản lý',
    description: 'Truy cập nhanh báo cáo, thực đơn, máy in và tiện ích quầy',
    icon: LayoutGrid,
    module: 'pos',
  },
  // --- 4 thẻ nổi bật trên Hub (tham chiếu 4 ô lớn phía trên của iPOS) ---
  {
    key: 'dashboard',
    touchPath: TOUCH_PATHS.DASHBOARD,
    desktopPath: '/dashboard',
    navLabelPath: '/dashboard',
    label: 'Tổng quan & Báo cáo',
    shortLabel: 'Báo cáo',
    description: 'Doanh thu hôm nay, tiền két, đơn QR chờ duyệt và món bán chạy',
    icon: LayoutDashboard,
    module: 'dashboard',
    hubSection: 'featured',
    featuredTone: 'blue',
    backTarget: 'hub',
  },
  {
    key: 'settings',
    touchPath: TOUCH_PATHS.SETTINGS,
    desktopPath: '/settings',
    navLabelPath: '/settings',
    label: 'Cài đặt cửa hàng',
    shortLabel: 'Cài đặt',
    description: 'Thương hiệu, màu sắc, mẫu phiếu in nhiệt và âm thanh QR',
    icon: Settings,
    module: 'settings',
    hubSection: 'featured',
    featuredTone: 'sky',
    backTarget: 'hub',
  },
  {
    key: 'discounts',
    touchPath: TOUCH_PATHS.DISCOUNTS,
    desktopPath: '/discounts',
    navLabelPath: '/discounts',
    label: 'Mã giảm giá',
    shortLabel: 'Giảm giá',
    description: 'Chương trình khuyến mãi, voucher và chiết khấu theo đơn',
    icon: Tag,
    module: 'discounts',
    hubSection: 'featured',
    featuredTone: 'amber',
    backTarget: 'hub',
  },
  {
    key: 'menu',
    touchPath: TOUCH_PATHS.MENU,
    desktopPath: '/menu',
    navLabelPath: '/menu',
    label: 'Thực đơn đầy đủ',
    shortLabel: 'Thực đơn',
    description: 'Quản lý món ăn, giá bán, danh mục, combo và tuỳ chọn topping',
    icon: UtensilsCrossed,
    module: 'menu',
    hubSection: 'featured',
    featuredTone: 'emerald',
    backTarget: 'hub',
  },
  // --- Lưới ô chức năng quầy trên Hub ---
  {
    key: 'stock-status',
    touchPath: TOUCH_PATHS.STOCK_STATUS,
    desktopPath: '/menu',
    label: 'Báo hết món',
    shortLabel: 'Báo hết món',
    description: 'Chạm 1 lần để bật / tắt món đang hết tại quầy & QR khách',
    icon: Ban,
    module: 'menu',
    hubSection: 'grid',
    backTarget: 'hub',
  },
  {
    key: 'printer',
    touchPath: TOUCH_PATHS.PRINTER,
    desktopPath: '/settings',
    prefetchDataPath: null,
    label: 'Máy in & Két tiền',
    shortLabel: 'Máy in',
    description: 'Cấu hình cáp USB / LAN, in thử 80mm và mở két tiền an toàn',
    icon: Printer,
    module: 'pos',
    hubSection: 'grid',
    backTarget: 'hub',
  },
  {
    key: 'invoices',
    touchPath: TOUCH_PATHS.INVOICES,
    desktopPath: '/invoices',
    navLabelPath: '/invoices',
    label: 'Quản lý Hoá đơn',
    shortLabel: 'Hoá đơn',
    description: 'Tra cứu bill đã thanh toán, in lại phiếu, sửa PTTT và huỷ đơn',
    icon: FileText,
    module: 'invoices',
    hubSection: 'grid',
    backTarget: 'pos',
  },
  {
    key: 'cashflow',
    touchPath: TOUCH_PATHS.CASHFLOW,
    desktopPath: '/cashflow',
    navLabelPath: '/cashflow',
    label: 'Ngân sách & Kết ca',
    shortLabel: 'Kết ca',
    description: 'Đếm tiền theo mệnh giá, đối soát két cuối ca và lịch sử kết ca',
    icon: Wallet,
    module: 'cashflow',
    hubSection: 'grid',
    backTarget: 'pos',
  },
  {
    key: 'inventory',
    touchPath: TOUCH_PATHS.INVENTORY,
    desktopPath: '/inventory',
    navLabelPath: '/inventory',
    label: 'Nhập hàng Kho',
    shortLabel: 'Nhập hàng',
    description: 'Ghi phiếu chi tiền két / tiền ngoài khi nhập nguyên vật liệu',
    icon: PackagePlus,
    module: 'inventory',
    hubSection: 'grid',
    backTarget: 'hub',
  },
  {
    key: 'payment-qr',
    touchPath: TOUCH_PATHS.PAYMENT_QR,
    desktopPath: '/payment-qr',
    navLabelPath: '/payment-qr',
    label: 'Mã QR thanh toán',
    shortLabel: 'Mã QR',
    description: 'Theo dõi hạn mức chuyển khoản VietQR và thứ tự xoay vòng mã',
    icon: QrCode,
    module: 'paymentQr',
    hubSection: 'grid',
    backTarget: 'hub',
  },
  {
    key: 'profile',
    touchPath: TOUCH_PATHS.PROFILE,
    desktopPath: '/profile',
    navLabelPath: '/profile',
    label: 'Hồ sơ cá nhân',
    shortLabel: 'Hồ sơ',
    description: 'Thông tin nhân viên, tài khoản ngân hàng và đổi mật khẩu',
    icon: UserCircle,
    hubSection: 'grid',
    backTarget: 'hub',
  },
] as const;

export const TOUCH_ROUTE_BY_PATH = new Map<string, TouchRouteMeta>(
  TOUCH_ROUTE_CATALOG.map((route) => [route.touchPath, route]),
);

const BACK_OFFICE_MODULES: readonly PermissionModuleKey[] = [
  'employees',
  'schedules',
  'payroll',
  'mdm',
  'rbac',
];

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Mọi đường dẫn thuộc Touch Shell (`/pos/touch` và `/pos/touch/*`). */
export function isPosTouchShellPath(pathname: string): boolean {
  const normalized = stripTrailingSlash(pathname);
  return normalized === POS_TOUCH_PATH || normalized.startsWith(`${POS_TOUCH_PATH}/`);
}

/**
 * Chỉ các màn bán hàng POS trực tiếp (nơi `usePosWorkspace` đang mount và lắng nghe socket QR).
 * Các màn con như `/pos/touch/hub`, `/pos/touch/invoices` KHÔNG thuộc nhóm này để `AppShell`
 * tiếp tục phát giọng đọc đơn QR mới và hiển thị cảnh báo đỏ quá hạn.
 */
export function isPosLiveBoardPath(pathname: string): boolean {
  const normalized = stripTrailingSlash(pathname);
  return normalized === POS_DEFAULT_PATH || normalized === POS_TOUCH_PATH;
}

export function findTouchRouteMeta(pathname: string): TouchRouteMeta | undefined {
  const normalized = stripTrailingSlash(pathname);
  return TOUCH_ROUTE_BY_PATH.get(normalized);
}

export function resolveDesktopFallbackPath(pathname: string): string {
  const meta = findTouchRouteMeta(pathname);
  return meta?.desktopPath ?? POS_DEFAULT_PATH;
}

export function resolveTouchPrefetchDataPath(route: Pick<TouchRouteMeta, 'desktopPath' | 'prefetchDataPath'>): string | null {
  return route.prefetchDataPath === undefined ? route.desktopPath : route.prefetchDataPath;
}

const DESKTOP_TO_TOUCH_PATH = new Map<string, TouchPath>([
  [POS_DEFAULT_PATH, TOUCH_PATHS.POS],
  ['/invoices', TOUCH_PATHS.INVOICES],
  ['/cashflow', TOUCH_PATHS.CASHFLOW],
  ['/inventory', TOUCH_PATHS.INVENTORY],
  ['/dashboard', TOUCH_PATHS.DASHBOARD],
  ['/menu', TOUCH_PATHS.MENU],
  ['/discounts', TOUCH_PATHS.DISCOUNTS],
  ['/payment-qr', TOUCH_PATHS.PAYMENT_QR],
  ['/settings', TOUCH_PATHS.SETTINGS],
  ['/profile', TOUCH_PATHS.PROFILE],
]);

/**
 * Khi đang ở trong Touch Shell, tự động ánh xạ đường dẫn desktop (VD: `/pos`, `/payment-qr`, `/invoices`)
 * sang route cảm ứng tương ứng (`/pos/touch`, `/pos/touch/payment-qr`, `/pos/touch/invoices`).
 * Các module Giai đoạn 2 chưa có trong Touch Shell (như `/schedules`, `/payroll`) giữ nguyên đường dẫn gốc.
 */
export function resolveTouchAwarePath(path: string, isInTouchShell: boolean): string {
  if (!isInTouchShell) return path;
  const normalized = stripTrailingSlash(path);
  return DESKTOP_TO_TOUCH_PATH.get(normalized) ?? path;
}

export function canUserAccessTouchRoute(
  user: AuthenticatedUser | null,
  route: Pick<TouchRouteMeta, 'module'>,
): boolean {
  if (!user) return false;
  if (!route.module) return true;
  if (user.isSuperAdmin) return true;
  return Boolean(user.permissions?.[route.module]?.view);
}

export function hasAnyBackOfficeAccess(user: AuthenticatedUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return BACK_OFFICE_MODULES.some((mod) => Boolean(user.permissions?.[mod]?.view));
}

export const TOUCH_BOTTOM_NAV_PATHS: readonly TouchPath[] = [
  TOUCH_PATHS.POS,
  TOUCH_PATHS.INVOICES,
  TOUCH_PATHS.CASHFLOW,
  TOUCH_PATHS.HUB,
];
