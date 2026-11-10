import { CreateInventoryImportBatchSchema, type PaymentSource } from '@fnb/shared';
import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  getBusinessDateIso,
  useCreateInventoryImportBatchMutation,
} from '@/features/inventory/api/inventory.api';
import {
  IngredientMdmCombobox,
  type SelectedIngredientValue,
} from '@/features/inventory/components/ingredient-mdm-combobox';
import { SupplierMdmCombobox } from '@/features/inventory/components/supplier-mdm-combobox';
import { cn } from '@/utils/cn';

export interface InventoryImportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DraftImportLine {
  key: string;
  ingredientMdmId?: number;
  ingredientName: string;
  unitName: string;
  unitPrice: string;
  quantity: string;
}

let rowCounter = 1;
function createEmptyLine(): DraftImportLine {
  rowCounter += 1;
  return {
    key: `line-${rowCounter}`,
    ingredientMdmId: undefined,
    ingredientName: '',
    unitName: '',
    unitPrice: '',
    quantity: '1',
  };
}

export function InventoryImportDrawer({
  open,
  onOpenChange,
}: InventoryImportDrawerProps) {
  const todayIso = React.useMemo(() => getBusinessDateIso(), []);
  const [importDate, setImportDate] = React.useState(todayIso);
  const [paymentSource, setPaymentSource] = React.useState<PaymentSource>('CASH_DRAWER');
  const [supplierMdmId, setSupplierMdmId] = React.useState<number | undefined>();
  const [supplierName, setSupplierName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [lines, setLines] = React.useState<DraftImportLine[]>(() => [createEmptyLine()]);

  const createBatchMutation = useCreateInventoryImportBatchMutation();

  React.useEffect(() => {
    if (open) {
      setImportDate(getBusinessDateIso());
      setPaymentSource('CASH_DRAWER');
      setSupplierMdmId(undefined);
      setSupplierName('');
      setNote('');
      setLines([createEmptyLine()]);
    }
  }, [open]);

  const handleSelectIngredient = (idx: number, selection: SelectedIngredientValue) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        return {
          ...line,
          ingredientMdmId: selection.ingredientMdmId,
          ingredientName: selection.ingredientName,
          unitName: selection.defaultUnit ?? line.unitName,
          unitPrice:
            selection.lastPrice !== undefined
              ? String(selection.lastPrice)
              : line.unitPrice,
        };
      }),
    );
  };

  const updateLineField = (
    idx: number,
    field: 'unitName' | 'unitPrice' | 'quantity',
    value: string,
  ) => {
    setLines((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)),
    );
  };

  const removeLine = (idx: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const batchTotal = React.useMemo(() => {
    return lines.reduce((sum, line) => {
      const price = Number(line.unitPrice) || 0;
      const qty = Number(line.quantity) || 0;
      return sum + Math.round(price * qty * 100) / 100;
    }, 0);
  }, [lines]);

  const handleSubmit = async () => {
    const payload = {
      importDate,
      paymentSource,
      supplierMdmId,
      supplierName: supplierName.trim(),
      note: note.trim() || undefined,
      items: lines.map((line) => ({
        ...(line.ingredientMdmId ? { ingredientMdmId: line.ingredientMdmId } : {}),
        ingredientName: line.ingredientName.trim(),
        unitName: line.unitName.trim(),
        unitPrice: Number(line.unitPrice),
        quantity: Number(line.quantity),
      })),
    };

    const parsed = CreateInventoryImportBatchSchema.safeParse(payload);
    if (!parsed.success) {
      toast({
        variant: 'destructive',
        title: 'Dữ liệu phiếu nhập chưa hợp lệ',
        description: 'Vui lòng chọn nhà cung cấp và điền đầy đủ nguyên liệu, ĐVT, đơn giá, số lượng.',
      });
      return;
    }

    try {
      await createBatchMutation.mutateAsync(parsed.data);
      toast({
        title: 'Đã lưu phiếu nhập hàng',
        description: `Đã nhập ${parsed.data.items.length} mặt hàng vào kho thành công.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Lỗi khi lưu phiếu nhập kho',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="inventory-import-drawer"
        className="w-full max-w-2xl sm:max-w-2xl flex flex-col p-0 overflow-hidden"
      >
        <SheetHeader className="p-5 border-b shrink-0 text-left bg-card pr-12">
          <SheetTitle>Thêm mới Phiếu Nhập hàng Nguyên vật liệu</SheetTitle>
          <SheetDescription>
            Chọn nguyên liệu có sẵn để tự điền ĐVT & đơn giá gần nhất, hoặc gõ tên mới để hệ thống tự
            chuẩn hoá lưu vào Master Data (MDM).
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Nhà cung cấp (MDM) *
            </label>
            <SupplierMdmCombobox
              value={supplierName}
              selectedId={supplierMdmId}
              onSelectSupplier={(selection) => {
                setSupplierMdmId(selection.supplierMdmId);
                setSupplierName(selection.supplierName);
              }}
            />
          </div>

          {/* Ngày nhập & Nguồn tiền */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Ngày nhập kho
              </label>
              <Input
                type="date"
                data-testid="import-date-input"
                value={importDate}
                onChange={(e) => setImportDate(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Nguồn tiền thanh toán
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="payment-source-CASH_DRAWER"
                  onClick={() => setPaymentSource('CASH_DRAWER')}
                  className={cn(
                    'rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                    paymentSource === 'CASH_DRAWER'
                      ? 'border-primary bg-primary/10 font-bold text-primary'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  <div>Tiền két (CASH_DRAWER)</div>
                  <div className="text-[10px] font-normal">Trừ vào tiền mặt kết ca</div>
                </button>
                <button
                  type="button"
                  data-testid="payment-source-EXTERNAL"
                  onClick={() => setPaymentSource('EXTERNAL')}
                  className={cn(
                    'rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                    paymentSource === 'EXTERNAL'
                      ? 'border-primary bg-primary/10 font-bold text-primary'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  <div>Quỹ ngoài (EXTERNAL)</div>
                  <div className="text-[10px] font-normal">Chủ CK • Không trừ két</div>
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Ghi chú chung phiếu nhập (tuỳ chọn)
              </label>
              <Input
                data-testid="import-batch-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Nhập rau nấm buổi sáng chợ đầu mối..."
              />
            </div>
          </div>

          {/* Danh sách dòng nguyên vật liệu */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">
                Danh sách mặt hàng ({lines.length} dòng)
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="add-import-row-btn"
                onClick={addLine}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>Thêm dòng hàng</span>
              </Button>
            </div>

            {lines.map((line, idx) => {
              const lineTotal =
                Math.round((Number(line.unitPrice) || 0) * (Number(line.quantity) || 0) * 100) /
                100;

              return (
                <div
                  key={line.key}
                  data-testid={`import-line-row-${idx}`}
                  className="space-y-2.5 rounded-xl border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase text-muted-foreground">
                      Dòng #{idx + 1}
                    </span>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid={`remove-import-row-btn-${idx}`}
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Tên nguyên liệu (MDM) *
                      </label>
                      <IngredientMdmCombobox
                        rowIndex={idx}
                        value={line.ingredientName}
                        selectedId={line.ingredientMdmId}
                        onSelectIngredient={(sel) => handleSelectIngredient(idx, sel)}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        ĐVT *
                      </label>
                      <Input
                        data-testid={`import-unit-input-${idx}`}
                        value={line.unitName}
                        onChange={(e) => updateLineField(idx, 'unitName', e.target.value)}
                        placeholder="Kg, Thùng..."
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Đơn giá (đ) *
                      </label>
                      <Input
                        type="number"
                        min={0}
                        data-testid={`import-price-input-${idx}`}
                        value={line.unitPrice}
                        onChange={(e) => updateLineField(idx, 'unitPrice', e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Số lượng *
                      </label>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        data-testid={`import-qty-input-${idx}`}
                        value={line.quantity}
                        onChange={(e) => updateLineField(idx, 'quantity', e.target.value)}
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t pt-1.5 text-xs">
                    <span className="text-muted-foreground">Thành tiền:</span>
                    <span
                      data-testid={`import-line-total-${idx}`}
                      className="font-bold text-primary"
                    >
                      {lineTotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-primary/5 p-3.5">
            <span className="text-sm font-semibold text-foreground">
              Tổng cộng phiếu nhập này:
            </span>
            <span data-testid="import-drawer-batch-total" className="text-lg font-extrabold text-primary">
              {batchTotal.toLocaleString('vi-VN')} đ
            </span>
          </div>
        </div>

        <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-4 font-semibold active:scale-[0.98]"
            onClick={() => onOpenChange(false)}
          >
            Huỷ bỏ
          </Button>
          <Button
            type="button"
            data-testid="submit-import-batch-btn"
            className="h-9 px-4 font-bold active:scale-[0.98] shadow-xs"
            disabled={createBatchMutation.isPending}
            onClick={handleSubmit}
          >
            Lưu phiếu nhập hàng
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
