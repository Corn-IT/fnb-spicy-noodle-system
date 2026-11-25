import {
  clampQrReminderConfig,
  clampVoiceRate,
  clampVoiceVolume,
  DEFAULT_QR_REMINDER_CONFIG,
  DEFAULT_QR_VOICE_ENGINE_CONFIG,
  parseQrReminderConfig,
  parseQrVoiceEngineConfig,
  serializeQrReminderConfig,
  serializeQrVoiceEngineConfig,
  type QrReminderConfig,
  type QrVoiceAlertKind,
  type QrVoiceEngineConfig,
  type QrVoiceProfileType,
} from '@fnb/shared';
import { env } from '@/config/env';
import {
  isQrVoiceAlertEnabled,
  QR_VOICE_ALERT_STORAGE_KEY,
  setQrVoiceAlertEnabled,
  subscribeQrVoiceAlertState,
} from '@/lib/voice-alert-preference';
import { resolveCachedAppMessage } from '@/utils/store-messages-cache';

export {
  clampQrReminderConfig,
  clampVoiceRate,
  clampVoiceVolume,
  DEFAULT_QR_REMINDER_CONFIG,
  DEFAULT_QR_VOICE_ENGINE_CONFIG,
  parseQrReminderConfig,
  parseQrVoiceEngineConfig,
  serializeQrReminderConfig,
  serializeQrVoiceEngineConfig,
  type QrReminderConfig,
  type QrVoiceAlertKind,
  type QrVoiceEngineConfig,
  type QrVoiceProfileType,
};

export {
  isQrVoiceAlertEnabled,
  QR_VOICE_ALERT_STORAGE_KEY,
  setQrVoiceAlertEnabled,
  subscribeQrVoiceAlertState,
};

export interface QrVoiceAlertItem {
  tableLabel: string;
  kind: QrVoiceAlertKind;
  batchNo?: number;
  orderCode?: string;
  forcePlay?: boolean;
  customText?: string;
  isReminder?: boolean;
  reminderTables?: Array<{ tableLabel: string; kind: QrVoiceAlertKind }>;
  configOverride?: Partial<QrVoiceEngineConfig>;
}

export interface QrVoiceAnnouncerOptions {
  dedupWindowMs?: number;
  maxQueueSize?: number;
  interItemDelayMs?: number;
  nowFn?: () => number;
  playChimeFn?: (volume?: number) => Promise<void>;
  playClipFn?: (
    src: string,
    rate?: number,
    volume?: number,
    voiceProfile?: QrVoiceProfileType,
  ) => Promise<void>;
  speakTtsFn?: (text: string, lang: string, config?: QrVoiceEngineConfig) => Promise<void>;
}

export function getVoiceProfileDetuneCents(profile: QrVoiceProfileType): number {
  if (profile === 'vi-female-bright') return 180;
  return 0;
}

export function getActiveQrReminderConfig(
  override?: Partial<QrReminderConfig>,
): QrReminderConfig {
  const resolved = resolveCachedAppMessage('pos.voice.reminderConfig');
  const base = parseQrReminderConfig(resolved.title);
  if (!override) return base;
  return clampQrReminderConfig({ ...base, ...override });
}

export function getActiveQrVoiceEngineConfig(
  override?: Partial<QrVoiceEngineConfig>,
): QrVoiceEngineConfig {
  const resolved = resolveCachedAppMessage('pos.voice.engineConfig');
  const base = parseQrVoiceEngineConfig(resolved.title);
  if (!override) return base;
  return {
    voiceProfile: override.voiceProfile ?? base.voiceProfile,
    rate: override.rate !== undefined ? clampVoiceRate(override.rate) : base.rate,
    volume: override.volume !== undefined ? clampVoiceVolume(override.volume) : base.volume,
    chimeEnabled: override.chimeEnabled ?? base.chimeEnabled,
  };
}

export type QrAudioUnlockState = 'unknown' | 'locked' | 'unlocked';

