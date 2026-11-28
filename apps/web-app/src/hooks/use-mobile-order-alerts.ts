import * as React from 'react';

import { useQrVoiceToggle } from '@/hooks/use-qr-voice-toggle';
import {
  getMobileKeepAliveRuntimeState,
  isIosDevice,
  isLikelyMobileDevice,
  isMobileBackgroundKeepAliveEnabled,
  isStandalonePwa,
  requestScreenWakeLock,
  setMobileBackgroundKeepAliveEnabled,
  startMobileAudioKeepAlive,
  stopMobileAudioKeepAlive,
  subscribeMobileBackgroundKeepAlivePref,
  subscribeMobileKeepAliveRuntimeState,
  type MobileKeepAliveRuntimeState,
} from '@/lib/mobile-audio-keepalive';
import {
  getQrAudioUnlockState,
  isQrVoiceAlertEnabled,
  playCashierChime,
  subscribeQrAudioUnlockState,
  unlockQrVoiceAudio,
  type QrAudioUnlockState,
} from '@/lib/qr-voice-announcer';
import {
  getCurrentBrowserPushSubscription,
  getWebPushSupportInfo,
  sendTestWebPush,
  subscribeDeviceToWebPush,
  syncExistingPushSubscriptionWithSession,
  unsubscribeDeviceFromWebPush,
  type WebPushSupportInfo,
} from '@/lib/web-push-client';
import { usePosSocketContext } from '@/providers/socket-provider';

export interface MobileOrderAlertsState {
  voiceEnabled: boolean;
  toggleVoice: () => void;
  audioUnlockState: QrAudioUnlockState;
  needsAudioTap: boolean;
  socketConnected: boolean;
  isMobile: boolean;
  isIos: boolean;
  isStandalone: boolean;
  keepAliveEnabled: boolean;
  keepAliveRuntime: MobileKeepAliveRuntimeState;
  toggleKeepAlive: () => Promise<void>;
  activateAudioNow: (options?: { playTestChime?: boolean; storeName?: string }) => Promise<boolean>;
  pushSupport: WebPushSupportInfo;
  pushSubscribed: boolean;
  pushBusy: boolean;
  pushTestBusy: boolean;
  pushMessage: string | null;
  togglePush: () => Promise<void>;
  sendTestPush: (delaySeconds?: number) => Promise<void>;
}

const PUSH_SUBSCRIPTION_SYNC_EVENT = 'fnb:web-push-subscription-changed';

function broadcastPushStateChange(subscribed: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PUSH_SUBSCRIPTION_SYNC_EVENT, { detail: { subscribed } }));
}

/**
 * Shared React hook exposing live state and user actions for all 3 mobile notification layers:
 * 1) Foreground Web Audio unlock + voice toggle
 * 2) Background silent-audio Keep-Alive + Media Session + Wake Lock
 * 3) Web Push Notification subscription (with iOS Add-to-Home-Screen awareness)
 */
