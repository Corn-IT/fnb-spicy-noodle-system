import {
  interpolateMessageTemplate,
  MESSAGE_CATALOG,
  MESSAGE_CATALOG_BY_KEY,
  MESSAGE_KIND_LABELS,
  MESSAGE_MODULE_LABELS,
  MessageModuleValues,
  resolveStoreMessage,
  validateMessagePlaceholders,
  type MessageCatalogItem,
  type MessageKind,
  type MessageModule,
  type MessageValidationIssue,
  type StoreMessageOverride,
  type StoreMessagesMap,
} from '@fnb/shared';
import {
  AlertTriangle,
  Bell,
  Eye,
  Filter,
  MessageSquareText,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import * as React from 'react';

import { ErrorGalleryDialog } from '@/components/error-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { previewResolvedToast, type ToastVariant } from '@/hooks/use-app-messages';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';

export interface MessageCatalogEditorProps {
  draftMessages: StoreMessagesMap;
  onChangeMessages: (updater: (prev: StoreMessagesMap) => StoreMessagesMap) => void;
  disabled?: boolean;
  /**
   * When set (e.g. 'QR_CUSTOMER' inside Tab "Trang khách QR"), locks the editor to
   * that module and hides the global module filter pills.
   */
  fixedModule?: MessageModule;
  title?: string;
  description?: string;
}

const SAMPLE_PREVIEW_VARS: Record<string, string | number> = {
  tableLabel: 'Bàn 05',
  tableName: 'Bàn 05',
  fromTable: 'Bàn 03',
  toTable: 'Bàn 08',
  targetTableName: 'Bàn 08',
  orderCode: 'HD-20261115-018',
  code: 'HD-20261115-018',
  batchNo: 2,
  batchCount: 2,
  printedCount: 4,
  stationCount: 2,
  count: 12,
  minCount: 1,
  groupName: 'Topping Mì Cay',
  requiredLabel: 'chọn đúng 1',
  reason: 'Kết nối máy in tạm gián đoạn',
  statusLabel: 'Đang phục vụ',
  methodLabel: 'Chuyển khoản QR',
  amount: '185.000đ',
  discrepancyText: '+5.000đ',
  note: 'Khách chuyển khoản bổ sung',
  fullName: 'Nguyễn Minh Quân',
  username: 'cashier01',
  weekStartDate: '2026-11-09',
  weekEndDate: '2026-11-15',
  fromDate: '2026-11-01',
  toDate: '2026-11-15',
  fileName: 'thuc-don-mau.xlsx',
  importId: 42,
  actionTitle: 'Tạm ngưng nhân viên',
  actionVerb: 'huỷ hoá đơn',
  detail: 'Hồ sơ sẽ được cập nhật trạng thái ngay lập tức.',
  accountNote: ' cùng tài khoản cashier01',
  wifiSsid: 'MiCay_Khach_5G',
  currentDistanceM: 85,
  maxDistanceM: 50,
  updatedCount: 28,
  createdCount: 5,
  skippedCount: 0,
  targetCount: 15,
};

function buildPreviewVars(variables: readonly string[]): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const key of variables) {
    result[key] = SAMPLE_PREVIEW_VARS[key] ?? `[${key}]`;
  }
  return result;
}

function resolvePreviewToastVariant(item: MessageCatalogItem): ToastVariant {
  if (
    item.kind === 'error' ||
    /(Error|mismatch|tooShort|missing|Denied|OutOfRange|Required|Invalid|Duplicate|Blocked|duplicate|invalid|Occupied)/i.test(
      item.key,
    )
  ) {
    return 'destructive';
  }
  if (item.key.includes('Success') || item.kind === 'status') {
    return 'success';
  }
  return 'info';
}

const KIND_BADGE_CLASSES: Record<MessageKind, string> = {
  banner: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  status: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  blocker: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300',
  toast: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300',
  confirm: 'border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function isItemOverridden(
  item: MessageCatalogItem,
  override: StoreMessageOverride | undefined,
): boolean {
  if (!override) return false;
  const trimmedTitle = typeof override.title === 'string' ? override.title.trim() : '';
  const hasCustomTitle = trimmedTitle.length > 0 && trimmedTitle !== item.defaultTitle;
  const trimmedDesc = typeof override.description === 'string' ? override.description.trim() : '';
  const hasCustomDesc =
    item.defaultDescription !== undefined &&
    trimmedDesc.length > 0 &&
    trimmedDesc !== item.defaultDescription;
  return hasCustomTitle || hasCustomDesc;
}

