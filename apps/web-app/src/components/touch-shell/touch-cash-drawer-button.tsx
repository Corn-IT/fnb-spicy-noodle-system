import { isAllowedLanPrinterHost } from '@fnb/shared';
import { Loader2, Vault } from 'lucide-react';
import * as React from 'react';

import {
  useThermalPrinter,
  useThermalPrinterConfigStore,
} from '@/components/print-slips';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

export interface TouchCashDrawerButtonProps {
  className?: string;
}

/**
 * Nút "Mở két" đặt cạnh trái icon loa trên header tab Bán hàng của màn POS cảm ứng.
 * Chỉ hiển thị và hoạt động khi tài khoản có quyền `pos.openCashDrawer` (hoặc Super Admin);
 * chạm 1 lần để bung két tự do ngay lập tức mà không phụ thuộc trạng thái hoá đơn.
 */
export function TouchCashDrawerButton({ className }: TouchCashDrawerButtonProps) {
  const user = useAuthStore((state) => state.user);
  const canOpenCashDrawer = Boolean(
    user?.isSuperAdmin || user?.permissions?.pos?.openCashDrawer,
  );
  const { kickCashDrawerNow } = useThermalPrinter();
  const [isKicking, setIsKicking] = React.useState(false);

  if (!canOpenCashDrawer) {
    return null;
  }

  const handleOpenCashDrawer = async () => {
    if (isKicking) return;
    const config = useThermalPrinterConfigStore.getState().config;
    if (config.driver === 'LAN_ESCPOS' && !isAllowedLanPrinterHost(config.lanHost)) {
      toast({
        variant: 'destructive',
        title: 'IP máy in LAN không hợp lệ',
        description:
          'Vui lòng vào Quản lý → Máy in & Két tiền để kiểm tra lại địa chỉ IP nội bộ của máy in.',
      });
      return;
    }

    setIsKicking(true);
    try {
      const res = await kickCashDrawerNow();
      toast({
        variant: 'success',
        title: 'Đã gửi lệnh mở két tiền',
        description:
          res?.transport === 'LAN_ESCPOS'
            ? `Đã phát xung RJ11 qua máy in LAN (${config.lanHost}:${config.lanPort}).`
            : 'Đã phát xung RJ11 mở ngăn kéo tiền mặt trên máy POS.',
        duration: 2500,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể mở két đựng tiền',
        description:
          err instanceof Error
            ? err.message
            : 'Vui lòng kiểm tra kết nối cáp USB/LAN máy in trong mục Máy in & Két tiền.',
      });
    } finally {
      setIsKicking(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isKicking}
      aria-label="Mở két tiền"
      title="Mở két đựng tiền"
      data-testid="touch-open-cash-drawer"
      onClick={() => void handleOpenCashDrawer()}
      className={cn(
        'h-12 shrink-0 gap-1.5 px-2.5 text-sm font-bold min-[1100px]:gap-2 min-[1100px]:px-3.5 min-[1100px]:text-base',
        className,
      )}
    >
      {isKicking ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <Vault className="h-5 w-5 shrink-0" />
      )}
      <span>Mở két</span>
    </Button>
  );
}
