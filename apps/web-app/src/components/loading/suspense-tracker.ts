import * as React from 'react';

const PENDING_NAVIGATION_TIMEOUT_MS = 10_000;

let pendingSuspenseCount = 0;
let pendingRoutePath: string | null = null;
let pendingRouteTimer: number | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function incrementSuspensePending(): void {
  pendingSuspenseCount += 1;
  notifyListeners();
}

export function decrementSuspensePending(): void {
  pendingSuspenseCount = Math.max(0, pendingSuspenseCount - 1);
  notifyListeners();
}

export function getSuspensePendingCount(): number {
  return pendingSuspenseCount;
}

export function startPendingNavigation(path: string): void {
  if (pendingRouteTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pendingRouteTimer);
    pendingRouteTimer = null;
  }

  if (pendingRoutePath !== path) {
    pendingRoutePath = path;
    notifyListeners();
  }

  if (typeof window !== 'undefined') {
    pendingRouteTimer = window.setTimeout(() => {
      pendingRouteTimer = null;
      if (pendingRoutePath !== null) {
        pendingRoutePath = null;
        notifyListeners();
      }
    }, PENDING_NAVIGATION_TIMEOUT_MS);
  }
}

export function clearPendingNavigation(expectedPath?: string): void {
  if (expectedPath !== undefined && pendingRoutePath !== expectedPath) {
    return;
  }
  if (pendingRouteTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pendingRouteTimer);
    pendingRouteTimer = null;
  }
  if (pendingRoutePath !== null) {
    pendingRoutePath = null;
    notifyListeners();
  }
}

export function getPendingRoutePath(): string | null {
  return pendingRoutePath;
}

export function subscribeSuspensePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSuspensePendingCount(): number {
  return React.useSyncExternalStore(
    subscribeSuspensePending,
    getSuspensePendingCount,
    getSuspensePendingCount,
  );
}

export function usePendingRoutePath(): string | null {
  return React.useSyncExternalStore(
    subscribeSuspensePending,
    getPendingRoutePath,
    getPendingRoutePath,
  );
}
