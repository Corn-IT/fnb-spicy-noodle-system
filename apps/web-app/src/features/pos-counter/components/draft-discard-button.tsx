import * as React from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DraftDiscardButton({ disabled, pending, onDiscard, testId }: {
  disabled: boolean;
  pending: boolean;
  onDiscard: () => Promise<boolean>;
  testId: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" data-testid={testId} disabled={disabled || pending}
        className="h-11 w-full text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Bỏ toàn bộ giỏ
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bỏ toàn bộ giỏ chưa gửi?</DialogTitle>
            <DialogDescription>Toàn bộ món trong giỏ và giỏ lưu tạm này sẽ bị xóa. Bạn có muốn tiếp tục?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-3 sm:space-x-0">
            <Button type="button" variant="outline" className="h-12" disabled={pending} onClick={() => setOpen(false)}>Quay lại</Button>
            <Button type="button" variant="destructive" className="h-12" data-testid="confirm-discard-draft" disabled={pending}
              onClick={async () => { if (await onDiscard()) setOpen(false); }}>
              {pending ? 'Đang xóa…' : 'Bỏ toàn bộ giỏ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
