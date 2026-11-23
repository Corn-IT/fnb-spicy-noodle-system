import * as React from 'react';

/**
 * Bật toàn màn hình cho cả trang (ẩn thanh địa chỉ & thanh điều hướng Android).
 * Trình duyệt CHỈ cho phép gọi trong một thao tác của người dùng (chạm / bấm), nên hàm này
 * phải được gọi trực tiếp trong event handler. Lỗi (không hỗ trợ / bị từ chối) được bỏ qua.
 */
export async function requestAppFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (document.fullscreenElement) return true;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function') return false;
  try {
    await root.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exitAppFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !document.fullscreenElement) return;
  if (typeof document.exitFullscreen !== 'function') return;
  try {
    await document.exitFullscreen();
  } catch {
    // Đã thoát sẵn hoặc trình duyệt từ chối: không cần xử lý thêm.
  }
}

export function isFullscreenSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function'
  );
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );

  React.useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggle = React.useCallback(async () => {
    if (document.fullscreenElement) {
      await exitAppFullscreen();
    } else {
      await requestAppFullscreen();
    }
  }, []);

  return {
    isFullscreen,
    isSupported: isFullscreenSupported(),
    enter: requestAppFullscreen,
    exit: exitAppFullscreen,
    toggle,
  };
}
