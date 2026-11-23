import type { Product } from '@fnb/shared';
import { Search, X } from 'lucide-react';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';
import { ProductOptionsDialog } from '../components/product-options-dialog';
import type { PosMenuSelectedItem } from '../components/pos-menu-types';
import { usePosMenuCatalog, type PosCategoryFilter } from '../hooks/use-pos-menu-catalog';
import { formatCompactPrice } from './elapsed-time';

const SEARCH_DEBOUNCE_MS = 200;

export interface TouchMenuBoardProps {
  products: Product[];
  canAddItems: boolean;
  /** Số lượng món đã có trong giỏ / hoá đơn theo productId, hiện trên ô món. */
  quantityByProductId: Map<number, number>;
  onAddItem: (item: PosMenuSelectedItem) => void;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Thực đơn cảm ứng: danh mục dọc bên trái, lưới ô món lớn, tìm kiếm lọc ngay khi gõ. */
export function TouchMenuBoard({
  products,
  canAddItems,
  quantityByProductId,
  onAddItem,
}: TouchMenuBoardProps) {
  const { getCategoriesForStation, filterProducts } = usePosMenuCatalog(products);
  const [category, setCategory] = React.useState<PosCategoryFilter>('ALL');
  const [searchDraft, setSearchDraft] = React.useState('');
  const query = useDebouncedValue(searchDraft, SEARCH_DEBOUNCE_MS);
  const [modalProduct, setModalProduct] = React.useState<Product | null>(null);

  const categories = React.useMemo(() => getCategoriesForStation('ALL'), [getCategoriesForStation]);
  // Đang tìm kiếm thì tìm trên toàn thực đơn, không bó trong danh mục đang chọn.
  const visibleProducts = React.useMemo(
    () =>
      filterProducts({
        station: 'ALL',
        category: query.trim() ? 'ALL' : category,
        query,
      }),
    [filterProducts, category, query],
  );

  const handleProductTap = (product: Product) => {
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
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav
        aria-label="Danh mục món"
        className="flex w-44 shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain border-r bg-muted/30 p-2.5 xl:w-52"
      >
        <CategoryButton
          label="Tất cả"
          testId="touch-category-ALL"
          isActive={category === 'ALL' && !query.trim()}
          onSelect={() => {
            setCategory('ALL');
            setSearchDraft('');
          }}
        />
        {categories.map((cat) => (
          <CategoryButton
            key={cat.id}
            label={cat.name}
            testId={`touch-category-${cat.id}`}
            isActive={category === cat.id && !query.trim()}
            onSelect={() => {
              setCategory(cat.id);
              setSearchDraft('');
            }}
          />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative shrink-0 border-b p-2.5">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Tìm món (gõ không dấu cũng được)..."
            data-testid="touch-menu-search"
            className="h-12 pl-11 pr-14 text-base"
          />
          {searchDraft ? (
            <button
              type="button"
              aria-label="Xoá từ khoá tìm món"
              onClick={() => setSearchDraft('')}
              className="absolute right-3.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {visibleProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
              <p className="text-base font-semibold">Không tìm thấy món phù hợp</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 2xl:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
              {visibleProducts.map((product) => {
                const inCart = quantityByProductId.get(product.id) ?? 0;
                const hint =
                  product.subtitle ?? (product.modifierGroups.length > 0 ? 'Có tuỳ chọn' : null);
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={!canAddItems}
                    data-testid={`touch-product-${product.id}`}
                    onClick={() => handleProductTap(product)}
                    className={cn(
                      'relative flex min-h-28 flex-col justify-between gap-2 rounded-2xl border-2 bg-card p-3 text-left shadow-xs transition-transform active:scale-[0.96]',
                      inCart > 0 ? 'border-primary bg-primary/5' : 'border-border/70',
                      !canAddItems && 'opacity-70',
                    )}
                  >
                    <span className="block min-w-0">
                      <span className="block text-base font-bold leading-snug line-clamp-3">
                        {product.name}
                      </span>
                      {hint ? (
                        <span className="mt-0.5 block truncate text-xs font-medium text-muted-foreground">
                          {hint}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center justify-between gap-1.5">
                      <span className="rounded-lg bg-primary px-2 py-0.5 text-sm font-extrabold text-primary-foreground tabular-nums">
                        {formatCompactPrice(product.price)}
                      </span>
                      {inCart > 0 ? (
                        <span
                          data-testid={`touch-product-qty-${product.id}`}
                          className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-2 text-sm font-extrabold text-white tabular-nums"
                        >
                          {inCart}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ProductOptionsDialog
        product={modalProduct}
        onClose={() => setModalProduct(null)}
        onConfirm={onAddItem}
      />
    </div>
  );
}

interface CategoryButtonProps {
  label: string;
  testId: string;
  isActive: boolean;
  onSelect: () => void;
}

function CategoryButton({ label, testId, isActive, onSelect }: CategoryButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={isActive}
      onClick={onSelect}
      className={cn(
        'min-h-14 w-full shrink-0 rounded-xl px-3 py-2 text-left text-sm font-bold uppercase leading-snug transition-transform active:scale-[0.97]',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-card text-foreground border border-border/70',
      )}
    >
      {label}
    </button>
  );
}
