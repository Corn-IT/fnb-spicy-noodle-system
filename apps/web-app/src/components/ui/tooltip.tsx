import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/utils/cn';

export interface TooltipProps {
  content?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Portal tooltip that still triggers when wrapping disabled buttons (`pointer-events-none`)
 * and flips/clamps within viewport bounds inside clipped tables or drawers.
 */
export function Tooltip({ content, disabled = false, children, className }: TooltipProps) {
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const hasContent = Boolean(content);

  const updatePosition = React.useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return;

    const rect = triggerEl.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 220;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 40;
    const margin = 10;

    const placement: 'top' | 'bottom' =
      rect.top >= tooltipHeight + margin + 8 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;

    const idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const maxLeft = Math.max(margin, window.innerWidth - tooltipWidth - margin);
    const left = Math.min(Math.max(margin, idealLeft), maxLeft);

    setCoords({ top, left, placement });
  }, []);

  React.useLayoutEffect(() => {
    if (!open || !hasContent) return;
    updatePosition();
  }, [open, hasContent, content, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!hasContent) {
    return <>{children}</>;
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={(e) => {
          try {
            if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) {
              setOpen(true);
            }
          } catch {
            // Ignore unsupported :focus-visible selectors
          }
        }}
        onBlur={() => setOpen(false)}
        onClick={() => {
          if (!disabled) setOpen(false);
        }}
        className={cn(
          'inline-flex items-center',
          disabled && 'cursor-not-allowed',
          className,
        )}
      >
        {children}
      </span>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipRef}
              role="tooltip"
              style={{
                position: 'fixed',
                top: coords?.top ?? -9999,
                left: coords?.left ?? -9999,
                transform:
                  coords?.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
              }}
              className="pointer-events-none z-[70] max-w-[260px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-popover-foreground shadow-lg"
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
