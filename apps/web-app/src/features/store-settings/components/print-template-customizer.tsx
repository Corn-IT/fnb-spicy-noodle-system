import {
  cloneDefaultPrintTemplates,
  THERMAL_FONT_OPTIONS,
  type ThermalFontFamily,
  PRINT_TEMPLATE_DEFAULTS,
  THERMAL_FONT_SIZE_PT_MAX,
  THERMAL_FONT_SIZE_PT_MIN,
  THERMAL_FONT_SIZE_PT_STEP,
  type PrintTemplateKey,
  type PrintTemplates,
  type PublicStoreSettingsResponse,
  type StoreSettings,
} from '@fnb/shared';
import { useQuery } from '@tanstack/react-query';
import { Lock, Minus, Plus, Printer, RotateCcw } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/utils/cn';
import { ReceiptPreviewPanel } from './receipt-preview-panel';

interface TemplateBlockField {
  key: string;
  label: string;
}

interface TemplateEditorMeta {
  key: PrintTemplateKey;
  tabLabel: string;
  description: string;
  titleLabel: string;
  titlePlaceholder: string;
  footerLabel: string;
  footerPlaceholder: string;
  footerHint?: string;
  supportsFontSize?: boolean;
  blocks: readonly TemplateBlockField[];
  lockedInvariants: readonly string[];
}

