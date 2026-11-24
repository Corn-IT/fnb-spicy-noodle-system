import * as React from 'react';

export const POS_TOUCH_ROOT_ATTRIBUTE = 'data-pos-touch';

/**
 * Gắn `data-pos-touch` lên <html> khi chế độ cảm ứng đang mở để biến thể Tailwind `touch-ui:`
 * phóng to vùng chạm của nút, ô nhập và dialog dùng chung (kể cả phần portal ra <body>).
 * Hỗ trợ nested calls an toàn bằng reference counter để chuyển màn hoặc mount lồng không làm
 * tắt nhấp nháy thuộc tính `data-pos-touch`.
 */
let activeTouchRootCount = 0;

export function useTouchUiRoot(enabled = true): void {
  React.useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    activeTouchRootCount += 1;
    root.setAttribute(POS_TOUCH_ROOT_ATTRIBUTE, 'true');
    return () => {
      activeTouchRootCount = Math.max(0, activeTouchRootCount - 1);
      if (activeTouchRootCount === 0) {
        root.removeAttribute(POS_TOUCH_ROOT_ATTRIBUTE);
      }
    };
  }, [enabled]);
}
