import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QrVoiceAnnouncer } from '@/lib/qr-voice-announcer';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

function buildAnnouncer() {
  const playChime = vi.fn(async () => undefined);
  const playClip = vi.fn(async () => undefined);
  const speakTts = vi.fn(async () => undefined);
  const announcer = new QrVoiceAnnouncer({
    dedupWindowMs: 0,
    interItemDelayMs: 0,
    playChimeFn: playChime,
    playClipFn: playClip,
    speakTtsFn: speakTts,
  });
  const soundCalls = () => playChime.mock.calls.length + playClip.mock.calls.length + speakTts.mock.calls.length;
  return { announcer, soundCalls };
}

describe('account voice switch', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiPreferencesStore.setState({ accountSyncPending: false, userVoiceAlertEnabled: undefined });
  });

  it('plays a new QR order alert for an account that has not turned the voice off', async () => {
    useUiPreferencesStore.getState().hydrateFromServer({});
    const { announcer, soundCalls } = buildAnnouncer();

    await announcer.enqueue({ tableLabel: 'Bàn 05', kind: 'NEW' });

    expect(soundCalls()).toBeGreaterThan(0);
  });

  it('stays silent for an account whose server preference turned the voice off', async () => {
    useUiPreferencesStore.getState().hydrateFromServer({ voiceAlertEnabled: false });
    const { announcer, soundCalls } = buildAnnouncer();

    await announcer.enqueue({ tableLabel: 'Bàn 05', kind: 'NEW' });
    await announcer.enqueue({ tableLabel: 'Mang về #01', kind: 'NEW' });

    expect(soundCalls()).toBe(0);
  });

  it('still plays a forced preview even when the account voice is off', async () => {
    useUiPreferencesStore.getState().hydrateFromServer({ voiceAlertEnabled: false });
    const { announcer, soundCalls } = buildAnnouncer();

    await announcer.enqueue({ tableLabel: 'Bàn 05', kind: 'NEW', forcePlay: true });

    expect(soundCalls()).toBeGreaterThan(0);
  });

  it('does not carry the previous account silence over to the next account', async () => {
    useUiPreferencesStore.getState().hydrateFromServer({ voiceAlertEnabled: false });
    useUiPreferencesStore.getState().hydrateFromServer({ theme: 'light' }, { force: true });
    const { announcer, soundCalls } = buildAnnouncer();

    await announcer.enqueue({ tableLabel: 'Bàn 07', kind: 'NEW' });

    expect(soundCalls()).toBeGreaterThan(0);
  });
});
