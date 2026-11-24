import type { PosTableGridResponse } from '@fnb/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { POS_TABLE_GRID_QUERY_KEY } from '@/lib/pos-table-grid-query';
import { prefetchRouteChunk, prefetchRouteData } from '@/lib/route-prefetch';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';
import {
  canUserAccessTouchRoute,
  resolveTouchPrefetchDataPath,
  TOUCH_BOTTOM_NAV_PATHS,
  TOUCH_PATHS,
  TOUCH_ROUTE_BY_PATH,
  type TouchRouteMeta,
} from './touch-routes';

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function TouchBottomNav() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

  // Đăng ký đọc cache sơ đồ bàn dùng chung với AppShell (không gửi thêm request riêng).
  const tableGridCache = useQuery<PosTableGridResponse | null>({
    queryKey: POS_TABLE_GRID_QUERY_KEY,
    queryFn: () => null,
    enabled: false,
  });

  const pendingQrCount = React.useMemo(() => {
    const tables = tableGridCache.data?.tables ?? [];
    return tables.filter((table) => table.status === 'PENDING').length;
  }, [tableGridCache.data]);

  const items = React.useMemo<TouchRouteMeta[]>(() => {
    return TOUCH_BOTTOM_NAV_PATHS.map((path) => TOUCH_ROUTE_BY_PATH.get(path))
      .filter((item): item is TouchRouteMeta => Boolean(item))
      .filter((item) => canUserAccessTouchRoute(user, item));
  }, [user]);

  const currentPath = stripTrailingSlash(location.pathname);

  const isItemActive = (item: TouchRouteMeta): boolean => {
    if (item.touchPath === TOUCH_PATHS.HUB) {
      return (
        currentPath === TOUCH_PATHS.HUB ||
        (currentPath !== TOUCH_PATHS.POS &&
          currentPath !== TOUCH_PATHS.INVOICES &&
          currentPath !== TOUCH_PATHS.CASHFLOW)
      );
    }
    return currentPath === item.touchPath;
  };

  const handlePrefetch = (item: TouchRouteMeta) => {
    void prefetchRouteChunk(item.touchPath);
    const dataPath = resolveTouchPrefetchDataPath(item);
    if (dataPath) {
      void prefetchRouteData(dataPath).catch(() => undefined);
    }
  };

  return (
    <nav
      aria-label="Điều hướng POS cảm ứng"
      data-testid="touch-bottom-nav"
      className="grid h-16 shrink-0 border-t bg-card px-2 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isItemActive(item);
        const showQrBadge = item.touchPath === TOUCH_PATHS.POS && pendingQrCount > 0;
        return (
          <button
            key={item.key}
            type="button"
            data-testid={`touch-bottom-nav-${item.key}`}
            aria-current={active ? 'page' : undefined}
            onPointerDown={() => handlePrefetch(item)}
            onClick={() => {
              if (currentPath !== item.touchPath) {
                navigate(item.touchPath);
              }
            }}
            className={cn(
              'relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-xs font-bold transition-colors active:scale-[0.97] min-[1100px]:flex-row min-[1100px]:gap-2.5 min-[1100px]:text-base',
              active
                ? 'text-accent-text'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-primary"
              />
            ) : null}
            <span className="relative inline-flex shrink-0">
              <Icon className="h-5 w-5 min-[1100px]:h-6 min-[1100px]:w-6" />
              {showQrBadge ? (
                <span
                  data-testid="touch-bottom-nav-qr-badge"
                  aria-label={`${pendingQrCount} đơn QR chờ duyệt`}
                  className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-extrabold text-white shadow-sm animate-pulse"
                >
                  {pendingQrCount}
                </span>
              ) : null}
            </span>
            <span className="truncate">{item.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}
