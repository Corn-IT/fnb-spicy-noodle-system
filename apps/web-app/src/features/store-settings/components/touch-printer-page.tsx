import { useStoreSettings } from '@/hooks/use-store-settings';
import { useAuthStore } from '@/stores/auth.store';
import { PrinterHardwareSettingsPanel } from './printer-hardware-settings-panel';

/**
 * Màn cấu hình Máy in Nhiệt vật lý & Mở két tiền dành riêng cho chế độ POS cảm ứng.
 * Toàn bộ thiết lập lưu theo thiết bị (`localStorage`), nên mọi tài khoản có quyền `pos.view`
 * đều sử dụng được; chỉ Super Admin chỉnh cấu hình. Nút mở két thủ công yêu cầu quyền `pos.openCashDrawer` (hoặc `settings.update` / Super Admin).
 */
export function TouchPrinterPage() {
  const { settings } = useStoreSettings();
  const user = useAuthStore((state) => state.user);
  const canKickCashDrawer = Boolean(
    user?.isSuperAdmin ||
      user?.permissions?.pos?.openCashDrawer ||
      user?.permissions?.settings?.update,
  );

  return (
    <div
      data-testid="touch-printer-page"
      className="mx-auto flex w-full max-w-[1200px] flex-none flex-col gap-4"
    >
      <PrinterHardwareSettingsPanel
        storeSettings={settings}
        confirmCashDrawerKick
        canKickCashDrawer={canKickCashDrawer}
      />
    </div>
  );
}
