import * as React from 'react';

/**
 * Chế độ POS ghi nhớ theo THIẾT BỊ (không theo tài khoản): máy POS cảm ứng ở quầy bật một lần
 * thì ai đăng nhập trên máy đó cũng vào thẳng `/pos/touch`. Đăng xuất KHÔNG xoá khoá này.
 */
export const POS_DEVICE_MODE_STORAGE_KEY = 'fnb-pos-device-mode';
export const POS_DEFAULT_PATH = '/pos';
export const POS_TOUCH_PATH = '/pos/touch';

export type PosDeviceMode = 'touch' | 'default';

const POS_DEVICE_MODE_EVENT = 'fnb:pos-device-mode-changed';

export function readPosDeviceMode(): PosDeviceMode {
  try {
    return localStorage.getItem(POS_DEVICE_MODE_STORAGE_KEY) === 'touch' ? 'touch' : 'default';
  } catch {
    return 'default';
  }
}

export function writePosDeviceMode(mode: PosDeviceMode): void {
  try {
    if (mode === 'touch') {
      localStorage.setItem(POS_DEVICE_MODE_STORAGE_KEY, 'touch');
    } else {
      localStorage.removeItem(POS_DEVICE_MODE_STORAGE_KEY);
    }
  } catch {
    // Trình duyệt chặn localStorage: chế độ chỉ áp dụng trong phiên hiện tại.
  }
  window.dispatchEvent(new Event(POS_DEVICE_MODE_EVENT));
}

/** Trang POS mặc định của máy này: dùng cho trang chủ `/` và điều hướng sau đăng nhập. */
export function resolvePosHomePath(): string {
  return readPosDeviceMode() === 'touch' ? POS_TOUCH_PATH : POS_DEFAULT_PATH;
}

export function usePosDeviceMode(): [PosDeviceMode, (mode: PosDeviceMode) => void] {
  const [mode, setMode] = React.useState<PosDeviceMode>(readPosDeviceMode);

  React.useEffect(() => {
    const sync = () => setMode(readPosDeviceMode());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === POS_DEVICE_MODE_STORAGE_KEY) sync();
    };
    window.addEventListener(POS_DEVICE_MODE_EVENT, sync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(POS_DEVICE_MODE_EVENT, sync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return [mode, writePosDeviceMode];
}
