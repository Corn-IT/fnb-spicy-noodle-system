import type { Product, ProductStation } from '@fnb/shared';
import * as React from 'react';

import {
  parseStationOptions,
  useKitchenStationsLookup,
  useMenuCategoriesLookup,
  useMenuSyncListener,
} from '@/lib/menu-sync';
import { normalizeVietnameseText } from '@/utils/search';

export type PosStationFilter = 'ALL' | ProductStation;
export type PosCategoryFilter = 'ALL' | number;

export interface PosMenuCategoryOption {
  id: number;
  name: string;
}

export interface PosMenuFilter {
  station: PosStationFilter;
  category: PosCategoryFilter;
  query: string;
}

/**
 * Danh mục bán hàng dùng chung cho màn POS chuột và cảm ứng: lọc món đang bán,
 * ẩn khu vực bếp / danh mục bị ẩn, sắp danh mục theo MDM sortOrder và tìm kiếm
 * không dấu (khớp i/y theo `normalizeVietnameseText`).
 */
export function usePosMenuCatalog(products: Product[]) {
  useMenuSyncListener();

  const { data: rawStations } = useKitchenStationsLookup();
  const { data: rawCategories } = useMenuCategoriesLookup();

  const allStations = React.useMemo(() => parseStationOptions(rawStations), [rawStations]);
  const visibleStations = React.useMemo(
    () => allStations.filter((st) => !st.isHidden),
    [allStations],
  );
  const hiddenStationCodes = React.useMemo(
    () => new Set(allStations.filter((st) => st.isHidden).map((st) => st.code)),
    [allStations],
  );

  const hiddenCategoryIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const cat of rawCategories ?? []) {
      if (cat.metadata?.isHidden) {
        ids.add(cat.id);
      }
    }
    return ids;
  }, [rawCategories]);

  const activeCategoryNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const cat of rawCategories ?? []) {
      if (!cat.metadata?.isHidden) {
        map.set(cat.id, cat.name);
      }
    }
    return map;
  }, [rawCategories]);

  const categoryOrderById = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const cat of rawCategories ?? []) {
      const sort =
        typeof cat.metadata?.sortOrder === 'number'
          ? cat.metadata.sortOrder
          : Number.MAX_SAFE_INTEGER;
      map.set(cat.id, sort);
    }
    return map;
  }, [rawCategories]);

  const availableProducts = React.useMemo(
    () =>
      products.filter((p) => {
        if (!p.isAvailable) return false;
        if (hiddenStationCodes.has(p.station)) return false;
        if (p.categoryId && hiddenCategoryIds.has(p.categoryId)) return false;
        return true;
      }),
    [products, hiddenStationCodes, hiddenCategoryIds],
  );

  const stationFilters = React.useMemo<Array<{ label: string; value: PosStationFilter }>>(
    () => [
      { label: 'Tất cả', value: 'ALL' },
      ...visibleStations
        .filter(
          (st) => st.code !== 'COMBO' || availableProducts.some((p) => p.station === 'COMBO'),
        )
        .map((st) => ({ label: st.name, value: st.code })),
    ],
    [visibleStations, availableProducts],
  );

  const getCategoriesForStation = React.useCallback(
    (station: PosStationFilter): PosMenuCategoryOption[] => {
      const base =
        station === 'ALL'
          ? availableProducts
          : availableProducts.filter((p) => p.station === station);
      const map = new Map<number, string>();
      for (const p of base) {
        if (p.categoryId && !hiddenCategoryIds.has(p.categoryId)) {
          const liveCatName = activeCategoryNameById.get(p.categoryId) ?? p.categoryName;
          if (liveCatName) {
            map.set(p.categoryId, liveCatName);
          }
        }
      }
      return Array.from(map.entries())
        .map(([id, name]) => ({ id, name }))
        .sort(
          (a, b) =>
            (categoryOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (categoryOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name, 'vi'),
        );
    },
    [availableProducts, hiddenCategoryIds, activeCategoryNameById, categoryOrderById],
  );

  const normalizedSearchIndexById = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const p of availableProducts) {
      map.set(
        p.id,
        normalizeVietnameseText(`${p.name} ${p.subtitle ?? ''} ${p.categoryName ?? ''}`),
      );
    }
    return map;
  }, [availableProducts]);

  const filterProducts = React.useCallback(
    ({ station, category, query }: PosMenuFilter): Product[] => {
      const normalizedQuery = normalizeVietnameseText(query);
      return availableProducts.filter((p) => {
        if (station !== 'ALL' && p.station !== station) return false;
        if (category !== 'ALL' && p.categoryId !== category) return false;
        if (
          normalizedQuery &&
          !(normalizedSearchIndexById.get(p.id) ?? '').includes(normalizedQuery)
        ) {
          return false;
        }
        return true;
      });
    },
    [availableProducts, normalizedSearchIndexById],
  );

  return {
    availableProducts,
    stationFilters,
    getCategoriesForStation,
    filterProducts,
  };
}
