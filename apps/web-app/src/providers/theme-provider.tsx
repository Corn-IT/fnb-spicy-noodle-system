import * as React from 'react';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { syncDocumentThemeMode } from '@/utils/store-theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function resolveEffectiveTheme(
  storedTheme: 'light' | 'dark',
  hasExplicitTheme: boolean,
  storeDefaultTheme: 'light' | 'dark',
): 'light' | 'dark' {
  return hasExplicitTheme ? storedTheme : storeDefaultTheme;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const storedTheme = useUiPreferencesStore((state) => state.theme);
  const hasExplicitTheme = useUiPreferencesStore((state) => state.hasExplicitTheme);
  const { settings } = useStoreSettings();

  const activeTheme = resolveEffectiveTheme(storedTheme, hasExplicitTheme, settings.defaultTheme);

  React.useEffect(() => {
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
