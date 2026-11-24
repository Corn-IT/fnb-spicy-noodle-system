export const MOBILE_AUDIO_KEEPALIVE_STORAGE_KEY = 'fnb-pos-mobile-keepalive' as const;
const MOBILE_KEEPALIVE_PREF_EVENT = 'fnb:mobile-keepalive-pref-changed';

export interface MobileKeepAliveRuntimeState {
  active: boolean;
  wakeLockActive: boolean;
}

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
  standalone?: boolean;
};

let keepAliveAudioElement: HTMLAudioElement | null = null;
let keepAliveBlobUrl: string | null = null;
let wakeLockSentinel: WakeLockSentinelLike | null = null;
let runtimeState: MobileKeepAliveRuntimeState = {
  active: false,
  wakeLockActive: false,
};
const runtimeListeners = new Set<(state: MobileKeepAliveRuntimeState) => void>();

function notifyRuntimeListeners(): void {
  const snapshot = { ...runtimeState };
  for (const listener of runtimeListeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore subscriber errors
    }
  }
}

function setRuntimeState(partial: Partial<MobileKeepAliveRuntimeState>): void {
  const nextActive = partial.active ?? runtimeState.active;
  const nextWakeLock = partial.wakeLockActive ?? runtimeState.wakeLockActive;
  if (nextActive === runtimeState.active && nextWakeLock === runtimeState.wakeLockActive) {
    return;
  }
  runtimeState = { active: nextActive, wakeLockActive: nextWakeLock };
  notifyRuntimeListeners();
}

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/iPhone|iPad|iPod|Android|Mobile|Silk|Kindle/i.test(ua)) {
    return true;
  }
  // iPadOS desktop-mode Safari reports Macintosh with multi-touch support
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as NavigatorWithWakeLock;
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia === 'function') {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches
    );
  }
  return false;
}

/**
 * Device-level preference for keeping a lightweight silent audio session alive so mobile browsers
 * continue playing voice order alerts when the screen turns off or user switches to a light app.
 * Defaults to `true` on mobile devices and `false` on desktop. Preserved across logout (Invariant 9).
 */
export function isMobileBackgroundKeepAliveEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(MOBILE_AUDIO_KEEPALIVE_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // Ignore storage read errors
  }
  return isLikelyMobileDevice();
}

export function setMobileBackgroundKeepAliveEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOBILE_AUDIO_KEEPALIVE_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(MOBILE_KEEPALIVE_PREF_EVENT, { detail: { enabled } }));
  } catch {
    // Ignore storage write errors
  }
}

