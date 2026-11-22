import { type PaymentSource, UpdateInventoryImportSchema } from '@fnb/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
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
import {
  type InventoryImportRecord,
  useUpdateInventoryImportMutation,
} from '@/features/inventory/api/inventory.api';
import { IngredientMdmCombobox } from '@/features/inventory/components/ingredient-mdm-combobox';
import { SupplierMdmCombobox } from '@/features/inventory/components/supplier-mdm-combobox';
import { cn } from '@/utils/cn';

export interface EditInventoryImportDialogProps {
  record: InventoryImportRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInventoryImportDialog({
  record,
  open,
  onOpenChange,
}: EditInventoryImportDialogProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const [importDate, setImportDate] = React.useState('');
  const [paymentSource, setPaymentSource] = React.useState<PaymentSource>('CASH_DRAWER');
  const [supplierMdmId, setSupplierMdmId] = React.useState<number | undefined>();
  const [supplierName, setSupplierName] = React.useState('');
  const [ingredientMdmId, setIngredientMdmId] = React.useState<number | undefined>();
  const [ingredientName, setIngredientName] = React.useState('');
  const [unitName, setUnitName] = React.useState('');
  const [unitPrice, setUnitPrice] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [note, setNote] = React.useState('');

  const updateMutation = useUpdateInventoryImportMutation();

  React.useEffect(() => {
    if (open && record) {
      setImportDate(record.importDate.slice(0, 10));
      setPaymentSource(record.paymentSource);
      setSupplierMdmId(record.supplierMdmId ?? undefined);
      setSupplierName(record.supplierNameSnapshot ?? '');
      setIngredientMdmId(record.ingredientMdmId);
      setIngredientName(record.itemNameSnapshot);
      setUnitName(record.unitName);
      setUnitPrice(String(record.unitPrice));
      setQuantity(String(record.quantity));
      setNote(record.note ?? '');
    }
  }, [open, record]);

  const previewTotal = React.useMemo(() => {
    const p = Number(unitPrice) || 0;
    const q = Number(quantity) || 0;
    return Math.round(p * q);
  }, [unitPrice, quantity]);

  const handleSubmit = async () => {
    if (!record) return;
    const payload = {
      supplierMdmId,
      supplierName: supplierName.trim() || undefined,
      ingredientMdmId,
      ingredientName: ingredientName.trim() || undefined,
      unitName: unitName.trim(),
      unitPrice: Number(unitPrice),
      quantity: Number(quantity),
      paymentSource,
      importDate,
      note: note.trim() || null,
    };

    const parsed = UpdateInventoryImportSchema.safeParse(payload);
    if (!parsed.success) {
      notify('inventory.update.invalidData', {
        variant: 'destructive',
        vars: {
          reason:
            parsed.error.issues[0]?.message ?? 'Vui lòng kiểm tra lại các trường bắt buộc.',
        },
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: record.id, body: parsed.data });
      notify('inventory.update.success', { variant: 'success' });
      onOpenChange(false);
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'inventory.update.error',
        err,
        'Vui lòng thử lại.',
      );
      notify('inventory.update.error', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="edit-import-dialog"
        className="w-[calc(100vw-2rem)] sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Chỉnh sửa Phiếu Nhập hàng</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin nguyên liệu, nhà cung cấp, đơn giá, số lượng hoặc nguồn tiền.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Nhà cung cấp (MDM)
            </label>
            <SupplierMdmCombobox
              value={supplierName}
              selectedId={supplierMdmId}
              onSelectSupplier={(sel) => {
                setSupplierMdmId(sel.supplierMdmId);
                setSupplierName(sel.supplierName);
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Nguyên liệu (MDM) *
            </label>
            <IngredientMdmCombobox
              rowIndex={99}
              value={ingredientName}
              selectedId={ingredientMdmId}
              onSelectIngredient={(sel) => {
                setIngredientMdmId(sel.ingredientMdmId);
                setIngredientName(sel.ingredientName);
                if (sel.defaultUnit) setUnitName(sel.defaultUnit);
                if (typeof sel.lastPrice === 'number') setUnitPrice(String(sel.lastPrice));
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                ĐVT *
              </label>
              <Input
                data-testid="edit-import-unit-input"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Đơn giá (đ) *
              </label>
              <CurrencyInput
                data-testid="edit-import-price-input"
                value={unitPrice}
                onValueChange={setUnitPrice}
                suffix="đ"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Số lượng *
              </label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                data-testid="edit-import-qty-input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Ngày nhập kho
              </label>
              <Input
                type="date"
                data-testid="edit-import-date-input"
                value={importDate}
                onChange={(e) => setImportDate(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Nguồn tiền
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentSource('CASH_DRAWER')}
                  className={cn(
                    'rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors',
                    paymentSource === 'CASH_DRAWER'
                      ? 'border-primary bg-primary/10 text-accent-text'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  Tiền két
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource('EXTERNAL')}
                  className={cn(
                    'rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors',
                    paymentSource === 'EXTERNAL'
                      ? 'border-primary bg-primary/10 text-accent-text'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  Quỹ ngoài
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Ghi chú
            </label>
            <Input
              data-testid="edit-import-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú phiếu nhập..."
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Thành tiền sau cập nhật:</span>
            <span className="font-bold text-price tabular-nums">
              {previewTotal.toLocaleString('vi-VN')} đ
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            type="button"
            data-testid="confirm-edit-import-btn"
            disabled={updateMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