export function useMobileOrderAlerts(options?: {
  enabled?: boolean;
  storeName?: string;
}): MobileOrderAlertsState {
  const enabled = options?.enabled ?? true;
  const storeName = options?.storeName;

  const { voiceEnabled, toggleVoice } = useQrVoiceToggle();
  const { isConnected: socketConnected } = usePosSocketContext();
  const [audioUnlockState, setAudioUnlockState] = React.useState<QrAudioUnlockState>(() =>
    getQrAudioUnlockState(),
  );
  const [keepAliveEnabled, setKeepAliveEnabled] = React.useState<boolean>(() =>
    isMobileBackgroundKeepAliveEnabled(),
  );
  const [keepAliveRuntime, setKeepAliveRuntime] = React.useState<MobileKeepAliveRuntimeState>(() =>
    getMobileKeepAliveRuntimeState(),
  );
  const [pushSupport, setPushSupport] = React.useState<WebPushSupportInfo>(() =>
    getWebPushSupportInfo(),
  );
  const [pushSubscribed, setPushSubscribed] = React.useState<boolean>(false);
  const [pushBusy, setPushBusy] = React.useState<boolean>(false);
  const [pushTestBusy, setPushTestBusy] = React.useState<boolean>(false);
  const [pushMessage, setPushMessage] = React.useState<string | null>(null);

  const isMobile = isLikelyMobileDevice();
  const isIos = isIosDevice();
  const isStandalone = isStandalonePwa();

  React.useEffect(() => {
    setAudioUnlockState(getQrAudioUnlockState());
    return subscribeQrAudioUnlockState((next) => setAudioUnlockState(next));
  }, []);

  React.useEffect(() => {
    setKeepAliveEnabled(isMobileBackgroundKeepAliveEnabled());
    return subscribeMobileBackgroundKeepAlivePref((next) => setKeepAliveEnabled(next));
  }, []);

  React.useEffect(() => {
    setKeepAliveRuntime(getMobileKeepAliveRuntimeState());
    return subscribeMobileKeepAliveRuntimeState((next) => setKeepAliveRuntime(next));
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setPushSubscribed(false);
      return;
    }

    let cancelled = false;
    const refreshPushState = async () => {
      setPushSupport(getWebPushSupportInfo());
      const sub = await getCurrentBrowserPushSubscription();
      if (!cancelled) {
        setPushSubscribed(Boolean(sub));
      }
    };

    void refreshPushState();

    const handleBroadcast = (event: Event) => {
      const detail = (event as CustomEvent<{ subscribed?: boolean }>).detail;
      if (typeof detail?.subscribed === 'boolean') {
        setPushSubscribed(detail.subscribed);
      } else {
        void refreshPushState();
      }
    };

    window.addEventListener(PUSH_SUBSCRIPTION_SYNC_EVENT, handleBroadcast);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_SUBSCRIPTION_SYNC_EVENT, handleBroadcast);
    };
  }, [enabled]);

  const activateAudioNow = React.useCallback(
    async (opts?: { playTestChime?: boolean; storeName?: string }): Promise<boolean> => {
      const unlocked = await unlockQrVoiceAudio();
      setAudioUnlockState(getQrAudioUnlockState());

      if (unlocked && opts?.playTestChime) {
        await playCashierChime(0.8);
      }

      if (unlocked && voiceEnabled && isMobileBackgroundKeepAliveEnabled()) {
        await startMobileAudioKeepAlive(opts?.storeName ?? storeName);
      }
      return unlocked;
    },
    [voiceEnabled, storeName],
  );

  const toggleKeepAlive = React.useCallback(async () => {
    const next = !keepAliveEnabled;
    setMobileBackgroundKeepAliveEnabled(next);
    setKeepAliveEnabled(next);
    if (next && voiceEnabled) {
      await unlockQrVoiceAudio();
      await startMobileAudioKeepAlive(storeName);
    } else {
      stopMobileAudioKeepAlive();
    }
  }, [keepAliveEnabled, voiceEnabled, storeName]);

  const togglePush = React.useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (pushSubscribed) {
        await unsubscribeDeviceFromWebPush();
        setPushSubscribed(false);
        broadcastPushStateChange(false);
        setPushSupport(getWebPushSupportInfo());
        setPushMessage('Đã tắt thông báo đẩy trên thiết bị này.');
      } else {
        const result = await subscribeDeviceToWebPush();
        setPushSupport(getWebPushSupportInfo());
        if (result.ok) {
          setPushSubscribed(true);
          broadcastPushStateChange(true);
          setPushMessage('Đã bật thông báo đẩy — sẽ báo chuông ngay cả khi tắt màn hình.');
        } else {
          setPushSubscribed(false);
          broadcastPushStateChange(false);
          setPushMessage(result.message);
        }
      }
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushSubscribed]);

  const sendTestPush = React.useCallback(
    async (delaySeconds = 5) => {
      if (pushTestBusy || !pushSubscribed) return;
      setPushTestBusy(true);
      setPushMessage(null);
      try {
        const res = await sendTestWebPush(delaySeconds);
        if (res.scheduled) {
          setPushMessage(
            `Đã hẹn gửi thử — hãy khoá màn hình, thông báo đẩy sẽ tới sau ${res.delaySeconds} giây!`,
          );
        } else {
          setPushMessage('Phiên đăng nhập chưa có đăng ký Push hợp lệ. Hãy tắt và bật lại Push.');
        }
      } catch (err) {
        setPushMessage(
          err instanceof Error ? err.message : 'Không thể gửi thử thông báo đẩy lúc này.',
        );
      } finally {
        setPushTestBusy(false);
      }
    },
    [pushTestBusy, pushSubscribed],
  );

  // Show the 1-tap activation bar whenever voice is ON and:
  // - Audio was explicitly blocked/interrupted ('locked') on any device, OR
  // - We are on a mobile device and the user has not unlocked audio yet ('unknown' / 'locked')
  const needsAudioTap =
    enabled &&
    voiceEnabled &&
    (audioUnlockState === 'locked' || (isMobile && audioUnlockState !== 'unlocked'));

  return {
    voiceEnabled,
    toggleVoice,
    audioUnlockState,
    needsAudioTap,
    socketConnected,
    isMobile,
    isIos,
    isStandalone,
    keepAliveEnabled,
    keepAliveRuntime,
    toggleKeepAlive,
    activateAudioNow,
    pushSupport,
    pushSubscribed,
    pushBusy,
    pushTestBusy,
    pushMessage,
    togglePush,
    sendTestPush,
  };
}

