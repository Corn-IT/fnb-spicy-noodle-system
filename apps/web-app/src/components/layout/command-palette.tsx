import {
  type AllowedStoreNavGroupKey,
  type UserPermissions,
} from '@fnb/shared';
import {
  Calculator,
  CalendarDays,
  Database,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  PackagePlus,
  QrCode,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  UserCircle,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { startPendingNavigation } from '@/components/loading';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  resolveNavGroupLabel,
  resolveNavLabel,
  sortNavGroups,
  sortNavRoutes,
  useStoreSettings,
} from '@/hooks/use-store-settings';
import {
  cancelRoutePrefetch,
  prefetchRouteChunk,
  scheduleRoutePrefetch,
} from '@/lib/route-prefetch';
import { type AuthenticatedUser, useAuthStore } from '@/stores/auth.store';

export type PermissionModuleKey = keyof UserPermissions;

export type AppNavigationGroupKey = AllowedStoreNavGroupKey;

export const APP_NAVIGATION_GROUPS: readonly { key: AppNavigationGroupKey; label: string }[] = [
  { key: 'sales', label: 'Bán hàng & Khuyến mãi' },
  { key: 'finance', label: 'Tài chính & Kho' },
  { key: 'hr', label: 'Nhân sự & Tiền lương' },
  { key: 'system', label: 'Hệ thống' },
];

export interface AppNavigationRoute {
  path: string;
  label: string;
  shortLabel?: string;
  defaultPageTitle: string;
  defaultPageSubtitle?: string;
  keywords: string[];
  icon: LucideIcon;
  module?: PermissionModuleKey;
  group?: AppNavigationGroupKey;
}

