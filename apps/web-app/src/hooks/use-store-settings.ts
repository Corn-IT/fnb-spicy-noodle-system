import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  mergeStoreSettingsWithDefaults,
  NEUTRAL_STORE_SETTINGS,
  PublicStoreSettingsResponseSchema,
  type PageHeaderOverride,
  type PublicStoreSettingsResponse,
  type StoreAssetKind,
  type StoreMessagesMap,
} from '@fnb/shared';
import * as React from 'react';
import { env } from '@/config/env';
import { apiClient } from '@/lib/api-client';

export const STORE_SETTINGS_CACHE_KEY = 'store_settings_cache' as const;
export const STORE_SETTINGS_QUERY_KEY = ['store-settings'] as const;

export function readCachedStoreSettings(): PublicStoreSettingsResponse | undefined {
  try {
    const raw = localStorage.getItem(STORE_SETTINGS_CACHE_KEY);
    if (!raw) return undefined;
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = PublicStoreSettingsResponseSchema.safeParse(mergeStoreSettingsWithDefaults(parsedJson));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedStoreSettings(settings: PublicStoreSettingsResponse): void {
  try {
    const parsed = PublicStoreSettingsResponseSchema.safeParse(settings);
    if (!parsed.success) return;
    localStorage.setItem(STORE_SETTINGS_CACHE_KEY, JSON.stringify(parsed.data));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

export function buildStoreAssetUrl(
  kind: StoreAssetKind,
  version: string | null | undefined,
  apiBaseUrl: string = env.VITE_API_BASE_URL,
): string | null {
  if (!version) return null;
  const trimmedBase = apiBaseUrl.trim().replace(/\/+$/, '');
  const path = `/api/v1/public/store-assets/${kind}?v=${encodeURIComponent(version)}`;
  return trimmedBase ? `${trimmedBase}${path}` : path;
}

export async function fetchPublicStoreSettings(): Promise<PublicStoreSettingsResponse> {
  const payload = await apiClient.get<PublicStoreSettingsResponse>('/api/v1/public/store-settings');
  const parsed = PublicStoreSettingsResponseSchema.parse(payload);
  writeCachedStoreSettings(parsed);
  return parsed;
}

export function resolveNavLabel(
  path: string,
  defaultLabel: string,
  navLabels?: Record<string, string>,
): string {
  const custom = navLabels?.[path]?.trim();
  return custom || defaultLabel;
}

export function resolveNavGroupLabel(
  groupKey: string,
  defaultLabel: string,
  navGroupLabels?: Record<string, string>,
): string {
  const custom = navGroupLabels?.[groupKey]?.trim();
  return custom || defaultLabel;
}

function sortByCustomOrder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  customOrder?: readonly string[],
): T[] {
  if (!customOrder || customOrder.length === 0) {
    return [...items];
  }
  const rank = new Map<string, number>();
  customOrder.forEach((key) => {
    const normalized = key.trim();
    if (normalized.length > 0 && !rank.has(normalized)) {
      rank.set(normalized, rank.size);
    }
  });
  if (rank.size === 0) {
    return [...items];
  }

  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      order: rank.get(getKey(item)) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order || a.originalIndex - b.originalIndex)
    .map((entry) => entry.item);
}

export function sortNavGroups<T extends { key: string }>(
  groups: readonly T[],
  navGroupOrder?: readonly string[],
): T[] {
  return sortByCustomOrder(groups, (group) => group.key, navGroupOrder);
}

export function sortNavRoutes<T extends { path: string }>(
  routes: readonly T[],
  navOrder?: readonly string[],
): T[] {
  return sortByCustomOrder(routes, (route) => route.path, navOrder);
}

export interface PageHeaderDefaults {
  title: string;
  subtitle?: string;
}

export interface ResolvedPageHeader {
  title: string;
  subtitle?: string;
  hasCustomTitle: boolean;
  hasCustomSubtitle: boolean;
  isCustomized: boolean;
}

export function resolvePageHeader(
  path: string,
  defaults: PageHeaderDefaults,
  pageHeaders?: Record<string, PageHeaderOverride>,
): ResolvedPageHeader {
  const custom = pageHeaders?.[path];
  const customTitle = custom?.title?.trim() ?? '';
  const customSubtitle = custom?.subtitle?.trim() ?? '';
  const hasCustomTitle = customTitle.length > 0;
  const hasCustomSubtitle = customSubtitle.length > 0;

  return {
    title: hasCustomTitle ? customTitle : defaults.title,
    subtitle: hasCustomSubtitle ? customSubtitle : defaults.subtitle?.trim() || undefined,
    hasCustomTitle,
    hasCustomSubtitle,
    isCustomized: hasCustomTitle || hasCustomSubtitle,
  };
}

export function getStoreInitials(storeName: string): string {
  const words = storeName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'P';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ''}${words[words.length - 1]![0] ?? ''}`.toUpperCase();
}

export interface StoreSettingsContextValue {
  settings: PublicStoreSettingsResponse;
  messages?: StoreMessagesMap;
  query?: UseQueryResult<PublicStoreSettingsResponse>;
}

export const StoreSettingsContext = React.createContext<StoreSettingsContextValue | null>(null);

export function useStoreSettingsQuery() {
  return useQuery({
    queryKey: STORE_SETTINGS_QUERY_KEY,
    queryFn: fetchPublicStoreSettings,
    initialData: () => readCachedStoreSettings(),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export function useStoreSettings(): StoreSettingsContextValue {
  const ctx = React.useContext(StoreSettingsContext);
  if (ctx) return ctx;
  return {
    settings: readCachedStoreSettings() ?? NEUTRAL_STORE_SETTINGS,
  };
}
