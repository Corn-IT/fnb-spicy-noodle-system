import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import * as React from 'react';
import { create } from 'zustand';

import { cn } from '@/utils/cn';

export type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

export const DEFAULT_TOAST_DURATION_MS = 5000;
export const MAX_VISIBLE_TOASTS = 4;

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      toasts: [
        ...state.toasts.slice(-(MAX_VISIBLE_TOASTS - 1)),
        { variant: 'default', duration: DEFAULT_TOAST_DURATION_MS, ...toast, id },
      ],
    }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));

export function toast(payload: Omit<ToastMessage, 'id'>): string {
  return useToastStore.getState().addToast(payload);
}

function getToastIcon(variant: ToastVariant | undefined) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case 'destructive':
      return <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />;
    case 'info':
    default:
      return <Info className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />;
  }
}

export function Toaster() {
  const { toasts, dismissToast } = useToastStore();
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  React.useEffect(() => {
    const activeToastIds = new Set(toasts.map((item) => item.id));

    for (const [id, timer] of timers.current) {
      if (!activeToastIds.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }

    for (const item of toasts) {
      if (!timers.current.has(item.id)) {
        const durationMs =
          typeof item.duration === 'number' && item.duration > 0
            ? item.duration
            : DEFAULT_TOAST_DURATION_MS;
        timers.current.set(
          item.id,
          setTimeout(() => dismissToast(item.id), durationMs),
        );
      }
    }
  }, [toasts, dismissToast]);

  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      data-testid="toast-viewport-top-right"
      className="pointer-events-none fixed right-4 top-16 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="alert"
          className={cn(
            'pointer-events-none flex items-start justify-between gap-3 rounded-xl border border-l-4 p-3.5 shadow-xl backdrop-blur-md transition-all',
            item.variant === 'destructive' &&
              'border-rose-300 border-l-rose-600 bg-rose-50/95 text-rose-950 dark:border-rose-800/80 dark:border-l-rose-500 dark:bg-rose-950/95 dark:text-rose-50',
            item.variant === 'success' &&
              'border-emerald-300 border-l-emerald-600 bg-emerald-50/95 text-emerald-950 dark:border-emerald-800/80 dark:border-l-emerald-500 dark:bg-emerald-950/95 dark:text-emerald-50',
            item.variant === 'warning' &&
              'border-amber-300 border-l-amber-600 bg-amber-50/95 text-amber-950 dark:border-amber-800/80 dark:border-l-amber-500 dark:bg-amber-950/95 dark:text-amber-50',
            (item.variant === 'info' || !item.variant || item.variant === 'default') &&
              'border-sky-300 border-l-sky-600 bg-card/95 text-card-foreground dark:border-sky-800/80 dark:border-l-sky-400',
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <div className="mt-0.5 shrink-0">{getToastIcon(item.variant)}</div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-bold leading-snug">{item.title}</p>
              {item.description ? (
                <p className="text-xs font-medium leading-relaxed opacity-90">
                  {item.description}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            className="pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4 shrink-0" />
          </button>
        </div>
      ))}
    </div>
  );
}
