import {
  DEFAULT_QR_REMINDER_CONFIG,
  parseQrReminderConfig,
  serializeQrReminderConfig,
  type PosTableGridResponse,
  type QrReminderConfig,
} from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  collectPendingQrItems,
  evaluateOrderPendingAlert,
  QR_REMINDER_SENT_STORAGE_KEY,
  QrReminderTracker,
  type QrReminderStorageLike,
} from '../qr-pending-reminder';
import { type QrVoiceAlertItem } from '../qr-voice-announcer';

function createMemoryStorage(): QrReminderStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function makeGrid(tables: PosTableGridResponse['tables']): PosTableGridResponse {
  return { tables, takeaways: [] };
}

describe('qr-pending-reminder (5m/6m reminder cadence, red warning & F5 persistence)', () => {
  it('parses, clamps, and serializes QrReminderConfig while enforcing autoCancelMinutes > reminderDelayMinutes', () => {
    expect(parseQrReminderConfig(undefined)).toEqual(DEFAULT_QR_REMINDER_CONFIG);

    const parsed = parseQrReminderConfig(
      'rem=1|remDelay=5|remInt=60|remMax=2|autoCancel=1|autoCancelMin=12',
    );
    expect(parsed).toEqual({
      reminderEnabled: true,
      reminderDelayMinutes: 5,
      reminderIntervalSeconds: 60,
      maxReminders: 2,
      autoCancelEnabled: true,
      autoCancelMinutes: 12,
    });
    expect(serializeQrReminderConfig(parsed)).toBe(
      'rem=1|remDelay=5|remInt=60|remMax=2|autoCancel=1|autoCancelMin=12',
    );

    // If autoCancelMinutes <= reminderDelayMinutes while both enabled, clamp up safely
    const clamped = parseQrReminderConfig(
      'rem=1|remDelay=8|remInt=45|remMax=3|autoCancel=1|autoCancelMin=4',
    );
    expect(clamped.reminderDelayMinutes).toBe(8);
    expect(clamped.autoCancelMinutes).toBe(9);
  });

  it('follows exact timeline: 0..4m59s silent -> 5m Reminder #1 + red alert -> 6m Reminder #2 -> 7m..11m59s voice off & red alert kept -> confirm stops', () => {
    const startMs = Date.parse('2026-11-17T12:00:00.000Z');
    let nowMs = startMs;
    const enqueued: QrVoiceAlertItem[] = [];
    const storage = createMemoryStorage();
    const config: QrReminderConfig = { ...DEFAULT_QR_REMINDER_CONFIG };

    const grid = makeGrid([
      {
        id: 5,
        name: 'Bàn 05',
        status: 'PENDING',
        activeOrderId: 501,
        activeOrder: {
          orderId: 501,
          orderCode: 'HD-20261117-0501',
          orderType: 'DINE_IN',
          tableId: 5,
          tableLabel: 'Bàn 05',
          takeawayNumber: null,
          status: 'PENDING',
          totalAmount: 98000,
          createdAt: '2026-11-17T12:00:00.000Z',
          pendingQrSince: '2026-11-17T12:00:00.000Z',
          pendingQrKind: 'NEW',
        },
      },
    ]);

    const tracker = new QrReminderTracker({
      nowFn: () => nowMs,
      configFn: () => config,
      enqueueFn: (item) => {
        enqueued.push(item);
      },
      storage,
    });

    // T = 0s and T = 4m59s -> silent, not overdue
    expect(tracker.evaluate(grid)).toEqual([]);
    expect(enqueued).toHaveLength(0);

    nowMs = startMs + 4 * 60_000 + 59_000;
    expect(tracker.evaluate(grid)).toEqual([]);
    expect(enqueued).toHaveLength(0);

    // T = 5m00s -> Reminder #1 fires + overdue red warning starts
    nowMs = startMs + 5 * 60_000;
    let overdue = tracker.evaluate(grid);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.tableLabel).toBe('Bàn 05');
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      tableLabel: 'Bàn 05',
      kind: 'NEW',
      isReminder: true,
    });

    // Simulated F5 reload at T = 5m30s with same sessionStorage -> must NOT replay Reminder #1
    nowMs = startMs + 5 * 60_000 + 30_000;
    const reloadedTracker = new QrReminderTracker({
      nowFn: () => nowMs,
      configFn: () => config,
      enqueueFn: (item) => {
        enqueued.push(item);
      },
      storage,
    });
    overdue = reloadedTracker.evaluate(grid);
    expect(overdue).toHaveLength(1);
    expect(enqueued).toHaveLength(1);

    // T = 6m00s -> Reminder #2 fires
    nowMs = startMs + 6 * 60_000;
    overdue = reloadedTracker.evaluate(grid);
    expect(overdue).toHaveLength(1);
    expect(enqueued).toHaveLength(2);

    // T = 7m00s..11m30s -> Speaker stops permanently (max 2), red overdue warning STAYS ON
    nowMs = startMs + 9 * 60_000;
    overdue = reloadedTracker.evaluate(grid);
    expect(overdue).toHaveLength(1);
    expect(enqueued).toHaveLength(2);

    const alertState = evaluateOrderPendingAlert(grid.tables[0]!.activeOrder, 'PENDING', nowMs, config);
    expect(alertState.isOverdue).toBe(true);
    expect(alertState.elapsedMinutes).toBe(9);
    expect(alertState.remainingBeforeCancelMinutes).toBe(3);

    // Cashier confirms order -> clears grid & prunes sessionStorage cleanly
    const confirmedGrid = makeGrid([
      {
        id: 5,
        name: 'Bàn 05',
        status: 'OCCUPIED',
        activeOrderId: 501,
        activeOrder: {
          orderId: 501,
          orderCode: 'HD-20261117-0501',
          orderType: 'DINE_IN',
          tableId: 5,
          tableLabel: 'Bàn 05',
          takeawayNumber: null,
          status: 'SERVING',
          totalAmount: 98000,
          createdAt: '2026-11-17T12:00:00.000Z',
          pendingQrSince: null,
          pendingQrKind: null,
        },
      },
    ]);
    overdue = reloadedTracker.evaluate(confirmedGrid);
    expect(overdue).toEqual([]);
    expect(storage.getItem(QR_REMINDER_SENT_STORAGE_KEY)).toBe('{}');
  });

  it('batches multiple overdue tables into a single announcement and ignores manual POS counter items', () => {
    const startMs = Date.parse('2026-11-17T12:00:00.000Z');
    const nowMs = startMs + 5 * 60_000 + 5_000;
    const enqueued = vi.fn();

    const grid = makeGrid([
      {
        id: 3,
        name: 'Bàn 03',
        status: 'PENDING',
        activeOrderId: 301,
        activeOrder: {
          orderId: 301,
          orderCode: 'HD-0301',
          orderType: 'DINE_IN',
          tableId: 3,
          tableLabel: 'Bàn 03',
          takeawayNumber: null,
          status: 'PENDING',
          totalAmount: 50000,
          createdAt: '2026-11-17T12:00:00.000Z',
          pendingQrSince: '2026-11-17T12:00:00.000Z',
          pendingQrKind: 'NEW',
        },
      },
      {
        id: 7,
        name: 'Bàn 07',
        status: 'OCCUPIED',
        activeOrderId: 701,
        activeOrder: {
          orderId: 701,
          orderCode: 'HD-0701',
          orderType: 'DINE_IN',
          tableId: 7,
          tableLabel: 'Bàn 07',
          takeawayNumber: null,
          status: 'SERVING',
          totalAmount: 120000,
          createdAt: '2026-11-17T11:30:00.000Z',
          hasUnprintedAddon: true,
          unprintedAddonBatchNo: 2,
          pendingQrSince: '2026-11-17T12:00:00.000Z',
          pendingQrKind: 'ADDON',
        },
      },
      {
        // Table 08 had items added manually by cashier at POS counter -> pendingQrKind is null!
        id: 8,
        name: 'Bàn 08',
        status: 'OCCUPIED',
        activeOrderId: 801,
        activeOrder: {
          orderId: 801,
          orderCode: 'HD-0801',
          orderType: 'DINE_IN',
          tableId: 8,
          tableLabel: 'Bàn 08',
          takeawayNumber: null,
          status: 'SERVING',
          totalAmount: 150000,
          createdAt: '2026-11-17T11:30:00.000Z',
          hasUnprintedAddon: true,
          unprintedAddonBatchNo: 2,
          pendingQrSince: null,
          pendingQrKind: null,
        },
      },
    ]);

    expect(collectPendingQrItems(grid).map((i) => i.tableLabel)).toEqual(['Bàn 03', 'Bàn 07']);

    const tracker = new QrReminderTracker({
      nowFn: () => nowMs,
      configFn: () => ({ ...DEFAULT_QR_REMINDER_CONFIG }),
      enqueueFn: enqueued,
      storage: createMemoryStorage(),
    });

    const overdue = tracker.evaluate(grid);
    expect(overdue.map((item) => item.tableLabel)).toEqual(['Bàn 03', 'Bàn 07']);
    expect(enqueued).toHaveBeenCalledTimes(1);
    expect(enqueued).toHaveBeenCalledWith({
      tableLabel: 'Bàn 03, Bàn 07',
      kind: 'NEW',
      isReminder: true,
      reminderTables: [
        { tableLabel: 'Bàn 03', kind: 'NEW' },
        { tableLabel: 'Bàn 07', kind: 'ADDON' },
      ],
    });
  });

  it('collects pending QR NEW and ADDON orders from tableGrid.takeaways for reminders & overdue tracking', () => {
    const startMs = Date.parse('2026-11-22T10:00:00.000Z');
    const enqueued = vi.fn();
    const grid: PosTableGridResponse = {
      tables: [],
      takeaways: [
        {
          orderId: 901,
          orderCode: 'HD-20261122-0001',
          orderType: 'TAKEAWAY',
          tableId: null,
          tableLabel: 'Mang về #01',
          takeawayNumber: 1,
          status: 'PENDING',
          totalAmount: 49000,
          createdAt: '2026-11-22T10:00:00.000Z',
          pendingQrSince: '2026-11-22T10:00:00.000Z',
          pendingQrKind: 'NEW',
        },
        {
          orderId: 902,
          orderCode: 'HD-20261122-0002',
          orderType: 'TAKEAWAY',
          tableId: null,
          tableLabel: null,
          takeawayNumber: 2,
          status: 'SERVING',
          totalAmount: 85000,
          createdAt: '2026-11-22T09:50:00.000Z',
          hasUnprintedAddon: true,
          unprintedAddonBatchNo: 2,
          pendingQrSince: '2026-11-22T10:00:00.000Z',
          pendingQrKind: 'ADDON',
        },
      ],
    };

    const collected = collectPendingQrItems(grid);
    expect(collected.map((item) => ({ label: item.tableLabel, kind: item.kind }))).toEqual([
      { label: 'Mang về #01', kind: 'NEW' },
      { label: 'Mang về #02', kind: 'ADDON' },
    ]);

    const tracker = new QrReminderTracker({
      nowFn: () => startMs + 5 * 60_000,
      configFn: () => ({ ...DEFAULT_QR_REMINDER_CONFIG }),
      enqueueFn: enqueued,
      storage: createMemoryStorage(),
    });
    const overdue = tracker.evaluate(grid);
    expect(overdue).toHaveLength(2);
    expect(enqueued).toHaveBeenCalledWith(
      expect.objectContaining({
        isReminder: true,
        tableLabel: 'Mang về #01, Mang về #02',
      }),
    );
  });
});
