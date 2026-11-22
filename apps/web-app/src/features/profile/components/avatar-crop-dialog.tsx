import { type UploadAvatarInput } from '@fnb/shared';
import { Move, RotateCcw, Upload, ZoomIn } from 'lucide-react';
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

const CROP_FRAME_SIZE = 240;
const OUTPUT_AVATAR_SIZE = 256;

export interface AvatarCropDialogProps {
  file: File | null;
  onClose: () => void;
  onConfirm: (payload: UploadAvatarInput) => Promise<void>;
  isPending?: boolean;
}

interface ImageDimensions {
  width: number;
  height: number;
}

function clampOffset(
  offset: { x: number; y: number },
  dims: ImageDimensions,
  zoom: number,
): { x: number; y: number } {
  if (dims.width <= 0 || dims.height <= 0) {
    return { x: 0, y: 0 };
  }
  const baseScale = CROP_FRAME_SIZE / Math.min(dims.width, dims.height);
  const renderedWidth = dims.width * baseScale * zoom;
  const renderedHeight = dims.height * baseScale * zoom;
  const maxX = Math.max(0, (renderedWidth - CROP_FRAME_SIZE) / 2);
  const maxY = Math.max(0, (renderedHeight - CROP_FRAME_SIZE) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

function exportCroppedAvatarData(
  img: HTMLImageElement,
  dims: ImageDimensions,
  zoom: number,
  offset: { x: number; y: number },
): UploadAvatarInput {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_AVATAR_SIZE;
  canvas.height = OUTPUT_AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ xử lý ảnh Canvas.');
  }

  ctx.clearRect(0, 0, OUTPUT_AVATAR_SIZE, OUTPUT_AVATAR_SIZE);

  const baseScale = CROP_FRAME_SIZE / Math.min(dims.width, dims.height);
  const previewToOutput = OUTPUT_AVATAR_SIZE / CROP_FRAME_SIZE;
  const drawWidth = dims.width * baseScale * zoom * previewToOutput;
  const drawHeight = dims.height * baseScale * zoom * previewToOutput;
  const drawX = OUTPUT_AVATAR_SIZE / 2 - drawWidth / 2 + offset.x * previewToOutput;
  const drawY = OUTPUT_AVATAR_SIZE / 2 - drawHeight / 2 + offset.y * previewToOutput;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

  let dataUrl = canvas.toDataURL('image/webp', 0.88);
  let mime: UploadAvatarInput['mime'] = 'image/webp';
  if (!dataUrl.startsWith('data:image/webp;base64,')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    mime = 'image/jpeg';
  }

  const base64 = dataUrl.split(',')[1] ?? '';
  if (!base64) {
    throw new Error('Không thể xuất dữ liệu ảnh sau khi cắt.');
  }

  return { mime, base64 };
}

export function AvatarCropDialog({
  file,
  onClose,
  onConfirm,
  isPending = false,
}: AvatarCropDialogProps) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [dims, setDims] = React.useState<ImageDimensions | null>(null);
  const [zoom, setZoom] = React.useState<number>(1);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cropError, setCropError] = React.useState<string | null>(null);

  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const dragOriginRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  React.useEffect(() => {
    setCropError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDims(null);

    if (!file) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  const handleZoomChange = (nextZoom: number) => {
    setZoom(nextZoom);
    if (dims) {
      setOffset((prev) => clampOffset(prev, dims, nextZoom));
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dims || isPending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOriginRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOriginRef.current;
    if (!drag || !dims) return;
    const dx = event.clientX - drag.pointerX;
    const dy = event.clientY - drag.pointerY;
    setOffset(clampOffset({ x: drag.startX + dx, y: drag.startY + dy }, dims, zoom));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragOriginRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore if capture already released
      }
      dragOriginRef.current = null;
    }
  };

  const handleSave = async () => {
    if (!imgRef.current || !dims) {
      setCropError('Ảnh chưa tải xong, vui lòng đợi một chút.');
      return;
    }
    setCropError(null);
    try {
      const payload = exportCroppedAvatarData(imgRef.current, dims, zoom, offset);
      await onConfirm(payload);
    } catch (err) {
      setCropError(
        err instanceof Error ? err.message : 'Không thể cắt và tải ảnh đại diện lên.',
      );
    }
  };

  const baseScale = dims ? CROP_FRAME_SIZE / Math.min(dims.width, dims.height) : 1;
  const renderedWidth = dims ? dims.width * baseScale * zoom : CROP_FRAME_SIZE;
  const renderedHeight = dims ? dims.height * baseScale * zoom : CROP_FRAME_SIZE;

  return (
    <Dialog
      open={Boolean(file)}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="avatar-crop-dialog">
        <DialogHeader>
          <DialogTitle>Căn chỉnh Ảnh đại diện</DialogTitle>
          <DialogDescription>
            Kéo ảnh để căn giữa khuôn mặt trong vòng tròn và điều chỉnh độ phóng to phù hợp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-1">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ width: CROP_FRAME_SIZE, height: CROP_FRAME_SIZE }}
            className="relative select-none overflow-hidden rounded-full border-2 border-primary/50 bg-muted shadow-inner touch-none cursor-grab active:cursor-grabbing"
          >
            {objectUrl ? (
              <img
                ref={imgRef}
                src={objectUrl}
                alt="Xem trước ảnh cắt"
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setDims({
                    width: img.naturalWidth || CROP_FRAME_SIZE,
                    height: img.naturalHeight || CROP_FRAME_SIZE,
                  });
                }}
                onError={() => {
                  setCropError('Không đọc được tệp ảnh này. Vui lòng chọn ảnh PNG, JPEG hoặc WebP.');
                }}
                style={{
                  width: renderedWidth,
                  height: renderedHeight,
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 select-none"
              />
            ) : null}

            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-white/40" />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Move className="h-3.5 w-3.5 shrink-0" />
            <span>Kéo ảnh để di chuyển khung cắt</span>
          </div>

          <div className="w-full space-y-1.5 px-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <ZoomIn className="h-3.5 w-3.5" />
                Thu phóng
              </span>
              <span className="tabular-nums font-medium text-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Thu phóng ảnh đại diện"
              data-testid="avatar-crop-zoom-slider"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              disabled={isPending || !dims}
              onChange={(event) => handleZoomChange(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {cropError ? (
            <div
              role="alert"
              className="w-full rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300"
            >
              {cropError}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Đặt lại</span>
          </Button>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onClose}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              data-testid="avatar-crop-save-btn"
              disabled={isPending || !dims || Boolean(cropError)}
              onClick={() => void handleSave()}
              className="gap-1.5 font-semibold"
            >
              <Upload className="h-4 w-4" />
              <span>{isPending ? 'Đang tải lên...' : 'Lưu ảnh đại diện'}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
