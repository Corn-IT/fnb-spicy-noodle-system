import {
  CreateDiscountSchema,
  type CreateDiscountInput,
  type DiscountRecord,
  type DiscountScope,
  type DiscountValueType,
  type UpdateDiscountInput,
  UpdateDiscountSchema,
} from '@fnb/shared';
import { Lock, Tag } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';

import {
  useDiscountCategoriesQuery,
  useDiscountProductsQuery,
} from '../api/discounts.api';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 7, label: 'CN' },
] as const;

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function toIsoOrNull(localVal: string): string | null {
  const trimmed = localVal.trim();
  if (!trimmed) return null;
  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function parseOptionalNumber(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) && num > 0 ? num : NaN;
}

export interface DiscountFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDiscount: DiscountRecord | null;
  isSubmitting: boolean;
  onSubmitCreate: (payload: CreateDiscountInput) => Promise<void>;
  onSubmitUpdate: (id: number, payload: UpdateDiscountInput) => Promise<void>;
}

export function DiscountFormDrawer({
  open,
  onOpenChange,
  editingDiscount,
  isSubmitting,
  onSubmitCreate,
  onSubmitUpdate,
}: DiscountFormDrawerProps) {
  const isLocked = Boolean(editingDiscount?.isLocked);

  const { data: categoriesRes } = useDiscountCategoriesQuery(open);
  const { data: productsRes = [] } = useDiscountProductsQuery(open);
  const categories = categoriesRes ?? [];

  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [valueType, setValueType] = React.useState<DiscountValueType>('PERCENT');
  const [value, setValue] = React.useState('');
  const [maxDiscountAmount, setMaxDiscountAmount] = React.useState('');
  const [scope, setScope] = React.useState<DiscountScope>('ORDER');
  const [targetCategoryIds, setTargetCategoryIds] = React.useState<number[]>([]);
  const [targetProductIds, setTargetProductIds] = React.useState<number[]>([]);
  const [minOrderAmount, setMinOrderAmount] = React.useState('');
  const [startsAt, setStartsAt] = React.useState('');
  const [endsAt, setEndsAt] = React.useState('');
  const [activeWeekdays, setActiveWeekdays] = React.useState<number[]>([]);
  const [timeWindowStart, setTimeWindowStart] = React.useState('');
  const [timeWindowEnd, setTimeWindowEnd] = React.useState('');
  const [usageLimit, setUsageLimit] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [targetFilter, setTargetFilter] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFormError(null);
    setTargetFilter('');

    if (editingDiscount) {
      setCode(editingDiscount.code);
      setName(editingDiscount.name);
      setValueType(editingDiscount.valueType);
      setValue(String(editingDiscount.value));
      setMaxDiscountAmount(
        editingDiscount.maxDiscountAmount !== null ? String(editingDiscount.maxDiscountAmount) : '',
      );
      setScope(editingDiscount.scope);
      setTargetCategoryIds([...editingDiscount.targetCategoryIds]);
      setTargetProductIds([...editingDiscount.targetProductIds]);
      setMinOrderAmount(
        editingDiscount.minOrderAmount !== null ? String(editingDiscount.minOrderAmount) : '',
      );
      setStartsAt(toLocalDatetimeInput(editingDiscount.startsAt));
      setEndsAt(toLocalDatetimeInput(editingDiscount.endsAt));
      setActiveWeekdays([...editingDiscount.activeWeekdays]);
      setTimeWindowStart(editingDiscount.timeWindowStart ?? '');
      setTimeWindowEnd(editingDiscount.timeWindowEnd ?? '');
      setUsageLimit(editingDiscount.usageLimit !== null ? String(editingDiscount.usageLimit) : '');
      setIsActive(editingDiscount.isActive);
    } else {
      setCode('');
      setName('');
      setValueType('PERCENT');
      setValue('');
      setMaxDiscountAmount('');
      setScope('ORDER');
      setTargetCategoryIds([]);
      setTargetProductIds([]);
      setMinOrderAmount('');
      setStartsAt('');
      setEndsAt('');
      setActiveWeekdays([]);
      setTimeWindowStart('');
      setTimeWindowEnd('');
      setUsageLimit('');
      setIsActive(true);
    }
  }, [open, editingDiscount]);

  const toggleWeekday = (day: number) => {
    setActiveWeekdays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const toggleCategoryId = (id: number) => {
    if (isLocked) return;
    setTargetCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleProductId = (id: number) => {
    if (isLocked) return;
    setTargetProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const filteredProducts = React.useMemo(() => {
    if (!targetFilter.trim()) return productsRes;
    return productsRes.filter((p) =>
      matchesVietnameseQuery(targetFilter, p.name, p.categoryName),
    );
  }, [productsRes, targetFilter]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setFormError('Vui lòng nhập giá trị giảm hợp lệ lớn hơn 0.');
      return;
    }

    const parsedMax = valueType === 'PERCENT' ? parseOptionalNumber(maxDiscountAmount) : null;
    if (valueType === 'PERCENT' && Number.isNaN(parsedMax)) {
      setFormError('Mức giảm tối đa phải lớn hơn 0 đ (hoặc để trống nếu không giới hạn).');
      return;
    }

    const parsedMinOrder = parseOptionalNumber(minOrderAmount);
    if (Number.isNaN(parsedMinOrder)) {
      setFormError('Đơn tối thiểu phải lớn hơn 0 đ (hoặc để trống).');
      return;
    }

    const parsedUsageLimit = usageLimit.trim() ? Number(usageLimit.trim()) : null;
    if (
      parsedUsageLimit !== null &&
      (!Number.isInteger(parsedUsageLimit) || parsedUsageLimit <= 0)
    ) {
      setFormError('Giới hạn lượt sử dụng phải là số nguyên dương.');
      return;
    }

    const rawPayload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      valueType,
      value: parsedValue,
      maxDiscountAmount: parsedMax,
      scope,
      targetCategoryIds: scope === 'CATEGORY' ? targetCategoryIds : [],
      targetProductIds: scope === 'PRODUCT' ? targetProductIds : [],
      minOrderAmount: parsedMinOrder,
      startsAt: toIsoOrNull(startsAt),
      endsAt: toIsoOrNull(endsAt),
      activeWeekdays,
      timeWindowStart: timeWindowStart.trim() ? timeWindowStart.trim().slice(0, 5) : null,
      timeWindowEnd: timeWindowEnd.trim() ? timeWindowEnd.trim().slice(0, 5) : null,
      usageLimit: parsedUsageLimit,
      isActive,
    };

    const schema = editingDiscount ? UpdateDiscountSchema : CreateDiscountSchema;
    const validation = schema.safeParse(rawPayload);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      setFormError(firstIssue?.message ?? 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    if (editingDiscount) {
      await onSubmitUpdate(editingDiscount.id, validation.data as UpdateDiscountInput);
    } else {
      await onSubmitCreate(validation.data as CreateDiscountInput);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        data-testid="discount-form-drawer"
      >
        <SheetHeader className="shrink-0 space-y-1 border-b border-border bg-card px-5 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-base font-bold sm:text-lg">
            <Tag className="h-5 w-5 shrink-0 text-accent-text" />
            <span className="truncate">
              {editingDiscount
                ? `Chỉnh sửa mã giảm giá — ${editingDiscount.code}`
                : 'Tạo mã giảm giá mới'}
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Cấu hình giảm giá theo Phần trăm / Tiền cố định cho Toàn đơn, Danh mục hoặc Món ăn cụ thể.
          </SheetDescription>
        </SheetHeader>

        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain touch-pan-y p-5">
          {isLocked ? (
            <div
              data-testid="discount-locked-banner"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Mã giảm giá đã có {editingDiscount?.usedCount ?? 0} lượt áp dụng trên hoá đơn thanh toán nên khoá chỉnh sửa Mã code, Giá trị giảm, Phạm vi áp dụng và Đơn tối thiểu. Bạn vẫn có thể sửa Tên, Thời hạn, Khung giờ, Giới hạn lượt hoặc Bật/Tắt mã.
              </span>
            </div>
          ) : null}

          {formError ? (
            <div
              data-testid="discount-form-error"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300"
            >
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Mã giảm giá (Code) <span className="text-red-500">*</span>
              </label>
              <Input
                data-testid="discount-code-input"
                value={code}
                disabled={isLocked || isSubmitting}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                placeholder="VD: GIAM10, HAPPY5K"
                maxLength={32}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                3–32 ký tự chữ hoa, số, dấu gạch ngang (-) hoặc gạch dưới (_).
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Tên chương trình <span className="text-red-500">*</span>
              </label>
              <Input
                data-testid="discount-name-input"
                value={name}
                disabled={isSubmitting}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Giảm 10% tối đa 20k"
                maxLength={128}
              />
            </div>
          </div>

          {/* Value type + numeric value + optional max cap */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Hình thức giảm
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'PERCENT', label: 'Theo phần trăm (%)' },
                    { key: 'FIXED', label: 'Tiền mặt trực tiếp (đ)' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={isLocked || isSubmitting}
                    data-testid={`discount-value-type-${item.key}`}
                    onClick={() => setValueType(item.key)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60',
                      valueType === item.key
                        ? 'border-primary bg-primary/10 text-accent-text'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  {valueType === 'PERCENT'
                    ? 'Phần trăm giảm (%) *'
                    : scope === 'ORDER'
                      ? 'Số tiền giảm cả đơn (đ) *'
                      : 'Số tiền giảm mỗi phần (đ) *'}
                </label>
                <Input
                  type="number"
                  min={valueType === 'PERCENT' ? 0.01 : 1}
                  max={valueType === 'PERCENT' ? 100 : undefined}
                  step="any"
                  data-testid="discount-value-input"
                  value={value}
                  disabled={isLocked || isSubmitting}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={valueType === 'PERCENT' ? 'VD: 10' : 'VD: 20000'}
                />
                {valueType === 'FIXED' && Number(value) > 0 ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    = {Number(value).toLocaleString('vi-VN')} đ
                  </p>
                ) : null}
              </div>

              {valueType === 'PERCENT' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-foreground">
                    Giảm tối đa toàn đơn (đ)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    data-testid="discount-max-amount-input"
                    value={maxDiscountAmount}
                    disabled={isLocked || isSubmitting}
                    onChange={(e) => setMaxDiscountAmount(e.target.value)}
                    placeholder="Để trống = không giới hạn"
                  />
                  {Number(maxDiscountAmount) > 0 ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      Trần tối đa: {Number(maxDiscountAmount).toLocaleString('vi-VN')} đ
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Scope selector & target pickers */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Phạm vi áp dụng
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'ORDER', label: 'Tổng hoá đơn' },
                    { key: 'CATEGORY', label: 'Theo danh mục' },
                    { key: 'PRODUCT', label: 'Theo món cụ thể' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={isLocked || isSubmitting}
                    data-testid={`discount-scope-${item.key}`}
                    onClick={() => setScope(item.key)}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-60',
                      scope === item.key
                        ? 'border-primary bg-primary/10 text-accent-text'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {scope === 'CATEGORY' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    Chọn danh mục món áp dụng ({targetCategoryIds.length} đã chọn)
                  </span>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background p-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {categories.map((cat) => {
                    const checked = targetCategoryIds.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isLocked || isSubmitting}
                          onCheckedChange={() => toggleCategoryId(cat.id)}
                        />
                        <span className="truncate">{cat.name}</span>
                      </label>
                    );
                  })}
                  {categories.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Không có danh mục món nào.</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {scope === 'PRODUCT' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    Chọn món áp dụng ({targetProductIds.length} đã chọn)
                  </span>
                  <Input
                    value={targetFilter}
                    onChange={(e) => setTargetFilter(e.target.value)}
                    placeholder="Lọc nhanh tên món..."
                    className="h-7 w-44 text-xs"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-2 space-y-1">
                  {filteredProducts.map((prod) => {
                    const checked = targetProductIds.includes(prod.id);
                    return (
                      <label
                        key={prod.id}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={checked}
                            disabled={isLocked || isSubmitting}
                            onCheckedChange={() => toggleProductId(prod.id)}
                          />
                          <span className="truncate font-medium">{prod.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {prod.price.toLocaleString('vi-VN')} đ
                        </span>
                      </label>
                    );
                  })}
                  {filteredProducts.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Không tìm thấy món phù hợp.</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Conditions: minOrderAmount, usageLimit, date range, weekdays, time window */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Đơn tối thiểu (đ)
              </label>
              <Input
                type="number"
                min={1}
                step="any"
                data-testid="discount-min-order-input"
                value={minOrderAmount}
                disabled={isLocked || isSubmitting}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                placeholder="Để trống = không yêu cầu"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Giới hạn tổng số lượt dùng
              </label>
              <Input
                type="number"
                min={editingDiscount?.usedCount && editingDiscount.usedCount > 0 ? editingDiscount.usedCount : 1}
                step={1}
                data-testid="discount-usage-limit-input"
                value={usageLimit}
                disabled={isSubmitting}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="Để trống = không giới hạn"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Bắt đầu từ ngày giờ
              </label>
              <Input
                type="datetime-local"
                data-testid="discount-starts-at-input"
                value={startsAt}
                disabled={isSubmitting}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Kết thúc lúc ngày giờ
              </label>
              <Input
                type="datetime-local"
                data-testid="discount-ends-at-input"
                value={endsAt}
                disabled={isSubmitting}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Khung giờ bắt đầu (HH:mm)
              </label>
              <Input
                type="time"
                data-testid="discount-time-start-input"
                value={timeWindowStart}
                disabled={isSubmitting}
                onChange={(e) => setTimeWindowStart(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Khung giờ kết thúc (HH:mm)
              </label>
              <Input
                type="time"
                data-testid="discount-time-end-input"
                value={timeWindowEnd}
                disabled={isSubmitting}
                onChange={(e) => setTimeWindowEnd(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Ngày áp dụng trong tuần (không chọn = áp dụng cả tuần)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_OPTIONS.map((wd) => {
                const selected = activeWeekdays.includes(wd.value);
                return (
                  <button
                    key={wd.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => toggleWeekday(wd.value)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium">
            <Checkbox
              checked={isActive}
              disabled={isSubmitting}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
            />
            <span>Kích hoạt mã ngay sau khi lưu</span>
          </label>
          </div>

          <SheetFooter className="mt-0 flex shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="submit"
              data-testid="submit-discount-btn"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Đang lưu...'
                : editingDiscount
                  ? 'Lưu thay đổi'
                  : 'Tạo mã giảm giá'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
