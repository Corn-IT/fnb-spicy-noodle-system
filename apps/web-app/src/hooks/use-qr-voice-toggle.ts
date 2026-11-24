import * as React from 'react';

import {
  isMobileBackgroundKeepAliveEnabled,
  startMobileAudioKeepAlive,
  stopMobileAudioKeepAlive,
} from '@/lib/mobile-audio-keepalive';
import { persistAccountPreferences } from '@/lib/persist-account-preferences';
import {
  isQrVoiceAlertEnabled,
  setQrVoiceAlertEnabled,
  subscribeQrVoiceAlertState,
  unlockQrVoiceAudio,
} from '@/lib/qr-voice-announcer';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

/** Bật/tắt giọng đọc báo đơn QR, đồng bộ lên tuỳ chỉnh tài khoản. */
export function useQrVoiceToggle() {
  const [voiceEnabled, setVoiceEnabled] = React.useState<boolean>(() => isQrVoiceAlertEnabled());

  React.useEffect(() => {
    return subscribeQrVoiceAlertState((enabled) => {
      setVoiceEnabled(enabled);
    });
  }, []);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setQrVoiceAlertEnabled(next);
    useUiPreferencesStore.getState().setUserVoiceAlertEnabled(next);
    void persistAccountPreferences({ voiceAlertEnabled: next });
    if (next) {
      void unlockQrVoiceAudio().then((ok) => {
        if (ok && isMobileBackgroundKeepAliveEnabled()) {
          void startMobileAudioKeepAlive();
        }
      });
    } else {
      stopMobileAudioKeepAlive();
    }
  };

  return { voiceEnabled, toggleVoice };
}
