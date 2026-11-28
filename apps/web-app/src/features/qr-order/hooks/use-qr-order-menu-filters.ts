import type { Product, PublicMenuResponse } from '@fnb/shared';
import * as React from 'react';

import { useCommitSearch } from '@/lib/use-commit-search';
import { matchesVietnameseQuery } from '@/utils/search';
import { DEFAULT_STATION_LABELS } from '../utils/qr-cart-storage';

/** Manages station/category filters and Vietnamese search filtering for the QR guest menu. */
export function useQrOrderMenuFilters(menuData: PublicMenuResponse | undefined) {
  const [stationFilter, setStationFilter] = React.useState<'ALL' | Product['station']>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const menuSearch = useCommitSearch(searchQuery, setSearchQuery);

  const stationTabs = React.useMemo(() => {
    if (!menuData) return [{ value: 'ALL' as const, label: 'Tất cả' }];
    if (menuData.stations && menuData.stations.length > 0) {
      return [
        { value: 'ALL' as const, label: 'Tất cả' },
        ...menuData.stations
          .filter((st) => st.code !== 'COMBO' || menuData.products.some((p) => p.station === 'COMBO'))
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((st) => ({
            value: st.code,
            label: st.name || DEFAULT_STATION_LABELS[st.code] || st.code,
          })),
      ];
    }
    const stationSet = new Set<string>(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE', 'COMBO']);
    for (const p of menuData.products) {
      stationSet.add(p.station);
    }
    return [
      { value: 'ALL' as const, label: 'Tất cả' },
      ...Array.from(stationSet).map((code) => ({
        value: code,
        label: DEFAULT_STATION_LABELS[code] ?? code,
      })),
    ];
  }, [menuData]);

  const visibleStationCodes = React.useMemo(() => {
    if (!menuData?.stations || menuData.stations.length === 0) return null;
    return new Set(menuData.stations.map((s) => s.code));
  }, [menuData?.stations]);

  const effectiveStationFilter = React.useMemo(() => {
    if (stationFilter === 'ALL') return 'ALL' as const;
    return stationTabs.some((tab) => tab.value === stationFilter) ? stationFilter : ('ALL' as const);
  }, [stationFilter, stationTabs]);

  const visibleCategories = React.useMemo(() => {
    if (!menuData) return [];
    const visibleProductCategoryIds = new Set<number>();
    const stationProductCategoryIds = new Set<number>();
    for (const p of menuData.products) {
      if (visibleStationCodes && !visibleStationCodes.has(p.station)) continue;
      if (p.categoryId !== null && p.categoryId !== undefined) {
        visibleProductCategoryIds.add(p.categoryId);
        if (effectiveStationFilter === 'ALL' || p.station === effectiveStationFilter) {
          stationProductCategoryIds.add(p.categoryId);
        }
      }
    }
    if (menuData.categories && menuData.categories.length > 0) {
      return menuData.categories
        .filter((cat) => {
          if (effectiveStationFilter === 'ALL') {
            if (
              visibleStationCodes &&
              cat.stationCode &&
              !visibleStationCodes.has(cat.stationCode) &&
              !visibleProductCategoryIds.has(cat.id)
            ) {
              return false;
            }
            return true;
          }
          return (
            cat.stationCode === effectiveStationFilter ||
            stationProductCategoryIds.has(cat.id)
          );
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((cat) => ({ id: cat.id, name: cat.name }));
    }
    const base =
      effectiveStationFilter === 'ALL'
        ? menuData.products
        : menuData.products.filter((p) => p.station === effectiveStationFilter);
    const catMap = new Map<number, string>();
    for (const p of base) {
      if (p.categoryId && p.categoryName) {
        catMap.set(p.categoryId, p.categoryName);
      }
    }
    return Array.from(catMap.entries()).map(([id, name]) => ({ id, name }));
  }, [menuData, visibleStationCodes, effectiveStationFilter]);

  const effectiveCategoryFilter = React.useMemo(() => {
    if (categoryFilter === 'ALL') return 'ALL' as const;
    return visibleCategories.some((cat) => cat.id === categoryFilter)
      ? categoryFilter
      : ('ALL' as const);
  }, [categoryFilter, visibleCategories]);

  const visibleCategoryIds = React.useMemo(() => {
    if (!menuData?.categories || menuData.categories.length === 0) return null;
    return new Set(menuData.categories.map((c) => c.id));
  }, [menuData?.categories]);

  const filteredProducts = React.useMemo(() => {
    if (!menuData) return [];
    return menuData.products.filter((p) => {
      if (visibleStationCodes && !visibleStationCodes.has(p.station)) return false;
      if (p.categoryId !== null && p.categoryId !== undefined && visibleCategoryIds && !visibleCategoryIds.has(p.categoryId)) {
        return false;
      }
      if (effectiveStationFilter !== 'ALL' && p.station !== effectiveStationFilter) return false;
      if (effectiveCategoryFilter !== 'ALL' && p.categoryId !== effectiveCategoryFilter) return false;
      if (!matchesVietnameseQuery(searchQuery, p.name, p.subtitle, p.categoryName)) return false;
      return true;
    });
  }, [
    menuData,
    visibleStationCodes,
    visibleCategoryIds,
    effectiveStationFilter,
    effectiveCategoryFilter,
    searchQuery,
  ]);

  return {
    setStationFilter,
    setCategoryFilter,
    searchQuery,
    menuSearch,
    stationTabs,
    visibleCategories,
    effectiveStationFilter,
    effectiveCategoryFilter,
    filteredProducts,
  };
}
