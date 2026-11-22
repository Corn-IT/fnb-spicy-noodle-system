import {
  type PosOrderSummary,
  type PosTableGridResponse,
  type QrReminderConfig,
} from '@fnb/shared';
import * as React from 'react';

import {
  enqueueQrVoiceAlert,
  getActiveQrReminderConfig,
  type QrVoiceAlertItem,
  type QrVoiceAlertKind,
} from './qr-voice-announcer';

export const QR_REMINDER_SENT_STORAGE_KEY = 'fnb-qr-reminder-sent' as const;
const REMINDER_TICK_INTERVAL_MS = 5000;

export interface PendingQrItem {
  key: string;
  orderId: number;
  orderCode: string;
  tableLabel: string;
  kind: QrVoiceAlertKind;
  sinceIso: string;
  sinceMs: number;
}

export interface OrderPendingAlertState {
  isPendingQr: boolean;
  isOverdue: boolean;
  kind: QrVoiceAlertKind | null;
  sinceMs: number | null;
  elapsedMs: number;
  elapsedMinutes: number;
  remainingBeforeCancelMs: number | null;
  remainingBeforeCancelMinutes: number | null;
}

export function buildPendingQrKey(orderId: number, kind: QrVoiceAlertKind, sinceIso: string): string {
  return `${orderId}:${kind}:${sinceIso}`;
}

export function collectPendingQrItems(
  tableGrid: PosTableGridResponse | undefined | null,
): PendingQrItem[] {
  if (!tableGrid?.tables) return [];
  const items: PendingQrItem[] = [];

  for (const table of tableGrid.tables) {
    const order = table.activeOrder;
    if (!order) continue;

    let kind: QrVoiceAlertKind | null = null;
    if (order.pendingQrKind === 'NEW' || order.pendingQrKind === 'ADDON') {
      kind = order.pendingQrKind;
    } else if (order.pendingQrKind === undefined && table.status === 'PENDING' && order.status === 'PENDING') {
      kind = 'NEW';
    }

    if (!kind) continue;
    const sinceIso = order.pendingQrSince ?? (kind === 'NEW' ? order.createdAt : null);
    if (!sinceIso) continue;
    const sinceMs = Date.parse(sinceIso);
    if (!Number.isFinite(sinceMs)) continue;

    items.push({
      key: buildPendingQrKey(order.orderId, kind, sinceIso),
      orderId: order.orderId,
      orderCode: order.orderCode,
      tableLabel: order.tableLabel ?? table.name,
      kind,
      sinceIso,
      sinceMs,
    });
  }

  return items.sort((a, b) => a.sinceMs - b.sinceMs || a.orderId - b.orderId);
}

export function evaluateOrderPendingAlert(
  order: PosOrderSummary | null | undefined,
  tableStatus: 'AVAILABLE' | 'PENDING' | 'OCCUPIED' | undefined,
  nowMs: number,
  config: QrReminderConfig = getActiveQrReminderConfig(),
): OrderPendingAlertState {
  if (!order) {
    return {
      isPendingQr: false,
      isOverdue: false,
      kind: null,
      sinceMs: null,
      elapsedMs: 0,
      elapsedMinutes: 0,
      remainingBeforeCancelMs: null,
      remainingBeforeCancelMinutes: null,
    };
  }

  let kind: QrVoiceAlertKind | null = null;
  if (order.pendingQrKind === 'NEW' || order.pendingQrKind === 'ADDON') {
    kind = order.pendingQrKind;
  } else if (order.pendingQrKind === undefined && tableStatus === 'PENDING' && order.status === 'PENDING') {
    kind = 'NEW';
  }

  if (!kind) {
    return {
      isPendingQr: false,
      isOverdue: false,
      kind: null,
      sinceMs: null,
      elapsedMs: 0,
      elapsedMinutes: 0,
      remainingBeforeCancelMs: null,
      remainingBeforeCancelMinutes: null,
    };
  }

  const sinceIso = order.pendingQrSince ?? (kind === 'NEW' ? order.createdAt : null);
  const sinceMs = sinceIso ? Date.parse(sinceIso) : Number.NaN;
  if (!Number.isFinite(sinceMs)) {
    return {
      isPendingQr: false,
      isOverdue: false,
      kind: null,
      sinceMs: null,
      elapsedMs: 0,
      elapsedMinutes: 0,
      remainingBeforeCancelMs: null,
      remainingBeforeCancelMinutes: null,
    };
  }

  const elapsedMs = Math.max(0, nowMs - sinceMs);
  const delayMs = config.reminderDelayMinutes * 60_000;
  const autoCancelMs = config.autoCancelEnabled ? config.autoCancelMinutes * 60_000 : Number.POSITIVE_INFINITY;
  const isOverdue = (config.reminderEnabled || config.autoCancelEnabled) && elapsedMs >= delayMs;
  const remainingBeforeCancelMs = Number.isFinite(autoCancelMs)
    ? Math.max(0, autoCancelMs - elapsedMs)
    : null;

  return {
    isPendingQr: true,
    isOverdue,
    kind,
    sinceMs,
    elapsedMs,
    elapsedMinutes: Math.floor(elapsedMs / 60_000),
    remainingBeforeCancelMs,
    remainingBeforeCancelMinutes:
      remainingBeforeCancelMs !== null ? Math.ceil(remainingBeforeCancelMs / 60_000) : null,
  };
}

