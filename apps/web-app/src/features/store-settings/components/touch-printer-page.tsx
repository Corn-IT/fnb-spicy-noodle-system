import { useStoreSettings } from '@/hooks/use-store-settings';
import { PrinterHardwareSettingsPanel } from './printer-hardware-settings-panel';

/**
 * Màn cấu hình Máy in Nhiệt vật lý & Mở két tiền dành riêng cho chế độ POS cảm ứng.
 * Toàn bộ thiết lập lưu theo thiết bị (`localStorage`), nên mọi tài khoản có quyền `pos.view`
 * đều sử dụng được mà không cần mở khoá màn hình Cài đặt hệ thống (`/settings`).
 */
export function TouchPrinterPage() {
  const { settings } = useStoreSettings();

  return (
    <div
      data-testid="touch-printer-page"
      className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4"
    >
      <PrinterHardwareSettingsPanel storeSettings={settings} confirmCashDrawerKick />
    </div>
  );
}
