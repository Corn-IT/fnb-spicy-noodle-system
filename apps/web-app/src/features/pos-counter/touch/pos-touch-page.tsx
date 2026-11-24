import { useQueryClient } from '@tanstack/react-query';
import {
  EllipsisVertical,
  Expand,
  LayoutGrid,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  Shrink,
  ShoppingBag,
  Utensils,
  Volume2,
  VolumeX,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { SystemErrorView } from '@/components/error-display';
import { executeCleanLogout } from '@/components/layout/top-navbar';
import { TOUCH_PATHS, TouchCashDrawerButton, useTouchShell } from '@/components/touch-shell';
import { Button } from '@/components/ui/button';
import { useAppMessages } from '@/hooks/use-app-messages';
import { exitAppFullscreen, useFullscreen } from '@/hooks/use-fullscreen';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';
import { POS_DEFAULT_PATH, usePosDeviceMode } from '@/lib/pos-device-mode';
import { cn } from '@/utils/cn';
import { PosWorkspaceDialogs } from '../components/pos-workspace-dialogs';
import { usePosWorkspace } from '../hooks/use-pos-workspace';
import { useQrVoiceToggle } from '../hooks/use-qr-voice-toggle';
import { formatClockTime, useNowTick } from './elapsed-time';
import { TouchActionSheet, type TouchSheetAction } from './touch-action-sheet';
import { TouchConfirmDialog, useTouchConfirm } from './touch-confirm-dialog';
import { useTouchLayoutPrefs } from './touch-layout';
import { describeColumnChoice, TouchLayoutDialog } from './touch-layout-dialog';
import { TouchOrderScreen } from './touch-order-screen';
import { TouchTableBoard, type TouchBoardTab } from './touch-table-board';
import { TOO_NARROW_QUERY, useMediaQuery } from './use-media-query';
import { useTouchUiRoot } from './use-touch-ui-root';

type TouchScreen = 'tables' | 'order';

const CLOSED_ORDER_ACTION: Partial<Record<string, string>> = {
  PAID: 'được thanh toán',
  VOIDED: 'bị huỷ',
  MERGED: 'được gộp sang bàn khác',
};

/**
 * Quầy POS cho màn hình cảm ứng (máy POS Android chạy Chrome), chạy toàn màn hình kiểu trình chiếu.
 * Dùng chung toàn bộ nghiệp vụ với `/pos` qua `usePosWorkspace`; chỉ khác phần giao diện.
 */
export function PosTouchPage() {
  const { isInTouchShell, setHideBottomNav } = useTouchShell();
  // Khi chạy độc lập (VD: unit test render trực tiếp không bọc TouchShellLayout),
  // vẫn tự gắn `data-pos-touch` và giữ wake lock như cũ; khi nằm trong TouchShellLayout, shell quản lý.
  useTouchUiRoot(!isInTouchShell);
  useScreenWakeLock(!isInTouchShell);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fullscreen = useFullscreen();
  const [deviceMode, setDeviceMode] = usePosDeviceMode();
  const { voiceEnabled, toggleVoice } = useQrVoiceToggle();
  const nowMs = useNowTick(15_000);
  const confirm = useTouchConfirm();
  const isTooNarrow = useMediaQuery(TOO_NARROW_QUERY);

  const [screen, setScreen] = React.useState<TouchScreen>('tables');
  const [boardTab, setBoardTab] = React.useState<TouchBoardTab>('all');
  const [onlyOccupied, setOnlyOccupied] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [layoutOpen, setLayoutOpen] = React.useState(false);
  const [layout, setLayout] = useTouchLayoutPrefs();

  React.useEffect(() => {
    setHideBottomNav(screen === 'order');
    return () => setHideBottomNav(false);
  }, [screen, setHideBottomNav]);

  const workspace = usePosWorkspace({
    onViewChange: (event) => {
      if (event === 'draft-started' || event === 'order-opened') {
        setScreen('order');
      }
    },
  });
  const { tableGridQuery, gridData, productsQuery, selectedOrderId, draftTarget, draftItems } =
    workspace;

  // Đơn đang mở bị đóng ở máy khác (thu ngân khác thanh toán / huỷ / gộp bàn): báo rõ rồi quay về
  // sơ đồ bàn, tránh để thu ngân đứng trên một hoá đơn đã đóng với các nút bị khoá không lý do.
  const { notify } = useAppMessages();
  const openedOrder = workspace.currentOrder;
  React.useEffect(() => {
    if (screen !== 'order' || !openedOrder || selectedOrderId !== openedOrder.orderId) return;
    const action = CLOSED_ORDER_ACTION[openedOrder.status];
    if (!action || workspace.isOrderClosedLocally(openedOrder.orderId)) return;
    notify('pos.order.closedElsewhere', {
      variant: 'warning',
      vars: { tableLabel: openedOrder.tableLabel ?? openedOrder.orderCode, action },
      duration: 5000,
    });
    workspace.actions.clearSelection();
    setScreen('tables');
    // Chỉ phản ứng khi trạng thái đơn đổi; actions/notify ổn định theo phiên.
  }, [screen, openedOrder?.orderId, openedOrder?.status, selectedOrderId]);

  // Đơn vừa thanh toán / huỷ / bị hệ thống huỷ → tự quay về sơ đồ bàn.
  React.useEffect(() => {
    if (screen === 'order' && selectedOrderId === null && draftTarget === null) {
      setScreen('tables');
    }
  }, [screen, selectedOrderId, draftTarget]);

  // Trình duyệt chỉ cho bật toàn màn hình trong một lần chạm: thử ở lần chạm đầu tiên khi chạy độc lập.
  React.useEffect(() => {
    if (isInTouchShell || !fullscreen.isSupported) return;
    const handleFirstTouch = () => {
      void fullscreen.enter();
    };
    window.addEventListener('pointerdown', handleFirstTouch, { once: true, capture: true });
    // Chỉ thử một lần khi vào màn; về sau dùng nút trong menu ⋮.
    return () => window.removeEventListener('pointerdown', handleFirstTouch, { capture: true });
  }, [isInTouchShell, fullscreen.isSupported, fullscreen.enter]);

  const tables = gridData?.tables ?? [];
  const takeaways = gridData?.takeaways ?? [];
  const availableCount = tables.filter((table) => table.status === 'AVAILABLE').length;

  const leaveOrderScreen = () => {
    workspace.actions.clearSelection();
    setScreen('tables');
  };

  const handleBack = () => {
    if (!workspace.currentOrder && draftItems.length > 0) {
      confirm.ask({
        title: 'Bỏ đơn đang chọn dở?',
        description: `${draftItems.length} món chưa được tạo đơn sẽ bị xoá.`,
        confirmLabel: 'Bỏ đơn',
        tone: 'destructive',
        onConfirm: leaveOrderScreen,
      });
      return;
    }
    leaveOrderScreen();
  };

  const handleExitTouchMode = () => {
    void exitAppFullscreen();
    navigate(POS_DEFAULT_PATH);
  };

  const handleLogout = async () => {
    await executeCleanLogout(queryClient);
    navigate('/login', { replace: true });
  };

  const handleOpenHub = () => {
    const goHub = () => {
      workspace.actions.clearSelection();
      navigate(TOUCH_PATHS.HUB);
    };
    if (!workspace.currentOrder && draftItems.length > 0) {
      confirm.ask({
        title: 'Bỏ đơn đang chọn dở để sang Quản lý?',
        description: `${draftItems.length} món chưa được tạo đơn sẽ bị xoá.`,
        confirmLabel: 'Bỏ đơn & Mở Quản lý',
        tone: 'destructive',
        onConfirm: goHub,
      });
      return;
    }
    goHub();
  };

  const kioskActions: TouchSheetAction[] = [
    {
      key: 'hub',
      label: 'Trung tâm Quản lý',
      hint: 'Hoá đơn, Kết ca, Báo hết món, Máy in, Báo cáo...',
      icon: LayoutGrid,
      onSelect: handleOpenHub,
    },
    ...(fullscreen.isSupported
      ? [
          {
            key: 'fullscreen',
            label: fullscreen.isFullscreen ? 'Thu nhỏ khỏi toàn màn hình' : 'Toàn màn hình',
            hint: 'Ẩn thanh địa chỉ và thanh điều hướng của máy',
            icon: fullscreen.isFullscreen ? Shrink : Expand,
            onSelect: () => void fullscreen.toggle(),
          },
        ]
      : []),
    {
      key: 'layout',
      label: 'Bố cục hiển thị',
      hint: `Bàn: ${describeColumnChoice(layout.tableColumns)} · Món: ${describeColumnChoice(layout.menuColumns)}`,
      icon: LayoutGrid,
      onSelect: () => setLayoutOpen(true),
    },
    {
      key: 'device-mode',
      label: 'Luôn mở POS cảm ứng trên máy này',
      hint:
        deviceMode === 'touch'
          ? 'Đang BẬT — chạm để tắt'
          : 'Đang TẮT — chạm để máy này luôn vào màn cảm ứng sau khi đăng nhập',
      icon: MonitorSmartphone,
      tone: deviceMode === 'touch' ? 'success' : 'default',
      onSelect: () => setDeviceMode(deviceMode === 'touch' ? 'default' : 'touch'),
    },
    {
      key: 'refresh',
      label: 'Tải lại dữ liệu',
      hint: 'Cập nhật sơ đồ bàn và thực đơn mới nhất',
      icon: RefreshCw,
      onSelect: () => {
        void tableGridQuery.refetch();
        void productsQuery.refetch();
      },
    },
    {
      key: 'exit',
      label: 'Thoát về giao diện đầy đủ',
      hint: 'Mở lại menu quản trị và các trang khác',
      icon: Shrink,
      onSelect: handleExitTouchMode,
    },
    {
      key: 'logout',
      label: 'Đăng xuất',
      icon: LogOut,
      tone: 'destructive',
      onSelect: () => void handleLogout(),
    },
  ];

  const menuButton = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Mở menu máy POS"
      data-testid="touch-kiosk-menu-btn"
      onClick={() => setMenuOpen(true)}
      className="h-12 w-12 shrink-0"
    >
      <EllipsisVertical className="h-6 w-6" />
    </Button>
  );

  if (isTooNarrow) {
    return (
      <div
        data-testid="touch-too-narrow"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <MonitorSmartphone className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-bold">Màn POS cảm ứng dành cho màn hình ngang (từ 768px)</p>
        <p className="text-sm text-muted-foreground">
          Trên điện thoại, hãy dùng giao diện POS thường — đã tối ưu cho màn hình nhỏ.
        </p>
        <Button type="button" className="h-12 px-6 text-base font-bold" onClick={handleExitTouchMode}>
          Mở POS thường
        </Button>
      </div>
    );
  }

  if (!gridData && tableGridQuery.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <SystemErrorView
          variant="section"
          error={tableGridQuery.error}
          onRetry={() => {
            void tableGridQuery.refetch();
            void productsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="pos-touch-screen"
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background"
    >
      {screen === 'order' ? (
        <TouchOrderScreen
          workspace={workspace}
          nowMs={nowMs}
          onBack={handleBack}
          trailing={menuButton}
          menuColumns={layout.menuColumns}
        />
      ) : (
        <>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-2 min-[1100px]:gap-3 min-[1100px]:px-3">
            <div
              role="tablist"
              aria-label="Phân loại sơ đồ bàn"
              className="flex shrink-0 items-center gap-0.5 rounded-xl bg-muted p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={boardTab === 'all'}
                aria-controls="touch-table-board"
                data-testid="touch-tab-all"
                onClick={() => setBoardTab('all')}
                className={cn(
                  'flex h-12 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors min-[1100px]:gap-2 min-[1100px]:px-4 min-[1100px]:text-base',
                  boardTab === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
              >
                <LayoutGrid className="h-5 w-5" />
                <span>Tất cả</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={boardTab === 'tables'}
                aria-controls="touch-table-board"
                data-testid="touch-tab-tables"
                onClick={() => setBoardTab('tables')}
                className={cn(
                  'flex h-12 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors min-[1100px]:gap-2 min-[1100px]:px-4 min-[1100px]:text-base',
                  boardTab === 'tables'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
              >
                <Utensils className="h-5 w-5" />
                <span className="hidden min-[1100px]:inline">Phòng bàn</span>
                <span className="min-[1100px]:hidden">Bàn</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={boardTab === 'takeaway'}
                aria-controls="touch-table-board"
                data-testid="touch-tab-takeaway"
                onClick={() => setBoardTab('takeaway')}
                className={cn(
                  'flex h-12 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors min-[1100px]:gap-2 min-[1100px]:px-4 min-[1100px]:text-base',
                  boardTab === 'takeaway'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
              >
                <ShoppingBag className="h-5 w-5" />
                <span>Mang về ({takeaways.length})</span>
              </button>
            </div>
            <p
              data-testid="touch-table-summary"
              className="min-w-0 flex-1 truncate text-base font-semibold text-muted-foreground"
            >
              Trống{' '}
              <span className="font-extrabold text-foreground tabular-nums">
                {availableCount}/{tables.length}
              </span>{' '}
              bàn
            </p>
            {boardTab !== 'takeaway' ? (
              <button
                type="button"
                role="switch"
                aria-label="Bàn có hoá đơn"
                aria-checked={onlyOccupied}
                data-testid="touch-only-occupied"
                onClick={() => setOnlyOccupied((value) => !value)}
                className="flex h-12 shrink-0 items-center gap-2 rounded-xl border px-2 text-sm font-bold min-[1100px]:px-3"
              >
                <span
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    onlyOccupied ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                      onlyOccupied ? 'left-[22px]' : 'left-0.5',
                    )}
                  />
                </span>
                <span className="hidden min-[1100px]:inline">Bàn có hoá đơn</span>
                <span className="min-[1100px]:hidden">Có HĐ</span>
              </button>
            ) : null}
            <TouchCashDrawerButton />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={voiceEnabled ? 'Tắt giọng đọc đơn QR' : 'Bật giọng đọc đơn QR'}
              aria-pressed={voiceEnabled}
              data-testid="touch-voice-toggle"
              onClick={toggleVoice}
              className={cn('h-12 w-12 shrink-0', voiceEnabled && 'text-accent-text')}
            >
              {voiceEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </Button>
            <span className="shrink-0 text-xl font-extrabold tabular-nums">
              {formatClockTime(new Date(nowMs).toISOString())}
            </span>
            {menuButton}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <TouchTableBoard
              columns={layout.tableColumns}
              tab={boardTab}
              tables={tables}
              takeaways={takeaways}
              onlyOccupied={onlyOccupied}
              nowMs={nowMs}
              canCreateOrder={workspace.permissions.canCreateOrder}
              addonBadgesByOrderId={workspace.addonBadgesByOrderId}
              onSelectTable={workspace.actions.selectTable}
              onSelectTakeaway={workspace.actions.selectTakeawayOrder}
              onStartNewTakeaway={workspace.actions.startNewTakeaway}
            />
          </div>
        </>
      )}

      <PosWorkspaceDialogs workspace={workspace} />
      <TouchActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title="Máy POS cảm ứng"
        actions={kioskActions}
        testId="touch-kiosk-menu"
      />
      <TouchConfirmDialog request={confirm.request} onClose={confirm.close} />
      <TouchLayoutDialog
        open={layoutOpen}
        onOpenChange={setLayoutOpen}
        prefs={layout}
        onChange={setLayout}
      />
    </div>
  );
}
