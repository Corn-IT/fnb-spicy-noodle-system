import {
  isAllowedLanPrinterHost,
  type PublicStoreSettingsResponse,
  type ThermalPaperWidthDots,
  type ThermalPrinterDriver,
} from '@fnb/shared';
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Monitor,
  Network,
  Printer,
  RotateCcw,
  Vault,
} from 'lucide-react';
import * as React from 'react';

import {
  useThermalPrinter,
  useThermalPrinterConfigStore,
} from '@/components/print-slips';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

export interface PrinterHardwareSettingsPanelProps {
  storeSettings?: PublicStoreSettingsResponse;
}

const DRIVER_OPTIONS: ReadonlyArray<{
  value: ThermalPrinterDriver;
  title: string;
  badge: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    value: 'BROWSER',
    title: 'In qua Trình duyệt (window.print)',
    badge: 'PC / Windows Kiosk',
    description:
      'Dành cho máy tính Windows/macOS cài driver máy in trong hệ điều hành kèm cờ --kiosk-printing.',
    icon: Monitor,
  },
  {
    value: 'RAWBT_USB',
    title: 'Cáp USB trực tiếp trên Android POS (RawBT)',
    badge: 'iMin D3-505 + iPOS iTP6 (USB)',
    description:
      'Dành cho máy POS Android 11 (iMin D3-505) cắm cáp USB vào Cổng số 3 của máy in iPOS iTP6. In 1 chạm ESC/POS & tự cắt rời 3 phiếu bếp.',
    icon: Cable,
  },
  {
    value: 'LAN_ESCPOS',
    title: 'Dây mạng LAN (Ethernet RJ45 :9100)',
    badge: 'iPOS iTP6 (Cổng 4 LAN)',
    description:
      'Gửi lệnh ESC/POS trực tiếp qua mạng nội bộ TCP Port 9100 khi cắm dây mạng RJ45 vào Cổng số 4 của máy in iPOS iTP6.',
    icon: Network,
  },
];

const PAPER_WIDTH_OPTIONS: ReadonlyArray<{
  value: ThermalPaperWidthDots;
  label: string;
}> = [
  { value: 576, label: 'Khổ 80mm chuẩn iPOS iTP6 (576 dots / vùng in 72mm)' },
  { value: 384, label: 'Khổ 58mm nhỏ (384 dots / vùng in 48mm)' },
];