/**
 * Mounted once in AppShell for authenticated POS staff.
 * Handles:
 * - Resilient gesture unlock (click / keydown) that automatically
 *   re-unlocks whenever iOS/Android suspends or interrupts AudioContext after backgrounding
 * - Starting/stopping Layer 2 background keep-alive & Screen Wake Lock
 * - Silently re-syncing granted Web Push subscriptions to the active session
 * - Navigating when user taps a Web Push notification from lock screen
 */
export interface SwForegroundPushPayload {
  kind?: string;
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  orderId?: number;
  tableLabel?: string;
  batchNo?: number;
  timestamp?: string;
}

export function useMobileOrderAlertLifecycle(options: {
  enabled: boolean;
  storeName?: string;
  onNavigateToUrl?: (url: string) => void;
  onForegroundPushOrderAlert?: (payload: SwForegroundPushPayload) => void;
}): void {
  const { enabled, storeName, onNavigateToUrl, onForegroundPushOrderAlert } = options;
  const navigateRef = React.useRef(onNavigateToUrl);
  navigateRef.current = onNavigateToUrl;
  const foregroundPushAlertRef = React.useRef(onForegroundPushOrderAlert);
  foregroundPushAlertRef.current = onForegroundPushOrderAlert;

  const [voiceEnabled, setVoiceEnabled] = React.useState<boolean>(() => false);
  const { voiceEnabled: liveVoice } = useQrVoiceToggle();

  React.useEffect(() => {
    setVoiceEnabled(liveVoice);
  }, [liveVoice]);

  // 1. Resilient gesture unlock + visibility recovery for mobile & desktop
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      stopMobileAudioKeepAlive();
      return;
    }

    const attemptGestureUnlock = () => {
      if (!voiceEnabled) return;
      const unlockState = getQrAudioUnlockState();
      const shouldStartKeepAlive =
        isMobileBackgroundKeepAliveEnabled() && !getMobileKeepAliveRuntimeState().active;

      if (unlockState !== 'unlocked' || shouldStartKeepAlive) {
        void unlockQrVoiceAudio().then((ok) => {
          if (ok && isMobileBackgroundKeepAliveEnabled()) {
            void startMobileAudioKeepAlive(storeName);
          }
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && voiceEnabled) {
        // Re-check AudioContext state and re-acquire Wake Lock when returning from lock screen
        void unlockQrVoiceAudio();
        if (isMobileBackgroundKeepAliveEnabled() && getMobileKeepAliveRuntimeState().active) {
          void requestScreenWakeLock();
        }
      }
    };

    // Unlock on click/keydown (never pointerdown/touchend) so dismissing an in-flow
    // activation banner cannot shift layout mid-tap between pointerdown and pointerup/click.
    window.addEventListener('click', attemptGestureUnlock, { passive: true });
    window.addEventListener('keydown', attemptGestureUnlock, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('click', attemptGestureUnlock);
      window.removeEventListener('keydown', attemptGestureUnlock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, voiceEnabled, storeName]);

  // 2. Stop keep-alive cleanly when voice alert is toggled off
  React.useEffect(() => {
    if (!enabled || !voiceEnabled) {
      stopMobileAudioKeepAlive();
    }
  }, [enabled, voiceEnabled]);

  // 3. Re-sync existing Web Push subscription with current active session & handle SW click navigation
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    void syncExistingPushSubscriptionWithSession();

    if (!('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        url?: string;
        payload?: SwForegroundPushPayload;
      } | null;
      if (data?.type === 'POS_NOTIFICATION_CLICK' && typeof data.url === 'string') {
        navigateRef.current?.(data.url);
        return;
      }
      if (data?.type === 'POS_PUSH_FOREGROUND_CHECK') {
        const audioReady =
          isQrVoiceAlertEnabled() && getQrAudioUnlockState() === 'unlocked';
        const replyPort = event.ports?.[0];
        if (replyPort && typeof replyPort.postMessage === 'function') {
          try {
            replyPort.postMessage({ handledByAudio: audioReady });
          } catch {
            // Ignore MessageChannel reply error
          }
        }
        return;
      }
      if (data?.type === 'POS_PUSH_SUPPRESSED_FOREGROUND' && data.payload) {
        foregroundPushAlertRef.current?.(data.payload);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [enabled]);
}
