import { StoreAssetKind, type PublicStoreSettingsResponse, type UploadStoreAssetInput } from '@fnb/shared';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import * as React from 'react';

import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Button } from '@/components/ui/button';
import { buildStoreAssetUrl } from '@/hooks/use-store-settings';
import { resizeImageFileToUploadPayload } from '@/utils/store-theme';

interface AssetSlotConfig {
  kind: StoreAssetKind;
  title: string;
  description: string;
  recommendation: string;
}

const ASSET_SLOTS: readonly AssetSlotConfig[] = [
  {
    kind: StoreAssetKind.LOGO,
    title: 'Logo chính (POS & Đăng nhập & Phiếu in)',
    description: 'Hiển thị ở thanh bên trái, màn hình đăng nhập và hoá đơn (khi bật in logo).',
    recommendation: 'PNG / JPEG / WebP · tự động nén tối đa 512×512px.',
  },
  {
    kind: StoreAssetKind.FAVICON,
    title: 'Favicon trình duyệt',
    description: 'Biểu tượng nhỏ hiển thị trên tab trình duyệt ở tất cả các trang.',
    recommendation: 'PNG / ICO / WebP · tự động chuẩn hoá 64×64px PNG.',
  },
  {
    kind: StoreAssetKind.QR_LOGO,
    title: 'Logo trang khách quét QR',
    description: 'Logo riêng cho màn hình gọi món QR của khách. Nếu để trống sẽ dùng Logo chính.',
    recommendation: 'PNG / JPEG / WebP · tự động nén tối đa 512×512px.',
  },
];

export function resolveAssetVersion(
  assets: PublicStoreSettingsResponse['assets'],
  kind: StoreAssetKind,
): string | null {
  switch (kind) {
    case StoreAssetKind.LOGO:
      return assets.logo;
    case StoreAssetKind.FAVICON:
      return assets.favicon;
    case StoreAssetKind.QR_LOGO:
      return assets.qrLogo;
  }
}

export interface StoreAssetsPanelProps {
  settings: PublicStoreSettingsResponse;
  canUpdate: boolean;
  isBusy: boolean;
  onUpload: (kind: StoreAssetKind, payload: UploadStoreAssetInput) => Promise<void>;
  onDelete: (kind: StoreAssetKind) => Promise<void>;
}

export function StoreAssetsPanel({
  settings,
  canUpdate,
  isBusy,
  onUpload,
  onDelete,
}: StoreAssetsPanelProps) {
  const [errorsByKind, setErrorsByKind] = React.useState<Partial<Record<StoreAssetKind, string>>>({});
  const [uploadingKind, setUploadingKind] = React.useState<StoreAssetKind | null>(null);
  const inputRefs = React.useRef<Partial<Record<StoreAssetKind, HTMLInputElement | null>>>({});

  const handleFileSelected = async (
    kind: StoreAssetKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setErrorsByKind((prev) => ({ ...prev, [kind]: undefined }));
    setUploadingKind(kind);

    try {
      const payload = await resizeImageFileToUploadPayload(file, kind);
      await onUpload(kind, payload);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Không thể xử lý hoặc tải ảnh lên máy chủ';
      setErrorsByKind((prev) => ({ ...prev, [kind]: message }));
    } finally {
      setUploadingKind(null);
    }
  };

  const handleDeleteClick = async (kind: StoreAssetKind) => {
    setErrorsByKind((prev) => ({ ...prev, [kind]: undefined }));
    setUploadingKind(kind);
    try {
      await onDelete(kind);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể xoá hình ảnh';
      setErrorsByKind((prev) => ({ ...prev, [kind]: message }));
    } finally {
      setUploadingKind(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
        Ảnh tải lên được lưu và áp dụng ngay lập tức cho toàn hệ thống (không cần bấm nút Lưu cấu hình). Định dạng hỗ trợ: PNG, JPEG, WebP, ICO (không nhận file SVG).
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ASSET_SLOTS.map((slot) => {
          const version = resolveAssetVersion(settings.assets, slot.kind);
          const assetUrl = buildStoreAssetUrl(slot.kind, version);
          const errorMessage = errorsByKind[slot.kind];
          const slotBusy = isBusy || uploadingKind === slot.kind;

          return (
            <div
              key={slot.kind}
              className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{slot.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{slot.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
                  <StoreBrandLogo
                    src={assetUrl}
                    storeName={settings.storeName}
                    testId={`asset-preview-${slot.kind}`}
                    className={
                      slot.kind === StoreAssetKind.FAVICON
                        ? 'h-12 w-12 rounded-lg'
                        : 'h-16 w-16 rounded-xl'
                    }
                    imgClassName="object-contain p-1"
                    fallbackClassName="text-base"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    {version ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                        Đã tải lên
                      </span>
                    ) : (
                      <span className="font-medium text-muted-foreground">
                        Chưa cấu hình (đang dùng chữ cái đại diện)
                      </span>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">{slot.recommendation}</p>
                  </div>
                </div>

                {errorMessage ? (
                  <p
                    role="alert"
                    data-testid={`asset-error-${slot.kind}`}
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive"
                  >
                    {errorMessage}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  ref={(el) => {
                    inputRefs.current[slot.kind] = el;
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.webp,.ico"
                  data-testid={`asset-file-input-${slot.kind}`}
                  disabled={!canUpdate || slotBusy}
                  onChange={(e) => {
                    void handleFileSelected(slot.kind, e);
                  }}
                  className="sr-only"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canUpdate || slotBusy}
                  data-testid={`asset-upload-btn-${slot.kind}`}
                  onClick={() => inputRefs.current[slot.kind]?.click()}
                  className="flex-1 gap-1.5"
                >
                  {uploadingKind === slot.kind ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{version ? 'Thay ảnh' : 'Tải ảnh lên'}</span>
                </Button>

                {version ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!canUpdate || slotBusy}
                    data-testid={`asset-delete-btn-${slot.kind}`}
                    onClick={() => {
                      void handleDeleteClick(slot.kind);
                    }}
                    className="gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xoá</span>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
