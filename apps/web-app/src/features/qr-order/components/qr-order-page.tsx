import {
  StoreAssetKind,
  type OrderItemModifierSelection,
  type Product,
  type PublicMenuActiveOrder,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';

import { PageSkeleton } from '@/components/loading';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ClipboardList,
  Copy,
  MapPin,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sun,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useParams } from 'react-router-dom';

import { SystemErrorView } from '@/components/error-display';
import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAppMessages } from '@/hooks/use-app-messages';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';
import { ApiClientError } from '@/lib/api-client';
import { useMenuSyncListener } from '@/lib/menu-sync';
import { useCommitSearch } from '@/lib/use-commit-search';
import { resolveEffectiveTheme } from '@/providers/theme-provider';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';
import { syncDocumentThemeMode } from '@/utils/store-theme';
import {
  qrOrderQueryKeys,
  usePublicMenuQuery,
  useSubmitQrOrderMutation,
  type GuestQrCoordinates,
} from '../api/qr-order.api';
import { useQrSessionSocket } from '../hooks/use-qr-session-socket';
import {
  ModifierSelectorSheet,
  type ModifierSelectorConfirmPayload,
} from './modifier-selector-sheet';

interface CartLineItem {
  key: string;
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderItemModifierSelection[];
  modifierLabels: string[];
  itemNote?: string;
}

const DEFAULT_STATION_LABELS: Record<string, string> = {
  BEP_NAU: 'Bếp nấu',
  BEP_CHIEN: 'Bếp chiên',
  PHA_CHE: 'Pha chế',
  COMBO: 'Combo',
};

