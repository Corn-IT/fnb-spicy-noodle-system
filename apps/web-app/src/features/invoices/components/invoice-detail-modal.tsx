import { type OrderDetailResponse } from '@fnb/shared';
import { ArrowRightLeft, Printer } from 'lucide-react';
import * as React from 'react';

import { useThermalPrinter } from '@/components/print-slips';
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
import { toast } from '@/components/ui/toast';
import {
  useInvoiceDetailQuery,
  useReprintInvoiceMutation,
} from '@/features/invoices/api/invoices.api';
import { useAuthStore } from '@/stores/auth.store';

export interface InvoiceDetailModalProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TableTransferLogEntry {
  action?: string;
  fromTable?: string;
  toTable?: string;
  timestamp?: string;
  reason?: string;
}

interface ReprintFeedback {
  status: 'success' | 'error';
  message: string;
}

function formatDateTimeVi(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

export function InvoiceDetailModal({
  orderId,
  open,
  onOpenChange,
}: InvoiceDetailModalProps) {
  const { data: detail, isLoading } = useInvoiceDetailQuery(open ? orderId : null);
  const reprintMutation = useReprintInvoiceMutation();
  const { printOfficialReceipt } = useThermalPrinter();
  const user = useAuthStore((state) => state.user);
  const [reprintFeedback, setReprintFeedback] = React.useState<ReprintFeedback | null>(null);

  React.useEffect(() => {
    setReprintFeedback(null);
  }, [orderId, open]);

  const canReprint = Boolean(
    user?.isSuperAdmin || user?.permissions.invoices?.reprint,
  );

  const itemsByBatch = React.useMemo(() => {
    const map = new Map<number, OrderDetailResponse['items']>();
    if (!detail?.items) return map;
    for (const item of detail.items) {
      const list = map.get(item.batchNo) ?? [];
      list.push(item);
      map.set(item.batchNo, list);
    }
    return map;
  }, [detail]);

  const transferLogs = React.useMemo<TableTransferLogEntry[]>(() => {
    if (!detail?.tableTransferLogs || !Array.isArray(detail.tableTransferLogs)) return [];
    return detail.tableTransferLogs.filter(
      (entry): entry is TableTransferLogEntry => Boolean(entry && typeof entry === 'object'),
    );
  }, [detail]);

  const handleReprint = async () => {
    if (!detail || !orderId) return;
    setReprintFeedback(null);
    try {
      const printableDetail = await reprintMutation.mutateAsync(orderId);
      const activeItems = printableDetail.items
        .filter((item) => item.kitchenStatus !== 'CANCELLED')
        .map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          modifiers: item.modifiers,
          note: item.itemNote,
        }));

      printOfficialReceipt({
        orderCode: printableDetail.orderCode,
        tableLabel:
          printableDetail.tableLabel ??
          (printableDetail.takeawayNumber
            ? `Mang về #${String(printableDetail.takeawayNumber).padStart(2, '0')}`
            : 'Tại bàn'),
        cashierName: user?.fullName || user?.username || 'Thu ngân',
        paidAt: formatDateTimeVi(printableDetail.paidAt ?? printableDetail.createdAt),
        paymentMethod: printableDetail.paymentMethod ?? 'CASH',
        cashAmount: printableDetail.cashAmount,
        transferAmount: printableDetail.transferAmount,
        totalAmount: printableDetail.totalAmount,
        items: activeItems,
      });

      setReprintFeedback({
        status: 'success',
        message: `Đã gửi lệnh in lại hoá đơn ${printableDetail.orderCode} tới máy in 80mm.`,
      });
      toast({
        title: 'Đã gửi lệnh in lại hoá đơn',
        description: `Hoá đơn ${printableDetail.orderCode} đang được in ra máy in nhiệt 80mm.`,
      });
    } catch {
      setReprintFeedback({
        status: 'error',
        message: 'Không thể in lại hoá đơn. Vui lòng kiểm tra kết nối hoặc quyền in hoá đơn.',
      });
      toast({
        variant: 'destructive',
        title: 'Không thể in lại hoá đơn',
        description: 'Vui lòng kiểm tra lại kết nối hoặc quyền in hoá đơn.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="invoice-detail-modal"
        className="flex max-h-[88dvh] sm:max-h-[85vh] w-[calc(100vw-2rem)] sm:max-w-2xl flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-card shadow-2xl"
      >
        <DialogHeader className="p-4 sm:p-5 border-b shrink-0 text-left bg-card pr-12">
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="text-base sm:text-lg font-bold">Chi tiết Hoá đơn {detail?.orderCode ?? ''}</span>
            {detail ? (
              <Badge
                variant={
                  detail.status === 'PAID'
                    ? 'success'
                    : detail.status === 'VOIDED'
                      ? 'destructive'
                      : 'warning'
                }
                className="shrink-0 font-bold"
              >
                {detail.status === 'PAID'
                  ? 'Đã thanh toán'
                  : detail.status === 'VOIDED'
                    ? 'Đã huỷ'
                    : detail.status === 'SERVING'
                      ? 'Đang phục vụ'
                      : detail.status === 'MERGED'
                        ? 'Đã gộp'
                        : detail.status === 'PENDING'
                          ? 'Chờ duyệt QR'
                          : detail.status}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Xem chi tiết các lượt gọi món (batch), lịch sử chuyển/gộp bàn và in lại bill nhiệt 80mm.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="flex-1 min-h-0 flex items-center justify-center py-12 text-center text-sm text-muted-foreground">
            Đang tải chi tiết hoá đơn...
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-4 text-sm">
            {/* Thông tin chung */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground">Bàn / Hình thức</div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {detail.tableLabel ??
                    (detail.takeawayNumber
                      ? `Mang về #${String(detail.takeawayNumber).padStart(2, '0')}`
                      : '—')}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Thời điểm tạo</div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {formatDateTimeVi(detail.createdAt)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Thanh toán lúc</div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {formatDateTimeVi(detail.paidAt)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Phương thức TT</div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {detail.paymentMethod === 'CASH'
                    ? 'Tiền mặt'
                    : detail.paymentMethod === 'TRANSFER'
                      ? 'Chuyển khoản QR'
                      : detail.paymentMethod === 'SPLIT'
                        ? 'Tiền mặt + Chuyển khoản'
                        : 'Chưa thanh toán'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Tiền mặt / Chuyển khoản</div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {detail.cashAmount.toLocaleString('vi-VN')} đ /{' '}
                  {detail.transferAmount.toLocaleString('vi-VN')} đ
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Tổng cộng</div>
                <div className="mt-0.5 text-sm font-bold text-primary">
                  {detail.totalAmount.toLocaleString('vi-VN')} đ
                </div>
              </div>
            </div>

            {/* Danh sách món theo từng batch_no */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Danh sách món theo lượt gọi</h4>
              {Array.from(itemsByBatch.entries()).map(([batchNo, batchItems]) => (
                <div key={batchNo} className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between border-b pb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <span>
                      {batchNo === 1 ? 'Lượt 1 (Đơn gốc)' : `GỌI THÊM - Lượt ${batchNo}`}
                    </span>
                    <span>{batchItems.length} món</span>
                  </div>
                  <div className="divide-y">
                    {batchItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 py-2 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-foreground">
                            {item.quantity}x {item.name}{' '}
                            {item.kitchenStatus === 'CANCELLED' ? (
                              <Badge variant="destructive" className="ml-1">
                                ĐÃ HUỶ
                              </Badge>
                            ) : null}
                          </div>
                          {item.modifiers.length > 0 ? (
                            <div className="text-muted-foreground">
                              + {item.modifiers.join(', ')}
                            </div>
                          ) : null}
                          {item.itemNote ? (
                            <div className="italic text-amber-600 dark:text-amber-400">
                              Ghi chú: {item.itemNote}
                            </div>
                          ) : null}
                        </div>
                        <div className="whitespace-nowrap font-semibold text-foreground">
                          {item.lineTotal.toLocaleString('vi-VN')} đ
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Lịch sử chuyển/gộp bàn (table_transfer_logs) */}
            {transferLogs.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-800 dark:text-amber-300">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>Lịch sử chuyển / gộp / đổi bàn</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {transferLogs.map((log, idx) => (
                    <div key={idx} className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">[{log.action ?? 'TRANSFER'}]</span>{' '}
                        <span>
                          {log.fromTable ?? '—'} → {log.toTable ?? '—'}
                        </span>
                        {log.reason ? (
                          <span className="ml-1.5 italic text-muted-foreground">
                            ({log.reason})
                          </span>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground">
                        {formatDateTimeVi(log.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-wrap items-center justify-between gap-2">
          {reprintFeedback ? (
            <p
              data-testid="reprint-feedback"
              role={reprintFeedback.status === 'error' ? 'alert' : 'status'}
              aria-live={reprintFeedback.status === 'error' ? 'assertive' : 'polite'}
              className={`mr-auto text-xs sm:text-sm font-medium ${
                reprintFeedback.status === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {reprintFeedback.message}
            </p>
          ) : null}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              data-testid="close-invoice-detail-btn"
              onClick={() => onOpenChange(false)}
              className="active:scale-[0.98] transition-transform select-none"
            >
              Đóng
            </Button>
            {detail && canReprint ? (
              <Button
                type="button"
                data-testid="reprint-invoice-btn"
                disabled={reprintMutation.isPending}
                onClick={handleReprint}
                className="bg-primary text-primary-foreground font-semibold shadow-xs active:scale-[0.98]"
              >
                <Printer className="h-4 w-4 shrink-0" />
                <span>In lại hoá đơn</span>
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
