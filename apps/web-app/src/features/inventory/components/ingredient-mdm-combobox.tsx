import { MdmCategory, type MdmItem } from '@fnb/shared';
import { Check, PlusCircle, Search } from 'lucide-react';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { isToastTarget } from '@/utils/toast-target';
import { useMdmLookupQuery } from '@/features/inventory/api/inventory.api';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';

export interface SelectedIngredientValue {
  ingredientMdmId?: number;
  ingredientName: string;
  defaultUnit?: string;
  lastPrice?: number;
}

export interface IngredientMdmComboboxProps {
  rowIndex: number;
  value: string;
  selectedId?: number;
  onSelectIngredient: (selection: SelectedIngredientValue) => void;
}

export function IngredientMdmCombobox({
  rowIndex,
  value,
  selectedId,
  onSelectIngredient,
}: IngredientMdmComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [queryText, setQueryText] = React.useState(value);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setQueryText(value);
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (isToastTarget(event.target)) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const { data: mdmRecords = [] } = useMdmLookupQuery(MdmCategory.INGREDIENT);
  const mdmItems = mdmRecords.filter((item) => item.category === MdmCategory.INGREDIENT);

  const filteredItems = React.useMemo(() => {
    if (!queryText.trim()) return mdmItems;
    return mdmItems.filter((item) =>
      matchesVietnameseQuery(queryText, item.name, item.normalizedName),
    );
  }, [mdmItems, queryText]);

  const exactMatchExists = React.useMemo(() => {
    const trimmed = queryText.trim().toLocaleLowerCase('vi-VN');
    if (!trimmed) return true;
    return mdmItems.some(
      (item) =>
        item.name.toLocaleLowerCase('vi-VN') === trimmed ||
        item.normalizedName.toLowerCase() === trimmed,
    );
  }, [mdmItems, queryText]);

  const handlePickExisting = (item: MdmItem) => {
    if (selectedId === item.id) {
      setQueryText('');
      setOpen(true);
      onSelectIngredient({
        ingredientMdmId: undefined,
        ingredientName: '',
        defaultUnit: undefined,
        lastPrice: undefined,
      });
      return;
    }

    const meta = (item.metadata ?? {}) as {
      default_unit?: unknown;
      last_price?: unknown;
    };
    const defaultUnit =
      typeof meta.default_unit === 'string' && meta.default_unit.trim()
        ? meta.default_unit.trim()
        : undefined;
    const lastPrice =
      typeof meta.last_price === 'number'
        ? meta.last_price
        : typeof meta.last_price === 'string' && !Number.isNaN(Number(meta.last_price))
          ? Number(meta.last_price)
          : undefined;

    setQueryText(item.name);
    setOpen(false);
    onSelectIngredient({
      ingredientMdmId: item.id,
      ingredientName: item.name,
      defaultUnit,
      lastPrice,
    });
  };

  const handlePickNewName = () => {
    const trimmed = queryText.trim();
    if (!trimmed) return;
    setOpen(false);
    onSelectIngredient({
      ingredientMdmId: undefined,
      ingredientName: trimmed,
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          data-testid={`ingredient-combobox-input-${rowIndex}`}
          value={queryText}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            const nextVal = e.target.value;
            setQueryText(nextVal);
            setOpen(true);
            onSelectIngredient({
              ingredientMdmId: undefined,
              ingredientName: nextVal,
            });
          }}
          placeholder="Tìm hoặc gõ tên nguyên liệu..."
          className="pl-8 text-sm"
        />
      </div>

      {open ? (
        <div
          data-testid={`ingredient-combobox-dropdown-${rowIndex}`}
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {filteredItems.map((item) => {
            const meta = (item.metadata ?? {}) as {
              default_unit?: string;
              last_price?: number;
            };
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`ingredient-option-${rowIndex}-${item.id}`}
                onClick={() => handlePickExisting(item)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                  isSelected && 'bg-accent/60 font-semibold',
                )}
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  {meta.default_unit || meta.last_price ? (
                    <div className="text-[11px] text-muted-foreground">
                      {meta.default_unit ? `ĐVT: ${meta.default_unit}` : ''}{' '}
                      {typeof meta.last_price === 'number'
                        ? `• Giá gần nhất: ${meta.last_price.toLocaleString('vi-VN')} đ`
                        : ''}
                    </div>
                  ) : null}
                </div>
                {isSelected ? <Check className="h-3.5 w-3.5 text-accent-text" /> : null}
              </button>
            );
          })}

          {queryText.trim() && !exactMatchExists ? (
            <button
              type="button"
              data-testid={`ingredient-create-new-${rowIndex}`}
              onClick={handlePickNewName}
              className="mt-0.5 flex w-full items-center gap-1.5 rounded-md border-t px-2.5 py-2 text-left text-xs font-semibold text-accent-text hover:bg-accent"
            >
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
              <span>+ Tạo mới nguyên liệu: &apos;{queryText.trim()}&apos;</span>
            </button>
          ) : null}

          {filteredItems.length === 0 && !queryText.trim() ? (
            <div className="px-2.5 py-2 text-center text-xs text-muted-foreground">
              Gõ tên nguyên liệu để tìm hoặc thêm mới
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
