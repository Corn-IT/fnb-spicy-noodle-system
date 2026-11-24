import { cn } from '@/utils/cn';

import { DelayedRender } from './delayed-render';
import { Skeleton } from './skeleton';

export type PageSkeletonVariant = 'pos' | 'table' | 'matrix' | 'form' | 'qr';

export interface PageSkeletonProps {
  variant?: PageSkeletonVariant;
  label?: string;
  className?: string;
}

export function PageSkeleton({
  variant = 'table',
  label = 'Đang tải giao diện...',
  className,
}: PageSkeletonProps) {
  if (variant === 'pos') {
    return (
      <div
        role="status"
        aria-label={label}
        data-testid="page-skeleton-pos"
        className={cn('grid h-full min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12', className)}
      >
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 flex-1 min-w-[140px]" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
            {Array.from({ length: 15 }).map((_, idx) => (
              <Skeleton key={idx} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 lg:col-span-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-7 w-24" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="space-y-2 border-t pt-3">
            <Skeleton className="h-5 w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === 'matrix') {
    return (
      <div
        role="status"
        aria-label={label}
        data-testid="page-skeleton-matrix"
        className={cn('space-y-4', className)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-24" />
        </div>
        <ScheduleMatrixSkeleton />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div
        role="status"
        aria-label={label}
        data-testid="page-skeleton-form"
        className={cn('space-y-5', className)}
      >
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, cardIdx) => (
            <div key={cardIdx} className="space-y-4 rounded-xl border bg-card p-5">
              <Skeleton className="h-5 w-40" />
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
              <Skeleton className="h-9 w-32" />
            </div>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === 'qr') {
    return (
      <div
        role="status"
        aria-label={label}
        data-testid="page-skeleton-qr"
        className={cn('mx-auto min-h-screen w-full max-w-md space-y-4 bg-background p-4', className)}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-8 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <div
          data-testid="page-skeleton-qr-grid"
          className="grid grid-cols-2 gap-2 sm:gap-2.5"
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between rounded-xl border bg-card p-2.5 sm:p-3"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={label}
      data-testid="page-skeleton-table"
      className={cn('space-y-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-60 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-9 w-64 max-w-full" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-5 gap-3 border-b bg-muted/60 px-3 py-3">
          {Array.from({ length: 5 }).map((_, colIdx) => (
            <Skeleton key={colIdx} className="h-4 w-3/4" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-5 gap-3 px-3 py-3.5">
              {Array.from({ length: 5 }).map((__, colIdx) => (
                <Skeleton
                  key={colIdx}
                  className={cn('h-4', colIdx === 0 ? 'w-1/2' : 'w-4/5')}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export interface DelayedPageFallbackProps extends PageSkeletonProps {
  delayMs?: number;
}

export function DelayedPageFallback({
  delayMs = 0,
  ...props
}: DelayedPageFallbackProps) {
  return (
    <DelayedRender delayMs={delayMs} trackSuspense>
      <PageSkeleton {...props} />
    </DelayedRender>
  );
}

export function ScheduleMatrixSkeleton() {
  return (
    <div
      data-testid="schedule-matrix-skeleton"
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="grid grid-cols-8 gap-2 border-b bg-muted/60 px-3 py-3">
        {Array.from({ length: 8 }).map((_, idx) => (
          <Skeleton key={idx} className="h-4 w-full" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 2 }).map((_, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-8 gap-2 px-3 py-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            {Array.from({ length: 7 }).map((__, colIdx) => (
              <Skeleton key={colIdx} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditTimelineSkeleton() {
  return (
    <div className="space-y-2.5 py-2" data-testid="audit-timeline-skeleton">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <Skeleton className="h-3.5 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function ModalDetailSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-5" data-testid="modal-detail-skeleton">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-2.5 rounded-xl border bg-card p-3">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 py-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DrawerTableSkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="drawer-table-skeleton">
      <div className="grid grid-cols-5 gap-2 bg-muted/60 px-3 py-2.5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <Skeleton key={idx} className="h-3.5 w-4/5" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-5 gap-2 px-3 py-3">
          {Array.from({ length: 5 }).map((__, colIdx) => (
            <Skeleton key={colIdx} className="h-3.5 w-4/5" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function QrSecurityFormSkeleton() {
  return (
    <div className="space-y-4 py-2" data-testid="qr-security-skeleton">
      <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3.5 w-full" />
      </div>
      {Array.from({ length: 2 }).map((_, idx) => (
        <div key={idx} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
