import * as React from 'react';
import { NEUTRAL_STORE_SETTINGS, StoreAssetKind } from '@fnb/shared';
import { useStoreMessagesQuery } from '@/hooks/use-app-messages';
import {
  buildStoreAssetUrl,
  readCachedStoreSettings,
  resolveNavLabel,
  StoreSettingsContext,
  useStoreSettingsQuery,
} from '@/hooks/use-store-settings';

interface StoreSettingsProviderProps {
  children: React.ReactNode;
  currentPath?: string;
  defaultPageTitle?: string;
}

function upsertFaviconLink(rel: string, href: string | null): void {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (!existing) {
    document.head.appendChild(link);
  }
}

export function StoreSettingsProvider({
  children,
  currentPath,
  defaultPageTitle,
}: StoreSettingsProviderProps) {
  const query = useStoreSettingsQuery();
  const messagesQuery = useStoreMessagesQuery();
  const settings = query.data ?? readCachedStoreSettings() ?? NEUTRAL_STORE_SETTINGS;
  const messages = messagesQuery.data?.messages;

  React.useEffect(() => {
    if (currentPath === undefined && defaultPageTitle === undefined) {
      return;
    }

    const resolvedPath =
      currentPath ??
      (typeof window !== 'undefined' ? window.location.pathname : '/');
    const pageTitle = defaultPageTitle
      ? resolveNavLabel(resolvedPath, defaultPageTitle, settings.navLabels)
      : settings.navLabels[resolvedPath];

    document.title = pageTitle
      ? `${pageTitle} · ${settings.storeName}`
      : settings.storeName;
  }, [currentPath, defaultPageTitle, settings.navLabels, settings.storeName]);

  React.useEffect(() => {
    const faviconUrl = buildStoreAssetUrl(StoreAssetKind.FAVICON, settings.assets.favicon);
    upsertFaviconLink('icon', faviconUrl);
    upsertFaviconLink('apple-touch-icon', faviconUrl);
  }, [settings.assets.favicon]);

  React.useEffect(() => {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (settings.description) {
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = settings.description;
    } else if (meta) {
      meta.remove();
    }
  }, [settings.description]);

  const contextValue = React.useMemo(
    () => ({ settings, messages, query }),
    [settings, messages, query],
  );

  return (
    <StoreSettingsContext.Provider value={contextValue}>
      {children}
    </StoreSettingsContext.Provider>
  );
}
