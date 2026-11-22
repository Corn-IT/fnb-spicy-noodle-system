import { type PosTableGridResponse } from '@fnb/shared';
import { Copy, Pencil, Printer, QrCode, RefreshCw, Trash2, Utensils } from 'lucide-react';
import * as React from 'react';

import { useThermalPrinter } from '@/components/print-slips';
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
import { useAppMessages } from '@/hooks/use-app-messages';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { cn } from '@/utils/cn';
import { generateOfflineQrDataUrl } from '@/utils/qr-svg';
import {
  useCreateDiningTableMutation,
  useDeleteDiningTableMutation,
  useRotateDiningTableQrMutation,
  useUpdateDiningTableMutation,
} from '../api/pos.api';

interface TableManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: PosTableGridResponse['tables'];
  canManageTables: boolean;
}

export function TableManageDialog({
  open,
  onOpenChange,
  tables,
  canManageTables,
}: TableManageDialogProps) {
  const { notify, resolveMessage, resolveErrorMessage } = useAppMessages();
  const { settings } = useStoreSettings();
  const thermalPrinter = useThermalPrinter();
  const [editingTable, setEditingTable] = React.useState<
    PosTableGridResponse['tables'][number] | null
  >(null);
  const [name, setName] = React.useState('');
  const [confirmDeleteTable, setConfirmDeleteTable] = React.useState<
    PosTableGridResponse['tables'][number] | null
  >(null);
  const [confirmRotateQrTable, setConfirmRotateQrTable] = React.useState<
    PosTableGridResponse['tables'][number] | null
  >(null);
  const [printQrTable, setPrintQrTable] = React.useState<{
    id: number;
    name: string;
    qrToken: string;
  } | null>(null);
  const [qrImageDataUrl, setQrImageDataUrl] = React.useState<string>('');

  const createMutation = useCreateDiningTableMutation();
  const updateMutation = useUpdateDiningTableMutation();
  const deleteMutation = useDeleteDiningTableMutation();
  const rotateQrMutation = useRotateDiningTableQrMutation();

  const buildTableQrUrl = React.useCallback((qrToken: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return `${origin}/qr/${encodeURIComponent(qrToken)}`;
  }, []);

  React.useEffect(() => {
    if (!printQrTable) {
      setQrImageDataUrl('');
      return;
    }
    let active = true;
    const url = buildTableQrUrl(printQrTable.qrToken);
    void generateOfflineQrDataUrl(url)
      .then((dataUrl) => {
        if (active) setQrImageDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrImageDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [printQrTable, buildTableQrUrl]);

  const handleCopyQrLink = async (table: PosTableGridResponse['tables'][number]) => {
    if (!table.qrToken) return;
    const url = buildTableQrUrl(table.qrToken);
    try {
      await navigator.clipboard?.writeText(url);
      notify('pos.table.renameSuccess', {
        variant: 'success',
        vars: { tableName: `${table.name} (Đã sao chép link QR)` },
      });
    } catch {
      notify('pos.table.renameSuccess', {
        variant: 'default',
        vars: { tableName: `${table.name}: ${url}` },
      });
    }
  };

  const handleRotateQr = async (table: PosTableGridResponse['tables'][number]) => {
    try {
      const rotated = await rotateQrMutation.mutateAsync(table.id);
      notify('pos.table.renameSuccess', {
        variant: 'success',
        vars: { tableName: `${rotated.name} (Đã đổi mã QR mới)` },
      });
      setConfirmRotateQrTable(null);
      setPrintQrTable({
        id: rotated.id,
        name: rotated.name,
        qrToken: rotated.qrToken,
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'pos.table.saveError',
        error,
        'Không thể đổi mã QR bàn',
      );
      notify('pos.table.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể đổi mã QR bàn' },
      });
      setConfirmRotateQrTable(null);
    }
  };

  const resetForm = () => {
    setEditingTable(null);
    setName('');
  };

  const handleEdit = (table: PosTableGridResponse['tables'][number]) => {
    if (table.status !== 'AVAILABLE') {
      notify('pos.table.editOccupiedError', {
        variant: 'destructive',
        vars: { tableName: table.name },
      });
      return;
    }
    setEditingTable(table);
    setName(table.name);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notify('pos.table.missingName', { variant: 'destructive' });
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 30) {
      notify('pos.table.invalidLength', { variant: 'destructive' });
      return;
    }
    if (/mang\s*v[eề]|takeaway/i.test(trimmed)) {
      notify('pos.table.reservedTakeawayName', { variant: 'destructive' });
      return;
    }

    const isDuplicate = tables.some(
      (t) =>
        t.id !== editingTable?.id &&
        t.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      notify('pos.table.duplicateName', {
        variant: 'destructive',
        vars: { tableName: trimmed },
      });
      return;
    }

    try {
      if (editingTable) {
        await updateMutation.mutateAsync({
          id: editingTable.id,
          input: { name: trimmed },
        });
        notify('pos.table.renameSuccess', {
          variant: 'success',
          vars: { tableName: trimmed },
        });
      } else {
        await createMutation.mutateAsync({ name: trimmed });
        notify('pos.table.createSuccess', {
          variant: 'success',
          vars: { tableName: trimmed },
        });
      }
      resetForm();
    } catch (error) {
      const resolvedErr = resolveErrorMessage('pos.table.saveError', error, 'Không thể lưu bàn');
      notify('pos.table.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể lưu bàn' },
      });
    }
  };

  const handleDelete = async (table: PosTableGridResponse['tables'][number]) => {
    if (table.status !== 'AVAILABLE' || table.activeOrderId !== null) {
      notify('pos.table.deleteOccupiedError', {
        variant: 'destructive',
        vars: { tableName: table.name },
      });
      setConfirmDeleteTable(null);
      return;
    }
    try {
      await deleteMutation.mutateAsync(table.id);
      notify('pos.table.deleteSuccess', {
        variant: 'success',
        vars: { tableName: table.name },
      });
      if (editingTable?.id === table.id) resetForm();
      setConfirmDeleteTable(null);
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'pos.table.deleteError',
        error,
        'Không thể xoá bàn',
      );
      notify('pos.table.deleteError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể xoá bàn' },
      });
      setConfirmDeleteTable(null);
    }
  };

  const deleteConfirmCopy = resolveMessage('pos.confirm.deleteTable', {
    tableName: confirmDeleteTable?.name ?? '',
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) resetForm();
          onOpenChange(next);
        }}
      >
        <DialogContent
          closeLabel="Đóng"
          className="max-w-4xl sm:max-w-4xl lg:max-w-5xl"
          data-testid="table-manage-dialog"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-accent-text" />
              <span>Quản lý Sơ đồ Bàn Vật lý ({tables.length} bàn)</span>
            </DialogTitle>
            <DialogDescription>
              Thêm bàn mới, đổi tên bàn hoặc xoá bàn trống chưa phát sinh hoá đơn trong vòng 30 ngày qua.
            </DialogDescription>
          </DialogHeader>

          {canManageTables ? (
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {editingTable ? `Đang sửa: ${editingTable.name}` : 'Thêm bàn vật lý mới'}
                </span>
                {editingTable ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-accent-text hover:underline"
                  >
                    Chuyển sang tạo mới
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  data-testid="pos-table-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Tên bàn (VD: Bàn ${String(tables.length + 1).padStart(2, '0')})...`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  data-testid="save-pos-table-btn"
                  onClick={() => void handleSave()}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="font-bold shrink-0"
                >
                  <span>{editingTable ? 'Lưu tên bàn' : 'Thêm bàn'}</span>
                </Button>
              </div>
            </div>
          ) : null}

          {/* Expanded 4 tables per row grid */}
          <div className="max-h-[60vh] overflow-y-auto p-1 rounded-xl border border-border bg-card">
            {tables.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Chưa có bàn vật lý nào.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 p-2">
                {tables.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      'relative flex flex-col justify-between rounded-xl border p-3 transition-colors bg-card hover:border-primary/50 shadow-xs',
                      editingTable?.id === t.id && 'ring-2 ring-primary border-primary',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-2.5">
                      <span className="font-bold text-sm text-foreground truncate">{t.name}</span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold shrink-0',
                          t.status === 'AVAILABLE' &&
                            'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                          t.status === 'PENDING' &&
                            'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse',
                          t.status === 'OCCUPIED' &&
                            'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400',
                        )}
                      >
                        {t.status === 'AVAILABLE'
                          ? 'Trống'
                          : t.status === 'PENDING'
                            ? 'Mới gọi món'
                            : 'Đang phục vụ'}
                      </span>
                    </div>

                    {canManageTables ? (
                      <div className="space-y-1.5 pt-2 border-t border-border/60">
                        <div className="flex items-center justify-between gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            data-testid={`edit-pos-table-btn-${t.id}`}
                            disabled={t.status !== 'AVAILABLE'}
                            onClick={() => handleEdit(t)}
                            title={
                              t.status !== 'AVAILABLE'
                                ? 'Chỉ có thể sửa tên khi bàn đang trống'
                                : 'Đổi tên bàn'
                            }
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Sửa</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                            data-testid={`rotate-pos-table-qr-btn-${t.id}`}
                            disabled={rotateQrMutation.isPending}
                            onClick={() => setConfirmRotateQrTable(t)}
                            title="Đổi mã QR mới cho bàn (vô hiệu hoá mã QR cũ bị lộ)"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Đổi QR</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10"
                            data-testid={`delete-pos-table-btn-${t.id}`}
                            disabled={t.status !== 'AVAILABLE' || t.activeOrderId !== null}
                            onClick={() => setConfirmDeleteTable(t)}
                            title={
                              t.status !== 'AVAILABLE'
                                ? 'Không thể xoá bàn đang có khách hoặc mới gọi món'
                                : 'Xoá bàn'
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Xoá</span>
                          </Button>
                        </div>
                        {t.qrToken ? (
                          <div className="flex items-center justify-between gap-1 border-t border-dashed border-border/50 pt-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                              data-testid={`copy-pos-table-qr-btn-${t.id}`}
                              onClick={() => void handleCopyQrLink(t)}
                              title="Sao chép đường dẫn đặt món QR của bàn"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Link QR</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                              data-testid={`print-pos-table-qr-btn-${t.id}`}
                              onClick={() =>
                                setPrintQrTable({ id: t.id, name: t.name, qrToken: t.qrToken! })
                              }
                              title="In phiếu mã QR dán bàn khổ 80mm"
                            >
                              <Printer className="h-3 w-3" />
                              <span>In QR 80mm</span>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmDeleteTable)}
        onOpenChange={(next) => {
          if (!next && !deleteMutation.isPending) setConfirmDeleteTable(null);
        }}
      >
        <DialogContent className="max-w-md" data-testid="table-delete-confirm-dialog">
              <DialogHeader>
                <DialogTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  <span>{deleteConfirmCopy.title}</span>
                </DialogTitle>
                <DialogDescription className="space-y-2 pt-2 text-left">
                  <p>
                    {deleteConfirmCopy.isOverridden && deleteConfirmCopy.description ? (
                      deleteConfirmCopy.description
                    ) : (
                      <>
                        Bạn có chắc chắn muốn xoá bàn{' '}
                        <strong className="text-foreground">{confirmDeleteTable?.name}</strong> khỏi sơ đồ bàn vật lý?
                      </>
                    )}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                    Lưu ý: Bàn chỉ có thể xoá khi đang trống và không phát sinh bất kỳ hoá đơn nào trong vòng 30 ngày gần đây.
                  </p>
                </DialogDescription>
              </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteTable(null)}
              disabled={deleteMutation.isPending}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-delete-table-btn"
              onClick={() => {
                if (confirmDeleteTable) void handleDelete(confirmDeleteTable);
              }}
              disabled={deleteMutation.isPending}
              className="font-bold"
            >
              {deleteMutation.isPending ? 'Đang xoá...' : 'Xác nhận xoá'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate QR Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmRotateQrTable)}
        onOpenChange={(next) => {
          if (!next && !rotateQrMutation.isPending) setConfirmRotateQrTable(null);
        }}
      >
        <DialogContent className="max-w-md" data-testid="table-rotate-qr-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <RefreshCw className="h-5 w-5" />
              <span>Đổi mã QR cho {confirmRotateQrTable?.name}</span>
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-left">
              <p>
                Bạn có chắc chắn muốn tạo mã QR mới cho{' '}
                <strong className="text-foreground">{confirmRotateQrTable?.name}</strong>?
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                Mã QR cũ dán trên bàn sẽ bị vô hiệu hoá ngay lập tức để chặn kẻ xấu quét từ xa. Đơn hàng đang phục vụ tại bàn (nếu có) vẫn được giữ nguyên.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRotateQrTable(null)}
              disabled={rotateQrMutation.isPending}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              data-testid="confirm-rotate-table-qr-btn"
              onClick={() => {
                if (confirmRotateQrTable) void handleRotateQr(confirmRotateQrTable);
              }}
              disabled={rotateQrMutation.isPending}
              className="font-bold"
            >
              {rotateQrMutation.isPending ? 'Đang tạo mã mới...' : 'Xác nhận đổi mã QR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 80mm Thermal QR Slip Print Dialog */}
      <Dialog
        open={Boolean(printQrTable)}
        onOpenChange={(next) => {
          if (!next) setPrintQrTable(null);
        }}
      >
        <DialogContent className="max-w-sm" data-testid="table-print-qr-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-accent-text" />
              <span>Phiếu Mã QR Đặt Món 80mm — {printQrTable?.name}</span>
            </DialogTitle>
            <DialogDescription>
              In phiếu nhiệt 80mm để dán lên mặt bàn cho khách quét gọi món.
            </DialogDescription>
          </DialogHeader>
          {printQrTable ? (
            <div
              data-testid="thermal-table-qr-slip"
              className="mx-auto flex w-[280px] flex-col items-center rounded-xl border border-dashed border-border bg-white p-4 text-center text-black shadow-xs"
            >
              <p className="text-xs font-bold uppercase tracking-wider">QUÉT MÃ QR ĐẶT MÓN TẠI BÀN</p>
              <p className="mt-1 text-xl font-extrabold">{printQrTable.name}</p>
              {qrImageDataUrl ? (
                <img
                  src={qrImageDataUrl}
                  alt={`QR ${printQrTable.name}`}
                  className="my-3 h-44 w-44 rounded border border-neutral-200 p-1"
                />
              ) : (
                <div className="my-3 flex h-44 w-44 items-center justify-center rounded border border-neutral-200 text-xs text-neutral-500">
                  Đang tạo mã QR...
                </div>
              )}
              <p className="break-all font-mono text-[10px] text-neutral-600">
                {buildTableQrUrl(printQrTable.qrToken)}
              </p>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPrintQrTable(null)}>
              Đóng
            </Button>
            <Button
              type="button"
              data-testid="trigger-print-table-qr-btn"
              disabled={!printQrTable || !qrImageDataUrl}
              onClick={() => {
                if (!printQrTable || !qrImageDataUrl) return;
                thermalPrinter.printTableQr({
                  tableName: printQrTable.name,
                  qrUrl: buildTableQrUrl(printQrTable.qrToken),
                  qrImageDataUrl,
                  storeName: settings.storeName,
                });
              }}
              className="gap-1.5 font-bold"
            >
              <Printer className="h-4 w-4" />
              <span>In mã QR 80mm</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
