import { MdmCategory, type MdmItem } from '@fnb/shared';
import { Check, PlusCircle, Search } from 'lucide-react';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { useMdmLookupQuery } from '@/features/inventory/api/inventory.api';
import { cn } from '@/utils/cn';

export interface SelectedSupplierValue {
  supplierMdmId?: number;
  supplierName: string;
}

export interface SupplierMdmComboboxProps {
  value: string;
  selectedId?: number;
  onSelectSupplier: (selection: SelectedSupplierValue) => void;
}

export function SupplierMdmCombobox({
  value,
  selectedId,
  onSelectSupplier,
}: SupplierMdmComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [queryText, setQueryText] = React.useState(value);
  const { data: records = [] } = useMdmLookupQuery(MdmCategory.SUPPLIER);

  React.useEffect(() => {
    setQueryText(value);
  }, [value]);

  const suppliers = React.useMemo(
    () => records.filter((item) => item.category === MdmCategory.SUPPLIER),
    [records],
  );
  const filteredItems = React.useMemo(() => {
    const trimmed = queryText.trim().toLocaleLowerCase('vi-VN');
    if (!trimmed) return suppliers;
    return suppliers.filter(
      (item) =>
        item.name.toLocaleLowerCase('vi-VN').includes(trimmed) ||
        item.normalizedName.toLowerCase().includes(trimmed),
    );
  }, [suppliers, queryText]);
  const exactMatchExists = React.useMemo(() => {
    const trimmed = queryText.trim().toLocaleLowerCase('vi-VN');
    if (!trimmed) return true;
    return suppliers.some(
      (item) =>
        item.name.toLocaleLowerCase('vi-VN') === trimmed ||
        item.normalizedName.toLowerCase() === trimmed,
    );
  }, [suppliers, queryText]);

  const pickExisting = (item: MdmItem) => {
    setQueryText(item.name);
    setOpen(false);
    onSelectSupplier({ supplierMdmId: item.id, supplierName: item.name });
  };

  const pickNewName = () => {
    const trimmed = queryText.trim();
    if (!trimmed) return;
    setOpen(false);
    onSelectSupplier({ supplierName: trimmed });
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          data-testid="supplier-combobox-input"
          aria-label="Nhà cung cấp từ MDM"
          value={queryText}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQueryText(nextValue);
            setOpen(true);
            onSelectSupplier({ supplierName: nextValue });
          }}
          placeholder="Tìm hoặc gõ tên nhà cung cấp..."
          className="pl-8 text-sm"
        />
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`supplier-option-${item.id}`}
              onClick={() => pickExisting(item)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                selectedId === item.id && 'bg-accent/60 font-semibold',
              )}
            >
              <span className="font-medium">{item.name}</span>
              {selectedId === item.id ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </button>
          ))}

          {queryText.trim() && !exactMatchExists ? (
            <button
              type="button"
              data-testid="supplier-create-new"
              onClick={pickNewName}
              className="mt-0.5 flex w-full items-center gap-1.5 rounded-md border-t px-2.5 py-2 text-left text-xs font-semibold text-primary hover:bg-accent"
            >
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
              <span>+ Tạo nhà cung cấp: &apos;{queryText.trim()}&apos;</span>
            </button>
          ) : null}

          {filteredItems.length === 0 && !queryText.trim() ? (
            <div className="px-2.5 py-2 text-center text-xs text-muted-foreground">
              Gõ tên nhà cung cấp để tìm hoặc thêm mới
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