let sharedAudioContext: AudioContext | null = null;
let sharedHtmlAudioElement: HTMLAudioElement | null = null;
let audioUnlockState: QrAudioUnlockState = 'unknown';
const audioUnlockListeners = new Set<(state: QrAudioUnlockState) => void>();
const decodedAudioBufferCache = new Map<string, AudioBuffer>();
const MAX_DECODED_AUDIO_CACHE = 64;
const BLOCKED_ANNOUNCEMENT_REPLAY_TTL_MS = 90_000;
let pendingBlockedAnnouncement: { item: QrVoiceAlertItem; blockedAtMs: number } | null = null;

/** Minimal valid 0.05s 8kHz mono PCM silence WAV for unlocking HTMLAudioElement inside a mobile gesture. */
const SILENT_UNLOCK_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function setAudioUnlockState(next: QrAudioUnlockState): void {
  if (audioUnlockState === next) return;
  audioUnlockState = next;
  for (const listener of audioUnlockListeners) {
    try {
      listener(next);
    } catch {
      // Never allow listener errors to break audio unlock state propagation
    }
  }
}

export function getQrAudioUnlockState(): QrAudioUnlockState {
  if (sharedAudioContext) {
    const rawState = sharedAudioContext.state as string;
    if (rawState === 'running') {
      return 'unlocked';
    }
    if (rawState === 'suspended' || rawState === 'interrupted') {
      return 'locked';
    }
  }
  return audioUnlockState;
}

export function subscribeQrAudioUnlockState(
  listener: (state: QrAudioUnlockState) => void,
): () => void {
  audioUnlockListeners.add(listener);
  return () => {
    audioUnlockListeners.delete(listener);
  };
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return typeof ctor === 'function' ? ctor : null;
}

function syncUnlockStateFromContext(ctx: AudioContext): void {
  const rawState = ctx.state as string;
  if (rawState === 'running') {
    setAudioUnlockState('unlocked');
  } else if (rawState === 'suspended' || rawState === 'interrupted') {
    setAudioUnlockState('locked');
  }
}

function configureIosAudioSessionPlayback(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const navWithAudioSession = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (navWithAudioSession.audioSession && navWithAudioSession.audioSession.type !== 'playback') {
      navWithAudioSession.audioSession.type = 'playback';
    }
  } catch {
    // Ignore unsupported audioSession environments
  }
}

export function getSharedAudioContext(): AudioContext | null {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext;
  }
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    sharedAudioContext = ctx;
    syncUnlockStateFromContext(ctx);
    if (typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', () => {
        if (sharedAudioContext === ctx) {
          syncUnlockStateFromContext(ctx);
        }
      });
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function getSharedHtmlAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') return null;
  if (sharedHtmlAudioElement) return sharedHtmlAudioElement;
  try {
    const el = new window.Audio();
    el.preload = 'auto';
    if ('playsInline' in el) {
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    }
    if (typeof el.setAttribute === 'function') {
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
    }
    sharedHtmlAudioElement = el;
    return el;
  } catch {
    return null;
  }
}

export function resetAudioContextForTesting(): void {
  sharedAudioContext = null;
  sharedHtmlAudioElement = null;
  audioUnlockState = 'unknown';
  coreClipsPreloadStarted = false;
  pendingBlockedAnnouncement = null;
  decodedAudioBufferCache.clear();
}

export function clearDecodedAudioCacheForTesting(): void {
  decodedAudioBufferCache.clear();
}

function isAutoplayBlockedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'NotAllowedError' ||
    /notallowed|autoplay|user gesture|play\(\) failed/i.test(error.message)
  );
}

/**
 * Unlocks Web Audio (`AudioContext`) + reusable `HTMLAudioElement` inside a user gesture
 * (tap/click/touchend/keydown). Safe to call repeatedly — especially after returning from
 * iOS lock screen or background tab where AudioContext enters `suspended` / `interrupted`.
 */
