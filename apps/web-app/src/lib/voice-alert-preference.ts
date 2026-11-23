export const QR_VOICE_ALERT_STORAGE_KEY = 'fnb-pos-voice-alert' as const;
export const VOICE_STATE_CHANGE_EVENT = 'fnb:qr-voice-alert-changed';

/** Device-level switch read at alert time. The account choice is copied into it on login and refresh. */
export function isQrVoiceAlertEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(QR_VOICE_ALERT_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setQrVoiceAlertEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QR_VOICE_ALERT_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(VOICE_STATE_CHANGE_EVENT, { detail: { enabled } }));
  } catch {
    // Ignore storage write errors
  }
}

export function subscribeQrVoiceAlertState(listener: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener(isQrVoiceAlertEnabled());
  window.addEventListener(VOICE_STATE_CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(VOICE_STATE_CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
