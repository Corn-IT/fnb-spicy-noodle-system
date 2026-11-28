import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QR_VOICE_ALERT_STORAGE_KEY,
  QrVoiceAnnouncer,
  buildPublicTtsUrl,
  extractStandardTableNumber,
  formatMultiTableReminderText,
  formatTableAnnouncementText,
  getAudioClipSequence,
  getMultiTableReminderClipSequence,
  isQrVoiceAlertEnabled,
  parseQrVoiceEngineConfig,
  playCashierChime,
  resetAudioContextForTesting,
  serializeQrVoiceEngineConfig,
  setQrVoiceAlertEnabled,
} from '../qr-voice-announcer';

class MockAudioContext {
  public static instances: MockAudioContext[] = [];
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public destination = {};
  public resume = vi.fn(async () => {
    this.state = 'running';
  });
  public close = vi.fn(async () => {
    this.state = 'closed';
  });
  public createOscillator = vi.fn(() => ({
    type: 'sine',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  public createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));

  constructor() {
    MockAudioContext.instances.push(this);
  }
}

describe('qr-voice-announcer (Hybrid Voice Alert & FIFO Queue)', () => {
  beforeEach(() => {
    localStorage.clear();
    MockAudioContext.instances = [];
    resetAudioContextForTesting();
    vi.stubGlobal('AudioContext', MockAudioContext);
  });

  afterEach(() => {
    resetAudioContextForTesting();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('TC-VOICE-01: formatTableAnnouncementText & extractStandardTableNumber', () => {
    it('should format standard table labels without duplicating "Bàn" and strip leading zeros so "05" is read as "5"', () => {
      expect(formatTableAnnouncementText('Bàn 05', 'NEW')).toBe('Bàn 5 có đơn mới');
      expect(formatTableAnnouncementText('Bàn 12', 'ADDON')).toBe('Bàn 12 có đơn gọi thêm');
      expect(formatTableAnnouncementText('bàn 3', 'NEW')).toBe('Bàn 3 có đơn mới');
    });

    it('should prepend "Bàn" when custom table label does not start with "Bàn" and strip leading zeros', () => {
      expect(formatTableAnnouncementText('VIP 01', 'NEW')).toBe('Bàn VIP 1 có đơn mới');
      expect(formatTableAnnouncementText('Sân thượng 2', 'ADDON')).toBe(
        'Bàn Sân thượng 2 có đơn gọi thêm',
      );
      expect(formatTableAnnouncementText('', 'NEW')).toBe('Bàn mới có đơn mới');
    });

    it('should extract standard table numbers 1..30 and return null for custom or out-of-range tables', () => {
      expect(extractStandardTableNumber('Bàn 01')).toBe('01');
      expect(extractStandardTableNumber('Bàn 5')).toBe('05');
      expect(extractStandardTableNumber('Bàn 30')).toBe('30');
      expect(extractStandardTableNumber('09')).toBe('09');
      expect(extractStandardTableNumber('Bàn 31')).toBeNull();
      expect(extractStandardTableNumber('Bàn VIP 1')).toBeNull();
      expect(extractStandardTableNumber('Sân vườn')).toBeNull();
    });
  });

  describe('TC-VOICE-02: getAudioClipSequence for pre-recorded Vietnamese clips', () => {
    it('should build exact static audio clip path sequence for Bàn 01..30', () => {
      expect(getAudioClipSequence('Bàn 05', 'NEW')).toEqual([
        '/audio/vi/ban.mp3',
        '/audio/vi/05.mp3',
        '/audio/vi/co-don-moi.mp3',
      ]);

      expect(getAudioClipSequence('Bàn 18', 'ADDON')).toEqual([
        '/audio/vi/ban.mp3',
        '/audio/vi/18.mp3',
        '/audio/vi/co-don-goi-them.mp3',
      ]);

      expect(getAudioClipSequence('Bàn VIP 2', 'NEW')).toBeNull();
    });
  });

  describe('TC-VOICE-03 & TC-VOICE-04: Hybrid playback, Web Speech fallback & FIFO dedup queue', () => {
    it('should play pre-recorded clips for standard tables and fallback to Web Speech API for custom tables or clip failure', async () => {
      const playedClips: string[] = [];
      const spokenTexts: Array<{ text: string; lang: string }> = [];

      const announcer = new QrVoiceAnnouncer({
        dedupWindowMs: 3000,
        interItemDelayMs: 0,
        playChimeFn: vi.fn(async () => undefined),
        playClipFn: vi.fn(async (src: string) => {
          if (src.includes('99') || src.includes('/api/v1/public/tts')) {
            throw new Error('Offline / force MP3 fallback');
          }
          playedClips.push(src);
        }),
        speakTtsFn: vi.fn(async (text: string, lang: string) => {
          spokenTexts.push({ text, lang });
        }),
      });

      // 1a. Standard table with default Cloud TTS enabled -> uses Cloud TTS URL first (including standard tables!)
      const cloudClips: string[] = [];
      const cloudAnnouncer = new QrVoiceAnnouncer({
        dedupWindowMs: 3000,
        interItemDelayMs: 0,
        playChimeFn: vi.fn(async () => undefined),
        playClipFn: vi.fn(async (src: string) => {
          cloudClips.push(src);
        }),
        speakTtsFn: vi.fn(async () => undefined),
      });
      await cloudAnnouncer.enqueue({ tableLabel: 'Bàn 05', kind: 'NEW' });
      await cloudAnnouncer.enqueue({ tableLabel: 'Mang về #01', kind: 'NEW' });
      expect(cloudClips).toEqual([
        'http://localhost:3000/api/v1/public/tts?text=B%C3%A0n%205%20c%C3%B3%20%C4%91%C6%A1n%20m%E1%BB%9Bi',
        'http://localhost:3000/api/v1/public/tts?text=%C4%90%C6%A1n%20mang%20v%E1%BB%81%20s%E1%BB%91%201%20c%C3%B3%20%C4%91%C6%A1n%20m%E1%BB%9Bi',
      ]);

      // 1b. When Cloud TTS is unavailable -> standard table falls back to static MP3 clips
      await announcer.enqueue({ tableLabel: 'Bàn 05', kind: 'NEW' });
      expect(playedClips).toEqual([
        '/audio/vi/ban.mp3',
        '/audio/vi/05.mp3',
        '/audio/vi/co-don-moi.mp3',
      ]);
      expect(spokenTexts).toHaveLength(0);

      // 2. Custom table name when Cloud TTS is unavailable -> falls back to Web Speech API (vi-VN)
      await announcer.enqueue({ tableLabel: 'Bàn VIP 1', kind: 'ADDON' });
      expect(spokenTexts).toEqual([{ text: 'Bàn VIP 1 có đơn gọi thêm', lang: 'vi-VN' }]);
    });

    it('should fallback to Web Speech API when static MP3 playback fails', async () => {
      const spokenTexts: string[] = [];
      const announcer = new QrVoiceAnnouncer({
        dedupWindowMs: 3000,
        interItemDelayMs: 0,
        playChimeFn: vi.fn(async () => undefined),
        playClipFn: vi.fn(async () => {
          throw new Error('NotAllowedError or network failure');
        }),
        speakTtsFn: vi.fn(async (text: string) => {
          spokenTexts.push(text);
        }),
      });

      await announcer.enqueue({ tableLabel: 'Bàn 02', kind: 'NEW' });
      expect(spokenTexts).toEqual(['Bàn 2 có đơn mới']);
    });

    it('should deduplicate identical table+kind within 3 seconds while processing different tables in FIFO order', async () => {
      const spokenOrder: string[] = [];
      let now = 1000;

      const announcer = new QrVoiceAnnouncer({
        dedupWindowMs: 3000,
        interItemDelayMs: 0,
        nowFn: () => now,
        playChimeFn: vi.fn(async () => undefined),
        playClipFn: vi.fn(async () => {
          throw new Error('Force TTS for easy sequence check');
        }),
        speakTtsFn: vi.fn(async (text: string) => {
          spokenOrder.push(text);
        }),
      });

      await Promise.all([
        announcer.enqueue({ tableLabel: 'Bàn 07', kind: 'NEW' }),
        announcer.enqueue({ tableLabel: 'Bàn 07', kind: 'NEW' }), // duplicate within 3s -> skipped
        announcer.enqueue({ tableLabel: 'Bàn 08', kind: 'NEW' }), // different table -> queued
        announcer.enqueue({ tableLabel: 'Bàn 07', kind: 'ADDON' }), // different kind -> queued
      ]);

      expect(spokenOrder).toEqual([
        'Bàn 7 có đơn mới',
        'Bàn 8 có đơn mới',
        'Bàn 7 có đơn gọi thêm',
      ]);

      // Advance clock past 3000ms -> Bàn 07 NEW is allowed again
      now += 3500;
      await announcer.enqueue({ tableLabel: 'Bàn 07', kind: 'NEW' });
      expect(spokenOrder).toHaveLength(4);
    });
  });

  describe('TC-VOICE-05: Singleton AudioContext (No Memory Leak)', () => {
    it('should reuse a single AudioContext instance across 50 chime calls', async () => {
      for (let i = 0; i < 50; i += 1) {
        await playCashierChime();
      }
      expect(MockAudioContext.instances).toHaveLength(1);
    });
  });

  describe('TC-VOICE-06: Per-device localStorage toggle & Silence when disabled', () => {
    it('should default to enabled, persist toggle state in localStorage, and skip playback when disabled', async () => {
      expect(isQrVoiceAlertEnabled()).toBe(true);

      setQrVoiceAlertEnabled(false);
      expect(isQrVoiceAlertEnabled()).toBe(false);
      expect(localStorage.getItem(QR_VOICE_ALERT_STORAGE_KEY)).toBe('false');

      const playChimeFn = vi.fn(async () => undefined);
      const speakTtsFn = vi.fn(async () => undefined);
      const announcer = new QrVoiceAnnouncer({
        playChimeFn,
        playClipFn: vi.fn(async () => {
          throw new Error('skip');
        }),
        speakTtsFn,
      });

      await announcer.enqueue({ tableLabel: 'Bàn 01', kind: 'NEW' });
      expect(playChimeFn).not.toHaveBeenCalled();
      expect(speakTtsFn).not.toHaveBeenCalled();

      // Re-enable -> plays again
      setQrVoiceAlertEnabled(true);
      await announcer.enqueue({ tableLabel: 'Bàn 01', kind: 'NEW' });
      expect(playChimeFn).toHaveBeenCalledTimes(1);
      expect(speakTtsFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('TC-VOICE-07: Dynamic Speed (rate), Vietnamese Voice Profile & Custom Announcement Text', () => {
    it('should parse and serialize QrVoiceEngineConfig and apply custom rate, volume, voiceProfile, and customText', async () => {
      const parsed = parseQrVoiceEngineConfig('offline-mp3|rate=1.25|volume=0.8|chime=0');
      expect(parsed).toEqual({
        voiceProfile: 'offline-mp3',
        rate: 1.25,
        volume: 0.8,
        chimeEnabled: false,
      });
      expect(serializeQrVoiceEngineConfig(parsed)).toBe(
        'offline-mp3|rate=1.25|volume=0.8|chime=0',
      );

      const playedClips: Array<{
        src: string;
        rate?: number;
        volume?: number;
        voiceProfile?: string;
      }> = [];
      const playChimeFn = vi.fn(async () => undefined);

      const announcer = new QrVoiceAnnouncer({
        interItemDelayMs: 0,
        playChimeFn,
        playClipFn: vi.fn(async (src: string, rate?: number, volume?: number, voiceProfile?: string) => {
          playedClips.push({ src, rate, volume, voiceProfile });
        }),
        speakTtsFn: vi.fn(async () => undefined),
      });

      // 1. Custom text with vi-female-bright profile & 1.3x speed -> strips leading zero ("05" -> "5") and calls /api/v1/public/tts
      await announcer.enqueue({
        tableLabel: 'Bàn 05',
        kind: 'NEW',
        forcePlay: true,
        customText: 'Chú ý, Bàn 05 vừa đặt món mới',
        configOverride: {
          voiceProfile: 'vi-female-bright',
          rate: 1.3,
          volume: 0.9,
          chimeEnabled: true,
        },
      });

      expect(playChimeFn).toHaveBeenCalledWith(0.9);
      expect(playedClips[0]).toEqual({
        src: buildPublicTtsUrl('Chú ý, Bàn 5 vừa đặt món mới'),
        rate: 1.3,
        volume: 0.9,
        voiceProfile: 'vi-female-bright',
      });

      // 2. Standard table with offline-mp3 profile & chime disabled -> plays offline MP3 clips with rate=0.85
      await announcer.enqueue({
        tableLabel: 'Bàn 09',
        kind: 'ADDON',
        forcePlay: true,
        configOverride: {
          voiceProfile: 'offline-mp3',
          rate: 0.85,
          volume: 0.75,
          chimeEnabled: false,
        },
      });

      expect(playChimeFn).toHaveBeenCalledTimes(1); // Chime was skipped on 2nd call
      expect(playedClips.slice(1)).toEqual([
        { src: '/audio/vi/ban.mp3', rate: 0.85, volume: 0.75, voiceProfile: 'offline-mp3' },
        { src: '/audio/vi/09.mp3', rate: 0.85, volume: 0.75, voiceProfile: 'offline-mp3' },
        { src: '/audio/vi/co-don-goi-them.mp3', rate: 0.85, volume: 0.75, voiceProfile: 'offline-mp3' },
      ]);
    });
  });

  describe('TC-VOICE-08: Unconfirmed Reminder Phrasing & Multi-Table Offline/TTS Batching', () => {
    it('builds reminder texts and clip sequences for single & consolidated multi-table reminders', async () => {
      expect(formatTableAnnouncementText('Bàn 05', 'NEW', { isReminder: true })).toBe(
        'Nhắc lại: Bàn 5 có đơn mới chưa xác nhận',
      );
      expect(formatTableAnnouncementText('Bàn 05', 'ADDON', { isReminder: true })).toBe(
        'Nhắc lại: Bàn 5 có đơn gọi thêm chưa xác nhận',
      );
      expect(formatMultiTableReminderText(['Bàn 03', 'Bàn 07', 'Bàn 03'])).toBe(
        'Nhắc lại: Bàn 3, Bàn 7 đang chờ xác nhận đơn',
      );

      expect(getAudioClipSequence('Bàn 05', 'NEW', true)).toEqual([
        '/audio/vi/nhac-lai.mp3',
        '/audio/vi/ban.mp3',
        '/audio/vi/05.mp3',
        '/audio/vi/co-don-moi.mp3',
        '/audio/vi/chua-xac-nhan.mp3',
      ]);

      expect(getMultiTableReminderClipSequence(['Bàn 03', 'Bàn 07', 'Bàn 03'])).toEqual([
        '/audio/vi/nhac-lai.mp3',
        '/audio/vi/ban.mp3',
        '/audio/vi/03.mp3',
        '/audio/vi/ban.mp3',
        '/audio/vi/07.mp3',
        '/audio/vi/dang-cho-xac-nhan.mp3',
      ]);
      expect(getMultiTableReminderClipSequence(['Bàn 03', 'Bàn VIP 1'])).toBeNull();

      const playedClips: string[] = [];
      const spokenTexts: string[] = [];
      const playChimeFn = vi.fn(async () => undefined);
      const announcer = new QrVoiceAnnouncer({
        interItemDelayMs: 0,
        playChimeFn,
        playClipFn: vi.fn(async (src: string) => {
          playedClips.push(src);
        }),
        speakTtsFn: vi.fn(async (text: string) => {
          spokenTexts.push(text);
        }),
      });

      // Multi-table standard tables with offline-mp3 profile -> single chime + offline consolidated sequence
      await announcer.enqueue({
        tableLabel: 'Bàn 03, Bàn 07',
        kind: 'NEW',
        isReminder: true,
        configOverride: { voiceProfile: 'offline-mp3' },
        reminderTables: [
          { tableLabel: 'Bàn 03', kind: 'NEW' },
          { tableLabel: 'Bàn 07', kind: 'ADDON' },
        ],
      });
      expect(playChimeFn).toHaveBeenCalledTimes(1);
      expect(playedClips).toEqual([
        '/audio/vi/nhac-lai.mp3',
        '/audio/vi/ban.mp3',
        '/audio/vi/03.mp3',
        '/audio/vi/ban.mp3',
        '/audio/vi/07.mp3',
        '/audio/vi/dang-cho-xac-nhan.mp3',
      ]);

      // Multi-table standard tables with default female voice -> uses Cloud TTS
      await announcer.enqueue({
        tableLabel: 'Bàn 04, Bàn 08',
        kind: 'NEW',
        isReminder: true,
        reminderTables: [
          { tableLabel: 'Bàn 04', kind: 'NEW' },
          { tableLabel: 'Bàn 08', kind: 'ADDON' },
        ],
      });
      expect(playedClips[playedClips.length - 1]).toBe(
        'http://localhost:3000/api/v1/public/tts?text=Nh%E1%BA%AFc%20l%E1%BA%A1i%3A%20B%C3%A0n%204%2C%20B%C3%A0n%208%20%C4%91ang%20ch%E1%BB%9D%20x%C3%A1c%20nh%E1%BA%ADn%20%C4%91%C6%A1n',
      );

      // Multi-table containing custom table when offline -> single chime + Web Speech consolidated phrasing
      await announcer.enqueue({
        tableLabel: 'Bàn 03, Bàn VIP 1',
        kind: 'NEW',
        isReminder: true,
        configOverride: { voiceProfile: 'offline-mp3' },
        reminderTables: [
          { tableLabel: 'Bàn 03', kind: 'NEW' },
          { tableLabel: 'Bàn VIP 1', kind: 'ADDON' },
        ],
      });
      expect(playChimeFn).toHaveBeenCalledTimes(3);
      expect(spokenTexts).toEqual(['Nhắc lại: Bàn 3, Bàn VIP 1 đang chờ xác nhận đơn']);
    });

    it('covers defaultPlayAudioClip HTMLAudio playback/error and defaultSpeakWebSpeechTts synthesis branches', async () => {
      const { defaultPlayAudioClip, defaultSpeakWebSpeechTts } = await import(
        '../qr-voice-announcer'
      );

      const OrigAudio = window.Audio;
      const origUa = navigator.userAgent;
      const origSpeech = (window as { speechSynthesis?: unknown }).speechSynthesis;
      const OrigUtterance = (window as { SpeechSynthesisUtterance?: unknown })
        .SpeechSynthesisUtterance;

      try {
        Object.defineProperty(navigator, 'userAgent', {
          configurable: true,
          value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        });

        let shouldFailPlay = false;

        class MockAudio {
          src = '';
          preload = '';
          playbackRate = 1;
          defaultPlaybackRate = 1;
          volume = 1;
          preservesPitch = false;
          onended: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor(src?: string) {
            this.src = src ?? '';
          }
          play = vi.fn(async () => {
            if (shouldFailPlay) {
              queueMicrotask(() => this.onerror?.());
            } else {
              queueMicrotask(() => this.onended?.());
            }
          });
        }
        window.Audio = MockAudio as unknown as typeof Audio;

        await expect(
          defaultPlayAudioClip('/audio/vi/ban.mp3', 1.2, 0.8),
        ).resolves.toBeUndefined();

        shouldFailPlay = true;
        await expect(
          defaultPlayAudioClip('/audio/vi/missing.mp3', 1.0, 0.8),
        ).rejects.toThrow(/Failed to load audio clip/);

        // 2. defaultSpeakWebSpeechTts selects Vietnamese voice and finishes on onend
        const speakSpy = vi.fn((utt: { onend?: () => void }) => {
          queueMicrotask(() => utt.onend?.());
        });
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: {
            getVoices: () => [{ lang: 'en-US' }, { lang: 'vi-VN' }],
            speak: speakSpy,
            cancel: vi.fn(),
          },
        });
        class MockUtterance {
          lang = '';
          rate = 1;
          volume = 1;
          pitch = 1;
          voice: unknown = null;
          onend: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor(public readonly text: string) {}
        }
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          configurable: true,
          value: MockUtterance,
        });

        await expect(
          defaultSpeakWebSpeechTts('Đơn QR mới tại Bàn 5', 'vi-VN', {
            voiceProfile: 'vi-female-bright',
            rate: 1.1,
            volume: 0.9,
            chimeEnabled: true,
          }),
        ).resolves.toBeUndefined();
        expect(speakSpy).toHaveBeenCalledTimes(1);
      } finally {
        window.Audio = OrigAudio;
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa });
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: origSpeech });
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          configurable: true,
          value: OrigUtterance,
        });
      }
    });
  });
});
