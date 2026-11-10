import { type OrderItemModifierSelection, type Product } from '@fnb/shared';
import {
  CheckCircle2,
  ChevronUp,
  Flame,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sun,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { usePublicMenuQuery, useSubmitQrOrderMutation } from '../api/qr-order.api';
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

export function QrOrderPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { data: menuData, isPending, isError } = usePublicMenuQuery(token);
  const submitMutation = useSubmitQrOrderMutation();
  const theme = useUiPreferencesStore((state) => state.theme);
  const toggleTheme = useUiPreferencesStore((state) => state.toggleTheme);

  const {
    activeOrderId,
    currentTableLabel,
    orderStatus,
    statusMessage,
    redirectNotice,
    registerSubmittedOrder,
  } = useQrSessionSocket(token, menuData?.table.tableName);

  const [cart, setCart] = React.useState<CartLineItem[]>([]);
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false);
  const [selectingProduct, setSelectingProduct] = React.useState<Product | null>(null);
  const [stationFilter, setStationFilter] = React.useState<'ALL' | Product['station']>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | number>('ALL');

  const resolvedTableName = currentTableLabel || menuData?.table.tableName || 'Bàn QR';
  const resolvedActiveOrderId = activeOrderId ?? menuData?.table.activeOrderId ?? undefined;

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

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || submitMutation.isPending) return;

    try {
      const response = await submitMutation.mutateAsync({
        qrToken: token,
        ...(resolvedActiveOrderId ? { activeOrderId: resolvedActiveOrderId } : {}),
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
      toast({
        variant: 'success',
        title: 'Đã gửi đơn thành công',
        description: `Lượt gọi #${response.batchNo} tại ${response.currentTableLabel}`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể gửi đơn',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại',
      });
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        Đang tải thực đơn bàn...
      </div>
    );
  }

  if (isError || !menuData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <p className="text-base font-semibold text-rose-600">
          Mã QR không hợp lệ hoặc đã hết hạn
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vui lòng liên hệ nhân viên phục vụ để được hỗ trợ.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-36 text-foreground">
      <header className="sticky top-0 z-30 border-b bg-card/95 px-4 py-3 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <Flame className="h-5 w-5 shrink-0" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate text-foreground">
                Mì Cay Sơn Bảo
              </h1>
              <p className="text-xs font-medium text-muted-foreground truncate">
                Đặt món tại bàn nhanh chóng
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              data-testid="qr-theme-toggle"
              onClick={toggleTheme}
              aria-label="Chuyển chế độ Sáng/Tối"
              title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
              className="h-8 w-8 rounded-lg"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" />
              )}
            </Button>
            <Badge
              data-testid="qr-table-header"
              className="h-8 px-3.5 py-0 rounded-lg bg-rose-600 text-xs sm:text-sm font-bold text-white shadow-xs"
            >
              {resolvedTableName}
            </Badge>
          </div>
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
            className="mt-2.5 flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/70 dark:text-emerald-100"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {statusMessage} ({orderStatus})
            </span>
          </div>
        ) : null}
      </header>

      <main className="space-y-3 p-4">
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Thực đơn món ăn ({menuData.products.length})
          </h2>

          {/* Tầng 1: Khu vực Bếp */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {(
              [
                { value: 'ALL', label: 'Tất cả' },
                { value: 'BEP_NAU', label: 'Bếp nấu' },
                { value: 'BEP_CHIEN', label: 'Bếp chiên' },
                { value: 'PHA_CHE', label: 'Pha chế' },
                { value: 'COMBO', label: 'Combo' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setStationFilter(tab.value);
                  setCategoryFilter('ALL');
                }}
                className={`inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition-all select-none ${
                  stationFilter === tab.value
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-muted/70 text-muted-foreground border border-border/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tầng 2: Danh mục con động */}
          {(() => {
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
            const subcats = Array.from(catMap.entries()).map(([id, name]) => ({ id, name }));
            if (subcats.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('ALL')}
                  className={`inline-flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    categoryFilter === 'ALL'
                      ? 'bg-foreground text-background'
                      : 'bg-card text-muted-foreground border border-border/60'
                  }`}
                >
                  Tất cả danh mục
                </button>
                {subcats.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`inline-flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      categoryFilter === cat.id
                        ? 'bg-foreground text-background'
                        : 'bg-card text-muted-foreground border border-border/60'
                    }`}
                  >
                    + {cat.name}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {menuData.products
            .filter((p) => {
              if (stationFilter !== 'ALL' && p.station !== stationFilter) return false;
              if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
              return true;
            })
            .map((product) => (
              <div
                key={product.id}
                data-testid={`qr-product-card-${product.id}`}
                onClick={() => handleProductClick(product)}
                className="flex cursor-pointer items-center justify-between rounded-xl border bg-card p-3.5 shadow-xs transition hover:border-rose-500/60 active:scale-[0.99]"
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
                  <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
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
                  className="h-9 px-3.5 rounded-lg bg-rose-600 text-xs sm:text-sm font-bold text-white hover:bg-rose-700 shrink-0 touch-manipulation active:scale-[0.98] shadow-xs"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Chọn</span>
                </Button>
              </div>
            ))}
        </div>
      </main>

      {/* Floating Bottom Cart Bar (Thumb-friendly on Mobile) */}
      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md p-3 pb-safe">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-card/95 p-2.5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setCartSheetOpen(true)}
              className="flex items-center gap-2.5 text-left transition active:scale-[0.98] min-w-0"
              aria-label="Xem chi tiết giỏ hàng"
            >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
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
                <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400 truncate">
                  {cartTotal.toLocaleString('vi-VN')} đ
                </p>
              </div>
            </button>

            <Button
              type="button"
              data-testid="qr-submit-order-btn"
              disabled={submitMutation.isPending}
              onClick={handleSubmitOrder}
              className="h-10 rounded-xl bg-rose-600 px-4 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-rose-700 active:scale-[0.98] shrink-0"
            >
              {resolvedActiveOrderId ? 'Gửi gọi thêm' : 'Gửi đặt món'} ({cartCount})
            </Button>
          </div>
        </div>
      ) : null}

      {/* Cart Bottom Sheet / Drawer */}
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] rounded-t-3xl border-t bg-background p-4 sm:p-6 shadow-2xl flex flex-col"
        >
          <SheetHeader className="pb-3 border-b text-left pr-10">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-rose-600" />
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
                  <p className="text-xs font-bold text-rose-600 mt-0.5">
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
              <span className="text-lg font-extrabold text-rose-600">
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
              className="w-full h-11 bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 shadow-md rounded-xl active:scale-[0.98] touch-manipulation"
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
