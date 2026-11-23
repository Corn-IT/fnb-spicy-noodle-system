import * as React from 'react';

export const POS_TOUCH_ROOT_ATTRIBUTE = 'data-pos-touch';

/**
 * Gắn `data-pos-touch` lên <html> khi màn POS cảm ứng đang mở để biến thể Tailwind `touch-ui:`
 * phóng to vùng chạm của nút, ô nhập và dialog dùng chung (kể cả phần portal ra <body>).
 */
export function useTouchUiRoot(): void {
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(POS_TOUCH_ROOT_ATTRIBUTE, 'true');
    return () => root.removeAttribute(POS_TOUCH_ROOT_ATTRIBUTE);
  }, []);
}
