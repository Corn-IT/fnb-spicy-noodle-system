import * as React from 'react';

interface ScreenWakeLockSentinel {
  released: boolean;
  release: () => Promise<void>;
}

interface ScreenWakeLockApi {
  request: (type: 'screen') => Promise<ScreenWakeLockSentinel>;
}

function getWakeLockApi(): ScreenWakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as Navigator & { wakeLock?: ScreenWakeLockApi }).wakeLock;
  return candidate && typeof candidate.request === 'function' ? candidate : null;
}

/**
 * Giữ màn hình máy POS luôn sáng khi `enabled`. Trình duyệt tự nhả khoá khi tab bị ẩn,
 * nên hook xin lại khi trang hiện trở lại. Không hỗ trợ (HTTP, trình duyệt cũ) thì bỏ qua êm.
 */
export function useScreenWakeLock(enabled: boolean): void {
  React.useEffect(() => {
    const api = getWakeLockApi();
    if (!enabled || !api) return;

    let sentinel: ScreenWakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        const next = await api.request('screen');
        if (disposed) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {
        // Bị từ chối (pin yếu, không phải HTTPS...): màn hình tắt theo cài đặt hệ thống.
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [enabled]);
}
