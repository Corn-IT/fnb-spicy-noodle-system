import {
  ALLOWED_STORE_NAV_PATHS,
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  TakeawayLabelFormat,
  formatTakeawayLabel,
  normalizeQrCardSettings,
  sanitizeNavGroupLabels,
  sanitizeNavGroupOrder,
  sanitizeNavLabels,
  sanitizeNavOrder,
  sanitizePageHeaders,
  sanitizeStoreMessages,
  StoreAssetKind,
  StoreSettingsSchema,
  validateStoreMessagesMap,
  type ColorOverride,
  type PrintTemplateKey,
  type PrintTemplates,
  type PublicStoreSettingsResponse,
  type StoreMessagesMap,
  type StoreSettings,
  type UploadStoreAssetInput,
} from '@fnb/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  MessageSquareText,
  Palette,
  Printer,
  QrCode,
  RefreshCw,
  Save,
  Store,
} from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { SystemErrorView } from '@/components/error-display';
import { APP_NAVIGATION_ROUTES } from '@/components/layout/command-palette';
import { PageHeader } from '@/components/layout/page-header';
import { QrCardCustomizer } from '@/components/qr-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppMessages, useStoreMessagesQuery } from '@/hooks/use-app-messages';
import { buildStoreAssetUrl } from '@/hooks/use-store-settings';
import { ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { computeHslContrastRatio } from '@/utils/store-theme';

import {
  useAdminStoreSettingsQuery,
  useDeleteStoreAssetMutation,
  useUpdateStoreSettingsMutation,
  useUploadStoreAssetMutation,
} from '../api/store-settings.api';
import { DisplayScalePanel } from './display-scale-panel';
import { MessageCatalogEditor } from './message-catalog-editor';
import { NavCustomizationPanel } from './nav-customization-panel';
import { PrintTemplateCustomizer } from './print-template-customizer';
import { PrinterHardwareSettingsPanel } from './printer-hardware-settings-panel';
import { StoreAssetsPanel } from './store-assets-panel';
import { VoiceAnnouncerSettingsCard } from './voice-announcer-settings-card';
import {
  resolveDraftThemeVariables,
  ThemeColorOverrideSection,
  ThemeDualPreviewCard,
  type ColorOverridePreset,
} from './theme-color-override-section';

const BRAND_COLOR_PRESETS = [
  { hex: '#E11D48', name: 'Đỏ Hoa Hồng (Mặc định)' },
  { hex: '#EA580C', name: 'Cam Đậm' },
  { hex: '#D97706', name: 'Vàng Hổ Phách' },
  { hex: '#059669', name: 'Xanh Ngọc' },
  { hex: '#0284C7', name: 'Xanh Dương Nhạt' },
  { hex: '#2563EB', name: 'Xanh Cobalt' },
  { hex: '#7C3AED', name: 'Tím Royal' },
  { hex: '#334155', name: 'Xám Than Slate' },
] as const;

const PRIMARY_TEXT_PRESETS: readonly ColorOverridePreset[] = [
  { name: 'Trắng tinh', light: '#FFFFFF', dark: '#FFFFFF' },
  { name: 'Trắng ngà', light: '#F8FAFC', dark: '#F8FAFC' },
  { name: 'Đen Than', light: '#0F172A', dark: '#0F172A' },
  { name: 'Vàng Kem', light: '#FEF08A', dark: '#FEF08A' },
  { name: 'Trắng / Vàng Tối', light: '#FFFFFF', dark: '#FEF08A' },
];

const ACCENT_TEXT_PRESETS: readonly ColorOverridePreset[] = [
  { name: 'Xanh Cobalt', light: '#1D4ED8', dark: '#60A5FA' },
  { name: 'Xanh Ngọc Đậm', light: '#0F766E', dark: '#2DD4BF' },
  { name: 'Đỏ Hoa Hồng', light: '#BE123C', dark: '#FB7185' },
  { name: 'Hổ Phách Đậm', light: '#B45309', dark: '#FBBF24' },
  { name: 'Tím Đậm', light: '#6D28D9', dark: '#A78BFA' },
];

const PRICE_COLOR_PRESETS: readonly ColorOverridePreset[] = [
  { name: 'Ngọc Lam', light: '#0D9488', dark: '#2DD4BF' },
  { name: 'Đỏ Đậm', light: '#BE123C', dark: '#FB7185' },
  { name: 'Cam Cháy', light: '#C2410C', dark: '#FB923C' },
  { name: 'Xanh Cobalt', light: '#1D4ED8', dark: '#60A5FA' },
  { name: 'Than Trung Tính', light: '#0F172A', dark: '#F8FAFC' },
];

const ALLOWED_NAV_PATH_SET = new Set<string>(ALLOWED_STORE_NAV_PATHS);

function normalizeColorOverride(override: ColorOverride): ColorOverride {
  return {
    light: override.light === null ? null : override.light.trim().toUpperCase(),
    dark:
      override.dark === null || override.dark.trim().length === 0
        ? null
        : override.dark.trim().toUpperCase(),
  };
}

function clonePrintTemplates(source: PrintTemplates): PrintTemplates {
  return {
    provisional: {
      ...source.provisional,
      blocks: { ...source.provisional.blocks },
    },
    official: {
      ...source.official,
      blocks: { ...source.official.blocks },
    },
    kitchen: {
      ...source.kitchen,
      priceCategoryIds: [...(source.kitchen.priceCategoryIds ?? [])],
      blocks: { ...source.kitchen.blocks },
    },
    kitchenCancel: {
      ...source.kitchenCancel,
      blocks: { ...source.kitchenCancel.blocks },
    },
    tableTransfer: {
      ...source.tableTransfer,
      blocks: { ...source.tableTransfer.blocks },
    },
  };
}

function normalizePrintTemplates(source: PrintTemplates): PrintTemplates {
  return {
    provisional: {
      ...source.provisional,
      title: source.provisional.title.trim(),
      footerNote: source.provisional.footerNote.trim(),
      blocks: { ...source.provisional.blocks },
    },
    official: {
      ...source.official,
      title: source.official.title.trim(),
      footerNote: source.official.footerNote.trim(),
      blocks: { ...source.official.blocks },
    },
    kitchen: {
      ...source.kitchen,
      title: source.kitchen.title.trim(),
      footerNote: source.kitchen.footerNote.trim(),
      priceCategoryIds: Array.from(new Set(source.kitchen.priceCategoryIds ?? [])),
      blocks: { ...source.kitchen.blocks },
    },
    kitchenCancel: {
      ...source.kitchenCancel,
      title: source.kitchenCancel.title.trim(),
      footerNote: source.kitchenCancel.footerNote.trim(),
      blocks: { ...source.kitchenCancel.blocks },
    },
    tableTransfer: {
      ...source.tableTransfer,
      title: source.tableTransfer.title.trim(),
      footerNote: source.tableTransfer.footerNote.trim(),
      blocks: { ...source.tableTransfer.blocks },
    },
  };
}

function extractFormSettings(source: StoreSettings): StoreSettings {
  return {
    storeName: source.storeName,
    subtitle: source.subtitle,
    description: source.description,
    brandColor: source.brandColor,
    primaryTextColor: { ...source.primaryTextColor },
    accentTextColor: { ...source.accentTextColor },
    priceColor: { ...source.priceColor },
    defaultTheme: source.defaultTheme,
    qr: { ...source.qr },
    qrCard: { ...source.qrCard },
    receipt: { ...source.receipt },
    navLabels: { ...source.navLabels },
    navGroupLabels: { ...source.navGroupLabels },
    navGroupOrder: [...source.navGroupOrder],
    navOrder: [...source.navOrder],
    pageHeaders: Object.fromEntries(
      Object.entries(source.pageHeaders).map(([path, header]) => [path, { ...header }]),
    ),
    printTemplates: clonePrintTemplates(source.printTemplates),
    takeawayLabelFormat: source.takeawayLabelFormat ?? TakeawayLabelFormat.NUMBER,
    displayScale: {
      globalPercent: source.displayScale?.globalPercent ?? 100,
      perPath: { ...(source.displayScale?.perPath ?? {}) },
      qrOrderPercent: source.displayScale?.qrOrderPercent ?? 100,
    },
  };
}

function normalizeDraftBeforeSubmit(draft: StoreSettings): StoreSettings {
  return {
    ...draft,
    storeName: draft.storeName.trim(),
    subtitle: draft.subtitle.trim(),
    description: draft.description.trim(),
    brandColor: draft.brandColor.trim().toUpperCase(),
    primaryTextColor: normalizeColorOverride(draft.primaryTextColor),
    accentTextColor: normalizeColorOverride(draft.accentTextColor),
    priceColor: normalizeColorOverride(draft.priceColor),
    qr: {
      ...draft.qr,
      storeName: draft.qr.storeName.trim(),
      subtitle: draft.qr.subtitle.trim(),
      welcomeMessage: draft.qr.welcomeMessage.trim(),
    },
    qrCard: normalizeQrCardSettings(draft.qrCard),
    receipt: {
      ...draft.receipt,
      printName: draft.receipt.printName.trim(),
      address: draft.receipt.address.trim(),
      phone: draft.receipt.phone.trim(),
      footerNote: draft.receipt.footerNote.trim(),
    },
    navLabels: sanitizeNavLabels(draft.navLabels),
    navGroupLabels: sanitizeNavGroupLabels(draft.navGroupLabels),
    navGroupOrder: sanitizeNavGroupOrder(draft.navGroupOrder),
    navOrder: sanitizeNavOrder(draft.navOrder),
    pageHeaders: sanitizePageHeaders(draft.pageHeaders),
    printTemplates: normalizePrintTemplates(draft.printTemplates),
  };
}

function cloneStoreMessages(source: StoreMessagesMap | undefined | null): StoreMessagesMap {
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).map(([key, override]) => [key, { ...override }]),
  );
}

