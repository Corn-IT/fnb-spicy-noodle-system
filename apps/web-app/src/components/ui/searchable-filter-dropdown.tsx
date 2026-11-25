import { Check, ChevronDown, Search, X } from 'lucide-react';
import * as React from 'react';

import { isToastTarget } from '@/components/ui/toast';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';

export interface SearchableFilterOption {
  value: string;
  label: string;
  badge?: string;
}

export interface SearchableFilterDropdownProps {
  value: string;
  options: SearchableFilterOption[];
  onChange: (value: string) => void;
  allValue?: string;
  allLabel?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  align?: 'left' | 'right' | 'responsive-right';
  triggerTestId?: string;
  optionTestIdPrefix?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  className?: string;
}

/**
 * Bounded popover dropdown with optional in-memory Vietnamese search.
 * Keeps trigger width and popup dimensions strictly capped so long option lists
 * never stretch toolbars or jump unpredictably like native OS <select>.
 */
export function SearchableFilterDropdown({
  value,
  options,
  onChange,
  allValue = 'ALL',
  allLabel = 'Tất cả danh mục',
  searchPlaceholder = 'Tìm danh mục...',
  searchable = true,
  align = 'left',
  triggerTestId,
  optionTestIdPrefix,
  ariaLabel,
  triggerClassName,
  className,
}: SearchableFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [filterText, setFilterText] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const closeDropdown = React.useCallback(() => {
    setOpen(false);
    setFilterText('');
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handleOutside = (event: Event) => {
      if (isToastTarget(event.target)) return;
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        closeDropdown();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };
    document.addEventListener('pointerdown', handleOutside, true);
    document.addEventListener('touchstart', handleOutside, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutside, true);
      document.removeEventListener('touchstart', handleOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, closeDropdown]);

  const filteredOptions = React.useMemo(() => {
    const trimmed = filterText.trim();
    if (!trimmed) return options;
    return options.filter((opt) => matchesVietnameseQuery(trimmed, opt.label, opt.badge));
  }, [options, filterText]);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label ?? allLabel;
  const isDefault = value === allValue || !selectedOption;

  const panelAlignClass =
    align === 'right'
      ? 'right-0'
      : align === 'responsive-right'
        ? 'right-0 sm:left-0 sm:right-auto'
        : 'left-0';

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    closeDropdown();
  };

  return (
    <div ref={containerRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? allLabel}
        data-testid={triggerTestId}
        onClick={() => {
          if (open) {
            closeDropdown();
          } else {
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex h-8 w-[168px] sm:w-[200px] items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring',
          !isDefault && 'border-primary/60 text-foreground font-semibold',
          triggerClassName,
        )}
      >
        <span className="truncate text-left">{displayLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div
          className={cn(
            'absolute top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg',
            panelAlignClass,
          )}
        >
          {searchable ? (
            <div className="border-b border-border p-1.5">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  data-testid={
                    triggerTestId ? `${triggerTestId}-search` : undefined
                  }
                  className="h-7 w-full rounded-sm border border-input bg-background pl-7 pr-6 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {filterText ? (
                  <button
                    type="button"
                    aria-label="Xoá tìm danh mục"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setFilterText('')}
                    className="absolute right-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            role="listbox"
            aria-label={ariaLabel ?? allLabel}
            className="max-h-56 overflow-y-auto overscroll-contain p-1"
          >
            {!filterText.trim() ? (
              <button
                type="button"
                role="option"
                aria-selected={isDefault}
                data-testid={
                  optionTestIdPrefix ? `${optionTestIdPrefix}-${allValue}` : undefined
                }
                onClick={() => handleSelect(allValue)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                  isDefault && 'bg-accent/70 font-semibold text-accent-foreground',
                )}
              >
                <span className="truncate">{allLabel}</span>
                {isDefault ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-text" /> : null}
              </button>
            ) : null}

            {filteredOptions.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                Không tìm thấy mục phù hợp
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-testid={
                      optionTestIdPrefix ? `${optionTestIdPrefix}-${opt.value}` : undefined
                    }
                    onClick={() => handleSelect(isSelected ? allValue : opt.value)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent/70 font-semibold text-accent-foreground',
                    )}
                  >
                    <span className="truncate">
                      {opt.label}
                      {opt.badge ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({opt.badge})
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-accent-text" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
