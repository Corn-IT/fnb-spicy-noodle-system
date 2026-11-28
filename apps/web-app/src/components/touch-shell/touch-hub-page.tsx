import { StoreAssetKind, type Product } from '@fnb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Expand,
  KeyRound,
  LayoutGrid,
  LogOut,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  Shrink,
  Sparkles,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { executeCleanLogout } from '@/components/layout/top-navbar';
import { useThermalPrinterConfigStore } from '@/components/print-slips';
import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { exitAppFullscreen, useFullscreen } from '@/hooks/use-fullscreen';
import {
  buildStoreAssetUrl,
  resolveNavLabel,
  useStoreSettings,
} from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import { POS_DEFAULT_PATH, usePosDeviceMode } from '@/lib/pos-device-mode';
import { prefetchRouteChunk, prefetchRouteData } from '@/lib/route-prefetch';
import { useAiAssistantStore } from '@/stores/ai-assistant.store';
import { useAuthStore } from '@/stores/auth.store';
import { resolvePublicAssetUrl } from '@/utils/asset-url';
import { cn } from '@/utils/cn';
import { formatClockTime, useNowTick } from './elapsed-time';
import { useTouchLayoutPrefs } from './touch-layout';
import { describeColumnChoice, TouchLayoutDialog } from './touch-layout-dialog';
import {
  canUserAccessTouchRoute,
  hasAnyBackOfficeAccess,
  resolveTouchPrefetchDataPath,
  TOUCH_PATHS,
  TOUCH_ROUTE_CATALOG,
  type TouchRouteMeta,
} from './touch-routes';

const FEATURED_CARD_STYLES: Record<NonNullable<TouchRouteMeta['featuredTone']>, string> = {
  blue: 'border-blue-500/30 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm hover:from-blue-500 hover:to-blue-700',
  sky: 'border-sky-500/30 bg-gradient-to-br from-sky-600 to-cyan-700 text-white shadow-sm hover:from-sky-500 hover:to-cyan-700',
  amber: 'border-amber-500/30 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm hover:from-amber-400 hover:to-orange-600',
  emerald: 'border-emerald-500/30 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm hover:from-emerald-500 hover:to-teal-700',
};

const DRIVER_BADGE_LABELS: Record<string, string> = {
  BROWSER: 'In qua Trình duyệt',
  RAWBT_USB: 'Cáp USB (RawBT)',
  LAN_ESCPOS: 'Mạng LAN (:9100)',
};

