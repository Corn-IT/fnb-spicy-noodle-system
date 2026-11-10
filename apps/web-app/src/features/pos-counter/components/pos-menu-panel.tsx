import {
  ProductStation,
  type ModifierGroup,
  type OrderItemModifierSelection,
  type Product,
  type ProductStation as ProductStationType,
} from '@fnb/shared';
import { Check, Flame, Minus, Plus, RefreshCw, Settings2 } from 'lucide-react';
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
import { toast } from '@/components/ui/toast';
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

const STATION_FILTERS: Array<{ label: string; value: 'ALL' | ProductStationType }> = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Bếp Nấu', value: ProductStation.BEP_NAU },
  { label: 'Bếp Chiên', value: ProductStation.BEP_CHIEN },
  { label: 'Pha Chế', value: ProductStation.PHA_CHE },
  { label: 'Combo', value: ProductStation.COMBO },
];

export function PosMenuPanel({ products, onAddItem }: PosMenuPanelProps) {
  const navigate = useNavigate();
  const [stationFilter, setStationFilter] = React.useState<'ALL' | ProductStationType>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | number>('ALL');
  const [modalProduct, setModalProduct] = React.useState<Product | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [selectedByGroup, setSelectedByGroup] = React.useState<Record<number, number[]>>({});
  const [manualSubstituteByModifierId, setManualSubstituteByModifierId] = React.useState<
    Record<number, number>
  >({});
  const [itemNote, setItemNote] = React.useState('');

  const availableProducts = React.useMemo(
    () => products.filter((p) => p.isAvailable),
    [products],
  );

  // Tầng 2 động: Danh sách danh mục con có trong khu vực bếp đang chọn
  const dynamicSubcategories = React.useMemo(() => {
    const base =
      stationFilter === 'ALL'
        ? availableProducts
        : availableProducts.filter((p) => p.station === stationFilter);
    const map = new Map<number, string>();
    for (const p of base) {
      if (p.categoryId && p.categoryName) {
        map.set(p.categoryId, p.categoryName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [availableProducts, stationFilter]);

  const filteredProducts = React.useMemo(() => {
    return availableProducts.filter((p) => {
      if (stationFilter !== 'ALL' && p.station !== stationFilter) return false;
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      return true;
    });
  }, [availableProducts, stationFilter, categoryFilter]);

  const handleProductClick = (product: Product) => {
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
    setSelectedByGroup((prev) => {
      const current = prev[group.id] ?? [];
      if (group.maxSelect === 1 && !group.isAutoSelect && !group.allowSubstitution) {
        return { ...prev, [group.id]: [modifierId] };
      }
      if (current.includes(modifierId)) {
        if (group.allowSubstitution && current.length <= 1) {
          toast({
            variant: 'warning',
            title: 'Cần giữ lại ít nhất 1 đồ ăn chính',
            description: `Nhóm "${group.name}" phải giữ tối thiểu 1 thành phần để thay thế cho các món bỏ chọn.`,
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
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {STATION_FILTERS.map((tab) => {
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
                  'inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95 select-none',
                  isActive
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="pos-goto-menu-admin-btn"
          onClick={() => navigate('/menu')}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          title="Cấu hình sản phẩm, danh mục con & nhóm tuỳ chọn"
        >
          <Settings2 className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Cấu hình Thực đơn</span>
        </button>
      </div>

      {/* Tầng 2: Danh mục con động từ MDM (VD: Mì cay, Bánh mì chảo, Lẩu...) */}
      {dynamicSubcategories.length > 0 ? (
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0"
          data-testid="pos-subcategory-bar"
        >
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all select-none',
              categoryFilter === 'ALL'
                ? 'bg-foreground text-background shadow-2xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border/60',
            )}
          >
            Tất cả danh mục
          </button>
          {dynamicSubcategories.map((cat) => {
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`pos-subcategory-pill-${cat.id}`}
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  'inline-flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all select-none',
                  isActive
                    ? 'bg-foreground text-background shadow-2xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border/60',
                )}
              >
                + {cat.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Tầng 3: Lưới Sản phẩm kèm Subtitle động */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] gap-2 sm:gap-2.5">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            data-testid={`pos-menu-product-${product.id}`}
            onClick={() => handleProductClick(product)}
            className="group relative flex flex-col justify-between rounded-xl border border-border/60 bg-card p-2.5 sm:p-3 text-left shadow-xs transition-all hover:border-rose-500/60 hover:shadow-sm active:scale-[0.98]"
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
              <span className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                {product.price.toLocaleString('vi-VN')} đ
              </span>
              <span className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full bg-rose-600 px-2.5 text-xs font-semibold leading-normal text-white shadow-xs transition-transform active:scale-95 whitespace-nowrap select-none">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>Thêm</span>
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Modal chọn phân cấp tuỳ chọn trong Sản phẩm */}
      <Dialog
        open={Boolean(modalProduct)}
        onOpenChange={(open) => {
          if (!open) setModalProduct(null);
        }}
      >
        <DialogContent
          data-testid="pos-modifier-modal"
          className="flex max-h-[90dvh] sm:max-h-[86vh] w-[calc(100vw-1.5rem)] sm:max-w-xl flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-card shadow-2xl"
        >
          <DialogHeader className="p-4 sm:p-5 border-b shrink-0 text-left bg-card">
            <DialogTitle className="flex flex-wrap items-baseline gap-2 text-base sm:text-lg font-bold">
              <Flame className="h-5 w-5 text-rose-600 shrink-0 self-center" />
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
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  + Tuỳ chọn thêm: +{computedModalPayload.extraPrice.toLocaleString('vi-VN')} đ
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {modalProduct ? (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5">
              {modalProduct.modifierGroups.map((group) => {
                const chosenIds = selectedByGroup[group.id] ?? [];
                const isAutoGroup = Boolean(
                  group.isAutoSelect ||
                    group.allowSubstitution ||
                    group.modifiers.some((m) => m.isDefaultChecked),
                );

                return (
                  <div
                    key={group.id}
                    className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3"
                    data-testid={`pos-mod-group-${group.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs sm:text-sm font-bold text-foreground">
                        - {group.name}
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
                        const isSelected = chosenIds.includes(mod.id);
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
                              isSelected
                                ? 'border-rose-600 bg-rose-50/90 text-rose-900 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-100 shadow-2xs'
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
                              onClick={() => handleToggleModifier(group, mod.id)}
                              className="flex w-full items-start justify-between gap-2 text-left"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span
                                  className={cn(
                                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                    isSelected
                                      ? 'border-rose-600 bg-rose-600 text-white'
                                      : 'border-muted-foreground/50 bg-background',
                                  )}
                                >
                                  {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                                </span>
                                <div className="min-w-0">
                                  <span
                                    className={cn(
                                      'block text-xs font-bold leading-snug',
                                      !isSelected && isAutoGroup && !group.allowSubstitution
                                        ? 'line-through opacity-75'
                                        : '',
                                    )}
                                  >
                                    {mod.name}
                                  </span>
                                </div>
                              </div>

                              {mod.extraPrice > 0 ? (
                                <span className="shrink-0 text-[11px] font-extrabold text-rose-600 dark:text-rose-400">
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
                            {group.allowSubstitution && isSelected && mod.defaultSubstituteName ? (
                              <span className="mt-1 pl-6 text-[10px] font-medium text-muted-foreground">
                                (Bỏ tích → Thay bằng {mod.defaultSubstituteName})
                              </span>
                            ) : null}

                            {/* Subtitle khi bỏ tích Đồ ăn mặc định 0đ */}
                            {!group.allowSubstitution && isAutoGroup && !isSelected ? (
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

          <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 sm:justify-between sm:items-center">
            <div className="text-xs text-muted-foreground">
              Tổng cộng:{' '}
              <strong className="text-sm text-rose-600 dark:text-rose-400">
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
                className="bg-rose-600 font-bold text-white hover:bg-rose-700 active:scale-[0.98]"
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