export async function unlockQrVoiceAudio(): Promise<boolean> {
  configureIosAudioSessionPlayback();
  const ctx = getSharedAudioContext();
  let unlocked = false;

  if (ctx) {
    const rawState = ctx.state as string;
    if (rawState !== 'running' && typeof ctx.resume === 'function') {
      try {
        await ctx.resume();
      } catch {
        // Ignore autoplay restriction errors
      }
    }

    // Play a 1-sample silent buffer inside the gesture (canonical iOS Safari WebKit unlock)
    if (
      (ctx.state as string) === 'running' &&
      typeof ctx.createBuffer === 'function' &&
      typeof ctx.createBufferSource === 'function'
    ) {
      try {
        const silentBuf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // Ignore silent buffer errors
      }
    }

    unlocked = (ctx.state as string) === 'running';
    syncUnlockStateFromContext(ctx);
  }

  // Also warm up reusable HTMLAudioElement inside the same user gesture for mobile fallback
  const htmlAudio = getSharedHtmlAudioElement();
  if (
    htmlAudio &&
    htmlAudio.paused &&
    typeof navigator !== 'undefined' &&
    !/jsdom/i.test(navigator.userAgent ?? '')
  ) {
    try {
      const prevSrc = htmlAudio.src;
      htmlAudio.src = SILENT_UNLOCK_WAV_DATA_URI;
      htmlAudio.volume = 0.001;
      const playRes = htmlAudio.play();
      if (playRes && typeof playRes.then === 'function') {
        await playRes;
        htmlAudio.pause();
        htmlAudio.currentTime = 0;
        if (!ctx) {
          unlocked = true;
          setAudioUnlockState('unlocked');
        }
      }
      if (prevSrc && prevSrc !== SILENT_UNLOCK_WAV_DATA_URI) {
        htmlAudio.src = prevSrc;
      }
    } catch (err) {
      if (!unlocked && isAutoplayBlockedError(err)) {
        setAudioUnlockState('locked');
      }
    }
  }

  if (unlocked) {
    preloadCoreOfflineAudioClips();
    if (pendingBlockedAnnouncement) {
      const blocked = pendingBlockedAnnouncement;
      pendingBlockedAnnouncement = null;
      if (Date.now() - blocked.blockedAtMs <= BLOCKED_ANNOUNCEMENT_REPLAY_TTL_MS) {
        void enqueueQrVoiceAlert({ ...blocked.item, forcePlay: true });
      }
    }
  }
  return unlocked;
}