export function PrinterHardwareSettingsPanel({
  storeSettings,
}: PrinterHardwareSettingsPanelProps) {
  const config = useThermalPrinterConfigStore((s) => s.config);
  const setDriver = useThermalPrinterConfigStore((s) => s.setDriver);
  const updateConfig = useThermalPrinterConfigStore((s) => s.updateConfig);
  const resetConfig = useThermalPrinterConfigStore((s) => s.resetConfig);

  const {
    printOfficialReceipt,
    kickCashDrawerNow,
    lastPhysicalPrintResult,
    lastPhysicalPrintError,
  } = useThermalPrinter();

  const [statusNote, setStatusNote] = React.useState<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isKickingDrawer, setIsKickingDrawer] = React.useState(false);

  const isLanHostValid = React.useMemo(
    () => isAllowedLanPrinterHost(config.lanHost),
    [config.lanHost],
  );

  const handleTestThermalPrint = () => {
    setStatusNote(null);
    if (config.driver === 'LAN_ESCPOS' && !isLanHostValid) {
      setStatusNote({
        tone: 'error',
        text: 'Địa chỉ IP máy in LAN không hợp lệ (chỉ chấp nhận IP nội bộ 192.168.x.x, 10.x.x.x, 172.16-31.x.x hoặc 127.0.0.1).',
      });
      return;
    }

    printOfficialReceipt({
      orderCode: 'HD-TEST-ITP6',
      tableLabel: 'BÀN TEST 80MM',
      cashierName: 'Kiểm tra thiết bị',
      paymentMethod: 'CASH',
      cashAmount: 55000,
      transferAmount: 0,
      subtotalAmount: 55000,
      discountAmount: 0,
      totalAmount: 55000,
      items: [
        {
          name: 'Mì Cay Hải Sản (Phiếu Test iPOS iTP6)',
          quantity: 1,
          unitPrice: 55000,
          lineTotal: 55000,
          modifiers: ['Cấp độ 1', 'Đầy đủ rau & kim chi'],
          note: 'Kiểm tra tiếng Việt, cắt giấy GS V & két tiền RJ11',
        },
      ],
      storeSettings,
    });

    setStatusNote({
      tone: 'info',
      text:
        config.driver === 'BROWSER'
          ? 'Đã gửi lệnh window.print() kiểm tra khổ 80mm trên trình duyệt.'
          : config.driver === 'RAWBT_USB'
            ? 'Đã mã hoá phiếu test ESC/POS (576 dots) và gửi tới cầu nối RawBT USB trên thiết bị Android POS.'
            : `Đã gửi gói lệnh ESC/POS tới máy in LAN ${config.lanHost}:${config.lanPort}.`,
    });
  };

  const handleTestCashDrawerKick = async () => {
    setStatusNote(null);
    if (config.driver === 'LAN_ESCPOS' && !isLanHostValid) {
      setStatusNote({
        tone: 'error',
        text: 'Địa chỉ IP máy in LAN không hợp lệ. Vui lòng nhập IP nội bộ của máy in iPOS iTP6.',
      });
      return;
    }

    setIsKickingDrawer(true);
    try {
      const res = await kickCashDrawerNow();
      setStatusNote({
        tone: 'success',
        text: `Đã phát xung mở két tiền RJ11 (ESC p 0 50 250 — ${res?.bytesSent ?? 7} bytes) qua ${
          res?.transport === 'LAN_ESCPOS'
            ? `LAN ${config.lanHost}:${config.lanPort}`
            : res?.transport === 'RAWBT_WS'
              ? 'RawBT WebSocket'
              : 'RawBT Android Intent'
        }.`,
      });
    } catch (err) {
      setStatusNote({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Không thể gửi xung mở két đựng tiền RJ11.',
      });
    } finally {
      setIsKickingDrawer(false);
    }
  };

  return (
    <div
      data-testid="printer-hardware-settings-panel"
      className="mb-4 space-y-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-accent-text shrink-0" />
            <h3 className="text-base font-bold text-foreground">
              Cấu hình Kết nối Máy in Nhiệt Vật lý & Két tiền (Trên thiết bị này)
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Thiết lập phương thức kết nối với máy in <strong>iPOS.vn iTP6 (80mm)</strong> và két đựng tiền <strong>RJ11 24V</strong> cho riêng máy đang sử dụng (lưu trên thiết bị, giữ nguyên khi thu ngân đăng xuất đổi ca).
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="btn-reset-printer-hardware-config"
          onClick={() => {
            resetConfig();
            setStatusNote({
              tone: 'info',
              text: 'Đã khôi phục cấu hình thiết bị in về mặc định (In qua Trình duyệt).',
            });
          }}
          className="gap-1.5 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Khôi phục mặc định</span>
        </Button>
      </div>

      {/* 3 Driver Mode Cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {DRIVER_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = config.driver === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={`printer-driver-option-${option.value}`}
              aria-pressed={isSelected}
              onClick={() => {
                setDriver(option.value);
                setStatusNote(null);
              }}
              className={cn(
                'flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border bg-background hover:bg-muted/40',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <Icon className="h-4 w-4 text-accent-text shrink-0" />
                  <span>{option.title}</span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {option.badge}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Paper Width & Cash Drawer RJ11 Controls */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-3.5 md:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Độ rộng đầu in nhiệt (ESC/POS Raster)
          </span>
          <div className="flex flex-wrap gap-2">
            {PAPER_WIDTH_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={config.paperWidthDots === opt.value ? 'default' : 'outline'}
                data-testid={`printer-width-${opt.value}`}
                onClick={() => updateConfig({ paperWidthDots: opt.value })}
                className="text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Két đựng tiền mặt (Cổng số 5 RJ11 24V sau máy in iTP6)
          </span>
          <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-foreground">
            <Checkbox
              data-testid="printer-cash-drawer-kick-checkbox"
              checked={config.cashDrawerKick}
              onCheckedChange={(checked) =>
                updateConfig({ cashDrawerKick: Boolean(checked) })
              }
              className="mt-0.5"
            />
            <span>
              Tự động phát xung <code>ESC p</code> bung ngăn kéo đựng tiền khi in Hoá đơn Thanh toán có thu Tiền mặt (<code>CASH</code> / <code>SPLIT</code>).
            </span>
          </label>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="printer-left-margin-mm"
            className="block text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Hiệu chỉnh lề trái (0–8 mm)
          </label>
          <Input
            id="printer-left-margin-mm"
            data-testid="input-printer-left-margin-mm"
            type="number"
            min={0}
            max={8}
            step={0.5}
            value={config.leftMarginMm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) {
                updateConfig({ leftMarginMm: Math.max(0, Math.min(8, v)) });
              }
            }}
            className="h-9 max-w-[140px] font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Mặc định 0mm để tiết kiệm giấy tối đa. Tăng nếu đầu in bị lệch sang trái.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="printer-right-margin-mm"
            className="block text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Hiệu chỉnh lề phải (0–8 mm)
          </label>
          <Input
            id="printer-right-margin-mm"
            data-testid="input-printer-right-margin-mm"
            type="number"
            min={0}
            max={8}
            step={0.5}
            value={config.rightMarginMm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) {
                updateConfig({ rightMarginMm: Math.max(0, Math.min(8, v)) });
              }
            }}
            className="h-9 max-w-[140px] font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Mặc định 0mm. Tăng nếu chữ bị cắt hụt ở mép phải.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="printer-feed-lines-before-cut"
            className="block text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Đẩy giấy trước khi cắt (0–5 dòng)
          </label>
          <Input
            id="printer-feed-lines-before-cut"
            data-testid="input-printer-feed-lines-before-cut"
            type="number"
            min={0}
            max={5}
            step={1}
            value={config.feedLinesBeforeCut}
            onChange={(e) => {
              const v = Math.floor(Number(e.target.value));
              if (Number.isFinite(v)) {
                updateConfig({ feedLinesBeforeCut: Math.max(0, Math.min(5, v)) });
              }
            }}
            className="h-9 max-w-[140px] font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Mặc định 0 dòng. Tăng lên 1–2 nếu dao cắt lẹm vào dòng cuối phiếu.
          </p>
        </div>
      </div>

      {/* Contextual Config for RAWBT_USB (iMin D3-505 + iPOS iTP6 USB) */}
      {config.driver === 'RAWBT_USB' ? (
        <div
          data-testid="printer-rawbt-usb-config-box"
          className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="rawbt-ws-url-input"
                className="block text-xs font-semibold text-foreground"
              >
                Địa chỉ WebSocket nội bộ của RawBT trên máy Android POS
              </label>
              <Input
                id="rawbt-ws-url-input"
                data-testid="input-rawbt-ws-url"
                value={config.rawbtWsUrl}
                onChange={(e) => updateConfig({ rawbtWsUrl: e.target.value })}
                placeholder="ws://127.0.0.1:40213/"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-foreground">
                <Checkbox
                  data-testid="rawbt-fallback-intent-checkbox"
                  checked={config.rawbtFallbackToIntent}
                  onCheckedChange={(checked) =>
                    updateConfig({ rawbtFallbackToIntent: Boolean(checked) })
                  }
                  className="mt-0.5"
                />
                <span>
                  Tự động fallback sang <code>rawbt:base64,...</code> (Android URI Intent) nếu dịch vụ WebSocket nền chưa bật.
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-md border bg-background/90 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-bold text-foreground">
              Hướng dẫn kết nối 1 lần trên máy POS iMin D3-505 (Android 11) + Máy in iPOS.vn iTP6:
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>
                Kiểm tra mặt sau máy in <strong>iPOS iTP6</strong>: Cổng số 1 cắm nguồn <code>24V</code>, Cổng số 3 (USB vuông) cắm cáp USB vào máy <strong>iMin D3-505</strong>, Cổng số 5 (RJ11 ngoài cùng bên phải) cắm dây xuống két tiền.
              </li>
              <li>
                Cài ứng dụng <strong>RawBT Print Service</strong> trên máy <code>iMin D3-505</code> ➔ Mở RawBT chọn <strong>Connection method: USB</strong> ➔ Chọn thiết bị USB <code>iTP6 / POS80</code> và tích chọn <em>Luôn mở cho thiết bị USB này</em>.
              </li>
              <li>
                Bấm nút <strong>In phiếu kiểm tra kết nối (80mm)</strong> hoặc <strong>Test bung két tiền (RJ11)</strong> bên dưới để nghiệm thu.
              </li>
            </ol>
          </div>
        </div>
      ) : null}

      {/* Contextual Config for LAN_ESCPOS (Ethernet RJ45 Port 9100) */}
      {config.driver === 'LAN_ESCPOS' ? (
        <div
          data-testid="printer-lan-escpos-config-box"
          className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label
                htmlFor="lan-printer-host-input"
                className="block text-xs font-semibold text-foreground"
              >
                Địa chỉ IP nội bộ (LAN) của máy in iPOS iTP6
              </label>
              <Input
                id="lan-printer-host-input"
                data-testid="input-lan-printer-host"
                value={config.lanHost}
                onChange={(e) => updateConfig({ lanHost: e.target.value })}
                placeholder="192.168.1.200"
                className="font-mono text-xs"
              />
              {!isLanHostValid ? (
                <p
                  data-testid="lan-printer-host-error"
                  className="text-[11px] font-medium text-destructive"
                >
                  Chỉ cho phép địa chỉ IP mạng nội bộ LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x hoặc 127.0.0.1).
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="lan-printer-port-input"
                className="block text-xs font-semibold text-foreground"
              >
                Cổng TCP (Mặc định 9100)
              </label>
              <Input
                id="lan-printer-port-input"
                data-testid="input-lan-printer-port"
                type="number"
                min={1}
                max={65535}
                value={config.lanPort}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isInteger(val) && val >= 1 && val <= 65535) {
                    updateConfig({ lanPort: val });
                  }
                }}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Test Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="btn-test-thermal-print"
            onClick={handleTestThermalPrint}
            className="gap-1.5 font-semibold"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>In phiếu kiểm tra kết nối (80mm)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="btn-test-cash-drawer-kick"
            disabled={isKickingDrawer}
            onClick={() => void handleTestCashDrawerKick()}
            className="gap-1.5 font-semibold"
          >
            <Vault className="h-3.5 w-3.5" />
            <span>Test bung két tiền (RJ11)</span>
          </Button>
        </div>

        {lastPhysicalPrintResult ? (
          <span
            data-testid="printer-last-dispatch-badge"
            className="inline-flex items-center gap-1 rounded-md border bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              Gói gần nhất: {lastPhysicalPrintResult.transport} ({lastPhysicalPrintResult.bytesSent} bytes)
            </span>
          </span>
        ) : null}
      </div>

      {statusNote || lastPhysicalPrintError ? (
        <div
          data-testid="printer-hardware-status-message"
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
            lastPhysicalPrintError || statusNote?.tone === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : statusNote?.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-border bg-muted/40 text-foreground',
          )}
        >
          {lastPhysicalPrintError || statusNote?.tone === 'error' ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{lastPhysicalPrintError ?? statusNote?.text}</span>
        </div>
      ) : null}
    </div>
  );
}
