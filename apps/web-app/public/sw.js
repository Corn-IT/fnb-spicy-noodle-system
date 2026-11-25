/* Service Worker for POS QR Order Web Push Notifications (Layer 3 safety net) */

const PENDING_CHECK_TIMEOUT_MS = 1200;
const FOREGROUND_AUDIO_ACK_TIMEOUT_MS = 350;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  const fallback = {
    kind: 'QR_NEW',
    title: 'Có đơn QR mới',
    body: 'Khách vừa gửi đơn QR. Chạm để mở quầy POS xác nhận.',
    tag: 'pos-qr-order',
    url: '/pos',
  };

  if (!event.data) return fallback;
  try {
    const parsed = event.data.json();
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      kind: typeof parsed.kind === 'string' ? parsed.kind : fallback.kind,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : fallback.title,
      body: typeof parsed.body === 'string' && parsed.body.trim() ? parsed.body : fallback.body,
      tag: typeof parsed.tag === 'string' && parsed.tag.trim() ? parsed.tag : fallback.tag,
      url: typeof parsed.url === 'string' && parsed.url.startsWith('/') ? parsed.url : fallback.url,
      orderId: typeof parsed.orderId === 'number' ? parsed.orderId : undefined,
      tableLabel: typeof parsed.tableLabel === 'string' ? parsed.tableLabel : undefined,
      batchNo: typeof parsed.batchNo === 'number' ? parsed.batchNo : undefined,
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString(),
    };
  } catch {
    try {
      const text = event.data.text();
      if (text && text.trim()) {
        return { ...fallback, body: text.trim() };
      }
    } catch {
      // Ignore malformed payload
    }
    return fallback;
  }
}

async function closeOrderNotifications(orderId) {
  if (typeof orderId !== 'number' || !self.registration || typeof self.registration.getNotifications !== 'function') {
    return;
  }
  try {
    const existing = await self.registration.getNotifications();
    const prefixes = [`qr-new-${orderId}`, `qr-addon-${orderId}`, `qr-reminder-${orderId}`];
    for (const notification of existing) {
      const tag = typeof notification.tag === 'string' ? notification.tag : '';
      if (prefixes.some((prefix) => tag === prefix || tag.startsWith(`${prefix}-`))) {
        notification.close();
      }
    }
  } catch {
    // Ignore notification cleanup errors
  }
}

/**
 * Verifies with the server whether a delayed QR push notification is still pending confirmation.
 * Fails OPEN (returns true) if offline or slower than 1.2s so real pending orders are never lost.
 */
async function isOrderStillPending(payload) {
  if (typeof payload.orderId !== 'number' || payload.orderId <= 0) return true;
  if (typeof fetch !== 'function') return true;

  const params = new URLSearchParams({
    orderId: String(payload.orderId),
    kind: String(payload.kind || 'QR_NEW'),
  });
  if (typeof payload.batchNo === 'number' && payload.batchNo > 0) {
    params.set('batchNo', String(payload.batchNo));
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), PENDING_CHECK_TIMEOUT_MS) : null;
  try {
    const res = await fetch(
      `${self.location.origin}/api/v1/public/orders/qr-pending-check?${params.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      },
    );
    if (!res || !res.ok) return true;
    const data = await res.json();
    if (data && typeof data.stillPending === 'boolean') {
      return data.stillPending;
    }
    return true;
  } catch {
    return true;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

/**
 * Asks a visible/focused window client whether its Web Audio announcer is unlocked and able
 * to play the order alert aloud right now. Also delivers the push payload to the page so the
 * page can immediately trigger voice + toast even if Socket.io is reconnecting.
 * If no client replies `{ handledByAudio: true }` within 350ms (e.g. phone screen is on
 * but AudioContext is locked/suspended/interrupted), falls back to showing the OS Push banner.
 */
async function notifyAndCheckForegroundAudioHandled(windowClients, payload) {
  if (!Array.isArray(windowClients) || windowClients.length === 0) {
    return false;
  }

  for (const client of windowClients) {
    try {
      client.postMessage({
        type: 'POS_PUSH_SUPPRESSED_FOREGROUND',
        payload,
      });
    } catch {
      // Ignore postMessage failure
    }
  }

  const focusedVisibleClients = windowClients.filter(
    (client) => client && client.visibilityState === 'visible' && client.focused === true,
  );
  if (focusedVisibleClients.length === 0) {
    return false;
  }

  if (typeof MessageChannel !== 'function') {
    return true;
  }

  const results = await Promise.all(
    focusedVisibleClients.map(
      (client) =>
        new Promise((resolve) => {
          let settled = false;
          const finish = (handled) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(Boolean(handled));
          };
          const timer = setTimeout(() => finish(false), FOREGROUND_AUDIO_ACK_TIMEOUT_MS);
          try {
            const channel = new MessageChannel();
            channel.port1.onmessage = (msgEvent) => {
              finish(Boolean(msgEvent && msgEvent.data && msgEvent.data.handledByAudio === true));
            };
            client.postMessage(
              {
                type: 'POS_PUSH_FOREGROUND_CHECK',
                payload,
              },
              [channel.port2],
            );
          } catch {
            finish(false);
          }
        }),
    ),
  );

  return results.some(Boolean);
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    (async () => {
      const isTestPing = payload.kind === 'TEST_PING';
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Anti-stale-alert: if FCM/APNs delivered a QR order push after the cashier already
      // approved / printed / paid it, silently skip and close any older banner for that order.
      if (!isTestPing && typeof payload.orderId === 'number') {
        const stillPending = await isOrderStillPending(payload);
        if (!stillPending) {
          await closeOrderNotifications(payload.orderId);
          return;
        }
      }

      // Always forward push payload to any open window client (so if Socket.io is lagging,
      // the foreground/background tab still plays Web Audio + shows toast immediately!),
      // and only suppress the OS push banner if a focused visible client confirms its
      // Web Audio announcer is unlocked and actively handling the alert.
      if (!isTestPing && windowClients.length > 0) {
        const handledByForegroundAudio = await notifyAndCheckForegroundAudioHandled(
          windowClients,
          payload,
        );
        if (handledByForegroundAudio) {
          return;
        }
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: '/images/logo-icon-square.png',
        badge: '/images/logo-icon-square.png',
        vibrate: [220, 100, 220, 100, 320],
        requireInteraction: true,
        renotify: true,
        data: {
          url: payload.url,
          orderId: payload.orderId,
          kind: payload.kind,
          tableLabel: payload.tableLabel,
        },
      });
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'POS_CLOSE_ORDER_NOTIFICATIONS' && typeof data.orderId === 'number') {
    event.waitUntil(closeOrderNotifications(data.orderId));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/pos';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url && client.url.startsWith(self.location.origin)) {
          try {
            await client.focus();
            client.postMessage({
              type: 'POS_NOTIFICATION_CLICK',
              url: targetUrl,
              orderId: data.orderId,
            });
            return;
          } catch {
            // Fallback to opening a new window
          }
        }
      }

      if (typeof self.clients.openWindow === 'function') {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
