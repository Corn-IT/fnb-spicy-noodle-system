import type { Product, ProductStation } from '@fnb/shared';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import * as React from 'react';

import { SystemErrorView } from '@/components/error-display';
import { formatCompactPrice } from '@/components/touch-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import {
  getStationBadgeClassName,
  parseStationOptions,
  useMenuSyncListener,
} from '@/lib/menu-sync';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';
import { matchesVietnameseQuery } from '@/utils/search';
import {
  useMenuProductsQuery,
  useMenuStationsQuery,
  useUpdateProductMutation,
} from '../api/menu-admin.api';

const STATION_FILTER_OPTIONS: ReadonlyArray<{
  value: 'ALL' | ProductStation;
  label: string;
}> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'BEP_NAU', label: 'Bếp nấu' },
  { value: 'BEP_CHIEN', label: 'Bếp chiên' },
  { value: 'PHA_CHE', label: 'Pha chế' },
  { value: 'COMBO', label: 'Combo' },
];

/**
 * Màn báo hết món nhanh cho chế độ POS cảm ứng:
 * chạm 1 lần trên thẻ món lớn để bật / tắt trạng thái `isAvailable`, đồng bộ ngay sang POS & QR.
 */
export function TouchStockStatusPage() {
  useMenuSyncListener();

  const { notify } = useAppMessages();
  const user = useAuthStore((state) => state.user);
  const canUpdateMenu = Boolean(user?.isSuperAdmin || user?.permissions?.menu?.update);

  const productsQuery = useMenuProductsQuery();
  const stationsQuery = useMenuStationsQuery();
  const updateProductMutation = useUpdateProductMutation();

  const [selectedStation, setSelectedStation] = React.useState<'ALL' | ProductStation>('ALL');
  const [onlyUnavailable, setOnlyUnavailable] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');
  const [pendingIds, setPendingIds] = React.useState<Record<number, boolean>>({});

  const products = productsQuery.data ?? [];
  const stations = React.useMemo(() => parseStationOptions(stationsQuery.data), [stationsQuery.data]);

  const stationNameMap = React.useMemo(() => {
    const map: Record<string, string> = {
      BEP_NAU: 'Bếp nấu',
      BEP_CHIEN: 'Bếp chiên',
      PHA_CHE: 'Pha chế',
      COMBO: 'Combo',
    };
    for (const station of stations) {
      map[station.code] = station.name;
    }
    return map;
  }, [stations]);

  const unavailableCount = React.useMemo(
    () => products.filter((item) => !item.isAvailable).length,
    [products],
  );

  const filteredProducts = React.useMemo(() => {
    const query = keyword.trim();
    return products
      .filter((item) => {
        if (selectedStation !== 'ALL' && item.station !== selectedStation) return false;
        if (onlyUnavailable && item.isAvailable) return false;
        if (query && !matchesVietnameseQuery(query, item.name, item.subtitle, item.categoryName)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Ưu tiên đưa món đang hết lên đầu danh sách khi xem tất cả để thu ngân dễ bật lại.
        if (a.isAvailable !== b.isAvailable) {
          return a.isAvailable ? 1 : -1;
        }
        return a.name.localeCompare(b.name, 'vi');
      });
  }, [products, selectedStation, onlyUnavailable, keyword]);

  const handleToggleProduct = async (product: Product) => {
    if (!canUpdateMenu || pendingIds[product.id]) return;
    const nextAvailable = !product.isAvailable;
    setPendingIds((prev) => ({ ...prev, [product.id]: true }));
    try {
      await updateProductMutation.mutateAsync({
        id: product.id,
        body: {
          isAvailable: nextAvailable,
          ...(product.station === 'COMBO'
            ? { station: product.station, comboItems: product.comboItems }
            : {}),
        },
      });
      notify(
        nextAvailable ? 'menu.product.toggleVisibleSuccess' : 'menu.product.toggleHiddenSuccess',
        {
          variant: nextAvailable ? 'success' : 'warning',
          vars: { productName: product.name },
          duration: 2500,
        },
      );
    } catch {
      notify('menu.product.toggleError', { variant: 'destructive' });
    } finally {
      setPendingIds((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }
  };

  if (productsQuery.isError && products.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <SystemErrorView
          variant="section"
          error={productsQuery.error}
          onRetry={() => void productsQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="touch-stock-status-page"
      className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4"
    >
      {!canUpdateMenu ? (
        <div
          data-testid="touch-stock-readonly-notice"
          className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            Tài khoản hiện chỉ có quyền xem thực đơn (chưa có quyền cập nhật để bật/tắt hết món).
          </span>
        </div>
      ) : null}

      {/* Thanh lọc trạm bếp + công tắc chỉ xem món hết + tìm kiếm */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Lọc theo khu vực bếp"
            className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1"
          >
            {STATION_FILTER_OPTIONS.map((option) => {
              const active = selectedStation === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`touch-stock-station-${option.value}`}
                  onClick={() => setSelectedStation(option.value)}
                  className={cn(
                    'flex h-11 items-center rounded-lg px-3.5 text-sm font-bold transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={onlyUnavailable}
            data-testid="touch-stock-only-unavailable"
            onClick={() => setOnlyUnavailable((value) => !value)}
            className={cn(
              'flex h-12 shrink-0 items-center gap-2.5 rounded-xl border px-3.5 text-sm font-bold transition-colors',
              onlyUnavailable
                ? 'border-rose-500/60 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                : 'border-border bg-background text-foreground',
            )}
          >
            <span
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                onlyUnavailable ? 'bg-rose-600' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  onlyUnavailable ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </span>
            <span>Chỉ món đang hết ({unavailableCount})</span>
          </button>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm nhanh tên món (không cần dấu)..."
              data-testid="touch-stock-search-input"
              className="h-12 pl-11 pr-11 text-base"
            />
            {keyword ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Xoá từ khoá"
                onClick={() => setKeyword('')}
                className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2"
              >
                <X className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Đang hiển thị{' '}
            <strong className="text-foreground">{filteredProducts.length}</strong> /{' '}
            {products.length} món ·{' '}
            <strong className="text-rose-600 dark:text-rose-400">{unavailableCount}</strong> món đang
            báo hết
          </span>
          {canUpdateMenu ? (
            <span className="text-xs font-medium">
              Chạm trực tiếp vào thẻ món để chuyển nhanh <strong>Đang bán ↔ Hết món</strong>
            </span>
          ) : null}
        </div>
      </div>

      {/* Lưới thẻ món cảm ứng */}
      {productsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl border bg-muted/50" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div
          data-testid="touch-stock-empty"
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground"
        >
          <Ban className="h-10 w-10 opacity-40" />
          <p className="text-base font-bold text-foreground">
            {onlyUnavailable
              ? 'Hiện không có món nào đang báo hết'
              : 'Không tìm thấy món phù hợp với bộ lọc'}
          </p>
        </div>
      ) : (
        <div
          data-testid="touch-stock-grid"
          className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 lg:grid-cols-4"
        >
          {filteredProducts.map((product) => {
            const isPending = Boolean(pendingIds[product.id]);
            const isAvailable = product.isAvailable;
            return (
              <button
                key={product.id}
                type="button"
                data-testid={`touch-stock-card-${product.id}`}
                data-available={String(isAvailable)}
                disabled={!canUpdateMenu || isPending}
                onClick={() => void handleToggleProduct(product)}
                className={cn(
                  'flex min-h-28 flex-col justify-between rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.98] disabled:cursor-not-allowed',
                  isAvailable
                    ? 'border-emerald-500/40 bg-card hover:border-emerald-500'
                    : 'border-rose-500/70 bg-rose-50/90 text-rose-950 dark:bg-rose-950/35 dark:text-rose-100',
                  !canUpdateMenu && 'opacity-85',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'line-clamp-2 text-base font-extrabold leading-snug',
                      !isAvailable && 'line-through decoration-rose-500/70 opacity-80',
                    )}
                  >
                    {product.name}
                  </span>
                  <span className="shrink-0 text-sm font-extrabold text-price tabular-nums">
                    {formatCompactPrice(product.price)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'max-w-[55%] truncate text-[11px] font-semibold',
                      getStationBadgeClassName(product.station),
                    )}
                  >
                    {stationNameMap[product.station] ?? product.station}
                  </Badge>

                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold',
                      isAvailable
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white',
                    )}
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isAvailable ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Ban className="h-3.5 w-3.5" />
                    )}
                    <span>{isAvailable ? 'Đang bán' : 'HẾT MÓN'}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
