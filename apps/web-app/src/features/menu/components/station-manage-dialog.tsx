import { Eye, EyeOff, Layers, Pencil, Search, Trash2, X } from 'lucide-react';
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
import { type KitchenStationOption } from '@/lib/menu-sync';
import { useCommitSearch } from '@/lib/use-commit-search';
import { matchesVietnameseQuery } from '@/utils/search';

import {
  useCreateMenuStationMutation,
  useDeleteMenuStationMutation,
  useUpdateMenuStationMutation,
} from '../api/menu-admin.api';

function buildStationCode(rawName: string): string {
  const slug = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const withoutPrefix = slug.startsWith('BEP_') ? slug.slice(4) : slug;
  const trimmed = (withoutPrefix || 'MOI').slice(0, 12).replace(/_+$/g, '');
  return `BEP_${trimmed || 'MOI'}`;
}

interface StationManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stations: KitchenStationOption[];
  canWriteMdm: boolean;
}

export function StationManageDialog({
  open,
  onOpenChange,
  stations,
  canWriteMdm,
}: StationManageDialogProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const [editingItem, setEditingItem] = React.useState<KitchenStationOption | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [searchKeyword, setSearchKeyword] = React.useState('');
  const stationSearch = useCommitSearch(searchKeyword, setSearchKeyword);

  const createMutation = useCreateMenuStationMutation();
  const updateMutation = useUpdateMenuStationMutation();
  const deleteMutation = useDeleteMenuStationMutation();

  const filteredStations = React.useMemo(() => {
    if (!searchKeyword.trim()) return stations;
    return stations.filter((st) => matchesVietnameseQuery(searchKeyword, st.name, st.desc));
  }, [stations, searchKeyword]);

  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
  };

  const handleEdit = (station: KitchenStationOption) => {
    setEditingItem(station);
    setName(station.name);
    setDescription(station.desc);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notify('menu.station.missingName', { variant: 'destructive' });
      return;
    }

    try {
      if (editingItem && editingItem.id) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          body: {
            name: trimmed,
            metadata: {
              ...(editingItem.rawItem?.metadata ?? {}),
              code: editingItem.code,
              stationCode: editingItem.code,
              sortOrder: editingItem.sortOrder,
              isSystem: editingItem.isSystem,
              isHidden: editingItem.isHidden,
              description: description.trim() || editingItem.desc,
            },
          },
        });
        notify('menu.station.updateSuccess', {
          variant: 'success',
          vars: { stationName: trimmed },
        });
      } else {
        const stationCode = buildStationCode(trimmed);
        await createMutation.mutateAsync({
          category: 'KITCHEN_STATION',
          name: trimmed,
          metadata: {
            code: stationCode,
            stationCode,
            sortOrder: stations.length + 1,
            isSystem: false,
            isHidden: false,
            description: description.trim() || `Trạm in nhiệt (${stationCode})`,
          },
        });
        notify('menu.station.createSuccess', {
          variant: 'success',
          vars: { stationName: trimmed, stationCode },
        });
      }
      resetForm();
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.station.saveError',
        error,
        'Không thể lưu Khu vực Bếp',
      );
      notify('menu.station.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể lưu Khu vực Bếp' },
      });
    }
  };

  const handleToggleHide = async (station: KitchenStationOption) => {
    if (!station.id) return;
    const nextHidden = !station.isHidden;
    try {
      await updateMutation.mutateAsync({
        id: station.id,
        body: {
          name: station.name,
          metadata: {
            ...(station.rawItem?.metadata ?? {}),
            code: station.code,
            stationCode: station.code,
            sortOrder: station.sortOrder,
            isSystem: station.isSystem,
            isHidden: nextHidden,
            description: station.desc,
          },
        },
      });
      notify(nextHidden ? 'menu.station.toggleHidden' : 'menu.station.toggleVisible', {
        variant: 'info',
        vars: { stationName: station.name },
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.station.toggleError',
        error,
        'Không thể đổi trạng thái ẩn/hiện',
      );
      notify('menu.station.toggleError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể đổi trạng thái ẩn/hiện' },
      });
    }
  };

  const handleDelete = async (station: KitchenStationOption) => {
    if (!station.id) return;
    if (station.isSystem) {
      notify('menu.station.systemDeleteWarning', { variant: 'warning' });
      return;
    }

    try {
      await deleteMutation.mutateAsync(station.id);
      notify('menu.station.deleteSuccess', {
        variant: 'success',
        vars: { stationName: station.name },
      });
      if (editingItem?.id === station.id) resetForm();
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'menu.station.deleteError',
        error,
        'Không thể xoá Khu vực Bếp đang còn Danh mục con hoặc Món ăn',
      );
      notify('menu.station.deleteError', {
        variant: 'destructive',
        vars: {
          reason:
            resolvedErr.description ??
            'Không thể xoá Khu vực Bếp đang còn Danh mục con hoặc Món ăn',
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
      <DialogContent closeLabel="Đóng" className="max-w-xl" data-testid="station-manage-dialog">
        <DialogHeader className="pr-16">
          <DialogTitle>Quản lý Khu vực Bếp (Tầng 1 - MDM)</DialogTitle>
          <DialogDescription>
            Thêm mới, đổi tên, Ẩn/Hiện hoặc Xoá Khu vực Bếp (Tầng 1). Chỉ có thể xoá Khu vực Bếp khi toàn bộ Danh mục (Tầng 2) và Món ăn (Tầng 3) bên trong đã được xoá hết.
          </DialogDescription>
        </DialogHeader>

        {canWriteMdm ? (
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {editingItem ? `Đang sửa: ${editingItem.name}` : 'Thêm Khu vực Bếp (Tầng 1) mới'}
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
              <div className="sm:col-span-6">
                <Input
                  data-testid="menu-station-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tên bếp (VD: Bếp nướng)..."
                />
              </div>
              <div className="sm:col-span-6">
                <Input
                  data-testid="menu-station-desc-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả ngắn (VD: Đồ nướng)..."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div ref={stationSearch.containerRef} className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  {...stationSearch.inputProps}
                  placeholder="Tìm khu vực bếp..."
                  className="h-8 pl-8 pr-7 text-xs"
                  data-testid="station-search-input"
                />
                {stationSearch.draft ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={stationSearch.clear}
                    title="Xoá tìm kiếm"
                    aria-label="Xoá tìm kiếm"
                    className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <Button
                size="sm"
                data-testid="save-menu-station-btn"
                onClick={() => void handleSave()}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="font-bold shrink-0"
              >
                <span>{editingItem ? 'Lưu thay đổi' : 'Thêm khu vực bếp'}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div ref={stationSearch.containerRef} className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              {...stationSearch.inputProps}
              placeholder="Tìm khu vực bếp..."
              className="h-8 pl-8 pr-7 text-xs"
              data-testid="station-search-input"
            />
            {stationSearch.draft ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={stationSearch.clear}
                title="Xoá tìm kiếm"
                aria-label="Xoá tìm kiếm"
                className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-card">
          {filteredStations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy khu vực bếp phù hợp.
            </div>
          ) : (
            filteredStations.map((st) => (
            <div
              key={st.code}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-accent/40 transition-colors"
            >
              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-accent-text shrink-0" />
                  <span
                    className={`font-semibold text-sm truncate ${
                      st.isHidden ? 'line-through text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {st.name}
                  </span>
                  {st.isHidden ? (
                    <Badge variant="secondary" className="text-[10px] font-bold">
                      Đang ẩn
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px] font-bold">
                      Đang hiện
                    </Badge>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground truncate">{st.desc}</span>
              </div>

              {canWriteMdm && st.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    data-testid={`toggle-hide-station-btn-${st.code}`}
                    onClick={() => void handleToggleHide(st)}
                    title={
                      st.isHidden
                        ? 'Hiện lại khu vực bếp này trên POS & QR'
                        : 'Ẩn khu vực bếp này (cùng các danh mục và món bên trong) khỏi POS & QR'
                    }
                  >
                    {st.isHidden ? (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    data-testid={`edit-station-btn-${st.code}`}
                    onClick={() => handleEdit(st)}
                    title="Đổi tên khu vực bếp"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    data-testid={`delete-station-btn-${st.code}`}
                    onClick={() => void handleDelete(st)}
                    title="Xoá khu vực bếp (chỉ xoá được khi không còn danh mục và món ăn)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
