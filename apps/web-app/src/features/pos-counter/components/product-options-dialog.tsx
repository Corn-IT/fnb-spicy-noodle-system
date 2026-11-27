import type { ModifierGroup, Product } from '@fnb/shared';
import { Check, Flame, Minus, Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';

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
import { useAppMessages } from '@/hooks/use-app-messages';
import {
  buildInitialSelectedByGroup,
  computeOrderModifiersPayload,
  getSubstitutionHintText,
  isProductModifierSelectionValid,
  resolveSubstituteForUncheckedModifier,
} from '@/lib/modifier-selection';
import { cn } from '@/utils/cn';

import type { PosMenuSelectedItem } from './pos-menu-types';

export interface ProductOptionsDialogInitialValue {
  quantity: number;
  selectedByGroup: Record<number, number[]>;
  manualSubstituteByModifierId: Record<number, number>;
  itemNote?: string;
}

export interface ProductOptionsDialogProps {
  product: Product | null;
  mode?: 'create' | 'edit';
  editInstanceKey?: string;
  initialValue?: ProductOptionsDialogInitialValue;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (item: PosMenuSelectedItem) => void | Promise<void>;
}

/**
 * Modal chọn tuỳ chọn (topping, cấp độ, món thay thế), ghi chú và số lượng cho 1 món.
 * Dùng chung cho màn POS chuột và màn POS cảm ứng (cả chế độ thêm mới và chỉnh sửa món chưa in bếp).
 */
export function ProductOptionsDialog({
  product,
  mode = 'create',
  editInstanceKey,
  initialValue,
  isSubmitting = false,
  onClose,
  onConfirm,
}: ProductOptionsDialogProps) {
  return (
    <Dialog
      open={Boolean(product)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid="pos-modifier-modal"
        className="flex max-h-[90dvh] sm:max-h-[86vh] w-[calc(100vw-1.5rem)] sm:max-w-2xl lg:max-w-3xl flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-card shadow-2xl"
      >
        {product ? (
          <ProductOptionsForm
            key={`${product.id}-${mode}-${editInstanceKey ?? 'new'}`}
            product={product}
            mode={mode}
            initialValue={initialValue}
            isSubmitting={isSubmitting}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface ProductOptionsFormProps {
  product: Product;
  mode: 'create' | 'edit';
  initialValue?: ProductOptionsDialogInitialValue;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (item: PosMenuSelectedItem) => void | Promise<void>;
}

function ProductOptionsForm({
  product,
  mode,
  initialValue,
  isSubmitting,
  onClose,
  onConfirm,
}: ProductOptionsFormProps) {
  const { notify } = useAppMessages();
  const [quantity, setQuantity] = React.useState(() => Math.max(1, initialValue?.quantity ?? 1));
  const [selectedByGroup, setSelectedByGroup] = React.useState<Record<number, number[]>>(() =>
    initialValue ? { ...initialValue.selectedByGroup } : buildInitialSelectedByGroup(product),
  );
  const [manualSubstituteByModifierId, setManualSubstituteByModifierId] = React.useState<
    Record<number, number>
  >(() => (initialValue ? { ...initialValue.manualSubstituteByModifierId } : {}));
  const [itemNote, setItemNote] = React.useState(() => initialValue?.itemNote ?? '');

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

  const isValid = isProductModifierSelectionValid(product, selectedByGroup);

  const computedPayload = React.useMemo(
    () => computeOrderModifiersPayload(product, selectedByGroup, manualSubstituteByModifierId),
    [product, selectedByGroup, manualSubstituteByModifierId],
  );

  const handleConfirm = async () => {
    if (!isValid || isSubmitting) return;
    try {
      await onConfirm({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: product.price + computedPayload.extraPrice,
        modifiers: computedPayload.modifiers,
        modifierLabels: computedPayload.modifierLabels,
        itemNote: itemNote.trim() ? itemNote.trim() : undefined,
      });
      onClose();
    } catch {
      // Lỗi mutation đã được xử lý thông báo ở hook workspace; giữ modal để người dùng điều chỉnh.
    }
  };

  return (
    <>
      <DialogHeader className="px-4 py-3 sm:px-5 sm:py-3.5 border-b shrink-0 text-left bg-card">
        <DialogTitle className="flex flex-wrap items-baseline gap-2 text-base sm:text-lg font-bold touch-ui:text-xl">
          <Flame className="h-5 w-5 text-accent-text shrink-0 self-center" />
          <span>{product.name}</span>
          {product.subtitle ? (
            <span
              data-testid="pos-modal-product-subtitle"
              className="text-sm font-semibold text-muted-foreground"
            >
              ({product.subtitle})
            </span>
          ) : null}
          {mode === 'edit' ? (
            <Badge variant="secondary" data-testid="pos-modal-edit-badge" className="text-[10px] self-center">
              Chỉnh sửa món
            </Badge>
          ) : null}
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between touch-ui:text-sm">
          <span>
            Đơn giá gốc: <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
          </span>
          {computedPayload.extraPrice > 0 ? (
            <span className="font-bold text-price">
              + Tuỳ chọn thêm: +{computedPayload.extraPrice.toLocaleString('vi-VN')} đ
            </span>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 py-3 sm:px-5 sm:py-3.5 space-y-3.5">
        {product.modifierGroups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            Món này chưa cấu hình tuỳ chọn thêm. Bạn có thể chỉnh số lượng hoặc ghi chú bếp bên dưới.
          </p>
        ) : null}
        {product.modifierGroups.map((group) => {
          const chosenIds = selectedByGroup[group.id] ?? [];
          const isAutoGroup = Boolean(group.isAutoSelect || group.allowSubstitution);

          return (
            <div
              key={group.id}
              className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3"
              data-testid={`pos-mod-group-${group.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs sm:text-sm font-bold text-foreground touch-ui:text-base">
                  {group.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {group.allowSubstitution ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold border-blue-500/40 text-blue-700 dark:text-blue-300 touch-ui:text-xs"
                    >
                      Bỏ tích tự động đổi sang món còn lại
                    </Badge>
                  ) : isAutoGroup ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 touch-ui:text-xs"
                    >
                      Mặc định tích sẵn (Bỏ tích nếu khách không ăn)
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] font-semibold touch-ui:text-xs">
                      {group.isRequired ? 'Bắt buộc chọn 1' : `Tối đa ${group.maxSelect}`}
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
                  const canSubstitute = Boolean(
                    subInfo && subInfo.availableSubstitutes.length > 0 && subInfo.substituteName,
                  );
                  const substitutionHint =
                    group.allowSubstitution && isSelected
                      ? getSubstitutionHintText(group, mod)
                      : null;

                  return (
                    <div
                      key={mod.id}
                      className={cn(
                        'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all',
                        isOutOfStock
                          ? canSubstitute
                            ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                            : 'border-dashed border-border/80 bg-muted/50 text-muted-foreground opacity-85'
                          : isSelected
                            ? 'border-primary bg-primary/10 text-accent-text shadow-2xs'
                            : canSubstitute
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
                        aria-pressed={isSelected}
                        onClick={() => handleToggleModifier(group, mod.id)}
                        className={cn(
                          'flex w-full items-start justify-between gap-2 text-left touch-ui:min-h-11 touch-ui:items-center',
                          isOutOfStock && 'cursor-not-allowed',
                        )}
                      >
                        <div className="flex items-start gap-2 min-w-0 touch-ui:items-center">
                          <span
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors touch-ui:mt-0 touch-ui:h-6 touch-ui:w-6',
                              isOutOfStock
                                ? 'border-muted-foreground/30 bg-muted'
                                : isSelected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-muted-foreground/50 bg-background',
                            )}
                          >
                            {isSelected ? (
                              <Check className="h-3 w-3 stroke-[3] touch-ui:h-4 touch-ui:w-4" />
                            ) : null}
                          </span>
                          <div className="min-w-0">
                            <span
                              className={cn(
                                'block text-xs font-bold leading-snug touch-ui:text-sm',
                                isOutOfStock ||
                                  (!isSelected && isAutoGroup && (!group.allowSubstitution || !canSubstitute))
                                  ? 'line-through opacity-70'
                                  : '',
                              )}
                            >
                              {mod.name}
                            </span>
                            {isOutOfStock ? (
                              <span
                                data-testid={`pos-mod-out-of-stock-${mod.id}`}
                                className="mt-0.5 block text-[10px] font-semibold text-rose-600 dark:text-rose-400 touch-ui:text-xs"
                              >
                                Tạm hết
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {mod.extraPrice > 0 ? (
                          <span
                            className={cn(
                              'shrink-0 text-[11px] font-extrabold text-price touch-ui:text-sm',
                              isOutOfStock && 'line-through opacity-60',
                            )}
                          >
                            +
                            {mod.extraPrice >= 1000
                              ? `${mod.extraPrice / 1000}k`
                              : `${mod.extraPrice}đ`}
                          </span>
                        ) : null}
                      </button>

                      {/* Subtitle động cho Đồ ăn chính khi bỏ tích chọn */}
                      {group.allowSubstitution && !isSelected && subInfo && canSubstitute ? (
                        <div
                          data-testid={`pos-mod-substitute-${mod.id}`}
                          className="mt-1.5 border-t border-amber-500/30 pt-1.5 space-y-1"
                        >
                          <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 touch-ui:text-xs">
                            <RefreshCw className="h-3 w-3 shrink-0" />
                            <span>Thay thế bằng {subInfo.substituteName}</span>
                          </div>
                          {subInfo.availableSubstitutes.length > 1 ? (
                            <div className="flex flex-wrap gap-1 touch-ui:gap-1.5">
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
                                    'rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-colors touch-ui:min-h-10 touch-ui:rounded-lg touch-ui:px-3 touch-ui:text-xs',
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
                      {substitutionHint ? (
                        <span className="mt-1 pl-6 text-[10px] font-medium text-muted-foreground touch-ui:text-xs">
                          {substitutionHint}
                        </span>
                      ) : null}

                      {/* Subtitle khi bỏ tích Đồ ăn mặc định hoặc món chính không đổi */}
                      {!isOutOfStock &&
                      !isSelected &&
                      isAutoGroup &&
                      (!group.allowSubstitution || !canSubstitute) ? (
                        <span
                          data-testid={`pos-mod-removed-${mod.id}`}
                          className="mt-1 pl-6 text-[10px] font-semibold text-rose-600 dark:text-rose-400 touch-ui:text-xs"
                        >
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
          <label htmlFor="pos-item-note" className="text-xs font-bold text-foreground touch-ui:text-sm">
            Ghi chú
          </label>
          <textarea
            id="pos-item-note"
            data-testid="pos-item-note-input"
            rows={2}
            placeholder="Nhập ghi chú riêng cho bếp (VD: Ít cay, nấu chín kỹ, để riêng nước...)"
            value={itemNote}
            onChange={(e) => setItemNote(e.target.value)}
            className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring touch-ui:text-base"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-3">
          <span className="text-sm font-bold touch-ui:text-base">Số lượng món</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Giảm số lượng"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-bold touch-ui:text-lg">{quantity}</span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Tăng số lượng"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter className="px-4 py-2.5 sm:px-5 sm:py-3 border-t bg-muted/20 shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 sm:justify-between sm:items-center">
        <div className="text-xs text-muted-foreground touch-ui:text-sm">
          Tổng cộng:{' '}
          <strong className="text-sm text-price touch-ui:text-lg">
            {((product.price + computedPayload.extraPrice) * quantity).toLocaleString('vi-VN')} đ
          </strong>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            type="button"
            data-testid="pos-confirm-modifier-btn"
            disabled={!isValid || isSubmitting}
            onClick={() => void handleConfirm()}
            className="bg-primary font-bold text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
          >
            {isSubmitting ? 'Đang lưu...' : mode === 'edit' ? 'Lưu thay đổi' : 'Xác nhận thêm món'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
