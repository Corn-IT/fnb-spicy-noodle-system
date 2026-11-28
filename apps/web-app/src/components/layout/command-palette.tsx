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
import { resolveNavLabel, sortNavRoutes, useStoreSettings } from '@/hooks/use-store-settings';
import { useEffectiveNavOrder } from '@/hooks/use-effective-nav-order';
import {
  type AppNavigationRoute,
  buildOrderedNavigationSections,
  getAccessibleRoutes,
} from '@/lib/app-navigation';
import {
  cancelRoutePrefetch,
  prefetchRouteChunk,
  scheduleRoutePrefetch,
} from '@/lib/route-prefetch';
import { useAuthStore } from '@/stores/auth.store';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const user = useAuthStore((state) => state.user);
  const { settings: storeSettings } = useStoreSettings();
  const effectiveNavOrder = useEffectiveNavOrder();
  const settings = React.useMemo(
    () => ({ ...storeSettings, ...effectiveNavOrder }),
    [storeSettings, effectiveNavOrder],
  );
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
