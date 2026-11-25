import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Radio,
  Send,
  Share,
  Smartphone,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMobileOrderAlerts } from '@/hooks/use-mobile-order-alerts';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

/**
 * 1-tap activation bar rendered in AppShell whenever POS voice alert is ON
 * but the mobile browser (iOS Safari / Android Chrome) has not unlocked audio yet
 * or suspended AudioContext after returning from lock screen.
 */
export function MobileAudioActivationBanner({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canReceivePosAlerts = Boolean(
    accessToken && (user?.isSuperAdmin || user?.permissions.pos?.view),
  );
  const { settings } = useStoreSettings();
  const { needsAudioTap, isIos, activateAudioNow } = useMobileOrderAlerts({
    enabled: canReceivePosAlerts,
    storeName: settings.storeName,
  });

  if (!needsAudioTap) return null;

  return (
    <div
      role="status"
      data-testid="mobile-audio-unlock-banner"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/50 dark:text-amber-100',
        compact && 'py-2.5 text-sm',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Volume2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
        <span className="font-semibold leading-snug">
          Loa báo đơn trên thiết bị đang chờ kích hoạt để tránh bị trình duyệt chặn tiếng.
          {isIos ? ' (Nhớ mở nút gạt chuông bên hông iPhone)' : ''}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        data-testid="mobile-audio-unlock-btn"
        onClick={() => {
          void activateAudioNow({ playTestChime: true, storeName: settings.storeName });
        }}
        className="h-8 shrink-0 gap-1.5 bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700"
      >
        <Volume2 className="h-3.5 w-3.5" />
        <span>Chạm để bật loa báo đơn</span>
      </Button>
    </div>
  );
}

/**
 * Compact 3-layer mobile/desktop order alert control popover:
 * - Layer 1: Foreground voice toggle + 1-tap unlock & test chime
 * - Layer 2: Background silent-audio Keep-Alive toggle (keeps reading aloud when screen locks / light app switch)
 * - Layer 3: Web Push Notification toggle + 2-step iOS Add-to-Home-Screen guide when opened in iPhone Safari tab
 */
export function MobileAlertControlButton({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canReceivePosAlerts = Boolean(
    accessToken && (user?.isSuperAdmin || user?.permissions.pos?.view),
  );
  const { settings } = useStoreSettings();

  const {
    voiceEnabled,
    toggleVoice,
    audioUnlockState,
    needsAudioTap,
    socketConnected,
    isIos,
    isStandalone,
    keepAliveEnabled,
    keepAliveRuntime,
    toggleKeepAlive,
    activateAudioNow,
    pushSupport,
    pushSubscribed,
    pushBusy,
    pushTestBusy,
    pushMessage,
    togglePush,
    sendTestPush,
  } = useMobileOrderAlerts({
    enabled: canReceivePosAlerts,
    storeName: settings.storeName,
  });

  if (!canReceivePosAlerts) return null;

  const isFullyReady =
    voiceEnabled &&
    !needsAudioTap &&
    (pushSubscribed || keepAliveRuntime.active || audioUnlockState === 'unlocked');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="mobile-alerts-menu-trigger"
          aria-label="Cài đặt thông báo âm thanh & đẩy trên thiết bị"
          title="Thông báo âm thanh & đẩy báo đơn trên thiết bị này"
          className={cn(
            'relative h-11 min-w-11 lg:h-9 lg:min-w-0 gap-1.5 px-2.5 text-xs font-semibold',
            needsAudioTap &&
              'border-amber-500/70 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200',
            !voiceEnabled && !pushSubscribed && 'text-muted-foreground',
            className,
          )}
        >
          {needsAudioTap ? (
            <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
          ) : voiceEnabled || pushSubscribed ? (
            <Bell className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="hidden md:inline">
            {needsAudioTap ? 'Kích hoạt loa' : isFullyReady ? 'Báo đơn' : 'Loa & Push'}
          </span>
          {needsAudioTap ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background" />
          ) : pushSubscribed ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        data-testid="mobile-alerts-popover"
        className="w-[330px] max-w-[calc(100vw-1rem)] p-3 space-y-3"
      >
        <DropdownMenuLabel className="flex items-center justify-between p-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Smartphone className="h-4 w-4 text-accent-text" />
            Báo đơn trên thiết bị này
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              needsAudioTap
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : voiceEnabled || pushSubscribed
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {needsAudioTap ? 'Chờ chạm bật loa' : voiceEnabled || pushSubscribed ? 'Đang bật' : 'Đang tắt'}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1" />

        {/* Live realtime Socket.io status pill */}
        <div
          data-testid="mobile-alerts-socket-status"
          className={cn(
            'flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-semibold',
            socketConnected
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
          )}
        >
          <span className="flex items-center gap-1.5">
            {socketConnected ? (
              <Wifi className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 shrink-0 animate-pulse" />
            )}
            <span>Kết nối thời gian thực (Socket)</span>
          </span>
          <span>{socketConnected ? 'Đang kết nối' : 'Đang nối lại...'}</span>
        </div>

        {/* Layer 1: Foreground Web Audio */}
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                {voiceEnabled ? (
                  <Volume2 className="h-3.5 w-3.5 text-accent-text" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span>1. Giọng đọc khi mở web</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Đọc số bàn & ting-ting ngay khi có đơn QR mới.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={voiceEnabled ? 'default' : 'outline'}
              data-testid="mobile-alerts-voice-toggle"
              onClick={toggleVoice}
              className="h-7 shrink-0 px-2.5 text-xs font-semibold"
            >
              {voiceEnabled ? 'Đang bật' : 'Đã tắt'}
            </Button>
          </div>

          {voiceEnabled ? (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-muted-foreground">
                {audioUnlockState === 'unlocked'
                  ? 'Loa trình duyệt đã sẵn sàng'
                  : 'Chạm nút bên phải để mở khoá loa'}
              </span>
              <Button
                type="button"
                size="sm"
                variant={needsAudioTap ? 'default' : 'outline'}
                data-testid="mobile-alerts-test-unlock-btn"
                onClick={() => {
                  void activateAudioNow({ playTestChime: true, storeName: settings.storeName });
                }}
                className="h-7 shrink-0 px-2.5 text-[11px] font-semibold"
              >
                {needsAudioTap ? 'Kích hoạt ngay' : 'Thử tiếng'}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Layer 2: Mobile Background Keep-Alive */}
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Radio
                  className={cn(
                    'h-3.5 w-3.5',
                    keepAliveRuntime.active
                      ? 'text-emerald-600 dark:text-emerald-400 animate-pulse'
                      : 'text-muted-foreground',
                  )}
                />
                <span>2. Giữ đọc khi tắt màn hình</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Giữ phiên âm thanh nền để tiếp tục đọc giọng nói khi khoá máy hoặc chuyển app nhẹ.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={keepAliveEnabled ? 'default' : 'outline'}
              data-testid="mobile-alerts-keepalive-toggle"
              disabled={!voiceEnabled}
              onClick={() => {
                void toggleKeepAlive();
              }}
              className="h-7 shrink-0 px-2.5 text-xs font-semibold"
            >
              {keepAliveEnabled ? 'Bật' : 'Tắt'}
            </Button>
          </div>
          {keepAliveEnabled && voiceEnabled ? (
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              {keepAliveRuntime.active
                ? 'Đang giữ phiên nền hoạt động (hiện thanh POS ở màn hình khoá).'
                : 'Sẽ tự kích hoạt sau lần chạm màn hình tiếp theo.'}
            </p>
          ) : null}
        </div>

        {/* Layer 3: Web Push Notification */}
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <BellRing
                  className={cn(
                    'h-3.5 w-3.5',
                    pushSubscribed
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground',
                  )}
                />
                <span>3. Thông báo đẩy (Web Push)</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Báo chuông máy + hiện bàn mới kể cả khi tắt màn hình lâu hoặc bị ngủ đông tab.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={pushSubscribed ? 'default' : 'outline'}
              data-testid="mobile-alerts-push-toggle"
              disabled={pushBusy || pushSupport.needsIosInstall || !pushSupport.supported}
              onClick={() => {
                void togglePush();
              }}
              className="h-7 shrink-0 px-2.5 text-xs font-semibold"
            >
              {pushBusy ? 'Đang xử lý...' : pushSubscribed ? 'Đang bật' : 'Bật Push'}
            </Button>
          </div>

          {pushSubscribed ? (
            <div className="space-y-1.5">
              <p
                data-testid="mobile-alerts-push-active"
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Đã kết nối Push cho phiên đăng nhập này (tự ẩn khi đang mở màn hình web).</span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="mobile-alerts-push-test-btn"
                disabled={pushTestBusy}
                onClick={() => {
                  void sendTestPush(5);
                }}
                className="h-7 w-full gap-1.5 text-[11px] font-semibold"
              >
                <Send className="h-3 w-3" />
                <span>
                  {pushTestBusy ? 'Đang hẹn gửi thử...' : 'Gửi thử Push (sau 5s để kịp khoá máy)'}
                </span>
              </Button>
            </div>
          ) : null}

          {pushSupport.needsIosInstall || (isIos && !isStandalone) ? (
            <div
              data-testid="ios-pwa-install-guide"
              className="rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] leading-relaxed text-sky-950 dark:text-sky-100"
            >
              <div className="flex items-center gap-1 font-bold">
                <Share className="h-3.5 w-3.5 shrink-0" />
                <span>Hướng dẫn nhận thông báo khi khoá máy trên iPhone:</span>
              </div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>
                  Bấm nút <strong>Chia sẻ (Share)</strong> ở thanh dưới trình duyệt Safari.
                </li>
                <li>
                  Chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>, sau đó mở app từ màn hình chính rồi bấm <strong>Bật Push</strong>.
                </li>
              </ol>
            </div>
          ) : !pushSupport.isSecureContext ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Thông báo đẩy yêu cầu truy cập qua tên miền HTTPS.
            </p>
          ) : pushSupport.permission === 'denied' ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              Quyền Thông báo đang bị chặn trong cài đặt trình duyệt. Hãy cho phép lại trong cài đặt trang web.
            </p>
          ) : null}

          {pushMessage ? (
            <p data-testid="mobile-alerts-push-message" className="text-[11px] text-muted-foreground">
              {pushMessage}
            </p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
