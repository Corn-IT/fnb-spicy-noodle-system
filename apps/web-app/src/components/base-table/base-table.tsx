import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import * as React from 'react';

import { useColumnResizeSync } from '@/components/base-table/use-column-resize-sync';
import { Skeleton } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommitSearch } from '@/lib/use-commit-search';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';

export interface BaseTablePaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export interface BaseTableProps<TData> {
  tableId: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  isLoading?: boolean;
  isFetching?: boolean;
  isPlaceholderData?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  footerSummary?: React.ReactNode;
  pagination?: BaseTablePaginationProps;
  onRowClick?: (row: TData) => void;
  className?: string;
}

interface MemoizedTableBodyProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  onRowClick?: (row: TData) => void;
  isTransitioning?: boolean;
}

function TableBodyInner<TData>({
  table,
  onRowClick,
  isTransitioning = false,
}: MemoizedTableBodyProps<TData>) {
  return (
    <tbody
      className={cn(
        'divide-y divide-border bg-card transition-opacity duration-150',
        isTransitioning && 'opacity-65',
      )}
    >
      {table.getRowModel().rows.map((row) => (
        <tr
          key={row.id}
          onClick={onRowClick ? () => onRowClick(row.original) : undefined}
          className={cn(
            'even:bg-muted/20 transition-colors hover:bg-muted/60',
            onRowClick && 'cursor-pointer',
          )}
        >
          {row.getVisibleCells().map((cell) => (
            <td
              key={cell.id}
              style={{
                width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
              }}
              className="px-3 py-2.5 text-sm text-foreground align-middle"
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

const MemoizedTableBody = React.memo(
  TableBodyInner,
  (prev, next) =>
    prev.table.options.data === next.table.options.data &&
    prev.isTransitioning === next.isTransitioning,
) as typeof TableBodyInner;

export function BaseTable<TData>({
  tableId,
  data,
  columns,
  isLoading = false,
  isFetching = false,
  isPlaceholderData = false,
  emptyMessage = 'Không có dữ liệu phù hợp.',
  searchPlaceholder = 'Nhập từ khoá tìm kiếm...',
  searchValue,
  onSearchChange,
  toolbarLeft,
  toolbarRight,
  footerSummary,
  pagination,
  onRowClick,
  className,
}: BaseTableProps<TData>) {
  const savedWidths = useUiPreferencesStore(
    (state) => state.columnWidths[tableId],
  );

  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(
    () => savedWidths ?? {},
  );

  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const rafIdRef = React.useRef<number | null>(null);

  const normalizedColumns = React.useMemo(
    () =>
      columns.map((col) => {
        if (typeof col.header !== 'string') return col;
        // Ensure headers like STT, THAO TÁC, PHƯƠNG THỨC never collapse to ellipsis (...)
        const minHeaderWidth = Math.max(56, Math.ceil(col.header.length * 8.5) + 34);
        const existingMin = col.minSize ?? 0;
        const existingSize = col.size ?? 150;
        return {
          ...col,
          minSize: Math.max(existingMin, minHeaderWidth),
          size: Math.max(existingSize, minHeaderWidth),
        };
      }),
    [columns],
  );

  const table = useReactTable({
    data,
    columns: normalizedColumns,
    state: {
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 56,
      size: 150,
      maxSize: 900,
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const isResizingColumn = table.getState().columnSizingInfo.isResizingColumn;

  useColumnResizeSync(tableId, columnSizing, isResizingColumn);

  const columnSizeVars = React.useMemo(() => {
    const headers = table.getFlatHeaders();
    const vars: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      vars[`--header-${header.id}-size`] = header.getSize();
      vars[`--col-${header.column.id}-size`] = header.column.getSize();
    }
    return vars;
  }, [table.getState().columnSizing, columns]);

  React.useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const applyVars = () => {
      for (const [key, value] of Object.entries(columnSizeVars)) {
        el.style.setProperty(key, String(value));
      }
    };

    applyVars();
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = window.requestAnimationFrame(applyVars);
    }

    return () => {
      if (rafIdRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [columnSizeVars]);

  const commitSearch = React.useCallback(
    (nextValue: string) => {
      onSearchChange?.(nextValue);
    },
    [onSearchChange],
  );
  const search = useCommitSearch(searchValue ?? '', commitSearch);

  const showToolbar =
    Boolean(toolbarLeft) || Boolean(toolbarRight) || Boolean(onSearchChange);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showToolbar ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">{toolbarLeft}</div>
          <div className="flex flex-wrap items-center gap-2">
            {onSearchChange ? (
              <div ref={search.containerRef} className="relative w-full sm:w-72 lg:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  {...search.inputProps}
                  type="search"
                  name={`table-search-${tableId}`}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  placeholder={searchPlaceholder}
                  className="pl-8 pr-8 w-full [&::-webkit-search-cancel-button]:hidden"
                />
                <button
                  type="button"
                  data-testid="table-search-reset-btn"
                  disabled={!search.draft && !searchValue}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    search.clear();
                    onSearchChange?.('');
                  }}
                  title="Đặt lại tìm kiếm"
                  aria-label="Đặt lại tìm kiếm"
                  className={cn(
                    'absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
                    search.draft || searchValue
                      ? 'text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer'
                      : 'text-muted-foreground/45 cursor-default',
                  )}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            {toolbarRight}
          </div>
        </div>
      ) : null}

      <div className="relative w-full overflow-hidden rounded-xl border bg-card shadow-sm">
        {!isLoading && (isFetching || isPlaceholderData) ? (
          <div
            aria-hidden="true"
            data-testid="base-table-fetching-bar"
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/15"
          >
            <div className="animate-top-progress h-full w-1/2 rounded-r-full bg-primary" />
          </div>
        ) : null}
        <div className="w-full overflow-x-auto touch-pan-x">
          <table
            ref={tableRef}
            style={{
              ...(columnSizeVars as React.CSSProperties),
              minWidth: '100%',
              width: table.getTotalSize(),
            }}
            className="w-full table-fixed border-collapse text-left"
          >
          <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      width: `calc(var(--header-${header.id}-size) * 1px)`,
                    }}
                    className="relative select-none whitespace-nowrap px-2.5 sm:px-3 py-2.5 sm:py-3 font-semibold text-xs"
                  >
                    <div
                      className="whitespace-nowrap pr-2"
                      title={
                        typeof header.column.columnDef.header === 'string'
                          ? header.column.columnDef.header
                          : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </div>
                    {header.column.getCanResize() ? (
                      <div
                        data-testid={`column-resizer-${header.column.id}`}
                        onDoubleClick={() => header.column.resetSize()}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none transition-colors hover:bg-primary/60',
                          header.column.getIsResizing() && 'bg-primary w-1.5',
                        )}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          {isLoading ? (
            <tbody className="divide-y divide-border bg-card">
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={`skeleton-${rowIdx}`}>
                  {columns.map((_, colIdx) => (
                    <td key={`skeleton-${rowIdx}-${colIdx}`} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : data.length === 0 ? (
            <tbody
              className={cn(
                'transition-opacity duration-150',
                (isFetching || isPlaceholderData) && 'opacity-65',
              )}
            >
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            </tbody>
          ) : isResizingColumn ? (
            <MemoizedTableBody
              table={table}
              onRowClick={onRowClick}
              isTransitioning={isFetching || isPlaceholderData}
            />
          ) : (
            <TableBodyInner
              table={table}
              onRowClick={onRowClick}
              isTransitioning={isFetching || isPlaceholderData}
            />
          )}
          </table>
        </div>

        {footerSummary ? (
          <div className="border-t bg-muted/40 px-3 py-2.5 text-sm font-semibold text-foreground">
            {footerSummary}
          </div>
        ) : null}
      </div>

      {pagination ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
          <div>
            Hiển thị trang <span className="font-semibold text-foreground">{pagination.page}</span> /{' '}
            <span className="font-semibold text-foreground">
              {Math.max(1, pagination.totalPages)}
            </span>{' '}
            (Tổng <span className="font-semibold text-foreground">{pagination.total}</span> bản ghi)
          </div>
          <div className="flex items-center gap-2">
            {pagination.onLimitChange ? (
              <select
                aria-label="Số dòng mỗi trang"
                value={pagination.limit}
                onChange={(e) => pagination.onLimitChange?.(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} / trang
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= Math.max(1, pagination.totalPages)}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Sau
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