export function normalizeTableSpokenLabel(rawTableLabel: string | undefined | null): string {
  const trimmed = (rawTableLabel ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b0+(\d+)\b/g, '$1');
  if (!trimmed) return 'Bàn mới';
  if (/^(?:đơn\s+)?mang\s*về(?:\s|$|#)/i.test(trimmed)) {
    const takeawayMatch = /^(?:đơn\s+)?mang\s*về(?:\s*#?\s*(\d+))?$/i.exec(trimmed);
    if (takeawayMatch?.[1]) {
      return `Đơn mang về số ${takeawayMatch[1]}`;
    }
    if (takeawayMatch) {
      return 'Đơn mang về';
    }
    return /^đơn\s+/i.test(trimmed) ? trimmed : `Đơn ${trimmed}`;
  }
  if (/^b[aà]n\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^b[aà]n\b\s*/i, '');
    return rest ? `Bàn ${rest}` : 'Bàn mới';
  }
  return `Bàn ${trimmed}`;
}

/**
 * Normalizes table label and resolves dynamic Store Settings template (`pos.voice.qrNewOrder` / `pos.voice.qrAddonOrder` or reminder variants).
 */
export function formatTableAnnouncementText(
  rawTableLabel: string | undefined | null,
  kind: QrVoiceAlertKind,
  extraVars?: { batchNo?: number; orderCode?: string; isReminder?: boolean },
): string {
  const normalizedTable = normalizeTableSpokenLabel(rawTableLabel);
  const isReminder = Boolean(extraVars?.isReminder);
  const messageKey = isReminder
    ? kind === 'ADDON'
      ? 'pos.voice.qrAddonReminder'
      : 'pos.voice.qrNewReminder'
    : kind === 'ADDON'
      ? 'pos.voice.qrAddonOrder'
      : 'pos.voice.qrNewOrder';
  const resolved = resolveCachedAppMessage(messageKey, {
    tableLabel: normalizedTable,
    batchNo: extraVars?.batchNo ?? 2,
    orderCode: extraVars?.orderCode ?? '',
  });
  if (resolved.isOverridden && resolved.title.trim()) {
    return resolved.title.trim();
  }
  if (isReminder) {
    const suffix =
      kind === 'ADDON' ? 'có đơn gọi thêm chưa xác nhận' : 'có đơn mới chưa xác nhận';
    return `Nhắc lại: ${normalizedTable} ${suffix}`;
  }
  const suffix = kind === 'ADDON' ? 'có đơn gọi thêm' : 'có đơn mới';
  return `${normalizedTable} ${suffix}`;
}

export function formatMultiTableReminderText(rawTableLabels: string[]): string {
  const normalizedList: string[] = [];
  const seen = new Set<string>();
  for (const label of rawTableLabels) {
    const normalized = normalizeTableSpokenLabel(label);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalizedList.push(normalized);
    }
  }
  const tableLabelsText = normalizedList.join(', ') || 'Bàn chờ';
  const resolved = resolveCachedAppMessage('pos.voice.qrMultiReminder', {
    tableLabels: tableLabelsText,
    count: normalizedList.length,
  });
  if (resolved.isOverridden && resolved.title.trim()) {
    return resolved.title.trim();
  }
  return `Nhắc lại: ${tableLabelsText} đang chờ xác nhận đơn`;
}

export function isVoiceTemplateCustomized(kind: QrVoiceAlertKind, isReminder = false): boolean {
  const messageKey = isReminder
    ? kind === 'ADDON'
      ? 'pos.voice.qrAddonReminder'
      : 'pos.voice.qrNewReminder'
    : kind === 'ADDON'
      ? 'pos.voice.qrAddonOrder'
      : 'pos.voice.qrNewOrder';
  return resolveCachedAppMessage(messageKey, {
    tableLabel: 'Bàn 01',
    batchNo: 2,
    orderCode: 'HD-01',
  }).isOverridden;
}

export function isMultiReminderTemplateCustomized(): boolean {
  return resolveCachedAppMessage('pos.voice.qrMultiReminder', {
    tableLabels: 'Bàn 1, Bàn 2',
    count: 2,
  }).isOverridden;
}

/**
 * Extracts padded "01".."30" if the table label is strictly a standard numbered table ("Bàn 01".."Bàn 30" or "1".."30").
 * Returns null for custom table names like "Bàn VIP 1" or numbers outside 1..30.
 */
