import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { isEventFromToastViewport } from '@/components/ui/toast';
import { cn } from '@/utils/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  closeLabel?: string;
  hideCloseButton?: boolean;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      closeLabel,
      hideCloseButton = false,
      onPointerDownOutside,
      onInteractOutside,
      ...props
    },
    ref,
  ) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid grid-cols-1 max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg touch-ui:min-w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-3.5 sm:gap-4 overflow-x-hidden overflow-y-auto rounded-xl border bg-background p-3.5 sm:p-6 shadow-xl',
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
      >
      {children}
      {!hideCloseButton ? (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-2.5 top-2.5 sm:right-4 sm:top-4 inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
            closeLabel
              ? 'h-9 sm:h-8 border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground'
              : 'h-10 w-10 sm:h-8 sm:w-8 opacity-75 hover:bg-accent hover:opacity-100 touch-ui:h-11 touch-ui:w-11 touch-ui:right-2 touch-ui:top-2',
          )}
          aria-label={closeLabel ?? 'Đóng hộp thoại'}
        >
          {closeLabel ? <span>{closeLabel}</span> : <X className="h-4 w-4" />}
        </DialogPrimitive.Close>
      ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 pr-8 text-center sm:text-left', className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-snug tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
