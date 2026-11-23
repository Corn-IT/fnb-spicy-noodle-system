import { UpdateUiPreferencesSchema, type UpdateUiPreferencesInput } from '@fnb/shared';

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

/** Rapid changes (for example repeated reorder clicks) are merged into one request. */
export const ACCOUNT_PREFERENCES_DEBOUNCE_MS = 300;

type Waiter = (saved: boolean) => void;

let pendingInput: UpdateUiPreferencesInput = {};
let pendingOwnerId: number | null = null;
let pendingWaiters: Waiter[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let activeRequests = 0;
// Requests run strictly one after another so a slow earlier save can never overwrite a newer one.
let requestChain: Promise<void> = Promise.resolve();
// Bumped on every local change so a slow server snapshot can tell it is already out of date.
let localChangeVersion = 0;

export function getAccountPreferencesVersion(): number {
  return localChangeVersion;
}

function currentUserId(): number | null {
  return useAuthStore.getState().user?.id ?? null;
}

function refreshPendingFlag(): void {
  const hasWork = timer !== null || activeRequests > 0;
  const store = useUiPreferencesStore.getState();
  if (store.accountSyncPending !== hasWork) store.setAccountSyncPending(hasWork);
}

function settle(waiters: Waiter[], saved: boolean): void {
  for (const waiter of waiters) waiter(saved);
}

function dropPending(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  settle(pendingWaiters, false);
  pendingInput = {};
  pendingOwnerId = null;
  pendingWaiters = [];
}

/** Sends everything queued so far. Resolves once the request has finished. */
export function flushAccountPreferences(): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  timer = null;

  const input = pendingInput;
  const ownerId = pendingOwnerId;
  const waiters = pendingWaiters;
  pendingInput = {};
  pendingOwnerId = null;
  pendingWaiters = [];

  if (waiters.length === 0) {
    refreshPendingFlag();
    return requestChain;
  }

  activeRequests += 1;
  requestChain = requestChain.then(async () => {
    try {
      const parsed = UpdateUiPreferencesSchema.safeParse(input);
      // Never send one account's queued change with another account's token.
      if (!parsed.success || ownerId === null || currentUserId() !== ownerId) {
        settle(waiters, false);
        return;
      }
      await apiClient.patch('/api/v1/profile/ui-prefs', parsed.data);
      settle(waiters, true);
    } catch {
      settle(waiters, false);
    } finally {
      activeRequests -= 1;
      refreshPendingFlag();
    }
  });
  refreshPendingFlag();
  return requestChain;
}

/**
 * Queues a per-account UI preference change. Local state is already applied by the caller.
 * Resolves to true once the server has saved it, false if it could not be saved.
 */
export function persistAccountPreferences(input: UpdateUiPreferencesInput): Promise<boolean> {
  const userId = currentUserId();
  if (!useAuthStore.getState().accessToken || userId === null) return Promise.resolve(false);

  if (pendingOwnerId !== null && pendingOwnerId !== userId) dropPending();

  localChangeVersion += 1;
  return new Promise<boolean>((resolve) => {
    pendingInput = { ...pendingInput, ...input };
    pendingOwnerId = userId;
    pendingWaiters.push(resolve);
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void flushAccountPreferences(), ACCOUNT_PREFERENCES_DEBOUNCE_MS);
    refreshPendingFlag();
  });
}

/** Test helper: forget queued work without sending it. */
export function resetAccountPreferencesQueueForTesting(): void {
  dropPending();
  activeRequests = 0;
  requestChain = Promise.resolve();
  useUiPreferencesStore.getState().setAccountSyncPending(false);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAccountPreferences();
  });
  window.addEventListener('pagehide', () => void flushAccountPreferences());
}