export const PRINT_TEMPLATE_TABS: readonly TemplateEditorMeta[] = [
  {
    key: 'official',
    tabLabel: 'Hoá đơn thanh toán',
    description: 'Xuất cho khách khi hoàn tất thanh toán (Cash / QR / Split).',
    titleLabel: 'Tiêu đề hoá đơn',
    titlePlaceholder: PRINT_TEMPLATE_DEFAULTS.official.title,
    footerLabel: 'Lời cảm ơn riêng cho Hoá đơn chính thức',
    footerPlaceholder: 'Để trống sẽ dùng lời cảm ơn chung phía trên',
    blocks: [
      { key: 'logo', label: 'Hiện logo đen trắng (nếu bật in logo chung)' },
      { key: 'address', label: 'Địa chỉ quán' },
      { key: 'phone', label: 'Số điện thoại / Hotline' },
      { key: 'orderCode', label: 'Số hoá đơn (Số HĐ)' },
      { key: 'cashier', label: 'Tên thu ngân' },
      { key: 'paymentBreakdown', label: 'Chi tiết Tiền mặt & Chuyển khoản QR' },
      { key: 'itemModifiers', label: 'Tuỳ chọn / Topping có giá dưới mỗi món' },
    ],
    lockedInvariants: ['Số bàn / Mã mang về', 'Danh sách món & SL', 'Tổng tiền thanh toán'],
  },
  {
    key: 'provisional',
    tabLabel: 'Tạm tính + VietQR',
    description: 'Phiếu kiểm món kèm mã VietQR động cho khách bàn đang phục vụ.',
    titleLabel: 'Tiêu đề phiếu tạm tính',
    titlePlaceholder: PRINT_TEMPLATE_DEFAULTS.provisional.title,
    footerLabel: 'Ghi chú riêng cho Phiếu tạm tính',
    footerPlaceholder: 'Để trống sẽ dùng lời cảm ơn chung phía trên',
    blocks: [
      { key: 'logo', label: 'Hiện logo đen trắng (nếu bật in logo chung)' },
      { key: 'address', label: 'Địa chỉ quán' },
      { key: 'phone', label: 'Số điện thoại / Hotline' },
      { key: 'orderCode', label: 'Mã hoá đơn (Mã HĐ)' },
      { key: 'cashier', label: 'Tên thu ngân' },
      { key: 'itemModifiers', label: 'Tuỳ chọn / Topping có giá dưới mỗi món' },
      { key: 'discountLine', label: 'Hiện dòng GIẢM GIÁ (0%)' },
      { key: 'bankInfo', label: 'Tên ngân hàng & STK phía trên mã QR' },
    ],
    lockedInvariants: [
      'Số bàn / Mang về & Trạng thái',
      'Danh sách món & Tổng thanh toán',
      'Ảnh VietQR & Nội dung CK (Invariant 4)',
    ],
  },
  {
    key: 'kitchen',
    tabLabel: 'Tách bếp (3 trạm)',
    description: 'Phiếu chế biến tách theo từng trạm Bếp Nấu, Bếp Chiên, Quầy Nước.',
    titleLabel: 'Nhãn tiêu đề phụ dưới tên trạm bếp',
    titlePlaceholder: 'Để trống mặc định không thêm dòng phụ',
    footerLabel: 'Ghi chú chân phiếu bếp',
    footerPlaceholder: 'VD: Kiểm tra kỹ độ cay trước khi ra món',
    supportsFontSize: true,
    blocks: [
      { key: 'stationLogo', label: 'Logo biểu tượng trạm bếp (SVG)' },
      { key: 'orderCode', label: 'Mã đơn hàng' },
      { key: 'time', label: 'Ngày giờ in phiếu' },
      { key: 'itemNotes', label: 'Ghi chú món & Ghi chú đơn hàng' },
    ],
    lockedInvariants: [
      'Tên trạm bếp thực (BẾP NẤU / CHIÊN / NƯỚC — Invariant 3)',
      'Số bàn / Mang về, Món, SL & Cấp độ cay',
      'Banner GỌI THÊM / ĐỔI BÀN / BẢN SAO',
    ],
  },
  {
    key: 'kitchenCancel',
    tabLabel: 'Báo huỷ món bếp',
    description: 'In khẩn xuống trạm bếp khi thu ngân huỷ món đã gửi chế biến.',
    titleLabel: 'Tiêu đề phiếu báo huỷ',
    titlePlaceholder: PRINT_TEMPLATE_DEFAULTS.kitchenCancel.title,
    footerLabel: 'Dòng nhắc nhở / Lý do ở cuối phiếu',
    footerPlaceholder: PRINT_TEMPLATE_DEFAULTS.kitchenCancel.footerNote,
    supportsFontSize: true,
    blocks: [
      { key: 'time', label: 'Thời gian báo huỷ' },
      { key: 'reason', label: 'Hiện dòng nhắc nhở ngưng chế biến cuối phiếu' },
    ],
    lockedInvariants: ['Tên trạm bếp', 'Số bàn', 'Tên món & Số lượng báo huỷ'],
  },
  {
    key: 'tableTransfer',
    tabLabel: 'Thông báo đổi bàn',
    description: 'Thông báo chuyển / gộp / hoán đổi bàn gửi các trạm bếp liên quan.',
    titleLabel: 'Tiêu đề thông báo đổi bàn',
    titlePlaceholder: PRINT_TEMPLATE_DEFAULTS.tableTransfer.title,
    footerLabel: 'Lời nhắc ở chân phiếu đổi bàn',
    footerPlaceholder: PRINT_TEMPLATE_DEFAULTS.tableTransfer.footerNote,
    footerHint: 'Hỗ trợ biến tự động: {fromTable} (bàn cũ), {toTable} (bàn mới).',
    blocks: [
      { key: 'time', label: 'Thời gian thao tác' },
      { key: 'cashier', label: 'Nhân viên thao tác đổi bàn' },
    ],
    lockedInvariants: [
      'Bàn cũ >>> BÀN X <<< → Bàn mới >>> BÀN Y <<<',
      'Trạm bếp bị ảnh hưởng & Mã đơn hàng',
    ],
  },
];

const FONT_SIZE_PRESETS = [6, 7, 8, 9, 10, 11, 12, 14, 16] as const;

interface MenuCategoryOption {
  id: number;
  name: string;
}