export function extractStandardTableNumber(rawTableLabel: string | undefined | null): string | null {
  const trimmed = (rawTableLabel ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  const match = /^(?:b[aà]n\s*)?0*(\d{1,2})$/i.exec(trimmed);
  if (!match?.[1]) return null;

  const num = Number(match[1]);
  if (!Number.isInteger(num) || num < 1 || num > 30) return null;

  return String(num).padStart(2, '0');
}

export function buildPublicTtsUrl(
  text: string,
  apiBaseUrl: string = env.VITE_API_BASE_URL,
): string {
  let base = (apiBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) {
    base = base.slice(0, -'/api/v1'.length);
  }
  const path = `/api/v1/public/tts?text=${encodeURIComponent(text)}`;
  return base ? `${base}${path}` : path;
}

/**
 * Builds the sequence of pre-recorded Vietnamese MP3 files for standard tables 01..30.
 */
export function getAudioClipSequence(
  rawTableLabel: string | undefined | null,
  kind: QrVoiceAlertKind,
  isReminder = false,
): string[] | null {
  const tableNum = extractStandardTableNumber(rawTableLabel);
  if (!tableNum) return null;

  const actionClip = kind === 'ADDON' ? '/audio/vi/co-don-goi-them.mp3' : '/audio/vi/co-don-moi.mp3';
  if (isReminder) {
    return [
      '/audio/vi/nhac-lai.mp3',
      '/audio/vi/ban.mp3',
      `/audio/vi/${tableNum}.mp3`,
      actionClip,
      '/audio/vi/chua-xac-nhan.mp3',
    ];
  }
  return ['/audio/vi/ban.mp3', `/audio/vi/${tableNum}.mp3`, actionClip];
}

export function getMultiTableReminderClipSequence(rawTableLabels: string[]): string[] | null {
  if (rawTableLabels.length === 0) return null;
  const nums: string[] = [];
  const seen = new Set<string>();
  for (const rawLabel of rawTableLabels) {
    const num = extractStandardTableNumber(rawLabel);
    if (!num) return null;
    if (!seen.has(num)) {
      seen.add(num);
      nums.push(num);
    }
  }
  return [
    '/audio/vi/nhac-lai.mp3',
    ...nums.flatMap((num) => ['/audio/vi/ban.mp3', `/audio/vi/${num}.mp3`]),
    '/audio/vi/dang-cho-xac-nhan.mp3',
  ];
}

/**
 * Plays a pleasant 2-tone "Ting-ting" chime using the singleton AudioContext.
 */
export async function playCashierChime(volume = 1): Promise<void> {
  try {
    configureIosAudioSessionPlayback();
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if ((ctx.state as string) !== 'running' && typeof ctx.resume === 'function') {
      await ctx.resume().catch(() => undefined);
    }
    if ((ctx.state as string) !== 'running') {
      setAudioUnlockState('locked');
      return;
    }

    const gainPeak = Math.max(0.02, Math.min(0.3, 0.16 * clampVoiceVolume(volume)));
    const now = ctx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(gainPeak, now + startOffset);
      if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
        gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    playTone(880, 0, 0.14);
    playTone(1174.66, 0.14, 0.2);
  } catch {
    // Ignore audio context errors in headless/test environments
  }
}

const AUDIO_FETCH_TIMEOUT_MS = 1800;
const CORE_OFFLINE_CLIPS_TO_PRELOAD = [
  '/audio/vi/ban.mp3',
  '/audio/vi/co-don-moi.mp3',
  '/audio/vi/co-don-goi-them.mp3',
] as const;

let coreClipsPreloadStarted = false;

/**
 * Warms up the most common static Vietnamese MP3 clips into decoded AudioBuffers
 * right after audio unlock so fallback or offline playback starts in < 30ms.
 */
export function preloadCoreOfflineAudioClips(): void {
  if (coreClipsPreloadStarted) return;
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')) return;

  const ctx = getSharedAudioContext();
  if (!ctx || (ctx.state as string) !== 'running' || typeof ctx.decodeAudioData !== 'function') {
    return;
  }

  coreClipsPreloadStarted = true;
  for (const src of CORE_OFFLINE_CLIPS_TO_PRELOAD) {
    if (decodedAudioBufferCache.has(src)) continue;
    void fetch(src)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf ? ctx.decodeAudioData(buf.slice(0)) : null))
      .then((decoded) => {
        if (decoded && decodedAudioBufferCache.size < MAX_DECODED_AUDIO_CACHE) {
          decodedAudioBufferCache.set(src, decoded);
        }
      })
      .catch(() => undefined);
  }
}

type WebAudioPlayOutcome =
  | { status: 'played' }
  | { status: 'fallback_html_audio' }
  | { status: 'network_failed'; reason: string };

