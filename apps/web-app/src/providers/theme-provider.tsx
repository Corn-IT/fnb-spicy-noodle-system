import * as React from 'react';
import { isGuestQrPath } from '@/hooks/use-display-scale';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { syncDocumentThemeMode } from '@/utils/store-theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { settings } = useStoreSettings();
  const activeTheme = settings.defaultTheme;

  React.useEffect(() => {
    // Guest QR owns its document theme, including during shared branding refreshes.
    if (isGuestQrPath(window.location.pathname)) return;
    syncDocumentThemeMode(
      activeTheme,
      settings.brandColor,
      settings.accentTextColor,
      settings.priceColor,
      settings.primaryTextColor,
    );
  }, [
    activeTheme,
    settings.brandColor,
    settings.accentTextColor,
    settings.priceColor,
    settings.primaryTextColor,
  ]);

  return <>{children}</>;
}