export function subscribeMobileBackgroundKeepAlivePref(
  listener: (enabled: boolean) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener(isMobileBackgroundKeepAliveEnabled());
  window.addEventListener(MOBILE_KEEPALIVE_PREF_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(MOBILE_KEEPALIVE_PREF_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function getMobileKeepAliveRuntimeState(): MobileKeepAliveRuntimeState {
  return { ...runtimeState };
}

export function subscribeMobileKeepAliveRuntimeState(
  listener: (state: MobileKeepAliveRuntimeState) => void,
): () => void {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

/**
 * Generates a tiny valid 1-second 8kHz mono 8-bit unsigned PCM silent WAV buffer (value 0x80 = zero amplitude).
 */
export function buildSilentKeepAliveWavBytes(durationSeconds = 1, sampleRate = 8000): Uint8Array {
  const numSamples = Math.max(800, Math.round(durationSeconds * sampleRate));
  const dataSize = numSamples;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // ByteRate = sampleRate * 1 * 8/8
  view.setUint16(32, 1, true); // BlockAlign
  view.setUint16(34, 8, true); // BitsPerSample = 8
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const bytes = new Uint8Array(buffer);
  bytes.fill(0x80, 44);
  return bytes;
}

function getKeepAliveWavUrl(): string | null {
  if (keepAliveBlobUrl) return keepAliveBlobUrl;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') {
    return null;
  }
  const wavBytes = buildSilentKeepAliveWavBytes(1, 8000);
  const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  keepAliveBlobUrl = URL.createObjectURL(blob);
  return keepAliveBlobUrl;
}

function configureMediaSession(storeName?: string): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    const ms = navigator.mediaSession;
    if (typeof window !== 'undefined' && typeof window.MediaMetadata === 'function') {
      ms.metadata = new window.MediaMetadata({
        title: 'Đang lắng nghe đơn QR mới',
        artist: storeName?.trim() || 'POS Mì Cay',
        album: 'Thông báo giọng nói nền',
        artwork: [
          {
            src: '/images/logo-icon-square.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      });
    }
    ms.playbackState = 'playing';
    ms.setActionHandler('play', () => {
      void startMobileAudioKeepAlive(storeName);
    });
    ms.setActionHandler('pause', () => {
      stopMobileAudioKeepAlive();
    });
  } catch {
    // Ignore MediaSession errors on older browsers
  }
}

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  if (wakeLockSentinel && !wakeLockSentinel.released) return true;

  const nav = navigator as NavigatorWithWakeLock;
  if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
    return false;
  }

  try {
    const sentinel = await nav.wakeLock.request('screen');
    wakeLockSentinel = sentinel;
    setRuntimeState({ wakeLockActive: true });
    sentinel.addEventListener?.('release', () => {
      if (wakeLockSentinel === sentinel) {
        wakeLockSentinel = null;
        setRuntimeState({ wakeLockActive: false });
      }
    });
    return true;
  } catch {
    setRuntimeState({ wakeLockActive: false });
    return false;
  }
}

export function releaseScreenWakeLock(): void {
  if (!wakeLockSentinel) return;
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  setRuntimeState({ wakeLockActive: false });
  void sentinel.release().catch(() => undefined);
}

/**
 * Starts the looping silent audio session + Media Session + optional Screen Wake Lock.
 * Must be called after (or inside) a user gesture on mobile.
 */
export async function startMobileAudioKeepAlive(storeName?: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')) {
    return false;
  }

  const wavUrl = getKeepAliveWavUrl();
  if (!wavUrl) return false;

  if (!keepAliveAudioElement) {
    const audio = new window.Audio(wavUrl);
    audio.loop = true;
    audio.preload = 'auto';
    // Must stay unmuted with tiny positive volume so iOS/Android treats it as an active audio session
    audio.muted = false;
    audio.volume = 0.01;
    if ('playsInline' in audio) {
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    }
    if (typeof audio.setAttribute === 'function') {
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
    }
    audio.onpause = () => {
      if (keepAliveAudioElement === audio && audio.paused) {
        setRuntimeState({ active: false });
      }
    };
    audio.onplay = () => {
      if (keepAliveAudioElement === audio) {
        setRuntimeState({ active: true });
      }
    };
    keepAliveAudioElement = audio;
  }

  try {
    if (keepAliveAudioElement.paused) {
      const playPromise = keepAliveAudioElement.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
    }
    configureMediaSession(storeName);
    setRuntimeState({ active: true });
    void requestScreenWakeLock();
    return true;
  } catch {
    setRuntimeState({ active: false });
    return false;
  }
}

export function stopMobileAudioKeepAlive(): void {
  if (keepAliveAudioElement) {
    try {
      keepAliveAudioElement.pause();
    } catch {
      // Ignore pause error
    }
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
    } catch {
      // Ignore
    }
  }
  releaseScreenWakeLock();
  setRuntimeState({ active: false, wakeLockActive: false });
}

export function resetMobileKeepAliveForTesting(): void {
  stopMobileAudioKeepAlive();
  keepAliveAudioElement = null;
  if (keepAliveBlobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(keepAliveBlobUrl);
    } catch {
      // Ignore
    }
  }
  keepAliveBlobUrl = null;
}
