import { type ColumnDef } from '@tanstack/react-table';
import { type MdmCategory, type MdmItem } from '@fnb/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { BaseTable } from '@/components/base-table/base-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth.store';

import {
  useCreateMdmMutation,
  useDeleteMdmMutation,
  useMdmListQuery,
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

export function MasterDataPage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = user?.isSuperAdmin || user?.permissions.mdm.write;

  const [activeTab, setActiveTab] = React.useState<MdmCategory>('POSITION');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [keyword, setKeyword] = React.useState('');

  const [upsertOpen, setUpsertOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<MdmItem | null>(null);
  const [formName, setFormName] = React.useState('');
  const [formStation, setFormStation] = React.useState<string>('BEP_NAU');
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null);

  const { data, isLoading } = useMdmListQuery({
    category: activeTab,
    page,
    limit,
    keyword: keyword || undefined,
    activeOnly: true,
  });

  const createMutation = useCreateMdmMutation();
  const updateMutation = useUpdateMdmMutation(editingItem?.id ?? 0);
  const deleteMutation = useDeleteMdmMutation();

  const handleTabChange = (val: string) => {
    setActiveTab(val as MdmCategory);
    setPage(1);
    setKeyword('');
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormStation('BEP_NAU');
    setUpsertOpen(true);
  };

  const handleOpenEdit = (item: MdmItem) => {
    setEditingItem(item);
    setFormName(item.name);
    const metaStation = typeof item.metadata?.defaultStation === 'string' ? item.metadata.defaultStation : 'BEP_NAU';
    setFormStation(metaStation);
    setUpsertOpen(true);
  };

  const handleSubmitUpsert = async () => {
    if (!formName.trim()) {
      toast({ variant: 'destructive', title: 'Vui lòng nhập tên danh mục' });
      return;
    }

    const metadata = activeTab === 'MENU_CATEGORY'
      ? { ...(editingItem?.metadata ?? {}), defaultStation: formStation }
      : (editingItem?.metadata ?? {});

    try {
      if (editingItem) {
        await updateMutation.mutateAsync({ name: formName.trim(), metadata });
        toast({ variant: 'success', title: 'Cập nhật thành công' });
      } else {
        await createMutation.mutateAsync({
          category: activeTab,
          name: formName.trim(),
          metadata,
        });
        toast({
          variant: 'success',
          title: 'Lưu danh mục thành công',
          description: 'Tên đã tồn tại sẽ dùng lại bản ghi đã chuẩn hoá, không tạo trùng.',
        });
      }
      setUpsertOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Thao tác thất bại' });
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId === null) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirmId);
      toast({ variant: 'success', title: 'Đã xoá danh mục' });
    } catch {
      toast({ variant: 'destructive', title: 'Xoá thất bại' });
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
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.normalizedName}
          </span>
        ),
      },
      {
        id: 'metadata',
        header: 'Thông tin phụ / Trạm bếp',
        size: 150,
        cell: ({ row }) => {
          const meta = row.original.metadata;
          if (!meta || Object.keys(meta).length === 0) return '—';
          if (typeof meta.defaultStation === 'string' && STATION_LABELS[meta.defaultStation]) {
            return (
              <Badge variant="outline" className="text-xs font-semibold">
                {STATION_LABELS[meta.defaultStation]}
              </Badge>
            );
          }
          return (
            <span
              className="font-mono text-xs text-muted-foreground truncate block max-w-full"
              title={JSON.stringify(meta)}
            >
              {JSON.stringify(meta)}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        size: 125,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? 'Hoạt động' : 'Ngưng'}
          </Badge>
        ),
      },
      ...(canWrite
        ? [
            {
              id: 'actions',
              header: 'Thao tác',
              size: 90,
              enableResizing: false,
              cell: ({ row }: { row: { original: MdmItem } }) => (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 active:scale-95 transition-transform"
                    data-testid={`edit-mdm-btn-${row.original.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(row.original);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 active:scale-95 transition-transform"
                    data-testid={`delete-mdm-btn-${row.original.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(row.original.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ),
            } as ColumnDef<MdmItem, unknown>,
          ]
        : []),
    ],
    [page, limit, canWrite],
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">Quản trị Master Data</h1>
        {canWrite ? (
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
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="w-full overflow-x-auto overscroll-contain touch-pan-x pb-1 -mb-1">
          <TabsList data-testid="mdm-tab-list" className="inline-flex w-auto min-w-full sm:min-w-0 justify-start sm:justify-center">
            {TAB_CATEGORIES.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                data-testid={`mdm-tab-${tab.value}`}
                className="shrink-0"
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
                ? `Sửa tên danh mục: ${editingItem.name}`
                : `Thêm mới vào danh mục ${TAB_CATEGORIES.find((t) => t.value === activeTab)?.label}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              data-testid="mdm-name-input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nhập tên danh mục (VD: Mì cay, Bánh mì chảo)..."
            />
            {activeTab === 'MENU_CATEGORY' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Khu vực Bếp mặc định (Phân cấp Tầng 1)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(STATION_LABELS).map(([stationKey, stationLabel]) => (
                    <button
                      key={stationKey}
                      type="button"
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
          <DialogHeader>
            <DialogTitle>Xác nhận xoá danh mục</DialogTitle>
            <DialogDescription>Danh mục sẽ bị vô hiệu hoá. Dữ liệu tham chiếu vẫn được giữ lại.</DialogDescription>
          </DialogHeader>
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
