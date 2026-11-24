import { type ColumnDef } from '@tanstack/react-table';
import { type MdmCategory, type MdmItem } from '@fnb/shared';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { BaseTable } from '@/components/base-table/base-table';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useAuthStore } from '@/stores/auth.store';
import { normalizeVietnameseText } from '@/utils/search';

import {
  useCreateMdmMutation,
  useDeleteMdmMutation,
  useMdmListQuery,
  usePatchMdmItemMutation,
  useUpdateMdmMutation,
} from '../api/master-data.api';

const TAB_CATEGORIES: { value: MdmCategory; label: string }[] = [
  { value: 'MENU_CATEGORY', label: 'Danh mục Thực đơn' },
  { value: 'POSITION', label: 'Chức vụ' },
  { value: 'SPECIALTY', label: 'Chuyên môn' },
  { value: 'INGREDIENT', label: 'Nguyên liệu' },
  { value: 'UNIT', label: 'Đơn vị tính' },
  { value: 'SUPPLIER', label: 'Nhà cung cấp' },
];

const STATION_LABELS: Record<string, string> = {
  BEP_NAU: 'Bếp nấu',
  BEP_CHIEN: 'Bếp chiên',
  PHA_CHE: 'Pha chế',
  COMBO: 'Combo',
};

function sanitizeNormalizedInput(raw: string): string {
  return normalizeVietnameseText(raw).replace(/\s+/g, ' ');
}

