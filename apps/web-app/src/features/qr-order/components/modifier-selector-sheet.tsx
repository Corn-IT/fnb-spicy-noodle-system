import {
  type ModifierGroup,
  type OrderItemModifierSelection,
  type Product,
} from '@fnb/shared';
import { Check, Flame, Minus, Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import {
  buildInitialSelectedByGroup,
  computeOrderModifiersPayload,
  isProductModifierSelectionValid,
  resolveSubstituteForUncheckedModifier,
} from '@/lib/modifier-selection';
import { cn } from '@/utils/cn';

export interface ModifierSelectorConfirmPayload {
  product: Product;
  quantity: number;
  modifiers: OrderItemModifierSelection[];
  modifierLabels: string[];
  unitPriceWithModifiers: number;
  itemNote?: string;
}

export interface ModifierSelectorSheetProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: ModifierSelectorConfirmPayload) => void;
}

export function ModifierSelectorSheet({
  product,
  open,
  onOpenChange,
  onConfirm,
}: ModifierSelectorSheetProps) {
  const [quantity, setQuantity] = React.useState(1);
  const [selectedByGroup, setSelectedByGroup] = React.useState<Record<number, number[]>>({});
  const [manualSubstituteByModifierId, setManualSubstituteByModifierId] = React.useState<
    Record<number, number>
  >({});
  const [itemNote, setItemNote] = React.useState('');

  React.useEffect(() => {
    if (open && product) {
      setQuantity(1);
      setSelectedByGroup(buildInitialSelectedByGroup(product));
      setManualSubstituteByModifierId({});
      setItemNote('');
    }
  }, [open, product]);

  if (!product) return null;

  const isAllRequiredSelected = isProductModifierSelectionValid(product, selectedByGroup);

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
      if (current.length >= group.maxSelect) {
        return prev;
      }
      return { ...prev, [group.id]: [...current, modifierId] };
    });
  };

  const { extraPrice: extraTotal, modifiers: selections, modifierLabels } =
    computeOrderModifiersPayload(product, selectedByGroup, manualSubstituteByModifierId);

  const unitPriceWithModifiers = product.price + extraTotal;
  const lineTotal = unitPriceWithModifiers * quantity;

  const handleSubmit = () => {
    if (!isAllRequiredSelected) return;
    onConfirm({
      product,
      quantity,
      modifiers: selections,
      modifierLabels,
      unitPriceWithModifiers,
      itemNote: itemNote.trim() ? itemNote.trim() : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="modifier-selector-sheet"
        className="max-h-[88vh] overflow-y-auto rounded-t-2xl p-4 sm:p-5"
      >
        <SheetHeader className="text-left pr-10">
          <SheetTitle className="flex flex-wrap items-baseline gap-2 text-lg font-bold">
            <Flame className="h-5 w-5 text-rose-600 self-center shrink-0" />
            <span>{product.name}</span>
            {product.subtitle ? (
              <span className="text-sm font-semibold text-muted-foreground">
                ({product.subtitle})
              </span>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            Giá gốc: <strong>{product.price.toLocaleString('vi-VN')} đ</strong> — Tuỳ chỉnh các phần ăn theo sở thích của bạn.
          </SheetDescription>
        </SheetHeader>

        <div className="my-4 space-y-4">
          {product.modifierGroups.map((group) => {
            const chosenIds = selectedByGroup[group.id] ?? [];
            const isRadio =
              group.maxSelect === 1 && !group.isAutoSelect && !group.allowSubstitution;
            const isAutoGroup = Boolean(
              group.isAutoSelect ||
                group.allowSubstitution ||
                group.modifiers.some((m) => m.isDefaultChecked),
            );

            return (
              <div
                key={group.id}
                className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-sm font-bold text-foreground">{group.name}</span>
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
                      Mặc định tích sẵn (0đ)
                    </Badge>
                  ) : (
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        group.isRequired
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      )}
                    >
                      {group.isRequired ? 'Bắt buộc chọn 1' : `Tối đa ${group.maxSelect}`}
                    </span>
                  )}
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
                            ? 'border-rose-600 bg-rose-50 font-semibold text-rose-700 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-200'
                            : group.allowSubstitution
                              ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                              : isAutoGroup
                                ? 'border-dashed border-border bg-muted/40 text-muted-foreground'
                                : 'border-border bg-card hover:bg-muted/50',
                        )}
                      >
                        <button
                          type="button"
                          data-testid={`modifier-option-${mod.id}`}
                          role={isRadio ? 'radio' : 'checkbox'}
                          aria-checked={isSelected}
                          onClick={() => handleToggleModifier(group, mod.id)}
                          className="flex w-full items-start justify-between gap-2 text-left text-xs sm:text-sm"
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
                            <span
                              className={cn(
                                'font-bold leading-snug',
                                !isSelected && isAutoGroup && !group.allowSubstitution
                                  ? 'line-through opacity-75'
                                  : '',
                              )}
                            >
                              {mod.name}
                            </span>
                          </div>
                          {mod.extraPrice > 0 ? (
                            <span className="shrink-0 text-xs font-extrabold text-rose-600 dark:text-rose-400">
                              +{mod.extraPrice >= 1000 ? `${mod.extraPrice / 1000}k` : `${mod.extraPrice}đ`}
                            </span>
                          ) : null}
                        </button>

                        {group.allowSubstitution && !isSelected && subInfo ? (
                          <div className="mt-1.5 border-t border-amber-500/30 pt-1.5 space-y-1">
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

                        {group.allowSubstitution && isSelected && mod.defaultSubstituteName ? (
                          <span className="mt-1 pl-6 text-[10px] font-medium text-muted-foreground">
                            (Bỏ tích → Thay bằng {mod.defaultSubstituteName})
                          </span>
                        ) : null}

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
            <label htmlFor="modifier-item-note" className="text-sm font-bold">
              Ghi chú
            </label>
            <textarea
              id="modifier-item-note"
              data-testid="modifier-note-input"
              rows={2}
              placeholder="VD: Không hành lá, để riêng nước..."
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <span className="text-sm font-medium">Số lượng</span>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Giảm số lượng"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-6 text-center text-base font-bold" data-testid="modifier-qty">
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Tăng số lượng"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            data-testid="confirm-modifier-btn"
            disabled={!isAllRequiredSelected}
            onClick={handleSubmit}
            className="w-full bg-rose-600 font-bold text-white hover:bg-rose-700"
          >
            Thêm vào giỏ — {lineTotal.toLocaleString('vi-VN')} đ
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
