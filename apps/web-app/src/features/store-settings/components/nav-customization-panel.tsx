import type { StoreSettings } from '@fnb/shared';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import * as React from 'react';

import {
  APP_NAVIGATION_GROUPS,
  type AppNavigationGroupKey,
  type AppNavigationRoute,
  buildOrderedNavigationSections,
} from '@/components/layout/command-palette';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sortNavRoutes } from '@/hooks/use-store-settings';

function moveArrayItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) {
    next.splice(targetIndex, 0, moved);
  }
  return next;
}

function areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, idx) => value === b[idx]);
}

const DEFAULT_GROUP_ORDER = APP_NAVIGATION_GROUPS.map((group) => group.key);

export interface NavCustomizationPanelProps {
  draft: StoreSettings;
  setDraft: React.Dispatch<React.SetStateAction<StoreSettings>>;
  canUpdate: boolean;
  editableRoutes: readonly AppNavigationRoute[];
}

export function NavCustomizationPanel({
  draft,
  setDraft,
  canUpdate,
  editableRoutes,
}: NavCustomizationPanelProps) {
  const sections = React.useMemo(
    () => buildOrderedNavigationSections(editableRoutes, draft),
    [editableRoutes, draft],
  );

  const standaloneRoutes = React.useMemo(
    () => sortNavRoutes(editableRoutes.filter((route) => !route.group), draft.navOrder),
    [editableRoutes, draft.navOrder],
  );

  const defaultGroupedRouteOrder = React.useMemo(
    () => buildOrderedNavigationSections(editableRoutes).flatMap((s) => s.items.map((r) => r.path)),
    [editableRoutes],
  );

  const hasStructureCustomization =
    draft.navGroupOrder.length > 0 ||
    draft.navOrder.length > 0 ||
    Object.keys(draft.navGroupLabels).length > 0;

  const handleMoveGroup = (sectionIndex: number, direction: -1 | 1) => {
    setDraft((prev) => {
      const currentKeys = buildOrderedNavigationSections(editableRoutes, prev).map((s) => s.key);
      const nextKeys = moveArrayItem(currentKeys, sectionIndex, direction);
      return {
        ...prev,
        navGroupOrder: areStringArraysEqual(nextKeys, DEFAULT_GROUP_ORDER) ? [] : nextKeys,
      };
    });
  };

  const handleMoveRouteInGroup = (
    groupKey: AppNavigationGroupKey,
    routeIndex: number,
    direction: -1 | 1,
  ) => {
    setDraft((prev) => {
      // Persist item order independent of group order so reordering a group does not mutate item order.
      const nextNavOrder = APP_NAVIGATION_GROUPS.flatMap((group) => {
        const groupRoutes = sortNavRoutes(
          editableRoutes.filter((route) => route.group === group.key),
          prev.navOrder,
        );
        const ordered =
          group.key === groupKey ? moveArrayItem(groupRoutes, routeIndex, direction) : groupRoutes;
        return ordered.map((route) => route.path);
      });

      return {
        ...prev,
        navOrder: areStringArraysEqual(nextNavOrder, defaultGroupedRouteOrder) ? [] : nextNavOrder,
      };
    });
  };

  const renderRouteRow = (
    route: AppNavigationRoute,
    options?: { groupKey: AppNavigationGroupKey; index: number; total: number },
  ) => {
    const customNav = draft.navLabels[route.path] ?? '';
    const customHeader = draft.pageHeaders[route.path];
    const customTitle = customHeader?.title ?? '';
    const customSubtitle = customHeader?.subtitle ?? '';
    const hasCustom =
      customNav.trim().length > 0 ||
      customTitle.trim().length > 0 ||
      customSubtitle.trim().length > 0;
    const Icon = route.icon;

    const updatePageHeaderField = (field: 'title' | 'subtitle', nextVal: string) => {
      setDraft((prev) => {
        const existing = prev.pageHeaders[route.path] ?? { title: '', subtitle: '' };
        const updated = { ...existing, [field]: nextVal };
        const nextHeaders = { ...prev.pageHeaders };
        if (updated.title.trim().length === 0 && updated.subtitle.trim().length === 0) {
          delete nextHeaders[route.path];
        } else {
          nextHeaders[route.path] = updated;
        }
        return { ...prev, pageHeaders: nextHeaders };
      });
    };

    return (
      <div
        key={route.path}
        data-testid={`nav-route-row-${route.path}`}
        className="space-y-3 p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {options ? (
              <div
                className="flex shrink-0 items-center gap-1"
                role="group"
                aria-label={`Sắp xếp vị trí ${route.label}`}
              >
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={!canUpdate || options.index === 0}
                  data-testid={`nav-move-up-${route.path}`}
                  aria-label={`Đưa ${route.label} lên`}
                  title="Đưa menu lên trên"
                  onClick={() => handleMoveRouteInGroup(options.groupKey, options.index, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={!canUpdate || options.index === options.total - 1}
                  data-testid={`nav-move-down-${route.path}`}
                  aria-label={`Đưa ${route.label} xuống`}
                  title="Đưa menu xuống dưới"
                  onClick={() => handleMoveRouteInGroup(options.groupKey, options.index, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}

            <Icon className="h-4 w-4 shrink-0 text-accent-text" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {route.label}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">{route.path}</span>
                {route.path === '/pos' ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Mặc định ẩn trên POS để tối đa không gian
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canUpdate || !hasCustom}
            data-testid={`nav-label-reset-${route.path}`}
            onClick={() => {
              setDraft((prev) => {
                const nextNav = { ...prev.navLabels };
                delete nextNav[route.path];
                const nextHeaders = { ...prev.pageHeaders };
                delete nextHeaders[route.path];
                return { ...prev, navLabels: nextNav, pageHeaders: nextHeaders };
              });
            }}
            title="Khôi phục tên và tiêu đề mặc định cho màn hình này"
            className="h-8 shrink-0 gap-1 px-2.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Mặc định</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
          <div className="min-w-0 space-y-1 lg:col-span-3">
            <label
              htmlFor={`nav-label-${route.path}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Tên menu (Sidebar / Ctrl+K)
            </label>
            <Input
              id={`nav-label-${route.path}`}
              data-testid={`nav-label-input-${route.path}`}
              maxLength={40}
              disabled={!canUpdate}
              value={customNav}
              onChange={(e) => {
                const nextVal = e.target.value;
                setDraft((prev) => {
                  const nextNav = { ...prev.navLabels };
                  if (nextVal.trim().length === 0) {
                    delete nextNav[route.path];
                  } else {
                    nextNav[route.path] = nextVal;
                  }
                  return { ...prev, navLabels: nextNav };
                });
              }}
              placeholder={route.label}
              className="h-9 text-sm"
            />
          </div>

          <div className="min-w-0 space-y-1 lg:col-span-4">
            <label
              htmlFor={`page-title-${route.path}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Tiêu đề trang (H1)
            </label>
            <Input
              id={`page-title-${route.path}`}
              data-testid={`page-title-input-${route.path}`}
              maxLength={80}
              disabled={!canUpdate}
              value={customTitle}
              onChange={(e) => updatePageHeaderField('title', e.target.value)}
              placeholder={route.defaultPageTitle}
              className="h-9 text-sm"
            />
          </div>

          <div className="min-w-0 space-y-1 md:col-span-2 lg:col-span-5">
            <label
              htmlFor={`page-subtitle-${route.path}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Mô tả trang (Subtitle)
            </label>
            <Input
              id={`page-subtitle-${route.path}`}
              data-testid={`page-subtitle-input-${route.path}`}
              maxLength={200}
              disabled={!canUpdate}
              value={customSubtitle}
              onChange={(e) => updatePageHeaderField('subtitle', e.target.value)}
              placeholder={route.defaultPageSubtitle || 'Mô tả động mặc định theo nghiệp vụ'}
              className="h-9 text-sm"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sắp xếp thứ tự hiển thị mặc định toàn quán và tuỳ chỉnh Tiêu đề gom (tối đa 40 ký tự), Tên menu (tối đa 40
          ký tự), Tiêu đề trang (H1, tối đa 80 ký tự) và Mô tả trang (Subtitle, tối đa 200 ký tự).
          Tên menu, tiêu đề trang và thứ tự nhóm/menu áp dụng chung cho mọi tài khoản; các màn hình vẫn được lọc theo quyền truy cập.
        </p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canUpdate || !hasStructureCustomization}
          data-testid="nav-reset-structure-btn"
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              navGroupLabels: {},
              navGroupOrder: [],
              navOrder: [],
            }))
          }
          className="h-8 shrink-0 gap-1.5 self-start px-3 text-xs sm:self-center"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Khôi phục thứ tự & tên nhóm</span>
        </Button>
      </div>

      <div className="space-y-4">
        {sections.map((section, sectionIndex) => {
          const customGroupLabel = draft.navGroupLabels[section.key] ?? '';
          const hasCustomGroupLabel = customGroupLabel.trim().length > 0;

          return (
            <section
              key={section.key}
              data-testid={`nav-group-card-${section.key}`}
              className="min-w-0 overflow-hidden rounded-xl border bg-background/40"
            >
              <div className="flex flex-col gap-3 border-b bg-muted/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div
                    className="flex shrink-0 items-center gap-1"
                    role="group"
                    aria-label={`Sắp xếp nhóm ${section.defaultLabel}`}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={!canUpdate || sectionIndex === 0}
                      data-testid={`nav-group-move-up-${section.key}`}
                      aria-label={`Đưa nhóm ${section.defaultLabel} lên`}
                      title="Đưa nhóm lên trên"
                      onClick={() => handleMoveGroup(sectionIndex, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={!canUpdate || sectionIndex === sections.length - 1}
                      data-testid={`nav-group-move-down-${section.key}`}
                      aria-label={`Đưa nhóm ${section.defaultLabel} xuống`}
                      title="Đưa nhóm xuống dưới"
                      onClick={() => handleMoveGroup(sectionIndex, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Nhóm #{sectionIndex + 1}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Gốc: {section.defaultLabel}
                      </span>
                    </div>
                    <Input
                      id={`nav-group-label-${section.key}`}
                      data-testid={`nav-group-label-input-${section.key}`}
                      aria-label={`Tên nhóm menu ${section.defaultLabel}`}
                      maxLength={40}
                      disabled={!canUpdate}
                      value={customGroupLabel}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setDraft((prev) => {
                          const nextGroupLabels = { ...prev.navGroupLabels };
                          if (nextVal.trim().length === 0) {
                            delete nextGroupLabels[section.key];
                          } else {
                            nextGroupLabels[section.key] = nextVal;
                          }
                          return { ...prev, navGroupLabels: nextGroupLabels };
                        });
                      }}
                      placeholder={section.defaultLabel}
                      className="h-8 text-xs font-semibold uppercase tracking-wider"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!canUpdate || !hasCustomGroupLabel}
                  data-testid={`nav-group-reset-${section.key}`}
                  onClick={() => {
                    setDraft((prev) => {
                      const nextGroupLabels = { ...prev.navGroupLabels };
                      delete nextGroupLabels[section.key];
                      return { ...prev, navGroupLabels: nextGroupLabels };
                    });
                  }}
                  title="Khôi phục tiêu đề gom mặc định"
                  className="h-8 shrink-0 gap-1 self-end px-2.5 text-xs sm:self-center"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Mặc định nhóm</span>
                </Button>
              </div>

              <div className="divide-y">
                {section.items.map((route, routeIndex) =>
                  renderRouteRow(route, {
                    groupKey: section.key,
                    index: routeIndex,
                    total: section.items.length,
                  }),
                )}
              </div>
            </section>
          );
        })}

        {standaloneRoutes.length > 0 ? (
          <section
            data-testid="nav-group-card-standalone"
            className="min-w-0 overflow-hidden rounded-xl border bg-background/40"
          >
            <div className="border-b bg-muted/40 px-3.5 py-2.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Màn hình khác (Ngoài nhóm Sidebar)
              </div>
            </div>
            <div className="divide-y">{standaloneRoutes.map((route) => renderRouteRow(route))}</div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
