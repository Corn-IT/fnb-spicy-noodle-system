import type { UpdateUiPreferencesInput } from '@fnb/shared';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { persistAccountPreferences } from '@/lib/persist-account-preferences';
import { setQrVoiceAlertEnabled } from '@/lib/voice-alert-preference';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

export function PersonalPreferencesCard() {
  const sidebarWidth = useUiPreferencesStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiPreferencesStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUiPreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiPreferencesStore((state) => state.setSidebarCollapsed);
  const userVoiceAlertEnabled = useUiPreferencesStore((state) => state.userVoiceAlertEnabled);
  const setUserVoiceAlertEnabled = useUiPreferencesStore((state) => state.setUserVoiceAlertEnabled);
  const [status, setStatus] = React.useState<string | null>(null);

  const persist = React.useCallback(async (input: UpdateUiPreferencesInput) => {
    setStatus('Đang lưu…');
    const saved = await persistAccountPreferences(input);
    setStatus(
      saved
        ? 'Đã lưu cho tài khoản của bạn'
        : 'Không lưu được lên máy chủ, thay đổi chỉ áp dụng tạm trên máy này',
    );
  }, []);

  const handleToggleCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    void persist({ sidebarCollapsed: collapsed });
  };

  const voiceEnabled = userVoiceAlertEnabled ?? true;
  const handleToggleVoice = (enabled: boolean) => {
    setUserVoiceAlertEnabled(enabled);
    setQrVoiceAlertEnabled(enabled);
    void persist({ voiceAlertEnabled: enabled });
  };

  const handleResetAll = () => {
    setSidebarCollapsed(false);
    setSidebarWidth(260);
    setUserVoiceAlertEnabled(true);
    setQrVoiceAlertEnabled(true);
    void persist({ sidebarCollapsed: false, sidebarWidth: 260, voiceAlertEnabled: true });
  };
  return (
    <section data-testid="profile-personal-preferences-card" className="min-w-0 space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold"><SlidersHorizontal className="h-4 w-4" />Cá nhân của tôi</h2>
      <p className="text-sm text-muted-foreground">Giao diện, tỉ lệ hiển thị và thứ tự menu áp dụng theo cài đặt chung của cửa hàng. Bạn có thể điều chỉnh loa và thanh bên cho tài khoản của mình.</p>
      <Button type="button" variant="outline" size="sm" data-testid="personal-preferences-reset-all" disabled={!sidebarCollapsed && sidebarWidth === 260 && userVoiceAlertEnabled !== false} onClick={handleResetAll}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Đặt lại loa và thanh bên
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span>Giọng đọc thông báo đơn QR</span>
          <input
            type="checkbox"
            data-testid="personal-voice-toggle"
            checked={voiceEnabled}
            onChange={(event) => handleToggleVoice(event.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span>Thu gọn thanh bên</span>
          <input
            type="checkbox"
            data-testid="personal-sidebar-collapsed-toggle"
            checked={sidebarCollapsed}
            onChange={(event) => handleToggleCollapsed(event.target.checked)}
            className="h-4 w-4"
          />
        </label>
      </div>
      {status ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
    </section>
  );
}
