export type QrVoiceAlertKind = 'NEW' | 'ADDON';
export type QrVoiceProfileType = 'vi-female-standard' | 'vi-female-bright' | 'offline-mp3';

export interface QrVoiceEngineConfig {
  voiceProfile: QrVoiceProfileType;
  rate: number;
  volume: number;
  chimeEnabled: boolean;
}

export const DEFAULT_QR_VOICE_ENGINE_CONFIG: QrVoiceEngineConfig = {
  voiceProfile: 'vi-female-standard',
  rate: 1,
  volume: 1,
  chimeEnabled: true,
};

export interface QrReminderConfig {
  reminderEnabled: boolean;
  reminderDelayMinutes: number;
  reminderIntervalSeconds: number;
  maxReminders: number;
  autoCancelEnabled: boolean;
  autoCancelMinutes: number;
}

export const DEFAULT_QR_REMINDER_CONFIG: QrReminderConfig = {
  reminderEnabled: true,
  reminderDelayMinutes: 5,
  reminderIntervalSeconds: 60,
  maxReminders: 2,
  autoCancelEnabled: true,
  autoCancelMinutes: 12,
};

export function clampVoiceRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1.5, Math.max(0.75, Math.round(rate * 100) / 100));
}

export function clampVoiceVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0.2, Math.round(volume * 100) / 100));
}

export function parseQrVoiceEngineConfig(raw: string | undefined | null): QrVoiceEngineConfig {
  if (!raw || typeof raw !== 'string') {
    return { ...DEFAULT_QR_VOICE_ENGINE_CONFIG };
  }
  const parts = raw.split('|').map((p) => p.trim());
  const first = parts[0];
  const voiceProfile: QrVoiceProfileType =
    first === 'vi-female-bright' || first === 'offline-mp3' || first === 'vi-female-standard'
      ? first
      : 'vi-female-standard';

  let rate = DEFAULT_QR_VOICE_ENGINE_CONFIG.rate;
  let volume = DEFAULT_QR_VOICE_ENGINE_CONFIG.volume;
  let chimeEnabled = DEFAULT_QR_VOICE_ENGINE_CONFIG.chimeEnabled;

  for (const part of parts.slice(1)) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k === 'rate') {
      rate = clampVoiceRate(Number(v));
    } else if (k === 'volume') {
      volume = clampVoiceVolume(Number(v));
    } else if (k === 'chime') {
      chimeEnabled = v !== '0' && v !== 'false';
    }
  }

  return {
    voiceProfile,
    rate,
    volume,
    chimeEnabled,
  };
}

export function serializeQrVoiceEngineConfig(config: QrVoiceEngineConfig): string {
  const voiceProfile = config.voiceProfile;
  const rate = clampVoiceRate(config.rate);
  const volume = clampVoiceVolume(config.volume);
  const chime = config.chimeEnabled ? '1' : '0';
  return `${voiceProfile}|rate=${rate}|volume=${volume}|chime=${chime}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function clampQrReminderDelayMinutes(value: unknown): number {
  return clampInt(value, 1, 15, DEFAULT_QR_REMINDER_CONFIG.reminderDelayMinutes);
}

export function clampQrReminderIntervalSeconds(value: unknown): number {
  return clampInt(value, 15, 300, DEFAULT_QR_REMINDER_CONFIG.reminderIntervalSeconds);
}

export function clampQrMaxReminders(value: unknown): number {
  return clampInt(value, 1, 5, DEFAULT_QR_REMINDER_CONFIG.maxReminders);
}

export function clampQrAutoCancelMinutes(value: unknown, minMinutes = 2): number {
  const floor = Math.max(2, Math.round(minMinutes));
  return clampInt(value, floor, 60, Math.max(floor, DEFAULT_QR_REMINDER_CONFIG.autoCancelMinutes));
}

export function clampQrReminderConfig(input: Partial<QrReminderConfig>): QrReminderConfig {
  const reminderEnabled =
    input.reminderEnabled ?? DEFAULT_QR_REMINDER_CONFIG.reminderEnabled;
  const reminderDelayMinutes = clampQrReminderDelayMinutes(
    input.reminderDelayMinutes ?? DEFAULT_QR_REMINDER_CONFIG.reminderDelayMinutes,
  );
  const reminderIntervalSeconds = clampQrReminderIntervalSeconds(
    input.reminderIntervalSeconds ?? DEFAULT_QR_REMINDER_CONFIG.reminderIntervalSeconds,
  );
  const maxReminders = clampQrMaxReminders(
    input.maxReminders ?? DEFAULT_QR_REMINDER_CONFIG.maxReminders,
  );
  const autoCancelEnabled =
    input.autoCancelEnabled ?? DEFAULT_QR_REMINDER_CONFIG.autoCancelEnabled;
  const minAutoCancel = reminderEnabled ? reminderDelayMinutes + 1 : 2;
  const autoCancelMinutes = clampQrAutoCancelMinutes(
    input.autoCancelMinutes ?? DEFAULT_QR_REMINDER_CONFIG.autoCancelMinutes,
    minAutoCancel,
  );

  return {
    reminderEnabled,
    reminderDelayMinutes,
    reminderIntervalSeconds,
    maxReminders,
    autoCancelEnabled,
    autoCancelMinutes,
  };
}

export function parseQrReminderConfig(raw: string | undefined | null): QrReminderConfig {
  if (!raw || typeof raw !== 'string') {
    return { ...DEFAULT_QR_REMINDER_CONFIG };
  }

  const parsed: Partial<QrReminderConfig> = {};
  for (const part of raw.split('|').map((item) => item.trim()).filter(Boolean)) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (key === 'rem') {
      parsed.reminderEnabled = value !== '0' && value !== 'false';
    } else if (key === 'remDelay') {
      parsed.reminderDelayMinutes = Number(value);
    } else if (key === 'remInt') {
      parsed.reminderIntervalSeconds = Number(value);
    } else if (key === 'remMax') {
      parsed.maxReminders = Number(value);
    } else if (key === 'autoCancel') {
      parsed.autoCancelEnabled = value !== '0' && value !== 'false';
    } else if (key === 'autoCancelMin') {
      parsed.autoCancelMinutes = Number(value);
    }
  }

  return clampQrReminderConfig(parsed);
}

export function serializeQrReminderConfig(config: QrReminderConfig): string {
  const c = clampQrReminderConfig(config);
  return [
    `rem=${c.reminderEnabled ? '1' : '0'}`,
    `remDelay=${c.reminderDelayMinutes}`,
    `remInt=${c.reminderIntervalSeconds}`,
    `remMax=${c.maxReminders}`,
    `autoCancel=${c.autoCancelEnabled ? '1' : '0'}`,
    `autoCancelMin=${c.autoCancelMinutes}`,
  ].join('|');
}
