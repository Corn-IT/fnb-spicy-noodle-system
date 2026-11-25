import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { UserPermissionsSchema } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MobileAlertControlButton,
  MobileAudioActivationBanner,
} from '@/components/layout/mobile-alert-controls';
import { apiClient } from '@/lib/api-client';
import {
  buildSilentKeepAliveWavBytes,
  isMobileBackgroundKeepAliveEnabled,
  MOBILE_AUDIO_KEEPALIVE_STORAGE_KEY,
  resetMobileKeepAliveForTesting,
  setMobileBackgroundKeepAliveEnabled,
  startMobileAudioKeepAlive,
  stopMobileAudioKeepAlive,
} from '@/lib/mobile-audio-keepalive';
import {
  clearDecodedAudioCacheForTesting,
  defaultPlayAudioClip,
  getQrAudioUnlockState,
  resetAudioContextForTesting,
  setQrVoiceAlertEnabled,
  subscribeQrAudioUnlockState,
  unlockQrVoiceAudio,
} from '@/lib/qr-voice-announcer';
import { useAuthStore } from '@/stores/auth.store';

function stubUserAgent(ua: string, maxTouchPoints = 0): void {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: ua,
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: maxTouchPoints,
  });
}

class MobileMockAudioContext {
  public static instances: MobileMockAudioContext[] = [];
  public state: string = 'suspended';
  public currentTime = 0;
  public destination = {};
  private listeners = new Map<string, Set<() => void>>();

  public resume = vi.fn(async () => {
    this.state = 'running';
    this.emit('statechange');
  });