export function StoreSettingsPage() {
  const { notify, resolveErrorMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canUpdate = Boolean(user?.isSuperAdmin || user?.permissions?.settings?.update);

  const settingsQuery = useAdminStoreSettingsQuery();
  const messagesQuery = useStoreMessagesQuery();
  const updateMutation = useUpdateStoreSettingsMutation();
  const uploadAssetMutation = useUploadStoreAssetMutation();
  const deleteAssetMutation = useDeleteStoreAssetMutation();

  const [draft, setDraft] = React.useState<StoreSettings>(() =>
    extractFormSettings(DEFAULT_STORE_SETTINGS),
  );
  const [draftUpdatedAt, setDraftUpdatedAt] = React.useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = React.useState(false);
  const [draftMessages, setDraftMessages] = React.useState<StoreMessagesMap>(() =>
    cloneStoreMessages(messagesQuery.data?.messages),
  );
  const [isMessagesDirty, setIsMessagesDirty] = React.useState(false);
  const [selectedPrintTemplate, setSelectedPrintTemplate] =
    React.useState<PrintTemplateKey>('official');
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (settingsQuery.data && !hasInitialized) {
      setDraft(extractFormSettings(settingsQuery.data));
      setDraftUpdatedAt(settingsQuery.data.updatedAt);
      setHasInitialized(true);
    }
  }, [settingsQuery.data, hasInitialized]);

  React.useEffect(() => {
    if (!isMessagesDirty && messagesQuery.data && messagesQuery.dataUpdatedAt > 0) {
      setDraftMessages(cloneStoreMessages(messagesQuery.data.messages));
    }
  }, [isMessagesDirty, messagesQuery.data, messagesQuery.dataUpdatedAt]);

  const handleChangeMessages = React.useCallback(
    (updater: (prev: StoreMessagesMap) => StoreMessagesMap) => {
      setValidationError(null);
      setIsMessagesDirty(true);
      setDraftMessages((prev) => updater(prev));
    },
    [],
  );

  const messageValidationIssues = React.useMemo(
    () => validateStoreMessagesMap(draftMessages),
    [draftMessages],
  );

  const activeAssets = settingsQuery.data?.assets ?? {
    logo: null,
    favicon: null,
    qrLogo: null,
  };

  const livePreviewSettings: PublicStoreSettingsResponse = React.useMemo(
    () => ({
      ...draft,
      updatedAt: settingsQuery.data?.updatedAt ?? null,
      assets: activeAssets,
    }),
    [draft, settingsQuery.data?.updatedAt, activeAssets],
  );

  const resolvedThemeVars = React.useMemo(
    () =>
      resolveDraftThemeVariables({
        brandColor: draft.brandColor,
        primaryTextColor: draft.primaryTextColor,
        accentTextColor: draft.accentTextColor,
        priceColor: draft.priceColor,
      }),
    [draft.brandColor, draft.primaryTextColor, draft.accentTextColor, draft.priceColor],
  );

  const contrastAnalysis = React.useMemo(() => {
    const clean = draft.brandColor.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return null;
    try {
      const buttonContrast = computeHslContrastRatio(
        resolvedThemeVars.light.primary,
        resolvedThemeVars.light.primaryForeground,
      );
      const onWhiteContrast = computeHslContrastRatio(resolvedThemeVars.light.primary, '0 0% 100%');
      return {
        buttonContrast,
        onWhiteContrast,
        passesAa: buttonContrast >= 4.5,
      };
    } catch {
      return null;
    }
  }, [draft.brandColor, resolvedThemeVars]);

  const navEditableRoutes = React.useMemo(
    () => APP_NAVIGATION_ROUTES.filter((route) => ALLOWED_NAV_PATH_SET.has(route.path)),
    [],
  );

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canUpdate) return;

    setValidationError(null);
    setConflictMessage(null);

    if (messageValidationIssues.length > 0) {
      setValidationError(messageValidationIssues[0].message);
      return;
    }

    const normalized = normalizeDraftBeforeSubmit(draft);
    const parsed = StoreSettingsSchema.safeParse(normalized);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Dữ liệu cấu hình không hợp lệ');
      return;
    }

    const sanitizedMessages = sanitizeStoreMessages(draftMessages);

    try {
      const updated = await updateMutation.mutateAsync({
        ...parsed.data,
        messages: sanitizedMessages,
        expectedUpdatedAt: draftUpdatedAt,
      });
      setDraft(extractFormSettings(updated));
      setDraftUpdatedAt(updated.updatedAt);
      setDraftMessages(cloneStoreMessages(sanitizedMessages));
      setIsMessagesDirty(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.statusCode === 409 && err.code === ErrorCodes.STORE_SETTINGS_CONFLICT) {
        setConflictMessage(err.message || 'Cấu hình đã bị người khác thay đổi, tải lại?');
        return;
      }
      const resolvedErr = resolveErrorMessage(
        'settings.saveError',
        err,
        'Vui lòng kiểm tra lại dữ liệu nhập',
      );
      notify('settings.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng kiểm tra lại dữ liệu nhập' },
      });
    }
  };

  const handleReloadAfterConflict = async () => {
    setConflictMessage(null);
    setValidationError(null);
    const [refreshed, refreshedMessages] = await Promise.all([
      settingsQuery.refetch(),
      messagesQuery.refetch(),
    ]);
    if (refreshed.data) {
      setDraft(extractFormSettings(refreshed.data));
      setDraftUpdatedAt(refreshed.data.updatedAt);
    }
    if (refreshedMessages.data) {
      setDraftMessages(cloneStoreMessages(refreshedMessages.data.messages));
      setIsMessagesDirty(false);
    }
    if (refreshed.data) {
      notify('settings.refreshSuccess', { variant: 'info' });
    }
  };

  const handleUploadAsset = async (kind: StoreAssetKind, payload: UploadStoreAssetInput) => {
    await uploadAssetMutation.mutateAsync({ kind, payload });
  };

  const handleDeleteAsset = async (kind: StoreAssetKind) => {
    await deleteAssetMutation.mutateAsync(kind);
  };

  const isAssetBusy = uploadAssetMutation.isPending || deleteAssetMutation.isPending;

  if (!settingsQuery.data && settingsQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={settingsQuery.error}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="flex min-w-0 w-full flex-col gap-4 pb-4">
      <PageHeader
        path="/settings"
        actions={
          <>
            <AuditHistoryButton module="SETTINGS" />
            <Button
              type="submit"
              data-testid="store-settings-save-btn"
              disabled={
                !canUpdate ||
                updateMutation.isPending ||
                settingsQuery.isLoading ||
                messageValidationIssues.length > 0
              }
              className="gap-1.5 font-bold shadow-xs active:scale-[0.98]"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Save className="h-4 w-4 shrink-0" />
              )}
              <span>Lưu cấu hình</span>
            </Button>
          </>
        }
      />

      {!canUpdate ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          Bạn đang ở chế độ chỉ xem. Cần quyền cập nhật (<code>settings.update</code>) để chỉnh sửa.
        </div>
      ) : null}

      {conflictMessage ? (
        <div
          role="alert"
          data-testid="store-settings-conflict-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{conflictMessage}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="store-settings-conflict-reload-btn"
            onClick={() => void handleReloadAfterConflict()}
            disabled={settingsQuery.isFetching}
            className="gap-1.5 bg-background"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Tải lại cấu hình mới nhất</span>
          </Button>
        </div>
      ) : null}

      {validationError ? (
        <div
          role="alert"
          data-testid="store-settings-validation-error"
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs sm:text-sm font-medium text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      ) : null}

      {messageValidationIssues.length > 0 && !validationError ? (
        <div
          role="alert"
          data-testid="store-settings-messages-validation-banner"
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs sm:text-sm font-medium text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{messageValidationIssues[0].message}</span>
        </div>
      ) : null}

      <Tabs defaultValue="general" className="w-full min-w-0">
        <TabsList data-scroll-intended="true" className="flex h-auto w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto p-1 sm:flex-wrap">
          <TabsTrigger value="general" className="shrink-0 gap-1.5">
            <Store className="h-3.5 w-3.5 shrink-0" />
            <span>Thông tin quán</span>
          </TabsTrigger>
          <TabsTrigger value="assets" className="shrink-0 gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Logo & Favicon</span>
          </TabsTrigger>
          <TabsTrigger value="theme" className="shrink-0 gap-1.5">
            <Palette className="h-3.5 w-3.5 shrink-0" />
            <span>Giao diện</span>
          </TabsTrigger>
          <TabsTrigger value="qr" className="shrink-0 gap-1.5">
            <QrCode className="h-3.5 w-3.5 shrink-0" />
            <span>Trang khách QR</span>
          </TabsTrigger>
          <TabsTrigger value="receipt" className="shrink-0 gap-1.5">
            <Printer className="h-3.5 w-3.5 shrink-0" />
            <span>Phiếu in</span>
          </TabsTrigger>
          <TabsTrigger value="nav" className="shrink-0 gap-1.5">
            <LayoutList className="h-3.5 w-3.5 shrink-0" />
            <span>Menu & Tiêu đề trang</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="shrink-0 gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
            <span>Thông báo</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 min-w-0 w-full">
          <div className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="store-name-input" className="text-sm font-semibold">
                  Tên cửa hàng <span className="text-destructive">*</span>
                </label>
                <Input
                  id="store-name-input"
                  data-testid="input-store-name"
                  maxLength={60}
                  disabled={!canUpdate}
                  value={draft.storeName}
                  onChange={(e) => {
                    setValidationError(null);
                    setDraft((prev) => ({ ...prev, storeName: e.target.value }));
                  }}
                  placeholder="VD: Quán Mì Cay Seoul"
                />
                <p className="text-xs text-muted-foreground">
                  Hiển thị trên thanh bên, tiêu đề tab trình duyệt và màn hình đăng nhập (tối đa 60 ký tự).
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="store-subtitle-input" className="text-sm font-semibold">
                  Phụ đề (Sub-title)
                </label>
                <Input
                  id="store-subtitle-input"
                  data-testid="input-store-subtitle"
                  maxLength={80}
                  disabled={!canUpdate}
                  value={draft.subtitle}
                  onChange={(e) => setDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="VD: Chi nhánh Trung tâm"
                />
                <p className="text-xs text-muted-foreground">
                  Hiển thị bên dưới tên cửa hàng ở sidebar và màn hình đăng nhập (tối đa 80 ký tự).
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="store-description-input" className="text-sm font-semibold">
                Mô tả cửa hàng (trang Đăng nhập)
              </label>
              <textarea
                id="store-description-input"
                data-testid="input-store-description"
                rows={3}
                maxLength={300}
                disabled={!canUpdate}
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="VD: Hệ thống bán hàng và vận hành nội bộ..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div
              data-testid="settings-takeaway-format-section"
              className="space-y-2.5 border-t pt-4"
            >
              <div>
                <h3 className="text-sm font-semibold">Định dạng nhãn đơn Mang về</h3>
                <p className="text-xs text-muted-foreground">
                  Áp dụng cho sơ đồ POS, phiếu bếp, phiếu tạm tính và hoá đơn của các đơn Mang về tạo mới (reset mỗi ngày theo giờ Việt Nam). Đơn đã tạo trước đó vẫn giữ nguyên định dạng cũ.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="takeaway-format-number"
                  aria-pressed={draft.takeawayLabelFormat === TakeawayLabelFormat.NUMBER}
                  disabled={!canUpdate}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      takeawayLabelFormat: TakeawayLabelFormat.NUMBER,
                    }))
                  }
                  className={
                    draft.takeawayLabelFormat === TakeawayLabelFormat.NUMBER
                      ? 'flex flex-col items-start gap-1 rounded-xl border-2 border-primary bg-primary/5 p-3.5 text-left transition-all disabled:opacity-60'
                      : 'flex flex-col items-start gap-1 rounded-xl border bg-background p-3.5 text-left hover:bg-muted/40 transition-all disabled:opacity-60'
                  }
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-bold">Số thứ tự</span>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                      {formatTakeawayLabel(1, TakeawayLabelFormat.NUMBER)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mẫu nối tiếp: #01, #02, #03, ..., #10...
                  </p>
                </button>

                <button
                  type="button"
                  data-testid="takeaway-format-letter"
                  aria-pressed={draft.takeawayLabelFormat === TakeawayLabelFormat.LETTER}
                  disabled={!canUpdate}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      takeawayLabelFormat: TakeawayLabelFormat.LETTER,
                    }))
                  }
                  className={
                    draft.takeawayLabelFormat === TakeawayLabelFormat.LETTER
                      ? 'flex flex-col items-start gap-1 rounded-xl border-2 border-primary bg-primary/5 p-3.5 text-left transition-all disabled:opacity-60'
                      : 'flex flex-col items-start gap-1 rounded-xl border bg-background p-3.5 text-left hover:bg-muted/40 transition-all disabled:opacity-60'
                  }
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-bold">Chữ thứ tự</span>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                      {formatTakeawayLabel(1, TakeawayLabelFormat.LETTER)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    #A → #D, #AA → #DD, #E → #ED, #F → #FD ... #ZD (131+ dùng #131).
                  </p>
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assets" className="mt-4 min-w-0 w-full">
          <StoreAssetsPanel
            settings={livePreviewSettings}
            canUpdate={canUpdate}
            isBusy={isAssetBusy}
            onUpload={handleUploadAsset}
            onDelete={handleDeleteAsset}
          />
        </TabsContent>

        <TabsContent value="theme" className="mt-4 min-w-0 w-full">
          <div className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
            <div className="space-y-3">
              <label htmlFor="brand-color-hex-input" className="block text-sm font-semibold">
                Màu chủ đạo thương hiệu (Primary Brand Color)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  aria-label="Chọn màu thương hiệu"
                  disabled={!canUpdate}
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.brandColor) ? draft.brandColor : '#E11D48'}
                  onChange={(e) => {
                    setValidationError(null);
                    setDraft((prev) => ({ ...prev, brandColor: e.target.value.toUpperCase() }));
                  }}
                  className="h-10 w-14 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed"
                />
                <Input
                  id="brand-color-hex-input"
                  data-testid="input-brand-color-hex"
                  disabled={!canUpdate}
                  value={draft.brandColor}
                  onChange={(e) => {
                    setValidationError(null);
                    setDraft((prev) => ({ ...prev, brandColor: e.target.value }));
                  }}
                  placeholder="#E11D48"
                  className="w-36 font-mono uppercase"
                />
                {contrastAnalysis ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2.5 py-1 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Tương phản chữ trên nút: {contrastAnalysis.buttonContrast}:1
                    </span>
                    {contrastAnalysis.onWhiteContrast < 3 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        Lưu ý: Màu nhạt khi hiển thị chữ trên nền trắng ({contrastAnalysis.onWhiteContrast}:1)
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {BRAND_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    disabled={!canUpdate}
                    title={preset.name}
                    onClick={() => {
                      setValidationError(null);
                      setDraft((prev) => ({ ...prev, brandColor: preset.hex }));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-muted/60 disabled:opacity-50"
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/15"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <ThemeColorOverrideSection
              idPrefix="primary-text"
              title="Màu chữ & icon trên nền chủ đạo (Nút chính, menu đang chọn)"
              description="Áp dụng cho văn bản và biểu tượng hiển thị trên nút hành động (Lưu cấu hình, Gửi Bếp) và mục menu đang chọn (Cài đặt Cửa hàng) ở chế độ Sáng / Tối."
              value={draft.primaryTextColor}
              brandColor={draft.brandColor}
              resolvedVars={resolvedThemeVars}
              presets={PRIMARY_TEXT_PRESETS}
              disabled={!canUpdate}
              onChange={(next) => {
                setValidationError(null);
                setDraft((prev) => ({ ...prev, primaryTextColor: next }));
              }}
            />

            <ThemeColorOverrideSection
              idPrefix="accent-text"
              title="Màu chữ nhấn (Labels, liên kết & badge)"
              description="Áp dụng cho nhãn nổi bật, liên kết, icon nhấn và mục đang chọn ở chế độ Sáng / Tối."
              value={draft.accentTextColor}
              brandColor={draft.brandColor}
              resolvedVars={resolvedThemeVars}
              presets={ACCENT_TEXT_PRESETS}
              disabled={!canUpdate}
              onChange={(next) => {
                setValidationError(null);
                setDraft((prev) => ({ ...prev, accentTextColor: next }));
              }}
            />

            <ThemeColorOverrideSection
              idPrefix="price"
              title="Màu đơn giá & Thành tiền (POS, Thực đơn, QR)"
              description="Chỉ áp dụng cho đơn giá sản phẩm và tổng thanh toán; không đổi màu chỉ số Thu/Chi xanh-đỏ."
              value={draft.priceColor}
              brandColor={draft.brandColor}
              resolvedVars={resolvedThemeVars}
              presets={PRICE_COLOR_PRESETS}
              disabled={!canUpdate}
              onChange={(next) => {
                setValidationError(null);
                setDraft((prev) => ({ ...prev, priceColor: next }));
              }}
            />

            <ThemeDualPreviewCard resolvedVars={resolvedThemeVars} />

            <div className="space-y-2 border-t pt-4">
              <span className="block text-sm font-semibold">
                Giao diện chung cho nhân viên và trang đăng nhập
              </span>
              <p className="text-xs text-muted-foreground">
                Mọi tài khoản dùng giao diện này trên tất cả thiết bị.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(['light', 'dark'] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    disabled={!canUpdate}
                    variant={draft.defaultTheme === mode ? 'default' : 'outline'}
                    data-testid={`default-theme-btn-${mode}`}
                    onClick={() => setDraft((prev) => ({ ...prev, defaultTheme: mode }))}
                  >
                    {mode === 'light' ? 'Giao diện Sáng (Light)' : 'Giao diện Tối (Dark)'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="qr" className="mt-4 min-w-0 w-full space-y-4">
          <div className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
              Các trường dưới đây cho phép tuỳ chỉnh riêng cho giao diện khách quét QR tại bàn. Nếu để trống tên quán hoặc phụ đề QR, hệ thống tự dùng Tên cửa hàng và Phụ đề chính.
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="qr-store-name-input" className="text-sm font-semibold">
                  Tên quán hiển thị trên trang QR
                </label>
                <Input
                  id="qr-store-name-input"
                  data-testid="input-qr-store-name"
                  maxLength={60}
                  disabled={!canUpdate}
                  value={draft.qr.storeName}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      qr: { ...prev.qr, storeName: e.target.value },
                    }))
                  }
                  placeholder={`Mặc định dùng: ${draft.storeName || 'Tên quán chính'}`}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="qr-subtitle-input" className="text-sm font-semibold">
                  Sub-title trang QR
                </label>
                <Input
                  id="qr-subtitle-input"
                  data-testid="input-qr-subtitle"
                  maxLength={80}
                  disabled={!canUpdate}
                  value={draft.qr.subtitle}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      qr: { ...prev.qr, subtitle: e.target.value },
                    }))
                  }
                  placeholder={`Mặc định dùng: ${draft.subtitle || 'Phụ đề chính'}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qr-welcome-input" className="text-sm font-semibold">
                Lời chào / Thông báo ngắn cho khách (tối đa 160 ký tự)
              </label>
              <Input
                id="qr-welcome-input"
                data-testid="input-qr-welcome-message"
                maxLength={160}
                disabled={!canUpdate}
                value={draft.qr.welcomeMessage}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    qr: { ...prev.qr, welcomeMessage: e.target.value },
                  }))
                }
                placeholder="VD: Chúc quý khách ngon miệng! Vui lòng chọn cấp độ cay phù hợp."
              />
            </div>

            <div className="space-y-2 border-t pt-4">
              <span className="block text-sm font-semibold">Giao diện Sáng/Tối trang khách QR</span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: 'system', label: 'Theo thiết bị khách (System)' },
                    { value: 'light', label: 'Luôn Sáng (Light)' },
                    { value: 'dark', label: 'Luôn Tối (Dark)' },
                  ] as const
                ).map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    disabled={!canUpdate}
                    variant={draft.qr.theme === option.value ? 'default' : 'outline'}
                    data-testid={`qr-theme-btn-${option.value}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        qr: { ...prev.qr, theme: option.value },
                      }))
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Mẫu Thẻ Ảnh & Phiếu In Mã QR Dán Bàn (Khổ 80mm / PNG)
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Tuỳ chỉnh tiêu đề, dòng hướng dẫn, màu viền nhấn và hiển thị Logo/Link cho ảnh QR tải về (.png/.zip) cũng như phiếu in nhiệt QR 80mm.
              </p>
            </div>
            <QrCardCustomizer
              value={draft.qrCard}
              onChange={(nextQrCard) =>
                setDraft((prev) => ({
                  ...prev,
                  qrCard: nextQrCard,
                }))
              }
              storeName={draft.storeName}
              qrStoreName={draft.qr.storeName}
              brandColor={draft.brandColor}
              logoUrl={
                buildStoreAssetUrl(StoreAssetKind.QR_LOGO, activeAssets.qrLogo) ??
                buildStoreAssetUrl(StoreAssetKind.LOGO, activeAssets.logo)
              }
              disabled={!canUpdate}
            />
          </div>

          <MessageCatalogEditor
            fixedModule="QR_CUSTOMER"
            draftMessages={draftMessages}
            onChangeMessages={handleChangeMessages}
            disabled={!canUpdate}
            title="Thông báo & Pop-up hiển thị cho khách (Màn hình QR)"
            description="Tuỳ chỉnh tất cả banner cảnh báo (gồm cảnh báo đổi bàn), trạng thái bếp nhận món, màn hình chặn Wi-Fi/GPS và thông báo gửi đơn trên màn hình khách quét QR. Mọi thay đổi ở đây được đồng bộ hai chiều với tab Thông báo."
          />
        </TabsContent>

        <TabsContent value="receipt" className="mt-4 min-w-0 w-full">
          <PrinterHardwareSettingsPanel
            storeSettings={livePreviewSettings}
            canKickCashDrawer={Boolean(
              user?.isSuperAdmin ||
                user?.permissions?.pos?.openCashDrawer ||
                user?.permissions?.settings?.update,
            )}
          />
          <PrintTemplateCustomizer
            draft={draft}
            livePreviewSettings={livePreviewSettings}
            selectedTemplate={selectedPrintTemplate}
            canUpdate={canUpdate}
            onSelectTemplate={setSelectedPrintTemplate}
            onChangeReceipt={(updater) =>
              setDraft((prev) => ({ ...prev, receipt: updater(prev.receipt) }))
            }
            onChangePrintTemplates={(updater) =>
              setDraft((prev) => ({
                ...prev,
                printTemplates: updater(prev.printTemplates),
              }))
            }
          />
        </TabsContent>

        <TabsContent value="nav" className="mt-4 min-w-0 w-full space-y-4">
          <DisplayScalePanel
            displayScale={draft.displayScale}
            navLabels={draft.navLabels}
            canUpdate={canUpdate}
            onChange={(updater) =>
              setDraft((prev) => ({
                ...prev,
                displayScale: updater(prev.displayScale),
              }))
            }
          />
          <NavCustomizationPanel
            draft={draft}
            setDraft={setDraft}
            canUpdate={canUpdate}
            editableRoutes={navEditableRoutes}
          />
        </TabsContent>

        <TabsContent value="messages" className="mt-4 min-w-0 w-full">
          <VoiceAnnouncerSettingsCard
            draftMessages={draftMessages}
            onChangeMessages={handleChangeMessages}
            disabled={!canUpdate}
          />
          <MessageCatalogEditor
            draftMessages={draftMessages}
            onChangeMessages={handleChangeMessages}
            disabled={!canUpdate}
          />
        </TabsContent>
      </Tabs>
    </form>
  );
}
