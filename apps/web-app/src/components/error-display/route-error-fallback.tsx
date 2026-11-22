import { useLocation, useRouteError } from 'react-router-dom';

import { SystemErrorView } from '@/components/error-display/system-error-view';

export interface NotFoundPageProps {
  variant?: 'section' | 'page' | 'guest';
}

export function NotFoundPage({ variant = 'section' }: NotFoundPageProps) {
  const location = useLocation();
  const isGuestQrPath = location.pathname.startsWith('/qr');
  const resolvedVariant = variant === 'guest' || isGuestQrPath ? 'guest' : variant;

  return (
    <SystemErrorView
      variant={resolvedVariant}
      statusKeyOverride="404"
      descriptionOverride={
        isGuestQrPath
          ? 'Đường dẫn QR bàn bạn mở không hợp lệ hoặc thiếu mã bàn.'
          : `Đường dẫn "${location.pathname}" không tồn tại trong hệ thống POS.`
      }
      testId="not-found-page"
    />
  );
}

export function AppShellRouteErrorElement() {
  const error = useRouteError();
  return (
    <SystemErrorView
      variant="section"
      error={error}
      testId="route-error-section"
    />
  );
}

export function RootRouteErrorElement() {
  const error = useRouteError();
  const location = useLocation();
  const variant = location.pathname.startsWith('/qr') ? 'guest' : 'page';

  return (
    <SystemErrorView
      variant={variant}
      error={error}
      testId="route-error-root"
    />
  );
}
