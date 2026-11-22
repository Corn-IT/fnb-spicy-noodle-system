import {
  cloneDefaultQrCardSettings,
  QR_CARD_DEFAULTS,
  resolveQrCardDisplay,
  type QrCardSettings,
} from '@fnb/shared';
import {
  AlertTriangle,
  Lock,
  Printer,
  QrCode,
  RotateCcw,
  ShoppingBag,
  Utensils,
} from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';
import { isLocalhostOrPrivateHost } from '@/utils/qr-export';
import { generateOfflineQrDataUrl } from '@/utils/qr-svg';

const QR_CARD_COLOR_PRESETS = [
  { hex: '#EA580C', label: 'Cam Đậm (Mặc định)' },
  { hex: '#E11D48', label: 'Đỏ Hoa Hồng' },
  { hex: '#059669', label: 'Xanh Ngọc' },
  { hex: '#2563EB', label: 'Xanh Cobalt' },
  { hex: '#0F172A', label: 'Đen Slate' },
] as const;

export interface QrCardCustomizerProps {
  value: QrCardSettings;
  onChange: (next: QrCardSettings) => void;
  storeName: string;
  qrStoreName: string;
  onChangeQrStoreName?: (nextQrStoreName: string) => void;
  brandColor: string;
  logoUrl: string | null;
  disabled?: boolean;
  compact?: boolean;
  sampleOrigin?: string;
}

