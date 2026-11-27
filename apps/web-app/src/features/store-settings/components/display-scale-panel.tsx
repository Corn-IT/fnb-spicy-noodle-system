import {
  ALLOWED_STORE_NAV_PATHS,
  cloneDefaultDisplayScale,
  DEFAULT_DISPLAY_SCALE_PERCENT,
  DISPLAY_SCALE_MAX_PERCENT,
  DISPLAY_SCALE_MIN_PERCENT,
  DISPLAY_SCALE_STEP_PERCENT,
  type AllowedStoreNavPath,
  type DisplayScale,
} from '@fnb/shared';
import { Monitor, RotateCcw, Smartphone } from 'lucide-react';

import { APP_NAVIGATION_ROUTE_MAP } from '@/components/layout/command-palette';
import { Button } from '@/components/ui/button';
import { resolveNavLabel } from '@/hooks/use-store-settings';

const SCALE_PRESETS = [80, 90, 100, 110, 125, 140, 150] as const;

const SCALE_STEPS: number[] = [];
for (let p = DISPLAY_SCALE_MIN_PERCENT; p <= DISPLAY_SCALE_MAX_PERCENT; p += DISPLAY_SCALE_STEP_PERCENT) {
  SCALE_STEPS.push(p);
}

export interface DisplayScalePanelProps {
  displayScale: DisplayScale;
  navLabels: Record<string, string>;
  canUpdate: boolean;
  onChange: (updater: (prev: DisplayScale) => DisplayScale) => void;
}

export function DisplayScalePanel({
  displayScale,
  navLabels,
  canUpdate,
  onChange,
}: DisplayScalePanelProps) {
  const handleGlobalChange = (percent: number) => {
    onChange((prev) => ({
      ...prev,
      globalPercent: percent,
    }));
  };

  const handlePerPathChange = (path: AllowedStoreNavPath, value: string) => {
    onChange((prev) => {
      const nextPerPath = { ...prev.perPath };
      if (value === 'inherit') {
        delete nextPerPath[path];
      } else {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          nextPerPath[path] = parsed;
        }
      }
      return {
        ...prev,
        perPath: nextPerPath,
      };
    });
  };

  const handleQrPercentChange = (percent: number) => {
    onChange((prev) => ({
      ...prev,
      qrOrderPercent: percent,
    }));
  };

  const handleResetAll = () => {
    onChange(() => cloneDefaultDisplayScale());
  };

  return (
    <div
      data-testid="display-scale-panel"
      className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold">
            <Monitor className="h-4 w-4 text-accent-text shrink-0" />
            <span>Cỡ chữ & Tỉ lệ hiển thị màn hình</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Phóng to hoặc thu nhỏ vùng nội dung mặc định toàn quán (80%–150%) theo từng màn hình và pop-up mở từ màn hình đó. Thanh menu bên trái và thanh trên giữ nguyên 100%. Mọi tài khoản và thiết bị áp dụng tỉ lệ của cửa hàng, kể cả trên điện thoại.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canUpdate}
          data-testid="btn-reset-display-scale"
          onClick={handleResetAll}
          className="h-8 shrink-0 gap-1.5 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Về mặc định 100%</span>
        </Button>
      </div>

      {/* Global scale */}
      <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="display-scale-global-slider" className="text-sm font-semibold">
            Tỉ lệ chung cho toàn bộ màn hình quản trị
          </label>
          <span
            data-testid="display-scale-global-value"
            className="rounded-md bg-primary/10 px-2.5 py-0.5 font-mono text-sm font-extrabold text-accent-text"
          >
            {displayScale.globalPercent}%
          </span>
        </div>
        <input
          id="display-scale-global-slider"
          data-testid="display-scale-global-slider"
          type="range"
          min={DISPLAY_SCALE_MIN_PERCENT}
          max={DISPLAY_SCALE_MAX_PERCENT}
          step={DISPLAY_SCALE_STEP_PERCENT}
          disabled={!canUpdate}
          value={displayScale.globalPercent}
          onChange={(e) => handleGlobalChange(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex flex-wrap gap-1.5">
          {SCALE_PRESETS.map((pct) => (
            <Button
              key={pct}
              type="button"
              size="sm"
              variant={displayScale.globalPercent === pct ? 'default' : 'outline'}
              disabled={!canUpdate}
              data-testid={`display-scale-global-preset-${pct}`}
              onClick={() => handleGlobalChange(pct)}
              className="h-8 px-2.5 font-mono text-xs"
            >
              {pct}%
            </Button>
          ))}
        </div>
      </div>

      {/* Guest QR order isolated scale */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-bold">
            <Smartphone className="h-4 w-4 text-accent-text shrink-0" />
            <span>Trang gọi món QR (khách hàng)</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cấu hình độc lập cho điện thoại khách hàng — không bị ảnh hưởng bởi tỉ lệ chung ở trên.
          </p>
        </div>
        <select
          aria-label="Tỉ lệ hiển thị Trang gọi món QR"
          data-testid="display-scale-qr-select"
          disabled={!canUpdate}
          value={displayScale.qrOrderPercent}
          onChange={(e) => handleQrPercentChange(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2.5 font-mono text-xs font-bold shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {SCALE_STEPS.map((pct) => (
            <option key={pct} value={pct}>
              {pct}%{pct === DEFAULT_DISPLAY_SCALE_PERCENT ? ' (Mặc định)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Per-screen overrides */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Tuỳ chỉnh riêng từng màn hình (ghi đè tỉ lệ chung)
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ALLOWED_STORE_NAV_PATHS.map((navPath) => {
            const routeMeta = APP_NAVIGATION_ROUTE_MAP.get(navPath);
            const label = resolveNavLabel(navPath, routeMeta?.label ?? navPath, navLabels);
            const override = displayScale.perPath[navPath];
            const selectValue = override !== undefined ? String(override) : 'inherit';

            return (
              <div
                key={navPath}
                className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold leading-snug text-foreground break-words">
                    {label}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground break-all">
                    {navPath}
                  </div>
                </div>
                <select
                  aria-label={`Tỉ lệ hiển thị ${label}`}
                  data-testid={`display-scale-path-${navPath.replace(/^\//, '')}`}
                  disabled={!canUpdate}
                  value={selectValue}
                  onChange={(e) => handlePerPathChange(navPath, e.target.value)}
                  className="h-9 shrink-0 rounded-md border border-input bg-background px-2 font-mono text-xs font-semibold shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="inherit">
                    Theo mức chung ({displayScale.globalPercent}%)
                  </option>
                  {SCALE_STEPS.map((pct) => (
                    <option key={pct} value={pct}>
                      Riêng: {pct}%
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
