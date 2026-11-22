import { type MdmItem, type ProductStation } from '@fnb/shared';
import { Eye, EyeOff, Pencil, Search, Trash2, X } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import {
  DEFAULT_KITCHEN_STATIONS,
  getStationBadgeClassName,
  type KitchenStationOption,
} from '@/lib/menu-sync';
import { useCommitSearch } from '@/lib/use-commit-search';
import { matchesVietnameseQuery } from '@/utils/search';

import {
  useCreateMenuCategoryMutation,
  useDeleteMenuCategoryMutation,
  useUpdateMenuCategoryMutation,
} from '../api/menu-admin.api';

interface CategoryManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MdmItem[];
  stations?: KitchenStationOption[];
  canWriteMdm: boolean;
}

export function CategoryManageDialog({
  open,
  onOpenChange,
  categories,
  stations = DEFAULT_KITCHEN_STATIONS,
  canWriteMdm,
}: CategoryManageDialogProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const [editingItem, setEditingItem] = React.useState<MdmItem | null>(null);
  const [name, setName] = React.useState('');
  const [defaultStation, setDefaultStation] = React.useState<ProductStation>('BEP_NAU');
  const [filterStation, setFilterStation] = React.useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = React.useState('');
  const categorySearch = useCommitSearch(searchKeyword, setSearchKeyword);

  const createMutation = useCreateMenuCategoryMutation();
  const updateMutation = useUpdateMenuCategoryMutation();
  const deleteMutation = useDeleteMenuCategoryMutation();

  const filteredCategories = React.useMemo(() => {
    return categories.filter((cat) => {
      const catStation =
        typeof cat.metadata?.defaultStation === 'string'
          ? cat.metadata.defaultStation
          : 'BEP_NAU';
      if (filterStation !== 'ALL' && catStation !== filterStation) return false;
      if (searchKeyword.trim() && !matchesVietnameseQuery(searchKeyword, cat.name)) return false;
      return true;
    });
  }, [categories, filterStation, searchKeyword]);

  const stationLabels = React.useMemo(() => {
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

  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setDefaultStation(stations[0]?.code ?? 'BEP_NAU');
  };

  const handleEdit = (item: MdmItem) => {
    setEditingItem(item);
    setName(item.name);
    const metaStation = item.metadata?.defaultStation;
    if (typeof metaStation === 'string' && metaStation.trim()) {
      setDefaultStation(metaStation as ProductStation);
    } else {
      setDefaultStation(stations[0]?.code ?? 'BEP_NAU');
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notify('menu.category.missingName', { variant: 'destructive' });
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
        notify('menu.category.updateSuccess', { variant: 'success' });
      } else {
        await createMutation.mutateAsync({
          category: 'MENU_CATEGORY',
          name: trimmed,
          metadata: { defaultStation, isHidden: false },
        });
        notify('menu.category.createSuccess', {
          variant: 'success',
          vars: { stationLabel: stationLabels[defaultStation] ?? defaultStation },
        });
      }
      resetForm();
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.category.saveError',
        error,
        'Không thể lưu danh mục con',
      );
      notify('menu.category.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể lưu danh mục con' },
      });
    }
  };

  const handleToggleHide = async (item: MdmItem) => {
    const isCurrentlyHidden = Boolean(item.metadata?.isHidden);
    const nextHidden = !isCurrentlyHidden;
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        body: {
          name: item.name,
          metadata: {
            ...(item.metadata ?? {}),
            isHidden: nextHidden,
          },
        },
      });
      notify(nextHidden ? 'menu.category.toggleHidden' : 'menu.category.toggleVisible', {
        variant: 'info',
        vars: { categoryName: item.name },
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.category.toggleError',
        error,
        'Không thể đổi trạng thái ẩn/hiện',
      );
      notify('menu.category.toggleError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể đổi trạng thái ẩn/hiện' },
      });
    }
  };

  const handleDelete = async (item: MdmItem) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      notify('menu.category.deleteSuccess', {
        variant: 'success',
        vars: { categoryName: item.name },
      });
      if (editingItem?.id === item.id) resetForm();
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.category.deleteError',
        error,
        'Không thể xoá danh mục đang còn chứa sản phẩm con',
      );
      notify('menu.category.deleteError', {
        variant: 'destructive',
        vars: {
          reason:
            resolvedErr.description ?? 'Không thể xoá danh mục đang còn chứa sản phẩm con',
        },
      });
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
      <DialogContent closeLabel="Đóng" className="max-w-xl" data-testid="category-manage-dialog">
        <DialogHeader className="pr-16">
          <DialogTitle>Quản lý Danh mục con Thực đơn (Tầng 2 - MDM)</DialogTitle>
          <DialogDescription>
            Tạo danh mục con (VD: Mì cay, Bánh mì chảo, Lẩu...), Ẩn/Hiện danh mục trên POS & QR, hoặc Xoá danh mục (chỉ được xoá khi bên trong không còn sản phẩm nào).
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
                  className="text-xs font-semibold text-accent-text hover:underline"
                >
                  Chuyển sang tạo mới
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-7">
                <Input
                  data-testid="menu-category-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tên danh mục (VD: Mì cay)..."
                />
              </div>
              <div className="sm:col-span-5">
                <select
                  data-testid="menu-category-station-select"
                  value={defaultStation}
                  onChange={(e) => setDefaultStation(e.target.value as ProductStation)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {stations.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex h-8 flex-1 min-w-[220px] max-w-sm items-center overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
                <select
                  aria-label="Lọc danh mục theo khu vực bếp"
                  data-testid="category-filter-station-select"
                  value={filterStation}
                  onChange={(e) => setFilterStation(e.target.value)}
                  className="h-full max-w-[130px] shrink-0 border-r border-input bg-muted/40 px-2 text-xs font-medium text-foreground focus:outline-none"
                >
                  <option value="ALL">Tất cả</option>
                  {stations.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <div ref={categorySearch.containerRef} className="relative flex flex-1 items-center">
                  <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    {...categorySearch.inputProps}
                    placeholder="Tìm danh mục..."
                    className="h-8 w-full bg-transparent pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    data-testid="category-search-input"
                  />
                  {categorySearch.draft ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={categorySearch.clear}
                      title="Xoá tìm kiếm"
                      aria-label="Xoá tìm kiếm"
                      className="absolute right-1.5 top-2 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
              <Button
                size="sm"
                data-testid="save-menu-category-btn"
                onClick={() => void handleSave()}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="font-bold shrink-0"
              >
                <span>{editingItem ? 'Lưu thay đổi' : 'Thêm danh mục'}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-8 max-w-sm items-center overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <select
              aria-label="Lọc danh mục theo khu vực bếp"
              value={filterStation}
              onChange={(e) => setFilterStation(e.target.value)}
              className="h-full max-w-[130px] shrink-0 border-r border-input bg-muted/40 px-2 text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="ALL">Tất cả</option>
              {stations.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name}
                </option>
              ))}
            </select>
            <div ref={categorySearch.containerRef} className="relative flex flex-1 items-center">
              <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                {...categorySearch.inputProps}
                placeholder="Tìm danh mục..."
                className="h-8 w-full bg-transparent pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {categorySearch.draft ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={categorySearch.clear}
                  title="Xoá tìm kiếm"
                  aria-label="Xoá tìm kiếm"
                  className="absolute right-1.5 top-2 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-card">
          {filteredCategories.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {categories.length === 0
                ? 'Chưa có danh mục con nào. Hãy thêm danh mục đầu tiên!'
                : 'Không tìm thấy danh mục phù hợp.'}
            </div>
          ) : (
            filteredCategories.map((cat) => {
              const station =
                typeof cat.metadata?.defaultStation === 'string'
                  ? cat.metadata.defaultStation
                  : 'BEP_NAU';
              const isHidden = Boolean(cat.metadata?.isHidden);
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <span
                      className={`font-semibold text-sm truncate ${
                        isHidden ? 'line-through text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {cat.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-bold ${getStationBadgeClassName(station)}`}
                    >
                      {stationLabels[station] ?? station}
                    </Badge>
                    {isHidden ? (
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        Đang ẩn
                      </Badge>
                    ) : null}
                  </div>
                  {canWriteMdm ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        data-testid={`toggle-hide-category-btn-${cat.id}`}
                        onClick={() => void handleToggleHide(cat)}
                        title={
                          isHidden
                            ? 'Hiện lại danh mục trên POS & QR'
                            : 'Ẩn danh mục (và các món thuộc danh mục này) trên POS & QR'
                        }
                      >
                        {isHidden ? (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </Button>
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
                        data-testid={`delete-category-btn-${cat.id}`}
                        onClick={() => void handleDelete(cat)}
                        title="Xoá danh mục (chỉ xoá được khi không còn sản phẩm bên trong)"
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
      </DialogContent>
    </Dialog>
  );
}
