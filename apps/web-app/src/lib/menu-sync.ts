import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type MdmItem, type MdmListResponse, type ProductStation } from '@fnb/shared';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

export interface KitchenStationOption {
  id?: number;
  code: ProductStation;
  name: string;
  desc: string;
  sortOrder: number;
  isSystem: boolean;
  isHidden: boolean;
  rawItem?: MdmItem;
}

export const DEFAULT_KITCHEN_STATIONS: KitchenStationOption[] = [
  {
    code: 'BEP_NAU',
    name: 'Bếp nấu',
    desc: 'Mì cay, Bánh mì chảo, Lẩu...',
    sortOrder: 1,
    isSystem: true,
    isHidden: false,
  },
  {
    code: 'BEP_CHIEN',
    name: 'Bếp chiên',
    desc: 'Khoai tây, Phô mai que, Cá viên...',
    sortOrder: 2,
    isSystem: true,
    isHidden: false,
  },
  {
    code: 'PHA_CHE',
    name: 'Pha chế',
    desc: 'Trà đào, Trà sữa, Nước ngọt...',
    sortOrder: 3,
    isSystem: true,
    isHidden: false,
  },
  {
    code: 'COMBO',
    name: 'Combo',
    desc: 'Tự động tách phiếu về các bếp',
    sortOrder: 4,
    isSystem: true,
    isHidden: false,
  },
];

const STATION_BADGE_STYLES: Record<string, string> = {
  BEP_NAU: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  BEP_CHIEN: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  PHA_CHE: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  COMBO: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
};

const DEFAULT_CUSTOM_STATION_BADGE_STYLE =
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';

/** Returns Tailwind classes matching the /menu table "Khu vực bếp" station badges. */
export function getStationBadgeClassName(stationCode: string): string {
  return STATION_BADGE_STYLES[stationCode] ?? DEFAULT_CUSTOM_STATION_BADGE_STYLE;
}

const MENU_SYNC_CHANNEL = 'fnb-menu-sync';

export function broadcastMenuSync(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(MENU_SYNC_CHANNEL);
    channel.postMessage({ type: 'MENU_UPDATED', timestamp: Date.now() });
    channel.close();
  } catch {
    // Ignore broadcast errors in unsupported environments
  }
}

export function useMenuSyncListener(): void {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(MENU_SYNC_CHANNEL);
      channel.onmessage = () => {
        void queryClient.invalidateQueries({ queryKey: ['mdm'] });
        void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
        void queryClient.invalidateQueries({ queryKey: ['pos'] });
        void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
      };
    } catch {
      // Ignore broadcast errors
    }
    return () => {
      try {
        channel?.close();
      } catch {
        // Ignore
      }
    };
  }, [queryClient]);
}

export function parseStationOptions(items: MdmItem[] | undefined): KitchenStationOption[] {
  if (!items || items.length === 0) {
    return DEFAULT_KITCHEN_STATIONS;
  }

  const parsed: KitchenStationOption[] = items.map((item, idx) => {
    const meta = item.metadata ?? {};
    const rawMetaCode =
      (typeof meta.code === 'string' && meta.code.trim()) ||
      (typeof meta.stationCode === 'string' && meta.stationCode.trim()) ||
      '';

    let stationCode: ProductStation;
    const norm = (item.normalizedName || item.name || '').toLowerCase();
    if (norm === 'bep nau' || norm.includes('nấu') || norm.includes('nau')) {
      stationCode = 'BEP_NAU';
    } else if (norm === 'bep chien' || norm.includes('chiên') || norm.includes('chien')) {
      stationCode = 'BEP_CHIEN';
    } else if (norm === 'pha che' || norm.includes('pha chế') || norm.includes('pha che')) {
      stationCode = 'PHA_CHE';
    } else if (norm === 'combo') {
      stationCode = 'COMBO';
    } else if (rawMetaCode) {
      stationCode = rawMetaCode as ProductStation;
    } else {
      stationCode = ('BEP_' + norm.replace(/[^a-z0-9]+/g, '_').toUpperCase()).slice(0, 20) as ProductStation;
    }

    const sortOrder = typeof meta.sortOrder === 'number' ? meta.sortOrder : idx + 1;
    const isSystem = Boolean(
      meta.isSystem ??
        (stationCode === 'BEP_NAU' ||
          stationCode === 'BEP_CHIEN' ||
          stationCode === 'PHA_CHE' ||
          stationCode === 'COMBO'),
    );
    const isHidden = Boolean(meta.isHidden);
    const desc =
      typeof meta.description === 'string' && meta.description.trim()
        ? meta.description.trim()
        : stationCode === 'COMBO'
          ? 'Tự động tách phiếu về các bếp'
          : `Trạm in nhiệt (${stationCode})`;

    return {
      id: item.id,
      code: stationCode,
      name: item.name,
      desc,
      sortOrder,
      isSystem,
      isHidden,
      rawItem: item,
    };
  });

  return parsed.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function useKitchenStationsLookup() {
  return useQuery({
    queryKey: ['mdm', 'lookup', 'KITCHEN_STATION'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<MdmItem[] | MdmListResponse>('/api/v1/mdm/lookup', {
          params: {
            category: 'KITCHEN_STATION',
            page: 1,
            limit: 100,
            activeOnly: true,
          },
        });
        return Array.isArray(res) ? res : (res.items ?? []);
      } catch {
        return [];
      }
    },
  });
}

export function useMenuCategoriesLookup() {
  return useQuery({
    queryKey: ['mdm', 'lookup', 'MENU_CATEGORY'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<MdmItem[] | MdmListResponse>('/api/v1/mdm/lookup', {
          params: {
            category: 'MENU_CATEGORY',
            page: 1,
            limit: 100,
            activeOnly: true,
          },
        });
        return Array.isArray(res) ? res : (res.items ?? []);
      } catch {
        return [];
      }
    },
  });
}
