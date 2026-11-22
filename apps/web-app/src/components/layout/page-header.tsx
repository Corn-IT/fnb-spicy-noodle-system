import * as React from 'react';
import { APP_NAVIGATION_ROUTE_MAP } from '@/components/layout/command-palette';
import { resolvePageHeader, useStoreSettings } from '@/hooks/use-store-settings';
import { cn } from '@/utils/cn';

export interface PageHeaderProps {
  path: string;
  defaultTitle?: string;
  defaultSubtitle?: string;
  defaultSubtitleNode?: React.ReactNode;
  icon?: React.ReactNode;
  leadingVisual?: React.ReactNode;
  actions?: React.ReactNode;
  hideWhenDefault?: boolean;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  titleTestId?: string;
  subtitleTestId?: string;
}

/**
 * Renders a dynamic page H1, optional subtitle (with reactive fallback node), and responsive action buttons.
 */
export function PageHeader({
  path,
  defaultTitle,
  defaultSubtitle,
  defaultSubtitleNode,
  icon,
  leadingVisual,
  actions,
  hideWhenDefault = false,
  className,
  titleClassName,
  subtitleClassName,
  titleTestId,
  subtitleTestId,
}: PageHeaderProps) {
  const { settings } = useStoreSettings();
  const routeDefaults = APP_NAVIGATION_ROUTE_MAP.get(path);

  const resolved = resolvePageHeader(
    path,
    {
      title: defaultTitle ?? routeDefaults?.defaultPageTitle ?? '',
      subtitle: defaultSubtitle ?? routeDefaults?.defaultPageSubtitle,
    },
    settings.pageHeaders,
  );

  if (hideWhenDefault && !resolved.isCustomized) {
    return null;
  }

  const subtitleContent = resolved.hasCustomSubtitle
    ? resolved.subtitle
    : defaultSubtitleNode ?? resolved.subtitle;

  const titleAndSubtitle = (
    <div className="min-w-0 flex-1 space-y-1">
      <h1
        data-testid={titleTestId ?? 'page-header-title'}
        className={cn(
          'flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight text-foreground',
          titleClassName,
        )}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 break-words">{resolved.title}</span>
      </h1>
      {subtitleContent ? (
        <p
          data-testid={subtitleTestId ?? 'page-header-subtitle'}
          className={cn('text-xs sm:text-sm text-muted-foreground', subtitleClassName)}
        >
          {subtitleContent}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      data-testid="page-header"
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      {leadingVisual ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {leadingVisual}
          {titleAndSubtitle}
        </div>
      ) : (
        titleAndSubtitle
      )}
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
