import {
  AUDIT_MODULE_CONFIG,
  type AuditLogItem,
  type AuditLogListResponse,
  type AuditModule,
} from '@fnb/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronLeft, ChevronRight, History, RefreshCw, Search } from 'lucide-react';
import * as React from 'react';

import { AuditTimelineSkeleton } from '@/components/loading';
import { Badge } from '@/components/ui/badge';
import { isToastTarget } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { apiClient } from '@/lib/api-client';
import { useCommitSearch } from '@/lib/use-commit-search';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

interface AuditChangeEntry {
  field: string;
  from: string;
  to: string;
}

function resolveActionBadgeClass(action: string): string {
  const normalized = action.toLowerCase();
  if (
    normalized.includes('xoá') ||
    normalized.includes('huỷ') ||
    normalized.includes('từ chối') ||
    normalized.includes('ngưng') ||
    normalized.includes('khoá / mở') ||
    normalized.includes('thu hồi phiên') ||
    normalized.includes('chiếm phiên') ||
    normalized.includes('thất bại')
  ) {
    return 'border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-400';
  }
  if (
    normalized.includes('duyệt') ||
    normalized.includes('thanh toán') ||
    normalized.includes('tạo') ||
    normalized.includes('thêm') ||
    normalized.includes('khôi phục') ||
    normalized === 'đăng nhập'
  ) {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  }
  if (normalized.includes('bù') || normalized.includes('tách') || normalized.includes('chuyển') || normalized.includes('gộp') || normalized.includes('đổi') || normalized.includes('gửi duyệt')) {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }
  if (normalized.includes('chốt') || normalized.includes('in lại')) {
    return 'border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
  }
  return 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400';
}

function getModuleMetaTags(module: AuditModule, metadata: Record<string, unknown>): string[] {
  const tags: string[] = [];
  const str = (key: string): string | null =>
    typeof metadata[key] === 'string' && metadata[key].trim() ? metadata[key].trim() : null;

  if (module === 'POS') {
    if (str('orderCode')) tags.push(`Mã đơn: ${str('orderCode')}`);
    if (str('tableLabel')) tags.push(`Vị trí: ${str('tableLabel')}`);
    if (str('fromLabel') && str('toLabel')) tags.push(`${str('fromLabel')} → ${str('toLabel')}`);
    if (str('paymentMethodLabel')) tags.push(`PTTT: ${str('paymentMethodLabel')}`);
    if (str('discountCode')) tags.push(`Mã KM: ${str('discountCode')}`);
    if (str('reason')) tags.push(`Lý do: ${str('reason')}`);
  } else if (module === 'DISCOUNTS') {
    if (str('code')) tags.push(`Mã: ${str('code')}`);
    if (str('name')) tags.push(`Tên: ${str('name')}`);
  } else if (module === 'MENU') {
    if (str('productName')) tags.push(`Món: ${str('productName')}`);
    if (str('stationLabel')) tags.push(`Bếp: ${str('stationLabel')}`);
    if (str('categoryLabel')) tags.push(`Loại: ${str('categoryLabel')}`);
    if (str('recordName') && !str('productName')) tags.push(`Tên: ${str('recordName')}`);
    if (Array.isArray(metadata.unavailableToppings) && metadata.unavailableToppings.length > 0) {
      tags.push(`Tạm hết: ${metadata.unavailableToppings.join(', ')}`);
    }
  } else if (module === 'INVOICES') {
    if (str('orderCode')) tags.push(`Hoá đơn: ${str('orderCode')}`);
    if (str('fromPaymentMethodLabel') && str('toPaymentMethodLabel')) {
      tags.push(`PTTT: ${str('fromPaymentMethodLabel')} → ${str('toPaymentMethodLabel')}`);
    }
    if (str('decisionLabel')) tags.push(`Kết quả: ${str('decisionLabel')}`);
    if (str('reason')) tags.push(`Lý do: ${str('reason')}`);
  } else if (module === 'INVENTORY') {
    if (str('itemName')) tags.push(`Mặt hàng: ${str('itemName')}`);
    if (str('paymentSourceLabel')) tags.push(`Nguồn tiền: ${str('paymentSourceLabel')}`);
  } else if (module === 'CASHFLOW') {
    if (str('settlementDate')) tags.push(`Ngày: ${str('settlementDate')}`);
    if (str('note')) tags.push(`Ghi chú: ${str('note')}`);
  } else if (module === 'EMPLOYEES') {
    if (str('employeeName')) tags.push(`Nhân sự: ${str('employeeName')}`);
  } else if (module === 'SCHEDULES') {
    if (str('weekStartDate')) tags.push(`Tuần: ${str('weekStartDate')}`);
    if (str('targetWeekStartDate')) tags.push(`Tuần đích: ${str('targetWeekStartDate')}`);
  } else if (module === 'MDM') {
    if (str('categoryLabel')) tags.push(`Danh mục: ${str('categoryLabel')}`);
    if (str('recordName')) tags.push(`Tên: ${str('recordName')}`);
  } else if (module === 'RBAC') {
    if (str('targetUsername')) tags.push(`Tài khoản: ${str('targetUsername')}`);
    if (str('failureReason') === 'INVALID_PASSWORD') tags.push('Lý do: Sai mật khẩu');
    if (str('failureReason') === 'ACCOUNT_DISABLED') tags.push('Lý do: Tài khoản bị khoá');
  }
  return tags;
}

