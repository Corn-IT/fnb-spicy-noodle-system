import { type Product } from '@fnb/shared';
import { Search, Settings2, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Input } from '@/components/ui/input';
import { useCommitSearch } from '@/lib/use-commit-search';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';
import {
  usePosMenuCatalog,
  type PosCategoryFilter,
  type PosStationFilter,
} from '../hooks/use-pos-menu-catalog';
import type { PosMenuSelectedItem } from './pos-menu-types';
import { ProductOptionsDialog } from './product-options-dialog';

export type { PosMenuSelectedItem } from './pos-menu-types';

export interface PosMenuPanelProps {
  products: Product[];
  onAddItem: (item: PosMenuSelectedItem) => void;
}

export function PosMenuPanel({ products, onAddItem }: PosMenuPanelProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canAddItems = user
    ? Boolean(user.isSuperAdmin || user.permissions?.pos?.create || user.permissions?.pos?.update)
    : true;
  const canManageMenu = user
    ? Boolean(user.isSuperAdmin || user.permissions?.menu?.create || user.permissions?.menu?.update)
    : true;
  const { stationFilters, getCategoriesForStation, filterProducts } = usePosMenuCatalog(products);

  const [stationFilter, setStationFilter] = React.useState<PosStationFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<PosCategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const menuSearch = useCommitSearch(searchQuery, setSearchQuery);
  const [modalProduct, setModalProduct] = React.useState<Product | null>(null);

  // Tầng 2 động: Danh sách danh mục con có trong khu vực bếp đang chọn (sắp xếp theo MDM sortOrder)
  const dynamicSubcategories = React.useMemo(
    () => getCategoriesForStation(stationFilter),
    [getCategoriesForStation, stationFilter],
  );

  const filteredProducts = React.useMemo(
    () => filterProducts({ station: stationFilter, category: categoryFilter, query: searchQuery }),
    [filterProducts, stationFilter, categoryFilter, searchQuery],
  );

  const handleProductClick = (product: Product) => {
    if (!canAddItems) return;
    if (product.modifierGroups.length > 0) {
      setModalProduct(product);
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

      <ProductOptionsDialog
        product={modalProduct}
        onClose={() => setModalProduct(null)}
        onConfirm={onAddItem}
      />
    </div>
  );
}
