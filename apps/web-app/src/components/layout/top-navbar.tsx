import { StoreAssetKind } from '@fnb/shared';
import { type QueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut, Menu, Search, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { APP_NAVIGATION_ROUTES } from '@/components/layout/command-palette';
import { MobileAlertControlButton } from '@/components/layout/mobile-alert-controls';
import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildStoreAssetUrl, resolveNavLabel, useStoreSettings } from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import { stopMobileAudioKeepAlive } from '@/lib/mobile-audio-keepalive';
import { AUTH_STORAGE_KEY, useAuthStore } from '@/stores/auth.store';
import { resolvePublicAssetUrl } from '@/utils/asset-url';

/**
 * HARD INVARIANT 9 & EC-UI-01:
 * Thực thi đúng thứ tự khi Đăng xuất:
 * 1. queryClient.clear() -> Xoá toàn bộ cache dữ liệu nghiệp vụ API trong bộ nhớ
 * 2. useAuthStore.getState().clearAuth() -> Xoá token và thông tin định danh
 * 3. Gọi API xoá refreshToken cookie
 * 4. TUYỆT ĐỐI KHÔNG xoá key 'fnb-ui-preferences' trong localStorage và KHÔNG reset useUiPreferencesStore
 */
export async function executeCleanLogout(queryClient: QueryClient): Promise<void> {
  // 1. Gọi API xoá refreshToken cookie TRƯỚC khi xoá auth state để tránh redirect huỷ fetch giữa chừng
  try {
    await apiClient.post('/api/v1/auth/logout');
  } catch {
    // Ignore logout API failures so client auth state always clears
  } finally {
    // Dừng phiên giữ âm thanh nền của ca cũ (không xoá preference trong localStorage — Invariant 9)
    stopMobileAudioKeepAlive();
    // 2. Xoá toàn bộ cache dữ liệu nghiệp vụ API trong bộ nhớ (chống rò rỉ dữ liệu ca trước)
    queryClient.clear();
    // 3. Xoá token và thông tin định danh khỏi authStore
    useAuthStore.getState().clearAuth();
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    // 4. HARD INVARIANT 9: TUYỆT ĐỐI KHÔNG xoá key 'fnb-ui-preferences' trong localStorage
    // và KHÔNG reset useUiPreferencesStore (theme, sidebarWidth, columnWidths phải giữ nguyên!)
  }
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
  const { settings } = useStoreSettings();
  const logoUrl = buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);

  const navigate = useNavigate();
  const location = useLocation();

  const currentPageLabel = (() => {
    const matched = APP_NAVIGATION_ROUTES.find(
      (route) =>
        location.pathname === route.path ||
        location.pathname.startsWith(`${route.path}/`),
    );
    if (matched) {
      return resolveNavLabel(matched.path, matched.label, settings.navLabels);
    }
    return settings.storeName;
  })();



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
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card/80 px-2.5 sm:px-3 md:px-4 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {onToggleMobileMenu ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 h-11 w-11 -ml-1 text-muted-foreground hover:text-foreground"
            onClick={onToggleMobileMenu}
            aria-label="Mở menu điều hướng"
            data-testid="navbar-mobile-menu-trigger"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : null}
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <StoreBrandLogo
            src={logoUrl}
            storeName={settings.storeName}
            className="hidden min-[380px]:flex h-7 w-7 shrink-0 rounded-md shadow-2xs"
            fallbackClassName="text-[10px]"
          />
          <span className="text-sm font-bold leading-tight text-foreground line-clamp-2 break-words">
            {currentPageLabel}
          </span>
        </div>
        <span className="hidden md:inline-block xl:hidden text-sm font-semibold text-muted-foreground">
          {settings.subtitle || 'Quản trị & Bán hàng POS'}
        </span>
        <span className="hidden xl:inline-block text-sm font-medium text-muted-foreground">
          {settings.subtitle || 'Hệ thống Quản trị & Bán hàng Thời gian thực'}
        </span>
      </div>

      {/* AC-08.3: Góc phải Navbar đúng thứ tự từ trái sang phải:
          [Search Button (Ctrl+K)] -> [User Avatar + Name Dropdown] */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <MobileAlertControlButton />
        <div
          data-testid="navbar-right-controls"
          className="flex shrink-0 items-center gap-1.5 sm:gap-2.5"
        >
        {/* 1. Search / Command Palette (Ctrl+K) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-navbar-item="search-ctrl-k"
          aria-label="Tìm nhanh màn hình"
          title="Tìm nhanh màn hình (Ctrl+K)"
          onClick={onOpenCommandPalette}
          className="hidden md:inline-flex items-center gap-1.5 sm:gap-2 min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 px-2.5 sm:px-3 text-muted-foreground hover:text-foreground whitespace-nowrap"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline xl:hidden">Tìm màn hình</span>
          <span className="hidden xl:inline">Tìm nhanh màn hình...</span>
          <kbd className="pointer-events-none ml-1 hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Ctrl+K
          </kbd>
        </Button>

        {/* 3. Avatar + Tên người dùng Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-navbar-item="user-avatar-dropdown"
              aria-label="Tài khoản và cài đặt cá nhân"
              className="flex min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 items-center justify-center gap-2 rounded-full border bg-background py-1 pl-1.5 pr-2 sm:pr-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {resolvePublicAssetUrl(user?.avatarUrl) ? (
                <img
                  src={resolvePublicAssetUrl(user?.avatarUrl) ?? undefined}
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
            <DropdownMenuItem
              className="md:hidden"
              onSelect={() => onOpenCommandPalette()}
            >
              <Search className="h-4 w-4" />
              <span>Tìm nhanh màn hình</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="md:hidden" />
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
      </div>
    </header>
  );
}