  public createBuffer = vi.fn(() => ({ duration: 0.01 }));
  public decodeAudioData = vi.fn(async () => ({ duration: 0.4 }));
  public createBufferSource = vi.fn(() => {
    const node = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      detune: { value: 0 },
      onended: null as null | (() => void),
      connect: vi.fn(),
      start: vi.fn(() => {
        queueMicrotask(() => node.onended?.());
      }),
    };
    return node;
  });
  public createOscillator = vi.fn(() => ({
    type: 'sine',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  public createGain = vi.fn(() => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));

  public addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  public emit(type: string) {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }

  constructor() {
    MobileMockAudioContext.instances.push(this);
  }
}

describe('Mobile 3-Layer Order Alert System', () => {
  const originalUa = navigator.userAgent;
  const originalTouchPoints = navigator.maxTouchPoints;

  beforeEach(() => {
    localStorage.clear();
    resetAudioContextForTesting();
    clearDecodedAudioCacheForTesting();
    resetMobileKeepAliveForTesting();
    MobileMockAudioContext.instances = [];
    vi.stubGlobal('AudioContext', MobileMockAudioContext);
    setQrVoiceAlertEnabled(true);
    useAuthStore.setState({
      accessToken: 'jwt-test-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'cashier01',
        fullName: 'Thu Ngân 01',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          dashboard: { view: true },
          pos: { view: true, create: true, update: true },
          invoices: { view: true },
        }),
      },
      authNotice: null,
      authNoticeMeta: null,
    });
  });

  afterEach(() => {
    resetAudioContextForTesting();
    clearDecodedAudioCacheForTesting();
    resetMobileKeepAliveForTesting();
    stubUserAgent(originalUa, originalTouchPoints);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Layer 1: Mobile Web Audio unlock, statechange tracking & cached Web Audio playback', () => {
    it('unlocks AudioContext, configures iOS audioSession playback mode, and tracks lock/unlock transitions', async () => {
      stubUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        5,
      );
      const audioSession = { type: 'auto' };
      Object.defineProperty(window.navigator, 'audioSession', {
        configurable: true,
        value: audioSession,
      });

      const observed: string[] = [];
      const unsubscribe = subscribeQrAudioUnlockState((state) => observed.push(state));

      const unlocked = await unlockQrVoiceAudio();
      expect(unlocked).toBe(true);
      expect(getQrAudioUnlockState()).toBe('unlocked');
      expect(audioSession.type).toBe('playback');
      expect(MobileMockAudioContext.instances[0]!.createBuffer).toHaveBeenCalledTimes(1);

      // Simulate iPhone lock screen putting AudioContext into 'interrupted' state
      MobileMockAudioContext.instances[0]!.state = 'interrupted';
      MobileMockAudioContext.instances[0]!.emit('statechange');
      expect(getQrAudioUnlockState()).toBe('locked');
      expect(observed).toContain('unlocked');
      expect(observed).toContain('locked');
      unsubscribe();
    });

    it('plays audio clips via Web Audio BufferSource (bypassing mobile HTMLAudioElement autoplay blocks) and caches decoded buffers', async () => {
      stubUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        5,
      );

      const audioCtorSpy = vi.fn(function MockAudio() {
        return {
          preload: 'auto',
          paused: true,
          src: '',
          volume: 1,
          currentTime: 0,
          setAttribute: vi.fn(),
          play: vi.fn(async () => undefined),
          pause: vi.fn(),
        };
      });
      vi.stubGlobal('Audio', audioCtorSpy);

      const fetchSpy = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      }));
      vi.stubGlobal('fetch', fetchSpy);

      await unlockQrVoiceAudio();
      // Let background preloadCoreOfflineAudioClips() microtasks settle before measuring /05.mp3 caching
      await new Promise((resolve) => setTimeout(resolve, 0));
      audioCtorSpy.mockClear();
      fetchSpy.mockClear();
      MobileMockAudioContext.instances[0]!.decodeAudioData.mockClear();

      await defaultPlayAudioClip('/audio/vi/05.mp3', 1, 0.9, 'vi-female-standard');
      await defaultPlayAudioClip('/audio/vi/05.mp3', 1, 0.9, 'vi-female-standard');

      // Played via Web Audio API without spawning any new HTMLAudioElement!
      expect(audioCtorSpy).not.toHaveBeenCalled();
      // Decoded & cached on first play, reused from cache on second play
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(MobileMockAudioContext.instances[0]!.decodeAudioData).toHaveBeenCalledTimes(1);
    });
  });

  describe('Layer 2: Mobile silent-audio Keep-Alive, Media Session & Wake Lock', () => {
    it('builds a valid RIFF/WAVE silent PCM payload and defaults keep-alive to true on mobile, false on desktop', () => {
      const wav = buildSilentKeepAliveWavBytes(1, 8000);
      expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
      expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
      expect(wav.length).toBe(44 + 8000);
      expect(wav[44]).toBe(0x80);

      stubUserAgent('Mozilla/5.0 (Linux; Android 14; Mobile)', 5);
      expect(isMobileBackgroundKeepAliveEnabled()).toBe(true);

      stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
      expect(isMobileBackgroundKeepAliveEnabled()).toBe(false);

      setMobileBackgroundKeepAliveEnabled(true);
      expect(localStorage.getItem(MOBILE_AUDIO_KEEPALIVE_STORAGE_KEY)).toBe('true');
      expect(isMobileBackgroundKeepAliveEnabled()).toBe(true);
    });

    it('starts unmuted looping keep-alive audio, configures MediaSession, acquires WakeLock, and cleans up on stop', async () => {
      stubUserAgent('Mozilla/5.0 (Linux; Android 14; Mobile)', 5);

      const mockAudio = {
        loop: false,
        preload: '',
        muted: true,
        volume: 1,
        paused: true,
        playsInline: false,
        setAttribute: vi.fn(),
        onplay: null as null | (() => void),
        onpause: null as null | (() => void),
        play: vi.fn(async () => {
          mockAudio.paused = false;
          mockAudio.onplay?.();
        }),
        pause: vi.fn(() => {
          mockAudio.paused = true;
          mockAudio.onpause?.();
        }),
      };
      vi.stubGlobal(
        'Audio',
        vi.fn(function MockKeepAliveAudio() {
          return mockAudio;
        }),
      );
      vi.stubGlobal(
        'MediaMetadata',
        vi.fn(function MockMediaMetadata(init: unknown) {
          return init;
        }),
      );
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:silent-wav');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      const mediaSession = {
        metadata: null as unknown,
        playbackState: 'none',
        setActionHandler: vi.fn(),
      };
      Object.defineProperty(window.navigator, 'mediaSession', {
        configurable: true,
        value: mediaSession,
      });

      const releaseWakeLock = vi.fn(async () => undefined);
      Object.defineProperty(window.navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: vi.fn(async () => ({
            released: false,
            release: releaseWakeLock,
            addEventListener: vi.fn(),
          })),
        },
      });

      const started = await startMobileAudioKeepAlive('Mì Cay Quán');
      expect(started).toBe(true);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(mockAudio.loop).toBe(true);
      expect(mockAudio.muted).toBe(false);
      expect(mediaSession.playbackState).toBe('playing');

      stopMobileAudioKeepAlive();
      expect(mockAudio.pause).toHaveBeenCalled();
      expect(releaseWakeLock).toHaveBeenCalled();
      expect(mediaSession.playbackState).toBe('none');
    });
  });

  describe('Layer 3: Real public/sw.js Service Worker push anti-double-alert & notificationclick', () => {
    function loadServiceWorkerHarness(windowClients: Array<{
      url: string;
      visibilityState: string;
      focused: boolean;
      postMessage: ReturnType<typeof vi.fn>;
      focus: ReturnType<typeof vi.fn>;
    }>) {
      const swPath = path.resolve(process.cwd(), 'public/sw.js');
      const swSource = fs.readFileSync(swPath, 'utf8');
      const listeners = new Map<string, (event: unknown) => void>();
      const showNotification = vi.fn(async () => undefined);
      const openWindow = vi.fn(async () => undefined);

      const swSelf = {
        location: { origin: 'https://pos.example.com' },
        skipWaiting: vi.fn(async () => undefined),
        registration: { showNotification },
        clients: {
          claim: vi.fn(async () => undefined),
          matchAll: vi.fn(async () => windowClients),
          openWindow,
        },
        addEventListener: (name: string, fn: (event: unknown) => void) => {
          listeners.set(name, fn);
        },
      };

      vm.runInNewContext(swSource, { self: swSelf, Date, JSON, console });
      return { listeners, showNotification, openWindow };
    }

    it('suppresses OS push notification when staff is actively focused on the web app (anti-double-alert)', async () => {
      const focusedClient = {
        url: 'https://pos.example.com/pos',
        visibilityState: 'visible',
        focused: true,
        postMessage: vi.fn(),
        focus: vi.fn(async () => undefined),
      };
      const { listeners, showNotification } = loadServiceWorkerHarness([focusedClient]);

      let pending: Promise<unknown> = Promise.resolve();
      listeners.get('push')!({
        data: {
          json: () => ({
            kind: 'QR_NEW',
            title: 'Đơn QR mới · Bàn 05',
            body: 'Bàn 05 vừa gửi đơn mới',
            tag: 'qr-new-5',
            url: '/pos?orderId=5',
          }),
        },
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
      });
      await pending;

      expect(showNotification).not.toHaveBeenCalled();
      expect(focusedClient.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'POS_PUSH_SUPPRESSED_FOREGROUND' }),
      );
    });

    it('displays OS push notification when phone screen is off / tab hidden, and focuses POS on notificationclick', async () => {
      const hiddenClient = {
        url: 'https://pos.example.com/pos',
        visibilityState: 'hidden',
        focused: false,
        postMessage: vi.fn(),
        focus: vi.fn(async () => undefined),
      };
      const { listeners, showNotification } = loadServiceWorkerHarness([hiddenClient]);

      let pendingPush: Promise<unknown> = Promise.resolve();
      listeners.get('push')!({
        data: {
          json: () => ({
            kind: 'QR_OVERDUE_REMINDER',
            title: 'Nhắc lại: Bàn 05 chưa xác nhận',
            body: 'Đơn QR mới tại Bàn 05 đã chờ 5 phút',
            tag: 'qr-reminder-5',
            url: '/pos?orderId=5',
            orderId: 5,
          }),
        },
        waitUntil: (p: Promise<unknown>) => {
          pendingPush = p;
        },
      });
      await pendingPush;

      expect(showNotification).toHaveBeenCalledWith(
        'Nhắc lại: Bàn 05 chưa xác nhận',
        expect.objectContaining({
          body: 'Đơn QR mới tại Bàn 05 đã chờ 5 phút',
          tag: 'qr-reminder-5',
          requireInteraction: true,
          renotify: true,
        }),
      );

      let pendingClick: Promise<unknown> = Promise.resolve();
      const close = vi.fn();
      listeners.get('notificationclick')!({
        notification: {
          close,
          data: { url: '/pos?orderId=5', orderId: 5 },
        },
        waitUntil: (p: Promise<unknown>) => {
          pendingClick = p;
        },
      });
      await pendingClick;

      expect(close).toHaveBeenCalledTimes(1);
      expect(hiddenClient.focus).toHaveBeenCalledTimes(1);
      expect(hiddenClient.postMessage).toHaveBeenCalledWith({
        type: 'POS_NOTIFICATION_CLICK',
        url: '/pos?orderId=5',
        orderId: 5,
      });
    });
  });

  describe('Mobile Activation Banner & 3-Layer Control Popover UI', () => {
    it('shows 1-tap audio unlock banner on mobile and hides it once user taps to activate', async () => {
      stubUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        5,
      );

      render(<MobileAudioActivationBanner />);
      expect(screen.getByTestId('mobile-audio-unlock-banner')).toBeInTheDocument();
      expect(screen.getByText(/nút gạt chuông bên hông iPhone/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mobile-audio-unlock-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('mobile-audio-unlock-banner')).not.toBeInTheDocument();
      });
      expect(getQrAudioUnlockState()).toBe('unlocked');
    });

    it('displays iPhone Add-to-Home-Screen guide when opened in non-standalone iOS Safari', async () => {
      stubUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        5,
      );
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });

      render(<MobileAlertControlButton />);
      fireEvent.pointerDown(screen.getByTestId('mobile-alerts-menu-trigger'));
      fireEvent.click(screen.getByTestId('mobile-alerts-menu-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('ios-pwa-install-guide')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mobile-alerts-push-toggle')).toBeDisabled();
    });

    it('subscribes device to Web Push on supported HTTPS mobile browser and shows active confirmation', async () => {
      stubUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        5,
      );
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
      vi.stubGlobal('PushManager', function MockPushManager() {});
      vi.stubGlobal('Notification', {
        permission: 'default',
        requestPermission: vi.fn(async () => 'granted'),
      });

      const fakeSubscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/android-test-1',
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/android-test-1',
          keys: { p256dh: 'A'.repeat(64), auth: 'B'.repeat(22) },
        }),
        unsubscribe: vi.fn(async () => true),
      };
      const fakeRegistration = {
        pushManager: {
          getSubscription: vi.fn(async () => null),
          subscribe: vi.fn(async () => fakeSubscription),
        },
      };
      Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: vi.fn(async () => fakeRegistration),
          register: vi.fn(async () => fakeRegistration),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });

      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ publicKey: 'A'.repeat(87) });
      const postSpy = vi
        .spyOn(apiClient, 'post')
        .mockResolvedValue({ subscribed: true, activeCount: 1 });

      render(<MobileAlertControlButton />);
      fireEvent.pointerDown(screen.getByTestId('mobile-alerts-menu-trigger'));
      fireEvent.click(screen.getByTestId('mobile-alerts-menu-trigger'));

      const pushToggle = await screen.findByTestId('mobile-alerts-push-toggle');
      expect(pushToggle).not.toBeDisabled();
      fireEvent.click(pushToggle);

      await waitFor(() => {
        expect(screen.getByTestId('mobile-alerts-push-active')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mobile-alerts-socket-status')).toBeInTheDocument();
      expect(getSpy).toHaveBeenCalledWith('/api/v1/pos/push/vapid-public-key');
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/pos/push/subscriptions',
        expect.objectContaining({
          endpoint: 'https://fcm.googleapis.com/fcm/send/android-test-1',
          deviceLabel: 'Điện thoại Android',
        }),
      );

      // Verify 5s self-test Push button calls POST /api/v1/pos/push/test
      postSpy.mockResolvedValueOnce({ scheduled: true, delaySeconds: 5, activeSubscriptions: 1 });
      fireEvent.click(screen.getByTestId('mobile-alerts-push-test-btn'));
      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/push/test', { delaySeconds: 5 });
      });
      expect(screen.getByTestId('mobile-alerts-push-message')).toHaveTextContent(/5 giây/i);
    });
  });
});
