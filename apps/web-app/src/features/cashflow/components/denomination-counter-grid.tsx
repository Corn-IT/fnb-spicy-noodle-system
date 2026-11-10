import { type DenominationsDetail } from '@fnb/shared';
import { Banknote, RotateCcw } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const DENOMINATION_TIERS = [
  { key: '500000', value: 500000, label: '500.000đ' },
  { key: '200000', value: 200000, label: '200.000đ' },
  { key: '100000', value: 100000, label: '100.000đ' },
  { key: '50000', value: 50000, label: '50.000đ' },
  { key: '20000', value: 20000, label: '20.000đ' },
  { key: '10000', value: 10000, label: '10.000đ' },
  { key: '5000', value: 5000, label: '5.000đ' },
  { key: '2000', value: 2000, label: '2.000đ' },
  { key: '1000', value: 1000, label: '1.000đ' },
] as const;

export const INITIAL_DENOMINATIONS: DenominationsDetail = {
  '500000': 0,
  '200000': 0,
  '100000': 0,
  '50000': 0,
  '20000': 0,
  '10000': 0,
  '5000': 0,
  '2000': 0,
  '1000': 0,
};

export function calculateDenominationsTotal(counts: DenominationsDetail): number {
  return DENOMINATION_TIERS.reduce(
    (sum, tier) => sum + tier.value * (counts[tier.key] || 0),
    0,
  );
}

export interface DenominationCounterGridProps {
  counts: DenominationsDetail;
  onChangeCount: (denomKey: keyof DenominationsDetail, count: number) => void;
  onReset: () => void;
}

export function DenominationCounterGrid({
  counts,
  onChangeCount,
  onReset,
}: DenominationCounterGridProps) {
  const actualCountedCash = React.useMemo(
    () => calculateDenominationsTotal(counts),
    [counts],
  );

  return (
    <div
      data-testid="denomination-counter-grid"
      className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm"
    >
      <div>
        <div className="mb-3 flex items-center justify-between border-b pb-2.5">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Lưới Đếm Tiền Theo 9 Mệnh Giá
              </h3>
              <p className="text-xs text-muted-foreground">
                Nhập số tờ thực tế trong két để tự động tính tổng tiền thực đếm
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span>Đặt lại</span>
          </Button>
        </div>

        <div className="divide-y">
          {DENOMINATION_TIERS.map((tier) => {
            const sheetCount = counts[tier.key] ?? 0;
            const subtotal = tier.value * sheetCount;
            return (
              <div
                key={tier.key}
                className="grid grid-cols-12 items-center gap-2 py-2 text-xs"
              >
                <div className="col-span-4 font-mono text-sm font-bold text-foreground">
                  {tier.label}
                </div>
                <div className="col-span-4 flex items-center gap-1.5">
                  <span className="text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    data-testid={`denom-input-${tier.key}`}
                    value={sheetCount === 0 ? '' : String(sheetCount)}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
                      onChangeCount(tier.key, parsed);
                    }}
                    className="h-8 text-center font-semibold"
                  />
                  <span className="text-muted-foreground">tờ</span>
                </div>
                <div
                  data-testid={`denom-subtotal-${tier.key}`}
                  className="col-span-4 text-right font-mono font-semibold text-foreground"
                >
                  {subtotal.toLocaleString('vi-VN')} đ
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3.5">
        <span className="text-sm font-bold uppercase text-foreground">
          Tổng tiền thực đếm tại két:
        </span>
        <span
          data-testid="actual-counted-cash"
          className="font-mono text-lg font-extrabold text-primary"
        >
          {actualCountedCash.toLocaleString('vi-VN')} đ
        </span>
      </div>
    </div>
  );
}
