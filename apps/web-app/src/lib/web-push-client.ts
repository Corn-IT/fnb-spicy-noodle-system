import {
  SendTestWebPushResponseSchema,
  WebPushSubscriptionStatusResponseSchema,
  WebPushVapidKeyResponseSchema,
  type SendTestWebPushResponse,
} from '@fnb/shared';
import { apiClient } from '@/lib/api-client';
import { isIosDevice, isStandalonePwa } from '@/lib/mobile-audio-keepalive';

export const POS_SERVICE_WORKER_PATH = '/sw.js';

export type WebPushPermissionState = NotificationPermission | 'unsupported';

export interface WebPushSupportInfo {
  supported: boolean;
  needsIosInstall: boolean;
  isSecureContext: boolean;
  permission: WebPushPermissionState;
}

export type WebPushSubscribeResult =
  | { ok: true; endpoint: string }
  | {
      ok: false;
      reason: 'unsupported' | 'needs_ios_install' | 'insecure_context' | 'denied' | 'error';
      message: string;
    };

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getWebPushSupportInfo(): WebPushSupportInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      needsIosInstall: false,
      isSecureContext: false,
      permission: 'unsupported',
    };
  }

  const secure =
    window.isSecureContext === true ||
    window.location?.hostname === 'localhost' ||
    window.location?.hostname === '127.0.0.1';
  const hasSw = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const hasNotification = 'Notification' in window;

  // On iOS 16.4+, Safari exposes PushManager only after "Add to Home Screen" (standalone PWA)
  const needsIosInstall = isIosDevice() && !isStandalonePwa() && (!hasPushManager || !hasNotification);

  const supported = secure && hasSw && hasPushManager && hasNotification;
  const permission: WebPushPermissionState = hasNotification ? window.Notification.permission : 'unsupported';

  return {
    supported,
    needsIosInstall,
    isSecureContext: secure,
    permission,
  };
}

export function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Trình duyệt Web';
  const ua = navigator.userAgent ?? '';
  if (/iPhone/i.test(ua)) return 'iPhone (iOS)';
  if (/iPad/i.test(ua)) return 'iPad (iPadOS)';
  if (/Android/i.test(ua)) return 'Điện thoại Android';
  if (/Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Trình duyệt Web';
}

export async function registerPosServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      return existing;
    }
    return await navigator.serviceWorker.register(POS_SERVICE_WORKER_PATH, { scope: '/' });
  } catch {
    return null;
  }
}

export async function getCurrentBrowserPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration?.pushManager) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function serializeSubscriptionPayload(subscription: PushSubscription) {
  const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : null;
  const endpoint = json?.endpoint ?? subscription.endpoint;
  const p256dh = json?.keys?.p256dh ?? '';
  const auth = json?.keys?.auth ?? '';
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Không thể đọc khoá mã hoá Push từ trình duyệt');
  }
  return {
    endpoint,
    keys: { p256dh, auth },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 512) : undefined,
    deviceLabel: detectDeviceLabel(),
  };
}

export async function subscribeDeviceToWebPush(): Promise<WebPushSubscribeResult> {
  const support = getWebPushSupportInfo();
  if (support.needsIosInstall) {
    return {
      ok: false,
      reason: 'needs_ios_install',
      message: 'Trên iPhone, hãy bấm Chia sẻ → Thêm vào Màn hình chính rồi mở lại để bật thông báo đẩy.',
    };
  }
  if (!support.isSecureContext) {
    return {
      ok: false,
      reason: 'insecure_context',
      message: 'Thông báo đẩy yêu cầu truy cập qua tên miền HTTPS.',
    };
  }
  if (!support.supported) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Trình duyệt trên thiết bị này chưa hỗ trợ thông báo đẩy Web Push.',
    };
  }

  let permission: NotificationPermission = window.Notification.permission;
  if (permission === 'default') {
    permission = await window.Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Bạn đã từ chối quyền thông báo. Hãy bật lại quyền Thông báo trong cài đặt trình duyệt.',
    };
  }

  try {
    const registration = await registerPosServiceWorker();
    if (!registration?.pushManager) {
      return {
        ok: false,
        reason: 'unsupported',
        message: 'Không thể khởi tạo Service Worker cho thông báo đẩy.',
      };
    }

    const vapidRaw = await apiClient.get<unknown>('/api/v1/pos/push/vapid-public-key');
    const { publicKey } = WebPushVapidKeyResponseSchema.parse(vapidRaw);

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const body = serializeSubscriptionPayload(subscription);
    const statusRaw = await apiClient.post<unknown>('/api/v1/pos/push/subscriptions', body);
    WebPushSubscriptionStatusResponseSchema.parse(statusRaw);

    return { ok: true, endpoint: body.endpoint };
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : '';
    const message = /push service not available|registration failed/i.test(rawMsg)
      ? 'Trình duyệt hiện tại chưa hỗ trợ dịch vụ đẩy nền. Hãy dùng Chrome (Android) hoặc mở từ Màn hình chính trên Safari (iPhone).'
      : rawMsg || 'Không thể đăng ký thông báo đẩy, vui lòng thử lại.';
    return {
      ok: false,
      reason: 'error',
      message,
    };
  }
}

export async function unsubscribeDeviceFromWebPush(): Promise<boolean> {
  try {
    const subscription = await getCurrentBrowserPushSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await apiClient
      .delete('/api/v1/pos/push/subscriptions', { body: { endpoint } })
      .catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-binds an already granted browser PushSubscription to the current active staff session.
 * Does NOT prompt the user for permission.
 */
export async function syncExistingPushSubscriptionWithSession(): Promise<boolean> {
  const support = getWebPushSupportInfo();
  if (!support.supported || support.permission !== 'granted') return false;

  try {
    const subscription = await getCurrentBrowserPushSubscription();
    if (!subscription) return false;
    const body = serializeSubscriptionPayload(subscription);
    await apiClient.post('/api/v1/pos/push/subscriptions', body);
    return true;
  } catch {
    return false;
  }
}

export async function sendTestWebPush(delaySeconds = 5): Promise<SendTestWebPushResponse> {
  const raw = await apiClient.post<unknown>('/api/v1/pos/push/test', { delaySeconds });
  return SendTestWebPushResponseSchema.parse(raw);
}
