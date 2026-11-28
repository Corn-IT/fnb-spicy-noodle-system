import { Copy, MapPin, RefreshCw, Wifi } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAppMessages } from '@/hooks/use-app-messages';
import type { QrSecurityBlockState } from '../hooks/use-qr-order-security';

/** Renders the full-screen notice when the scanned QR token has been rotated. */
export function QrRotatedLockScreen() {
  const { resolveMessage } = useAppMessages();
  const rotatedCopy = resolveMessage('qr.lock.qrRotated');

  return (
    <div
      data-testid="qr-rotated-lock-screen"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-background p-6 text-center text-foreground"
    >
      <div className="w-full rounded-2xl border bg-card p-6 shadow-md space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <RefreshCw className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-foreground">{rotatedCopy.title}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {rotatedCopy.description}
          </p>
        </div>
      </div>
    </div>
  );
}

interface QrSecurityLockScreenProps {
  securityBlock: QrSecurityBlockState;
  gpsErrorMsg: string | null;
  isLocatingGuestGps: boolean;
  onRequestGuestGps: () => void;
  onRetryMenu: () => void;
}

/** Renders the store Wi-Fi credential prompt and/or GPS geofence verification gate. */
export function QrSecurityLockScreen({
  securityBlock,
  gpsErrorMsg,
  isLocatingGuestGps,
  onRequestGuestGps,
  onRetryMenu,
}: QrSecurityLockScreenProps) {
  const { notify } = useAppMessages();
  const isWifiBlock = securityBlock.code === 'QR_WIFI_REQUIRED';

  return (
    <div
      data-testid={isWifiBlock ? 'qr-wifi-lock-screen' : 'qr-geo-lock-screen'}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-background p-6 text-center text-foreground"
    >
      <div className="w-full rounded-2xl border bg-card p-6 shadow-md space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
          {isWifiBlock ? <Wifi className="h-7 w-7" /> : <MapPin className="h-7 w-7" />}
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-foreground">{securityBlock.title}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {securityBlock.message}
          </p>
        </div>

        {(securityBlock.wifiSsid || securityBlock.wifiPassword) && (
          <div className="rounded-xl border bg-muted/50 p-3.5 text-left space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Thông tin Wi-Fi tại quán
            </div>
            {securityBlock.wifiSsid ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Tên Wi-Fi:</span>
                <span
                  data-testid="qr-lock-wifi-ssid"
                  className="font-bold text-foreground"
                >
                  {securityBlock.wifiSsid}
                </span>
              </div>
            ) : null}
            {securityBlock.wifiPassword ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Mật khẩu:</span>
                <div className="flex items-center gap-1.5">
                  <code
                    data-testid="qr-lock-wifi-password"
                    className="rounded bg-background px-2 py-0.5 font-mono font-bold text-foreground border"
                  >
                    {securityBlock.wifiPassword}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="qr-copy-wifi-password-btn"
                    onClick={() => {
                      if (navigator.clipboard && securityBlock.wifiPassword) {
                        void navigator.clipboard.writeText(securityBlock.wifiPassword);
                        notify('qr.lock.wifiPasswordCopiedToast', { variant: 'success' });
                      }
                    }}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Chép
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {gpsErrorMsg ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-300">
            {gpsErrorMsg}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          {!isWifiBlock ? (
            <Button
              type="button"
              data-testid="qr-verify-gps-btn"
              disabled={isLocatingGuestGps}
              onClick={onRequestGuestGps}
              className="w-full h-11 font-bold gap-2 bg-sky-600 hover:bg-sky-700 text-white"
            >
              <MapPin className="h-4 w-4" />
              {isLocatingGuestGps
                ? 'Đang kiểm tra vị trí...'
                : 'Xác nhận vị trí tại quán để mở thực đơn'}
            </Button>
          ) : null}

          <Button
            type="button"
            variant={isWifiBlock ? 'default' : 'outline'}
            data-testid="qr-retry-wifi-btn"
            onClick={onRetryMenu}
            className="w-full h-11 font-bold gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {isWifiBlock ? 'Đã kết nối Wi-Fi — Thử lại ngay' : 'Tải lại thực đơn'}
          </Button>
        </div>
      </div>
    </div>
  );
}