const KITCHEN_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  NEW: {
    label: 'Chờ bếp nhận',
    className: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  PRINTED: {
    label: 'Bếp đã nhận',
    className: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  PREPARING: {
    label: 'Đang chế biến',
    className: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  },
  DONE: {
    label: 'Hoàn tất',
    className: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  CANCELLED: {
    label: 'Đã huỷ',
    className: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
};

export function QrOrderPage() {
  useMenuSyncListener();

  const { token = '' } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [guestCoords, setGuestCoords] = React.useState<GuestQrCoordinates | null>(null);
  const [isLocatingGuestGps, setIsLocatingGuestGps] = React.useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = React.useState<string | null>(null);
  const autoTriedGpsRef = React.useRef(false);

  const { data: menuData, isPending, isError, error, refetch } = usePublicMenuQuery(
    token,
    guestCoords,
  );
  const submitMutation = useSubmitQrOrderMutation();
  const { settings } = useStoreSettings();
  const { resolveMessage, resolveErrorMessage, notify } = useAppMessages();
  const qrLogoUrl =
    buildStoreAssetUrl(StoreAssetKind.QR_LOGO, settings.assets.qrLogo) ??
    buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);
  const qrStoreName = settings.qr.storeName || settings.storeName;
  const qrSubtitle = settings.qr.subtitle || settings.subtitle;

  const [qrThemeOverride, setQrThemeOverride] = React.useState<'light' | 'dark' | null>(null);
  const resolvedQrSettingTheme = React.useMemo<'light' | 'dark'>(() => {
    if (settings.qr.theme === 'dark' || settings.qr.theme === 'light') {
      return settings.qr.theme;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }, [settings.qr.theme]);

  const effectiveQrTheme = qrThemeOverride ?? resolvedQrSettingTheme;
  const toggleQrTheme = () => {
    setQrThemeOverride(effectiveQrTheme === 'dark' ? 'light' : 'dark');
  };

  React.useEffect(() => {
    syncDocumentThemeMode(
      effectiveQrTheme,
      settings.brandColor,
      settings.accentTextColor,
      settings.priceColor,
      settings.primaryTextColor,
    );
    document.title = qrStoreName;
    return () => {
      const prefs = useUiPreferencesStore.getState();
      const restored = resolveEffectiveTheme(
        prefs.theme,
        prefs.hasExplicitTheme,
        settings.defaultTheme,
      );
      syncDocumentThemeMode(
        restored,
        settings.brandColor,
        settings.accentTextColor,
        settings.priceColor,
        settings.primaryTextColor,
      );
    };
  }, [
    effectiveQrTheme,
    qrStoreName,
    settings.brandColor,
    settings.accentTextColor,
    settings.priceColor,
    settings.primaryTextColor,
    settings.defaultTheme,
  ]);

  const {
    activeOrderId,
    currentTableLabel,
    orderStatus,
    statusMessage,
    redirectNotice,
    registerSubmittedOrder,
  } = useQrSessionSocket(token, menuData?.table.tableName, menuData?.table);

  const [cart, setCart] = React.useState<CartLineItem[]>([]);
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false);
  const [placedOrdersSheetOpen, setPlacedOrdersSheetOpen] = React.useState(false);
  const [selectingProduct, setSelectingProduct] = React.useState<Product | null>(null);
  const [stationFilter, setStationFilter] = React.useState<'ALL' | Product['station']>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const menuSearch = useCommitSearch(searchQuery, setSearchQuery);

  const resolvedTableName = currentTableLabel || menuData?.table.tableName || 'Bàn QR';
  const resolvedActiveOrderId = activeOrderId ?? menuData?.table.activeOrderId ?? undefined;

  const activeOrder: PublicMenuActiveOrder | null = React.useMemo(() => {
    const order = menuData?.activeOrder ?? null;
    if (!order || order.items.length === 0) return null;
    if (orderStatus === 'PAID' || orderStatus === 'VOIDED') return null;
    return order;
  }, [menuData?.activeOrder, orderStatus]);

  const placedTotalQty = React.useMemo(
    () => (activeOrder ? activeOrder.items.reduce((sum, item) => sum + item.quantity, 0) : 0),
    [activeOrder],
  );

  const placedBatches = React.useMemo(() => {
    if (!activeOrder) return [];
    const byBatch = new Map<number, PublicMenuActiveOrder['items']>();
    for (const item of activeOrder.items) {
      const list = byBatch.get(item.batchNo) ?? [];
      list.push(item);
      byBatch.set(item.batchNo, list);
    }
    return Array.from(byBatch.entries())
      .sort(([a], [b]) => a - b)
      .map(([batchNo, items]) => ({ batchNo, items }));
  }, [activeOrder]);

  const stationTabs = React.useMemo(() => {
    if (!menuData) return [{ value: 'ALL' as const, label: 'Tất cả' }];
    if (menuData.stations && menuData.stations.length > 0) {
      return [
        { value: 'ALL' as const, label: 'Tất cả' },
        ...menuData.stations
          .filter((st) => st.code !== 'COMBO' || menuData.products.some((p) => p.station === 'COMBO'))
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((st) => ({
            value: st.code,
            label: st.name || DEFAULT_STATION_LABELS[st.code] || st.code,
          })),
      ];
    }
    const stationSet = new Set<string>(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE', 'COMBO']);
    for (const p of menuData.products) {
      stationSet.add(p.station);
    }
    return [
      { value: 'ALL' as const, label: 'Tất cả' },
      ...Array.from(stationSet).map((code) => ({
        value: code,
        label: DEFAULT_STATION_LABELS[code] ?? code,
      })),
    ];
  }, [menuData]);

  const visibleStationCodes = React.useMemo(() => {
    if (!menuData?.stations || menuData.stations.length === 0) return null;
    return new Set(menuData.stations.map((s) => s.code));
  }, [menuData?.stations]);

  const visibleCategories = React.useMemo(() => {
    if (!menuData) return [];
    if (menuData.categories && menuData.categories.length > 0) {
      return menuData.categories
        .filter((cat) => stationFilter === 'ALL' || cat.stationCode === stationFilter)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({ id: cat.id, name: cat.name }));
    }
    const base =
      stationFilter === 'ALL'
        ? menuData.products
        : menuData.products.filter((p) => p.station === stationFilter);
    const catMap = new Map<number, string>();
    for (const p of base) {
      if (p.categoryId && p.categoryName) {
        catMap.set(p.categoryId, p.categoryName);
      }
    }
    return Array.from(catMap.entries()).map(([id, name]) => ({ id, name }));
  }, [menuData, stationFilter]);

  const visibleCategoryIds = React.useMemo(() => {
    if (!menuData?.categories || menuData.categories.length === 0) return null;
    return new Set(menuData.categories.map((c) => c.id));
  }, [menuData?.categories]);

  const filteredProducts = React.useMemo(() => {
    if (!menuData) return [];
    return menuData.products.filter((p) => {
      if (visibleStationCodes && !visibleStationCodes.has(p.station)) return false;
      if (p.categoryId !== null && p.categoryId !== undefined && visibleCategoryIds && !visibleCategoryIds.has(p.categoryId)) {
        return false;
      }
      if (stationFilter !== 'ALL' && p.station !== stationFilter) return false;
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      if (!matchesVietnameseQuery(searchQuery, p.name, p.subtitle, p.categoryName)) return false;
      return true;
    });
  }, [menuData, visibleStationCodes, visibleCategoryIds, stationFilter, categoryFilter, searchQuery]);

  const handleUpdateCartQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleProductClick = (product: Product) => {
    if (product.modifierGroups.length > 0) {
      setSelectingProduct(product);
      return;
    }

    setCart((prev) => {
      const key = `${product.id}-plain`;
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
          modifiers: [],
          modifierLabels: [],
        },
      ];
    });
  };

  const handleConfirmModifier = (payload: ModifierSelectorConfirmPayload) => {
    const modKey = payload.modifiers
      .map((m) => `${m.groupId}:${m.modifierId}:${m.action ?? 'SELECTED'}:${m.substituteName ?? ''}`)
      .sort()
      .join('|');
    const key = `${payload.product.id}-${modKey}-${payload.itemNote ?? ''}`;

    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + payload.quantity } : item,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: payload.product.id,
          name: payload.product.name,
          quantity: payload.quantity,
          unitPrice: payload.unitPriceWithModifiers,
          modifiers: payload.modifiers,
          modifierLabels: payload.modifierLabels,
          itemNote: payload.itemNote,
        },
      ];
    });
  };

  const handleRemoveCartItem = (key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleRequestGuestGps = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsErrorMsg(resolveMessage('qr.lock.gpsUnsupportedError').title);
      return;
    }
    setIsLocatingGuestGps(true);
    setGpsErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGuestGps(false);
        setGuestCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      (err) => {
        setIsLocatingGuestGps(false);
        setGpsErrorMsg(
          resolveMessage(err.code === 1 ? 'qr.lock.gpsDeniedError' : 'qr.lock.gpsUnavailableError')
            .title,
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [resolveMessage]);

  const qrSecurityBlock = React.useMemo(() => {
    if (!isError || !error) return null;
    const apiErr = error instanceof ApiClientError ? error : null;
    const code = apiErr?.code;
    if (
      code !== 'QR_WIFI_REQUIRED' &&
      code !== 'QR_GEO_REQUIRED' &&
      code !== 'QR_GEO_OUT_OF_RANGE'
    ) {
      return null;
    }
    const details =
      apiErr?.details && typeof apiErr.details === 'object'
        ? (apiErr.details as {
            wifiSsid?: string | null;
            wifiPassword?: string | null;
            geoRadiusMeters?: number;
            distanceMeters?: number;
          })
        : {};
    const errorResolved = resolveMessage(`error.${code}`, {
      wifiSsid: details.wifiSsid ?? '',
      distanceMeters: details.distanceMeters ?? 0,
      geoRadiusMeters: details.geoRadiusMeters ?? 200,
    });
    const lockKey =
      code === 'QR_WIFI_REQUIRED'
        ? 'qr.lock.wifiTitle'
        : code === 'QR_GEO_OUT_OF_RANGE'
          ? 'qr.lock.geoOutOfRangeTitle'
          : 'qr.lock.geoRequiredTitle';
    const lockResolved = resolveMessage(lockKey);
    const resolvedBody = errorResolved.isOverridden
      ? errorResolved.title
      : lockResolved.isOverridden && lockResolved.description
        ? lockResolved.description
        : apiErr?.message ?? lockResolved.description ?? errorResolved.title;

    return {
      code,
      title: lockResolved.title,
      message: resolvedBody,
      wifiSsid: details.wifiSsid ?? null,
      wifiPassword: details.wifiPassword ?? null,
      geoRadiusMeters: details.geoRadiusMeters ?? 200,
      distanceMeters: details.distanceMeters ?? null,
    };
  }, [isError, error, resolveMessage]);

  React.useEffect(() => {
    if (qrSecurityBlock?.code === 'QR_GEO_REQUIRED' && !autoTriedGpsRef.current) {
      autoTriedGpsRef.current = true;
      handleRequestGuestGps();
    }
  }, [qrSecurityBlock?.code, handleRequestGuestGps]);

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || submitMutation.isPending) return;

    try {
      const response = await submitMutation.mutateAsync({
        qrToken: token,
        ...(resolvedActiveOrderId ? { activeOrderId: resolvedActiveOrderId } : {}),
        ...(guestCoords ? { latitude: guestCoords.lat, longitude: guestCoords.lng } : {}),
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          modifiers: item.modifiers,
          ...(item.itemNote ? { itemNote: item.itemNote } : {}),
        })),
      });

      registerSubmittedOrder({
        activeOrderId: response.activeOrderId,
        currentTableLabel: response.currentTableLabel,
        status: response.status,
      });
      setCart([]);
      void queryClient.invalidateQueries({ queryKey: qrOrderQueryKeys.publicMenu(token, guestCoords) });
      notify('qr.order.submitSuccess', {
        variant: 'success',
        vars: { batchNo: response.batchNo, tableLabel: response.currentTableLabel },
      });
    } catch (err) {
      const resolvedErr = resolveErrorMessage('qr.order.submitError', err);
      notify('qr.order.submitError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? (err instanceof Error ? err.message : 'Vui lòng thử lại') },
      });
    }
  };

  if (isPending) {
    return (
      <PageSkeleton
        variant="qr"
        label={resolveMessage('qr.loading.menu').title}
      />
    );
  }

  if (qrSecurityBlock) {
    const isWifiBlock = qrSecurityBlock.code === 'QR_WIFI_REQUIRED';

    return (
      <div
        data-testid={isWifiBlock ? 'qr-wifi-lock-screen' : 'qr-geo-lock-screen'}
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-background p-6 text-center text-foreground"
      >
        <div className="w-full rounded-2xl border bg-card p-6 shadow-md space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
            {isWifiBlock ? <Wifi className="h-7 w-7" /> : <MapPin className="h-7 w-7" />}
          </div>

          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-foreground">{qrSecurityBlock.title}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {qrSecurityBlock.message}
            </p>
          </div>

          {(qrSecurityBlock.wifiSsid || qrSecurityBlock.wifiPassword) && (
            <div className="rounded-xl border bg-muted/50 p-3.5 text-left space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Thông tin Wi-Fi tại quán
              </div>
              {qrSecurityBlock.wifiSsid ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Tên Wi-Fi:</span>
                  <span
                    data-testid="qr-lock-wifi-ssid"
                    className="font-bold text-foreground"
                  >
                    {qrSecurityBlock.wifiSsid}
                  </span>
                </div>
              ) : null}
              {qrSecurityBlock.wifiPassword ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Mật khẩu:</span>
                  <div className="flex items-center gap-1.5">
                    <code
                      data-testid="qr-lock-wifi-password"
                      className="rounded bg-background px-2 py-0.5 font-mono font-bold text-foreground border"
                    >
                      {qrSecurityBlock.wifiPassword}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="qr-copy-wifi-password-btn"
                      onClick={() => {
                        if (navigator.clipboard && qrSecurityBlock.wifiPassword) {
                          void navigator.clipboard.writeText(qrSecurityBlock.wifiPassword);
                          notify('qr.lock.wifiPasswordCopiedToast', { variant: 'success' });
                        }
                      }}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Chép
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {gpsErrorMsg ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {gpsErrorMsg}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            {!isWifiBlock ? (
              <Button
                type="button"
                data-testid="qr-verify-gps-btn"
                disabled={isLocatingGuestGps}
                onClick={handleRequestGuestGps}
                className="w-full h-11 font-bold gap-2 bg-sky-600 hover:bg-sky-700 text-white"
              >
                <MapPin className="h-4 w-4" />
                {isLocatingGuestGps
                  ? 'Đang kiểm tra vị trí...'
                  : 'Xác nhận vị trí tại quán để mở thực đơn'}
              </Button>
            ) : null}

            <Button
              type="button"
              variant={isWifiBlock ? 'default' : 'outline'}
              data-testid="qr-retry-wifi-btn"
              onClick={() => void refetch()}
              className="w-full h-11 font-bold gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {isWifiBlock ? 'Đã kết nối Wi-Fi — Thử lại ngay' : 'Tải lại thực đơn'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !menuData) {
    const apiErr = error instanceof ApiClientError ? error : null;
    const isInvalidQrStatus = !apiErr || apiErr.statusCode === 404 || apiErr.statusCode === 400;
    const invalidQrCopy = resolveMessage('qr.lock.invalidQr');

    return (
      <SystemErrorView
        variant="guest"
        error={error}
        statusKeyOverride={isInvalidQrStatus ? '404' : undefined}
        titleOverride={isInvalidQrStatus ? invalidQrCopy.title : undefined}
        descriptionOverride={
          isInvalidQrStatus ? (invalidQrCopy.description || undefined) : undefined
        }
        onRetry={() => void refetch()}
        testId="qr-order-error-screen"
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-36 text-foreground">
      <header className="sticky top-0 z-30 border-b bg-card/95 px-4 py-3 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <StoreBrandLogo
              src={qrLogoUrl}
              storeName={qrStoreName}
              testId="qr-brand-logo"
              className="h-10 w-10 rounded-xl shadow-xs"
              fallbackClassName="text-sm"
            />
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate text-foreground">
                {qrStoreName}
              </h1>
              {qrSubtitle ? (
                <p className="text-xs font-medium text-muted-foreground truncate">
                  {qrSubtitle}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              data-testid="qr-theme-toggle"
              onClick={toggleQrTheme}
              aria-label="Chuyển chế độ Sáng/Tối"
              title={effectiveQrTheme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
              className="h-8 w-8 rounded-lg"
            >
              {effectiveQrTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" />
              )}
            </Button>
            <Badge
              data-testid="qr-table-header"
              className="h-8 px-3.5 py-0 rounded-lg bg-primary text-xs sm:text-sm font-bold text-primary-foreground shadow-xs"
            >
              {resolvedTableName}
            </Badge>
          </div>
        </div>

        {settings.qr.welcomeMessage ? (
          <p
            data-testid="qr-welcome-message"
            className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground"
          >
            {settings.qr.welcomeMessage}
          </p>
        ) : null}

        <div
          data-testid="qr-table-transfer-warning"
          className="mt-2.5 flex items-center gap-2 rounded-lg border-2 border-amber-500 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-950 dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-100 shadow-xs animate-pulse"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{resolveMessage('qr.banner.tableMoveNotice').title}</span>
        </div>

        {redirectNotice ? (
          <div
            data-testid="qr-redirect-banner"
            className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-100"
          >
            <RefreshCw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{redirectNotice}</span>
          </div>
        ) : null}

        {statusMessage ? (
          <div
            data-testid="qr-status-banner"
            className={cn(
              'mt-2.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold',
              orderStatus === 'VOIDED'
                ? 'border-red-500/60 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-950/70 dark:text-red-100'
                : 'border-emerald-500/50 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/70 dark:text-emerald-100',
            )}
          >
            <CheckCircle2
              className={cn(
                'h-4 w-4 shrink-0',
                orderStatus === 'VOIDED'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
            />
            <span>
              {statusMessage} (
              {orderStatus === 'SERVING'
                ? 'Đang phục vụ'
                : orderStatus === 'PENDING'
                  ? 'Mới gọi món'
                  : orderStatus === 'PAID'
                    ? 'Đã thanh toán'
                    : orderStatus === 'VOIDED'
                      ? 'Đã huỷ'
                      : orderStatus}
              )
            </span>
          </div>
        ) : null}
      </header>

      <main className="space-y-3 p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Thực đơn món ăn ({filteredProducts.length})
            </h2>
          </div>

          <div ref={menuSearch.containerRef} className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              {...menuSearch.inputProps}
              placeholder="Tìm tên món ăn (VD: mì cay, tokbokki, trà đào...)"
              data-testid="qr-menu-search-input"
              className="h-9 pl-9 pr-8 text-xs sm:text-sm rounded-xl"
            />
            {menuSearch.draft ? (
              <button
                type="button"
                aria-label="Xoá tìm kiếm món"
                onMouseDown={(e) => e.preventDefault()}
                onClick={menuSearch.clear}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Tầng 1: Khu vực Bếp đồng bộ từ cấu hình hệ thống */}
          <div className="flex flex-nowrap overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 items-center gap-1.5 py-0.5">
            {stationTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                data-testid={`qr-station-tab-${tab.value}`}
                onClick={() => {
                  setStationFilter(tab.value);
                  setCategoryFilter('ALL');
                }}
                className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3.5 text-xs font-semibold transition-all select-none whitespace-nowrap touch-manipulation ${
                  stationFilter === tab.value
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/70 text-muted-foreground border border-border/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tầng 2: Danh mục con (cuộn ngang trên mobile để thấy món ngay, xuống dòng trên màn hình lớn) */}
          {visibleCategories.length > 0 ? (
            <div className="flex flex-nowrap overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 items-center gap-1.5 py-0.5">
              <button
                type="button"
                data-testid="qr-category-tab-ALL"
                onClick={() => setCategoryFilter('ALL')}
                className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap touch-manipulation ${
                  categoryFilter === 'ALL'
                    ? 'bg-primary/15 text-accent-text border border-primary/40'
                    : 'bg-background text-muted-foreground border border-border hover:text-foreground'
                }`}
              >
                Tất cả danh mục ({visibleCategories.length})
              </button>
              {visibleCategories.map((cat) => {
                const isSelected = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid={`qr-category-tab-${cat.id}`}
                    onClick={() => setCategoryFilter(isSelected ? 'ALL' : cat.id)}
                    className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap touch-manipulation ${
                      isSelected
                        ? 'bg-primary/15 text-accent-text border border-primary/40'
                        : 'bg-background text-muted-foreground border border-border hover:text-foreground'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center text-muted-foreground">
              <p className="text-sm font-semibold">Không tìm thấy món phù hợp</p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs font-semibold text-accent-text hover:underline"
                >
                  Xoá từ khoá tìm kiếm
                </button>
              ) : null}
            </div>
          ) : filteredProducts.map((product) => (
              <div
                key={product.id}
                data-testid={`qr-product-card-${product.id}`}
                onClick={() => handleProductClick(product)}
                className="flex cursor-pointer items-center justify-between rounded-xl border bg-card p-3.5 shadow-xs transition hover:border-primary/60 active:scale-[0.99]"
              >
                <div className="space-y-1 pr-2">
                  {product.categoryName ? (
                    <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {product.categoryName}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <p className="font-bold text-foreground text-sm sm:text-base">
                      {product.name}
                    </p>
                    {product.subtitle ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        ({product.subtitle})
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-extrabold text-price">
                    {product.price.toLocaleString('vi-VN')} đ
                  </p>
                  {product.modifierGroups.length > 0 ? (
                    <p className="text-xs font-medium text-muted-foreground line-clamp-1">
                      Tuỳ chọn: {product.modifierGroups.map((g) => g.name).join(', ')}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 px-4 rounded-lg bg-primary text-xs sm:text-sm font-bold text-primary-foreground hover:bg-primary/90 shrink-0 touch-manipulation active:scale-[0.98] shadow-xs"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Chọn</span>
                </Button>
              </div>
            ))}
        </div>
      </main>

      {/* Floating Bottom Action Bars (Món đã gọi & Giỏ hàng) */}
      {(activeOrder || cart.length > 0) ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md space-y-2 p-3 pb-safe">
          {activeOrder ? (
            <button
              type="button"
              data-testid="qr-placed-orders-bar"
              onClick={() => setPlacedOrdersSheetOpen(true)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-card/95 px-3.5 py-2.5 text-left shadow-lg backdrop-blur-md transition hover:border-emerald-500 active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">
                    Món đã gọi ({placedTotalQty} món)
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                    Tạm tính: {activeOrder.totalAmount.toLocaleString('vi-VN')} đ • Bấm xem chi tiết
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-[11px]">
                Xem lại
              </Badge>
            </button>
          ) : null}

          {cart.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-card/95 p-2.5 shadow-2xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => setCartSheetOpen(true)}
                className="flex items-center gap-2.5 text-left transition active:scale-[0.98] min-w-0"
                aria-label="Xem chi tiết giỏ hàng"
              >
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <ShoppingBag className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white ring-2 ring-background">
                    {cartCount}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-foreground">Giỏ hàng</span>
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-extrabold text-price truncate">
                    {cartTotal.toLocaleString('vi-VN')} đ
                  </p>
                </div>
              </button>

              <Button
                type="button"
                data-testid="qr-submit-order-btn"
                disabled={submitMutation.isPending}
                onClick={handleSubmitOrder}
                className="h-11 rounded-xl bg-primary px-4 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] shrink-0"
              >
                {resolvedActiveOrderId ? 'Gửi gọi thêm' : 'Gửi đặt món'} ({cartCount})
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bottom Sheet: Xem lại món đã gọi */}
      <Sheet open={placedOrdersSheetOpen} onOpenChange={setPlacedOrdersSheetOpen}>
        <SheetContent
          side="bottom"
          data-testid="qr-placed-orders-sheet"
          className="max-h-[85vh] rounded-t-3xl border-t bg-background p-4 sm:p-6 shadow-2xl flex flex-col"
        >
          <SheetHeader className="pb-3 border-b text-left pr-10">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              Món đã gọi — {resolvedTableName}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {activeOrder
                ? `Mã đơn #${activeOrder.orderCode} • ${
                    activeOrder.status === 'PENDING' ? 'Đang chờ thu ngân xác nhận' : 'Đang phục vụ'
                  }`
                : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 max-h-[55vh]">
            {placedBatches.map((batch) => (
              <div key={batch.batchNo} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Lượt gọi #{batch.batchNo}</span>
                  <span>{batch.items.reduce((s, item) => s + item.quantity, 0)} món</span>
                </div>
                {batch.items.map((item) => {
                  const kStatus = KITCHEN_STATUS_LABELS[item.kitchenStatus] ?? {
                    label: item.kitchenStatus,
                    className: 'border-border text-muted-foreground',
                  };
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border bg-card p-3 shadow-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">
                            {item.quantity}x {item.productName}
                          </p>
                          {item.modifiers.length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {item.modifiers
                                .map((m) =>
                                  m.action === 'SUBSTITUTE' && m.substituteName
                                    ? `Đổi ${m.substitutedFromName ?? m.name} → ${m.substituteName}`
                                    : m.action === 'REMOVED'
                                      ? `Không ${m.name}`
                                      : m.name,
                                )
                                .join(', ')}
                            </p>
                          ) : null}
                          {item.itemNote ? (
                            <p className="text-xs italic text-amber-600 dark:text-amber-400">
                              Ghi chú: {item.itemNote}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs font-extrabold text-price">
                            {item.lineTotal.toLocaleString('vi-VN')} đ
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${kStatus.className}`}>
                            {kStatus.label}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {activeOrder ? (
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">
                Tổng tạm tính ({placedTotalQty} món)
              </span>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {activeOrder.totalAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Cart Bottom Sheet / Drawer */}
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] rounded-t-3xl border-t bg-background p-4 sm:p-6 shadow-2xl flex flex-col"
        >
          <SheetHeader className="pb-3 border-b text-left pr-10">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-accent-text" />
              Giỏ hàng ({cartCount} món)
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Đang gọi món cho {resolvedTableName}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1 max-h-[50vh]">
            <div className="flex items-center justify-between pb-1 px-0.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Món đã chọn ({cartCount})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCart([]);
                  setCartSheetOpen(false);
                }}
                className="h-7 px-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xoá tất cả</span>
              </Button>
            </div>
            {cart.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-xs"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                  {item.modifierLabels.length > 0 ? (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {item.modifierLabels.join(', ')}
                    </p>
                  ) : null}
                  {item.itemNote ? (
                    <p className="text-xs italic text-amber-600 truncate">
                      Ghi chú: {item.itemNote}
                    </p>
                  ) : null}
                  <p className="text-xs font-bold text-price mt-0.5">
                    {(item.unitPrice * item.quantity).toLocaleString('vi-VN')} đ
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg active:scale-95 transition-transform select-none touch-manipulation"
                    onClick={() => handleUpdateCartQuantity(item.key, -1)}
                    aria-label="Giảm"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg active:scale-95 transition-transform select-none touch-manipulation"
                    onClick={() => handleUpdateCartQuantity(item.key, 1)}
                    aria-label="Tăng"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-rose-500 hover:text-rose-700 ml-1 active:scale-95 transition-transform select-none touch-manipulation"
                    onClick={() => handleRemoveCartItem(item.key)}
                    aria-label={`Xoá ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Tổng cộng</span>
              <span className="text-lg font-extrabold text-price">
                {cartTotal.toLocaleString('vi-VN')} đ
              </span>
            </div>
            <Button
              type="button"
              disabled={submitMutation.isPending}
              onClick={() => {
                setCartSheetOpen(false);
                void handleSubmitOrder();
              }}
              className="w-full h-11 bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 shadow-md rounded-xl active:scale-[0.98] touch-manipulation"
            >
              <ShoppingBag className="h-4 w-4 shrink-0" />
              <span>
                {resolvedActiveOrderId ? 'Xác nhận gọi thêm món' : 'Xác nhận gửi đơn đặt món'} (
                {cartCount} món — {cartTotal.toLocaleString('vi-VN')} đ)
              </span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ModifierSelectorSheet
        product={selectingProduct}
        open={Boolean(selectingProduct)}
        onOpenChange={(open) => {
          if (!open) setSelectingProduct(null);
        }}
        onConfirm={handleConfirmModifier}
      />
    </div>
  );
}