function renderMetadataSummary(category: MdmCategory, meta: Record<string, unknown> | undefined) {
  if (!meta || Object.keys(meta).length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const sortOrder = typeof meta.sortOrder === 'number' ? meta.sortOrder : null;

  if (category === 'MENU_CATEGORY') {
    const stationKey = typeof meta.defaultStation === 'string' ? meta.defaultStation : '';
    const stationLabel = STATION_LABELS[stationKey] ?? stationKey;
    const isHidden = meta.isHidden === true;
    const description = typeof meta.description === 'string' ? meta.description.trim() : '';

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {stationLabel ? (
          <Badge variant="outline" className="text-xs font-semibold">
            {stationLabel}
          </Badge>
        ) : null}
        {sortOrder !== null ? (
          <span className="text-[11px] font-medium text-muted-foreground">#{sortOrder}</span>
        ) : null}
        {isHidden ? (
          <Badge variant="secondary" className="text-[10px]">
            Ẩn POS/QR
          </Badge>
        ) : null}
        {description ? (
          <span className="text-xs leading-snug text-muted-foreground break-words" title={description}>
            {description}
          </span>
        ) : null}
      </div>
    );
  }

  if (category === 'INGREDIENT') {
    const defaultUnit = typeof meta.default_unit === 'string' ? meta.default_unit.trim() : '';
    const lastPrice = typeof meta.last_price === 'number' ? meta.last_price : null;
    const description = typeof meta.description === 'string' ? meta.description.trim() : '';

    if (sortOrder === null && !defaultUnit && lastPrice === null && !description) {
      return <span className="text-muted-foreground">—</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {sortOrder !== null ? (
          <span className="text-[11px] font-medium text-muted-foreground">#{sortOrder}</span>
        ) : null}
        {defaultUnit ? (
          <Badge variant="outline" className="text-[11px] font-semibold">
            ĐVT: {defaultUnit}
          </Badge>
        ) : null}
        {lastPrice !== null ? (
          <span className="font-semibold text-price tabular-nums">
            {lastPrice.toLocaleString('vi-VN')}đ
          </span>
        ) : null}
        {description ? (
          <span className="leading-snug text-muted-foreground break-words" title={description}>
            {description}
          </span>
        ) : null}
      </div>
    );
  }

  const description =
    typeof meta.description === 'string'
      ? meta.description.trim()
      : typeof meta.note === 'string'
        ? meta.note.trim()
        : '';

  if (sortOrder !== null || description) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {sortOrder !== null ? (
          <span className="text-[11px] font-medium text-muted-foreground">#{sortOrder}</span>
        ) : null}
        {description ? (
          <span className="text-xs leading-snug text-muted-foreground break-words" title={description}>
            {description}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <span
      className="font-mono text-xs leading-snug text-muted-foreground break-all block max-w-full"
      title={JSON.stringify(meta)}
    >
      {JSON.stringify(meta)}
    </span>
  );
}

export function MasterDataPage() {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.isSuperAdmin || Boolean(user?.permissions?.mdm?.create);
  const canUpdate = user?.isSuperAdmin || Boolean(user?.permissions?.mdm?.update);
  const canDelete = user?.isSuperAdmin || Boolean(user?.permissions?.mdm?.delete);
  const canModifyAny = canUpdate || canDelete;

  const [activeTab, setActiveTab] = React.useState<MdmCategory>('POSITION');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [keyword, setKeyword] = React.useState('');

  const [upsertOpen, setUpsertOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<MdmItem | null>(null);
  const [formName, setFormName] = React.useState('');
  const [formNormalizedName, setFormNormalizedName] = React.useState('');
  const [isNormalizedSynced, setIsNormalizedSynced] = React.useState(true);
  const [formStation, setFormStation] = React.useState<string>('BEP_NAU');
  const [formSortOrder, setFormSortOrder] = React.useState<string>('0');
  const [formIsHidden, setFormIsHidden] = React.useState<boolean>(false);
  const [formDefaultUnit, setFormDefaultUnit] = React.useState<string>('');
  const [formLastPrice, setFormLastPrice] = React.useState<string>('');
  const [formDescription, setFormDescription] = React.useState<string>('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null);

  const mdmQuery = useMdmListQuery({
    category: activeTab,
    page,
    limit,
    keyword: keyword || undefined,
    activeOnly: false,
  });
  const { data, isLoading } = mdmQuery;

  const createMutation = useCreateMdmMutation();
  const updateMutation = useUpdateMdmMutation(editingItem?.id ?? 0);
  const patchItemMutation = usePatchMdmItemMutation();
  const deleteMutation = useDeleteMdmMutation();

  const handleTabChange = (val: string) => {
    setActiveTab(val as MdmCategory);
    setPage(1);
    setKeyword('');
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormNormalizedName('');
    setIsNormalizedSynced(true);
    setFormStation('BEP_NAU');
    setFormSortOrder(activeTab === 'MENU_CATEGORY' ? '0' : '');
    setFormIsHidden(false);
    setFormDefaultUnit('');
    setFormLastPrice('');
    setFormDescription('');
    setFormError(null);
    setUpsertOpen(true);
  };

  const handleOpenEdit = (item: MdmItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormNormalizedName(item.normalizedName);
    setIsNormalizedSynced(false);
    const meta = item.metadata ?? {};
    setFormStation(typeof meta.defaultStation === 'string' ? meta.defaultStation : 'BEP_NAU');
    setFormSortOrder(
      typeof meta.sortOrder === 'number'
        ? String(meta.sortOrder)
        : activeTab === 'MENU_CATEGORY'
          ? '0'
          : '',
    );
    setFormIsHidden(meta.isHidden === true);
    setFormDefaultUnit(typeof meta.default_unit === 'string' ? meta.default_unit : '');
    setFormLastPrice(typeof meta.last_price === 'number' ? String(meta.last_price) : '');
    setFormDescription(
      typeof meta.description === 'string'
        ? meta.description
        : typeof meta.note === 'string'
          ? meta.note
          : '',
    );
    setFormError(null);
    setUpsertOpen(true);
  };

  const handleNameChange = (nextName: string) => {
    setFormName(nextName);
    if (isNormalizedSynced) {
      setFormNormalizedName(sanitizeNormalizedInput(nextName));
    }
  };

  const handleToggleStatus = React.useCallback(
    async (item: MdmItem) => {
      if (!canUpdate || togglingId === item.id) return;
      setTogglingId(item.id);
      try {
        await patchItemMutation.mutateAsync({
          id: item.id,
          body: { isActive: !item.isActive },
        });
        notify('mdm.updateSuccess', { variant: 'success' });
      } catch (error) {
        const resolved = resolveErrorMessage(
          'mdm.saveError',
          error,
          'Không thể thay đổi trạng thái danh mục',
        );
        notify('mdm.saveError', {
          variant: 'destructive',
          vars: { reason: resolved.description ?? 'Không thể thay đổi trạng thái danh mục' },
        });
      } finally {
        setTogglingId(null);
      }
    },
    [canUpdate, notify, patchItemMutation, resolveErrorMessage, togglingId],
  );

  const handleSubmitUpsert = async () => {
    setFormError(null);
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Vui lòng nhập tên hiển thị.');
      notify('mdm.missingName', { variant: 'destructive' });
      return;
    }

    const cleanNormalized = sanitizeNormalizedInput(formNormalizedName || trimmedName);
    if (!cleanNormalized) {
      setFormError('Tên không dấu không được để trống.');
      return;
    }
    if (/[^\x20-\x7E]/.test(cleanNormalized) || cleanNormalized.startsWith('__internal_')) {
      setFormError('Tên không dấu chỉ được dùng ký tự ASCII không dấu hợp lệ.');
      return;
    }

    const baseMeta: Record<string, unknown> = { ...(editingItem?.metadata ?? {}) };
    if (formDescription.trim()) {
      baseMeta.description = formDescription.trim();
    } else {
      delete baseMeta.description;
      delete baseMeta.note;
    }

    if (activeTab === 'MENU_CATEGORY') {
      const parsedSort = Number(formSortOrder || '0');
      if (!Number.isInteger(parsedSort) || parsedSort < 0) {
        setFormError('Thứ tự hiển thị phải là số nguyên không âm.');
        return;
      }
      baseMeta.defaultStation = formStation;
      baseMeta.sortOrder = parsedSort;
      baseMeta.isHidden = formIsHidden;
    } else {
      if (formSortOrder.trim() !== '') {
        const parsedSort = Number(formSortOrder);
        if (!Number.isInteger(parsedSort) || parsedSort < 0) {
          setFormError('Thứ tự hiển thị phải là số nguyên không âm.');
          return;
        }
        baseMeta.sortOrder = parsedSort;
      } else {
        delete baseMeta.sortOrder;
      }

      if (activeTab === 'INGREDIENT') {
        if (formDefaultUnit.trim()) {
          baseMeta.default_unit = formDefaultUnit.trim();
        } else {
          delete baseMeta.default_unit;
        }
        if (formLastPrice.trim() !== '') {
          const parsedPrice = Number(formLastPrice);
          if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            setFormError('Đơn giá tham khảo phải lớn hơn hoặc bằng 0.');
            return;
          }
          baseMeta.last_price = parsedPrice;
        } else {
          delete baseMeta.last_price;
        }
      }
    }

    try {
      if (editingItem) {
        await updateMutation.mutateAsync({
          name: trimmedName,
          normalizedName: cleanNormalized,
          metadata: baseMeta,
        });
        notify('mdm.updateSuccess', { variant: 'success' });
      } else {
        await createMutation.mutateAsync({
          category: activeTab,
          name: trimmedName,
          normalizedName: cleanNormalized,
          metadata: baseMeta,
        });
        notify('mdm.createSuccess', { variant: 'success' });
      }
      setUpsertOpen(false);
    } catch (error) {
      const resolved = resolveErrorMessage('mdm.saveError', error, 'Không thể lưu danh mục');
      const reason = resolved.description ?? 'Không thể lưu danh mục';
      setFormError(reason);
      notify('mdm.saveError', {
        variant: 'destructive',
        vars: { reason },
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId === null) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirmId);
      notify('mdm.deleteSuccess', { variant: 'success' });
    } catch (error) {
      const resolved = resolveErrorMessage(
        'mdm.deleteError',
        error,
        'Không thể xoá danh mục đang có dữ liệu liên kết',
      );
      notify('mdm.deleteError', {
        variant: 'destructive',
        vars: { reason: resolved.description ?? 'Không thể xoá danh mục đang có dữ liệu liên kết' },
      });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const columns = React.useMemo<ColumnDef<MdmItem, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 50,
        enableResizing: false,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'name',
        header: 'Tên hiển thị',
        size: 190,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'normalizedName',
        header: 'Tên không dấu',
        size: 165,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.normalizedName}
          </span>
        ),
      },
      {
        id: 'metadata',
        header: 'Thông tin phụ',
        size: 200,
        cell: ({ row }) => renderMetadataSummary(row.original.category ?? activeTab, row.original.metadata),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        size: 130,
        cell: ({ row }) => {
          const item = row.original;
          if (!canUpdate) {
            return (
              <Badge variant={item.isActive ? 'success' : 'secondary'}>
                {item.isActive ? 'Hoạt động' : 'Ngưng'}
              </Badge>
            );
          }
          return (
            <button
              type="button"
              data-testid={`toggle-mdm-status-${item.id}`}
              disabled={togglingId === item.id}
              title={item.isActive ? 'Bấm để chuyển sang Ngưng' : 'Bấm để bật lại Hoạt động'}
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleStatus(item);
              }}
              className="inline-flex items-center rounded-md focus:outline-none focus:ring-2 focus:ring-ring active:scale-95 transition-transform disabled:opacity-60"
            >
              <Badge
                variant={item.isActive ? 'success' : 'secondary'}
                className="cursor-pointer hover:opacity-90"
              >
                {item.isActive ? 'Hoạt động' : 'Ngưng'}
              </Badge>
            </button>
          );
        },
      },
      ...(canModifyAny
        ? [
            {
              id: 'actions',
              header: 'Thao tác',
              size: 96,
              enableResizing: false,
              cell: ({ row }: { row: { original: MdmItem } }) => (
                <div className="flex items-center gap-1">
                  {canUpdate ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Chỉnh sửa danh mục"
                      className="h-8 w-8 p-0 active:scale-95 transition-transform"
                      data-testid={`edit-mdm-btn-${row.original.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(row.original);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Xoá danh mục"
                      className="h-8 w-8 p-0 active:scale-95 transition-transform"
                      data-testid={`delete-mdm-btn-${row.original.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(row.original.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              ),
            } as ColumnDef<MdmItem, unknown>,
          ]
        : []),
    ],
    [activeTab, page, limit, canModifyAny, canUpdate, canDelete, togglingId, handleToggleStatus],
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (!data && mdmQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={mdmQuery.error}
        onRetry={() => void mdmQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        path="/master-data"
        defaultTitle="Quản trị Master Data"
        actions={
          <>
            <AuditHistoryButton module="MDM" />
            {canCreate ? (
              <Button
                data-testid="create-mdm-btn"
                size="sm"
                className="sm:h-9 font-bold shadow-xs active:scale-[0.98]"
                onClick={handleOpenCreate}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Thêm danh mục</span>
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div
          data-scroll-intended="true"
          className="w-full overflow-x-auto overscroll-contain touch-pan-x pb-1 -mb-1"
        >
          <TabsList data-testid="mdm-tab-list" className="inline-flex h-auto w-auto min-w-full sm:min-w-0 justify-start sm:justify-center p-1">
            {TAB_CATEGORIES.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                data-testid={`mdm-tab-${tab.value}`}
                className="shrink-0 min-h-9 xl:min-h-8"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TAB_CATEGORIES.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <BaseTable<MdmItem>
              tableId={`mdm-${tab.value}`}
              data={data?.items ?? []}
              columns={columns}
              isLoading={isLoading}
              isFetching={mdmQuery.isFetching}
              isPlaceholderData={mdmQuery.isPlaceholderData}
              emptyMessage={`Không có danh mục ${tab.label} nào.`}
              searchPlaceholder={`Tìm ${tab.label}...`}
              searchValue={keyword}
              onSearchChange={setKeyword}
              pagination={{
                page,
                limit,
                total: data?.total ?? 0,
                totalPages,
                onPageChange: setPage,
                onLimitChange: setLimit,
              }}
            />
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={upsertOpen} onOpenChange={setUpsertOpen}>
        <DialogContent data-testid="mdm-upsert-dialog">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? `Chỉnh sửa tên hiển thị, tên không dấu và thông tin phụ của: ${editingItem.name}`
                : `Thêm mới vào danh mục ${TAB_CATEGORIES.find((t) => t.value === activeTab)?.label}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="mdm-name-input" className="text-xs font-semibold text-muted-foreground">
                Tên hiển thị *
              </label>
              <Input
                id="mdm-name-input"
                data-testid="mdm-name-input"
                value={formName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Nhập tên danh mục (VD: Mì cay, Bánh mì chảo)..."
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="mdm-normalized-name-input" className="text-xs font-semibold text-muted-foreground">
                  Tên không dấu *
                </label>
                <button
                  type="button"
                  data-testid="mdm-sync-normalized-btn"
                  onClick={() => {
                    setFormNormalizedName(sanitizeNormalizedInput(formName));
                    setIsNormalizedSynced(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-text hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Đồng bộ từ tên</span>
                </button>
              </div>
              <Input
                id="mdm-normalized-name-input"
                data-testid="mdm-normalized-name-input"
                value={formNormalizedName}
                onChange={(e) => {
                  setIsNormalizedSynced(false);
                  setFormNormalizedName(e.target.value);
                }}
                placeholder="VD: mi cay kim chi han quoc"
                className="font-mono text-xs"
              />
            </div>

            {activeTab === 'MENU_CATEGORY' ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Thông tin phụ — Khu vực Bếp mặc định
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(STATION_LABELS).map(([stationKey, stationLabel]) => (
                      <button
                        key={stationKey}
                        type="button"
                        data-testid={`mdm-station-btn-${stationKey}`}
                        onClick={() => setFormStation(stationKey)}
                        className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                          formStation === stationKey
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                            : 'border-border bg-card text-foreground hover:bg-accent'
                        }`}
                      >
                        {stationLabel}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="mdm-sort-order-input" className="text-xs font-semibold text-muted-foreground">
                      Thứ tự hiển thị
                    </label>
                    <Input
                      id="mdm-sort-order-input"
                      data-testid="mdm-sort-order-input"
                      type="number"
                      min={0}
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="mdm-hidden-checkbox"
                        checked={formIsHidden}
                        onChange={(e) => setFormIsHidden(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>Ẩn danh mục trên POS / QR</span>
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="mdm-description-input" className="text-xs font-semibold text-muted-foreground">
                    Ghi chú phụ (tuỳ chọn)
                  </label>
                  <Input
                    id="mdm-description-input"
                    data-testid="mdm-description-input"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Ghi chú thêm cho danh mục..."
                  />
                </div>
              </div>
            ) : activeTab === 'INGREDIENT' ? (
              <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="mdm-default-unit-input" className="text-xs font-semibold text-muted-foreground">
                      Thông tin phụ — ĐVT mặc định
                    </label>
                    <Input
                      id="mdm-default-unit-input"
                      data-testid="mdm-default-unit-input"
                      value={formDefaultUnit}
                      onChange={(e) => setFormDefaultUnit(e.target.value)}
                      placeholder="VD: Kg, Thùng, Gói..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="mdm-last-price-input" className="text-xs font-semibold text-muted-foreground">
                      Đơn giá gần nhất (đ)
                    </label>
                    <Input
                      id="mdm-last-price-input"
                      data-testid="mdm-last-price-input"
                      type="number"
                      min={0}
                      value={formLastPrice}
                      onChange={(e) => setFormLastPrice(e.target.value)}
                      placeholder="VD: 175000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="mdm-description-input" className="text-xs font-semibold text-muted-foreground">
                      Ghi chú phụ (tuỳ chọn)
                    </label>
                    <Input
                      id="mdm-description-input"
                      data-testid="mdm-description-input"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Ghi chú nguyên liệu..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="mdm-sort-order-input" className="text-xs font-semibold text-muted-foreground">
                      Thứ tự hiển thị
                    </label>
                    <Input
                      id="mdm-sort-order-input"
                      data-testid="mdm-sort-order-input"
                      type="number"
                      min={0}
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(e.target.value)}
                      placeholder="Tuỳ chọn"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="mdm-description-input" className="text-xs font-semibold text-muted-foreground">
                    Thông tin phụ (Ghi chú / Mô tả)
                  </label>
                  <Input
                    id="mdm-description-input"
                    data-testid="mdm-description-input"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Nhập ghi chú hoặc thông tin bổ sung..."
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="mdm-sort-order-input" className="text-xs font-semibold text-muted-foreground">
                    Thứ tự hiển thị
                  </label>
                  <Input
                    id="mdm-sort-order-input"
                    data-testid="mdm-sort-order-input"
                    type="number"
                    min={0}
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    placeholder="Tuỳ chọn"
                  />
                </div>
              </div>
            )}

            {formError ? (
              <div
                role="alert"
                data-testid="mdm-form-error"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300"
              >
                {formError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="font-semibold active:scale-[0.98] transition-transform select-none"
              onClick={() => setUpsertOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              data-testid="submit-mdm-btn"
              className="font-bold active:scale-[0.98] transition-transform select-none shadow-xs"
              onClick={handleSubmitUpsert}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingItem ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent data-testid="delete-mdm-dialog">
          {(() => {
            const deleteConfirmCopy = resolveMessage('mdm.confirm.delete');
            return (
              <DialogHeader>
                <DialogTitle>{deleteConfirmCopy.title}</DialogTitle>
                <DialogDescription>{deleteConfirmCopy.description}</DialogDescription>
              </DialogHeader>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="font-semibold active:scale-[0.98] transition-transform select-none"
              onClick={() => setDeleteConfirmId(null)}
            >
              Huỷ bỏ
            </Button>
            <Button
              variant="destructive"
              className="font-semibold active:scale-[0.98] transition-transform select-none shadow-xs"
              data-testid="confirm-delete-mdm-btn"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              Xác nhận xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
