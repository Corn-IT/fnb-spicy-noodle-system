import {
  HTTP_ERROR_CATALOG,
  type StoreMessagesMap,
  type SystemErrorCodeKey,
} from '@fnb/shared';
import * as React from 'react';

import { SystemErrorView } from '@/components/error-display/system-error-view';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

export interface ErrorGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customMessages?: StoreMessagesMap | null;
}

export function ErrorGalleryDialog({
  open,
  onOpenChange,
  customMessages,
}: ErrorGalleryDialogProps) {
  const [selectedKey, setSelectedKey] = React.useState<SystemErrorCodeKey>('403');
  const [audience, setAudience] = React.useState<'staff' | 'guest'>('staff');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="error-gallery-dialog"
        className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle>Xem trước Bộ màn hình Mã lỗi Hệ thống (18 mã)</DialogTitle>
          <DialogDescription>
            Kiểm tra trực quan lý do giải thích, hướng xử lý, Chi tiết kỹ thuật và nút quay lại ở
            chế độ Nhân viên & Khách quét QR. Mọi chỉnh sửa ở Tab Thông báo được phản ánh ngay tại đây.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Chọn mã lỗi">
              {HTTP_ERROR_CATALOG.map((entry) => {
                const isSelected = entry.key === selectedKey;
                return (
                  <Button
                    key={entry.key}
                    type="button"
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    data-testid={`error-gallery-chip-${entry.key}`}
                    onClick={() => setSelectedKey(entry.key)}
                    className={cn('h-8 px-2.5 font-mono text-xs')}
                  >
                    {entry.key}
                  </Button>
                );
              })}
            </div>

            <div className="inline-flex rounded-lg border bg-muted p-0.5">
              <Button
                type="button"
                size="sm"
                variant={audience === 'staff' ? 'default' : 'ghost'}
                data-testid="error-gallery-audience-staff"
                onClick={() => setAudience('staff')}
                className="h-7 px-3 text-xs"
              >
                Nhân viên POS
              </Button>
              <Button
                type="button"
                size="sm"
                variant={audience === 'guest' ? 'default' : 'ghost'}
                data-testid="error-gallery-audience-guest"
                onClick={() => setAudience('guest')}
                className="h-7 px-3 text-xs"
              >
                Khách QR (Mobile)
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-2 sm:p-4">
            <SystemErrorView
              variant={audience === 'guest' ? 'guest' : 'section'}
              statusKeyOverride={selectedKey}
              customMessages={customMessages}
              previewMode
              testId="error-gallery-preview-card"
              className="min-h-0"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
