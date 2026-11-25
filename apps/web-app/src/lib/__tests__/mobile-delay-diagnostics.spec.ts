import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getJwtExpirationMs } from '@/lib/api-client';
import {
  clearDecodedAudioCacheForTesting,
  defaultPlayAudioClip,
  resetAudioContextForTesting,
  unlockQrVoiceAudio,
} from '@/lib/qr-voice-announcer';

describe('Diagnostic & Regression Suite: Mobile Order Notification Delay Causes', () => {
  beforeEach(() => {
    resetAudioContextForTesting();
    clearDecodedAudioCacheForTesting();
  });

  afterEach(() => {
    resetAudioContextForTesting();
    clearDecodedAudioCacheForTesting();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('BUG-2 REPRO: sw.js must suppress delayed push notification when server reports order is no longer pending (already printed/approved)', async () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swSource = fs.readFileSync(swPath, 'utf8');
    const listeners = new Map<string, (event: unknown) => void>();
    const showNotification = vi.fn(async () => undefined);
    const closeExisting = vi.fn();
    const getNotifications = vi.fn(async () => [{ tag: 'qr-new-77', close: closeExisting }]);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/v1/public/orders/qr-pending-check')) {
        return {
          ok: true,
          json: async () => ({ stillPending: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const swSelf = {
      location: { origin: 'https://pos.example.com' },
      skipWaiting: vi.fn(async () => undefined),
      registration: { showNotification, getNotifications },
      clients: {
        claim: vi.fn(async () => undefined),
        matchAll: vi.fn(async () => []), // phone screen locked / closed
        openWindow: vi.fn(async () => undefined),
      },
      addEventListener: (name: string, fn: (event: unknown) => void) => {
        listeners.set(name, fn);
      },
    };

    vm.runInNewContext(swSource, {
      self: swSelf,
      fetch: fetchMock,
      AbortController,
      setTimeout,
      clearTimeout,
      Date,
      JSON,
      URLSearchParams,
      console,
    });

    let pending: Promise<unknown> = Promise.resolve();
    listeners.get('push')!({
      data: {
        json: () => ({
          kind: 'QR_NEW',
          title: 'Đơn QR mới · Bàn 05',
          body: 'Bàn 05 vừa gửi đơn mới',
          tag: 'qr-new-77',
          url: '/pos?orderId=77',
          orderId: 77,
          timestamp: new Date(Date.now() - 25_000).toISOString(),
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/public/orders/qr-pending-check?orderId=77&kind=QR_NEW'),
      expect.any(Object),
    );
    expect(showNotification).not.toHaveBeenCalled();
    expect(closeExisting).toHaveBeenCalledTimes(1);
  });

  it('BUG-2 FAIL-OPEN: sw.js must still display push notification if pending-check network call fails/times out', async () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swSource = fs.readFileSync(swPath, 'utf8');
    const listeners = new Map<string, (event: unknown) => void>();
    const showNotification = vi.fn(async () => undefined);

    const fetchMock = vi.fn(async () => {
      throw new Error('Network timeout');
    });

    const swSelf = {
      location: { origin: 'https://pos.example.com' },
      skipWaiting: vi.fn(async () => undefined),
      registration: { showNotification, getNotifications: vi.fn(async () => []) },
      clients: {
        claim: vi.fn(async () => undefined),
        matchAll: vi.fn(async () => []),
        openWindow: vi.fn(async () => undefined),
      },
      addEventListener: (name: string, fn: (event: unknown) => void) => {
        listeners.set(name, fn);
      },
    };

    vm.runInNewContext(swSource, {
      self: swSelf,
      fetch: fetchMock,
      AbortController,
      setTimeout,
      clearTimeout,
      Date,
      JSON,
      URLSearchParams,
      console,
    });

    let pending: Promise<unknown> = Promise.resolve();
    listeners.get('push')!({
      data: {
        json: () => ({
          kind: 'QR_NEW',
          title: 'Đơn QR mới · Bàn 08',
          body: 'Bàn 08 vừa gửi đơn mới',
          tag: 'qr-new-88',
          url: '/pos?orderId=88',
          orderId: 88,
          timestamp: new Date(Date.now() - 20_000).toISOString(),
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;

    expect(showNotification).toHaveBeenCalledWith(
      'Đơn QR mới · Bàn 08',
      expect.objectContaining({ tag: 'qr-new-88' }),
    );
  });

  it('BUG-3 REPRO: defaultPlayAudioClip must NOT retry a failing HTTP 503 Cloud TTS URL in HTMLAudioElement (prevents 6.5s extra stall)', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36',
    });

    class RunningAudioContext {
      public state: AudioContextState = 'running';
      public destination = {};
      public resume = vi.fn(async () => undefined);
      public createBuffer = vi.fn(() => ({ duration: 0.01 }));
      public decodeAudioData = vi.fn(async () => ({ duration: 0.3 }));
      public createBufferSource = vi.fn(() => ({
        buffer: null,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
        onended: null,
      }));
      public createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() }));
    }
    vi.stubGlobal('AudioContext', RunningAudioContext);

    const htmlAudioPlaySpy = vi.fn(async () => undefined);
    vi.stubGlobal(
      'Audio',
      vi.fn(function MockAudio() {
        return {
          preload: 'auto',
          paused: true,
          src: '',
          volume: 1,
          currentTime: 0,
          setAttribute: vi.fn(),
          play: htmlAudioPlaySpy,
          pause: vi.fn(),
        };
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    await unlockQrVoiceAudio();
    htmlAudioPlaySpy.mockClear();

    await expect(
      defaultPlayAudioClip('/api/v1/public/tts?text=Ban+5', 1, 1, 'vi-female-standard'),
    ).rejects.toThrow(/503|HTTP|timeout|Failed/i);

    // Must NOT waste 6.5 seconds retrying the exact same HTTP 503 URL in HTMLAudioElement!
    expect(htmlAudioPlaySpy).not.toHaveBeenCalled();
  });

  it('BUG-1 FIX: getJwtExpirationMs decodes base64url JWT exp claim accurately for proactive Socket.io refresh', () => {
    const expSec = 1_800_000_000;
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ sub: 1, exp: expSec }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const fakeJwt = `${header}.${payload}.signature`;

    expect(getJwtExpirationMs(fakeJwt)).toBe(expSec * 1000);
    expect(getJwtExpirationMs('not-a-jwt')).toBeNull();
    expect(getJwtExpirationMs(null)).toBeNull();
  });

  it('TEST-PING & CLOSE MESSAGE: sw.js always shows TEST_PING and closes notifications on POS_CLOSE_ORDER_NOTIFICATIONS', async () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swSource = fs.readFileSync(swPath, 'utf8');
    const listeners = new Map<string, (event: unknown) => void>();
    const showNotification = vi.fn(async () => undefined);
    const closeSpy = vi.fn();
    const getNotifications = vi.fn(async () => [
      { tag: 'qr-new-42', close: closeSpy },
      { tag: 'qr-addon-42-2', close: closeSpy },
      { tag: 'qr-new-99', close: closeSpy },
    ]);

    const swSelf = {
      location: { origin: 'https://pos.example.com' },
      skipWaiting: vi.fn(async () => undefined),
      registration: { showNotification, getNotifications },
      clients: {
        claim: vi.fn(async () => undefined),
        matchAll: vi.fn(async () => [
          { visibilityState: 'visible', focused: true, postMessage: vi.fn() },
        ]),
        openWindow: vi.fn(async () => undefined),
      },
      addEventListener: (name: string, fn: (event: unknown) => void) => {
        listeners.set(name, fn);
      },
    };

    vm.runInNewContext(swSource, {
      self: swSelf,
      fetch: vi.fn(),
      AbortController,
      setTimeout,
      clearTimeout,
      Date,
      JSON,
      URLSearchParams,
      console,
    });

    // TEST_PING must display even when tab is visible/focused
    let pendingPush: Promise<unknown> = Promise.resolve();
    listeners.get('push')!({
      data: {
        json: () => ({
          kind: 'TEST_PING',
          title: 'Kiểm tra báo đơn POS thành công',
          body: 'Thông báo đẩy hoạt động bình thường',
          tag: 'pos-push-test-1',
          url: '/pos',
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        pendingPush = p;
      },
    });
    await pendingPush;
    expect(showNotification).toHaveBeenCalledWith(
      'Kiểm tra báo đơn POS thành công',
      expect.objectContaining({ tag: 'pos-push-test-1' }),
    );

    // POS_CLOSE_ORDER_NOTIFICATIONS for orderId=42 closes tags for 42 only (not 99)
    let pendingMsg: Promise<unknown> = Promise.resolve();
    listeners.get('message')!({
      data: { type: 'POS_CLOSE_ORDER_NOTIFICATIONS', orderId: 42 },
      waitUntil: (p: Promise<unknown>) => {
        pendingMsg = p;
      },
    });
    await pendingMsg;
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });
});
