import { StoreAssetKind } from '@fnb/shared';
import { Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import {
  APP_NAVIGATION_ROUTES,
  type AppNavigationRoute,
  buildOrderedNavigationSections,
  canUserAccessRoute,
} from '@/components/layout/command-palette';
import { startPendingNavigation, usePendingRoutePath } from '@/components/loading';
import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Button } from '@/components/ui/button';
import {
  buildStoreAssetUrl,
  resolveNavLabel,
  sortNavRoutes,
  useStoreSettings,
} from '@/hooks/use-store-settings';
import { useEffectiveNavOrder } from '@/hooks/use-effective-nav-order';
import { apiClient } from '@/lib/api-client';
import { persistAccountPreferences } from '@/lib/persist-account-preferences';
import {
  cancelRoutePrefetch,
  prefetchRouteChunk,
  scheduleRoutePrefetch,
} from '@/lib/route-prefetch';
import { useAuthStore } from '@/stores/auth.store';
import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  useUiPreferencesStore,
} from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';

interface SidebarRouteGroupsProps {
  routes: readonly AppNavigationRoute[];
  navLabels: Record<string, string>;
  navGroupLabels?: Record<string, string>;
  navGroupOrder?: readonly string[];
  navOrder?: readonly string[];
  collapsed?: boolean;
  onNavigate?: () => void;
  linkClassName?: string;
}

function SidebarRouteGroups({
  routes,
  navLabels,
  navGroupLabels,
  navGroupOrder,
  navOrder,
  collapsed = false,
  onNavigate,
  linkClassName,
}: SidebarRouteGroupsProps) {
  const location = useLocation();
  const pendingRoutePath = usePendingRoutePath();
  const standaloneRoutes = React.useMemo(
    () =>
      sortNavRoutes(
        routes.filter((route) => !route.group),
        navOrder,
      ),
    [routes, navOrder],
  );
  const sections = React.useMemo(
    () =>
      buildOrderedNavigationSections(routes, {
        navGroupLabels: navGroupLabels ?? {},
        navGroupOrder: navGroupOrder ?? [],
        navOrder: navOrder ?? [],
      }),
    [routes, navGroupLabels, navGroupOrder, navOrder],
  );

  const renderNavLink = (item: AppNavigationRoute) => {
    const Icon = item.icon;
    const label = resolveNavLabel(item.path, item.label, navLabels);
    const isPendingTarget = pendingRoutePath === item.path;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onPointerDown={(event) => {
          if (event.button === 0) {
            void prefetchRouteChunk(item.path);
          }
        }}
        onClick={(event) => {
          cancelRoutePrefetch(item.path);
          if (!event.defaultPrevented && location.pathname !== item.path) {
            startPendingNavigation(item.path);
          }
          onNavigate?.();
        }}
        onMouseEnter={() => scheduleRoutePrefetch(item.path)}
        onMouseLeave={() => cancelRoutePrefetch(item.path)}
        onFocus={() => scheduleRoutePrefetch(item.path)}
        onBlur={() => cancelRoutePrefetch(item.path)}
        title={collapsed ? label : undefined}
        aria-busy={isPendingTarget || undefined}
        className={({ isActive }) => {
          const highlighted = isPendingTarget || (isActive && !pendingRoutePath);
          return cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            highlighted
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            collapsed && 'justify-center px-2',
            linkClassName,
          );
        }}
      >
        {isPendingTarget && collapsed ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Icon className="h-4 w-4 shrink-0" />
        )}
        {!collapsed ? <span className="truncate">{label}</span> : null}
        {isPendingTarget && !collapsed ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin opacity-85" />
        ) : null}
      </NavLink>
    );
  };

  return (
    <div className="space-y-3">
      {standaloneRoutes.length > 0 ? (
        <div
          data-testid="sidebar-standalone-routes"
          className={cn('space-y-1', sections.length > 0 && 'border-b border-border/60 pb-2.5')}
        >
          {standaloneRoutes.map(renderNavLink)}
        </div>
      ) : null}
      {sections.map((section, sectionIndex) => (
        <div key={section.key} data-testid={`sidebar-group-${section.key}`}>
          {collapsed ? (
            sectionIndex > 0 ? <div className="mx-2 my-1.5 border-t border-border/60" /> : null
          ) : (
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </p>
          )}
          <div className="space-y-1">{section.items.map(renderNavLink)}</div>
        </div>
      ))}
    </div>
  );
}

