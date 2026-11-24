import * as React from 'react';

import { cn } from '@/utils/cn';

export interface TruncatedTextWithTooltipProps {
  text?: string | null;
  fallback?: string;
  className?: string;
  /** Cho phép xuống dòng tự nhiên trên Mobile (< 768px) thay vì cắt "..." */
  wrapOnMobile?: boolean;
  /** Cho phép chạm để mở rộng nội dung đầy đủ khi bị cắt (hỗ trợ thiết bị cảm ứng không có hover) */
  expandableOnTouch?: boolean;
}

export function TruncatedTextWithTooltip({
  text,
  fallback = '—',
  className,
  wrapOnMobile = false,
  expandableOnTouch = true,
}: TruncatedTextWithTooltipProps) {
  const spanRef = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const displayValue = text?.trim() ? text.trim() : fallback;
  const hasRealContent = Boolean(text?.trim());

  React.useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el || !hasRealContent || expanded) {
      if (!expanded) setIsTruncated(false);
      return;
    }

    const measure = () => {
      setIsTruncated(el.scrollWidth > el.clientWidth + 1);
    };

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [displayValue, hasRealContent, expanded]);

  const canToggle = expandableOnTouch && hasRealContent && (isTruncated || expanded);

  return (
    <span
      ref={spanRef}
      title={isTruncated && hasRealContent && !expanded ? displayValue : undefined}
      role={canToggle ? 'button' : undefined}
      tabIndex={canToggle ? 0 : undefined}
      aria-expanded={canToggle ? expanded : undefined}
      onClick={
        canToggle
          ? (e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }
          : undefined
      }
      onKeyDown={
        canToggle
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }
            }
          : undefined
      }
      className={cn(
        'block w-full',
        expanded
          ? 'whitespace-normal break-words leading-snug'
          : wrapOnMobile
            ? 'whitespace-normal break-words md:truncate'
            : 'truncate',
        canToggle && 'cursor-pointer underline decoration-dotted decoration-muted-foreground/50 underline-offset-2',
        hasRealContent ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {displayValue}
    </span>
  );
}
