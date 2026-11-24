import {
  ArrowLeft,
  Expand,
  Monitor,
  Shrink,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { exitAppFullscreen, useFullscreen } from '@/hooks/use-fullscreen';
import { useQrVoiceToggle } from '@/hooks/use-qr-voice-toggle';
import { resolveNavLabel, useStoreSettings } from '@/hooks/use-store-settings';
import { cn } from '@/utils/cn';
import { formatClockTime, useNowTick } from './elapsed-time';
import {
  findTouchRouteMeta,
  resolveDesktopFallbackPath,
  TOUCH_PATHS,
} from './touch-routes';

interface LocationNavState {
  from?: string;
}

export function TouchSubpageHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useStoreSettings();
  const fullscreen = useFullscreen();
  const { voiceEnabled, toggleVoice } = useQrVoiceToggle();
  const nowMs = useNowTick(15_000);

  const meta = findTouchRouteMeta(location.pathname);
  const Icon = meta?.icon;
  const resolvedTitle = meta
    ? meta.navLabelPath
      ? resolveNavLabel(meta.navLabelPath, meta.label, settings.navLabels)
      : meta.label
    : 'POS cảm ứng';

  const navState = (location.state as LocationNavState | null) ?? null;
  const shouldBackToHub =
    navState?.from === TOUCH_PATHS.HUB || meta?.backTarget === 'hub';
  const backPath = shouldBackToHub ? TOUCH_PATHS.HUB : TOUCH_PATHS.POS;
  const backLabel = shouldBackToHub ? 'Quản lý' : 'Bán hàng';

  const handleExitToDesktop = () => {
    void exitAppFullscreen();
    navigate(resolveDesktopFallbackPath(location.pathname));
  };

  return (
    <header
      data-testid="touch-subpage-header"
      className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-2.5 min-[1100px]:gap-3 min-[1100px]:px-4"
    >
      <Button
        type="button"
        variant="outline"
        data-testid="touch-subpage-back"
        onClick={() => navigate(backPath)}
        className="h-12 shrink-0 gap-2 px-3.5 text-base font-bold"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>{backLabel}</span>
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-1">
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-accent-text" /> : null}
        <h1
          data-testid="touch-subpage-title"
          className="truncate text-lg font-extrabold tracking-tight text-foreground min-[1100px]:text-xl"
        >
          {resolvedTitle}
        </h1>
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={voiceEnabled ? 'Tắt giọng đọc đơn QR' : 'Bật giọng đọc đơn QR'}
        aria-pressed={voiceEnabled}
        data-testid="touch-subpage-voice-toggle"
        onClick={toggleVoice}
        className={cn('h-12 w-12 shrink-0', voiceEnabled && 'text-accent-text')}
      >
        {voiceEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
      </Button>

      {fullscreen.isSupported ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={fullscreen.isFullscreen ? 'Thu nhỏ khỏi toàn màn hình' : 'Toàn màn hình'}
          data-testid="touch-subpage-fullscreen-toggle"
          onClick={() => void fullscreen.toggle()}
          className="h-12 w-12 shrink-0"
        >
          {fullscreen.isFullscreen ? (
            <Shrink className="h-5 w-5" />
          ) : (
            <Expand className="h-5 w-5" />
          )}
        </Button>
      ) : null}

      <Button
        type="button"
        variant="outline"
        data-testid="touch-subpage-exit-desktop"
        onClick={handleExitToDesktop}
        className="h-12 shrink-0 gap-2 px-3 text-sm font-bold min-[1100px]:px-4"
        title="Thoát về giao diện đầy đủ"
      >
        <Monitor className="h-5 w-5" />
        <span className="hidden min-[1100px]:inline">Bản đầy đủ</span>
      </Button>

      <span className="shrink-0 text-lg font-extrabold tabular-nums min-[1100px]:text-xl">
        {formatClockTime(new Date(nowMs).toISOString())}
      </span>
    </header>
  );
}
