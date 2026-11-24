import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Search, Table2 } from 'lucide-react';
import * as React from 'react';

import { useColumnResizeSync } from '@/components/base-table/use-column-resize-sync';
import { Skeleton } from '@/components/loading';
import { useMediaQuery } from '@/components/touch-shell/use-media-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommitSearch } from '@/lib/use-commit-search';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';

const MOBILE_CARD_MEDIA_QUERY = '(max-width: 767px)';

function isActionColumnId(id: string, header: unknown): boolean {
  const normalizedId = id.toLowerCase();
  if (normalizedId.includes('action') || normalizedId === 'thaotac') return true;
  if (typeof header === 'string') {
    const h = header.trim().toLowerCase();
    return h === 'thao tác' || h === 'hành động' || h === 'actions';
  }
  return false;
}

function isSttColumnId(id: string, header: unknown): boolean {
  const normalizedId = id.toLowerCase();
  if (normalizedId === 'stt' || normalizedId === 'index') return true;
  if (typeof header === 'string') {
    return header.trim().toLowerCase() === 'stt';
  }
  return false;
}

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
  /** Tuỳ chỉnh thẻ hiển thị trên Mobile (< 768px). Nếu bỏ trống, BaseTable tự dựng thẻ từ columns. */
  renderMobileCard?: (row: TData, index: number) => React.ReactNode;
  /** Tắt chế độ tự chuyển sang thẻ trên Mobile nếu bảng quá đơn giản */
  disableMobileCards?: boolean;
  className?: string;
}

interface MemoizedTableBodyProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  onRowClick?: (row: TData) => void;
  isTransitioning?: boolean;
  stickyActionLastCol?: boolean;
}

