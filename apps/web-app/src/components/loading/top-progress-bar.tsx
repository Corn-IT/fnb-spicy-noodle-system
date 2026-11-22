import { useIsFetching } from '@tanstack/react-query';
import * as React from 'react';

import { cn } from '@/utils/cn';

import { DEFAULT_LOADING_DELAY_MS } from './delayed-render';
import { usePendingRoutePath, useSuspensePendingCount } from './suspense-tracker';

export interface TopProgressBarProps {
  delayMs?: number;
  className?: string;
}

export function TopProgressBar({
  delayMs = DEFAULT_LOADING_DELAY_MS,
  className,
}: TopProgressBarProps) {
  const fetchingCount = useIsFetching();
  const suspenseCount = useSuspensePendingCount();
  const pendingRoutePath = usePendingRoutePath();
  const isRouteTransitioning = pendingRoutePath !== null;
  const isBackgroundBusy = fetchingCount > 0 || suspenseCount > 0;
  const [delayedVisible, setDelayedVisible] = React.useState(false);

  React.useEffect(() => {
    if (!isBackgroundBusy) {
      setDelayedVisible(false);
      return;
    }

    if (delayMs <= 0) {
      setDelayedVisible(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setDelayedVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isBackgroundBusy, delayMs]);

  if (!isRouteTransitioning && !delayedVisible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-testid="top-progress-bar"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15',
        className,
      )}
    >
      <div className="animate-top-progress h-full w-1/2 rounded-r-full bg-primary" />
    </div>
  );
}