interface ActiveCursorState {
  field: 'title' | 'description';
  start: number;
  end: number;
}

export function MessageCatalogEditor({
  draftMessages,
  onChangeMessages,
  disabled = false,
  fixedModule,
  title,
  description,
}: MessageCatalogEditorProps) {
  const [selectedModule, setSelectedModule] = React.useState<MessageModule | 'ALL'>(
    fixedModule ?? 'QR_CUSTOMER',
  );
  const [hasExplicitModule, setHasExplicitModule] = React.useState(Boolean(fixedModule));
  const [searchQuery, setSearchQuery] = React.useState('');
  const [onlyOverridden, setOnlyOverridden] = React.useState(false);
  const [errorGalleryOpen, setErrorGalleryOpen] = React.useState(false);

  const titleInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const descInputRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  const cursorByKeyRef = React.useRef<Record<string, ActiveCursorState>>({});

  const activeModule: MessageModule | 'ALL' = fixedModule ?? selectedModule;

  const baseItems = React.useMemo(
    () =>
      fixedModule
        ? MESSAGE_CATALOG.filter((item) => item.module === fixedModule)
        : [...MESSAGE_CATALOG],
    [fixedModule],
  );

  const issuesByKey = React.useMemo(() => {
    const map = new Map<string, MessageValidationIssue[]>();
    for (const item of baseItems) {
      const override = draftMessages[item.key];
      if (!override) continue;
      const issues = validateMessagePlaceholders(item.key, override);
      if (issues.length > 0) {
        map.set(item.key, issues);
      }
    }
    return map;
  }, [baseItems, draftMessages]);

  const moduleStats = React.useMemo(() => {
    const counts: Record<string, { total: number; overridden: number }> = {
      ALL: { total: baseItems.length, overridden: 0 },
    };
    for (const mod of MessageModuleValues) {
      counts[mod] = { total: 0, overridden: 0 };
    }
    for (const item of baseItems) {
      const modCount = counts[item.module];
      modCount.total += 1;
      if (isItemOverridden(item, draftMessages[item.key])) {
        modCount.overridden += 1;
        counts.ALL.overridden += 1;
      }
    }
    return counts;
  }, [baseItems, draftMessages]);

  const filteredItems = React.useMemo(() => {
    return baseItems.filter((item) => {
      if (activeModule !== 'ALL' && item.module !== activeModule) {
        return false;
      }
      const override = draftMessages[item.key];
      const itemIssues = issuesByKey.get(item.key);
      if (onlyOverridden && !isItemOverridden(item, override) && !itemIssues) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        return matchesVietnameseQuery(
          searchQuery,
          item.key,
          item.label,
          item.defaultTitle,
          item.defaultDescription,
          override?.title,
          override?.description,
        );
      }
      return true;
    });
  }, [activeModule, baseItems, draftMessages, issuesByKey, onlyOverridden, searchQuery]);

  const updateItemField = React.useCallback(
    (item: MessageCatalogItem, field: 'title' | 'description', nextValue: string) => {
      onChangeMessages((prev) => {
        const existing = prev[item.key] ?? {};
        const candidate: StoreMessageOverride = { ...existing, [field]: nextValue };
        const nextTitle = 'title' in candidate ? candidate.title : undefined;
        const nextDesc = 'description' in candidate ? candidate.description : undefined;

        const isTitleDefault = nextTitle === undefined || nextTitle === item.defaultTitle;
        const isDescDefault =
          item.defaultDescription === undefined ||
          nextDesc === undefined ||
          nextDesc === item.defaultDescription;

        const nextMap: StoreMessagesMap = { ...prev };
        if (isTitleDefault && isDescDefault) {
          delete nextMap[item.key];
        } else {
          const cleaned: StoreMessageOverride = {};
          if (!isTitleDefault && nextTitle !== undefined) {
            cleaned.title = nextTitle;
          }
          if (!isDescDefault && item.defaultDescription !== undefined && nextDesc !== undefined) {
            cleaned.description = nextDesc;
          }
          nextMap[item.key] = cleaned;
        }
        return nextMap;
      });
    },
    [onChangeMessages],
  );

  const handleResetItem = React.useCallback(
    (key: string) => {
      onChangeMessages((prev) => {
        if (!(key in prev)) return prev;
        const nextMap = { ...prev };
        delete nextMap[key];
        return nextMap;
      });
    },
    [onChangeMessages],
  );

  const handleResetModule = React.useCallback(
    (mod: MessageModule) => {
      onChangeMessages((prev) => {
        const nextMap = { ...prev };
        let changed = false;
        for (const key of Object.keys(nextMap)) {
          const catalogItem = MESSAGE_CATALOG_BY_KEY.get(key);
          if (catalogItem?.module === mod) {
            delete nextMap[key];
            changed = true;
          }
        }
        return changed ? nextMap : prev;
      });
    },
    [onChangeMessages],
  );

  const handleInsertVariable = React.useCallback(
    (item: MessageCatalogItem, variableName: string) => {
      if (disabled) return;
      const token = `{${variableName}}`;
      const override = draftMessages[item.key];
      const hasDescription = item.defaultDescription !== undefined;
      const recorded = cursorByKeyRef.current[item.key];
      const targetField: 'title' | 'description' =
        recorded?.field === 'description' && hasDescription ? 'description' : 'title';

      const currentText =
        targetField === 'description'
          ? override && 'description' in override
            ? (override.description ?? '')
            : (item.defaultDescription ?? '')
          : override && 'title' in override
            ? (override.title ?? '')
            : item.defaultTitle;

      const start =
        recorded && recorded.field === targetField
          ? Math.max(0, Math.min(recorded.start, currentText.length))
          : currentText.length;
      const end =
        recorded && recorded.field === targetField
          ? Math.max(start, Math.min(recorded.end, currentText.length))
          : currentText.length;

      const nextValue = `${currentText.slice(0, start)}${token}${currentText.slice(end)}`;
      const nextCaret = start + token.length;
      cursorByKeyRef.current[item.key] = {
        field: targetField,
        start: nextCaret,
        end: nextCaret,
      };

      updateItemField(item, targetField, nextValue);

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          const el =
            targetField === 'description'
              ? descInputRefs.current[item.key]
              : titleInputRefs.current[item.key];
          if (el) {
            el.focus();
            try {
              el.setSelectionRange(nextCaret, nextCaret);
            } catch {
              // Ignore selection errors in simulated DOM environments
            }
          }
        });
      }
    },
    [disabled, draftMessages, updateItemField],
  );

  const recordSelection = (
    key: string,
    field: 'title' | 'description',
    el: HTMLInputElement | HTMLTextAreaElement,
  ) => {
    cursorByKeyRef.current[key] = {
      field,
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  };

  const scopeOverrideCount = fixedModule
    ? (moduleStats[fixedModule]?.overridden ?? 0)
    : moduleStats.ALL.overridden;

  const activeModuleOverrideCount =
    activeModule !== 'ALL' ? (moduleStats[activeModule]?.overridden ?? 0) : 0;

  const totalErrorCount = issuesByKey.size;

  return (
    <div
      data-testid={fixedModule ? `message-editor-${fixedModule}` : 'message-catalog-editor'}
      className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquareText className="h-4 w-4 shrink-0 text-accent-text" />
            <h3 className="text-sm sm:text-base font-bold text-foreground">
              {title ??
                (fixedModule
                  ? `Thông báo & Pop-up hiển thị cho khách (${MESSAGE_MODULE_LABELS[fixedModule]})`
                  : 'Quản lý Toàn bộ Thông báo, Pop-up & Mã lỗi theo Module')}
            </h3>
            {scopeOverrideCount > 0 ? (
              <Badge variant="secondary" className="text-[11px] font-semibold text-accent-text">
                {scopeOverrideCount} đang tuỳ chỉnh
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description ??
              'Chỉnh sửa câu chữ hiển thị ở thông báo nổi (Toast), banner cảnh báo, màn hình chặn và hộp thoại xác nhận. Hệ thống chỉ lưu các mục được bạn sửa khác mặc định và tự động đồng bộ realtime.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!fixedModule ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="open-error-gallery-btn"
              onClick={() => setErrorGalleryOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Xem trước Màn hình Lỗi HTTP (18 mã)</span>
            </Button>
          ) : null}

          {activeModule !== 'ALL' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={`msg-reset-module-${activeModule}`}
              disabled={disabled || activeModuleOverrideCount === 0}
              onClick={() => handleResetModule(activeModule)}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Khôi phục mặc định nhóm này</span>
            </Button>
          ) : null}
        </div>
      </div>

      {totalErrorCount > 0 ? (
        <div
          role="alert"
          data-testid={
            fixedModule
              ? `msg-validation-summary-${fixedModule}`
              : 'msg-catalog-validation-summary'
          }
          className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Có <strong>{totalErrorCount}</strong> mục thông báo chứa biến <code>{'{var}'}</code> không hợp lệ hoặc vượt giới hạn ký tự. Vui lòng kiểm tra các khung viền đỏ bên dưới trước khi Lưu cấu hình.
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const next = e.target.value;
              setSearchQuery(next);
              if (!fixedModule && !hasExplicitModule && next.trim().length > 0) {
                setSelectedModule('ALL');
              }
            }}
            data-testid={fixedModule ? `msg-search-${fixedModule}` : 'msg-catalog-search'}
            placeholder="Tìm thông báo theo nội dung, tên hoặc mã (hỗ trợ không dấu)..."
            className="h-9 pl-9 pr-8 text-xs sm:text-sm"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xoá từ khoá tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <Button
          type="button"
          size="sm"
          variant={onlyOverridden ? 'default' : 'outline'}
          data-testid={
            fixedModule ? `msg-only-overridden-${fixedModule}` : 'msg-catalog-only-overridden'
          }
          onClick={() => setOnlyOverridden((prev) => !prev)}
          className="h-9 shrink-0 gap-1.5 text-xs"
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Chỉ hiện mục đã sửa ({scopeOverrideCount})</span>
        </Button>
      </div>

      {!fixedModule ? (
        <div
          role="tablist"
          aria-label="Lọc thông báo theo module"
          className="flex flex-wrap gap-1.5 border-b pb-3"
        >
          <button
            type="button"
            data-testid="msg-module-pill-ALL"
            onClick={() => {
              setSelectedModule('ALL');
              setHasExplicitModule(true);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
              activeModule === 'ALL'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span>Tất cả ({moduleStats.ALL.total})</span>
            {moduleStats.ALL.overridden > 0 ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeModule === 'ALL'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-background text-accent-text',
                )}
              >
                {moduleStats.ALL.overridden}
              </span>
            ) : null}
          </button>

          {MessageModuleValues.map((mod) => {
            const stat = moduleStats[mod];
            const isSelected = activeModule === mod;
            return (
              <button
                key={mod}
                type="button"
                data-testid={`msg-module-pill-${mod}`}
                onClick={() => {
                  setSelectedModule(mod);
                  setHasExplicitModule(true);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-border bg-background text-foreground/85 hover:bg-muted/70',
                )}
              >
                <span>
                  {MESSAGE_MODULE_LABELS[mod]} ({stat.total})
                </span>
                {stat.overridden > 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                      isSelected
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-accent-text',
                    )}
                  >
                    {stat.overridden}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
          <Bell className="mb-2 h-6 w-6 text-muted-foreground/70" />
          <p className="text-sm font-semibold text-foreground">
            Không tìm thấy thông báo phù hợp
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Thử đổi từ khoá tìm kiếm hoặc tắt bộ lọc "Chỉ hiện mục đã sửa".
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const override = draftMessages[item.key];
            const customized = isItemOverridden(item, override);
            const itemIssues = issuesByKey.get(item.key) ?? [];
            const hasError = itemIssues.length > 0;
            const titleValue =
              override && 'title' in override ? (override.title ?? '') : item.defaultTitle;
            const hasDescription = item.defaultDescription !== undefined;
            const descValue =
              hasDescription && override && 'description' in override
                ? (override.description ?? '')
                : (item.defaultDescription ?? '');

            return (
              <div
                key={item.key}
                data-testid={`msg-item-${item.key}`}
                className={cn(
                  'min-w-0 space-y-3 rounded-xl border p-3.5 transition-colors',
                  hasError
                    ? 'border-destructive/70 bg-destructive/5'
                    : customized
                      ? 'border-primary/40 bg-muted/20'
                      : 'border-border bg-background/50',
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          KIND_BADGE_CLASSES[item.kind],
                        )}
                      >
                        {MESSAGE_KIND_LABELS[item.kind]}
                      </span>
                      {!fixedModule && activeModule === 'ALL' ? (
                        <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {MESSAGE_MODULE_LABELS[item.module]}
                        </span>
                      ) : null}
                      {customized ? (
                        <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
                          <Sparkles className="h-2.5 w-2.5" />
                          Đã tuỳ chỉnh
                        </span>
                      ) : null}
                    </div>

                    <div className="text-sm font-semibold text-foreground leading-snug">
                      {item.label}
                    </div>
                    <div className="break-all font-mono text-[11px] text-muted-foreground">
                      {item.key}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`msg-preview-${item.key}`}
                      onClick={() => {
                        const resolved = resolveStoreMessage(
                          draftMessages,
                          item.key,
                          buildPreviewVars(item.variables),
                        );
                        previewResolvedToast(resolved, resolvePreviewToastVariant(item));
                      }}
                      className="h-8 gap-1 px-2.5 text-xs"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Xem thử Toast</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`msg-reset-${item.key}`}
                      disabled={disabled || override === undefined}
                      onClick={() => handleResetItem(item.key)}
                      className="h-8 gap-1 px-2.5 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Khôi phục</span>
                    </Button>
                  </div>
                </div>

                {item.variables.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Biến động (bấm để chèn tại con trỏ):
                    </span>
                    {item.variables.map((variableName) => (
                      <button
                        key={variableName}
                        type="button"
                        disabled={disabled}
                        data-testid={`msg-var-${item.key}-${variableName}`}
                        onClick={() => handleInsertVariable(item, variableName)}
                        className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-text hover:bg-muted disabled:opacity-50"
                      >
                        {`{${variableName}}`}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`msg-title-${item.key}`}
                        className="text-xs font-semibold text-foreground"
                      >
                        Tiêu đề / Nội dung chính
                      </label>
                      <span
                        className={cn(
                          'text-[11px] tabular-nums',
                          titleValue.trim().length > item.maxTitleLength
                            ? 'font-bold text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {titleValue.length}/{item.maxTitleLength}
                      </span>
                    </div>
                    <Input
                      id={`msg-title-${item.key}`}
                      ref={(el) => {
                        titleInputRefs.current[item.key] = el;
                      }}
                      data-testid={`msg-title-input-${item.key}`}
                      disabled={disabled}
                      value={titleValue}
                      placeholder={item.defaultTitle}
                      onFocus={(e) => recordSelection(item.key, 'title', e.currentTarget)}
                      onClick={(e) => recordSelection(item.key, 'title', e.currentTarget)}
                      onKeyUp={(e) => recordSelection(item.key, 'title', e.currentTarget)}
                      onSelect={(e) => recordSelection(item.key, 'title', e.currentTarget)}
                      onChange={(e) => {
                        recordSelection(item.key, 'title', e.currentTarget);
                        updateItemField(item, 'title', e.target.value);
                      }}
                      className="h-9 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Mặc định: <span className="italic">{interpolateMessageTemplate(item.defaultTitle)}</span>
                    </p>
                  </div>

                  {hasDescription ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`msg-desc-${item.key}`}
                          className="text-xs font-semibold text-foreground"
                        >
                          Nội dung chi tiết (Description)
                        </label>
                        <span
                          className={cn(
                            'text-[11px] tabular-nums',
                            descValue.trim().length > (item.maxDescriptionLength ?? 500)
                              ? 'font-bold text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {descValue.length}/{item.maxDescriptionLength ?? 500}
                        </span>
                      </div>
                      <textarea
                        id={`msg-desc-${item.key}`}
                        ref={(el) => {
                          descInputRefs.current[item.key] = el;
                        }}
                        data-testid={`msg-desc-input-${item.key}`}
                        rows={2}
                        disabled={disabled}
                        value={descValue}
                        placeholder={item.defaultDescription}
                        onFocus={(e) => recordSelection(item.key, 'description', e.currentTarget)}
                        onClick={(e) => recordSelection(item.key, 'description', e.currentTarget)}
                        onKeyUp={(e) => recordSelection(item.key, 'description', e.currentTarget)}
                        onSelect={(e) => recordSelection(item.key, 'description', e.currentTarget)}
                        onChange={(e) => {
                          recordSelection(item.key, 'description', e.currentTarget);
                          updateItemField(item, 'description', e.target.value);
                        }}
                        className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      {item.defaultDescription ? (
                        <p className="text-[11px] text-muted-foreground">
                          Mặc định: <span className="italic">{item.defaultDescription}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {hasError ? (
                  <div
                    role="alert"
                    data-testid={`msg-error-${item.key}`}
                    className="space-y-0.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive"
                  >
                    {itemIssues.map((issue, idx) => (
                      <div key={idx}>{issue.message}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {!fixedModule ? (
        <ErrorGalleryDialog
          open={errorGalleryOpen}
          onOpenChange={setErrorGalleryOpen}
          customMessages={draftMessages}
        />
      ) : null}
    </div>
  );
}