export function TouchHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { settings } = useStoreSettings();
  const fullscreen = useFullscreen();
  const [deviceMode, setDeviceMode] = usePosDeviceMode();
  const [layout, setLayout] = useTouchLayoutPrefs();
  const [layoutOpen, setLayoutOpen] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const nowMs = useNowTick(15_000);

  const printerDriver = useThermalPrinterConfigStore((state) => state.config.driver);


  const canViewMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.view);
  const productsQuery = useQuery<Product[]>({
    queryKey: ['menu-products'],
    queryFn: () => apiClient.get<Product[]>('/api/v1/menu/products'),
    enabled: canViewMenu,
    staleTime: 30_000,
    retry: false,
  });

  const unavailableCount = React.useMemo(() => {
    const items = productsQuery.data ?? [];
    return items.filter((item) => !item.isAvailable).length;
  }, [productsQuery.data]);

  const featuredRoutes = React.useMemo(
    () =>
      TOUCH_ROUTE_CATALOG.filter(
        (route) => route.hubSection === 'featured' && canUserAccessTouchRoute(user, route),
      ),
    [user],
  );

  const gridRoutes = React.useMemo(
    () =>
      TOUCH_ROUTE_CATALOG.filter(
        (route) => route.hubSection === 'grid' && canUserAccessTouchRoute(user, route),
      ),
    [user],
  );

  const showBackOfficeBanner = hasAnyBackOfficeAccess(user);
  const logoUrl = buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);
  const avatarUrl = resolvePublicAssetUrl(user?.avatarUrl);
  const displayName = user?.fullName || user?.username || 'Nhân viên';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');



  const handleSyncData = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await queryClient.invalidateQueries();
      toast({
        title: 'Đã đồng bộ dữ liệu mới nhất',
        description: 'Sơ đồ bàn, thực đơn và cấu hình cửa hàng đã được làm mới.',
        variant: 'success',
        duration: 2500,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExitToDesktop = () => {
    void exitAppFullscreen();
    navigate(POS_DEFAULT_PATH);
  };

  const handleLogout = async () => {
    await executeCleanLogout(queryClient);
    navigate('/login', { replace: true });
  };

  const handleOpenRoute = (route: TouchRouteMeta) => {
    navigate(route.touchPath, { state: { from: TOUCH_PATHS.HUB } });
  };

  const handlePrefetchRoute = (route: TouchRouteMeta) => {
    void prefetchRouteChunk(route.touchPath);
    const dataPath = resolveTouchPrefetchDataPath(route);
    if (dataPath) {
      void prefetchRouteData(dataPath).catch(() => undefined);
    }
  };

  const resolveTitle = (route: TouchRouteMeta) =>
    route.navLabelPath
      ? resolveNavLabel(route.navLabelPath, route.label, settings.navLabels)
      : route.label;

  return (
    <div
      data-testid="touch-hub-page"
      className="flex min-h-full w-full flex-col bg-background"
    >
      {/* Thanh đầu trang kiểu iPOS: thông tin tài khoản + nút thao tác hệ thống */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-900 px-3 py-2.5 text-white shadow-sm min-[1100px]:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <StoreBrandLogo
            src={logoUrl}
            storeName={settings.storeName}
            className="h-10 w-10 shrink-0 rounded-xl border border-white/15"
            fallbackClassName="text-xs"
          />
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="hidden h-10 w-10 shrink-0 rounded-full border border-white/20 object-cover sm:block"
            />
          ) : (
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground sm:flex">
              {initials || 'NV'}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold leading-tight">
              {settings.storeName} · {displayName}
            </p>
            <p className="truncate text-xs text-slate-300">
              @{user?.username ?? 'staff'}
              {user?.isSuperAdmin ? ' · Quản trị viên' : ''} ·{' '}
              <span className="font-semibold tabular-nums">
                {formatClockTime(new Date(nowMs).toISOString())}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 min-[1100px]:gap-2">


          {fullscreen.isSupported ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="touch-hub-fullscreen-toggle"
              aria-label={fullscreen.isFullscreen ? 'Thu nhỏ khỏi toàn màn hình' : 'Toàn màn hình'}
              onClick={() => void fullscreen.toggle()}
              className="h-11 w-11 rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {fullscreen.isFullscreen ? <Shrink className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            data-testid="touch-hub-change-password"
            onClick={() =>
              navigate(TOUCH_PATHS.PROFILE, { state: { from: TOUCH_PATHS.HUB } })
            }
            className="h-11 gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20 hover:text-white"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden min-[1100px]:inline">Đổi mật khẩu</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            data-testid="touch-hub-exit-desktop"
            onClick={handleExitToDesktop}
            className="h-11 gap-2 rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 text-sm font-bold text-sky-100 hover:bg-sky-500/35 hover:text-white"
          >
            <Monitor className="h-4 w-4" />
            <span>Bản đầy đủ</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            data-testid="touch-hub-logout"
            onClick={() => void handleLogout()}
            className="h-11 gap-2 rounded-xl border border-rose-400/40 bg-rose-500/20 px-3 text-sm font-bold text-rose-100 hover:bg-rose-500/35 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span>Đăng xuất</span>
          </Button>
        </div>
      </header>

      {/* Nội dung chính */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 p-3 sm:p-4 min-[1100px]:gap-5 min-[1100px]:p-5">
        {/* Hàng tiện ích nhanh (kiểu Đồng bộ / Tải lại cấu hình / Bố cục) */}
        <section
          aria-label="Tiện ích nhanh máy POS"
          className="flex flex-wrap items-center gap-2.5"
        >
          <Button
            type="button"
            variant="outline"
            data-testid="touch-hub-sync"
            disabled={isSyncing}
            onClick={() => void handleSyncData()}
            className="h-12 gap-2 rounded-xl px-4 text-sm font-bold min-[1100px]:text-base"
          >
            <RefreshCw className={cn('h-5 w-5', isSyncing && 'animate-spin')} />
            <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            data-testid="touch-hub-layout-btn"
            onClick={() => setLayoutOpen(true)}
            className="h-12 gap-2 rounded-xl px-4 text-sm font-bold min-[1100px]:text-base"
          >
            <LayoutGrid className="h-5 w-5 text-accent-text" />
            <span>
              Bố cục POS ({describeColumnChoice(layout.tableColumns)} ·{' '}
              {describeColumnChoice(layout.menuColumns)})
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            data-testid="touch-hub-device-mode"
            onClick={() => setDeviceMode(deviceMode === 'touch' ? 'default' : 'touch')}
            className={cn(
              'h-12 gap-2 rounded-xl px-4 text-sm font-bold min-[1100px]:text-base',
              deviceMode === 'touch' &&
                'border-emerald-500/60 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-100',
            )}
          >
            <MonitorSmartphone className="h-5 w-5" />
            <span>
              Luôn mở cảm ứng trên máy này: {deviceMode === 'touch' ? 'ĐANG BẬT' : 'TẮT'}
            </span>
          </Button>

          {settings.aiAssistant.enabled ? (
            <Button
              type="button"
              variant="outline"
              data-testid="touch-hub-ai-btn"
              onClick={() => useAiAssistantStore.getState().openDrawer()}
              className="h-12 gap-2 rounded-xl border-primary/40 bg-primary/5 px-4 text-sm font-bold text-accent-text hover:bg-primary/10 min-[1100px]:text-base"
            >
              <Sparkles className="h-5 w-5" />
              <span>Hỏi Lona AI</span>
            </Button>
          ) : null}
        </section>

        {/* Hàng 4 thẻ nổi bật (kiểu 4 ô xanh nổi bật của iPOS) */}
        {featuredRoutes.length > 0 ? (
          <section aria-label="Quản lý nổi bật" data-testid="touch-hub-featured-section">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {featuredRoutes.map((route) => {
                const Icon = route.icon;
                const toneClass =
                  FEATURED_CARD_STYLES[route.featuredTone ?? 'blue'];
                return (
                  <button
                    key={route.key}
                    type="button"
                    data-testid={`touch-hub-tile-${route.key}`}
                    onPointerDown={() => handlePrefetchRoute(route)}
                    onClick={() => handleOpenRoute(route)}
                    className={cn(
                      'group flex min-h-28 flex-col justify-between rounded-2xl border p-4 text-left transition-transform active:scale-[0.98]',
                      toneClass,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-lg font-extrabold leading-snug">
                        {resolveTitle(route)}
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium text-white/90 sm:text-sm">
                      {route.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Lưới ô chức năng vận hành quầy */}
        {gridRoutes.length > 0 ? (
          <section aria-label="Tiện ích vận hành tại quầy" data-testid="touch-hub-grid-section">
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Nghiệp vụ tại quầy & tài khoản
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {gridRoutes.map((route, index) => {
                const Icon = route.icon;
                const isStockTile = route.key === 'stock-status';
                const isPrinterTile = route.key === 'printer';
                const dynamicHint = isPrinterTile
                  ? DRIVER_BADGE_LABELS[printerDriver] ?? printerDriver
                  : isStockTile && unavailableCount > 0
                    ? `Đang tạm hết ${unavailableCount} món`
                    : route.description;

                return (
                  <button
                    key={route.key}
                    type="button"
                    data-testid={`touch-hub-tile-${route.key}`}
                    onPointerDown={() => handlePrefetchRoute(route)}
                    onClick={() => handleOpenRoute(route)}
                    className="group relative flex min-h-24 items-center gap-3.5 rounded-2xl border bg-card p-4 text-left shadow-xs transition-all hover:border-primary/50 hover:bg-accent/40 active:scale-[0.98]"
                  >
                    <span
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted/60 text-accent-text transition-colors group-hover:bg-primary group-hover:text-primary-foreground',
                        isStockTile &&
                          unavailableCount > 0 &&
                          'border-rose-500/40 bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 whitespace-normal break-words text-base font-extrabold text-foreground">
                          {index + 1}. {resolveTitle(route)}
                        </span>
                        {isStockTile && unavailableCount > 0 ? (
                          <span
                            data-testid="touch-hub-out-of-stock-badge"
                            className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white"
                          >
                            {unavailableCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-muted-foreground">
                        {dynamicHint}
                      </p>
                    </div>

                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Gợi ý mở giao diện đầy đủ cho nhóm Back-office (Giai đoạn 2) */}
        {showBackOfficeBanner ? (
          <section
            data-testid="touch-hub-backoffice-banner"
            className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-muted/40 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">
                Quản trị nhân sự & hệ thống nâng cao
              </p>
              <p className="text-xs text-muted-foreground">
                Hồ sơ Nhân sự, Bảng tính ngày công, Bảng tính lương, Master Data và Phân quyền đang ở giao diện đầy đủ.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleExitToDesktop}
              className="h-11 shrink-0 gap-2 rounded-xl px-4 text-sm font-bold"
            >
              <Monitor className="h-4 w-4" />
              Mở giao diện đầy đủ
            </Button>
          </section>
        ) : null}
      </div>

      <TouchLayoutDialog
        open={layoutOpen}
        onOpenChange={setLayoutOpen}
        prefs={layout}
        onChange={setLayout}
      />
    </div>
  );
}
