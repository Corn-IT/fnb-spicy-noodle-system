import { Flame, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import * as React from 'react';
import { NavLink } from 'react-router-dom';

import {
  APP_NAVIGATION_ROUTES,
  canUserAccessRoute,
} from '@/components/layout/command-palette';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  useUiPreferencesStore,
} from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';

export function ResizableSidebar() {
  const user = useAuthStore((state) => state.user);
  const sidebarWidth = useUiPreferencesStore((state) => state.sidebarWidth);
  const sidebarCollapsed = useUiPreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarWidth = useUiPreferencesStore((state) => state.setSidebarWidth);
  const setSidebarCollapsed = useUiPreferencesStore(
    (state) => state.setSidebarCollapsed,
  );

  const sidebarRef = React.useRef<HTMLElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const syncTimerRef = React.useRef<number | null>(null);

  const visibleMenuRoutes = React.useMemo(
    () =>
      APP_NAVIGATION_ROUTES.filter(
        (route) => route.module && canUserAccessRoute(user, route),
      ),
    [user],
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
      setSidebarWidth(latestWidth);
      scheduleServerSync(latestWidth);
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
      <div className="flex h-14 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Flame className="h-5 w-5" />
          </div>
          {!sidebarCollapsed ? (
            <div className="flex flex-col truncate">
              <span className="truncate text-sm font-bold tracking-tight">
                MÌ CAY SƠN BẢO
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                POS & Vận hành 60fps
              </span>
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Điều hướng chính">
        {visibleMenuRoutes.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              title={sidebarCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  sidebarCollapsed && 'justify-center px-2',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed ? (
                <span className="truncate">{item.label}</span>
              ) : null}
            </NavLink>
          );
        })}
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
  const user = useAuthStore((state) => state.user);
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
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Flame className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">MÌ CAY SƠN BẢO</span>
            <span className="text-[11px] text-muted-foreground">POS & Vận hành</span>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Điều hướng di động">
        {visibleMenuRoutes.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
