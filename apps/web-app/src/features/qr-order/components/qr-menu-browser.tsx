import type { Product } from '@fnb/shared';
import { Search, X } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

interface QrMenuBrowserProps {
  filteredProducts: Product[];
  searchQuery: string;
  menuSearch: {
    containerRef: React.RefObject<HTMLDivElement | null>;
    inputProps: React.InputHTMLAttributes<HTMLInputElement>;
    draft: string;
    clear: () => void;
  };
  stationTabs: Array<{ value: 'ALL' | Product['station']; label: string }>;
  effectiveStationFilter: 'ALL' | Product['station'];
  visibleCategories: Array<{ id: number; name: string }>;
  effectiveCategoryFilter: 'ALL' | number;
  cartQtyByProductId: Map<number, number>;
  onSelectStation: (station: 'ALL' | Product['station']) => void;
  onSelectCategory: (categoryId: 'ALL' | number) => void;
  onProductClick: (product: Product) => void;
}

/** Renders menu search, station/category filter bars, and responsive product grid for QR ordering. */
export function QrMenuBrowser({
  filteredProducts,
  searchQuery,
  menuSearch,
  stationTabs,
  effectiveStationFilter,
  visibleCategories,
  effectiveCategoryFilter,
  cartQtyByProductId,
  onSelectStation,
  onSelectCategory,
  onProductClick,
}: QrMenuBrowserProps) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Thực đơn món ăn ({filteredProducts.length})
          </h2>
        </div>

        <div ref={menuSearch.containerRef} className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            {...menuSearch.inputProps}
            id="qr-menu-search-input"
            name="qrMenuSearch"
            aria-label="Tìm tên món ăn"
            placeholder="Tìm tên món ăn (VD: mì cay, tokbokki, trà đào...)"
            data-testid="qr-menu-search-input"
            className="h-9 pl-9 pr-8 text-base sm:text-sm rounded-xl"
          />
          {menuSearch.draft ? (
            <button
              type="button"
              aria-label="Xoá tìm kiếm món"
              onMouseDown={(e) => e.preventDefault()}
              onClick={menuSearch.clear}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div
          data-testid="qr-station-bar"
          className="flex flex-wrap items-center gap-1.5 py-0.5"
        >
          {stationTabs.map((tab) => {
            const isStationSelected = effectiveStationFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                data-testid={`qr-station-tab-${tab.value}`}
                aria-pressed={isStationSelected}
                onClick={() => onSelectStation(tab.value)}
                className={`inline-flex min-h-9 max-w-full shrink-0 items-center justify-center rounded-full px-3.5 py-1.5 text-center text-xs font-semibold leading-snug break-words transition-all select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  isStationSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/70 text-muted-foreground border border-border/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {visibleCategories.length > 0 ? (
          <div
            data-testid="qr-category-bar"
            className="flex flex-wrap items-center gap-1.5 py-0.5"
          >
            <button
              type="button"
              data-testid="qr-category-tab-ALL"
              aria-pressed={effectiveCategoryFilter === 'ALL'}
              onClick={() => onSelectCategory('ALL')}
              className={`inline-flex min-h-8 max-w-full shrink-0 items-center rounded-md px-2.5 py-1 text-left text-[11px] font-semibold leading-snug break-words transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                effectiveCategoryFilter === 'ALL'
                  ? 'bg-primary/15 text-accent-text border border-primary/40'
                  : 'bg-background text-muted-foreground border border-border hover:text-foreground'
              }`}
            >
              Tất cả danh mục ({visibleCategories.length})
            </button>
            {visibleCategories.map((cat) => {
              const isSelected = effectiveCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`qr-category-tab-${cat.id}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectCategory(isSelected ? 'ALL' : cat.id)}
                  className={`inline-flex min-h-8 max-w-full shrink-0 items-center rounded-md px-2.5 py-1 text-left text-[11px] font-semibold leading-snug break-words transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                    isSelected
                      ? 'bg-primary/15 text-accent-text border border-primary/40'
                      : 'bg-background text-muted-foreground border border-border hover:text-foreground'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div
        data-testid="qr-product-grid"
        className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3"
      >
        {filteredProducts.length === 0 ? (
          <div className="col-span-2 md:col-span-3 flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center text-muted-foreground">
            <p className="text-sm font-semibold">Không tìm thấy món phù hợp</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={menuSearch.clear}
                  className="text-xs font-semibold text-accent-text hover:underline"
                >
                  Xoá từ khoá tìm kiếm
                </button>
              ) : null}
              {effectiveCategoryFilter !== 'ALL' ? (
                <button
                  type="button"
                  onClick={() => onSelectCategory('ALL')}
                  className="text-xs font-semibold text-accent-text hover:underline"
                >
                  Xem tất cả danh mục
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const inCartQty = cartQtyByProductId.get(product.id) ?? 0;
            const showCategoryBadge =
              Boolean(product.categoryName) && effectiveCategoryFilter === 'ALL';

            return (
              <div
                key={product.id}
                data-testid={`qr-product-card-${product.id}`}
                onClick={() => onProductClick(product)}
                className={cn(
                  'relative flex min-w-0 cursor-pointer flex-col justify-between rounded-xl border bg-card p-2.5 sm:p-3 shadow-xs transition hover:border-primary/60 active:scale-[0.98] touch-manipulation',
                  inCartQty > 0
                    ? 'border-primary/60 bg-primary/[0.03] ring-1 ring-primary/20'
                    : 'border-border/70',
                )}
              >
                {inCartQty > 0 ? (
                  <span
                    data-testid={`qr-product-cart-qty-${product.id}`}
                    aria-label={`Đã chọn ${inCartQty}`}
                    className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-primary-foreground shadow-sm ring-2 ring-background tabular-nums"
                  >
                    {inCartQty}
                  </span>
                ) : null}

                <div className="min-w-0 space-y-1">
                  {showCategoryBadge ? (
                    <span
                      data-testid={`qr-product-category-badge-${product.id}`}
                      className="inline-block max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                    >
                      {product.categoryName}
                    </span>
                  ) : null}
                  <p className="font-bold text-foreground text-xs sm:text-sm leading-snug line-clamp-2 break-words">
                    {product.name}
                  </p>
                  {product.subtitle ? (
                    <p className="text-[11px] font-medium text-muted-foreground leading-tight line-clamp-2 break-words">
                      ({product.subtitle})
                    </p>
                  ) : null}
                  {product.modifierGroups.length > 0 ? (
                    <p
                      data-testid={`qr-product-modifier-hint-${product.id}`}
                      className="text-[10px] sm:text-[11px] font-medium text-muted-foreground/85 line-clamp-1 pt-0.5"
                    >
                      Tuỳ chọn: {product.modifierGroups.map((g) => g.name).join(', ')}
                    </p>
                  ) : null}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-border/40 pt-2">
                  <p className="text-xs sm:text-sm font-extrabold text-price tabular-nums whitespace-nowrap">
                    {product.price.toLocaleString('vi-VN')} đ
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onProductClick(product);
                    }}
                    className="min-h-9 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 shrink-0 touch-manipulation active:scale-95 shadow-xs"
                  >
                    <span>Chọn</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
