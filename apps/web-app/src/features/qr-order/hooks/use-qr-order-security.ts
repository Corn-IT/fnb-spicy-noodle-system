import type { StoreSettings } from '@fnb/shared';
import * as React from 'react';

import { useAppMessages } from '@/hooks/use-app-messages';
import { ApiClientError } from '@/lib/api-client';
import { syncDocumentThemeMode } from '@/utils/store-theme';
import type { GuestQrCoordinates } from '../api/qr-order.api';

export interface QrSecurityBlockState {
  code: 'QR_WIFI_REQUIRED' | 'QR_GEO_REQUIRED' | 'QR_GEO_OUT_OF_RANGE';
  title: string;
  message: string;
  wifiSsid: string | null;
  wifiPassword: string | null;
  geoRadiusMeters: number;
  distanceMeters: number | null;
}

/** Syncs the QR page document theme/title and resolves Wi-Fi/GPS access gates for guests. */
export function useQrOrderSecurity(params: {
  settings: StoreSettings;
  qrStoreName: string;
  isError: boolean;
  error: unknown;
}) {
  const { settings, qrStoreName, isError, error } = params;
  const { resolveMessage } = useAppMessages();

  const [guestCoords, setGuestCoords] = React.useState<GuestQrCoordinates | null>(null);
  const [isLocatingGuestGps, setIsLocatingGuestGps] = React.useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = React.useState<string | null>(null);
  const autoTriedGpsRef = React.useRef(false);

  const [systemDark, setSystemDark] = React.useState(() =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const effectiveQrTheme = settings.qr.theme === 'system'
    ? (systemDark ? 'dark' : 'light')
    : settings.qr.theme;

  React.useEffect(() => {
    syncDocumentThemeMode(
      effectiveQrTheme,
      settings.brandColor,
      settings.accentTextColor,
      settings.priceColor,
      settings.primaryTextColor,
    );
    document.title = qrStoreName;
    return () => {
      syncDocumentThemeMode(
        settings.defaultTheme,
        settings.brandColor,
        settings.accentTextColor,
        settings.priceColor,
        settings.primaryTextColor,
      );
    };
  }, [
    effectiveQrTheme,
    qrStoreName,
    settings.brandColor,
    settings.accentTextColor,
    settings.priceColor,
    settings.primaryTextColor,
    settings.defaultTheme,
  ]);

  const handleRequestGuestGps = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsErrorMsg(resolveMessage('qr.lock.gpsUnsupportedError').title);
      return;
    }
    setIsLocatingGuestGps(true);
    setGpsErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGuestGps(false);
        setGuestCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      (err) => {
        setIsLocatingGuestGps(false);
        setGpsErrorMsg(
          resolveMessage(err.code === 1 ? 'qr.lock.gpsDeniedError' : 'qr.lock.gpsUnavailableError')
            .title,
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [resolveMessage]);

  const qrSecurityBlock = React.useMemo<QrSecurityBlockState | null>(() => {
    if (!isError || !error) return null;
    const apiErr = error instanceof ApiClientError ? error : null;
    const code = apiErr?.code;
    if (
      code !== 'QR_WIFI_REQUIRED' &&
      code !== 'QR_GEO_REQUIRED' &&
      code !== 'QR_GEO_OUT_OF_RANGE'
    ) {
      return null;
    }
    const details =
      apiErr?.details && typeof apiErr.details === 'object'
        ? (apiErr.details as {
            wifiSsid?: string | null;
            wifiPassword?: string | null;
            geoRadiusMeters?: number;
            distanceMeters?: number;
          })
        : {};
    const errorResolved = resolveMessage(`error.${code}`, {
      wifiSsid: details.wifiSsid ?? '',
      distanceMeters: details.distanceMeters ?? 0,
      geoRadiusMeters: details.geoRadiusMeters ?? 200,
    });
    const lockKey =
      code === 'QR_WIFI_REQUIRED'
        ? 'qr.lock.wifiTitle'
        : code === 'QR_GEO_OUT_OF_RANGE'
          ? 'qr.lock.geoOutOfRangeTitle'
          : 'qr.lock.geoRequiredTitle';
    const lockResolved = resolveMessage(lockKey);
    const resolvedBody = errorResolved.isOverridden
      ? errorResolved.title
      : lockResolved.isOverridden && lockResolved.description
        ? lockResolved.description
        : apiErr?.message ?? lockResolved.description ?? errorResolved.title;

    return {
      code,
      title: lockResolved.title,
      message: resolvedBody,
      wifiSsid: details.wifiSsid ?? null,
      wifiPassword: details.wifiPassword ?? null,
      geoRadiusMeters: details.geoRadiusMeters ?? 200,
      distanceMeters: details.distanceMeters ?? null,
    };
  }, [isError, error, resolveMessage]);

  React.useEffect(() => {
    if (qrSecurityBlock?.code === 'QR_GEO_REQUIRED' && !autoTriedGpsRef.current) {
      autoTriedGpsRef.current = true;
      handleRequestGuestGps();
    }
  }, [qrSecurityBlock?.code, handleRequestGuestGps]);

  return {
    guestCoords,
    isLocatingGuestGps,
    gpsErrorMsg,
    handleRequestGuestGps,
    qrSecurityBlock,
  };
}
