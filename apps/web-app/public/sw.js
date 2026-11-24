/* Service Worker for POS QR Order Web Push Notifications (Layer 3 safety net) */

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

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Anti-double-alert: if staff already has an actively focused POS window on screen,
      // foreground Socket.io voice announcer handles the alert immediately.
      const hasFocusedVisibleClient = windowClients.some(
        (client) => client.visibilityState === 'visible' && client.focused === true,
      );

      if (hasFocusedVisibleClient) {
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
        return;
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
