import * as React from 'react';

const MINUTE_MS = 60_000;

/**
 * Thời gian khách đã ngồi kiểu máy POS: "32p", "1h:05p". Dưới 1 phút trả "Vừa vào".
 * Mốc tương lai (lệch giờ máy) cũng coi như vừa vào.
 */
export function formatElapsedSince(startIso: string, nowMs: number): string {
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) return '';
  const totalMinutes = Math.floor(Math.max(0, nowMs - startMs) / MINUTE_MS);
  if (totalMinutes < 1) return 'Vừa vào';
  if (totalMinutes < 60) return `${totalMinutes}p`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h:${String(minutes).padStart(2, '0')}p`;
}

/** Giờ vào dạng "13:29" theo giờ máy. */
export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Giá rút gọn trên ô món: 35000 → "35K", 35500 → "35,5K", 800 → "800đ". */
export function formatCompactPrice(amount: number): string {
  if (amount < 1000) return `${amount.toLocaleString('vi-VN')}đ`;
  const thousands = Math.round((amount / 1000) * 10) / 10;
  return `${thousands.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}K`;
}

/** Thời điểm hiện tại, tự cập nhật theo chu kỳ (mặc định 30 giây). */
export function useNowTick(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return nowMs;
}
