import * as React from 'react';
import { getStoreInitials } from '@/hooks/use-store-settings';
import { cn } from '@/utils/cn';

export interface StoreBrandLogoProps {
  src: string | null | undefined;
  storeName: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  testId?: string;
}

export function StoreBrandLogo({
  src,
  storeName,
  alt,
  className,
  imgClassName,
  fallbackClassName,
  testId,
}: StoreBrandLogoProps) {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  const showImage = Boolean(src) && !hasError;

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 shadow-sm',
        showImage ? 'bg-card' : 'bg-primary text-primary-foreground font-bold',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt ?? `Logo ${storeName}`}
          onError={() => setHasError(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <span className={cn('select-none leading-none', fallbackClassName)}>
          {getStoreInitials(storeName)}
        </span>
      )}
    </div>
  );
}