function TableBodyInner<TData>({
  table,
  onRowClick,
  isTransitioning = false,
  stickyActionLastCol = false,
}: MemoizedTableBodyProps<TData>) {
  return (
    <tbody
      className={cn(
        'divide-y divide-border bg-card transition-opacity duration-150',
        isTransitioning && 'opacity-65',
      )}
    >
      {table.getRowModel().rows.map((row) => {
        const visibleCells = row.getVisibleCells();
        return (
          <tr
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={cn(
              'even:bg-muted/20 transition-colors hover:bg-muted/60',
              onRowClick && 'cursor-pointer',
            )}
          >
            {visibleCells.map((cell, cellIdx) => {
              const isStickyAction = stickyActionLastCol && cellIdx === visibleCells.length - 1;
              return (
                <td
                  key={cell.id}
                  style={{
                    width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                  }}
                  className={cn(
                    'px-3 py-2.5 text-sm text-foreground align-middle touch-ui:px-3.5 touch-ui:py-3.5 touch-ui:text-[15px]',
                    isStickyAction &&
                      'md:sticky md:right-0 md:z-10 md:bg-card md:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)]',
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              );
            })}
          </tr>
        );
      })}
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
  renderMobileCard,
  disableMobileCards = false,
  className,
}: BaseTableProps<TData>) {
  const isMobileViewport = useMediaQuery(MOBILE_CARD_MEDIA_QUERY);
  const [mobileViewMode, setMobileViewMode] = React.useState<'cards' | 'table'>('cards');
  const showMobileCards = isMobileViewport && !disableMobileCards && mobileViewMode === 'cards';
  const showMobileViewToggle = isMobileViewport && !disableMobileCards;

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
    Boolean(toolbarLeft) ||
    Boolean(toolbarRight) ||
    Boolean(onSearchChange) ||
    showMobileViewToggle;

  const stickyActionLastCol = React.useMemo(() => {
    if (columns.length < 4) return false;
    const last = columns[columns.length - 1];
    if (!last) return false;
    const id = last.id ?? ('accessorKey' in last && typeof last.accessorKey === 'string' ? last.accessorKey : '');
    return isActionColumnId(id, last.header);
  }, [columns]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showToolbar ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">{toolbarLeft}</div>
          <div className="flex flex-wrap items-center gap-2">
            {onSearchChange ? (
              <div ref={search.containerRef} className="relative flex-1 min-w-[200px] sm:flex-none sm:w-72 lg:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground touch-ui:left-3 touch-ui:h-5 touch-ui:w-5" />
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
                  className="pl-8 pr-10 lg:pr-8 w-full min-h-10 lg:min-h-0 touch-ui:pl-10 touch-ui:pr-11 [&::-webkit-search-cancel-button]:hidden"
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
                    'absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 xl:h-8 xl:w-8 items-center justify-center rounded transition-colors touch-ui:h-10 touch-ui:w-10',
                    search.draft || searchValue
                      ? 'text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer'
                      : 'text-muted-foreground/45 cursor-default',
                  )}
                >
                  <RotateCcw className="h-3.5 w-3.5 touch-ui:h-4 touch-ui:w-4" />
                </button>
              </div>
            ) : null}
            {showMobileViewToggle ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="base-table-view-toggle"
                onClick={() => setMobileViewMode((prev) => (prev === 'cards' ? 'table' : 'cards'))}
                className="min-h-10 shrink-0 gap-1.5 px-3 text-xs font-semibold"
                aria-label={mobileViewMode === 'cards' ? 'Chuyển sang xem dạng bảng' : 'Chuyển sang xem dạng thẻ'}
              >
                {mobileViewMode === 'cards' ? (
                  <>
                    <Table2 className="h-4 w-4 shrink-0" />
                    <span>Bảng</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span>Thẻ</span>
                  </>
                )}
              </Button>
            ) : null}
            {toolbarRight}
          </div>
        </div>
      ) : null}

      {showMobileCards ? (
        <div
          data-testid="base-table-mobile-cards"
          className="relative flex flex-col gap-2.5"
        >
          {!isLoading && (isFetching || isPlaceholderData) ? (
            <div
              aria-hidden="true"
              data-testid="base-table-fetching-bar"
              className="pointer-events-none h-0.5 w-full overflow-hidden rounded-full bg-primary/15"
            >
              <div className="animate-top-progress h-full w-1/2 rounded-r-full bg-primary" />
            </div>
          ) : null}

          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`mobile-skeleton-${idx}`}
                className="rounded-xl border bg-card p-3.5 shadow-sm space-y-2.5"
              >
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            ))
          ) : data.length === 0 ? (
            <div className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-sm">
              {emptyMessage}
            </div>
          ) : (
            table.getRowModel().rows.map((row, rowIndex) => {
              if (renderMobileCard) {
                return (
                  <div
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'rounded-xl border bg-card p-3.5 shadow-sm transition-colors',
                      onRowClick && 'cursor-pointer active:bg-muted/50',
                      (isFetching || isPlaceholderData) && 'opacity-70',
                    )}
                  >
                    {renderMobileCard(row.original, rowIndex)}
                  </div>
                );
              }

              const cells = row.getVisibleCells();
              const actionCell = cells.find((c) =>
                isActionColumnId(c.column.id, c.column.columnDef.header),
              );
              const contentCells = cells.filter(
                (c) =>
                  c !== actionCell &&
                  !isSttColumnId(c.column.id, c.column.columnDef.header),
              );
              const primaryCell = contentCells[0];
              const secondaryCells = contentCells.slice(1);

              return (
                <article
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'rounded-xl border bg-card p-3.5 shadow-sm space-y-2.5 transition-colors',
                    onRowClick && 'cursor-pointer active:bg-muted/50',
                    (isFetching || isPlaceholderData) && 'opacity-70',
                  )}
                >
                  {primaryCell ? (
                    <div className="flex items-start justify-between gap-2 pb-2 border-b border-border/60">
                      <div className="min-w-0 flex-1 text-sm font-semibold text-foreground break-words">
                        {flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
                      </div>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                        #{rowIndex + 1}
                      </span>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    {secondaryCells.map((cell) => {
                      const headerLabel =
                        typeof cell.column.columnDef.header === 'string'
                          ? cell.column.columnDef.header
                          : cell.column.id;
                      return (
                        <div
                          key={cell.id}
                          className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5 text-xs"
                        >
                          <span className="shrink-0 font-medium text-muted-foreground">
                            {headerLabel}
                          </span>
                          <div className="min-w-0 flex-1 text-right text-foreground break-words [&_.truncate]:whitespace-normal [&_.truncate]:overflow-visible [&_.truncate]:text-clip">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {actionCell ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/60"
                    >
                      {flexRender(actionCell.column.columnDef.cell, actionCell.getContext())}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}

          {footerSummary ? (
            <div className="rounded-xl border bg-muted/40 px-3.5 py-2.5 text-sm font-semibold text-foreground">
              {footerSummary}
            </div>
          ) : null}
        </div>
      ) : (
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
          <div
            data-scroll-intended="true"
            className="w-full overflow-x-auto overscroll-x-contain touch-pan-x"
          >
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
                  {headerGroup.headers.map((header, headerIdx) => {
                    const isStickyAction =
                      stickyActionLastCol && headerIdx === headerGroup.headers.length - 1;
                    return (
                      <th
                        key={header.id}
                        style={{
                          width: `calc(var(--header-${header.id}-size) * 1px)`,
                        }}
                        className={cn(
                          'relative select-none whitespace-nowrap px-2.5 sm:px-3 py-2.5 sm:py-3 font-semibold text-xs touch-ui:px-3.5 touch-ui:py-3.5',
                          isStickyAction &&
                            'md:sticky md:right-0 md:z-20 md:bg-muted/95 md:backdrop-blur-xs md:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)]',
                        )}
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
                              'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none transition-colors hover:bg-primary/60 touch-ui:hidden',
                              header.column.getIsResizing() && 'bg-primary w-1.5',
                            )}
                          />
                        ) : null}
                      </th>
                    );
                  })}
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
                stickyActionLastCol={stickyActionLastCol}
              />
            ) : (
              <TableBodyInner
                table={table}
                onRowClick={onRowClick}
                isTransitioning={isFetching || isPlaceholderData}
                stickyActionLastCol={stickyActionLastCol}
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
      )}

      {pagination ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground touch-ui:text-sm">
          <div>
            Hiển thị trang <span className="font-semibold text-foreground">{pagination.page}</span> /{' '}
            <span className="font-semibold text-foreground">
              {Math.max(1, pagination.totalPages)}
            </span>{' '}
            (Tổng <span className="font-semibold text-foreground">{pagination.total}</span> bản ghi)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pagination.onLimitChange ? (
              <select
                aria-label="Số dòng mỗi trang"
                value={pagination.limit}
                onChange={(e) => pagination.onLimitChange?.(Number(e.target.value))}
                className="h-10 lg:h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground touch-ui:h-11 touch-ui:px-3 touch-ui:text-sm"
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
              className="min-h-10 lg:min-h-8"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 lg:min-h-8"
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
