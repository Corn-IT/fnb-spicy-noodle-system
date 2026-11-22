import { type StoreMessagesMap } from '@fnb/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as qrVoiceAnnouncer from '@/lib/qr-voice-announcer';
import { VoiceAnnouncerSettingsCard } from '../components/voice-announcer-settings-card';

function ControlledVoiceSettingsCard({ initial }: { initial?: StoreMessagesMap }) {
  const [draftMessages, setDraftMessages] = React.useState<StoreMessagesMap>(initial ?? {});
  return (
    <div>
      <VoiceAnnouncerSettingsCard
        draftMessages={draftMessages}
        onChangeMessages={(updater) => setDraftMessages((prev) => updater(prev))}
      />
      <pre data-testid="serialized-reminder-config">
        {draftMessages['pos.voice.reminderConfig']?.title ?? ''}
      </pre>
    </div>
  );
}

describe('VoiceAnnouncerSettingsCard — QR Reminder & Auto-Cancel Settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Section 6 reminder/auto-cancel controls with defaults (5m / 60s / max 2 / 12m), enforces autoCancel > delay, previews reminder, and resets cleanly', () => {
    const enqueueSpy = vi
      .spyOn(qrVoiceAnnouncer, 'enqueueQrVoiceAlert')
      .mockResolvedValue(undefined);
    vi.spyOn(qrVoiceAnnouncer, 'unlockQrVoiceAudio').mockResolvedValue(undefined);

    render(<ControlledVoiceSettingsCard />);

    expect(screen.getByTestId('voice-reminder-settings-section')).toBeInTheDocument();
    expect(screen.getByTestId('voice-reminder-delay-input')).toHaveValue(5);
    expect(screen.getByTestId('voice-reminder-interval-input')).toHaveValue(60);
    expect(screen.getByTestId('voice-reminder-max-input')).toHaveValue(2);
    expect(screen.getByTestId('voice-autocancel-minutes-input')).toHaveValue(12);

    // Multi-keystroke typing without cursor jump (clearing interval to '' then typing '3' then '0')
    const intervalInput = screen.getByTestId('voice-reminder-interval-input');
    fireEvent.focus(intervalInput);
    fireEvent.change(intervalInput, { target: { value: '' } });
    expect(intervalInput).toHaveValue(null);
    fireEvent.change(intervalInput, { target: { value: '3' } });
    expect(intervalInput).toHaveValue(3);
    fireEvent.change(intervalInput, { target: { value: '30' } });
    fireEvent.blur(intervalInput);
    expect(intervalInput).toHaveValue(30);

    // Changing delay to 10 minutes clamps autoCancel (if <= 10) up cleanly on commit
    fireEvent.change(screen.getByTestId('voice-reminder-delay-input'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('voice-autocancel-minutes-input'), {
      target: { value: '8' },
    });
    expect(screen.getByTestId('serialized-reminder-config').textContent).toBe(
      'rem=1|remDelay=10|remInt=30|remMax=2|autoCancel=1|autoCancelMin=11',
    );

    // Clicking preview button for reminder triggers enqueueQrVoiceAlert with isReminder=true
    fireEvent.click(screen.getByTestId('voice-settings-test-new-reminder-btn'));
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableLabel: 'Bàn 05',
        kind: 'NEW',
        isReminder: true,
        forcePlay: true,
      }),
    );

    // Reset restores defaults and removes override entry
    fireEvent.click(screen.getByTestId('voice-settings-reset-btn'));
    expect(screen.getByTestId('serialized-reminder-config').textContent).toBe('');
    expect(screen.getByTestId('voice-reminder-delay-input')).toHaveValue(5);
    expect(screen.getByTestId('voice-autocancel-minutes-input')).toHaveValue(12);
  });
});
