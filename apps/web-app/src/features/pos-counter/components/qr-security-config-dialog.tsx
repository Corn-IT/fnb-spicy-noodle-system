import { Crosshair, Globe, MapPin, ShieldCheck, ShoppingBag, Wifi } from 'lucide-react';
import * as React from 'react';

import { QrSecurityFormSkeleton } from '@/components/loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { cn } from '@/utils/cn';
import {
  usePosQrSecurityConfigQuery,
  useUpdatePosQrSecurityConfigMutation,
} from '../api/pos.api';

interface QrSecurityConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RADIUS_PRESETS = [100, 200, 300, 500];

export function QrSecurityConfigDialog({
  open,
  onOpenChange,
}: QrSecurityConfigDialogProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const { data: configData, isLoading } = usePosQrSecurityConfigQuery(open);
  const updateMutation = useUpdatePosQrSecurityConfigMutation();

  const [wifiProtectionEnabled, setWifiProtectionEnabled] = React.useState(false);
  const [autoSyncPosIp, setAutoSyncPosIp] = React.useState(true);
  const [allowedIpsInput, setAllowedIpsInput] = React.useState('');
  const [wifiSsid, setWifiSsid] = React.useState('');
  const [wifiPassword, setWifiPassword] = React.useState('');

  const [geoProtectionEnabled, setGeoProtectionEnabled] = React.useState(false);
  const [shopLatitudeInput, setShopLatitudeInput] = React.useState('');
  const [shopLongitudeInput, setShopLongitudeInput] = React.useState('');
  const [geoRadiusMeters, setGeoRadiusMeters] = React.useState(200);
  const [applySecurityToTakeaway, setApplySecurityToTakeaway] = React.useState(false);
  const [isLocatingGps, setIsLocatingGps] = React.useState(false);

  React.useEffect(() => {
    if (!configData || !open) return;
    setWifiProtectionEnabled(configData.wifiProtectionEnabled);
    setAutoSyncPosIp(configData.autoSyncPosIp);
    setAllowedIpsInput(configData.allowedWifiIps.join(', '));
    setWifiSsid(configData.wifiSsid);
    setWifiPassword(configData.wifiPassword);
    setGeoProtectionEnabled(configData.geoProtectionEnabled);
    setShopLatitudeInput(
      configData.shopLatitude !== null ? String(configData.shopLatitude) : '',
    );
    setShopLongitudeInput(
      configData.shopLongitude !== null ? String(configData.shopLongitude) : '',
    );
    setGeoRadiusMeters(configData.geoRadiusMeters);
    setApplySecurityToTakeaway(configData.applySecurityToTakeaway);
  }, [configData, open]);

  const handleAddDetectedIp = () => {
    const currentIp = configData?.detectedClientIp;
    if (!currentIp) return;
    const parts = allowedIpsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.includes(currentIp)) {
      parts.push(currentIp);
      setAllowedIpsInput(parts.join(', '));
    }
    notify('pos.qrSecurity.addIpSuccess', {
      variant: 'success',
      vars: { ip: currentIp },
    });
  };

  const handleCaptureCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      notify('pos.qrSecurity.gpsUnsupported', { variant: 'destructive' });
      return;
    }

    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setShopLatitudeInput(String(lat));
        setShopLongitudeInput(String(lng));
        notify('pos.qrSecurity.gpsSuccess', {
          variant: 'success',
          vars: { lat, lng },
        });
      },
      (err) => {
        setIsLocatingGps(false);
        notify(
          err.code === 1 ? 'pos.qrSecurity.gpsPermissionDenied' : 'pos.qrSecurity.gpsFailed',
          { variant: 'destructive' },
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  const handleSave = async () => {
    const parsedIps = allowedIpsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let parsedLat: number | null = null;
    let parsedLng: number | null = null;

    if (shopLatitudeInput.trim() !== '' || shopLongitudeInput.trim() !== '') {
      const latNum = Number(shopLatitudeInput.trim());
      const lngNum = Number(shopLongitudeInput.trim());
      if (
        !Number.isFinite(latNum) ||
        latNum < -90 ||
        latNum > 90 ||
        !Number.isFinite(lngNum) ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        notify('pos.qrSecurity.invalidCoords', { variant: 'destructive' });
        return;
      }
      parsedLat = latNum;
      parsedLng = lngNum;
    }

    if (geoProtectionEnabled && (parsedLat === null || parsedLng === null)) {
      notify('pos.qrSecurity.missingCoords', { variant: 'destructive' });
      return;
    }

    const clampedRadius = Math.min(5000, Math.max(20, Math.round(Number(geoRadiusMeters) || 200)));

    try {
      await updateMutation.mutateAsync({
        wifiProtectionEnabled,
        autoSyncPosIp,
        allowedWifiIps: parsedIps,
        wifiSsid: wifiSsid.trim(),
        wifiPassword: wifiPassword.trim(),
        geoProtectionEnabled,
        shopLatitude: parsedLat,
        shopLongitude: parsedLng,
        geoRadiusMeters: clampedRadius,
        applySecurityToTakeaway,
      });
      const summary =
        wifiProtectionEnabled && !geoProtectionEnabled
          ? 'Đang khoá cứng quét QR theo mạng Wi-Fi của quán.'
          : !wifiProtectionEnabled && geoProtectionEnabled
            ? `Đang khoá quét QR trong bán kính ${clampedRadius}m quanh quán.`
            : wifiProtectionEnabled && geoProtectionEnabled
              ? `Đang bật kết hợp Wi-Fi quán + dự phòng bán kính GPS ${clampedRadius}m.`
              : 'Đã tắt giới hạn mạng/vị trí khi quét QR.';
      notify('pos.qrSecurity.saveSuccess', {
        variant: 'success',
        vars: { summary },
      });
      onOpenChange(false);
    } catch (error) {
      const resolvedErr = resolveErrorMessage(
        'pos.qrSecurity.saveError',
        error,
        'Vui lòng thử lại.',
      );
      notify('pos.qrSecurity.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    }
  };

  const activeStatusSummary = React.useMemo(() => {
    if (wifiProtectionEnabled && !geoProtectionEnabled) {
      return {
        badge: 'Phương án 1: Chỉ Wi-Fi Quán',
        tone: 'bg-emerald-600 text-white',
        desc: 'Khách bắt buộc phải kết nối Wi-Fi của quán mới mở được thực đơn và gọi món QR. Chặn 100% người mang ảnh QR về nhà.',
      };
    }
    if (!wifiProtectionEnabled && geoProtectionEnabled) {
      return {
        badge: `Phương án 2: Bán kính GPS (${geoRadiusMeters}m)`,
        tone: 'bg-sky-600 text-white',
        desc: `Dùng khi Wi-Fi quán gặp sự cố: Khách dùng 4G trong phạm vi ${geoRadiusMeters}m quanh quán mới mở được thực đơn QR.`,
      };
    }
    if (wifiProtectionEnabled && geoProtectionEnabled) {
      return {
        badge: `Kết hợp Wi-Fi + Dự phòng GPS (${geoRadiusMeters}m)`,
        tone: 'bg-indigo-600 text-white',
        desc: `Khách dùng Wi-Fi quán được vào thẳng; nếu dùng 4G hệ thống tự kiểm tra bán kính ${geoRadiusMeters}m quanh quán.`,
      };
    }
    return {
      badge: 'Đang tắt giới hạn',
      tone: 'bg-amber-500 text-white',
      desc: 'Đang mở tự do cho mọi thiết bị quét mã QR. Hãy bật Phương án 1 hoặc Phương án 2 để chống chụp mã QR đem về nhà spam.',
    };
  }, [wifiProtectionEnabled, geoProtectionEnabled, geoRadiusMeters]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="qr-security-config-dialog"
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ShieldCheck className="h-5 w-5 text-accent-text" />
            Cấu hình Bảo mật Quét QR Chống Spam Từ Xa
          </DialogTitle>
          <DialogDescription>
            Chặn khách chụp ảnh mã QR trên bàn đem về nhà quét phá. Có thể chuyển đổi linh hoạt giữa{' '}
            <strong>Phương án 1 (Wi-Fi quán)</strong> và{' '}
            <strong>Phương án 2 (Định vị bán kính an toàn)</strong>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <QrSecurityFormSkeleton />
        ) : (
          <div className="space-y-4 py-1">
            {/* Active mode banner */}
            <div className="rounded-xl border bg-muted/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Trạng thái bảo vệ hiện tại
                </span>
                <Badge className={cn('text-xs px-2 py-0.5', activeStatusSummary.tone)}>
                  {activeStatusSummary.badge}
                </Badge>
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed">
                {activeStatusSummary.desc}
              </p>
            </div>

            {/* Phương án 1: Wi-Fi Quán */}
            <div
              className={cn(
                'rounded-xl border-2 p-3.5 transition-colors space-y-3',
                wifiProtectionEnabled
                  ? 'border-emerald-600/80 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-sm font-bold">
                      Phương án 1 (Chính): Khoá theo Wi-Fi của Quán
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Khách phải kết nối vào Wi-Fi của quán mới xem được menu và đặt món QR.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  data-testid="toggle-wifi-protection-btn"
                  variant={wifiProtectionEnabled ? 'default' : 'outline'}
                  onClick={() => setWifiProtectionEnabled((prev) => !prev)}
                  className={cn(
                    'shrink-0 min-w-[92px] font-bold',
                    wifiProtectionEnabled && 'bg-emerald-600 hover:bg-emerald-700 text-white',
                  )}
                >
                  {wifiProtectionEnabled ? 'Đang BẬT' : 'Đang TẮT'}
                </Button>
              </div>

              <div className="space-y-2.5 pt-1 border-t border-border/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="qr-wifi-ssid-input"
                      className="text-xs font-semibold text-foreground"
                    >
                      Tên Wi-Fi quán (Hiển thị hướng dẫn khách)
                    </label>
                    <Input
                      id="qr-wifi-ssid-input"
                      name="wifiSsid"
                      data-testid="qr-wifi-ssid-input"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="VD: Mi Cay Seoul"
                      className="h-9 text-xs sm:text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="qr-wifi-password-input"
                      className="text-xs font-semibold text-foreground"
                    >
                      Mật khẩu Wi-Fi (Để khách bấm Sao chép)
                    </label>
                    <Input
                      id="qr-wifi-password-input"
                      name="wifiPassword"
                      data-testid="qr-wifi-password-input"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                      placeholder="VD: 12345678"
                      className="h-9 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <label
                  htmlFor="qr-wifi-autosync-checkbox"
                  className="flex items-start gap-2 rounded-lg border bg-background/80 p-2.5 cursor-pointer text-xs"
                >
                  <input
                    id="qr-wifi-autosync-checkbox"
                    name="autoSyncPosIp"
                    type="checkbox"
                    data-testid="qr-wifi-autosync-checkbox"
                    checked={autoSyncPosIp}
                    onChange={(e) => setAutoSyncPosIp(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-emerald-600"
                  />
                  <div className="space-y-0.5">
                    <span className="font-semibold block">
                      Tự động đồng bộ theo IP mạng của máy Thu ngân (POS)
                    </span>
                    <span className="text-muted-foreground block">
                      IP mạng POS hiện tại:{' '}
                      <code className="font-mono font-bold text-foreground">
                        {configData?.detectedClientIp ?? '127.0.0.1'}
                      </code>{' '}
                      (Tự động khớp cả khi cục modem Wi-Fi quán khởi động lại đổi IP mới).
                    </span>
                  </div>
                </label>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="qr-wifi-allowed-ips-input"
                      className="text-xs font-semibold text-foreground"
                    >
                      Danh sách IP Wi-Fi cho phép bổ sung (cách nhau dấu phẩy)
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="add-current-ip-btn"
                      onClick={handleAddDetectedIp}
                      className="h-7 px-2 text-xs font-semibold text-accent-text"
                    >
                      <Globe className="h-3.5 w-3.5 mr-1" />
                      + Lấy IP mạng hiện tại
                    </Button>
                  </div>
                  <Input
                    id="qr-wifi-allowed-ips-input"
                    name="allowedWifiIps"
                    data-testid="qr-wifi-allowed-ips-input"
                    value={allowedIpsInput}
                    onChange={(e) => setAllowedIpsInput(e.target.value)}
                    placeholder="Để trống nếu đã bật Tự động đồng bộ IP máy POS ở trên"
                    className="h-9 text-xs sm:text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Phương án 2: Giới hạn Định vị Bán kính GPS */}
            <div
              className={cn(
                'rounded-xl border-2 p-3.5 transition-colors space-y-3',
                geoProtectionEnabled
                  ? 'border-sky-600/80 bg-sky-50/40 dark:bg-sky-950/20'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    <h3 className="text-sm font-bold">
                      Phương án 2 (Dự phòng): Khoá Định vị trong Bán kính An toàn
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Khi Wi-Fi quán gặp sự cố, bật chế độ này để khách dùng 4G trong phạm vi bán kính quanh quán vẫn quét gọi món được.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  data-testid="toggle-geo-protection-btn"
                  variant={geoProtectionEnabled ? 'default' : 'outline'}
                  onClick={() => setGeoProtectionEnabled((prev) => !prev)}
                  className={cn(
                    'shrink-0 min-w-[92px] font-bold',
                    geoProtectionEnabled && 'bg-sky-600 hover:bg-sky-700 text-white',
                  )}
                >
                  {geoProtectionEnabled ? 'Đang BẬT' : 'Đang TẮT'}
                </Button>
              </div>

              <div className="space-y-2.5 pt-1 border-t border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Toạ độ tâm của quán (GPS)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="capture-shop-gps-btn"
                    disabled={isLocatingGps}
                    onClick={handleCaptureCurrentGps}
                    className="h-8 px-2.5 text-xs font-semibold gap-1.5"
                  >
                    <Crosshair className="h-3.5 w-3.5 text-sky-600" />
                    {isLocatingGps ? 'Đang lấy toạ độ...' : 'Lấy toạ độ quán hiện tại'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="qr-shop-lat-input"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Vĩ độ (Latitude)
                    </label>
                    <Input
                      id="qr-shop-lat-input"
                      name="shopLatitude"
                      data-testid="qr-shop-lat-input"
                      value={shopLatitudeInput}
                      onChange={(e) => setShopLatitudeInput(e.target.value)}
                      placeholder="VD: 10.776889"
                      className="h-9 text-xs sm:text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="qr-shop-lng-input"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Kinh độ (Longitude)
                    </label>
                    <Input
                      id="qr-shop-lng-input"
                      name="shopLongitude"
                      data-testid="qr-shop-lng-input"
                      value={shopLongitudeInput}
                      onChange={(e) => setShopLongitudeInput(e.target.value)}
                      placeholder="VD: 106.700806"
                      className="h-9 text-xs sm:text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="qr-geo-radius-input"
                      className="text-xs font-semibold text-foreground"
                    >
                      Bán kính an toàn quanh quán (mét)
                    </label>
                    <div className="flex items-center gap-1">
                      {RADIUS_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGeoRadiusMeters(preset)}
                          className={cn(
                            'rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors',
                            geoRadiusMeters === preset
                              ? 'border-sky-600 bg-sky-600 text-white'
                              : 'border-border bg-background hover:bg-muted',
                          )}
                        >
                          {preset}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    id="qr-geo-radius-input"
                    name="geoRadiusMeters"
                    type="number"
                    min={20}
                    max={5000}
                    data-testid="qr-geo-radius-input"
                    value={geoRadiusMeters}
                    onChange={(e) => setGeoRadiusMeters(Number(e.target.value) || 200)}
                    className="h-9 text-xs sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Tùy chọn áp dụng cho Mã QR Mang về */}
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-accent-text shrink-0" />
                  <h3 className="text-sm font-bold">
                    Áp dụng bảo mật Wi-Fi / GPS cho Mã QR Mang về
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mặc định <strong>TẮT</strong> để khách mang về quét đặt trước qua 4G/từ xa. Bật nếu chỉ cho phép quét đơn Mang về khi đang ở tại quán.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                data-testid="toggle-takeaway-qr-security-btn"
                variant={applySecurityToTakeaway ? 'default' : 'outline'}
                onClick={() => setApplySecurityToTakeaway((prev) => !prev)}
                className={cn(
                  'shrink-0 min-w-[92px] font-bold',
                  applySecurityToTakeaway && 'bg-amber-600 hover:bg-amber-700 text-white',
                )}
              >
                {applySecurityToTakeaway ? 'Đang BẬT' : 'Đang TẮT'}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
          <Button
            type="button"
            data-testid="save-qr-security-config-btn"
            disabled={updateMutation.isPending || isLoading}
            onClick={handleSave}
          >
            {updateMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình bảo mật'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