export function QrCardCustomizer({
  value,
  onChange,
  storeName,
  qrStoreName,
  onChangeQrStoreName,
  brandColor,
  logoUrl,
  disabled = false,
  compact = false,
  sampleOrigin,
}: QrCardCustomizerProps) {
  const [previewScope, setPreviewScope] = React.useState<'table' | 'takeaway'>('table');
  const [previewFormat, setPreviewFormat] = React.useState<'png' | 'thermal'>('png');
  const [sampleQrDataUrl, setSampleQrDataUrl] = React.useState<string>('');

  const resolvedOrigin = React.useMemo(() => {
    if (sampleOrigin) return sampleOrigin;
    return typeof window !== 'undefined' ? window.location.origin : 'https://pos.local';
  }, [sampleOrigin]);

  const isLocalHost = React.useMemo(
    () => isLocalhostOrPrivateHost(resolvedOrigin),
    [resolvedOrigin],
  );

  const sampleToken = previewScope === 'table' ? 'ban01-zry8' : 'mangve-qpy2';
  const sampleUrl = `${resolvedOrigin}/q/${sampleToken}`;
  const cleanDisplayUrl = sampleUrl.replace(/^https?:\/\//i, '');

  const resolvedDisplay = React.useMemo(
    () =>
      resolveQrCardDisplay({
        storeName,
        qr: {
          storeName: qrStoreName,
          subtitle: '',
          welcomeMessage: '',
          theme: 'system',
        },
        qrCard: value,
      }),
    [storeName, qrStoreName, value],
  );

  React.useEffect(() => {
    let active = true;
    void generateOfflineQrDataUrl(sampleUrl)
      .then((url) => {
        if (active) setSampleQrDataUrl(url);
      })
      .catch(() => {
        if (active) setSampleQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [sampleUrl]);

  const updateField = <K extends keyof QrCardSettings>(field: K, fieldValue: QrCardSettings[K]) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  const normalizedBrandHex = /^#[0-9a-fA-F]{6}$/.test(brandColor.trim())
    ? brandColor.trim().toUpperCase()
    : QR_CARD_DEFAULTS.accentColor;

  const previewHeadline =
    previewScope === 'table' ? resolvedDisplay.tableHeadline : resolvedDisplay.takeawayHeadline;
  const previewTitle = previewScope === 'table' ? 'Bàn 01' : resolvedDisplay.takeawayTitle;
  const previewSubtitle =
    previewScope === 'table' ? resolvedDisplay.tableSubtitle : resolvedDisplay.takeawaySubtitle;

  return (
    <div
      data-testid="qr-card-customizer"
      className={cn(
        'grid grid-cols-1 gap-5',
        compact ? 'lg:grid-cols-[minmax(0,1.2fr)_290px]' : 'xl:grid-cols-[minmax(0,1.25fr)_320px]',
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-900 dark:text-sky-200">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            <span>
              <strong>Link /q/&lt;token&gt;</strong>, hình mã QR và tên bàn vật lý được{' '}
              <strong>khoá tự động</strong> để tránh sai đường dẫn khi in dán.
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="qr-card-reset-default-btn"
            disabled={disabled}
            onClick={() => onChange(cloneDefaultQrCardSettings())}
            className="h-7 gap-1 px-2 text-xs shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Khôi phục mặc định</span>
          </Button>
        </div>

        {onChangeQrStoreName ? (
          <div className="space-y-1">
            <label htmlFor="qr-card-store-name-input" className="text-xs font-semibold text-foreground">
              Tên quán trên Thẻ & Trang QR (tối đa 60 ký tự)
            </label>
            <Input
              id="qr-card-store-name-input"
              data-testid="input-qr-card-store-name"
              maxLength={60}
              disabled={disabled}
              value={qrStoreName}
              onChange={(e) => onChangeQrStoreName(e.target.value)}
              placeholder={`Mặc định dùng: ${storeName || 'Tên cửa hàng'}`}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="qr-card-table-subtitle" className="text-xs font-semibold text-foreground">
              Phụ đề trên Thẻ Tại bàn (PNG / Preview)
            </label>
            <Input
              id="qr-card-table-subtitle"
              data-testid="input-qr-card-table-subtitle"
              maxLength={120}
              disabled={disabled}
              value={value.tableSubtitle}
              onChange={(e) => updateField('tableSubtitle', e.target.value)}
              placeholder={QR_CARD_DEFAULTS.tableSubtitle}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="qr-card-table-headline" className="text-xs font-semibold text-foreground">
              Tiêu đề Phiếu nhiệt 80mm (Tại bàn)
            </label>
            <Input
              id="qr-card-table-headline"
              data-testid="input-qr-card-table-headline"
              maxLength={60}
              disabled={disabled}
              value={value.tableHeadline}
              onChange={(e) => updateField('tableHeadline', e.target.value)}
              placeholder={QR_CARD_DEFAULTS.tableHeadline}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="qr-card-takeaway-title" className="text-xs font-semibold text-foreground">
              Tên Thẻ Mang về
            </label>
            <Input
              id="qr-card-takeaway-title"
              data-testid="input-qr-card-takeaway-title"
              maxLength={60}
              disabled={disabled}
              value={value.takeawayTitle}
              onChange={(e) => updateField('takeawayTitle', e.target.value)}
              placeholder={QR_CARD_DEFAULTS.takeawayTitle}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="qr-card-takeaway-subtitle" className="text-xs font-semibold text-foreground">
              Phụ đề Mang về
            </label>
            <Input
              id="qr-card-takeaway-subtitle"
              data-testid="input-qr-card-takeaway-subtitle"
              maxLength={120}
              disabled={disabled}
              value={value.takeawaySubtitle}
              onChange={(e) => updateField('takeawaySubtitle', e.target.value)}
              placeholder={QR_CARD_DEFAULTS.takeawaySubtitle}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="qr-card-takeaway-headline" className="text-xs font-semibold text-foreground">
              Tiêu đề in 80mm (Mang về)
            </label>
            <Input
              id="qr-card-takeaway-headline"
              data-testid="input-qr-card-takeaway-headline"
              maxLength={60}
              disabled={disabled}
              value={value.takeawayHeadline}
              onChange={(e) => updateField('takeawayHeadline', e.target.value)}
              placeholder={QR_CARD_DEFAULTS.takeawayHeadline}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="qr-card-footer-text" className="text-xs font-semibold text-foreground">
            Dòng hướng dẫn chân Thẻ & Phiếu in (tối đa 120 ký tự)
          </label>
          <Input
            id="qr-card-footer-text"
            data-testid="input-qr-card-footer-text"
            maxLength={120}
            disabled={disabled}
            value={value.footerText}
            onChange={(e) => updateField('footerText', e.target.value)}
            placeholder={QR_CARD_DEFAULTS.footerText}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Màu viền nhấn Thẻ ảnh PNG</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              data-testid="qr-card-use-brand-color-btn"
              onClick={() => updateField('accentColor', normalizedBrandHex)}
              className="h-6 px-2 text-[11px]"
            >
              Theo màu thương hiệu ({normalizedBrandHex})
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {QR_CARD_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                disabled={disabled}
                title={preset.label}
                onClick={() => updateField('accentColor', preset.hex)}
                className={cn(
                  'h-6 w-6 rounded-full border-2 transition-transform hover:scale-105 disabled:opacity-50',
                  value.accentColor.toUpperCase() === preset.hex
                    ? 'border-foreground ring-2 ring-primary/40'
                    : 'border-white/80 dark:border-neutral-700',
                )}
                style={{ backgroundColor: preset.hex }}
              />
            ))}
            <input
              type="color"
              aria-label="Chọn màu thẻ QR"
              disabled={disabled}
              value={/^#[0-9a-fA-F]{6}$/.test(value.accentColor) ? value.accentColor : '#EA580C'}
              onChange={(e) => updateField('accentColor', e.target.value.toUpperCase())}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5 disabled:opacity-50"
            />
            <Input
              data-testid="input-qr-card-accent-color"
              maxLength={7}
              disabled={disabled}
              value={value.accentColor}
              onChange={(e) => updateField('accentColor', e.target.value)}
              className="h-7 w-24 font-mono text-xs uppercase"
              placeholder="#EA580C"
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <label className="flex items-start gap-2.5 text-xs cursor-pointer select-none">
            <Checkbox
              id="qr-card-show-link-checkbox"
              data-testid="checkbox-qr-card-show-link"
              checked={value.showLinkText}
              disabled={disabled}
              onCheckedChange={(checked) => updateField('showLinkText', checked === true)}
              className="mt-0.5"
            />
            <span>
              <strong className="block text-foreground">
                Hiển thị đường link /q/&lt;token&gt; bên dưới mã QR
              </strong>
              <span className="text-muted-foreground">
                Giúp khách gõ tay vào trình duyệt nếu camera điện thoại không quét được.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-xs cursor-pointer select-none">
            <Checkbox
              id="qr-card-show-logo-checkbox"
              data-testid="checkbox-qr-card-show-logo"
              checked={value.showLogo}
              disabled={disabled}
              onCheckedChange={(checked) => updateField('showLogo', checked === true)}
              className="mt-0.5"
            />
            <span>
              <strong className="block text-foreground">
                Hiển thị Logo ở đầu Thẻ & Phiếu in QR
              </strong>
              <span className="text-muted-foreground">
                Ưu tiên Logo trang QR, fallback sang Logo chính.{' '}
                {!logoUrl ? (
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    (Quán chưa tải Logo lên ở tab Logo & Favicon)
                  </span>
                ) : null}
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Live Preview Panel */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/25 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setPreviewScope('table')}
              data-testid="qr-preview-scope-table"
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                previewScope === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Utensils className="h-3 w-3" />
              <span>Bàn 01</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewScope('takeaway')}
              data-testid="qr-preview-scope-takeaway"
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                previewScope === 'takeaway'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ShoppingBag className="h-3 w-3" />
              <span>Mang về</span>
            </button>
          </div>

          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setPreviewFormat('png')}
              data-testid="qr-preview-format-png"
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                previewFormat === 'png'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <QrCode className="h-3 w-3" />
              <span>Thẻ PNG</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewFormat('thermal')}
              data-testid="qr-preview-format-thermal"
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                previewFormat === 'thermal'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Printer className="h-3 w-3" />
              <span>Phiếu 80mm</span>
            </button>
          </div>
        </div>

        {previewFormat === 'png' ? (
          <div
            data-testid="qr-card-live-preview-png"
            className="mx-auto flex w-full max-w-[248px] flex-col items-center rounded-lg border-2 border-slate-200 bg-white px-4 pb-4 pt-0 text-center text-slate-900 shadow-xs overflow-hidden"
          >
            <div
              className="-mx-4 mb-3 h-2 w-[calc(100%+2rem)]"
              style={{ backgroundColor: resolvedDisplay.accentColor }}
            />
            {resolvedDisplay.showLogo && logoUrl ? (
              <img
                src={logoUrl}
                alt={`Logo ${resolvedDisplay.storeName}`}
                data-testid="qr-preview-logo-img"
                className="mb-1.5 h-8 w-8 object-contain"
              />
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 line-clamp-1">
              {resolvedDisplay.storeName.toUpperCase()}
            </p>
            <p className="mt-1 text-lg font-extrabold leading-tight text-slate-900 line-clamp-1">
              {previewTitle}
            </p>
            <p
              className="mt-1 text-[11px] font-semibold leading-snug line-clamp-2"
              style={{ color: resolvedDisplay.accentColor }}
            >
              {previewSubtitle}
            </p>
            <div className="my-2.5 rounded border border-slate-300 bg-white p-1.5">
              {sampleQrDataUrl ? (
                <img
                  src={sampleQrDataUrl}
                  alt="Xem trước mã QR"
                  className="h-32 w-32 object-contain"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center text-[10px] text-slate-400">
                  Đang tạo QR...
                </div>
              )}
            </div>
            <p className="text-[10.5px] font-semibold text-slate-700 line-clamp-2">
              {resolvedDisplay.footerText}
            </p>
            {resolvedDisplay.showLinkText ? (
              <p
                data-testid="qr-preview-link-text"
                className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[9.5px] font-semibold text-slate-600 break-all"
              >
                <Lock className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                <span>{cleanDisplayUrl}</span>
              </p>
            ) : null}
          </div>
        ) : (
          <div
            data-testid="qr-card-live-preview-thermal"
            className="mx-auto flex w-full max-w-[248px] flex-col items-center rounded-lg border border-dashed border-neutral-400 bg-white p-3.5 text-center font-mono text-black shadow-xs"
          >
            {resolvedDisplay.showLogo && logoUrl ? (
              <img
                src={logoUrl}
                alt={`Logo ${resolvedDisplay.storeName}`}
                className="mb-1 h-8 w-8 object-contain grayscale"
              />
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-wide">
              {resolvedDisplay.storeName}
            </p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider">
              {previewHeadline}
            </p>
            <p className="my-1 text-base font-extrabold uppercase">{previewTitle}</p>
            <p className="text-[9.5px] text-neutral-700">{previewSubtitle}</p>
            <div className="my-2 rounded border border-black p-1">
              {sampleQrDataUrl ? (
                <img
                  src={sampleQrDataUrl}
                  alt="Xem trước mã QR 80mm"
                  className="h-28 w-28 object-contain"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center text-[10px] text-neutral-500">
                  QR...
                </div>
              )}
            </div>
            {resolvedDisplay.showLinkText ? (
              <p
                data-testid="qr-preview-thermal-link-text"
                className="break-all text-[8.5px] text-neutral-700"
              >
                {sampleUrl}
              </p>
            ) : null}
            <div className="mt-1.5 w-full border-t border-dashed border-black pt-1.5 text-[9.5px] font-semibold">
              {resolvedDisplay.footerText}
            </div>
          </div>
        )}

        {isLocalHost ? (
          <div
            data-testid="qr-localhost-origin-warning"
            className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10.5px] leading-snug text-amber-800 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Đang dùng địa chỉ nội bộ (<strong>{resolvedOrigin}</strong>) — hãy mở POS qua tên miền
              chính thức khi in mã QR dán bàn.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