interface PrintTemplateCustomizerProps {
  draft: StoreSettings;
  livePreviewSettings: PublicStoreSettingsResponse;
  selectedTemplate: PrintTemplateKey;
  canUpdate: boolean;
  onSelectTemplate: (key: PrintTemplateKey) => void;
  onChangeReceipt: (updater: (prev: StoreSettings['receipt']) => StoreSettings['receipt']) => void;
  onChangePrintTemplates: (updater: (prev: PrintTemplates) => PrintTemplates) => void;
}

export function PrintTemplateCustomizer({
  draft,
  livePreviewSettings,
  selectedTemplate,
  canUpdate,
  onSelectTemplate,
  onChangeReceipt,
  onChangePrintTemplates,
}: PrintTemplateCustomizerProps) {
  const activeMeta =
    PRINT_TEMPLATE_TABS.find((tab) => tab.key === selectedTemplate) ?? PRINT_TEMPLATE_TABS[0];

  const activeTemplate = draft.printTemplates[selectedTemplate];
  const activeBlocks = activeTemplate.blocks as Record<string, boolean>;
  const activeFontSizePt = activeTemplate.fontSizePt;

  const [fontInputText, setFontInputText] = React.useState<string>(String(activeFontSizePt));
  const [fontClampWarning, setFontClampWarning] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFontInputText(String(activeFontSizePt));
  }, [activeFontSizePt, selectedTemplate]);

  React.useEffect(() => {
    setFontClampWarning(null);
  }, [selectedTemplate]);

  const categoriesQuery = useQuery<MenuCategoryOption[]>({
    queryKey: ['store-settings', 'menu-categories'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<unknown>('/api/v1/mdm/lookup', {
          params: { category: 'MENU_CATEGORY', limit: 100 },
        });
        if (Array.isArray(res)) {
          return res
            .filter((c): c is MenuCategoryOption => Boolean(c && typeof c === 'object' && 'id' in c && 'name' in c))
            .map((c) => ({ id: Number(c.id), name: String(c.name) }));
        }
        return [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const updateActiveField = (field: 'title' | 'footerNote', value: string) => {
    onChangePrintTemplates((prev) => ({
      ...prev,
      [selectedTemplate]: {
        ...prev[selectedTemplate],
        [field]: value,
      },
    }));
  };

  const commitFontSizePt = (rawNumber: number) => {
    if (!Number.isFinite(rawNumber)) {
      setFontInputText(String(activeFontSizePt));
      return;
    }
    let warning: string | null = null;
    let clamped = rawNumber;
    if (rawNumber < THERMAL_FONT_SIZE_PT_MIN) {
      clamped = THERMAL_FONT_SIZE_PT_MIN;
      warning = `Đã giới hạn về cỡ nhỏ nhất ${THERMAL_FONT_SIZE_PT_MIN}pt.`;
    } else if (rawNumber > THERMAL_FONT_SIZE_PT_MAX) {
      clamped = THERMAL_FONT_SIZE_PT_MAX;
      warning = `Đã giới hạn về cỡ tối đa ${THERMAL_FONT_SIZE_PT_MAX}pt để không vỡ bố cục giấy 80mm.`;
    }
    const stepped = Math.round(clamped * 2) / 2;
    setFontClampWarning(warning);
    setFontInputText(String(stepped));
    onChangePrintTemplates((prev) => ({
      ...prev,
      [selectedTemplate]: {
        ...prev[selectedTemplate],
        fontSizePt: stepped,
      },
    }));
  };

  const toggleKitchenPriceCategory = (categoryId: number, checked: boolean) => {
    onChangePrintTemplates((prev) => {
      const current = prev.kitchen.priceCategoryIds ?? [];
      const next = checked
        ? Array.from(new Set([...current, categoryId]))
        : current.filter((id) => id !== categoryId);
      return {
        ...prev,
        kitchen: {
          ...prev.kitchen,
          priceCategoryIds: next,
        },
      };
    });
  };

  const updateActiveBlock = (blockKey: string, checked: boolean) => {
    onChangePrintTemplates((prev) => ({
      ...prev,
      [selectedTemplate]: {
        ...prev[selectedTemplate],
        blocks: {
          ...prev[selectedTemplate].blocks,
          [blockKey]: checked,
        },
      },
    }));
  };

  const handleResetTemplate = () => {
    const freshDefaults = cloneDefaultPrintTemplates();
    onChangePrintTemplates((prev) => ({
      ...prev,
      [selectedTemplate]: freshDefaults[selectedTemplate],
    }));
  };

  return (
    <div className="min-w-0 space-y-4">
      {/* Shared Store Receipt Info (Story 14 backward compatible) */}
      <div className="min-w-0 space-y-3 rounded-xl border bg-card p-3.5 sm:p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div>
            <h2 className="text-sm font-bold">Thông tin Quán dùng chung cho Phiếu tính tiền</h2>
            <p className="text-xs text-muted-foreground">
              Áp dụng chung cho Phiếu tạm tính & Hoá đơn thanh toán (khổ giấy nhiệt 80mm / vùng in 72mm).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="receipt-print-name-input" className="text-xs sm:text-sm font-semibold">
              Tên quán trên tiêu đề phiếu in
            </label>
            <Input
              id="receipt-print-name-input"
              data-testid="input-receipt-print-name"
              maxLength={60}
              disabled={!canUpdate}
              value={draft.receipt.printName}
              onChange={(e) =>
                onChangeReceipt((prev) => ({ ...prev, printName: e.target.value }))
              }
              placeholder={`Để trống sẽ dùng: ${draft.storeName}`}
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="receipt-address-input" className="text-xs sm:text-sm font-semibold">
              Địa chỉ in trên bill
            </label>
            <Input
              id="receipt-address-input"
              data-testid="input-receipt-address"
              maxLength={160}
              disabled={!canUpdate}
              value={draft.receipt.address}
              onChange={(e) =>
                onChangeReceipt((prev) => ({ ...prev, address: e.target.value }))
              }
              placeholder="VD: ĐC: 123 Lê Lợi..."
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="receipt-phone-input" className="text-xs sm:text-sm font-semibold">
              Số điện thoại / Hotline
            </label>
            <Input
              id="receipt-phone-input"
              data-testid="input-receipt-phone"
              maxLength={20}
              disabled={!canUpdate}
              value={draft.receipt.phone}
              onChange={(e) =>
                onChangeReceipt((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="VD: 0909 123 456"
              className="h-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="space-y-1 md:col-span-7">
            <label htmlFor="receipt-footer-input" className="text-xs sm:text-sm font-semibold">
              Lời cảm ơn chân phiếu mặc định (hỗ trợ xuống dòng)
            </label>
            <textarea
              id="receipt-footer-input"
              data-testid="input-receipt-footer-note"
              rows={1}
              maxLength={200}
              disabled={!canUpdate}
              value={draft.receipt.footerNote}
              onChange={(e) =>
                onChangeReceipt((prev) => ({ ...prev, footerNote: e.target.value }))
              }
              placeholder="CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!"
              className="flex min-h-[38px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <label className="relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 text-xs sm:text-sm font-medium md:col-span-5">
            <Checkbox
              data-testid="checkbox-receipt-show-logo"
              disabled={!canUpdate}
              checked={draft.receipt.showLogo}
              onCheckedChange={(checked) =>
                onChangeReceipt((prev) => ({ ...prev, showLogo: checked === true }))
              }
            />
            <span>In logo đen trắng ở đầu phiếu tạm tính & hoá đơn</span>
          </label>
        </div>
      </div>

      {/* 5-Template Segmented Switcher + Editor + Live 80mm Preview */}
      <div className="min-w-0 space-y-4">
        <div
          role="tablist"
          data-scroll-intended="true"
          aria-label="Chọn mẫu phiếu in 80mm"
          className="no-scrollbar flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-xl border bg-muted/40 p-1.5"
        >
          {PRINT_TEMPLATE_TABS.map((tab) => {
            const isActive = tab.key === selectedTemplate;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`print-template-tab-${tab.key}`}
                onClick={() => onSelectTemplate(tab.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-background text-accent-text shadow-xs ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <Printer className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.tabLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold">{activeMeta.tabLabel}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{activeMeta.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canUpdate}
                data-testid={`reset-print-template-${selectedTemplate}`}
                onClick={handleResetTemplate}
                className="h-8 shrink-0 gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Khôi phục mẫu này về mặc định</span>
              </Button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`print-title-${selectedTemplate}`} className="text-sm font-semibold">
                {activeMeta.titleLabel}
              </label>
              <Input
                id={`print-title-${selectedTemplate}`}
                data-testid={`input-print-title-${selectedTemplate}`}
                maxLength={60}
                disabled={!canUpdate}
                value={activeTemplate.title}
                onChange={(e) => updateActiveField('title', e.target.value)}
                placeholder={activeMeta.titlePlaceholder}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`print-footer-${selectedTemplate}`} className="text-sm font-semibold">
                {activeMeta.footerLabel}
              </label>
              <textarea
                id={`print-footer-${selectedTemplate}`}
                data-testid={`input-print-footer-${selectedTemplate}`}
                rows={2}
                maxLength={200}
                disabled={!canUpdate}
                value={activeTemplate.footerNote}
                onChange={(e) => updateActiveField('footerNote', e.target.value)}
                placeholder={activeMeta.footerPlaceholder}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              {activeMeta.footerHint ? (
                <p className="text-[11px] font-medium text-accent-text">{activeMeta.footerHint}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`print-font-family-${selectedTemplate}`} className="text-sm font-semibold">Phông chữ phiếu in</label>
              <Select value={activeTemplate.fontFamily} disabled={!canUpdate} onValueChange={(value: ThermalFontFamily) =>
                onChangePrintTemplates((prev) => ({ ...prev, [selectedTemplate]: { ...prev[selectedTemplate], fontFamily: value } }))
              }>
                <SelectTrigger id={`print-font-family-${selectedTemplate}`} data-testid={`print-font-family-${selectedTemplate}`}><SelectValue /></SelectTrigger>
                <SelectContent>{THERMAL_FONT_OPTIONS.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Free font size selector (Word/Excel style, 6–16pt, step 0.5) */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`print-fontsize-input-${selectedTemplate}`}
                  className="text-sm font-semibold"
                >
                  Cỡ chữ phiếu in ({THERMAL_FONT_SIZE_PT_MIN}–{THERMAL_FONT_SIZE_PT_MAX}pt)
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Tiêu đề tự phóng ~1.4x · Khoá trần {THERMAL_FONT_SIZE_PT_MAX}pt tránh vỡ khổ 80mm
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={!canUpdate || activeFontSizePt <= THERMAL_FONT_SIZE_PT_MIN}
                  data-testid={`print-fontsize-dec-${selectedTemplate}`}
                  onClick={() => commitFontSizePt(activeFontSizePt - THERMAL_FONT_SIZE_PT_STEP)}
                  aria-label="Giảm cỡ chữ 0.5pt"
                  className="h-9 w-9 shrink-0"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <div className="relative flex items-center">
                  <Input
                    id={`print-fontsize-input-${selectedTemplate}`}
                    data-testid={`print-fontsize-input-${selectedTemplate}`}
                    type="number"
                    min={THERMAL_FONT_SIZE_PT_MIN}
                    max={THERMAL_FONT_SIZE_PT_MAX}
                    step={THERMAL_FONT_SIZE_PT_STEP}
                    list={`print-fontsize-presets-${selectedTemplate}`}
                    disabled={!canUpdate}
                    value={fontInputText}
                    onChange={(e) => setFontInputText(e.target.value)}
                    onBlur={() => commitFontSizePt(Number(fontInputText))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitFontSizePt(Number(fontInputText));
                      }
                    }}
                    className="h-9 w-24 pr-7 font-mono text-sm font-bold"
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs font-semibold text-muted-foreground">
                    pt
                  </span>
                  <datalist id={`print-fontsize-presets-${selectedTemplate}`}>
                    {FONT_SIZE_PRESETS.map((pt) => (
                      <option key={pt} value={pt} />
                    ))}
                  </datalist>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={!canUpdate || activeFontSizePt >= THERMAL_FONT_SIZE_PT_MAX}
                  data-testid={`print-fontsize-inc-${selectedTemplate}`}
                  onClick={() => commitFontSizePt(activeFontSizePt + THERMAL_FONT_SIZE_PT_STEP)}
                  aria-label="Tăng cỡ chữ 0.5pt"
                  className="h-9 w-9 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <div className="flex flex-wrap gap-1">
                  {FONT_SIZE_PRESETS.map((pt) => (
                    <Button
                      key={pt}
                      type="button"
                      size="sm"
                      variant={activeFontSizePt === pt ? 'default' : 'outline'}
                      disabled={!canUpdate}
                      data-testid={`print-fontsize-preset-${selectedTemplate}-${pt}`}
                      onClick={() => commitFontSizePt(pt)}
                      className="h-8 px-2 font-mono text-xs"
                    >
                      {pt}
                    </Button>
                  ))}
                </div>
              </div>
              {fontClampWarning ? (
                <p
                  data-testid={`print-fontsize-warning-${selectedTemplate}`}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400"
                >
                  {fontClampWarning}
                </p>
              ) : null}
            </div>

            {selectedTemplate === 'kitchen' ? (
              <div className="space-y-2 border-t pt-3">
                <span className="block text-sm font-semibold">
                  Danh mục in kèm đơn giá trên phiếu bếp
                </span>
                <p className="text-xs text-muted-foreground">
                  Các món thuộc danh mục được chọn (VD: Lẩu Hàn Quốc) sẽ in kèm đơn giá gốc cạnh tên món trên phiếu bếp.
                </p>
                {(categoriesQuery.data ?? []).length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">
                    Chưa tải được danh sách danh mục thực đơn.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(categoriesQuery.data ?? []).map((cat) => {
                      const checked = (draft.printTemplates.kitchen.priceCategoryIds ?? []).includes(
                        cat.id,
                      );
                      return (
                        <label
                          key={cat.id}
                          className="relative flex cursor-pointer select-none items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/40"
                        >
                          <Checkbox
                            data-testid={`kitchen-price-category-${cat.id}`}
                            disabled={!canUpdate}
                            checked={checked}
                            onCheckedChange={(val) =>
                              toggleKitchenPriceCategory(cat.id, val === true)
                            }
                          />
                          <span className="min-w-0 truncate">{cat.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="space-y-2.5 border-t pt-3">
              <span className="block text-sm font-semibold">Bật / tắt khối thông tin phụ</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeMeta.blocks.map((block) => (
                  <label
                    key={`${selectedTemplate}-${block.key}`}
                    className="relative flex cursor-pointer select-none items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/40"
                  >
                    <Checkbox
                      data-testid={`print-block-${selectedTemplate}-${block.key}`}
                      disabled={!canUpdate}
                      checked={Boolean(activeBlocks[block.key])}
                      onCheckedChange={(checked) => updateActiveBlock(block.key, checked === true)}
                    />
                    <span className="min-w-0 leading-snug">{block.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg border border-dashed bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Các khối bắt buộc nghiệp vụ (đã khoá bảo vệ)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeMeta.lockedInvariants.map((item) => (
                  <span
                    key={item}
                    className="rounded-md bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-5 lg:self-start lg:sticky lg:top-2">
            <ReceiptPreviewPanel storeSettings={livePreviewSettings} templateKey={selectedTemplate} />
          </div>
        </div>
      </div>
    </div>
  );
}
