import * as React from 'react';

import { cn } from '@/utils/cn';

export interface TruncatedTextWithTooltipProps {
  text?: string | null;
  fallback?: string;
  className?: string;
}

export function TruncatedTextWithTooltip({
  text,
  fallback = '—',
  className,
}: TruncatedTextWithTooltipProps) {
  const spanRef = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  const displayValue = text?.trim() ? text.trim() : fallback;
  const hasRealContent = Boolean(text?.trim());

  React.useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el || !hasRealContent) {
      setIsTruncated(false);
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
  }, [displayValue, hasRealContent]);

  return (
    <span
      ref={spanRef}
      title={isTruncated && hasRealContent ? displayValue : undefined}
      className={cn(
        'block w-full truncate',
        hasRealContent ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {displayValue}
    </span>
  );
}
