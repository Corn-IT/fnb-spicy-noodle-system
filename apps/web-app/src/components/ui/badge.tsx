import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/cn';

export const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold leading-normal transition-colors focus:outline-none focus:ring-2 focus:ring-ring shrink-0 whitespace-nowrap text-center select-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-xs',
        secondary: 'border-border/70 bg-secondary text-secondary-foreground',
        destructive:
          'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700/70 dark:bg-rose-950/90 dark:text-rose-200',
        outline: 'text-foreground border-border bg-background/60',
        success:
          'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/90 dark:text-emerald-200',
        warning:
          'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/90 dark:text-amber-200',
        info: 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700/70 dark:bg-sky-950/90 dark:text-sky-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
