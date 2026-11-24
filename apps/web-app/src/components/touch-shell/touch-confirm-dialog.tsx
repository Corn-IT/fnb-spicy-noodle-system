import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

export interface TouchConfirmRequest {
  title: string;
  description?: string;
  confirmLabel: string;
  tone?: 'default' | 'destructive';
  onConfirm: () => void;
}

export interface TouchConfirmDialogProps {
  request: TouchConfirmRequest | null;
  onClose: () => void;
}

/** Hộp xác nhận nút lớn, thay cho Popover xác nhận nhỏ của màn chuột. */
export function TouchConfirmDialog({ request, onClose }: TouchConfirmDialogProps) {
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent data-testid="touch-confirm-dialog" className="max-w-md gap-5 p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-bold">{request?.title}</DialogTitle>
          {request?.description ? (
            <DialogDescription className="text-base">{request.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-3 sm:space-x-0">
          <Button type="button" variant="outline" className="h-14 text-base" onClick={onClose}>
            Quay lại
          </Button>
          <Button
            type="button"
            data-testid="touch-confirm-accept"
            className={cn(
              'h-14 text-base font-bold',
              request?.tone === 'destructive' && 'bg-rose-600 text-white hover:bg-rose-700',
            )}
            onClick={() => {
              const action = request?.onConfirm;
              onClose();
              action?.();
            }}
          >
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useTouchConfirm() {
  const [request, setRequest] = React.useState<TouchConfirmRequest | null>(null);
  return {
    request,
    ask: setRequest,
    close: () => setRequest(null),
  };
}
