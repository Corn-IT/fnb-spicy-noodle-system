import {
  type CreateProductInput,
  type MdmItem,
  type Product,
  type ProductStation,
} from '@fnb/shared';
import {
  CheckSquare,
  Flame,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
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
  useCreateProductMutation,
  useUpdateProductMutation,
} from '../api/menu-admin.api';

interface EditableModifier {
  name: string;
  extraPrice: number;
  isDefaultChecked: boolean;
  defaultSubstituteName: string;
}

interface EditableModifierGroup {
  name: string;
  isRequired: boolean;
  maxSelect: number;
  isAutoSelect: boolean;
  allowSubstitution: boolean;
  modifiers: EditableModifier[];
}

interface EditableComboItem {
  productId: number;
  quantity: number;
}

interface ProductFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  allProducts: Product[];
  categories: MdmItem[];
  onOpenCategoryManager: () => void;
}

const STATION_OPTIONS: { value: ProductStation; label: string; desc: string }[] = [
  { value: 'BEP_NAU', label: 'Bếp nấu', desc: 'Mì cay, Bánh mì chảo, Lẩu...' },
  { value: 'BEP_CHIEN', label: 'Bếp chiên', desc: 'Khoai tây, Phô mai que, Cá viên...' },
  { value: 'PHA_CHE', label: 'Pha chế', desc: 'Trà đào, Trà sữa, Nước ngọt...' },
  { value: 'COMBO', label: 'Combo', desc: 'Tự động tách phiếu về 3 bếp' },
];

