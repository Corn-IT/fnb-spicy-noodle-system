import { type UserPermissions } from '@fnb/shared';
import {
  CalendarDays,
  Database,
  FileText,
  type LucideIcon,
  PackagePlus,
  ShieldCheck,
  Store,
  UserCircle,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { type AuthenticatedUser, useAuthStore } from '@/stores/auth.store';

export type PermissionModuleKey = keyof UserPermissions;

export interface AppNavigationRoute {
  path: string;
  label: string;
  shortLabel?: string;
  keywords: string[];
  icon: LucideIcon;
  module?: PermissionModuleKey;
}

export const APP_NAVIGATION_ROUTES: readonly AppNavigationRoute[] = [
  {
    path: '/pos',
    label: 'Bán hàng POS',
    shortLabel: 'Bán hàng POS',
    keywords: ['pos', 'ban hang', 'so do ban', 'mang ve', 'order', 'man hinh hop nhat'],
    icon: Store,
    module: 'pos',
  },
  {
    path: '/menu',
    label: 'Quản trị Thực đơn',
    shortLabel: 'Quản trị Thực đơn',
    keywords: ['thuc don', 'menu', 'mon an', 'san pham', 'topping', 'cap do cay', 'combo'],
    icon: UtensilsCrossed,
    module: 'pos',
  },
  {
    path: '/invoices',
    label: 'Quản lý Hoá đơn',
    shortLabel: 'Quản lý Hoá đơn',
    keywords: ['hoa don', 'invoices', 'bill', 'lich su don'],
    icon: FileText,
    module: 'invoices',
  },
  {
    path: '/inventory',
    label: 'Nhập hàng Kho',
    shortLabel: 'Nhập hàng Kho',
    keywords: ['nhap hang', 'kho', 'inventory', 'nguyen lieu'],
    icon: PackagePlus,
    module: 'inventory',
  },
  {
    path: '/cashflow',
    label: 'Ngân sách & Kết ca',
    shortLabel: 'Ngân sách & Kết ca',
    keywords: ['ket ca', 'dong tien', 'cashflow', 'ngan sach', 'tien ket', 'doi soat'],
    icon: Wallet,
    module: 'cashflow',
  },
  {
    path: '/employees',
    label: 'Hồ sơ Nhân sự',
    shortLabel: 'Hồ sơ Nhân sự',
    keywords: ['nhan vien', 'nhan su', 'employees', 'hr'],
    icon: Users,
    module: 'employees',
  },
  {
    path: '/schedules',
    label: 'Lịch làm việc Tuần',
    shortLabel: 'Lịch làm việc Tuần',
    keywords: ['lich lam viec', 'phan ca', 'schedules', 'ca lam', 'excel'],
    icon: CalendarDays,
    module: 'schedules',
  },
  {
    path: '/master-data',
    label: 'Quản trị Master Data',
    shortLabel: 'Quản trị Master Data',
    keywords: ['master data', 'mdm', 'danh muc', 'thuc don', 'menu'],
    icon: Database,
    module: 'mdm',
  },
  {
    path: '/rbac',
    label: 'Phân quyền Hệ thống',
    shortLabel: 'Phân quyền Hệ thống',
    keywords: ['phan quyen', 'rbac', 'tai khoan', 'admin'],
    icon: ShieldCheck,
    module: 'rbac',
  },
  {
    path: '/profile',
    label: 'Hồ sơ Tài khoản Cá nhân',
    shortLabel: 'Hồ sơ Cá nhân',
    keywords: ['ho so', 'profile', 'tai khoan ca nhan'],
    icon: UserCircle,
  },
] as const;

export function canUserAccessRoute(
  user: AuthenticatedUser | null,
  route: AppNavigationRoute,
): boolean {
  if (!user) return false;
  if (!route.module) return true;
  if (user.isSuperAdmin) return true;
  return Boolean(user.permissions?.[route.module]?.view);
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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Tìm nhanh màn hình chức năng (Ctrl+K)..." />
      <CommandList>
        <CommandEmpty>Không tìm thấy màn hình phù hợp với quyền của bạn.</CommandEmpty>
        <CommandGroup heading="Màn hình được cấp quyền truy cập">
          {accessibleRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <CommandItem
                key={route.path}
                value={`${route.label} ${route.keywords.join(' ')}`}
                onSelect={() => {
                  onOpenChange(false);
                  navigate(route.path);
                }}
              >
                <Icon className="h-4 w-4 text-primary" />
                <span>{route.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
