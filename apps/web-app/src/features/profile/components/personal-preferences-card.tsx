import {
  ALLOWED_STORE_NAV_PATHS,
  DISPLAY_SCALE_MAX_PERCENT,
  DISPLAY_SCALE_MIN_PERCENT,
  DISPLAY_SCALE_STEP_PERCENT,
  type UpdateUiPreferencesInput,
} from '@fnb/shared';
import { ArrowDown, ArrowUp, RotateCcw, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import {
  APP_NAVIGATION_GROUPS,
  getAccessibleRoutes,
} from '@/components/layout/command-palette';
import { Button } from '@/components/ui/button';
import { moveWithinSubset } from '@/features/profile/utils/reorder-within-subset';
import { sortNavGroups, sortNavRoutes, useStoreSettings } from '@/hooks/use-store-settings';
import { persistAccountPreferences } from '@/lib/persist-account-preferences';
import { setQrVoiceAlertEnabled } from '@/lib/voice-alert-preference';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';

const SCALE_OPTIONS: number[] = Array.from(
  {
    length:
      (DISPLAY_SCALE_MAX_PERCENT - DISPLAY_SCALE_MIN_PERCENT) / DISPLAY_SCALE_STEP_PERCENT + 1,
  },
  (_, index) => DISPLAY_SCALE_MIN_PERCENT + index * DISPLAY_SCALE_STEP_PERCENT,
);

interface ReorderListItem {
  id: string;
  label: string;
}

interface ReorderListProps {
  ariaLabel: string;
  items: readonly ReorderListItem[];
  moveLabelPrefix: string;
  onMove: (id: string, delta: -1 | 1) => void;
  tone?: 'group' | 'route';
}

function ReorderList({ ariaLabel, items, moveLabelPrefix, onMove, tone = 'route' }: ReorderListProps) {
  return (
    <ul className="space-y-1" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            'flex items-center justify-between rounded-md border px-3 py-1.5 text-sm',
            tone === 'group' && 'bg-muted/30',
          )}
        >
          <span className={cn('min-w-0 break-words', tone === 'group' && 'font-medium')}>
            {item.label}
          </span>
          <span className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0}
              aria-label={`Đưa ${moveLabelPrefix}${item.label} lên`}
              onClick={() => onMove(item.id, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === items.length - 1}
              aria-label={`Đưa ${moveLabelPrefix}${item.label} xuống`}
              onClick={() => onMove(item.id, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Per-account preferences: display scale and menu order. Overrides the store defaults. */
export function PersonalPreferencesCard() {
  const user = useAuthStore((state) => state.user);
  const { settings } = useStoreSettings();
  const userDisplayScale = useUiPreferencesStore((state) => state.userDisplayScale);
  const userNavOrder = useUiPreferencesStore((state) => state.userNavOrder);
  const userNavGroupOrder = useUiPreferencesStore((state) => state.userNavGroupOrder);
  const setUserDisplayScale = useUiPreferencesStore((state) => state.setUserDisplayScale);
  const setUserNavOrder = useUiPreferencesStore((state) => state.setUserNavOrder);
  const setUserNavGroupOrder = useUiPreferencesStore((state) => state.setUserNavGroupOrder);
  const sidebarCollapsed = useUiPreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiPreferencesStore((state) => state.setSidebarCollapsed);
  const userVoiceAlertEnabled = useUiPreferencesStore((state) => state.userVoiceAlertEnabled);
  const setUserVoiceAlertEnabled = useUiPreferencesStore((state) => state.setUserVoiceAlertEnabled);
  const [status, setStatus] = React.useState<string | null>(null);

  const routes = React.useMemo(() => getAccessibleRoutes(user), [user]);
  // The sidebar only lists screens that belong to a permission module. Account-only screens such as
  // the profile are opened from the user menu, so they must not appear in the menu order lists.
  const menuRoutes = React.useMemo(() => routes.filter((route) => route.module), [routes]);
  const effectiveGroupOrder = userNavGroupOrder.length > 0 ? userNavGroupOrder : settings.navGroupOrder;
  const effectiveRouteOrder = userNavOrder.length > 0 ? userNavOrder : settings.navOrder;

  const orderedGroups = React.useMemo(
    () => sortNavGroups([...APP_NAVIGATION_GROUPS], effectiveGroupOrder),
    [effectiveGroupOrder],
  );
  const orderedRoutes = React.useMemo(
    () => sortNavRoutes(menuRoutes, effectiveRouteOrder),
    [menuRoutes, effectiveRouteOrder],
  );

  const persist = React.useCallback(async (input: UpdateUiPreferencesInput) => {
    setStatus('Đang lưu…');
    const saved = await persistAccountPreferences(input);
    setStatus(
      saved
        ? 'Đã lưu cho tài khoản của bạn'
        : 'Không lưu được lên máy chủ, thay đổi chỉ áp dụng tạm trên máy này',
    );
  }, []);

  const effectiveGlobalPercent = userDisplayScale.globalPercent ?? settings.displayScale.globalPercent;

  const handleScaleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = { ...userDisplayScale, globalPercent: Number(event.target.value) };
    setUserDisplayScale(next);
    void persist({ displayScale: next });
  };

  const handleResetScale = () => {
    const next = { perPath: {} };
    setUserDisplayScale(next);
    void persist({ displayScale: next });
  };

  const scalableRoutes = React.useMemo(
    () => routes.filter((route) => (ALLOWED_STORE_NAV_PATHS as readonly string[]).includes(route.path)),
    [routes],
  );

  const handlePathScaleChange = (path: string, rawValue: string) => {
    const nextPerPath = { ...userDisplayScale.perPath };
    if (rawValue === '') {
      delete nextPerPath[path];
    } else {
      nextPerPath[path] = Number(rawValue);
    }
    const next = { ...userDisplayScale, perPath: nextPerPath };
    setUserDisplayScale(next);
    void persist({ displayScale: next });
  };

  const handleToggleCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    void persist({ sidebarCollapsed: collapsed });
  };

  const voiceEnabled = userVoiceAlertEnabled ?? true;
  const handleToggleVoice = (enabled: boolean) => {
    setUserVoiceAlertEnabled(enabled);
    setQrVoiceAlertEnabled(enabled);
    void persist({ voiceAlertEnabled: enabled });
  };

  const orderedRoutePaths = React.useMemo<string[]>(
    () => orderedRoutes.map((route) => route.path),
    [orderedRoutes],
  );

  const routeSections = React.useMemo(() => {
    const standalone = orderedRoutes.filter((route) => !route.group);
    const grouped = orderedGroups
      .map((group) => ({
        key: group.key,
        label: group.label,
        routes: orderedRoutes.filter((route) => route.group === group.key),
      }))
      .filter((section) => section.routes.length > 0);
    // A list with a single entry has nothing to reorder, so it is not shown.
    return {
      standalone: standalone.length > 1 ? standalone : [],
      grouped: grouped.filter((section) => section.routes.length > 1),
    };
  }, [orderedRoutes, orderedGroups]);

  const handleMoveRouteWithin = (siblings: readonly { path: string }[]) => (path: string, delta: -1 | 1) => {
    const next = moveWithinSubset(
      orderedRoutePaths,
      siblings.map((route) => route.path),
      path,
      delta,
    );
    setUserNavOrder(next);
    void persist({ navOrder: next });
  };

  const handleMoveGroup = (key: string, delta: -1 | 1) => {
    const current: string[] = orderedGroups.map((group) => group.key);
    const next = moveWithinSubset(current, current, key, delta);
    setUserNavGroupOrder(next);
    void persist({ navGroupOrder: next });
  };

  const handleResetMenu = () => {
    setUserNavOrder([]);
    setUserNavGroupOrder([]);
    void persist({ navOrder: [], navGroupOrder: [] });
  };

  const hasScaleOverride =
    userDisplayScale.globalPercent !== undefined ||
    Object.keys(userDisplayScale.perPath).length > 0;
  const hasMenuOverride = userNavOrder.length > 0 || userNavGroupOrder.length > 0;

  return (
    <section
      data-testid="profile-personal-preferences-card"
      className="min-w-0 space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-accent-text" />
          Cá nhân của tôi
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chỉ áp dụng khi bạn đăng nhập, không ảnh hưởng tài khoản khác. Nếu để mặc định thì dùng
          thiết lập chung của cửa hàng.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="personal-display-scale" className="text-sm font-medium">
            Tỉ lệ hiển thị
          </label>
          <div className="flex items-center gap-2">
            <select
              id="personal-display-scale"
              data-testid="personal-display-scale-select"
              value={effectiveGlobalPercent}
              onChange={handleScaleChange}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {SCALE_OPTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasScaleOverride}
              onClick={handleResetScale}
              data-testid="personal-display-scale-reset"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Đặt lại
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Mặc định cửa hàng: {settings.displayScale.globalPercent}%.
        </p>
      </div>

      <details className="min-w-0 rounded-md border px-3 py-2" data-testid="personal-per-path-scale">
        <summary className="cursor-pointer text-sm font-medium">
          Tỉ lệ riêng cho từng màn hình
        </summary>
        <ul className="mt-2 grid min-w-0 gap-1.5 sm:grid-cols-2">
          {scalableRoutes.map((route) => (
            <li key={route.path} className="flex min-w-0 items-center justify-between gap-2 text-sm">
              <label htmlFor={`personal-scale-${route.path}`} className="min-w-0 flex-1 break-words">
                {route.label}
              </label>
              <select
                id={`personal-scale-${route.path}`}
                data-testid={`personal-scale-path-${route.path.replace(/\//g, '')}`}
                value={userDisplayScale.perPath[route.path] ?? ''}
                onChange={(event) => handlePathScaleChange(route.path, event.target.value)}
                className="h-8 shrink-0 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">Mặc định</option>
                {SCALE_OPTIONS.map((percent) => (
                  <option key={percent} value={percent}>
                    {percent}%
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </details>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span>Giọng đọc thông báo đơn QR</span>
          <input
            type="checkbox"
            data-testid="personal-voice-toggle"
            checked={voiceEnabled}
            onChange={(event) => handleToggleVoice(event.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span>Thu gọn thanh bên</span>
          <input
            type="checkbox"
            data-testid="personal-sidebar-collapsed-toggle"
            checked={sidebarCollapsed}
            onChange={(event) => handleToggleCollapsed(event.target.checked)}
            className="h-4 w-4"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Thứ tự menu</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasMenuOverride}
            onClick={handleResetMenu}
            data-testid="personal-menu-reset"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Đặt lại
          </Button>
        </div>

        {orderedGroups.length > 1 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Thứ tự các nhóm menu</p>
            <ReorderList
              ariaLabel="Thứ tự nhóm menu"
              tone="group"
              moveLabelPrefix="nhóm "
              items={orderedGroups.map((group) => ({ id: group.key, label: group.label }))}
              onMove={handleMoveGroup}
            />
          </div>
        ) : null}

        {routeSections.standalone.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Màn hình độc lập (nằm trên cùng, ngoài nhóm)
            </p>
            <ReorderList
              ariaLabel="Thứ tự màn hình độc lập"
              moveLabelPrefix=""
              items={routeSections.standalone.map((route) => ({ id: route.path, label: route.label }))}
              onMove={handleMoveRouteWithin(routeSections.standalone)}
            />
          </div>
        ) : null}

        {routeSections.grouped.map((section) => (
          <div key={section.key} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Trong nhóm {section.label}</p>
            <ReorderList
              ariaLabel={`Thứ tự màn hình trong nhóm ${section.label}`}
              moveLabelPrefix=""
              items={section.routes.map((route) => ({ id: route.path, label: route.label }))}
              onMove={handleMoveRouteWithin(section.routes)}
            />
          </div>
        ))}
      </div>

      {status ? (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </section>
  );
}
