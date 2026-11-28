import {
  StoreAssetKind,
  normalizeQrToken,
  type Product,
  type PublicMenuActiveOrder,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useParams } from 'react-router-dom';

import { SystemErrorView } from '@/components/error-display';
import { PageSkeleton } from '@/components/loading';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useDisplayScale } from '@/hooks/use-display-scale';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';
import { ApiClientError } from '@/lib/api-client';
import { useMenuSyncListener } from '@/lib/menu-sync';
import { usePublicMenuQuery, useSubmitQrOrderMutation } from '../api/qr-order.api';
import { useQrOrderMenuFilters } from '../hooks/use-qr-order-menu-filters';
import { useQrOrderSecurity } from '../hooks/use-qr-order-security';
import { useQrSessionSocket } from '../hooks/use-qr-session-socket';
import {
  buildTakeawayKitchenProgress,
  readStoredDraftCart,
  reconcileCartItems,
  writeStoredDraftCart,
  type CartLineItem,
} from '../utils/qr-cart-storage';
import {
  ModifierSelectorSheet,
  type ModifierSelectorConfirmPayload,
} from './modifier-selector-sheet';
import { QrCartSheet, QrFloatingActionBars } from './qr-cart-sheet';
import { QrRotatedLockScreen, QrSecurityLockScreen } from './qr-lock-screens';
import { QrMenuBrowser } from './qr-menu-browser';
import { QrOrderHeader } from './qr-order-header';
import { QrPlacedOrdersSheet, QrTakeawayTicketCard } from './qr-placed-orders-sheet';

