import type { MdmItem, Product, ProductStation } from '@fnb/shared';
import { Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import type { KitchenStationOption } from '@/lib/menu-sync';
import type { EditableComboItem } from '../utils/product-modifier-presets';

interface ProductBasicInfoSectionProps {
  name: string;
  subtitle: string;
  station: ProductStation;
  categoryId: number | null;
  price: string;
  sortOrder: string;
  isAvailable: boolean;
  stations: KitchenStationOption[];
  categories: MdmItem[];
  onNameChange: (value: string) => void;
  onSubtitleChange: (value: string) => void;
  onStationChange: (station: ProductStation) => void;
  onCategoryChange: (categoryId: number | null) => void;
  onPriceChange: (value: string) => void;
  onSortOrderChange: (value: string) => void;
  onAvailableChange: (available: boolean) => void;
  onOpenCategoryManager: () => void;
  onOpenStationManager?: () => void;
}

/** 3-tier product classification, pricing, display order, and live preview section. */
export function ProductBasicInfoSection({
  name,
  subtitle,
  station,
  categoryId,
  price,
  sortOrder,
  isAvailable,
  stations,
  categories,
  onNameChange,
  onSubtitleChange,
  onStationChange,
  onCategoryChange,
  onPriceChange,
  onSortOrderChange,
  onAvailableChange,
  onOpenCategoryManager,
  onOpenStationManager,
}: ProductBasicInfoSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-2xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-accent-text" />
          <span>1. Phân cấp Menu & Thông tin gốc</span>
        </h3>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(e) => onAvailableChange(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-xs font-bold text-foreground">
            {isAvailable ? 'Đang mở bán' : 'Tạm hết món'}
          </span>
        </label>
      </div>

      {/* Tầng 1: Khu vực Bếp */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground">
            Tầng 1 — Khu vực Bếp (Quyết định trạm in nhiệt 80mm)
          </label>
          {onOpenStationManager ? (
            <button
              type="button"
              onClick={onOpenStationManager}
              className="text-xs font-bold text-accent-text hover:underline"
            >
              Quản lý khu vực bếp
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stations.map((opt) => (
            <button
              key={opt.code}
              type="button"
              data-testid={`product-station-${opt.code}`}
              onClick={() => onStationChange(opt.code)}
              className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                station === opt.code
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <span className="text-xs font-bold text-foreground">{opt.name}</span>
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
              className="text-xs font-bold text-accent-text hover:underline"
            >
              Quản lý danh mục con
            </button>
          </div>
          <select
            data-testid="product-category-select"
            value={categoryId ?? ''}
            onChange={(e) =>
              onCategoryChange(e.target.value ? Number(e.target.value) : null)
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
          <CurrencyInput
            data-testid="product-price-input"
            value={price}
            onValueChange={onPriceChange}
            placeholder="VD: 79.000"
            suffix="đ"
            className="h-10"
          />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Thứ tự</label>
          <Input
            type="number"
            min={0}
            data-testid="product-sort-input"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value)}
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
            onChange={(e) => onNameChange(e.target.value)}
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
            onChange={(e) => onSubtitleChange(e.target.value)}
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
  );
}

interface ProductComboSectionProps {
  comboItems: EditableComboItem[];
  physicalProducts: Product[];
  onComboItemsChange: React.Dispatch<React.SetStateAction<EditableComboItem[]>>;
}

/** Configures child physical items for a COMBO product that automatically decomposes on kitchen split. */
export function ProductComboSection({
  comboItems,
  physicalProducts,
  onComboItemsChange,
}: ProductComboSectionProps) {
  return (
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
            onComboItemsChange((prev) => [...prev, { productId: first.id, quantity: 1 }]);
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
                onComboItemsChange((prev) =>
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
                onComboItemsChange((prev) =>
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
                onComboItemsChange((prev) => prev.filter((_, cIdx) => cIdx !== idx))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
