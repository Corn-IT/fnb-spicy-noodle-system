import * as React from 'react';
import { useBlocker } from 'react-router-dom';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { clearPendingNavigation } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { useAppMessages } from '@/hooks/use-app-messages';

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
    blocker = useBlocker(isDirty);
  } catch {
    blocker = {
      state: 'unblocked',
      reset: undefined,
      proceed: undefined,
      location: undefined,
    } as unknown as ReturnType<typeof useBlocker>;
  }

  React.useEffect(() => {
    if (blocker.state === 'blocked') {
      clearPendingNavigation();
    }
  }, [blocker.state]);

  return blocker;
}

export interface UnsavedChangesDialogProps {
  blocker: ReturnType<typeof useBlocker>;
}

export function UnsavedChangesDialog({ blocker }: UnsavedChangesDialogProps) {
  const { resolveMessage } = useAppMessages();
  if (blocker.state !== 'blocked') return null;
  const unsavedCopy = resolveMessage('schedules.confirm.unsavedChanges');

  return (
    <Dialog open onOpenChange={() => blocker.reset?.()}>
      <DialogContent data-testid="unsaved-changes-dialog">
        <DialogHeader>
          <DialogTitle>{unsavedCopy.title}</DialogTitle>
          {unsavedCopy.description ? (
            <DialogDescription>{unsavedCopy.description}</DialogDescription>
          ) : null}
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
