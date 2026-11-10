import { type ColumnDef } from '@tanstack/react-table';
import { type Product, type ProductStation } from '@fnb/shared';
import {
  FolderKanban,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
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
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth.store';

import {
  useDeleteProductMutation,
  useMenuCategoriesQuery,
  useMenuProductsQuery,
  useUpdateProductMutation,
} from '../api/menu-admin.api';
import { CategoryManageDialog } from './category-manage-dialog';
import { ProductFormDrawer } from './product-form-drawer';

const STATION_TABS: { value: 'ALL' | ProductStation; label: string }[] = [
  { value: 'ALL', label: 'Tất cả khu vực' },
  { value: 'BEP_NAU', label: 'Bếp nấu' },
  { value: 'BEP_CHIEN', label: 'Bếp chiên' },
  { value: 'PHA_CHE', label: 'Pha chế' },
  { value: 'COMBO', label: 'Combo' },
];

const STATION_BADGE_MAP: Record<
  ProductStation,
  { label: string; className: string }
> = {
  BEP_NAU: {
    label: 'Bếp nấu',
    className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  BEP_CHIEN: {
    label: 'Bếp chiên',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  PHA_CHE: {
    label: 'Pha chế',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  },
  COMBO: {
    label: 'Combo',
    className: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  },
};

export function MenuManagementPage() {
  const user = useAuthStore((s) => s.user);
  const canUpdateMenu = Boolean(user?.isSuperAdmin || user?.permissions.pos.update);
  const canWriteMdm = Boolean(user?.isSuperAdmin || user?.permissions.mdm.write || user?.permissions.pos.update);

  const { data: products = [], isLoading } = useMenuProductsQuery();
  const { data: categories = [] } = useMenuCategoriesQuery();

  const updateProductMutation = useUpdateProductMutation();
  const deleteProductMutation = useDeleteProductMutation();

  const [selectedStation, setSelectedStation] = React.useState<'ALL' | ProductStation>('ALL');
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<number | 'ALL'>('ALL');
  const [keyword, setKeyword] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(50);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);

  const visibleCategories = React.useMemo(() => {
    const filtered = selectedStation === 'ALL'
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
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const inName = item.name.toLowerCase().includes(kw);
        const inSub = (item.subtitle ?? '').toLowerCase().includes(kw);
        const inCat = (item.categoryName ?? '').toLowerCase().includes(kw);
        if (!inName && !inSub && !inCat) return false;
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
          ...(product.station === 'COMBO' ? { comboItems: product.comboItems } : {}),
        },
      });
      toast({
        variant: 'info',
        title: !product.isAvailable
          ? `Đã mở bán lại "${product.name}"`
          : `Đã tạm ngưng "${product.name}"`,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Không thể đổi trạng thái món' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await deleteProductMutation.mutateAsync(deleteTarget.id);
      if (res.softDisabled) {
        toast({
          variant: 'warning',
          title: `Đã ngưng bán "${deleteTarget.name}"`,
          description: 'Món đã có lịch sử hoá đơn nên được giữ lại dữ liệu và chuyển sang Tạm ngưng.',
        });
      } else {
        toast({
          variant: 'success',
          title: `Đã xoá "${deleteTarget.name}" khỏi Thực đơn`,
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Xoá sản phẩm thất bại' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns = React.useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      {
        id: 'stt',
        header: 'STT',
        size: 52,
        enableResizing: false,
        cell: ({ row }) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'name',
        header: 'Sản phẩm (Tầng 3) & Subtitle động',
        size: 270,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col gap-0.5 py-0.5">
              <div className="font-bold text-foreground flex flex-wrap items-baseline gap-1.5">
                <span>{item.name}</span>
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
        header: 'Danh mục con (Tầng 2)',
        size: 165,
        cell: ({ row }) => {
          const catName =
            row.original.categoryName ??
            categories.find((c) => c.id === row.original.categoryId)?.name;
          if (!catName) {
            return <span className="text-xs text-muted-foreground italic">Chưa phân nhóm</span>;
          }
          return (
            <Badge variant="outline" className="font-semibold">
              {catName}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'station',
        header: 'Khu vực Bếp (Tầng 1)',
        size: 140,
        cell: ({ row }) => {
          const badge = STATION_BADGE_MAP[row.original.station];
          return (
            <Badge variant="outline" className={`font-bold ${badge.className}`}>
              {badge.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'price',
        header: 'Đơn giá',
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono font-bold text-primary">
            {row.original.price.toLocaleString('vi-VN')} đ
          </span>
        ),
      },
      {
        id: 'modifiers',
        header: 'Cấu hình Nhóm Tuỳ chọn',
        size: 260,
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
        header: 'Trạng thái bán',
        size: 135,
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
              title="Bấm để bật/tắt trạng thái mở bán trên POS & QR"
            >
              <Badge variant={item.isAvailable ? 'default' : 'secondary'}>
                {item.isAvailable ? 'Đang bán' : 'Tạm hết'}
              </Badge>
            </button>
          );
        },
      },
      ...(canUpdateMenu
        ? [
            {
              id: 'actions',
              header: 'Thao tác',
              size: 95,
              enableResizing: false,
              cell: ({ row }: { row: { original: Product } }) => (
                <div className="flex items-center gap-1">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    data-testid={`delete-product-btn-${row.original.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(row.original);
                    }}
                    title="Xoá hoặc ngưng bán"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            } as ColumnDef<Product, unknown>,
          ]
        : []),
    ],
    [page, limit, categories, canUpdateMenu],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / limit));

  return (
    <div className="flex flex-col gap-4" data-testid="menu-management-page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span>Quản trị Thực đơn & Phân cấp Tuỳ chọn Món</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Quản lý đồng bộ 3 tầng: Khu vực Bếp → Danh mục con (MDM) → Sản phẩm (kèm Subtitle & Nhóm tuỳ chọn động) cho POS & QR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          {canUpdateMenu ? (
            <Button
              size="sm"
              data-testid="create-product-btn"
              onClick={() => {
                setEditingProduct(null);
                setDrawerOpen(true);
              }}
              className="font-bold shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm món vào Thực đơn</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Bộ lọc Phân cấp Tầng 1 (Khu vực Bếp) & Tầng 2 (Danh mục con MDM) */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1.5 flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Tầng 1 (Bếp):</span>
          </span>
          {STATION_TABS.map((tab) => (
            <Button
              key={tab.value}
              size="sm"
              variant={selectedStation === tab.value ? 'default' : 'outline'}
              data-testid={`menu-filter-station-${tab.value}`}
              className="h-8 px-3 text-xs font-bold"
              onClick={() => {
                setSelectedStation(tab.value);
                setSelectedCategoryId('ALL');
                setPage(1);
              }}
            >
              {tab.label}
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
          {visibleCategories.map((cat) => (
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
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Bảng danh sách món */}
      <BaseTable<Product>
        tableId="menu-products-table"
        data={pagedProducts}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Không có món ăn nào khớp bộ lọc hiện tại."
        searchPlaceholder="Tìm theo tên món, subtitle (VD: ngao, tôm, mực) hoặc danh mục..."
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
        onOpenCategoryManager={() => setCategoryDialogOpen(true)}
      />

      {/* Dialog Quản lý Danh mục con MDM */}
      <CategoryManageDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        categories={categories}
        canWriteMdm={canWriteMdm}
      />

      {/* Dialog Xác nhận Xoá sản phẩm */}
      <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent data-testid="delete-product-dialog">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá món khỏi Thực đơn</DialogTitle>
            <DialogDescription>
              Bạn đang chọn xoá món <strong>{deleteTarget?.name}</strong>. Nếu món đã từng phát sinh trong hoá đơn, hệ thống sẽ tự động chuyển sang trạng thái <strong>Tạm hết</strong> để bảo toàn lịch sử doanh thu.
            </DialogDescription>
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