export function ProductFormDrawer({
  open,
  onOpenChange,
  editingProduct,
  allProducts,
  categories,
  onOpenCategoryManager,
}: ProductFormDrawerProps) {
  const [name, setName] = React.useState('');
  const [subtitle, setSubtitle] = React.useState('');
  const [station, setStation] = React.useState<ProductStation>('BEP_NAU');
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [price, setPrice] = React.useState<string>('45000');
  const [sortOrder, setSortOrder] = React.useState<string>('1');
  const [isAvailable, setIsAvailable] = React.useState<boolean>(true);
  const [modifierGroups, setModifierGroups] = React.useState<EditableModifierGroup[]>([]);
  const [comboItems, setComboItems] = React.useState<EditableComboItem[]>([]);

  const createMutation = useCreateProductMutation();
  const updateMutation = useUpdateProductMutation();

  const physicalProducts = React.useMemo(
    () => allProducts.filter((p) => p.station !== 'COMBO' && p.id !== editingProduct?.id),
    [allProducts, editingProduct],
  );

  React.useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      setName(editingProduct.name);
      setSubtitle(editingProduct.subtitle ?? '');
      setStation(editingProduct.station);
      setCategoryId(editingProduct.categoryId ?? null);
      setPrice(String(editingProduct.price));
      setSortOrder(String(editingProduct.sortOrder));
      setIsAvailable(editingProduct.isAvailable);
      setModifierGroups(
        editingProduct.modifierGroups.map((g) => ({
          name: g.name,
          isRequired: g.isRequired,
          maxSelect: g.maxSelect,
          isAutoSelect: g.isAutoSelect ?? false,
          allowSubstitution: g.allowSubstitution ?? false,
          modifiers: g.modifiers.map((m) => ({
            name: m.name,
            extraPrice: m.extraPrice,
            isDefaultChecked: m.isDefaultChecked ?? false,
            defaultSubstituteName: m.defaultSubstituteName ?? '',
          })),
        })),
      );
      setComboItems(
        editingProduct.comboItems.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
        })),
      );
    } else {
      setName('');
      setSubtitle('');
      setStation('BEP_NAU');
      const firstCat = categories.find((c) => c.metadata?.defaultStation === 'BEP_NAU') ?? categories[0];
      setCategoryId(firstCat ? firstCat.id : null);
      setPrice('69000');
      setSortOrder(String(allProducts.length + 1));
      setIsAvailable(true);
      setModifierGroups([]);
      setComboItems([]);
    }
  }, [open, editingProduct, categories, allProducts.length]);

  const handleCategoryChange = (nextCategoryId: number | null) => {
    setCategoryId(nextCategoryId);
    if (nextCategoryId !== null) {
      const matched = categories.find((c) => c.id === nextCategoryId);
      const defaultStation = matched?.metadata?.defaultStation;
      if (
        defaultStation === 'BEP_NAU' ||
        defaultStation === 'BEP_CHIEN' ||
        defaultStation === 'PHA_CHE' ||
        defaultStation === 'COMBO'
      ) {
        setStation(defaultStation);
      }
    }
  };

  // Preset Group Helpers
  const addPresetSpiceGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Cấp độ cay',
        isRequired: true,
        maxSelect: 1,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: Array.from({ length: 7 }, (_, i) => ({
          name: `Cấp ${i + 1}`,
          extraPrice: 0,
          isDefaultChecked: false,
          defaultSubstituteName: '',
        })),
      },
    ]);
  };

  const addPresetDefaultGarnishGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Đồ ăn mặc định (0đ)',
        isRequired: false,
        maxSelect: 6,
        isAutoSelect: true,
        allowSubstitution: false,
        modifiers: ['Tôm viên', 'Xúc xích', 'Ngô', 'Rau', 'Nấm kim châm', 'Kim chi'].map(
          (item) => ({
            name: item,
            extraPrice: 0,
            isDefaultChecked: true,
            defaultSubstituteName: '',
          }),
        ),
      },
    ]);
  };

  const addPresetMainIngredientSubstitutionGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Đồ ăn chính của món',
        isRequired: false,
        maxSelect: 3,
        isAutoSelect: true,
        allowSubstitution: true,
        modifiers: [
          { name: 'Tôm', extraPrice: 0, isDefaultChecked: true, defaultSubstituteName: 'Mực' },
          { name: 'Ngao', extraPrice: 0, isDefaultChecked: true, defaultSubstituteName: 'Mực' },
          { name: 'Mực', extraPrice: 0, isDefaultChecked: true, defaultSubstituteName: 'Tôm' },
        ],
      },
    ]);
  };

  const addPresetExtraToppingGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'Đồ ăn thêm',
        isRequired: false,
        maxSelect: 10,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: [
          { name: 'Xúc xích', extraPrice: 5000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Tôm viên', extraPrice: 5000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Đậu hũ', extraPrice: 5000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Bò Mỹ', extraPrice: 10000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Sườn sụn', extraPrice: 10000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Ngao', extraPrice: 5000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Tôm', extraPrice: 10000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Mực', extraPrice: 10000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Kim chi', extraPrice: 5000, isDefaultChecked: false, defaultSubstituteName: '' },
          { name: 'Nấm kim châm', extraPrice: 5000, isDefaultChecked: false, defaultSubstituteName: '' },
        ],
      },
    ]);
  };

  const addBlankGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: '',
        isRequired: false,
        maxSelect: 1,
        isAutoSelect: false,
        allowSubstitution: false,
        modifiers: [
          { name: '', extraPrice: 0, isDefaultChecked: false, defaultSubstituteName: '' },
        ],
      },
    ]);
  };

  const updateGroup = (index: number, patch: Partial<EditableModifierGroup>) => {
    setModifierGroups((prev) =>
      prev.map((group, idx) => {
        if (idx !== index) return group;
        const updated = { ...group, ...patch };
        if (patch.isAutoSelect !== undefined) {
          updated.modifiers = updated.modifiers.map((m) => ({
            ...m,
            isDefaultChecked: Boolean(patch.isAutoSelect),
          }));
          if (patch.isAutoSelect && updated.maxSelect < updated.modifiers.length) {
            updated.maxSelect = Math.max(updated.modifiers.length, 1);
          }
        }
        if (patch.allowSubstitution) {
          updated.isAutoSelect = true;
          updated.modifiers = updated.modifiers.map((m) => ({
            ...m,
            isDefaultChecked: true,
          }));
          updated.maxSelect = Math.max(updated.modifiers.length, 1);
        }
        return updated;
      }),
    );
  };

  const removeGroup = (index: number) => {
    setModifierGroups((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addModifierToGroup = (groupIdx: number) => {
    setModifierGroups((prev) =>
      prev.map((group, idx) => {
        if (idx !== groupIdx) return group;
        const nextModifiers = [
          ...group.modifiers,
          {
            name: '',
            extraPrice: 0,
            isDefaultChecked: group.isAutoSelect,
            defaultSubstituteName: '',
          },
        ];
        return {
          ...group,
          maxSelect: group.isAutoSelect
            ? Math.max(group.maxSelect, nextModifiers.length)
            : group.maxSelect,
          modifiers: nextModifiers,
        };
      }),
    );
  };

  const updateModifier = (
    groupIdx: number,
    modIdx: number,
    patch: Partial<EditableModifier>,
  ) => {
    setModifierGroups((prev) =>
      prev.map((group, gIdx) => {
        if (gIdx !== groupIdx) return group;
        return {
          ...group,
          modifiers: group.modifiers.map((m, mIdx) =>
            mIdx === modIdx ? { ...m, ...patch } : m,
          ),
        };
      }),
    );
  };

  const removeModifier = (groupIdx: number, modIdx: number) => {
    setModifierGroups((prev) =>
      prev.map((group, gIdx) => {
        if (gIdx !== groupIdx) return group;
        return {
          ...group,
          modifiers: group.modifiers.filter((_, mIdx) => mIdx !== modIdx),
        };
      }),
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Vui lòng nhập tên sản phẩm' });
      return;
    }

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      toast({ variant: 'destructive', title: 'Đơn giá bán không hợp lệ' });
      return;
    }

    if (station === 'COMBO' && comboItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Món Combo phải có ít nhất 1 món thành phần thuộc bếp thực',
      });
      return;
    }

    for (const group of modifierGroups) {
      if (!group.name.trim()) {
        toast({ variant: 'destructive', title: 'Vui lòng nhập tên cho tất cả nhóm tuỳ chọn' });
        return;
      }
      if (group.modifiers.length === 0 || group.modifiers.some((m) => !m.name.trim())) {
        toast({
          variant: 'destructive',
          title: `Nhóm "${group.name}" có tuỳ chọn chưa nhập tên`,
        });
        return;
      }
    }

    const payload: CreateProductInput = {
      name: trimmedName,
      subtitle: subtitle.trim() ? subtitle.trim() : null,
      categoryId,
      price: numericPrice,
      station,
      isAvailable,
      sortOrder: Math.max(0, Number.parseInt(sortOrder || '0', 10) || 0),
      comboItems: station === 'COMBO' ? comboItems : [],
      modifierGroups: modifierGroups.map((group) => ({
        name: group.name.trim(),
        isRequired: group.isRequired,
        maxSelect: Math.max(1, Number(group.maxSelect) || 1),
        isAutoSelect: group.isAutoSelect,
        allowSubstitution: group.allowSubstitution,
        modifiers: group.modifiers.map((m) => ({
          name: m.name.trim(),
          extraPrice: Math.max(0, Number(m.extraPrice) || 0),
          isDefaultChecked: m.isDefaultChecked,
          defaultSubstituteName: m.defaultSubstituteName.trim()
            ? m.defaultSubstituteName.trim()
            : null,
        })),
      })),
    };

    try {
      if (editingProduct) {
        await updateMutation.mutateAsync({ id: editingProduct.id, body: payload });
        toast({
          variant: 'success',
          title: 'Đã cập nhật sản phẩm',
          description: `${trimmedName} đã đồng bộ sang Thực đơn gọi món nhanh & QR.`,
        });
      } else {
        await createMutation.mutateAsync(payload);
        toast({
          variant: 'success',
          title: 'Đã thêm món mới vào Thực đơn',
          description: `${trimmedName} đã sẵn sàng trên màn hình POS & QR.`,
        });
      }
      onOpenChange(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Không thể lưu cấu hình sản phẩm';
      toast({ variant: 'destructive', title: 'Lưu thất bại', description: msg });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl p-0 gap-0 overflow-hidden flex flex-col h-dvh"
        data-testid="product-form-drawer"
      >
        <SheetHeader className="p-4 sm:p-5 border-b border-border bg-card shrink-0 pr-12">
          <SheetTitle className="text-base sm:text-xl font-bold leading-snug">
            {editingProduct ? `Cấu hình món: ${editingProduct.name}` : 'Thêm món mới vào Thực đơn'}
          </SheetTitle>
          <SheetDescription className="text-xs sm:text-sm">
            Thiết lập Phân cấp 3 tầng (Khu vực Bếp → Danh mục con → Sản phẩm + Subtitle động) và các nhóm tuỳ chọn linh hoạt.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-6 space-y-5">
          {/* PHẦN 1: THÔNG TIN CƠ BẢN & PHÂN CẤP 3 TẦNG */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              <span>1. Phân cấp Menu & Thông tin gốc</span>
            </h3>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-xs font-bold text-foreground">
                {isAvailable ? 'Đang mở bán' : 'Tạm hết món'}
              </span>
            </label>
          </div>

          {/* Tầng 1: Khu vực Bếp */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Tầng 1 — Khu vực Bếp (Quyết định trạm in nhiệt 80mm)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`product-station-${opt.value}`}
                  onClick={() => setStation(opt.value)}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                    station === opt.value
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  <span className="text-xs font-bold text-foreground">{opt.label}</span>
                  <span className="text-[11px] leading-tight mt-0.5 line-clamp-1">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tầng 2: Danh mục con MDM */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Tầng 2 — Danh mục con (MDM)
                </label>
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  + Quản lý danh mục con
                </button>
              </div>
              <select
                data-testid="product-category-select"
                value={categoryId ?? ''}
                onChange={(e) =>
                  handleCategoryChange(e.target.value ? Number(e.target.value) : null)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Chưa phân nhóm danh mục con --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Đơn giá gốc (VNĐ) *
              </label>
              <Input
                type="number"
                min={0}
                step={1000}
                data-testid="product-price-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="VD: 79000"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Thứ tự</label>
              <Input
                type="number"
                min={0}
                data-testid="product-sort-input"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>

          {/* Tầng 3: Tên sản phẩm & Subtitle động */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Tầng 3 — Tên sản phẩm *
              </label>
              <Input
                data-testid="product-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Mì cay hải sản"
              />
            </div>

            <div className="sm:col-span-6 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Mô tả phụ / Subtitle động (hiển thị trong ngoặc)
              </label>
              <Input
                data-testid="product-subtitle-input"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="VD: Ngao, tôm, mực"
              />
            </div>
          </div>

          {name.trim() ? (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-semibold">Xem trước hiển thị:</span>
              <span className="font-bold text-foreground">
                {name.trim()}
                {subtitle.trim() ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({subtitle.trim()})
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>

        {/* PHẦN COMBO (NẾU LÀ TRẠM COMBO) */}
        {station === 'COMBO' ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Cấu hình Món thành phần Combo (Bắt buộc)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Khi bấm Tách Bếp, Combo sẽ tự động phân rã về đúng Bếp Nấu, Bếp Chiên, Pha Chế.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const first = physicalProducts[0];
                  if (!first) return;
                  setComboItems((prev) => [...prev, { productId: first.id, quantity: 1 }]);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm thành phần</span>
              </Button>
            </div>

            <div className="space-y-2">
              {comboItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const nextId = Number(e.target.value);
                      setComboItems((prev) =>
                        prev.map((c, cIdx) => (cIdx === idx ? { ...c, productId: nextId } : c)),
                      );
                    }}
                    className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {physicalProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.station})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const qty = Math.max(1, Number(e.target.value) || 1);
                      setComboItems((prev) =>
                        prev.map((c, cIdx) => (cIdx === idx ? { ...c, quantity: qty } : c)),
                      );
                    }}
                    className="w-20 h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-destructive"
                    onClick={() =>
                      setComboItems((prev) => prev.filter((_, cIdx) => cIdx !== idx))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* PHẦN 2: CẤU HÌNH NHÓM TUỲ CHỌN ĐỘNG */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-2xs">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span>2. Các Nhóm Tuỳ Chọn Trong Sản Phẩm ({modifierGroups.length})</span>
              </h3>
              <Button
                type="button"
                size="sm"
                data-testid="add-blank-modifier-group-btn"
                onClick={addBlankGroup}
                className="font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tự thêm nhóm tuỳ chọn</span>
              </Button>
            </div>

            {/* Thanh mẫu tạo nhanh 1 chạm */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                Chèn mẫu nhanh:
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetSpiceGroup}
              >
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                <span>+ Cấp độ cay (1–7)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetDefaultGarnishGroup}
              >
                <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span>+ Đồ ăn mặc định (0đ - Auto bật)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetMainIngredientSubstitutionGroup}
              >
                <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                <span>+ Đồ ăn chính (Đổi món thông minh)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={addPresetExtraToppingGroup}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>+ Đồ ăn thêm (+Giá)</span>
              </Button>
            </div>
          </div>

          {modifierGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Sản phẩm này chưa có nhóm tuỳ chọn nào. Bạn có thể bấm các nút <strong>Chèn mẫu nhanh</strong> phía trên hoặc <strong>Tự thêm nhóm tuỳ chọn</strong>.
            </div>
          ) : (
            <div className="space-y-4">
              {modifierGroups.map((group, gIdx) => (
                <div
                  key={gIdx}
                  className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3"
                  data-testid={`modifier-group-card-${gIdx}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 flex-1">
                      <div className="sm:col-span-6">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Tên nhóm tuỳ chọn #{gIdx + 1}
                        </label>
                        <Input
                          value={group.name}
                          onChange={(e) => updateGroup(gIdx, { name: e.target.value })}
                          placeholder="VD: Cấp độ cay, Đồ ăn mặc định (0đ), Đồ ăn thêm..."
                          className="h-9 mt-0.5 font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Số lượng chọn tối đa
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={group.maxSelect}
                          onChange={(e) =>
                            updateGroup(gIdx, {
                              maxSelect: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="h-9 mt-0.5"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-end pb-1">
                        <Badge variant="secondary" className="text-xs">
                          {group.maxSelect === 1 ? 'Chọn 1 ( Đơn )' : `Chọn tối đa ${group.maxSelect}`}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive shrink-0"
                      onClick={() => removeGroup(gIdx)}
                      title="Xoá nhóm tuỳ chọn này"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Các cờ điều khiển thông minh của nhóm */}
                  <div className="flex flex-wrap items-center gap-4 rounded-lg bg-background/80 px-3 py-2 border border-border/60 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={group.isRequired}
                        onChange={(e) =>
                          updateGroup(gIdx, { isRequired: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="font-semibold">Bắt buộc chọn</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={group.isAutoSelect}
                        onChange={(e) =>
                          updateGroup(gIdx, { isAutoSelect: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Auto bật (Tự động tích sẵn tất cả khi mở món)
                      </span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={group.allowSubstitution}
                        onChange={(e) =>
                          updateGroup(gIdx, { allowSubstitution: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="font-semibold text-blue-700 dark:text-blue-400">
                         Logic đổi món chính (Bỏ tích tự động thay bằng món còn lại)
                      </span>
                    </label>
                  </div>

                  {/* Danh sách từng Line Item trong nhóm */}
                  <div className="space-y-2">
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <div className={group.allowSubstitution ? 'sm:col-span-4' : 'sm:col-span-5'}>
                        Tên tuỳ chọn
                      </div>
                      <div className={group.allowSubstitution ? 'sm:col-span-2' : 'sm:col-span-4'}>
                        Đơn giá cộng thêm
                      </div>
                      {group.allowSubstitution ? (
                        <div className="sm:col-span-3">Món thay thế mặc định</div>
                      ) : null}
                      <div className="sm:col-span-2 text-center">Auto bật</div>
                      <div className="sm:col-span-1 text-right">Xoá</div>
                    </div>

                    {group.modifiers.map((mod, mIdx) => (
                      <div
                        key={mIdx}
                        className="rounded-lg border border-border/60 bg-background/70 p-2.5 sm:p-0 sm:border-0 sm:bg-transparent grid grid-cols-12 items-center gap-2"
                      >
                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-12 sm:col-span-4'
                              : 'col-span-7 sm:col-span-5'
                          }
                        >
                          <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-0.5">
                            Tên tuỳ chọn #{mIdx + 1}
                          </span>
                          <Input
                            value={mod.name}
                            onChange={(e) =>
                              updateModifier(gIdx, mIdx, { name: e.target.value })
                            }
                            placeholder="Tên món (VD: Tôm, Xúc xích, Cấp 1)..."
                            className="h-8 text-xs"
                          />
                        </div>

                        <div
                          className={
                            group.allowSubstitution
                              ? 'col-span-5 sm:col-span-2'
                              : 'col-span-5 sm:col-span-4'
                          }
                        >
                          <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-0.5">
                            Giá thêm (đ)
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step={1000}
                            value={mod.extraPrice}
                            onChange={(e) =>
                              updateModifier(gIdx, mIdx, {
                                extraPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            placeholder="0"
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        {group.allowSubstitution ? (
                          <div className="col-span-7 sm:col-span-3">
                            <span className="block sm:hidden text-[10px] font-semibold text-muted-foreground mb-0.5">
                              Thay thế mặc định
                            </span>
                            <Input
                              value={mod.defaultSubstituteName}
                              onChange={(e) =>
                                updateModifier(gIdx, mIdx, {
                                  defaultSubstituteName: e.target.value,
                                })
                              }
                              placeholder="VD: Mực / Tôm"
                              className="h-8 text-xs"
                            />
                          </div>
                        ) : null}

                        <div className="col-span-8 sm:col-span-2 flex items-center sm:justify-center gap-1.5 pt-1 sm:pt-0">
                          <input
                            type="checkbox"
                            checked={mod.isDefaultChecked}
                            onChange={(e) =>
                              updateModifier(gIdx, mIdx, {
                                isDefaultChecked: e.target.checked,
                              })
                            }
                            title="Tự động tích chọn khi mở sản phẩm"
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          />
                          <span className="sm:hidden text-xs font-medium text-muted-foreground">
                            Tự động tích chọn (Auto bật)
                          </span>
                        </div>

                        <div className="col-span-4 sm:col-span-1 flex justify-end pt-1 sm:pt-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            disabled={group.modifiers.length <= 1}
                            onClick={() => removeModifier(gIdx, mIdx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs font-semibold"
                        onClick={() => addModifierToGroup(gIdx)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Thêm dòng tuỳ chọn</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        <SheetFooter className="p-3.5 sm:p-4 bg-card border-t border-border shrink-0 flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            data-testid="save-product-submit-btn"
            onClick={() => void handleSave()}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="font-bold"
          >
            {editingProduct ? 'Lưu cấu hình sản phẩm' : 'Tạo sản phẩm vào Thực đơn'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