function getAuditChanges(metadata: Record<string, unknown>): AuditChangeEntry[] {
  const raw = metadata.changes;
  if (!Array.isArray(raw)) return [];
  const entries: AuditChangeEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const field = typeof obj.field === 'string' ? obj.field.trim() : '';
    if (!field) continue;
    const from = typeof obj.from === 'string' ? obj.from.trim() : obj.from != null ? String(obj.from) : '';
    const to = typeof obj.to === 'string' ? obj.to.trim() : obj.to != null ? String(obj.to) : '';
    entries.push({ field, from, to });
  }
  return entries;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatCompactAuditSummary(item: AuditLogItem, moduleLabel: string): string {
  let text = item.summary.trim();
  const meta = item.metadata ?? {};
  const str = (key: string): string | null =>
    typeof meta[key] === 'string' && meta[key].trim() ? meta[key].trim() : null;

  // Strip redundant actor prefix and module suffix added by legacy/default AuditLogService format
  text = text.replace(/^Nhân viên\s+.+?\s+đã thực hiện thao tác\s+/i, '');
  if (moduleLabel) {
    text = text.replace(new RegExp(`\\s+tại\\s+${escapeRegExp(moduleLabel)}$`, 'i'), '');
  }

  // Strip entity identifiers / reasons already displayed in the top metadata tags next to Action Badge
  const duplicateValues = [
    str('orderCode'),
    str('tableLabel'),
    str('settlementDate'),
    str('shiftName'),
    str('productName'),
    str('itemName'),
    str('employeeName'),
    str('targetUsername'),
    str('weekStartDate'),
    str('targetWeekStartDate'),
    str('recordName'),
  ].filter((v): v is string => Boolean(v));

  for (const val of duplicateValues) {
    const escaped = escapeRegExp(val);
    text = text.replace(new RegExp(`\\s*\\(\\s*${escaped}\\s*\\)`, 'g'), '');
    text = text.replace(new RegExp(`\\s*["“]?\\b${escaped}\\b["”]?`, 'g'), '');
  }

  const reason = str('reason');
  if (reason) {
    const escapedReason = escapeRegExp(reason);
    text = text.replace(new RegExp(`\\s*\\(\\s*(?:Lý do|Ghi chú):\\s*${escapedReason}\\s*\\)`, 'gi'), '');
    text = text.replace(new RegExp(`,?\\s*(?:Lý do|Ghi chú):\\s*${escapedReason}`, 'gi'), '');
  }

  // Clean up leftover shift tokens, empty parentheses, and repeated spaces
  text = text
    .replace(/\bCA_NGAY\b/g, '')
    .replace(/,\s*\)/g, ')')
    .replace(/\(\s*,/g, '(')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .trim();

  if (!text) {
    return item.action;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export interface AuditHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: AuditModule;
  title?: string;
  initialKeyword?: string;
}

export function AuditHistoryDrawer({
  open,
  onOpenChange,
  module,
  title,
  initialKeyword,
}: AuditHistoryDrawerProps) {
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);
  const moduleConfig = AUDIT_MODULE_CONFIG[module];
  const [selectedAction, setSelectedAction] = React.useState('');
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState(initialKeyword ?? '');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const commitKeyword = React.useCallback((nextValue: string) => {
    setKeyword(nextValue.trim());
    setPage(1);
  }, []);
  const keywordSearch = useCommitSearch(keyword, commitKeyword);

  React.useEffect(() => {
    setSelectedAction('');
    setDropdownOpen(false);
    setPage(1);
  }, [module]);

  React.useEffect(() => {
    if (!open || initialKeyword === undefined) return;
    const normalized = initialKeyword.trim();
    setSelectedAction('');
    setFromDate('');
    setToDate('');
    setKeyword(normalized);
    setPage(1);
  }, [open, initialKeyword]);

  React.useEffect(() => {
    if (!dropdownOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (isToastTarget(event.target)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [dropdownOpen]);

  const query = useQuery({
    queryKey: ['audit-logs', module, selectedAction, keyword, fromDate, toDate, page],
    queryFn: () =>
      apiClient.get<AuditLogListResponse>(`/api/v1/audit-logs/${module}`, {
        params: {
          page,
          limit: pageSize,
          action: selectedAction || undefined,
          keyword: keyword || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
      }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = query.data?.items ?? [];

  const handleResetFilters = () => {
    setSelectedAction('');
    setDropdownOpen(false);
    keywordSearch.clear();
    setKeyword('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const selectedActionLabel =
    moduleConfig.actions.find((opt) => opt.value === selectedAction)?.label ?? 'Tất cả';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full sm:max-w-3xl flex-col gap-3 overflow-hidden p-0">
        <SheetHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 pr-8">
            <History className="h-5 w-5 text-accent-text" />
            <SheetTitle>
              {title ?? moduleConfig.title}
            </SheetTitle>
          </div>
          <SheetDescription>
            {moduleConfig.subtitle}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2.5 border-b border-border px-6 pb-3.5">
          <div className="flex h-9 items-center rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <div ref={dropdownRef} className="relative h-full shrink-0 border-r border-input">
              <button
                type="button"
                role="combobox"
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
                aria-label={`Bộ lọc thao tác ${moduleConfig.moduleLabel}`}
                data-testid="audit-action-filter-trigger"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex h-full max-w-[190px] items-center justify-between gap-2 rounded-l-md bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus:outline-none"
              >
                <span className="truncate">{selectedActionLabel}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', dropdownOpen && 'rotate-180')} />
              </button>
              {dropdownOpen ? (
                <div
                  role="listbox"
                  aria-label={`Tuỳ chọn thao tác ${moduleConfig.moduleLabel}`}
                  className="absolute left-0 top-full z-50 mt-1 max-h-64 min-w-[200px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedAction === ''}
                    onClick={() => {
                      setSelectedAction('');
                      setDropdownOpen(false);
                      setPage(1);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                      selectedAction === '' && 'bg-accent/70 font-semibold text-accent-foreground',
                    )}
                  >
                    <span>Tất cả</span>
                    {selectedAction === '' ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-text" /> : null}
                  </button>
                  {moduleConfig.actions.map((opt) => {
                    const isSelected = selectedAction === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedAction(isSelected ? '' : opt.value);
                          setDropdownOpen(false);
                          setPage(1);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                          isSelected && 'bg-accent/70 font-semibold text-accent-foreground',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-text" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div ref={keywordSearch.containerRef} className="flex flex-1 items-center">
              <div className="relative flex flex-1 items-center">
                <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  {...keywordSearch.inputProps}
                  placeholder={
                    isSuperAdmin
                      ? 'Tìm theo tên, tài khoản, IP, thiết bị hoặc nội dung...'
                      : 'Tìm theo tên, tài khoản hoặc nội dung...'
                  }
                  className="h-9 w-full bg-transparent pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleResetFilters}
                className="mr-1.5 shrink-0 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Đặt lại
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Từ</span>
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  const nextFrom = event.target.value;
                  setFromDate(nextFrom);
                  if (toDate && nextFrom && toDate < nextFrom) {
                    setToDate(nextFrom);
                  }
                  setPage(1);
                }}
                className="h-8 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Đến</span>
              <Input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => {
                  const nextTo = event.target.value;
                  setToDate(fromDate && nextTo && nextTo < fromDate ? fromDate : nextTo);
                  setPage(1);
                }}
                className="h-8 w-36 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 px-2 text-xs"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn('mr-1 h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
              Làm mới
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {query.isLoading ? (
            <AuditTimelineSkeleton />
          ) : query.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Không thể tải lịch sử thao tác. Vui lòng thử lại sau.
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Chưa có lịch sử thao tác nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div
              className={cn(
                'overflow-x-auto rounded-lg border border-border bg-card shadow-sm transition-opacity duration-150',
                (query.isFetching || query.isPlaceholderData) && 'opacity-65',
              )}
            >
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5">Nhân viên</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Thời gian</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Thao tác hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item: AuditLogItem) => {
                    const metaTags = getModuleMetaTags(module, item.metadata ?? {});
                    const changes = getAuditChanges(item.metadata ?? {});
                    const compactSummary = formatCompactAuditSummary(item, moduleConfig.moduleLabel);
                    return (
                      <tr key={item.id} className="align-top transition-colors hover:bg-muted/30">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-foreground">{item.actorFullName}</div>
                          <div className="text-xs text-muted-foreground">@{item.actorUsername}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className={resolveActionBadgeClass(item.action)}>
                              {item.action}
                            </Badge>
                            {metaTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                            {isSuperAdmin && item.ipAddress ? (
                              <span
                                data-testid={`audit-client-info-${item.id}`}
                                className="rounded border border-slate-500/25 bg-slate-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground"
                                title={item.deviceLabel ? `${item.ipAddress} (${item.deviceLabel})` : item.ipAddress}
                              >
                                IP: {item.ipAddress}
                                {item.deviceLabel ? ` · ${item.deviceLabel}` : ''}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs leading-relaxed text-foreground">{compactSummary}</p>
                          {changes.length > 0 ? (
                            <ul
                              data-testid={`audit-changes-${item.id}`}
                              className="mt-1 space-y-0.5 rounded-md border border-border/60 bg-muted/25 px-2 py-1.5 text-[11px] leading-snug"
                            >
                              {changes.map((c, idx) => (
                                <li key={`${c.field}-${idx}`} className="flex flex-wrap items-baseline gap-1">
                                  <span className="font-semibold text-foreground/85">{c.field}:</span>
                                  {c.from ? (
                                    <>
                                      <span className="line-through text-muted-foreground">{c.from}</span>
                                      <span className="text-muted-foreground">→</span>
                                    </>
                                  ) : null}
                                  <span className="font-medium text-foreground">{c.to || 'Trống'}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
          <span>
            Tổng {total} bản ghi • Trang {page}/{totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Trang trước"
              className="h-7 px-2"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || query.isFetching}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Trang sau"
              className="h-7 px-2"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages || query.isFetching}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export interface AuditHistoryButtonProps {
  module: AuditModule;
  title?: string;
  label?: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function AuditHistoryButton({
  module,
  title,
  label = 'Lịch sử thao tác',
  className,
  size = 'sm',
}: AuditHistoryButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        className={cn('gap-1.5 whitespace-nowrap', className)}
      >
        <History className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </Button>
      <AuditHistoryDrawer
        open={open}
        onOpenChange={setOpen}
        module={module}
        title={title}
      />
    </>
  );
}