export function ResizableSidebar() {
  const effectiveNavOrder = useEffectiveNavOrder();
  const user = useAuthStore((state) => state.user);
  const { settings } = useStoreSettings();
  const logoUrl = buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);
  const sidebarWidth = useUiPreferencesStore((state) => state.sidebarWidth);
  const sidebarCollapsed = useUiPreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarWidth = useUiPreferencesStore((state) => state.setSidebarWidth);
  const setSidebarCollapsed = useUiPreferencesStore(
    (state) => state.setSidebarCollapsed,
  );

  const sidebarRef = React.useRef<HTMLElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const syncTimerRef = React.useRef<number | null>(null);
  const dragCleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  const visibleMenuRoutes = React.useMemo(
    () =>
      APP_NAVIGATION_ROUTES.filter(
        (route) => route.module && canUserAccessRoute(user, route),
      ),
    [user],
  );

  const handleSetCollapsed = React.useCallback(
    (collapsed: boolean) => {
      setSidebarCollapsed(collapsed);
      void persistAccountPreferences({ sidebarCollapsed: collapsed });
    },
    [setSidebarCollapsed],
  );

  const scheduleServerSync = React.useCallback((nextWidth: number) => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      if (useAuthStore.getState().accessToken) {
        void apiClient
          .patch('/api/v1/profile/ui-prefs', { sidebarWidth: nextWidth })
          .catch(() => {});
      }
    }, 500);
  }, []);

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (sidebarCollapsed) return;

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let latestWidth = startWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = clampSidebarWidth(startWidth + delta);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = window.requestAnimationFrame(() => {
        if (sidebarRef.current) {
          sidebarRef.current.style.width = `${latestWidth}px`;
        }
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
      setSidebarWidth(latestWidth);
      scheduleServerSync(latestWidth);
    };

    dragCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <aside
      ref={sidebarRef}
      style={{
        width: sidebarCollapsed ? 68 : sidebarWidth,
        minWidth: sidebarCollapsed ? 68 : MIN_SIDEBAR_WIDTH,
        maxWidth: sidebarCollapsed ? 68 : MAX_SIDEBAR_WIDTH,
      }}
      className="relative hidden h-screen shrink-0 select-none flex-col border-r bg-card text-card-foreground transition-[width] duration-75 lg:flex"
    >
      <div
        className={cn(
          'flex h-14 items-center border-b',
          sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3',
        )}
      >
        <div
          data-testid="sidebar-brand"
          className="flex items-center gap-2.5 overflow-hidden"
        >
          <StoreBrandLogo
            src={logoUrl}
            storeName={settings.storeName}
            testId="sidebar-logo"
            className="h-9 w-9 rounded-lg"
            fallbackClassName="text-xs"
          />
          {!sidebarCollapsed ? (
            <div className="flex flex-col truncate">
              <span className="truncate text-sm font-bold tracking-tight">
                {settings.storeName}
              </span>
              {settings.subtitle ? (
                <span className="truncate text-[11px] text-muted-foreground">
                  {settings.subtitle}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {!sidebarCollapsed ? (
          <Button
            variant="ghost"
            size="icon"
            data-testid="sidebar-collapse-btn"
            className="shrink-0"
            onClick={() => handleSetCollapsed(true)}
            title="Thu gọn thanh bên"
            aria-label="Thu gọn thanh bên"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {sidebarCollapsed ? (
        <div className="px-2 pt-2">
          <Button
            variant="ghost"
            size="icon"
            data-testid="sidebar-expand-btn"
            className="h-8 w-full rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => handleSetCollapsed(false)}
            title="Mở rộng thanh bên"
            aria-label="Mở rộng thanh bên"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Điều hướng chính">
        <SidebarRouteGroups
          routes={visibleMenuRoutes}
          navLabels={settings.navLabels}
          navGroupLabels={settings.navGroupLabels}
          navGroupOrder={effectiveNavOrder.navGroupOrder}
          navOrder={effectiveNavOrder.navOrder}
          collapsed={sidebarCollapsed}
        />
      </nav>

      {!sidebarCollapsed ? (
        <div
          data-testid="sidebar-resizer"
          onMouseDown={handleResizeStart}
          title="Kéo để thay đổi độ rộng thanh bên (200px - 360px)"
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/50"
        />
      ) : null}
    </aside>
  );
}

export function MobileSidebarNav({ onClose }: { onClose: () => void }) {
  const effectiveNavOrder = useEffectiveNavOrder();
  const user = useAuthStore((state) => state.user);
  const { settings } = useStoreSettings();
  const logoUrl = buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);
  const visibleMenuRoutes = React.useMemo(
    () =>
      APP_NAVIGATION_ROUTES.filter(
        (route) => route.module && canUserAccessRoute(user, route),
      ),
    [user],
  );

  return (
    <div className="flex h-full select-none flex-col bg-card text-card-foreground">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <StoreBrandLogo
            src={logoUrl}
            storeName={settings.storeName}
            className="h-9 w-9 rounded-lg"
            fallbackClassName="text-xs"
          />
          <div className="flex flex-col truncate">
            <span className="truncate text-sm font-bold tracking-tight">{settings.storeName}</span>
            {settings.subtitle ? (
              <span className="truncate text-[11px] text-muted-foreground">{settings.subtitle}</span>
            ) : null}
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Điều hướng di động">
        <SidebarRouteGroups
          routes={visibleMenuRoutes}
          navLabels={settings.navLabels}
          navGroupLabels={settings.navGroupLabels}
          navGroupOrder={effectiveNavOrder.navGroupOrder}
          navOrder={effectiveNavOrder.navOrder}
          onNavigate={onClose}
          linkClassName="px-3.5 py-3"
        />
      </nav>
    </div>
  );
}
