import * as React from 'react';

import {
  decrementSuspensePending,
  incrementSuspensePending,
} from './suspense-tracker';

export const DEFAULT_LOADING_DELAY_MS = 150;

export interface DelayedRenderProps {
  delayMs?: number;
  trackSuspense?: boolean;
  children: React.ReactNode;
}

export function DelayedRender({
  delayMs = DEFAULT_LOADING_DELAY_MS,
  trackSuspense = false,
  children,
}: DelayedRenderProps) {
  const [visible, setVisible] = React.useState(delayMs <= 0);

  React.useEffect(() => {
    if (trackSuspense) {
      incrementSuspensePending();
    }

    if (delayMs <= 0) {
      setVisible(true);
      return () => {
        if (trackSuspense) {
          decrementSuspensePending();
        }
      };
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (trackSuspense) {
        decrementSuspensePending();
      }
    };
  }, [delayMs, trackSuspense]);

  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