/** Public QR self-ordering experience supporting dine-in table batches and takeaway guests. */
export function QrOrderPage() {
  useMenuSyncListener();
  useDisplayScale('/q');

  const { token: rawToken = '' } = useParams<{ token: string }>();
  const token = React.useMemo(() => normalizeQrToken(rawToken), [rawToken]);
  const queryClient = useQueryClient();

  const { settings } = useStoreSettings();
  const { resolveMessage, resolveErrorMessage, notify } = useAppMessages();
  const qrLogoUrl =
    buildStoreAssetUrl(StoreAssetKind.QR_LOGO, settings.assets.qrLogo) ??
    buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);
  const qrStoreName = settings.qr.storeName || settings.storeName;
  const qrSubtitle = settings.qr.subtitle || settings.subtitle;

  const {
    activeOrderId,
    guestSessionToken,
    currentTableLabel,
    orderStatus,
    ephemeralNotices,
    endedState,
    addonAutoCancelNotice,
    isReconnecting,
    qrRotated,
    dismissEphemeralNotice,
    dismissAddonAutoCancelNotice,
    markSubmittingAddon,
    clearSubmittingAddon,
    registerSubmittedOrder,
    startNewOrderSession,
    syncTableSnapshot,
    getSessionFilter,
  } = useQrSessionSocket(token);

  const submitMutation = useSubmitQrOrderMutation();
  const [coordsForQuery, setCoordsForQuery] = React.useState<{ lat: number; lng: number } | null>(null);

  const {
    data: menuData,
    queriedOrderId,
    isPending,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = usePublicMenuQuery(token, coordsForQuery, getSessionFilter);

  const {
    guestCoords,
    isLocatingGuestGps,
    gpsErrorMsg,
    handleRequestGuestGps,
    qrSecurityBlock,
  } = useQrOrderSecurity({
    settings,
    qrStoreName,
    isError,
    error,
  });

  React.useEffect(() => {
    setCoordsForQuery(guestCoords);
  }, [guestCoords]);

  React.useEffect(() => {
    if (!menuData?.table || isPlaceholderData) return;
    const hasKitchenPrinted = Boolean(
      menuData.activeOrder?.items.some((item) => item.kitchenStatus !== 'NEW'),
    );
    syncTableSnapshot(menuData.table.tableName, {
      tableName: menuData.table.tableName,
      activeOrderId: menuData.table.activeOrderId,
      activeOrderStatus: menuData.activeOrder?.status ?? null,
      activeOrderTableLabel: menuData.activeOrder?.tableLabel ?? null,
      hasKitchenPrinted,
      queriedOrderId,
      orderMode: menuData.orderMode,
    });
  }, [syncTableSnapshot, isPlaceholderData, menuData, queriedOrderId]);

  const initialDraft = React.useMemo(() => readStoredDraftCart(token), [token]);
  const [cart, setCart] = React.useState<CartLineItem[]>(() => initialDraft.items);
  const [takeawayNote, setTakeawayNote] = React.useState(() => initialDraft.takeawayNote);
  const [addonIsTakeawayBatch, setAddonIsTakeawayBatch] = React.useState(false);

  React.useEffect(() => {
    writeStoredDraftCart(token, { items: cart, takeawayNote });
  }, [token, cart, takeawayNote]);

  const [cartSheetOpen, setCartSheetOpen] = React.useState(false);
  const [placedOrdersSheetOpen, setPlacedOrdersSheetOpen] = React.useState(false);
  const [selectingProduct, setSelectingProduct] = React.useState<Product | null>(null);

  const filters = useQrOrderMenuFilters(menuData);

  const isTakeaway = menuData?.orderMode === 'TAKEAWAY';
  const resolvedTableName = currentTableLabel || menuData?.table.tableName || 'Bàn QR';
  const resolvedActiveOrderId = activeOrderId ?? menuData?.table.activeOrderId ?? undefined;

  const activeOrder: PublicMenuActiveOrder | null = React.useMemo(() => {
    const order = menuData?.activeOrder ?? null;
    if (!order || order.items.length === 0) return null;
    if (endedState !== null || orderStatus === 'PAID' || orderStatus === 'VOIDED') return null;
    return order;
  }, [menuData?.activeOrder, endedState, orderStatus]);

  const isAddonForDineIn = !isTakeaway && Boolean(resolvedActiveOrderId || activeOrder);
  const isPaidLocked = endedState?.kind === 'PAID';

  const productById = React.useMemo(
    () => new Map((menuData?.products ?? []).map((p) => [p.id, p])),
    [menuData?.products],
  );
  const reconciledCart = React.useMemo(
    () => reconcileCartItems(cart, menuData, productById),
    [cart, menuData, productById],
  );
  const unavailableCartNames = React.useMemo(
    () => reconciledCart.filter((item) => item.isUnavailable).map((item) => item.effectiveName),
    [reconciledCart],
  );
  const hasUnavailableCartItem = unavailableCartNames.length > 0;
  const hasPriceChangedCartItem = reconciledCart.some((item) => item.priceChanged);

  const placedTotalQty = React.useMemo(
    () => (activeOrder ? activeOrder.items.reduce((sum, item) => sum + item.quantity, 0) : 0),
    [activeOrder],
  );
  const kitchenCounts = React.useMemo(() => {
    if (!activeOrder) return { receivedQty: 0, waitingQty: 0 };
    let receivedQty = 0;
    let waitingQty = 0;
    for (const item of activeOrder.items) {
      if (item.kitchenStatus === 'NEW') waitingQty += item.quantity;
      else receivedQty += item.quantity;
    }
    return { receivedQty, waitingQty };
  }, [activeOrder]);

  const takeawayKitchenProgress = React.useMemo(
    () => buildTakeawayKitchenProgress(activeOrder, placedTotalQty, kitchenCounts),
    [activeOrder, placedTotalQty, kitchenCounts],
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

  const cartTotal = reconciledCart.reduce(
    (sum, item) => sum + item.effectiveUnitPrice * item.quantity,
    0,
  );
  const cartCount = reconciledCart.reduce((sum, item) => sum + item.quantity, 0);
  const cartQtyByProductId = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const item of reconciledCart) {
      map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
    }
    return map;
  }, [reconciledCart]);

  const handleUpdateCartQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.key === key ? { ...item, quantity: item.quantity + delta } : item))
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

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || submitMutation.isPending || isPaidLocked) return;
    if (hasUnavailableCartItem) {
      notify('qr.cart.unavailableItem', {
        variant: 'destructive',
        vars: { names: unavailableCartNames.join(', ') },
      });
      return;
    }

    try {
      markSubmittingAddon(resolvedActiveOrderId);
      const response = await submitMutation.mutateAsync({
        qrToken: token,
        ...(resolvedActiveOrderId ? { activeOrderId: resolvedActiveOrderId } : {}),
        ...(resolvedActiveOrderId && guestSessionToken ? { guestSessionToken } : {}),
        ...(isTakeaway && !resolvedActiveOrderId && takeawayNote.trim()
          ? { note: takeawayNote.trim() }
          : {}),
        ...(guestCoords ? { latitude: guestCoords.lat, longitude: guestCoords.lng } : {}),
        ...(isAddonForDineIn && addonIsTakeawayBatch ? { isTakeawayBatch: true } : {}),
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          modifiers: item.modifiers,
          ...(item.itemNote ? { itemNote: item.itemNote } : {}),
          ...(isAddonForDineIn && addonIsTakeawayBatch ? { isTakeaway: true } : {}),
        })),
      });

      registerSubmittedOrder({
        activeOrderId: response.activeOrderId,
        currentTableLabel: response.currentTableLabel,
        status: response.status,
        batchNo: response.batchNo,
        guestSessionToken: response.guestSessionToken ?? null,
      });
      setCart([]);
      setTakeawayNote('');
      setAddonIsTakeawayBatch(false);
      writeStoredDraftCart(token, { items: [], takeawayNote: '' });
      void queryClient.invalidateQueries({ queryKey: ['public-menu', token] });
      notify('qr.order.submitSuccess', {
        variant: 'success',
        vars: { batchNo: response.batchNo, tableLabel: response.currentTableLabel },
      });
    } catch (err) {
      clearSubmittingAddon();
      const resolvedErr = resolveErrorMessage('qr.order.submitError', err);
      notify('qr.order.submitError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? (err instanceof Error ? err.message : 'Vui lòng thử lại') },
      });
    }
  };

  if (isPending) {
    return <PageSkeleton variant="qr" label={resolveMessage('qr.loading.menu').title} />;
  }
  if (qrRotated) {
    return <QrRotatedLockScreen />;
  }
  if (qrSecurityBlock) {
    return (
      <QrSecurityLockScreen
        securityBlock={qrSecurityBlock}
        gpsErrorMsg={gpsErrorMsg}
        isLocatingGuestGps={isLocatingGuestGps}
        onRequestGuestGps={handleRequestGuestGps}
        onRetryMenu={() => void refetch()}
      />
    );
  }
  if (!menuData) {
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

  const unavailableWarningTitle = hasUnavailableCartItem
    ? resolveMessage('qr.cart.unavailableItem', { names: unavailableCartNames.join(', ') }).title
    : null;

  return (
    <div
      data-qr-order-root="true"
      className="mx-auto min-h-screen max-w-md md:max-w-2xl lg:max-w-3xl bg-background pb-36 text-foreground"
    >
      <QrOrderHeader
        qrLogoUrl={qrLogoUrl}
        qrStoreName={qrStoreName}
        qrSubtitle={qrSubtitle}
        resolvedTableName={resolvedTableName}
        welcomeMessage={settings.qr.welcomeMessage}
        isTakeaway={isTakeaway}
        isReconnecting={isReconnecting}
        ephemeralNotices={ephemeralNotices}
        endedState={endedState}
        addonAutoCancelNotice={addonAutoCancelNotice}
        activeOrder={activeOrder}
        activeOrderId={activeOrderId}
        orderStatus={orderStatus}
        onDismissEphemeralNotice={dismissEphemeralNotice}
        onStartNewOrderSession={() => startNewOrderSession(isTakeaway ? 'Mang về' : menuData.table.tableName)}
        onDismissAddonAutoCancelNotice={dismissAddonAutoCancelNotice}
      />

      <main className="space-y-3 p-3 sm:p-4">
        {isTakeaway && activeOrder ? (
          <QrTakeawayTicketCard
            activeOrder={activeOrder}
            resolvedTableName={resolvedTableName}
            placedTotalQty={placedTotalQty}
            takeawayKitchenProgress={takeawayKitchenProgress}
            onOpenPlacedOrders={() => setPlacedOrdersSheetOpen(true)}
          />
        ) : null}

        <QrMenuBrowser
          filteredProducts={filters.filteredProducts}
          searchQuery={filters.searchQuery}
          menuSearch={filters.menuSearch}
          stationTabs={filters.stationTabs}
          effectiveStationFilter={filters.effectiveStationFilter}
          visibleCategories={filters.visibleCategories}
          effectiveCategoryFilter={filters.effectiveCategoryFilter}
          cartQtyByProductId={cartQtyByProductId}
          onSelectStation={(station) => {
            filters.setStationFilter(station);
            filters.setCategoryFilter('ALL');
          }}
          onSelectCategory={filters.setCategoryFilter}
          onProductClick={handleProductClick}
        />
      </main>

      <QrFloatingActionBars
        activeOrder={activeOrder}
        cartLength={cart.length}
        placedTotalQty={placedTotalQty}
        cartCount={cartCount}
        cartTotal={cartTotal}
        hasUnavailableCartItem={hasUnavailableCartItem}
        unavailableWarningTitle={unavailableWarningTitle}
        isAddonForDineIn={isAddonForDineIn}
        addonIsTakeawayBatch={addonIsTakeawayBatch}
        resolvedActiveOrderId={resolvedActiveOrderId}
        isSubmitting={submitMutation.isPending}
        isPaidLocked={isPaidLocked}
        onAddonModeChange={setAddonIsTakeawayBatch}
        onOpenPlacedOrders={() => setPlacedOrdersSheetOpen(true)}
        onOpenCart={() => setCartSheetOpen(true)}
        onSubmitOrder={() => void handleSubmitOrder()}
      />

      <QrPlacedOrdersSheet
        open={placedOrdersSheetOpen}
        onOpenChange={setPlacedOrdersSheetOpen}
        activeOrder={activeOrder}
        resolvedTableName={resolvedTableName}
        isTakeaway={isTakeaway}
        placedTotalQty={placedTotalQty}
        placedBatches={placedBatches}
      />

      <QrCartSheet
        open={cartSheetOpen}
        onOpenChange={setCartSheetOpen}
        resolvedTableName={resolvedTableName}
        cartCount={cartCount}
        cartTotal={cartTotal}
        reconciledCart={reconciledCart}
        hasUnavailableCartItem={hasUnavailableCartItem}
        hasPriceChangedCartItem={hasPriceChangedCartItem}
        unavailableWarningTitle={unavailableWarningTitle}
        priceChangedTitle={resolveMessage('qr.cart.priceChanged').title}
        isTakeaway={isTakeaway}
        resolvedActiveOrderId={resolvedActiveOrderId}
        takeawayNote={takeawayNote}
        isAddonForDineIn={isAddonForDineIn}
        addonIsTakeawayBatch={addonIsTakeawayBatch}
        isSubmitting={submitMutation.isPending}
        isPaidLocked={isPaidLocked}
        onClearCart={() => setCart([])}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onTakeawayNoteChange={setTakeawayNote}
        onAddonModeChange={setAddonIsTakeawayBatch}
        onSubmitOrder={() => void handleSubmitOrder()}
      />

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