async function fetchAudioBufferWithTimeout(src: string, timeoutMs = AUDIO_FETCH_TIMEOUT_MS): Promise<ArrayBuffer> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? window.setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;
  try {
    const res = await fetch(src, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) {
      throw new Error(`Audio fetch HTTP ${res.status}: ${src}`);
    }
    return await res.arrayBuffer();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Audio fetch timeout (${timeoutMs}ms): ${src}`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

async function playAudioClipViaWebAudio(
  src: string,
  rate: number,
  volume: number,
  detuneCents: number,
): Promise<WebAudioPlayOutcome> {
  const ctx = getSharedAudioContext();
  if (
    !ctx ||
    typeof ctx.decodeAudioData !== 'function' ||
    typeof ctx.createBufferSource !== 'function'
  ) {
    return { status: 'fallback_html_audio' };
  }

  try {
    configureIosAudioSessionPlayback();
    if ((ctx.state as string) !== 'running' && typeof ctx.resume === 'function') {
      await ctx.resume().catch(() => undefined);
    }
    if ((ctx.state as string) !== 'running') {
      setAudioUnlockState('locked');
      return { status: 'fallback_html_audio' };
    }

    let audioBuffer = decodedAudioBufferCache.get(src);
    if (!audioBuffer) {
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await fetchAudioBufferWithTimeout(src);
      } catch (fetchErr) {
        return {
          status: 'network_failed',
          reason: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        };
      }
      audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      if (decodedAudioBufferCache.size >= MAX_DECODED_AUDIO_CACHE) {
        const oldestKey = decodedAudioBufferCache.keys().next().value;
        if (oldestKey) decodedAudioBufferCache.delete(oldestKey);
      }
      decodedAudioBufferCache.set(src, audioBuffer);
    }

    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = audioBuffer;
      source.playbackRate.value = clampVoiceRate(rate);
      if (detuneCents !== 0 && source.detune) {
        source.detune.value = detuneCents;
      }
      gainNode.gain.value = clampVoiceVolume(volume);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      let settled = false;
      const durationMs =
        audioBuffer.duration && Number.isFinite(audioBuffer.duration)
          ? Math.ceil((audioBuffer.duration / clampVoiceRate(rate)) * 1000) + 1800
          : 5500;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, Math.max(2500, Math.min(12_000, durationMs)));

      source.onended = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      source.start(0);
    });
    return { status: 'played' };
  } catch (err) {
    if (isAutoplayBlockedError(err)) {
      setAudioUnlockState('locked');
    }
    return { status: 'fallback_html_audio' };
  }
}

export async function defaultPlayAudioClip(
  src: string,
  rate = 1,
  volume = 1,
  voiceProfile: QrVoiceProfileType = 'vi-female-standard',
): Promise<void> {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
    throw new Error('HTMLAudioElement not available');
  }
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')) {
    throw new Error('JSDOM does not support real media playback');
  }

  // Primary path for mobile & desktop: play via unlocked singleton AudioContext.
  // Unlike `new Audio(src).play()`, Web Audio BufferSource is NOT blocked by iOS/Android
  // autoplay policies on async Socket.io events once the AudioContext has been unlocked,
  // and GainNode volume works reliably on iOS Safari (where HTMLAudioElement.volume is read-only).
  const detuneCents = getVoiceProfileDetuneCents(voiceProfile);
  const webAudioOutcome = await playAudioClipViaWebAudio(src, rate, volume, detuneCents);
  if (webAudioOutcome.status === 'played') return;
  // Do NOT waste 6.5s retrying a broken HTTP 5xx/timed-out Cloud TTS URL in HTMLAudioElement —
  // reject immediately so QrVoiceAnnouncer falls back to offline /audio/vi/*.mp3 clips in < 50ms!
  if (webAudioOutcome.status === 'network_failed') {
    throw new Error(webAudioOutcome.reason);
  }

  return new Promise<void>((resolve, reject) => {
    const audio = getSharedHtmlAudioElement() ?? new window.Audio();
    audio.preload = 'auto';
    audio.src = src;
    const clampedRate = clampVoiceRate(rate);
    audio.playbackRate = clampedRate;
    audio.defaultPlaybackRate = clampedRate;
    audio.volume = clampVoiceVolume(volume);
    if ('preservesPitch' in audio) {
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Audio clip timeout: ${src}`));
    }, 6500);

    const cleanup = () => {
      window.clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
    };

    audio.onended = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    audio.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Failed to load audio clip: ${src}`));
    };

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (isAutoplayBlockedError(err)) {
          setAudioUnlockState('locked');
        }
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });
}

export async function defaultSpeakWebSpeechTts(
  text: string,
  lang = 'vi-VN',
  config?: QrVoiceEngineConfig,
): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    typeof window.SpeechSynthesisUtterance !== 'function'
  ) {
    return;
  }

  const synth = window.speechSynthesis;
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      resolve();
    };

    const watchdog = window.setTimeout(() => {
      try {
        synth.cancel();
      } catch {
        // Ignore
      }
      finish();
    }, 6000);

    try {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = clampVoiceRate(config?.rate ?? 1);
      utterance.volume = clampVoiceVolume(config?.volume ?? 1);
      utterance.pitch = config?.voiceProfile === 'vi-female-bright' ? 1.18 : 1.0;

      const voices = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
      const matchedVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('vi'));
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    } catch {
      finish();
    }
  });
}

function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class QrVoiceAnnouncer {
  private readonly dedupWindowMs: number;
  private readonly maxQueueSize: number;
  private readonly interItemDelayMs: number;
  private readonly nowFn: () => number;
  private readonly playChimeFn: (volume?: number) => Promise<void>;
  private readonly playClipFn: (
    src: string,
    rate?: number,
    volume?: number,
    voiceProfile?: QrVoiceProfileType,
  ) => Promise<void>;
  private readonly speakTtsFn: (
    text: string,
    lang: string,
    config?: QrVoiceEngineConfig,
  ) => Promise<void>;

  private readonly recentSeen = new Map<string, number>();
  private readonly queue: Array<{ item: QrVoiceAlertItem; resolve: () => void }> = [];
  private isProcessing = false;

  constructor(options: QrVoiceAnnouncerOptions = {}) {
    this.dedupWindowMs = options.dedupWindowMs ?? 3000;
    this.maxQueueSize = options.maxQueueSize ?? 10;
    this.interItemDelayMs = options.interItemDelayMs ?? 250;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.playChimeFn = options.playChimeFn ?? playCashierChime;
    this.playClipFn = options.playClipFn ?? defaultPlayAudioClip;
    this.speakTtsFn = options.speakTtsFn ?? defaultSpeakWebSpeechTts;
  }

  async enqueue(item: QrVoiceAlertItem): Promise<void> {
    if (!item.forcePlay && !isQrVoiceAlertEnabled()) {
      return;
    }

    const now = this.nowFn();
    const isMultiReminder = Boolean(item.reminderTables && item.reminderTables.length > 1);
    const isReminder = Boolean(item.isReminder || isMultiReminder);
    const spokenText =
      item.customText?.trim() ||
      (isMultiReminder
        ? formatMultiTableReminderText(item.reminderTables!.map((entry) => entry.tableLabel))
        : formatTableAnnouncementText(item.tableLabel, item.kind, {
            batchNo: item.batchNo,
            orderCode: item.orderCode,
            isReminder,
          }));
    const dedupKey = `${isReminder ? 'REM' : 'INIT'}:${item.kind}:${spokenText.toLowerCase()}`;

    if (!item.forcePlay) {
      const lastSeen = this.recentSeen.get(dedupKey);
      if (lastSeen !== undefined && now - lastSeen < this.dedupWindowMs) {
        return;
      }
      this.recentSeen.set(dedupKey, now);
      this.pruneDedupMap(now);
    }

    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.queue.shift();
      dropped?.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push({ item, resolve });
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const nextEntry = this.queue.shift();
        if (!nextEntry) break;

        try {
          await this.playSingleAnnouncement(nextEntry.item);
        } catch {
          // Never allow audio errors to break the queue
        } finally {
          nextEntry.resolve();
        }

        if (this.queue.length > 0 && this.interItemDelayMs > 0) {
          await delayMs(this.interItemDelayMs);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async playSingleAnnouncement(item: QrVoiceAlertItem): Promise<void> {
    if (!item.forcePlay && !isQrVoiceAlertEnabled()) return;

    const config = getActiveQrVoiceEngineConfig(item.configOverride);
    const isMultiReminder = Boolean(item.reminderTables && item.reminderTables.length > 1);
    const isReminder = Boolean(item.isReminder || isMultiReminder);
    const spokenText =
      item.customText?.trim() ||
      (isMultiReminder
        ? formatMultiTableReminderText(item.reminderTables!.map((entry) => entry.tableLabel))
        : formatTableAnnouncementText(item.tableLabel, item.kind, {
            batchNo: item.batchNo,
            orderCode: item.orderCode,
            isReminder,
          }));

    if (config.chimeEnabled) {
      await this.playChimeFn(config.volume);
    }

    const clipSequence = isMultiReminder
      ? getMultiTableReminderClipSequence(item.reminderTables!.map((entry) => entry.tableLabel))
      : getAudioClipSequence(item.tableLabel, item.kind, isReminder);

    // 1. Offline MP3 mode explicitly selected -> play local MP3 clips first for Bàn 1..30
    if (config.voiceProfile === 'offline-mp3' && clipSequence) {
      try {
        for (const clipSrc of clipSequence) {
          await this.playClipFn(clipSrc, config.rate, config.volume, config.voiceProfile);
        }
        pendingBlockedAnnouncement = null;
        return;
      } catch {
        // Fallback if offline MP3 fails
      }
    }

    // 2. Vietnamese Cloud TTS for female voice profiles (standard & bright) across all announcements
    if (config.voiceProfile !== 'offline-mp3') {
      const normalizedSpokenText = spokenText.replace(/\b0+(\d+)\b/g, '$1');
      const cloudTtsUrl = buildPublicTtsUrl(normalizedSpokenText);
      try {
        await this.playClipFn(cloudTtsUrl, config.rate, config.volume, config.voiceProfile);
        pendingBlockedAnnouncement = null;
        return;
      } catch {
        // Fallback to offline clips or speech synthesis if offline/unavailable
      }
    }

    // 3. Offline pre-recorded Vietnamese MP3 clips for standard tables 01..30 (with dynamic rate, volume & voiceProfile)
    if (clipSequence) {
      try {
        for (const clipSrc of clipSequence) {
          await this.playClipFn(clipSrc, config.rate, config.volume, config.voiceProfile);
        }
        pendingBlockedAnnouncement = null;
        return;
      } catch {
        // Fallback if static MP3 fails or is unavailable
      }
    }

    if (getQrAudioUnlockState() === 'locked') {
      pendingBlockedAnnouncement = {
        item: { ...item },
        blockedAtMs: this.nowFn(),
      };
    }

    await this.speakTtsFn(spokenText, 'vi-VN', config);
  }

  private pruneDedupMap(now: number): void {
    if (this.recentSeen.size <= 50) return;
    for (const [key, timestamp] of this.recentSeen.entries()) {
      if (now - timestamp >= this.dedupWindowMs) {
        this.recentSeen.delete(key);
      }
    }
  }
}

export const defaultQrVoiceAnnouncer = new QrVoiceAnnouncer();

export function enqueueQrVoiceAlert(item: QrVoiceAlertItem): Promise<void> {
  return defaultQrVoiceAnnouncer.enqueue(item);
}
