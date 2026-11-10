import * as React from 'react';
import { useBlocker } from 'react-router-dom';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function useUnsavedChangesGuard(isDirty: boolean) {
  // Layer 1: browser beforeunload
  React.useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Layer 2: React Router navigation blocker
  let blocker: ReturnType<typeof useBlocker>;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    blocker = useBlocker(isDirty);
  } catch {
    blocker = {
      state: 'unblocked',
      reset: undefined,
      proceed: undefined,
      location: undefined,
    } as unknown as ReturnType<typeof useBlocker>;
  }

  return blocker;
}

export interface UnsavedChangesDialogProps {
  blocker: ReturnType<typeof useBlocker>;
}

export function UnsavedChangesDialog({ blocker }: UnsavedChangesDialogProps) {
  if (blocker.state !== 'blocked') return null;

  return (
    <Dialog open onOpenChange={() => blocker.reset?.()}>
      <DialogContent data-testid="unsaved-changes-dialog">
        <DialogHeader>
          <DialogTitle>Thay đổi chưa được lưu</DialogTitle>
          <DialogDescription>
            Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="font-semibold active:scale-[0.98] transition-transform select-none"
            data-testid="unsaved-stay-btn"
            onClick={() => blocker.reset?.()}
          >
            Huỷ bỏ &amp; Ở lại
          </Button>
          <Button
            variant="destructive"
            className="font-semibold active:scale-[0.98] transition-transform select-none shadow-xs"
            data-testid="unsaved-leave-btn"
            onClick={() => blocker.proceed?.()}
          >
            Rời đi không lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