export const APP_NAVIGATION_ROUTES: readonly AppNavigationRoute[] = [
  {
    path: '/dashboard',
    label: 'Tổng quan',
    shortLabel: 'Tổng quan',
    defaultPageTitle: 'Tổng quan Vận hành & Doanh thu',
    defaultPageSubtitle:
      'Bức tranh realtime doanh thu, dòng tiền két, QR chờ duyệt, 3 bếp & nhân sự theo quyền hạn.',
    keywords: ['tong quan', 'dashboard', 'bao cao', 'doanh thu', 'ket ca', 'bep', 'kpi'],
    icon: LayoutDashboard,
    module: 'dashboard',
  },
  {
    path: '/pos',
    label: 'Bán hàng POS',
    shortLabel: 'Bán hàng POS',
    defaultPageTitle: 'Bán hàng POS',
    keywords: ['pos', 'ban hang', 'so do ban', 'mang ve', 'order', 'man hinh hop nhat'],
    icon: Store,
    module: 'pos',
    group: 'sales',
  },
  {
    path: '/menu',
    label: 'Quản trị Thực đơn',
    shortLabel: 'Quản trị Thực đơn',
    defaultPageTitle: 'Quản trị Thực đơn & Phân cấp Tuỳ chọn Món',
    defaultPageSubtitle:
      'Quản lý đồng bộ 3 tầng: Khu vực Bếp → Danh mục con (MDM) → Sản phẩm (kèm Subtitle & Nhóm tuỳ chọn động) cho POS & QR.',
    keywords: ['thuc don', 'menu', 'mon an', 'san pham', 'topping', 'cap do cay', 'combo'],
    icon: UtensilsCrossed,
    module: 'menu',
    group: 'sales',
  },
  {
    path: '/discounts',
    label: 'Mã giảm giá',
    shortLabel: 'Giảm giá',
    defaultPageTitle: 'Quản lý Mã giảm giá',
    keywords: ['giam gia', 'ma giam gia', 'khuyen mai', 'voucher', 'coupon', 'chiet khau', 'discount'],
    icon: Tag,
    module: 'discounts',
    group: 'sales',
  },
  {
    path: '/invoices',
    label: 'Quản lý Hoá đơn',
    shortLabel: 'Quản lý Hoá đơn',
    defaultPageTitle: 'Quản lý & Tra cứu Hoá đơn',
    defaultPageSubtitle:
      'Tra cứu lịch sử hoá đơn đã thanh toán, xem chi tiết các lượt gọi bếp, in lại bill nhiệt và điều chỉnh phương thức thanh toán theo quy trình duyệt.',
    keywords: ['hoa don', 'invoices', 'bill', 'lich su don'],
    icon: FileText,
    module: 'invoices',
    group: 'sales',
  },
  {
    path: '/cashflow',
    label: 'Ngân sách & Kết ca',
    shortLabel: 'Ngân sách & Kết ca',
    defaultPageTitle: 'Ngân sách, Dòng tiền & Đối soát Kết ca',
    keywords: ['ket ca', 'dong tien', 'cashflow', 'ngan sach', 'tien ket', 'doi soat'],
    icon: Wallet,
    module: 'cashflow',
    group: 'finance',
  },
  {
    path: '/payment-qr',
    label: 'Mã QR thanh toán',
    shortLabel: 'Mã QR thanh toán',
    defaultPageTitle: 'Quản lý Mã QR Thanh toán (VietQR)',
    keywords: ['ma qr', 'vietqr', 'chuyen khoan', 'ngan hang', 'han muc', 'xoay vong qr', 'payment qr'],
    icon: QrCode,
    module: 'paymentQr',
    group: 'finance',
  },
  {
    path: '/inventory',
    label: 'Nhập hàng Kho',
    shortLabel: 'Nhập hàng Kho',
    defaultPageTitle: 'Quản lý Nhập hàng Nguyên vật liệu',
    defaultPageSubtitle:
      'Tra cứu lịch sử nhập kho và mở Drawer bên phải để nhập hàng liên kết tự động với Master Data.',
    keywords: ['nhap hang', 'kho', 'inventory', 'nguyen lieu'],
    icon: PackagePlus,
    module: 'inventory',
    group: 'finance',
  },
  {
    path: '/employees',
    label: 'Hồ sơ Nhân sự',
    shortLabel: 'Hồ sơ Nhân sự',
    defaultPageTitle: 'Quản lý Hồ sơ Nhân sự',
    keywords: ['nhan vien', 'nhan su', 'employees', 'hr'],
    icon: Users,
    module: 'employees',
    group: 'hr',
  },
  {
    path: '/schedules',
    label: 'Bảng tính ngày công',
    shortLabel: 'Bảng tính ngày công',
    defaultPageTitle: 'Bảng tính ngày công',
    keywords: ['bang tinh ngay cong', 'lich lam viec', 'phan ca', 'schedules', 'ca lam', 'full ca', 'excel'],
    icon: CalendarDays,
    module: 'schedules',
    group: 'hr',
  },
  {
    path: '/payroll',
    label: 'Bảng tính lương',
    shortLabel: 'Bảng tính lương',
    defaultPageTitle: 'Bảng tính lương',
    keywords: ['bang tinh luong', 'tien luong', 'payroll', 'ngay cong', 'full ca', 'gio le', 'excel'],
    icon: Calculator,
    module: 'payroll',
    group: 'hr',
  },
  {
    path: '/master-data',
    label: 'Quản trị Master Data',
    shortLabel: 'Quản trị Master Data',
    defaultPageTitle: 'Quản trị Master Data',
    keywords: ['master data', 'mdm', 'danh muc', 'thuc don', 'menu'],
    icon: Database,
    module: 'mdm',
    group: 'system',
  },
  {
    path: '/rbac',
    label: 'Phân quyền Hệ thống',
    shortLabel: 'Phân quyền Hệ thống',
    defaultPageTitle: 'Phân quyền Hệ thống',
    keywords: ['phan quyen', 'rbac', 'tai khoan', 'admin'],
    icon: ShieldCheck,
    module: 'rbac',
    group: 'system',
  },
  {
    path: '/settings',
    label: 'Cài đặt Cửa hàng',
    shortLabel: 'Cài đặt Cửa hàng',
    defaultPageTitle: 'Cài đặt Cửa hàng',
    defaultPageSubtitle:
      'Tuỳ chỉnh tên cửa hàng, logo, favicon, màu thương hiệu, màn hình QR, phiếu in và tên menu.',
    keywords: ['cai dat', 'settings', 'logo', 'favicon', 'theme', 'branding', 'thuong hieu', 'phieu in', 'menu'],
    icon: Settings,
    module: 'settings',
    group: 'system',
  },
  {
    path: '/profile',
    label: 'Hồ sơ Tài khoản Cá nhân',
    shortLabel: 'Hồ sơ Cá nhân',
    defaultPageTitle: 'Hồ sơ Tài khoản Cá nhân',
    defaultPageSubtitle:
      'Liên kết 1-1 giữa Tài khoản đăng nhập (users) và Hồ sơ Nhân sự (employees)',
    keywords: ['ho so', 'profile', 'tai khoan ca nhan'],
    icon: UserCircle,
  },
] as const;

