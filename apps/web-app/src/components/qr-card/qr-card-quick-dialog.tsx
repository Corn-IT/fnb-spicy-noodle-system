import { useQueryClient } from '@tanstack/react-query';
import {
  ErrorCodes,
  mergeStoreSettingsWithDefaults,
  normalizeQrCardSettings,
  PublicStoreSettingsResponseSchema,
  StoreAssetKind,
  StoreSettingsSchema,
  type PublicStoreSettingsResponse,
  type QrCardSettings,
} from '@fnb/shared';
import { AlertTriangle, Loader2, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppMessages } from '@/hooks/use-app-messages';
import {
  buildStoreAssetUrl,
  STORE_SETTINGS_QUERY_KEY,
  useStoreSettings,
  writeCachedStoreSettings,
} from '@/hooks/use-store-settings';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { QrCardCustomizer } from './qr-card-customizer';

export interface QrCardQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QrCardQuickDialog({ open, onOpenChange }: QrCardQuickDialogProps) {
  const queryClient = useQueryClient();
  const { settings } = useStoreSettings();
  const { notify, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canUpdate = Boolean(user?.isSuperAdmin || user?.permissions?.settings?.update);

  const [freshServerSettings, setFreshServerSettings] =
    React.useState<PublicStoreSettingsResponse | null>(null);
  const [draftQrCard, setDraftQrCard] = React.useState<QrCardSettings>(() => ({
    ...settings.qrCard,
  }));
  const [draftQrStoreName, setDraftQrStoreName] = React.useState<string>(() => settings.qr.storeName);
  const [isLoadingFresh, setIsLoadingFresh] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = React.useState<string | null>(null);
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;

  const loadLatestSettings = React.useCallback(async () => {
    setValidationError(null);
    setConflictMessage(null);
    const fallbackSettings = settingsRef.current;
    if (!canUpdate) {
      setFreshServerSettings(fallbackSettings);
      setDraftQrCard({ ...fallbackSettings.qrCard });
      setDraftQrStoreName(fallbackSettings.qr.storeName);
      return;
    }

    setIsLoadingFresh(true);
    try {
      const raw = await apiClient.get<unknown>('/api/v1/settings');
      const parsed = PublicStoreSettingsResponseSchema.parse(mergeStoreSettingsWithDefaults(raw));
      setFreshServerSettings(parsed);
      setDraftQrCard({ ...parsed.qrCard });
      setDraftQrStoreName(parsed.qr.storeName);
    } catch {
      setFreshServerSettings(fallbackSettings);
      setDraftQrCard({ ...fallbackSettings.qrCard });
      setDraftQrStoreName(fallbackSettings.qr.storeName);
    } finally {
      setIsLoadingFresh(false);
    }
  }, [canUpdate]);

  React.useEffect(() => {
    if (!open) return;
    void loadLatestSettings();
  }, [open, loadLatestSettings]);

  const activeBase = freshServerSettings ?? settings;
  const effectiveLogoUrl =
    buildStoreAssetUrl(StoreAssetKind.QR_LOGO, activeBase.assets.qrLogo) ??
    buildStoreAssetUrl(StoreAssetKind.LOGO, activeBase.assets.logo);

  const handleSave = async () => {
    if (!canUpdate || isSaving) return;
    setValidationError(null);
    setConflictMessage(null);

    const normalizedCard = normalizeQrCardSettings(draftQrCard);
    const expectedUpdatedAt = activeBase.updatedAt;
    const candidatePayload = {
      storeName: activeBase.storeName,
      subtitle: activeBase.subtitle,
      description: activeBase.description,
      brandColor: activeBase.brandColor,
      primaryTextColor: activeBase.primaryTextColor,
      accentTextColor: activeBase.accentTextColor,
      priceColor: activeBase.priceColor,
      defaultTheme: activeBase.defaultTheme,
      qr: {
        ...activeBase.qr,
        storeName: draftQrStoreName.trim(),
      },
      qrCard: normalizedCard,
      receipt: activeBase.receipt,
      navLabels: activeBase.navLabels,
      navGroupLabels: activeBase.navGroupLabels,
      navGroupOrder: activeBase.navGroupOrder,
      navOrder: activeBase.navOrder,
      pageHeaders: activeBase.pageHeaders,
      printTemplates: activeBase.printTemplates,
    };

    const parsedSettings = StoreSettingsSchema.safeParse(candidatePayload);
    if (!parsedSettings.success) {
      setValidationError(
        parsedSettings.error.issues[0]?.message ?? 'Thông tin mẫu thẻ QR chưa hợp lệ',
      );
      return;
    }

    setIsSaving(true);
    try {
      const rawUpdated = await apiClient.put<PublicStoreSettingsResponse>('/api/v1/settings', {
        ...parsedSettings.data,
        expectedUpdatedAt,
      });
      const parsedUpdated = PublicStoreSettingsResponseSchema.parse(
        mergeStoreSettingsWithDefaults(rawUpdated),
      );
      queryClient.setQueryData(STORE_SETTINGS_QUERY_KEY, parsedUpdated);
      queryClient.setQueryData(['admin-store-settings'], parsedUpdated);
      writeCachedStoreSettings(parsedUpdated);
      void queryClient.invalidateQueries({ queryKey: STORE_SETTINGS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'SETTINGS'] });
      notify('settings.saveSuccess', { variant: 'success' });
      onOpenChange(false);
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.statusCode === 409 &&
        err.code === ErrorCodes.STORE_SETTINGS_CONFLICT
      ) {
        setConflictMessage(err.message || 'Cấu hình đã bị người khác thay đổi, vui lòng tải lại.');
        return;
      }
      const resolvedErr = resolveErrorMessage(
        'settings.saveError',
        err,
        'Không thể lưu mẫu thẻ QR',
      );
      setValidationError(resolvedErr.description ?? resolvedErr.title);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="qr-card-quick-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-accent-text" />
            <span>Tuỳ chỉnh Mẫu Thẻ Ảnh & Phiếu In Mã QR</span>
          </DialogTitle>
          <DialogDescription>
            Thay đổi được đồng bộ trên toàn bộ máy POS (khi tải ảnh PNG, nén file .zip và in phiếu
            nhiệt 80mm). Đường dẫn /q/&lt;token&gt; luôn tự động khoá theo bàn.
          </DialogDescription>
        </DialogHeader>

        {!canUpdate ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            Bạn chỉ có quyền xem mẫu thẻ QR của quán. Vui lòng liên hệ Quản trị viên (quyền{' '}
            <code>settings:update</code>) nếu cần lưu thay đổi.
          </div>
        ) : null}

