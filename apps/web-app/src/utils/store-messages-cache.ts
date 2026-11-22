import {
  mergeStoreSettingsWithDefaults,
  PublicStoreSettingsResponseSchema,
  resolveErrorCodeMessage,
  resolveStoreMessage,
  StoreMessagesMapSchema,
  type MessageVars,
  type ResolvedStoreMessage,
  type StoreMessagesMap,
} from '@fnb/shared';

export const STORE_MESSAGES_CACHE_KEY = 'store_messages_cache' as const;
const PUBLIC_SETTINGS_CACHE_KEY = 'store_settings_cache' as const;

export function readCachedStoreMessages(): StoreMessagesMap {
  try {
    const raw = localStorage.getItem(STORE_MESSAGES_CACHE_KEY);
    if (!raw) return {};
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = StoreMessagesMapSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function writeCachedStoreMessages(messages: StoreMessagesMap): void {
  try {
    const parsed = StoreMessagesMapSchema.safeParse(messages);
    if (!parsed.success) return;
    localStorage.setItem(STORE_MESSAGES_CACHE_KEY, JSON.stringify(parsed.data));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

function readCachedQrMessages(): StoreMessagesMap {
  try {
    const raw = localStorage.getItem(PUBLIC_SETTINGS_CACHE_KEY);
    if (!raw) return {};
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = PublicStoreSettingsResponseSchema.safeParse(mergeStoreSettingsWithDefaults(parsedJson));
    return parsed.success ? (parsed.data.qrMessages ?? {}) : {};
  } catch {
    return {};
  }
}

export function readMergedCachedMessages(): StoreMessagesMap {
  return { ...readCachedQrMessages(), ...readCachedStoreMessages() };
}

export function resolveErrorFromStoreCache(
  code: string | undefined,
  fallbackServerMessage: string,
  vars?: MessageVars,
): ResolvedStoreMessage {
  return resolveErrorCodeMessage(readMergedCachedMessages(), code, fallbackServerMessage, vars);
}

export function resolveCachedAppMessage(
  key: string,
  vars?: MessageVars,
): ResolvedStoreMessage {
  return resolveStoreMessage(readMergedCachedMessages(), key, vars);
}
