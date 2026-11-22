import { type ColumnDef } from '@tanstack/react-table';
import { type ImportMenuExcelItem, type Product, type ProductStation } from '@fnb/shared';
import {
  FileSpreadsheet,
  FileUp,
  FolderKanban,
  Layers,
  Pencil,
  RefreshCw,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
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
import { SearchableFilterDropdown } from '@/components/ui/searchable-filter-dropdown';
import { useAppMessages } from '@/hooks/use-app-messages';
import { exportToExcel, parseExcelFile } from '@/lib/excel-export';
import { getStationBadgeClassName, parseStationOptions, useMenuSyncListener } from '@/lib/menu-sync';
import { useAuthStore } from '@/stores/auth.store';
import { matchesVietnameseQuery, normalizeVietnameseText } from '@/utils/search';

import {
  useDeleteProductMutation,
  useImportMenuExcelMutation,
  useMenuCategoriesQuery,
  useMenuProductsQuery,
  useMenuStationsQuery,
  useUpdateProductMutation,
} from '../api/menu-admin.api';
import { CategoryManageDialog } from './category-manage-dialog';
import { ProductFormDrawer } from './product-form-drawer';
import { StationManageDialog } from './station-manage-dialog';

function normalizeMenuImportKey(value: string): string {
  return normalizeVietnameseText(value).replace(/\s+/g, ' ');
}

function parseExcelPrice(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

export function MenuManagementPage() {
  useMenuSyncListener();

  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canCreateMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.create);
  const canUpdateMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.update);
  const canDeleteMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.delete);
  const canManageStations = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.manageStations);
  const canManageCategories = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.manageCategories);
  const canImportMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.import);
  const canExportMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.export);

  const productsQuery = useMenuProductsQuery();
  const products = productsQuery.data ?? [];
  const isLoading = productsQuery.isLoading;
  const { data: categories = [] } = useMenuCategoriesQuery();
  const { data: rawStations } = useMenuStationsQuery();

  const stations = React.useMemo(() => parseStationOptions(rawStations), [rawStations]);

  const stationNameMap = React.useMemo(() => {
    const map: Record<string, string> = {
      BEP_NAU: 'Bếp nấu',
      BEP_CHIEN: 'Bếp chiên',
      PHA_CHE: 'Pha chế',
      COMBO: 'Combo',
    };
    for (const st of stations) {
      map[st.code] = st.name;
    }
    return map;
  }, [stations]);

  const updateProductMutation = useUpdateProductMutation();
  const deleteProductMutation = useDeleteProductMutation();
  const importMenuMutation = useImportMenuExcelMutation();
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  const [selectedStation, setSelectedStation] = React.useState<'ALL' | ProductStation>('ALL');
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<number | 'ALL'>('ALL');
  const [keyword, setKeyword] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(50);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
  const [stationDialogOpen, setStationDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);
  const [importPreview, setImportPreview] = React.useState<{
    filename: string;
    items: ImportMenuExcelItem[];
    createCount: number;
    updateCount: number;
    deleteCount: number;
  } | null>(null);

  const visibleCategories = React.useMemo(() => {
    const filtered =
      selectedStation === 'ALL'
        ? categories
        : categories.filter((cat) => {
            const defaultStation = cat.metadata?.defaultStation;
            return !defaultStation || defaultStation === selectedStation;
          });
    return [...filtered].sort((a, b) => {
      const sortA = typeof a.metadata?.sortOrder === 'number' ? a.metadata.sortOrder : 999;
      const sortB = typeof b.metadata?.sortOrder === 'number' ? b.metadata.sortOrder : 999;
      if (sortA !== sortB) return sortA - sortB;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [categories, selectedStation]);

  const filteredProducts = React.useMemo(() => {
    return products.filter((item) => {
      if (selectedStation !== 'ALL' && item.station !== selectedStation) return false;
      if (selectedCategoryId !== 'ALL' && item.categoryId !== selectedCategoryId) return false;
      if (keyword.trim() && !matchesVietnameseQuery(keyword, item.name, item.subtitle, item.categoryName)) {
        return false;
      }
      return true;
    });
  }, [products, selectedStation, selectedCategoryId, keyword]);

  const pagedProducts = React.useMemo(() => {
    const start = (page - 1) * limit;
    return filteredProducts.slice(start, start + limit);
  }, [filteredProducts, page, limit]);

  const handleToggleAvailability = async (product: Product) => {
    if (!canUpdateMenu) return;
    try {
      await updateProductMutation.mutateAsync({
        id: product.id,
        body: {
          isAvailable: !product.isAvailable,
          ...(product.station === 'COMBO'
            ? { station: product.station, comboItems: product.comboItems }
            : {}),
        },
      });
      notify(
        !product.isAvailable
          ? 'menu.product.toggleVisibleSuccess'
          : 'menu.product.toggleHiddenSuccess',
        { variant: 'info', vars: { productName: product.name } },
      );
    } catch {
      notify('menu.product.toggleError', { variant: 'destructive' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await deleteProductMutation.mutateAsync(deleteTarget.id);
      if (res.softDisabled) {
        notify('menu.product.softHiddenWarning', {
          variant: 'warning',
          vars: { productName: deleteTarget.name },
        });
      } else {
        notify('menu.product.deleteSuccess', {
          variant: 'success',
          vars: { productName: deleteTarget.name },
        });
      }
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.product.deleteError',
        error,
        'Xoá sản phẩm thất bại',
      );
      notify('menu.product.deleteError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Xoá sản phẩm thất bại' },
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns = React.useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 54,
        enableResizing: false,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'name',
        header: 'Sản phẩm (Tầng 3)',
        size: 174,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col gap-0.5 py-0.5">
              <div className="font-bold text-foreground flex flex-wrap items-baseline gap-1.5">
                <span className={item.isAvailable ? '' : 'line-through text-muted-foreground'}>
                  {item.name}
                </span>
                {item.subtitle ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    ({item.subtitle})
                  </span>
                ) : null}
              </div>
              {item.station === 'COMBO' && item.comboItems.length > 0 ? (
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                  Combo gồm {item.comboItems.length} món thành phần
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'category',
        header: 'Danh mục',
        size: 168,
        cell: ({ row }) => {
          const catObj = categories.find((c) => c.id === row.original.categoryId);
          const catName = row.original.categoryName ?? catObj?.name;
          if (!catName) {
            return <span className="text-xs text-muted-foreground italic">Chưa phân nhóm</span>;
          }
          const isCatHidden = Boolean(catObj?.metadata?.isHidden);
          return (
            <Badge
              variant="outline"
              className="font-semibold max-w-full whitespace-normal text-left leading-tight"
            >
              {catName}
              {isCatHidden ? ' (Ẩn)' : ''}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'station',
        header: 'Khu vực bếp',
        size: 118,
        cell: ({ row }) => {
          const stCode = row.original.station;
          const badgeClass = getStationBadgeClassName(stCode);
          const label = stationNameMap[stCode] ?? stCode;
          return (
            <Badge variant="outline" className={`font-bold ${badgeClass}`}>
              {label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'price',
        header: 'Đơn giá',
        size: 98,
        cell: ({ row }) => (
          <span className="font-mono font-bold text-price whitespace-nowrap">
            {row.original.price.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        id: 'modifiers',
        header: 'Nhóm tuỳ chọn',
        size: 180,
        cell: ({ row }) => {
          const groups = row.original.modifierGroups;
          if (groups.length === 0) {
            return <span className="text-xs text-muted-foreground">Không có tuỳ chọn</span>;
          }
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {groups.map((g) => (
                <Badge
                  key={g.id}
                  variant="secondary"
                  className="text-[11px] font-semibold flex items-center gap-1"
                >
                  <span>
                    {g.name} ({g.modifiers.length})
                  </span>
                  {g.allowSubstitution ? (
                    <RefreshCw className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                  ) : null}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        size: 116,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <button
              type="button"
              disabled={!canUpdateMenu}
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleAvailability(item);
              }}
              className="inline-flex items-center"
              title="Bấm để Ẩn / Hiện món ăn trên POS & QR"
            >
              <Badge variant={item.isAvailable ? 'success' : 'secondary'}>
                {item.isAvailable ? 'Đang bán' : 'Đang ẩn'}
              </Badge>
            </button>
          );
        },
      },
      ...(canUpdateMenu || canDeleteMenu
        ? [
            {
              id: 'actions',
              header: 'Thao tác',
              size: 100,
              enableResizing: false,
              cell: ({ row }: { row: { original: Product } }) => (
                <div className="flex items-center gap-1">
                  {canUpdateMenu ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      data-testid={`edit-product-btn-${row.original.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProduct(row.original);
                        setDrawerOpen(true);
                      }}
                      title="Chỉnh sửa sản phẩm & nhóm tuỳ chọn"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {canDeleteMenu ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      data-testid={`delete-product-btn-${row.original.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(row.original);
                      }}
                      title="Xoá món ăn khỏi Thực đơn"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ),
            } as ColumnDef<Product, unknown>,
          ]
        : []),
    ],
    [page, limit, categories, stationNameMap, canUpdateMenu, canDeleteMenu],
  );

  const handleExportExcel = () => {
    exportToExcel<Product>({
      filename: `thuc-don-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Thuc don',
      rows: filteredProducts,
      columns: [
        { header: 'STT', value: (_row, idx) => idx + 1, width: 8 },
        { header: 'Tên món', value: (r) => r.name, width: 28 },
        { header: 'Mô tả phụ', value: (r) => r.subtitle ?? '', width: 28 },
        {
          header: 'Danh mục con',
          value: (r) =>
            categories.find((c) => c.id === r.categoryId)?.name ??
            r.categoryName ??
            'Chưa phân nhóm',
          width: 22,
        },
        {
          header: 'Khu vực bếp',
          value: (r) => stationNameMap[r.station] ?? r.station,
          width: 16,
        },
        { header: 'Đơn giá', value: (r) => r.price, width: 14 },
        {
          header: 'Nhóm tuỳ chọn',
          value: (r) =>
            r.modifierGroups.map((g) => `${g.name} (${g.modifiers.length})`).join(', '),
          width: 30,
        },
        {
          header: 'Trạng thái',
          value: (r) => (r.isAvailable ? 'Đang bán' : 'Đang ẩn'),
          width: 14,
        },
      ],
    });
    notify('menu.excel.exportSuccess', {
      variant: 'success',
      vars: { count: filteredProducts.length },
    });
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsedRows = await parseExcelFile(file);
      const importItems: ImportMenuExcelItem[] = [];
      let rowIndex = 1;

      for (const row of parsedRows) {
        const rawName = (row['Tên món'] ?? row['Ten mon'] ?? '').trim();
        if (!rawName) continue;

        const rawSubtitle = row['Mô tả phụ'] ?? row['Mo ta phu'];
        const rawCategory = row['Danh mục con'] ?? row['Danh muc con'];
        const rawStation = row['Khu vực bếp'] ?? row['Khu vuc bep'];
        const rawPrice = row['Đơn giá'] ?? row['Don gia'];
        const rawModifiers = row['Nhóm tuỳ chọn'] ?? row['Nhom tuy chon'];
        const rawStatus = (row['Trạng thái'] ?? row['Trang thai'] ?? '').trim().toLowerCase();
        const rawStt = Number(row['STT'] ?? '');

        const isHidden =
          rawStatus.includes('ẩn') ||
          rawStatus.includes('tạm hết') ||
          rawStatus === 'false' ||
          rawStatus === '0';

        importItems.push({
          name: rawName,
          subtitle: rawSubtitle !== undefined ? (rawSubtitle.trim() || null) : null,
          categoryName: rawCategory !== undefined ? (rawCategory.trim() || null) : null,
          station: rawStation?.trim() || 'BEP_NAU',
          price: parseExcelPrice(rawPrice),
          modifierGroupsText: rawModifiers !== undefined ? (rawModifiers.trim() || null) : undefined,
          isAvailable: !isHidden,
          sortOrder: Number.isInteger(rawStt) && rawStt > 0 ? rawStt : rowIndex,
        });
        rowIndex += 1;
      }

      const existingKeys = new Set(products.map((p) => normalizeMenuImportKey(p.name)));
      const incomingKeys = new Set<string>();
      let createCount = 0;
      let updateCount = 0;

      for (const item of importItems) {
        const key = normalizeMenuImportKey(item.name);
        if (incomingKeys.has(key)) continue;
        incomingKeys.add(key);
        if (existingKeys.has(key)) {
          updateCount += 1;
        } else {
          createCount += 1;
        }
      }

      const deleteCount = products.filter((p) => !incomingKeys.has(normalizeMenuImportKey(p.name))).length;

      setImportPreview({
        filename: file.name,
        items: importItems,
        createCount,
        updateCount,
        deleteCount,
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.excel.readError',
        error,
        'Vui lòng kiểm tra định dạng .xlsx chuẩn của hệ thống.',
      );
      notify('menu.excel.readError', {
        variant: 'destructive',
        vars: {
          reason:
            resolvedErr.description ?? 'Vui lòng kiểm tra định dạng .xlsx chuẩn của hệ thống.',
        },
      });
    }
  };

  const handleConfirmImportExcel = async () => {
    if (!importPreview) return;
    try {
      const result = await importMenuMutation.mutateAsync({
        items: importPreview.items,
        syncMissingAsDeleted: true,
      });
      setImportPreview(null);
      const skippedText =
        result.skippedActiveOrderProducts.length > 0
          ? ` (${result.skippedActiveOrderProducts.length} món đang có trong đơn phục vụ đã chuyển sang ẩn thay vì xoá)`
          : '';
      notify('menu.excel.importSuccess', {
        variant: 'success',
        vars: {
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          deletedCount: result.deletedCount,
          skippedText,
        },
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.excel.importError',
        error,
        'Vui lòng kiểm tra lại dữ liệu trong file.',
      );
      notify('menu.excel.importError', {
        variant: 'destructive',
        vars: {
          reason: resolvedErr.description ?? 'Vui lòng kiểm tra lại dữ liệu trong file.',
        },
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / limit));

  if (!productsQuery.data && productsQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={productsQuery.error}
        onRetry={() => void productsQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="menu-management-page">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <PageHeader
          path="/menu"
          defaultTitle="Quản trị Thực đơn & Phân cấp Tuỳ chọn Món"
          defaultSubtitle="Quản lý đồng bộ 3 tầng: Khu vực Bếp → Danh mục con (MDM) → Sản phẩm (kèm Subtitle & Nhóm tuỳ chọn động) cho POS & QR."
          icon={<UtensilsCrossed className="h-5 w-5 text-accent-text" />}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <AuditHistoryButton module="MENU" />
            <Button
              variant="outline"
              size="sm"
              data-testid="open-station-manager-btn"
              onClick={() => setStationDialogOpen(true)}
              className="font-semibold"
            >
              <Layers className="h-4 w-4" />
              <span>Khu vực Bếp ({stations.length})</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              data-testid="open-category-manager-btn"
              onClick={() => setCategoryDialogOpen(true)}
              className="font-semibold"
            >
              <FolderKanban className="h-4 w-4" />
              <span>Danh mục con ({categories.length})</span>
            </Button>

            {canCreateMenu ? (
              <Button
                size="sm"
                data-testid="create-product-btn"
                onClick={() => {
                  setEditingProduct(null);
                  setDrawerOpen(true);
                }}
                className="font-bold shadow-xs"
              >
                <span>Thêm món vào Thực đơn</span>
              </Button>
            ) : null}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canImportMenu ? (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  data-testid="import-menu-excel-input"
                  onChange={(e) => void handleImportFileChange(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="import-menu-excel-btn"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importMenuMutation.isPending}
                  className="font-semibold"
                >
                  <FileUp className="h-4 w-4 shrink-0 text-sky-600" />
                  <span>Nhập file Excel</span>
                </Button>
              </>
            ) : null}

            {canExportMenu ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-menu-excel-btn"
                onClick={handleExportExcel}
                disabled={filteredProducts.length === 0}
                className="font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Xuất file Excel</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bộ lọc Phân cấp Tầng 1 (Khu vực Bếp) & Tầng 2 (Danh mục con MDM) */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1.5 flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-accent-text" />
            <span>Tầng 1 (Bếp):</span>
          </span>
          <Button
            size="sm"
            variant={selectedStation === 'ALL' ? 'default' : 'outline'}
            data-testid="menu-filter-station-ALL"
            className="h-8 px-3 text-xs font-bold"
            onClick={() => {
              setSelectedStation('ALL');
              setSelectedCategoryId('ALL');
              setPage(1);
            }}
          >
            Tất cả khu vực
          </Button>
          {stations.map((st) => (
            <Button
              key={st.code}
              size="sm"
              variant={selectedStation === st.code ? 'default' : 'outline'}
              data-testid={`menu-filter-station-${st.code}`}
              className="h-8 px-3 text-xs font-bold"
              onClick={() => {
                setSelectedStation(st.code);
                setSelectedCategoryId('ALL');
                setPage(1);
              }}
            >
              <span>{st.name}</span>
              {st.isHidden ? (
                <span className="ml-1 text-[10px] opacity-75">(Đang ẩn)</span>
              ) : null}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1.5">
            Tầng 2 (Danh mục con):
          </span>
          <Button
            size="sm"
            variant={selectedCategoryId === 'ALL' ? 'secondary' : 'ghost'}
            className="h-7 px-2.5 text-xs font-semibold"
            onClick={() => {
              setSelectedCategoryId('ALL');
              setPage(1);
            }}
          >
            Tất cả danh mục ({visibleCategories.length})
          </Button>
          {visibleCategories.map((cat) => {
            const isCatHidden = Boolean(cat.metadata?.isHidden);
            return (
              <Button
                key={cat.id}
                size="sm"
                variant={selectedCategoryId === cat.id ? 'default' : 'ghost'}
                data-testid={`menu-filter-category-${cat.id}`}
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={() => {
                  setSelectedCategoryId(cat.id);
                  setPage(1);
                }}
              >
                <span>{cat.name}</span>
                {isCatHidden ? (
                  <span className="ml-1 text-[10px] opacity-75">(Đang ẩn)</span>
                ) : null}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Bảng danh sách món */}
      <BaseTable<Product>
        tableId="menu-products-table"
        data={pagedProducts}
        columns={columns}
        isLoading={isLoading}
        isFetching={productsQuery.isFetching}
        isPlaceholderData={productsQuery.isPlaceholderData}
        emptyMessage="Không có món ăn nào khớp bộ lọc hiện tại."
        toolbarLeft={
          <div className="flex flex-wrap items-center gap-2">
            <SearchableFilterDropdown
              value={selectedStation}
              options={stations.map((st) => ({
                value: st.code,
                label: st.name,
                badge: st.isHidden ? 'Đang ẩn' : undefined,
              }))}
              onChange={(next) => {
                setSelectedStation(next as 'ALL' | ProductStation);
                setSelectedCategoryId('ALL');
                setPage(1);
              }}
              allLabel="Tất cả khu vực bếp"
              searchable={false}
              align="left"
              triggerTestId="menu-dropdown-station"
              ariaLabel="Lọc theo khu vực bếp"
              triggerClassName="h-9 w-[170px]"
            />
            <SearchableFilterDropdown
              value={selectedCategoryId === 'ALL' ? 'ALL' : String(selectedCategoryId)}
              options={visibleCategories.map((cat) => ({
                value: String(cat.id),
                label: cat.name,
                badge: cat.metadata?.isHidden ? 'Đang ẩn' : undefined,
              }))}
              onChange={(next) => {
                setSelectedCategoryId(next === 'ALL' ? 'ALL' : Number(next));
                setPage(1);
              }}
              allLabel={`Tất cả danh mục (${visibleCategories.length})`}
              searchPlaceholder="Tìm danh mục..."
              align="left"
              triggerTestId="menu-dropdown-category"
              ariaLabel="Lọc theo danh mục con"
              triggerClassName="h-9 w-[200px]"
            />
          </div>
        }
        searchPlaceholder="Tìm món ăn, mô tả, danh mục..."
        searchValue={keyword}
        onSearchChange={(val) => {
          setKeyword(val);
          setPage(1);
        }}
        pagination={{
          page,
          limit,
          total: filteredProducts.length,
          totalPages,
          onPageChange: setPage,
          onLimitChange: setLimit,
        }}
      />

      {/* Drawer Thêm / Sửa Món & Nhóm Tuỳ Chọn */}
      <ProductFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editingProduct={editingProduct}
        allProducts={products}
        categories={categories}
        stations={stations}
        onOpenCategoryManager={() => setCategoryDialogOpen(true)}
        onOpenStationManager={() => setStationDialogOpen(true)}
      />

      {/* Dialog Quản lý Khu vực Bếp (Tầng 1) */}
      <StationManageDialog
        open={stationDialogOpen}
        onOpenChange={setStationDialogOpen}
        stations={stations}
        canWriteMdm={canManageStations}
      />

      {/* Dialog Quản lý Danh mục con MDM (Tầng 2) */}
      <CategoryManageDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        categories={categories}
        stations={stations}
        canWriteMdm={canManageCategories}
      />

      {/* Dialog Xác nhận Nhập file Excel */}
      <Dialog open={importPreview !== null} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent data-testid="import-menu-excel-dialog">
          <DialogHeader>
            {(() => {
              const importConfirmCopy = resolveMessage('menu.confirm.importExcel');
              return (
                <>
                  <DialogTitle>{importConfirmCopy.title}</DialogTitle>
                  <DialogDescription>
                    {importConfirmCopy.isOverridden && importConfirmCopy.description ? (
                      importConfirmCopy.description
                    ) : (
                      <>
                        Dựa vào cột <strong>"Tên món"</strong>: món mới sẽ tự động tạo, món đã có sẽ cập nhật (các ô không bắt buộc để trống sẽ xoá trắng), và món không còn / bị xoá trống trong file sẽ bị gỡ khỏi Thực đơn (vẫn giữ tên trên lịch sử hoá đơn cũ).
                      </>
                    )}
                  </DialogDescription>
                </>
              );
            })()}
          </DialogHeader>
          {importPreview ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Tệp đã chọn</div>
                <div className="font-semibold text-foreground">{importPreview.filename}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <div className="text-xs text-emerald-700 dark:text-emerald-300">Tạo mới</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {importPreview.createCount}
                  </div>
                </div>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5">
                  <div className="text-xs text-sky-700 dark:text-sky-300">Cập nhật</div>
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                    {importPreview.updateCount}
                  </div>
                </div>
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
                  <div className="text-xs text-rose-700 dark:text-rose-300">Xoá món</div>
                  <div className="text-lg font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                    {importPreview.deleteCount}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setImportPreview(null)}>
              Huỷ bỏ
            </Button>
            <Button
              data-testid="confirm-import-menu-excel-btn"
              onClick={() => void handleConfirmImportExcel()}
              disabled={importMenuMutation.isPending}
            >
              Xác nhận đồng bộ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Xác nhận Xoá sản phẩm */}
      <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent data-testid="delete-product-dialog">
          <DialogHeader>
            {(() => {
              const deleteCopy = resolveMessage('menu.confirm.deleteProduct', {
                productName: deleteTarget?.name ?? '',
              });
              return (
                <>
                  <DialogTitle>{deleteCopy.title}</DialogTitle>
                  <DialogDescription>
                    {deleteCopy.isOverridden && deleteCopy.description ? (
                      deleteCopy.description
                    ) : (
                      <>
                        Bạn đang chọn xoá món <strong>{deleteTarget?.name}</strong>. Món sẽ bị gỡ khỏi Thực đơn, POS và QR (nhưng vẫn bảo toàn tên món trên các hoá đơn lịch sử đã thanh toán).
                      </>
                    )}
                  </DialogDescription>
                </>
              );
            })()}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Huỷ bỏ
            </Button>
            <Button
              variant="destructive"
              data-testid="confirm-delete-product-btn"
              onClick={() => void handleConfirmDelete()}
              disabled={deleteProductMutation.isPending}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