        {conflictMessage ? (
          <div
            data-testid="qr-card-quick-conflict-banner"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{conflictMessage}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadLatestSettings()}
              className="h-7 gap-1 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Tải lại mới nhất</span>
            </Button>
          </div>
        ) : null}

        {validationError ? (
          <div
            data-testid="qr-card-quick-error-banner"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
          >
            {validationError}
          </div>
        ) : null}

        {isLoadingFresh ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Đang đồng bộ cấu hình cửa hàng mới nhất...</span>
          </div>
        ) : (
          <QrCardCustomizer
            compact
            value={draftQrCard}
            onChange={(next) => {
              setValidationError(null);
              setDraftQrCard(next);
            }}
            storeName={activeBase.storeName}
            qrStoreName={draftQrStoreName}
            onChangeQrStoreName={
              canUpdate
                ? (nextName) => {
                    setValidationError(null);
                    setDraftQrStoreName(nextName);
                  }
                : undefined
            }
            brandColor={activeBase.brandColor}
            logoUrl={effectiveLogoUrl}
            disabled={!canUpdate || isSaving}
          />
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {canUpdate ? (
            <Button
              type="button"
              data-testid="qr-card-quick-save-btn"
              disabled={isLoadingFresh || isSaving}
              onClick={() => void handleSave()}
              className="gap-1.5 font-bold"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{isSaving ? 'Đang lưu...' : 'Lưu mẫu thẻ QR'}</span>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
