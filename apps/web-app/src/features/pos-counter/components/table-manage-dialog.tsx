import { isLegacyLongQrToken, type PosTableGridResponse } from '@fnb/shared';
import {
  Archive,
  Copy,
  Download,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
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
import {
  createStoredZipBlob,
  downloadBlobFile,
  renderQrCardPngBlob,
  sanitizeQrFilename,
} from '@/utils/qr-export';
import { generateOfflineQrDataUrl } from '@/utils/qr-svg';
import {
  useCreateDiningTableMutation,
  useDeleteDiningTableMutation,
  useRotateDiningTableQrMutation,
  useRotateTakeawayQrMutation,
  useShortenLegacyQrTokensMutation,
  useUpdateDiningTableMutation,
} from '../api/pos.api';

interface TableManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: PosTableGridResponse['tables'];
  takeawayQrToken?: string;
  canManageTables: boolean;
}

interface QrPreviewTarget {
  id: number | 'TAKEAWAY';
  name: string;
  headline: string;
  subtitle: string;
  qrToken: string;
}

export function TableManageDialog({
  open,
  onOpenChange,
  tables,
  takeawayQrToken,
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
  const [confirmRotateQrTarget, setConfirmRotateQrTarget] = React.useState<{
    id: number | 'TAKEAWAY';
    name: string;
  } | null>(null);
  const [printQrTarget, setPrintQrTarget] = React.useState<QrPreviewTarget | null>(null);
  const [qrImageDataUrl, setQrImageDataUrl] = React.useState<string>('');
  const [downloadingQrKey, setDownloadingQrKey] = React.useState<string | null>(null);
  const [isExportingZip, setIsExportingZip] = React.useState(false);

  const createMutation = useCreateDiningTableMutation();
  const updateMutation = useUpdateDiningTableMutation();
  const deleteMutation = useDeleteDiningTableMutation();
  const rotateQrMutation = useRotateDiningTableQrMutation();
  const rotateTakeawayQrMutation = useRotateTakeawayQrMutation();
  const shortenQrMutation = useShortenLegacyQrTokensMutation();

  const hasLegacyLongQr = React.useMemo(
    () => tables.some((t) => isLegacyLongQrToken(t.qrToken)) || isLegacyLongQrToken(takeawayQrToken),
    [tables, takeawayQrToken],
  );

  const effectiveStoreName = settings.qr.storeName || settings.storeName || 'Quán Mì Cay';

  const buildTableQrUrl = React.useCallback((qrToken: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return `${origin}/q/${encodeURIComponent(qrToken)}`;
  }, []);

  React.useEffect(() => {
    if (!printQrTarget) {
      setQrImageDataUrl('');
      return;
    }
    let active = true;
    const url = buildTableQrUrl(printQrTarget.qrToken);
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
  }, [printQrTarget, buildTableQrUrl]);

  const handleCopyQrLink = async (label: string, qrToken?: string) => {
    if (!qrToken) return;
    const url = buildTableQrUrl(qrToken);
    try {
      await navigator.clipboard?.writeText(url);
      notify('pos.table.qrCopied', {
        variant: 'success',
        vars: { tableName: label },
      });
    } catch {
      notify('pos.table.qrCopyFallback', {
        variant: 'default',
        vars: { tableName: label, url },
      });
    }
  };

  const handleDownloadQrPng = async (params: {
    key: string;
    name: string;
    subtitle: string;
    qrToken?: string;
  }) => {
    if (!params.qrToken) return;
    setDownloadingQrKey(params.key);
    try {
      const blob = await renderQrCardPngBlob({
        qrUrl: buildTableQrUrl(params.qrToken),
        title: params.name,
        storeName: effectiveStoreName,
        subtitle: params.subtitle,
      });
      const filename = `qr-${sanitizeQrFilename(params.name)}.png`;
      downloadBlobFile(blob, filename);
      notify('pos.table.qrDownloaded', {
        variant: 'success',
        vars: { tableName: params.name },
      });
    } catch (error) {
      notify('pos.table.qrExportError', {
        variant: 'destructive',
        vars: {
          reason:
            error instanceof Error ? error.message : 'Không thể xuất ảnh PNG mã QR',
        },
      });
    } finally {
      setDownloadingQrKey(null);
    }
  };

  const handleDownloadAllQrZip = async () => {
    const targets: Array<{ name: string; subtitle: string; qrToken: string; filename: string }> = [
      ...tables
        .filter((t): t is typeof t & { qrToken: string } => Boolean(t.qrToken))
        .map((t) => ({
          name: t.name,
          subtitle: 'Quét mã QR để gọi món tại bàn',
          qrToken: t.qrToken,
          filename: `qr-${sanitizeQrFilename(t.name)}.png`,
        })),
      ...(takeawayQrToken
        ? [
            {
              name: 'Đơn Mang Về',
              subtitle: 'Quét mã QR để tự đặt món Mang về',
              qrToken: takeawayQrToken,
              filename: 'qr-mang-ve.png',
            },
          ]
        : []),
    ];

    if (targets.length === 0) {
      notify('pos.table.qrExportError', {
        variant: 'destructive',
        vars: { reason: 'Chưa có mã QR nào sẵn sàng để xuất' },
      });
      return;
    }

    setIsExportingZip(true);
    try {
      const entries = await Promise.all(
        targets.map(async (item) => {
          const pngBlob = await renderQrCardPngBlob({
            qrUrl: buildTableQrUrl(item.qrToken),
            title: item.name,
            storeName: effectiveStoreName,
            subtitle: item.subtitle,
          });
          const buf = await pngBlob.arrayBuffer();
          return {
            name: item.filename,
            data: new Uint8Array(buf),
          };
        }),
      );
      const zipBlob = createStoredZipBlob(entries);
      const storeSlug = sanitizeQrFilename(effectiveStoreName);
      downloadBlobFile(zipBlob, `qr-${storeSlug}-all.zip`);
      notify('pos.table.qrZipExported', {
        variant: 'success',
        vars: { count: entries.length },
      });
    } catch (error) {
      notify('pos.table.qrExportError', {
        variant: 'destructive',
        vars: {
          reason:
            error instanceof Error ? error.message : 'Không thể nén bộ ảnh mã QR (.zip)',
        },
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleRotateQr = async (target: { id: number | 'TAKEAWAY'; name: string }) => {
    try {
      if (target.id === 'TAKEAWAY') {
        const rotated = await rotateTakeawayQrMutation.mutateAsync();
        notify('pos.table.qrRotateSuccess', {
          variant: 'success',
          vars: { tableName: 'Mã QR Mang về' },
        });
        setConfirmRotateQrTarget(null);
        setPrintQrTarget({
          id: 'TAKEAWAY',
          name: 'Đặt món Mang về',
          headline: 'QUÉT MÃ QR ĐẶT MÓN MANG VỀ',
          subtitle: 'Quét mã QR để tự đặt món Mang về',
          qrToken: rotated.qrToken,
        });
        return;
      }

      const rotated = await rotateQrMutation.mutateAsync(target.id);
      notify('pos.table.qrRotateSuccess', {
        variant: 'success',
        vars: { tableName: rotated.name },
      });
      setConfirmRotateQrTarget(null);
      setPrintQrTarget({
        id: rotated.id,
        name: rotated.name,
        headline: 'QUÉT MÃ QR ĐẶT MÓN TẠI BÀN',
        subtitle: 'Quét mã QR để gọi món tại bàn',
        qrToken: rotated.qrToken,
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'pos.table.saveError',
        error,
        'Không thể đổi mã QR',
      );
      notify('pos.table.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể đổi mã QR' },
      });
      setConfirmRotateQrTarget(null);
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

  const handleShortenAllLegacyQr = async () => {
    try {
      const res = await shortenQrMutation.mutateAsync();
      const total = res.updatedTables + (res.updatedTakeaway ? 1 : 0);
      notify('pos.table.qrShortenAllSuccess', {
        variant: 'success',
        vars: { count: total },
      });
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'pos.table.qrExportError',
        error,
        'Không thể rút gọn danh sách mã QR cũ',
      );
      notify('pos.table.qrExportError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Không thể rút gọn danh sách mã QR cũ' },
      });
    }
  };

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
            <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-accent-text" />
                  <span>Quản lý Sơ đồ Bàn Vật lý ({tables.length} bàn)</span>
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Thêm bàn mới, đổi tên bàn hoặc xuất ảnh mã QR cho từng bàn và kênh Mang về.
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {canManageTables && hasLegacyLongQr ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="shorten-legacy-qr-btn"
                    disabled={shortenQrMutation.isPending}
                    onClick={() => void handleShortenAllLegacyQr()}
                    className="gap-1.5 font-semibold border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{shortenQrMutation.isPending ? 'Đang rút gọn...' : 'Thu gọn mã QR cũ'}</span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="download-all-qr-zip-btn"
                  disabled={isExportingZip || (tables.every((t) => !t.qrToken) && !takeawayQrToken)}
                  onClick={() => void handleDownloadAllQrZip()}
                  className="gap-1.5 font-semibold shrink-0"
                >
                  <Archive className="h-4 w-4 text-accent-text" />
                  <span>{isExportingZip ? 'Đang nén...' : 'Tải tất cả (.zip)'}</span>
                </Button>
              </div>
            </div>
          </DialogHeader>

          {takeawayQrToken ? (
            <div
              data-testid="takeaway-qr-manage-card"
              className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      Mã QR Đặt món Mang về (Takeaway)
                    </p>
                    <button
                      type="button"
                      data-testid="copy-short-takeaway-qr-chip"
                      onClick={() => void handleCopyQrLink('Đặt món Mang về', takeawayQrToken)}
                      title="Bấm để sao chép đường dẫn ngắn"
                      className="inline-flex max-w-[180px] items-center rounded-md border border-indigo-500/30 bg-background/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300 truncate"
                    >
                      /q/{takeawayQrToken}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Dán tại quầy hoặc mặt tiền — mỗi lượt quét tạo 1 đơn Mang về độc lập.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="copy-takeaway-qr-btn"
                  onClick={() => void handleCopyQrLink('Đặt món Mang về', takeawayQrToken)}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Link QR</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="download-takeaway-qr-btn"
                  disabled={downloadingQrKey === 'takeaway'}
                  onClick={() =>
                    void handleDownloadQrPng({
                      key: 'takeaway',
                      name: 'Đơn Mang Về',
                      subtitle: 'Quét mã QR để tự đặt món Mang về',
                      qrToken: takeawayQrToken,
                    })
                  }
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{downloadingQrKey === 'takeaway' ? 'Đang tải...' : 'Tải ảnh'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="print-takeaway-qr-btn"
                  onClick={() =>
                    setPrintQrTarget({
                      id: 'TAKEAWAY',
                      name: 'Đặt món Mang về',
                      headline: 'QUÉT MÃ QR ĐẶT MÓN MANG VỀ',
                      subtitle: 'Quét mã QR để tự đặt món Mang về',
                      qrToken: takeawayQrToken,
                    })
                  }
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>In QR 80mm</span>
                </Button>
                {canManageTables ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="rotate-takeaway-qr-btn"
                    disabled={rotateTakeawayQrMutation.isPending}
                    onClick={() =>
                      setConfirmRotateQrTarget({ id: 'TAKEAWAY', name: 'Mã QR Mang về' })
                    }
                    className="h-8 px-2.5 text-xs gap-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Đổi mã</span>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

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
                  id="pos-table-name-input"
                  name="tableName"
                  aria-label={editingTable ? 'Sửa tên bàn vật lý' : 'Tên bàn vật lý mới'}
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
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
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
                    {t.qrToken ? (
                      <button
                        type="button"
                        data-testid={`short-table-qr-chip-${t.id}`}
                        onClick={() => void handleCopyQrLink(t.name, t.qrToken)}
                        title="Bấm để sao chép đường dẫn ngắn"
                        className="mb-2 inline-flex w-fit max-w-full items-center rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 truncate"
                      >
                        /q/{t.qrToken}
                      </button>
                    ) : null}

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
                            onClick={() =>
                              setConfirmRotateQrTarget({ id: t.id, name: t.name })
                            }
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
                          <div className="flex flex-wrap items-center justify-between gap-1 border-t border-dashed border-border/50 pt-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                              data-testid={`copy-pos-table-qr-btn-${t.id}`}
                              onClick={() => void handleCopyQrLink(t.name, t.qrToken)}
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
                              data-testid={`download-pos-table-qr-btn-${t.id}`}
                              disabled={downloadingQrKey === `table-${t.id}`}
                              onClick={() =>
                                void handleDownloadQrPng({
                                  key: `table-${t.id}`,
                                  name: t.name,
                                  subtitle: 'Quét mã QR để gọi món tại bàn',
                                  qrToken: t.qrToken,
                                })
                              }
                              title="Tải ảnh thẻ mã QR (PNG) để in hoặc gửi"
                            >
                              <Download className="h-3 w-3" />
                              <span>Tải ảnh</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                              data-testid={`print-pos-table-qr-btn-${t.id}`}
                              onClick={() =>
                                setPrintQrTarget({
                                  id: t.id,
                                  name: t.name,
                                  headline: 'QUÉT MÃ QR ĐẶT MÓN TẠI BÀN',
                                  subtitle: 'Quét mã QR để gọi món tại bàn',
                                  qrToken: t.qrToken!,
                                })
                              }
                              title="In phiếu mã QR dán bàn khổ 80mm"
                            >
                              <Printer className="h-3 w-3" />
                              <span>In QR</span>
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
                <DialogDescription asChild>
                  <div className="space-y-2 pt-2 text-left text-sm text-muted-foreground">
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
                  </div>
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
        open={Boolean(confirmRotateQrTarget)}
        onOpenChange={(next) => {
          if (!next && !rotateQrMutation.isPending && !rotateTakeawayQrMutation.isPending) {
            setConfirmRotateQrTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md" data-testid="table-rotate-qr-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <RefreshCw className="h-5 w-5" />
              <span>Đổi mã QR cho {confirmRotateQrTarget?.name}</span>
            </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 pt-2 text-left text-sm text-muted-foreground">
                    <p>
                      Bạn có chắc chắn muốn tạo mã QR mới cho{' '}
                      <strong className="text-foreground">{confirmRotateQrTarget?.name}</strong>?
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                      Mã QR cũ sẽ bị vô hiệu hoá ngay lập tức để tránh quét nhầm/lạm dụng. Các đơn hàng đang mở vẫn được giữ nguyên.
                    </p>
                  </div>
                </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRotateQrTarget(null)}
              disabled={rotateQrMutation.isPending || rotateTakeawayQrMutation.isPending}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              data-testid="confirm-rotate-table-qr-btn"
              onClick={() => {
                if (confirmRotateQrTarget) void handleRotateQr(confirmRotateQrTarget);
              }}
              disabled={rotateQrMutation.isPending || rotateTakeawayQrMutation.isPending}
              className="font-bold"
            >
              {rotateQrMutation.isPending || rotateTakeawayQrMutation.isPending
                ? 'Đang tạo mã mới...'
                : 'Xác nhận đổi mã QR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 80mm Thermal QR Slip & Image Export Dialog */}
      <Dialog
        open={Boolean(printQrTarget)}
        onOpenChange={(next) => {
          if (!next) setPrintQrTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="table-print-qr-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-accent-text" />
              <span>Phiếu Mã QR — {printQrTarget?.name}</span>
            </DialogTitle>
            <DialogDescription>
              In phiếu nhiệt 80mm hoặc tải ảnh thẻ PNG để in màu / gửi khách hàng.
            </DialogDescription>
          </DialogHeader>
          {printQrTarget ? (
            <div
              data-testid="thermal-table-qr-slip"
              className="mx-auto flex w-[280px] flex-col items-center rounded-xl border border-dashed border-border bg-white p-4 text-center text-black shadow-xs"
            >
              <p className="text-xs font-bold uppercase tracking-wider">
                {printQrTarget.headline}
              </p>
              <p className="mt-1 text-xl font-extrabold">{printQrTarget.name}</p>
              {qrImageDataUrl ? (
                <img
                  src={qrImageDataUrl}
                  alt={`QR ${printQrTarget.name}`}
                  className="my-3 h-44 w-44 rounded border border-neutral-200 p-1"
                />
              ) : (
                <div className="my-3 flex h-44 w-44 items-center justify-center rounded border border-neutral-200 text-xs text-neutral-500">
                  Đang tạo mã QR...
                </div>
              )}
              <p className="break-all font-mono text-[9.5px] leading-snug text-neutral-600">
                {buildTableQrUrl(printQrTarget.qrToken)}
              </p>
            </div>
          ) : null}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPrintQrTarget(null)}>
              Đóng
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="download-print-table-qr-btn"
                disabled={!printQrTarget || downloadingQrKey === 'preview'}
                onClick={() => {
                  if (!printQrTarget) return;
                  void handleDownloadQrPng({
                    key: 'preview',
                    name: printQrTarget.name,
                    subtitle: printQrTarget.subtitle,
                    qrToken: printQrTarget.qrToken,
                  });
                }}
                className="gap-1.5 font-semibold"
              >
                <Download className="h-4 w-4" />
                <span>{downloadingQrKey === 'preview' ? 'Đang tải...' : 'Tải ảnh PNG'}</span>
              </Button>
              <Button
                type="button"
                data-testid="trigger-print-table-qr-btn"
                disabled={!printQrTarget || !qrImageDataUrl}
                onClick={() => {
                  if (!printQrTarget || !qrImageDataUrl) return;
                  thermalPrinter.printTableQr({
                    tableName: printQrTarget.name,
                    qrUrl: buildTableQrUrl(printQrTarget.qrToken),
                    qrImageDataUrl,
                    storeName: effectiveStoreName,
                  });
                }}
                className="gap-1.5 font-bold"
              >
                <Printer className="h-4 w-4" />
                <span>In mã QR 80mm</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
