import {
  type ModifierGroup,
  type OrderItemModifierSelection,
  type Product,
  type ProductStation as ProductStationType,
} from '@fnb/shared';
import { Check, Flame, Minus, Plus, RefreshCw, Search, Settings2, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useCommitSearch } from '@/lib/use-commit-search';
import { useAuthStore } from '@/stores/auth.store';
import { normalizeVietnameseText } from '@/utils/search';
import {
  parseStationOptions,
  useKitchenStationsLookup,
  useMenuCategoriesLookup,
  useMenuSyncListener,
} from '@/lib/menu-sync';
import {
  buildInitialSelectedByGroup,
  computeOrderModifiersPayload,
  isProductModifierSelectionValid,
  resolveSubstituteForUncheckedModifier,
} from '@/lib/modifier-selection';
import { cn } from '@/utils/cn';

export interface PosMenuSelectedItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderItemModifierSelection[];
  modifierLabels: string[];
  itemNote?: string;
}

export interface PosMenuPanelProps {
  products: Product[];
  onAddItem: (item: PosMenuSelectedItem) => void;
}

export function PosMenuPanel({ products, onAddItem }: PosMenuPanelProps) {
  useMenuSyncListener();

  const { notify } = useAppMessages();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canAddItems = user
    ? Boolean(user.isSuperAdmin || user.permissions?.pos?.create || user.permissions?.pos?.update)
    : true;
  const canManageMenu = user
    ? Boolean(user.isSuperAdmin || user.permissions?.menu?.create || user.permissions?.menu?.update)
    : true;
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

  const stationFilters = React.useMemo<Array<{ label: string; value: 'ALL' | ProductStationType }>>(
    () => [
      { label: 'Tất cả', value: 'ALL' },
      ...visibleStations
        .filter((st) => st.code !== 'COMBO' || availableProducts.some((p) => p.station === 'COMBO'))
        .map((st) => ({ label: st.name, value: st.code })),
    ],
    [visibleStations, availableProducts],
  );

  const [stationFilter, setStationFilter] = React.useState<'ALL' | ProductStationType>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const menuSearch = useCommitSearch(searchQuery, setSearchQuery);
  const [modalProduct, setModalProduct] = React.useState<Product | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [selectedByGroup, setSelectedByGroup] = React.useState<Record<number, number[]>>({});
  const [manualSubstituteByModifierId, setManualSubstituteByModifierId] = React.useState<
    Record<number, number>
  >({});
  const [itemNote, setItemNote] = React.useState('');

  const categoryOrderById = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const cat of rawCategories ?? []) {
      const sort = typeof cat.metadata?.sortOrder === 'number' ? cat.metadata.sortOrder : Number.MAX_SAFE_INTEGER;
      map.set(cat.id, sort);
    }
    return map;
  }, [rawCategories]);

  // Tầng 2 động: Danh sách danh mục con có trong khu vực bếp đang chọn (sắp xếp theo MDM sortOrder)
  const dynamicSubcategories = React.useMemo(() => {
    const base =
      stationFilter === 'ALL'
        ? availableProducts
        : availableProducts.filter((p) => p.station === stationFilter);
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
  }, [availableProducts, stationFilter, hiddenCategoryIds, activeCategoryNameById, categoryOrderById]);

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

  const filteredProducts = React.useMemo(() => {
    const normalizedQuery = normalizeVietnameseText(searchQuery);
    return availableProducts.filter((p) => {
      if (stationFilter !== 'ALL' && p.station !== stationFilter) return false;
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      if (normalizedQuery && !(normalizedSearchIndexById.get(p.id) ?? '').includes(normalizedQuery)) {
        return false;
      }
      return true;
    });
  }, [availableProducts, stationFilter, categoryFilter, searchQuery, normalizedSearchIndexById]);

  const handleProductClick = (product: Product) => {
    if (!canAddItems) return;
    if (product.modifierGroups.length > 0) {
      setModalProduct(product);
      setQuantity(1);
      setSelectedByGroup(buildInitialSelectedByGroup(product));
      setManualSubstituteByModifierId({});
      setItemNote('');
      return;
    }

    onAddItem({
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
      modifiers: [],
      modifierLabels: [],
    });
  };

  const handleToggleModifier = (group: ModifierGroup, modifierId: number) => {
    const targetMod = group.modifiers.find((m) => m.id === modifierId);
    if (targetMod && targetMod.isAvailable === false) {
      return;
    }
    setSelectedByGroup((prev) => {
      const current = prev[group.id] ?? [];
      if (group.maxSelect === 1 && !group.isAutoSelect && !group.allowSubstitution) {
        return { ...prev, [group.id]: [modifierId] };
      }
      if (current.includes(modifierId)) {
        if (group.allowSubstitution && current.length <= 1) {
          notify('qr.modifier.minSubstituteRequired', {
            variant: 'warning',
            vars: { groupName: group.name },
          });
          return prev;
        }
        return { ...prev, [group.id]: current.filter((id) => id !== modifierId) };
      }
      if (current.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...current, modifierId] };
    });
  };

  const isModalValid = modalProduct
    ? isProductModifierSelectionValid(modalProduct, selectedByGroup)
    : false;

  const computedModalPayload = React.useMemo(() => {
    if (!modalProduct) {
      return { extraPrice: 0, modifiers: [], modifierLabels: [] };
    }
    return computeOrderModifiersPayload(
      modalProduct,
      selectedByGroup,
      manualSubstituteByModifierId,
    );
  }, [modalProduct, selectedByGroup, manualSubstituteByModifierId]);

  const handleConfirmModal = () => {
    if (!modalProduct || !isModalValid) return;

    onAddItem({
      productId: modalProduct.id,
      name: modalProduct.name,
      quantity,
      unitPrice: modalProduct.price + computedModalPayload.extraPrice,
      modifiers: computedModalPayload.modifiers,
      modifierLabels: computedModalPayload.modifierLabels,
      itemNote: itemNote.trim() ? itemNote.trim() : undefined,
    });
    setModalProduct(null);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-4 pb-28 sm:pb-6">
      {/* Tầng 1: Khu vực Bếp + Nút tắt sang Quản trị Thực đơn */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {stationFilters.map((tab) => {
            const isActive = stationFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setStationFilter(tab.value);
                  setCategoryFilter('ALL');
                }}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-xs font-semibold transition-all active:scale-95 select-none whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {canManageMenu ? (
          <button
            type="button"
            data-testid="pos-goto-menu-admin-btn"
            onClick={() => navigate('/menu')}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors whitespace-nowrap"
            title="Cấu hình sản phẩm, danh mục con & nhóm tuỳ chọn"
          >
            <Settings2 className="h-3.5 w-3.5 text-accent-text shrink-0" />
            <span className="hidden sm:inline">Cấu hình Thực đơn</span>
          </button>
        ) : null}
      </div>

      {/* Tầng 2: Danh mục con động từ MDM (Hiển thị đầy đủ dạng pill) */}
      {dynamicSubcategories.length > 0 ? (
        <div
          data-testid="pos-subcategory-bar"
          className="flex flex-wrap items-center gap-1.5 py-0.5 shrink-0"
        >
          <button
            type="button"
            data-testid="pos-subcategory-pill-ALL"
            onClick={() => setCategoryFilter('ALL')}
            className={cn(
              'inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap',
              categoryFilter === 'ALL'
                ? 'bg-primary/15 text-accent-text border border-primary/40'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground',
            )}
          >
            Tất cả danh mục ({dynamicSubcategories.length})
          </button>
          {dynamicSubcategories.map((cat) => {
            const isSelected = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`pos-subcategory-pill-${cat.id}`}
                onClick={() => setCategoryFilter(isSelected ? 'ALL' : cat.id)}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap',
                  isSelected
                    ? 'bg-primary/15 text-accent-text border border-primary/40'
                    : 'bg-background text-muted-foreground border border-border hover:text-foreground',
                )}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Tìm nhanh món ăn */}
      <div ref={menuSearch.containerRef} className="relative shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          {...menuSearch.inputProps}
          placeholder="Tìm nhanh món ăn..."
          data-testid="pos-menu-search-input"
          className="h-9 pl-8 pr-8 text-xs sm:text-sm"
        />
        {menuSearch.draft ? (
          <button
            type="button"
            aria-label="Xoá từ khoá tìm món"
            onMouseDown={(e) => e.preventDefault()}
            onClick={menuSearch.clear}
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Tầng 3: Lưới Sản phẩm kèm Subtitle động */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center text-muted-foreground">
          <p className="text-sm font-semibold">Không tìm thấy món phù hợp</p>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs font-semibold text-accent-text hover:underline"
            >
              Xoá bộ lọc tìm kiếm
            </button>
          ) : null}
        </div>
      ) : (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] gap-2 sm:gap-2.5">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            disabled={!canAddItems}
            data-testid={`pos-menu-product-${product.id}`}
            onClick={() => handleProductClick(product)}
            className={cn(
              'group relative flex flex-col justify-between rounded-xl border border-border/60 bg-card p-2.5 sm:p-3 text-left shadow-xs transition-all',
              canAddItems
                ? 'hover:border-primary/60 hover:shadow-sm active:scale-[0.98]'
                : 'cursor-default opacity-90',
            )}
          >
            <div className="space-y-1">
              {product.categoryName ? (
                <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {product.categoryName}
                </span>
              ) : null}
              <span className="block font-bold text-foreground text-xs sm:text-sm leading-snug">
                {product.name}
              </span>
              {product.subtitle ? (
                <p className="text-[11px] font-medium text-muted-foreground leading-tight line-clamp-2">
                  ({product.subtitle})
                </p>
              ) : null}
              {product.modifierGroups.length > 0 ? (
                <p className="text-[10px] text-muted-foreground/80 line-clamp-1 pt-0.5">
                  {product.modifierGroups.map((g) => g.name).join(' • ')}
                </p>
              ) : null}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-border/40 pt-2">
              <span className="text-xs sm:text-sm font-bold text-price tabular-nums whitespace-nowrap">
                {product.price.toLocaleString('vi-VN')} đ
              </span>
              {canAddItems ? (
                <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold leading-normal text-primary-foreground shadow-xs transition-transform active:scale-95 whitespace-nowrap select-none">
                  <span>Thêm</span>
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
      )}

      {/* Modal chọn phân cấp tuỳ chọn trong Sản phẩm */}
      <Dialog
        open={Boolean(modalProduct)}
        onOpenChange={(open) => {
          if (!open) setModalProduct(null);
        }}
      >
        <DialogContent
          data-testid="pos-modifier-modal"
          className="flex max-h-[90dvh] sm:max-h-[86vh] w-[calc(100vw-1.5rem)] sm:max-w-2xl lg:max-w-3xl flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-card shadow-2xl"
        >
          <DialogHeader className="px-4 py-3 sm:px-5 sm:py-3.5 border-b shrink-0 text-left bg-card">
            <DialogTitle className="flex flex-wrap items-baseline gap-2 text-base sm:text-lg font-bold">
              <Flame className="h-5 w-5 text-accent-text shrink-0 self-center" />
              <span>{modalProduct?.name}</span>
              {modalProduct?.subtitle ? (
                <span
                  data-testid="pos-modal-product-subtitle"
                  className="text-sm font-semibold text-muted-foreground"
                >
                  ({modalProduct.subtitle})
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>
                Đơn giá gốc: <strong>{modalProduct?.price.toLocaleString('vi-VN')} đ</strong>
              </span>
              {computedModalPayload.extraPrice > 0 ? (
                <span className="font-bold text-price">
                  + Tuỳ chọn thêm: +{computedModalPayload.extraPrice.toLocaleString('vi-VN')} đ
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {modalProduct ? (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 py-3 sm:px-5 sm:py-3.5 space-y-3.5">
              {modalProduct.modifierGroups.map((group) => {
                const chosenIds = selectedByGroup[group.id] ?? [];
                const isAutoGroup = Boolean(
                  group.isAutoSelect || group.allowSubstitution,
                );

                return (
                  <div
                    key={group.id}
                    className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3"
                    data-testid={`pos-mod-group-${group.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs sm:text-sm font-bold text-foreground">
                        {group.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {group.allowSubstitution ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold border-blue-500/40 text-blue-700 dark:text-blue-300"
                          >
                            Bỏ tích tự động đổi sang món còn lại
                          </Badge>
                        ) : isAutoGroup ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          >
                            Mặc định tích sẵn (Bỏ tích nếu khách không ăn)
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            {group.isRequired
                              ? 'Bắt buộc chọn 1'
                              : `Tối đa ${group.maxSelect}`}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {group.modifiers.map((mod) => {
                        const isOutOfStock = mod.isAvailable === false;
                        const isSelected = !isOutOfStock && chosenIds.includes(mod.id);
                        const subInfo =
                          group.allowSubstitution && !isSelected
                            ? resolveSubstituteForUncheckedModifier(
                                group,
                                mod,
                                chosenIds,
                                manualSubstituteByModifierId,
                              )
                            : null;

                        return (
                          <div
                            key={mod.id}
                            className={cn(
                              'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all',
                              isOutOfStock
                                ? group.allowSubstitution
                                  ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                                  : 'border-dashed border-border/80 bg-muted/50 text-muted-foreground opacity-85'
                                : isSelected
                                  ? 'border-primary bg-primary/10 text-accent-text shadow-2xs'
                                  : group.allowSubstitution
                                    ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                                    : isAutoGroup
                                      ? 'border-dashed border-border bg-muted/40 text-muted-foreground'
                                      : 'border-border bg-card hover:bg-muted/50',
                            )}
                          >
                            <button
                              type="button"
                              data-testid={`pos-mod-option-${mod.id}`}
                              disabled={isOutOfStock}
                              aria-disabled={isOutOfStock}
                              onClick={() => handleToggleModifier(group, mod.id)}
                              className={cn(
                                'flex w-full items-start justify-between gap-2 text-left',
                                isOutOfStock && 'cursor-not-allowed',
                              )}
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span
                                  className={cn(
                                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                    isOutOfStock
                                      ? 'border-muted-foreground/30 bg-muted'
                                      : isSelected
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-muted-foreground/50 bg-background',
                                  )}
                                >
                                  {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                                </span>
                                <div className="min-w-0">
                                  <span
                                    className={cn(
                                      'block text-xs font-bold leading-snug',
                                      isOutOfStock || (!isSelected && isAutoGroup && !group.allowSubstitution)
                                        ? 'line-through opacity-70'
                                        : '',
                                    )}
                                  >
                                    {mod.name}
                                  </span>
                                  {isOutOfStock ? (
                                    <span
                                      data-testid={`pos-mod-out-of-stock-${mod.id}`}
                                      className="mt-0.5 block text-[10px] font-semibold text-rose-600 dark:text-rose-400"
                                    >
                                      Tạm hết
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {mod.extraPrice > 0 ? (
                                <span
                                  className={cn(
                                    'shrink-0 text-[11px] font-extrabold text-price',
                                    isOutOfStock && 'line-through opacity-60',
                                  )}
                                >
                                  +{mod.extraPrice >= 1000 ? `${mod.extraPrice / 1000}k` : `${mod.extraPrice}đ`}
                                </span>
                              ) : null}
                            </button>

                            {/* Subtitle động cho Đồ ăn chính khi bỏ tích chọn */}
                            {group.allowSubstitution && !isSelected && subInfo ? (
                              <div
                                data-testid={`pos-mod-substitute-${mod.id}`}
                                className="mt-1.5 border-t border-amber-500/30 pt-1.5 space-y-1"
                              >
                                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                  <RefreshCw className="h-3 w-3 shrink-0" />
                                  <span>Thay thế bằng {subInfo.substituteName}</span>
                                </div>
                                {subInfo.availableSubstitutes.length > 1 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {subInfo.availableSubstitutes.map((candidate) => (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        onClick={() =>
                                          setManualSubstituteByModifierId((prev) => ({
                                            ...prev,
                                            [mod.id]: candidate.id,
                                          }))
                                        }
                                        className={cn(
                                          'rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-colors',
                                          subInfo.substituteModifier?.id === candidate.id
                                            ? 'border-amber-600 bg-amber-600 text-white'
                                            : 'border-border bg-background text-muted-foreground hover:text-foreground',
                                        )}
                                      >
                                        Đổi sang {candidate.name}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {/* Subtitle gợi ý mặc định khi đang tích chọn Đồ ăn chính */}
                            {!isOutOfStock && group.allowSubstitution && isSelected && mod.defaultSubstituteName ? (
                              <span className="mt-1 pl-6 text-[10px] font-medium text-muted-foreground">
                                (Bỏ tích → Thay bằng {mod.defaultSubstituteName})
                              </span>
                            ) : null}

                            {/* Subtitle khi bỏ tích Đồ ăn mặc định 0đ */}
                            {!isOutOfStock && !group.allowSubstitution && isAutoGroup && !isSelected ? (
                              <span className="mt-1 pl-6 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                Không {mod.name}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1.5">
                <label htmlFor="pos-item-note" className="text-xs font-bold text-foreground">
                  Ghi chú
                </label>
                <textarea
                  id="pos-item-note"
                  rows={2}
                  placeholder="Nhập ghi chú riêng cho bếp (VD: Ít cay, nấu chín kỹ, để riêng nước...)"
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <span className="text-sm font-bold">Số lượng món</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-bold">{quantity}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setQuantity((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="px-4 py-2.5 sm:px-5 sm:py-3 border-t bg-muted/20 shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 sm:justify-between sm:items-center">
            <div className="text-xs text-muted-foreground">
              Tổng cộng:{' '}
              <strong className="text-sm text-price">
                {(
                  ((modalProduct?.price ?? 0) + computedModalPayload.extraPrice) *
                  quantity
                ).toLocaleString('vi-VN')}{' '}
                đ
              </strong>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalProduct(null)}>
                Huỷ
              </Button>
              <Button
                type="button"
                data-testid="pos-confirm-modifier-btn"
                disabled={!isModalValid}
                onClick={handleConfirmModal}
                className="bg-primary font-bold text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
              >
                Xác nhận thêm món
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