export const APP_NAVIGATION_ROUTE_MAP = new Map<string, AppNavigationRoute>(
  APP_NAVIGATION_ROUTES.map((route) => [route.path, route]),
);

export function canUserAccessRoute(
  user: AuthenticatedUser | null,
  route: AppNavigationRoute,
): boolean {
  if (!user) return false;
  if (!route.module) return true;
  if (user.isSuperAdmin) return true;
  return Boolean(user.permissions?.[route.module]?.view);
}

export interface OrderedNavigationSection {
  key: AppNavigationGroupKey;
  defaultLabel: string;
  label: string;
  items: AppNavigationRoute[];
}

export interface NavigationOrderSettings {
  readonly navGroupLabels?: Record<string, string>;
  readonly navGroupOrder?: readonly string[];
  readonly navOrder?: readonly string[];
}

export function buildOrderedNavigationSections(
  routes: readonly AppNavigationRoute[],
  settings?: NavigationOrderSettings,
): OrderedNavigationSection[] {
  return sortNavGroups(APP_NAVIGATION_GROUPS, settings?.navGroupOrder)
    .map((group) => ({
      key: group.key,
      defaultLabel: group.label,
      label: resolveNavGroupLabel(group.key, group.label, settings?.navGroupLabels),
      items: sortNavRoutes(
        routes.filter((route) => route.group === group.key),
        settings?.navOrder,
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function getAccessibleRoutes(
  user: AuthenticatedUser | null,
): AppNavigationRoute[] {
  return APP_NAVIGATION_ROUTES.filter((route) => canUserAccessRoute(user, route));
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const user = useAuthStore((state) => state.user);
  const { settings } = useStoreSettings();
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const accessibleRoutes = React.useMemo(() => getAccessibleRoutes(user), [user]);
  const groupedSections = React.useMemo(
    () => buildOrderedNavigationSections(accessibleRoutes, settings),
    [accessibleRoutes, settings],
  );
  const standaloneRoutes = React.useMemo(
    () =>
      sortNavRoutes(
        accessibleRoutes.filter((route) => !route.group),
        settings.navOrder,
      ),
    [accessibleRoutes, settings.navOrder],
  );

  const standaloneModuleRoutes = React.useMemo(
    () => standaloneRoutes.filter((route) => Boolean(route.module)),
    [standaloneRoutes],
  );
  const accountRoutes = React.useMemo(
    () => standaloneRoutes.filter((route) => !route.module),
    [standaloneRoutes],
  );

  const renderRouteItem = (route: AppNavigationRoute, groupHint = '') => {
    const Icon = route.icon;
    const displayLabel = resolveNavLabel(route.path, route.label, settings.navLabels);
    return (
      <CommandItem
        key={route.path}
        value={`${displayLabel} ${route.label} ${groupHint} ${route.keywords.join(' ')}`}
        onPointerDown={(event) => {
          if (event.button === 0) {
            void prefetchRouteChunk(route.path);
          }
        }}
        onMouseEnter={() => scheduleRoutePrefetch(route.path)}
        onMouseLeave={() => cancelRoutePrefetch(route.path)}
        onFocus={() => scheduleRoutePrefetch(route.path)}
        onBlur={() => cancelRoutePrefetch(route.path)}
        onSelect={() => {
          cancelRoutePrefetch(route.path);
          void prefetchRouteChunk(route.path);
          if (location.pathname !== route.path) {
            startPendingNavigation(route.path);
          }
          onOpenChange(false);
          navigate(route.path);
        }}
      >
        <Icon className="h-4 w-4 text-accent-text" />
        <span>{displayLabel}</span>
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Tìm nhanh màn hình chức năng (Ctrl+K)..." />
      <CommandList>
        <CommandEmpty>Không tìm thấy màn hình phù hợp với quyền của bạn.</CommandEmpty>
        {standaloneModuleRoutes.length > 0 ? (
          <CommandGroup heading="Tổng quan">
            {standaloneModuleRoutes.map((route) => renderRouteItem(route, 'Tổng quan'))}
          </CommandGroup>
        ) : null}
        {groupedSections.map((section) => (
          <CommandGroup key={section.key} heading={section.label}>
            {section.items.map((route) => renderRouteItem(route, section.label))}
          </CommandGroup>
        ))}
        {accountRoutes.length > 0 ? (
          <CommandGroup heading="Tài khoản & Khác">
            {accountRoutes.map((route) => renderRouteItem(route, 'Tài khoản'))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
