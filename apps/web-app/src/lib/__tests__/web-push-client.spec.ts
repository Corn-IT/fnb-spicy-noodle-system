import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  detectDeviceLabel,
  getCurrentBrowserPushSubscription,
  getWebPushSupportInfo,
  registerPosServiceWorker,
  sendTestWebPush,
  subscribeDeviceToWebPush,
  syncExistingPushSubscriptionWithSession,
  unsubscribeDeviceFromWebPush,
  urlBase64ToUint8Array,
} from '@/lib/web-push-client';

const iosMock = vi.hoisted(() => ({
  isIosDevice: vi.fn(() => false),
  isStandalonePwa: vi.fn(() => false),
}));

vi.mock('@/lib/mobile-audio-keepalive', () => ({
  isIosDevice: iosMock.isIosDevice,
  isStandalonePwa: iosMock.isStandalonePwa,
}));

function makeFakeSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/sub-1') {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({
      endpoint,
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7Dk',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    }),
  } as unknown as PushSubscription;
}

function stubNotification(permission: NotificationPermission = 'granted', nextPerm: NotificationPermission = 'granted') {
  const requestPermission = vi.fn().mockResolvedValue(nextPerm);
  vi.stubGlobal('Notification', { permission, requestPermission });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission, requestPermission },
  });
  return requestPermission;
}

describe('web-push-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    iosMock.isIosDevice.mockReturnValue(false);
    iosMock.isStandalonePwa.mockReturnValue(false);
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes URL-safe base64 VAPID keys into Uint8Array', () => {
    const bytes = urlBase64ToUint8Array('SGVsbG8td29ybGRf');
    expect(Array.from(bytes.slice(0, 5))).toEqual([72, 101, 108, 108, 111]);
  });

  it('detects device labels for iPhone, iPad, Android, macOS, Windows, and fallback', () => {
    const setUa = (ua: string) =>
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });

    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(detectDeviceLabel()).toBe('iPhone (iOS)');

    setUa('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    expect(detectDeviceLabel()).toBe('iPad (iPadOS)');

    setUa('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    expect(detectDeviceLabel()).toBe('Điện thoại Android');

    setUa('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    expect(detectDeviceLabel()).toBe('macOS');

    setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(detectDeviceLabel()).toBe('Windows');

    setUa('CustomEmbeddedClient/1.0');
    expect(detectDeviceLabel()).toBe('Trình duyệt Web');
  });

  it('reports iOS install requirement, insecure context, and supported state accurately', () => {
    iosMock.isIosDevice.mockReturnValue(true);
    iosMock.isStandalonePwa.mockReturnValue(false);
    delete (window as { PushManager?: unknown }).PushManager;
    stubNotification('default');
    expect(getWebPushSupportInfo()).toMatchObject({
      supported: false,
      needsIosInstall: true,
    });

    iosMock.isIosDevice.mockReturnValue(false);
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn(), register: vi.fn() },
    });
    expect(getWebPushSupportInfo().isSecureContext).toBe(true); // localhost fallback in jsdom
  });

  it('registers service worker, gets active push subscription, and subscribes end-to-end', async () => {
    const sub = makeFakeSubscription();
    const subscribe = vi.fn().mockResolvedValue(sub);
    const getSubscription = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(sub);
    const registration = { pushManager: { getSubscription, subscribe } };
    const getRegistration = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(registration);
    const register = vi.fn().mockResolvedValue(registration);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration, register },
    });
    stubNotification('default', 'granted');

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ subscribed: true, activeCount: 1 });

    const res = await subscribeDeviceToWebPush();
    expect(res).toEqual({
      ok: true,
      endpoint: 'https://fcm.googleapis.com/fcm/send/sub-1',
    });
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(subscribe).toHaveBeenCalled();

    // Sync & test push & unsubscribe paths
    stubNotification('granted');
    await expect(syncExistingPushSubscriptionWithSession()).resolves.toBe(true);
    await expect(getCurrentBrowserPushSubscription()).resolves.toBe(sub);
    await expect(registerPosServiceWorker()).resolves.toBe(registration);

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      scheduled: true,
      delaySeconds: 0,
      activeSubscriptions: 1,
    });
    await expect(sendTestWebPush(0)).resolves.toEqual({
      scheduled: true,
      delaySeconds: 0,
      activeSubscriptions: 1,
    });

    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce(undefined);
    await expect(unsubscribeDeviceFromWebPush()).resolves.toBe(true);
  });

  it('handles denied permission, missing serviceWorker support, and registration errors gracefully', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(null), register: vi.fn().mockResolvedValue(null) },
    });

    stubNotification('denied');
    await expect(subscribeDeviceToWebPush()).resolves.toMatchObject({ ok: false, reason: 'denied' });

    stubNotification('granted');
    await expect(subscribeDeviceToWebPush()).resolves.toMatchObject({ ok: false, reason: 'unsupported' });

    const brokenReg = {
      pushManager: {
        getSubscription: vi.fn().mockRejectedValue(new Error('push service not available')),
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(brokenReg), register: vi.fn() },
    });
    const errRes = await subscribeDeviceToWebPush();
    expect(errRes).toMatchObject({ ok: false, reason: 'error' });

    // syncExistingPushSubscriptionWithSession returns false when denied or missing sub
    stubNotification('denied');
    await expect(syncExistingPushSubscriptionWithSession()).resolves.toBe(false);
    expect(await unsubscribeDeviceFromWebPush()).toBe(true);
  });
});
