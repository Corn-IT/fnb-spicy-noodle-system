import * as React from 'react';
import { type NavigateOptions, useNavigate } from 'react-router-dom';

import { resolveTouchAwarePath } from './touch-routes';

export interface TouchShellContextValue {
  isInTouchShell: boolean;
  hideBottomNav: boolean;
  setHideBottomNav: (hidden: boolean) => void;
}

const DEFAULT_TOUCH_SHELL_CONTEXT: TouchShellContextValue = {
  isInTouchShell: false,
  hideBottomNav: false,
  setHideBottomNav: () => undefined,
};

const TouchShellContext = React.createContext<TouchShellContextValue>(DEFAULT_TOUCH_SHELL_CONTEXT);

export function TouchShellProvider({ children }: { children: React.ReactNode }) {
  const [hideBottomNav, setHideBottomNav] = React.useState(false);

  const value = React.useMemo<TouchShellContextValue>(
    () => ({
      isInTouchShell: true,
      hideBottomNav,
      setHideBottomNav,
    }),
    [hideBottomNav],
  );

  return <TouchShellContext.Provider value={value}>{children}</TouchShellContext.Provider>;
}

export function useTouchShell(): TouchShellContextValue {
  return React.useContext(TouchShellContext);
}

/**
 * Thay thế an toàn cho `useNavigate()` trong các trang tái sử dụng ở cả Desktop lẫn Touch Shell:
 * khi đang ở Touch Shell, các phím tắt như `navigate('/payment-qr')` hoặc `navigate('/pos')`
 * sẽ đi tiếp bên trong `/pos/touch/*` thay vì văng ra giao diện Desktop.
 */
export function useTouchAwareNavigate() {
  const navigate = useNavigate();
  const { isInTouchShell } = useTouchShell();

  return React.useCallback(
    (to: string, options?: NavigateOptions) => {
      navigate(resolveTouchAwarePath(to, isInTouchShell), options);
    },
    [navigate, isInTouchShell],
  );
}
