import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { isEventFromToastViewport } from '@/components/ui/toast';
import { cn } from '@/utils/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    {
      className,
      align = 'center',
      sideOffset = 4,
      onPointerDownOutside,
      onInteractOutside,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none',
          className,
        )}
        onPointerDownOutside={(event) => {
          if (isEventFromToastViewport(event)) {
            event.preventDefault();
            return;
          }
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (isEventFromToastViewport(event)) {
            event.preventDefault();
            return;
          }
          onInteractOutside?.(event);
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
