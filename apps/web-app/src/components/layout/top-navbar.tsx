import { type QueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut, Menu, Moon, Search, Sun, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient } from '@/lib/api-client';
import { AUTH_STORAGE_KEY, useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

/**
 * HARD INVARIANT 9 & EC-UI-01:
 * Thực thi đúng thứ tự khi Đăng xuất:
 * 1. queryClient.clear() -> Xoá toàn bộ cache dữ liệu nghiệp vụ API trong bộ nhớ
 * 2. useAuthStore.getState().clearAuth() -> Xoá token và thông tin định danh
 * 3. Gọi API xoá refreshToken cookie
 * 4. TUYỆT ĐỐI KHÔNG xoá key 'fnb-ui-preferences' trong localStorage và KHÔNG reset useUiPreferencesStore
 */
export async function executeCleanLogout(queryClient: QueryClient): Promise<void> {
  // 1. Xoá toàn bộ cache dữ liệu nghiệp vụ API trong bộ nhớ (chống rò rỉ dữ liệu ca trước)
  queryClient.clear();
  // 2. Xoá token và thông tin định danh khỏi authStore
  useAuthStore.getState().clearAuth();
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  // 3. Gọi API xoá refreshToken cookie
  await apiClient.post('/api/v1/auth/logout').catch(() => {});
  // 4. HARD INVARIANT 9: TUYỆT ĐỐI KHÔNG xoá key 'fnb-ui-preferences' trong localStorage
  // và KHÔNG reset useUiPreferencesStore (theme, sidebarWidth, columnWidths phải giữ nguyên!)
}

export interface TopNavbarProps {
  queryClient: QueryClient;
  onOpenCommandPalette: () => void;
  onToggleMobileMenu?: () => void;
}

export function TopNavbar({
  queryClient,
  onOpenCommandPalette,
  onToggleMobileMenu,
}: TopNavbarProps) {
  const user = useAuthStore((state) => state.user);
  const theme = useUiPreferencesStore((state) => state.theme);
  const toggleTheme = useUiPreferencesStore((state) => state.toggleTheme);
  const navigate = useNavigate();

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    toggleTheme();
    if (useAuthStore.getState().accessToken) {
      void apiClient
        .patch('/api/v1/profile/ui-prefs', { theme: nextTheme })
        .catch(() => {});
    }
  };

  const handleLogout = async () => {
    await executeCleanLogout(queryClient);
    navigate('/login', { replace: true });
  };

  const displayName = user?.fullName || user?.username || 'Nhân viên';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-3 md:px-4 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {onToggleMobileMenu ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0 h-9 w-9 -ml-1 text-muted-foreground hover:text-foreground"
            onClick={onToggleMobileMenu}
            aria-label="Mở menu điều hướng"
            data-testid="navbar-mobile-menu-trigger"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : null}
        <span className="truncate text-xs sm:text-sm font-bold text-foreground sm:hidden">
          MÌ CAY SƠN BẢO
        </span>
        <span className="hidden sm:inline-block xl:hidden whitespace-nowrap text-xs sm:text-sm font-semibold text-muted-foreground">
          Quản trị & Bán hàng POS
        </span>
        <span className="hidden xl:inline-block whitespace-nowrap text-sm font-medium text-muted-foreground">
          Hệ thống Quản trị & Bán hàng Thời gian thực
        </span>
      </div>

      {/* AC-08.3: Góc phải Navbar đúng thứ tự từ trái sang phải:
          [Search Button (Ctrl+K)] -> [Theme Toggle] -> [User Avatar + Name Dropdown] */}
      <div
        data-testid="navbar-right-controls"
        className="flex shrink-0 items-center gap-2 sm:gap-3"
      >
        {/* 1. Search / Command Palette (Ctrl+K) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-navbar-item="search-ctrl-k"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 text-muted-foreground hover:text-foreground whitespace-nowrap"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline xl:hidden">Tìm màn hình...</span>
          <span className="hidden xl:inline">Tìm nhanh màn hình...</span>
          <kbd className="pointer-events-none ml-1 hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Ctrl+K
          </kbd>
        </Button>

        {/* 2. Nút chuyển Theme Sáng/Tối */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-navbar-item="theme-toggle"
          onClick={handleToggleTheme}
          aria-label="Chuyển chế độ Sáng/Tối"
          title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-700" />
          )}
        </Button>

        {/* 3. Avatar + Tên người dùng Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-navbar-item="user-avatar-dropdown"
              className="flex items-center gap-2.5 rounded-full border bg-background py-1 pl-1.5 pr-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {initials || 'NV'}
                </span>
              )}
              <span className="hidden max-w-[140px] truncate sm:inline-block">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  @{user?.username ?? 'guest'}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/profile')}>
              <User className="h-4 w-4" />
              <span>Hồ sơ tài khoản</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void handleLogout();
              }}
              className="text-rose-600 focus:text-rose-600 dark:text-rose-400"
            >
              <LogOut className="h-4 w-4" />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
