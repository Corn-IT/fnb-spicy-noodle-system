import { MonitorSmartphone } from 'lucide-react';
import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { exitAppFullscreen, useFullscreen } from '@/hooks/use-fullscreen';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';
import { cn } from '@/utils/cn';
import { TouchBottomNav } from './touch-bottom-nav';
import {
  resolveDesktopFallbackPath,
  TOUCH_PATHS,
} from './touch-routes';
import { TouchShellProvider, useTouchShell } from './touch-shell-context';
import { TouchSubpageHeader } from './touch-subpage-header';
import { TOO_NARROW_QUERY, useMediaQuery } from './use-media-query';
import { useTouchUiRoot } from './use-touch-ui-root';

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function TouchShellInner() {
  useTouchUiRoot(true);
  useScreenWakeLock(true);

  const location = useLocation();
  const navigate = useNavigate();
  const fullscreen = useFullscreen();
  const isTooNarrow = useMediaQuery(TOO_NARROW_QUERY);
  const { hideBottomNav, setHideBottomNav } = useTouchShell();

  const currentPath = stripTrailingSlash(location.pathname);
  const isPosBoard = currentPath === TOUCH_PATHS.POS;
  const isHub = currentPath === TOUCH_PATHS.HUB;
  const showSubpageHeader = !isPosBoard && !isHub;

  // Đảm bảo luôn hiện lại thanh đáy khi rời khỏi màn đặt món sang route khác.
  React.useEffect(() => {
    if (!isPosBoard) {
      setHideBottomNav(false);
    }
  }, [isPosBoard, setHideBottomNav]);

  // Trình duyệt chỉ cho bật toàn màn hình trong một lần chạm: thử ở lần chạm đầu tiên vào Touch Shell.
  React.useEffect(() => {
    if (!fullscreen.isSupported) return;
    const handleFirstTouch = () => {
      void fullscreen.enter();
    };
    window.addEventListener('pointerdown', handleFirstTouch, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', handleFirstTouch, { capture: true });
  }, [fullscreen.isSupported, fullscreen.enter]);

  const handleExitToDesktop = () => {
    void exitAppFullscreen();
    navigate(resolveDesktopFallbackPath(location.pathname));
  };

  if (isTooNarrow) {
    return (
      <div
        data-testid="touch-too-narrow"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <MonitorSmartphone className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-bold">Màn POS cảm ứng dành cho màn hình ngang (từ 768px)</p>
        <p className="text-sm text-muted-foreground">
          Trên điện thoại, hãy dùng giao diện thường — đã tối ưu cho màn hình nhỏ.
        </p>
        <Button type="button" className="h-12 px-6 text-base font-bold" onClick={handleExitToDesktop}>
          {isPosBoard ? 'Mở POS thường' : 'Mở giao diện thường'}
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="pos-touch-shell"
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background"
    >
      {showSubpageHeader ? <TouchSubpageHeader /> : null}

      <div
        data-testid="touch-shell-body"
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          isPosBoard
            ? 'overflow-hidden p-0'
            : isHub
              ? 'overflow-y-auto overscroll-contain p-0'
              : 'overflow-y-auto overscroll-contain p-3 sm:p-4',
        )}
      >
        <Outlet />
      </div>

      {!hideBottomNav ? <TouchBottomNav /> : null}
    </div>
  );
}

export function TouchShellLayout() {
  return (
    <TouchShellProvider>
      <TouchShellInner />
    </TouchShellProvider>
  );
}