export function computeDueReminderStage(
  sinceMs: number,
  nowMs: number,
  config: QrReminderConfig,
): number {
  if (!config.reminderEnabled) return 0;
  const elapsedMs = nowMs - sinceMs;
  const delayMs = config.reminderDelayMinutes * 60_000;
  const intervalMs = config.reminderIntervalSeconds * 1000;
  const autoCancelMs = config.autoCancelEnabled
    ? config.autoCancelMinutes * 60_000
    : Number.POSITIVE_INFINITY;

  if (elapsedMs < delayMs || elapsedMs >= autoCancelMs || intervalMs <= 0) {
    return 0;
  }

  const rawStage = 1 + Math.floor((elapsedMs - delayMs) / intervalMs);
  return Math.min(config.maxReminders, rawStage);
}

export interface QrReminderStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface QrReminderTrackerOptions {
  nowFn?: () => number;
  configFn?: () => QrReminderConfig;
  enqueueFn?: (item: QrVoiceAlertItem) => Promise<void> | void;
  storage?: QrReminderStorageLike | null;
}

export class QrReminderTracker {
  private readonly nowFn: () => number;
  private readonly configFn: () => QrReminderConfig;
  private readonly enqueueFn: (item: QrVoiceAlertItem) => Promise<void> | void;
  private readonly storage: QrReminderStorageLike | null;
  private sentStages = new Map<string, number>();

  constructor(options: QrReminderTrackerOptions = {}) {
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.configFn = options.configFn ?? (() => getActiveQrReminderConfig());
    this.enqueueFn = options.enqueueFn ?? enqueueQrVoiceAlert;
    this.storage =
      options.storage !== undefined
        ? options.storage
        : typeof window !== 'undefined'
          ? window.sessionStorage
          : null;
    this.loadFromStorage();
  }

  evaluate(tableGrid: PosTableGridResponse | undefined | null): PendingQrItem[] {
    const items = collectPendingQrItems(tableGrid);
    const activeKeys = new Set(items.map((item) => item.key));

    let changedStorage = false;
    for (const key of this.sentStages.keys()) {
      if (!activeKeys.has(key)) {
        this.sentStages.delete(key);
        changedStorage = true;
      }
    }

    const config = this.configFn();
    const nowMs = this.nowFn();
    const overdueItems: PendingQrItem[] = [];
    const dueReminders: PendingQrItem[] = [];

    for (const item of items) {
      const elapsedMs = Math.max(0, nowMs - item.sinceMs);
      if (
        (config.reminderEnabled || config.autoCancelEnabled) &&
        elapsedMs >= config.reminderDelayMinutes * 60_000
      ) {
        overdueItems.push(item);
      }

      const dueStage = computeDueReminderStage(item.sinceMs, nowMs, config);
      if (dueStage <= 0) continue;

      const sentStage = this.sentStages.get(item.key) ?? 0;
      if (dueStage > sentStage) {
        dueReminders.push(item);
        this.sentStages.set(item.key, dueStage);
        changedStorage = true;
      }
    }

    if (changedStorage) {
      this.saveToStorage();
    }

    if (dueReminders.length === 1) {
      const target = dueReminders[0]!;
      void this.enqueueFn({
        tableLabel: target.tableLabel,
        kind: target.kind,
        orderCode: target.orderCode,
        isReminder: true,
      });
    } else if (dueReminders.length > 1) {
      void this.enqueueFn({
        tableLabel: dueReminders.map((entry) => entry.tableLabel).join(', '),
        kind: dueReminders[0]!.kind,
        isReminder: true,
        reminderTables: dueReminders.map((entry) => ({
          tableLabel: entry.tableLabel,
          kind: entry.kind,
        })),
      });
    }

    return overdueItems;
  }

  clear(): void {
    this.sentStages.clear();
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(QR_REMINDER_SENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          this.sentStages.set(key, value);
        }
      }
    } catch {
      // Ignore corrupt session storage
    }
  }

  private saveToStorage(): void {
    if (!this.storage) return;
    try {
      const obj: Record<string, number> = {};
      for (const [key, count] of this.sentStages.entries()) {
        obj[key] = count;
      }
      this.storage.setItem(QR_REMINDER_SENT_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore storage write failures
    }
  }
}

export function useQrPendingReminderMonitor(
  tableGrid: PosTableGridResponse | undefined | null,
  enabled: boolean,
): PendingQrItem[] {
  const trackerRef = React.useRef<QrReminderTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new QrReminderTracker();
  }

  const [overdueItems, setOverdueItems] = React.useState<PendingQrItem[]>([]);

  const hasPendingItems = React.useMemo(
    () => collectPendingQrItems(tableGrid).length > 0,
    [tableGrid],
  );

  React.useEffect(() => {
    if (!enabled) {
      setOverdueItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const sync = () => {
      const next = trackerRef.current?.evaluate(tableGrid) ?? [];
      setOverdueItems((prev) => {
        if (
          prev.length === next.length &&
          prev.every((entry, idx) => entry.key === next[idx]?.key)
        ) {
          return prev;
        }
        return next;
      });
    };

    sync();
    if (!hasPendingItems) return;

    const timer = window.setInterval(sync, REMINDER_TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, tableGrid, hasPendingItems]);

  return overdueItems;
}
