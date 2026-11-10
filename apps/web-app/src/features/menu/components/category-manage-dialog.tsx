import { type MdmItem, type ProductStation } from '@fnb/shared';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';

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
import { toast } from '@/components/ui/toast';

import {
  useCreateMenuCategoryMutation,
  useDeleteMenuCategoryMutation,
  useUpdateMenuCategoryMutation,
} from '../api/menu-admin.api';

const STATION_OPTIONS: { value: ProductStation; label: string }[] = [
  { value: 'BEP_NAU', label: 'Bếp nấu' },
  { value: 'BEP_CHIEN', label: 'Bếp chiên' },
  { value: 'PHA_CHE', label: 'Pha chế' },
  { value: 'COMBO', label: 'Combo' },
];

const STATION_LABELS: Record<string, string> = {
  BEP_NAU: 'Bếp nấu',
  BEP_CHIEN: 'Bếp chiên',
  PHA_CHE: 'Pha chế',
  COMBO: 'Combo',
};

interface CategoryManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MdmItem[];
  canWriteMdm: boolean;
}

export function CategoryManageDialog({
  open,
  onOpenChange,
  categories,
  canWriteMdm,
}: CategoryManageDialogProps) {
  const [editingItem, setEditingItem] = React.useState<MdmItem | null>(null);
  const [name, setName] = React.useState('');
  const [defaultStation, setDefaultStation] = React.useState<ProductStation>('BEP_NAU');

  const createMutation = useCreateMenuCategoryMutation();
  const updateMutation = useUpdateMenuCategoryMutation();
  const deleteMutation = useDeleteMenuCategoryMutation();

  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setDefaultStation('BEP_NAU');
  };

  const handleEdit = (item: MdmItem) => {
    setEditingItem(item);
    setName(item.name);
    const metaStation = item.metadata?.defaultStation;
    if (
      metaStation === 'BEP_NAU' ||
      metaStation === 'BEP_CHIEN' ||
      metaStation === 'PHA_CHE' ||
      metaStation === 'COMBO'
    ) {
      setDefaultStation(metaStation);
    } else {
      setDefaultStation('BEP_NAU');
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ variant: 'destructive', title: 'Vui lòng nhập tên danh mục con' });
      return;
    }

    try {
      if (editingItem) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          body: {
            name: trimmed,
            metadata: { ...(editingItem.metadata ?? {}), defaultStation },
          },
        });
        toast({ variant: 'success', title: 'Đã cập nhật danh mục con' });
      } else {
        await createMutation.mutateAsync({
          category: 'MENU_CATEGORY',
          name: trimmed,
          metadata: { defaultStation },
        });
        toast({
          variant: 'success',
          title: 'Đã thêm danh mục Thực đơn mới',
          description: `Gắn với khu vực ${STATION_LABELS[defaultStation]}`,
        });
      }
      resetForm();
    } catch {
      toast({ variant: 'destructive', title: 'Không thể lưu danh mục con' });
    }
  };

  const handleDelete = async (item: MdmItem) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      toast({ variant: 'info', title: `Đã ẩn danh mục "${item.name}"` });
      if (editingItem?.id === item.id) resetForm();
    } catch {
      toast({ variant: 'destructive', title: 'Không thể xoá danh mục' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl" data-testid="category-manage-dialog">
        <DialogHeader>
          <DialogTitle>Quản lý Danh mục con Thực đơn (Tầng 2 - MDM)</DialogTitle>
          <DialogDescription>
            Tạo danh mục con (VD: Mì cay, Bánh mì chảo, Lẩu, Món chiên...) gắn với Khu vực Bếp (Tầng 1) để hiển thị động trên POS và QR.
          </DialogDescription>
        </DialogHeader>

        {canWriteMdm ? (
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {editingItem ? `Đang sửa: ${editingItem.name}` : 'Thêm danh mục con mới'}
              </span>
              {editingItem ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  + Chuyển sang tạo mới
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-7">
                <Input
                  data-testid="menu-category-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tên danh mục (VD: Mì cay, Bánh mì chảo)..."
                />
              </div>
              <div className="sm:col-span-5">
                <select
                  data-testid="menu-category-station-select"
                  value={defaultStation}
                  onChange={(e) => setDefaultStation(e.target.value as ProductStation)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                data-testid="save-menu-category-btn"
                onClick={() => void handleSave()}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="font-bold"
              >
                <FolderPlus className="h-4 w-4" />
                <span>{editingItem ? 'Lưu thay đổi' : 'Thêm danh mục'}</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-card">
          {categories.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Chưa có danh mục con nào. Hãy thêm danh mục đầu tiên!
            </div>
          ) : (
            categories.map((cat) => {
              const station =
                typeof cat.metadata?.defaultStation === 'string'
                  ? cat.metadata.defaultStation
                  : 'BEP_NAU';
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {cat.name}
                    </span>
                    <Badge variant="outline" className="text-[11px] font-semibold">
                      {STATION_LABELS[station] ?? station}
                    </Badge>
                  </div>
                  {canWriteMdm ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEdit(cat)}
                        title="Sửa danh mục"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => void handleDelete(cat)}
                        title="Xoá danh mục"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
