import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_STORE_SETTINGS,
  type OrderDetailResponse,
  type PosTableGridResponse,
  type PublicStoreSettingsResponse,
  UserPermissionsSchema,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildVietQrImageUrl,
  KitchenCancelItemSlip,
  KitchenSplitSlip,
  OfficialReceiptSlip,
  ProvisionalVietQrSlip,
  StationLogo,
  TableQrSlip,
  TableTransferNoticeSlip,
  ThermalPrintProvider,
  useThermalPrinter,
} from '@/components/print-slips';
import { useToastStore } from '@/components/ui/toast';
import { PosUnifiedPage } from '@/features/pos-counter';
import { apiClient } from '@/lib/api-client';
import * as socketClient from '@/lib/socket-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

describe('Story 10 — 80mm Thermal Print System, 5 Standard Slips & Dynamic VietQR', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();

    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  describe('AC-10.1: Auto Page-Cut 3 Kitchen Tickets & Station SVG Logos (Hard Invariant 3)', () => {
    it('should render exactly 3 independent .ticket-page blocks with distinct station SVG logos (CHEF_HAT_NOODLE, FRENCH_FRIES, DRINK_CUP) and never display COMBO', () => {
      render(
        <div id="thermal-print-container">
          <KitchenSplitSlip
            orderCode="HD-20261108-0039"
            tableLabel="BÀN 07"
            printedAt="08/11/2026 19:25:30"
            orderNote="Cho ớt bột để riêng chén nhỏ"
            tickets={[
              {
                station: 'BEP_NAU',
                stationTitle: 'BẾP NẤU (MÌ CAY)',
                logoType: 'CHEF_HAT_NOODLE',
                batchNo: 1,
                items: [
                  {
                    name: 'Mì Kim Chi Bò Mỹ',
                    qty: 2,
                    modifiers: ['Cấp độ 3', 'Thêm Bò viên'],
                    note: 'Ít hành',
                  },
                ],
              },
              {
                station: 'BEP_CHIEN',
                stationTitle: 'BẾP CHIÊN',
                logoType: 'FRENCH_FRIES',
                batchNo: 1,
                items: [
                  {
                    name: 'Khoai Tây Chiên Phô Mai',
                    qty: 1,
                    modifiers: [],
                    note: '',
                  },
                ],
              },
              {
                station: 'PHA_CHE',
                stationTitle: 'QUẦY NƯỚC UỐNG',
                logoType: 'DRINK_CUP',
                batchNo: 1,
                items: [
                  {
                    name: 'Trà Đào Cam Sả',
                    qty: 2,
                    modifiers: ['Ít đá'],
                    note: '',
                  },
                ],
              },
            ]}
          />
        </div>,
      );

      const container = document.getElementById('thermal-print-container');
      expect(container).not.toBeNull();

      const ticketPages = container!.querySelectorAll('.ticket-page');
      expect(ticketPages).toHaveLength(3);

      // Verify 3 distinct station SVG logos
      expect(screen.getByTestId('station-logo-CHEF_HAT_NOODLE')).toBeInTheDocument();
      expect(screen.getByTestId('station-logo-FRENCH_FRIES')).toBeInTheDocument();
      expect(screen.getByTestId('station-logo-DRINK_CUP')).toBeInTheDocument();

      // Verify station titles & content
      expect(screen.getByText('BẾP NẤU (MÌ CAY)')).toBeInTheDocument();
      expect(screen.getByText('BẾP CHIÊN')).toBeInTheDocument();
      expect(screen.getByText('QUẦY NƯỚC UỐNG')).toBeInTheDocument();

      // Verify spicy level, topping line and item note
      expect(screen.getByText(/Cấp độ 3/)).toBeInTheDocument();
      expect(screen.getByText(/\+ Thêm Bò viên/)).toBeInTheDocument();
      expect(screen.getByText(/Ít hành/)).toBeInTheDocument();
      expect(screen.getAllByText(/Cho ớt bột để riêng chén nhỏ/)).toHaveLength(3);

      // Hard Invariant 3: NEVER print the word COMBO on kitchen slips
      expect(container!.textContent).not.toContain('COMBO');
    });

    it('should render individual StationLogo components with high-contrast monochrome SVG paths', () => {
      const { unmount } = render(
        <div>
          <StationLogo logoType="CHEF_HAT_NOODLE" />
          <StationLogo logoType="FRENCH_FRIES" />
          <StationLogo logoType="DRINK_CUP" />
        </div>,
      );

      expect(screen.getByTestId('station-logo-CHEF_HAT_NOODLE').tagName.toLowerCase()).toBe('svg');
      expect(screen.getByTestId('station-logo-FRENCH_FRIES').tagName.toLowerCase()).toBe('svg');
      expect(screen.getByTestId('station-logo-DRINK_CUP').tagName.toLowerCase()).toBe('svg');
      unmount();
    });
  });

  describe('AC-10.2: Add-on Batch Label & Table Transfer Warning Banner on Kitchen Split Slip', () => {
    it('should display inverted "[GỌI THÊM - LƯỢT 2]" badge and "[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]" when batchNo = 2 and order has transfer history', () => {
      render(
        <KitchenSplitSlip
          orderCode="HD-20261108-0039"
          tableLabel="BÀN 07"
          tickets={[
            {
              station: 'BEP_NAU',
              stationTitle: 'BẾP NẤU (MÌ CAY)',
              logoType: 'CHEF_HAT_NOODLE',
              batchNo: 2,
              batchLabel: '[GỌI THÊM - LƯỢT 2]',
              transferNotice: '[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]',
              items: [
                {
                  name: 'Mì Hải Sản',
                  qty: 1,
                  modifiers: ['Cấp độ 1'],
                  note: 'Không ớt bột',
                },
              ],
            },
          ]}
        />,
      );

      expect(screen.getByTestId('kitchen-addon-batch-banner-BEP_NAU')).toHaveTextContent(
        '[GỌI THÊM - LƯỢT 2]',
      );
      expect(screen.getByTestId('kitchen-transfer-notice-BEP_NAU')).toHaveTextContent(
        '[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]',
      );
    });

    it('should also format takeaway label "MANG VỀ #08" and auto-generate "[GỌI THÊM - LƯỢT 2]" when batchNo > 1 even if batchLabel is omitted', () => {
      render(
        <KitchenSplitSlip
          orderCode="HD-20261108-0045"
          orderType="TAKEAWAY"
          takeawayNumber={8}
          transferFromTable="BÀN 01"
          transferToTable="BÀN 07"
          tickets={[
            {
              station: 'PHA_CHE',
              stationTitle: 'QUẦY NƯỚC UỐNG',
              logoType: 'DRINK_CUP',
              batchNo: 2,
              items: [{ name: 'Pepsi Lon', qty: 2, modifiers: [], note: '' }],
            },
          ]}
        />,
      );

      expect(screen.getByText(/MANG VỀ #08/i)).toBeInTheDocument();
      expect(screen.getByTestId('kitchen-addon-batch-banner-PHA_CHE')).toHaveTextContent(
        '[GỌI THÊM - LƯỢT 2]',
      );
      expect(screen.getByTestId('kitchen-transfer-notice-PHA_CHE')).toHaveTextContent(
        '[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]',
      );
    });
  });

  describe('AC-10.3: Table Transfer Notice Slip (EC-POS-04), Kitchen Cancel Item Slip (EC-POS-06 Branch B), Official Receipt Slip (PAID) & Automatic POS Print Triggers', () => {
    it('should render TableTransferNoticeSlip (Template 2) with warning header, source/target tables, and affected stations', () => {
      render(
        <TableTransferNoticeSlip
          orderCode="HD-20261108-0039"
          fromLabel="Bàn 01"
          toLabel="Bàn 07"
          affectedStations={['BEP_NAU', 'PHA_CHE']}
          printedAt="08/11/2026 19:20:15"
        />,
      );

      expect(screen.getByText(/⚠️ THÔNG BÁO ĐỔI BÀN ⚠️/)).toBeInTheDocument();
      expect(screen.getByText(/>>> BÀN 01 <<</i)).toBeInTheDocument();
      expect(screen.getByText(/>>> BÀN 07 <<</i)).toBeInTheDocument();
      expect(screen.getByText(/HD-20261108-0039/)).toBeInTheDocument();
      expect(screen.getByText(/BẾP NẤU/)).toBeInTheDocument();
      expect(screen.getByText(/QUẦY NƯỚC UỐNG|QUẦY PHA CHẾ/)).toBeInTheDocument();
    });

    it('should render KitchenCancelItemSlip (Template 3) with separate .ticket-page per cancelled item slip', () => {
      const { container } = render(
        <KitchenCancelItemSlip
          orderCode="HD-20261108-0039"
          slips={[
            {
              station: 'BEP_NAU',
              tableLabel: 'BÀN 07',
              itemName: 'Mì Bò Cấp 3',
              quantity: 1,
            },
            {
              station: 'PHA_CHE',
              tableLabel: 'BÀN 07',
              itemName: 'Trà Đào Cam Sả',
              quantity: 2,
            },
          ]}
        />,
      );

      expect(container.querySelectorAll('.ticket-page')).toHaveLength(2);
      expect(screen.getAllByText(/^PHIẾU BÁO HUỶ MÓN$/)).toHaveLength(2);
      expect(
        screen.getByText(/^BÀN 07 - HUỶ 01 MÌ BÒ CẤP 3$/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^BÀN 07 - HUỶ 02 TRÀ ĐÀO CAM SẢ$/i),
      ).toBeInTheDocument();
    });

    it('should render OfficialReceiptSlip (Template 5) with PAID status and detailed breakdown for CASH, TRANSFER, and SPLIT payments', () => {
      const { rerender } = render(
        <OfficialReceiptSlip
          orderCode="HD-20261108-0039"
          tableLabel="BÀN 07"
          cashierName="V.Anh"
          paidAt="08/11/2026 19:48:00"
          paymentMethod="SPLIT"
          cashAmount={85000}
          transferAmount={100000}
          totalAmount={185000}
          items={[
            {
              name: 'Mì Kim Chi Bò Mỹ',
              quantity: 1,
              unitPrice: 185000,
              lineTotal: 185000,
              modifiers: ['Cấp 3'],
              note: null,
            },
          ]}
        />,
      );

      expect(screen.getByText(/HOÁ ĐƠN THANH TOÁN \(PAID\)/)).toBeInTheDocument();
      expect(screen.getByTestId('official-receipt-payment-method')).toHaveTextContent(/SPLIT/);
      expect(screen.getByTestId('official-receipt-cash-amount')).toHaveTextContent('85.000');
      expect(screen.getByTestId('official-receipt-transfer-amount')).toHaveTextContent('100.000');

      rerender(
        <OfficialReceiptSlip
          orderCode="HD-20261108-0040"
          tableLabel="Mang về #02"
          paymentMethod="CASH"
          cashAmount={55000}
          transferAmount={0}
          totalAmount={55000}
          items={[]}
        />,
      );
      expect(screen.getByTestId('official-receipt-payment-method')).toHaveTextContent(/CASH/);
    });

    it('should automatically trigger thermal printing from PosUnifiedPage when table-action returns requireKitchenNoticePrint=true and when cancelling a PRINTED item returns requireCancellationSlip=true', async () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
      } as unknown as ReturnType<typeof socketClient.connectPosSocket>);
      vi.spyOn(socketClient, 'getPosSocket').mockReturnValue(null);

      useAuthStore.getState().setAuth({
        accessToken: 'cashier-jwt-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({
            pos: {
              view: true,
              create: true,
              update: true,
              delete: true,
              splitKitchen: true,
              tableAction: true,
              checkout: true,
            },
            invoices: { view: true, reprint: true },
            inventory: { view: true, create: true, delete: true },
            cashflow: { view: true, create: true },
          }),
        },
      });

      const tableGridResponse: PosTableGridResponse = {
        tables: [
          {
            id: 1,
            name: 'Bàn 01',
            status: 'OCCUPIED',
            activeOrderId: 901,
            activeOrder: {
              orderId: 901,
              orderCode: 'HD-20261108-0091',
              orderType: 'DINE_IN',
              tableId: 1,
              tableLabel: 'Bàn 01',
              takeawayNumber: null,
              status: 'SERVING',
              totalAmount: 55000,
              createdAt: '2026-11-08T09:00:00.000Z',
            },
          },
          {
            id: 7,
            name: 'Bàn 07',
            status: 'AVAILABLE',
            activeOrderId: null,
            activeOrder: null,
          },
        ],
        takeaways: [],
      };

      const order901Detail: OrderDetailResponse = {
        orderId: 901,
        orderCode: 'HD-20261108-0091',
        orderType: 'DINE_IN',
        orderSource: 'POS_COUNTER',
        tableId: 1,
        tableLabel: 'Bàn 01',
        takeawayNumber: null,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        totalAmount: 55000,
        note: null,
        createdAt: '2026-11-08T09:00:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 9901,
            productId: 101,
            name: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
            unitPrice: 55000,
            lineTotal: 55000,
            modifiers: ['Cấp 3'],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'PRINTED',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGridResponse;
        if (url === '/api/v1/menu/products') return [];
        if (url === '/api/v1/pos/orders/901') return order901Detail;
        throw new Error(`Unexpected GET ${url}`);
      });

      vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/orders/901/table-action') {
          return {
            action: 'MOVE',
            sourceTableId: 1,
            targetTableId: 7,
            requireKitchenNoticePrint: true,
            kitchenTransferSlip: {
              orderCode: 'HD-20261108-0091',
              fromLabel: 'Bàn 01',
              toLabel: 'Bàn 07',
              affectedStations: ['BEP_NAU'],
            },
          };
        }
        throw new Error(`Unexpected POST ${url}`);
      });

      vi.spyOn(apiClient, 'patch').mockResolvedValue({
        orderId: 901,
        totalAmount: 0,
        requireCancellationSlip: true,
        kitchenCancellationSlips: [
          {
            station: 'BEP_NAU',
            tableLabel: 'Bàn 07',
            itemName: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
          },
        ],
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <ThermalPrintProvider>
              <MemoryRouter future={routerFutureFlags}>
                <PosUnifiedPage />
              </MemoryRouter>
            </ThermalPrintProvider>
          </SocketProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('table-card-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('table-card-1'));
      await waitFor(() => {
        expect(screen.getByTestId('btn-table-action')).toBeInTheDocument();
      });

      // 1. Trigger Table MOVE with requireKitchenNoticePrint = true
      fireEvent.click(screen.getByTestId('btn-table-action'));
      await waitFor(() => {
        expect(screen.getByTestId('target-table-7')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('target-table-7'));
      await waitFor(() => {
        expect(screen.getByTestId('confirm-table-action-btn')).not.toBeDisabled();
      });
      fireEvent.click(screen.getByTestId('confirm-table-action-btn'));

      await waitFor(() => {
        expect(screen.getByText(/⚠️ THÔNG BÁO ĐỔI BÀN ⚠️/)).toBeInTheDocument();
        expect(printSpy).toHaveBeenCalledTimes(1);
      });

      // 2. Trigger Cancel PRINTED item with requireCancellationSlip = true
      fireEvent.click(screen.getByTestId('cancel-printed-item-9901'));

      await waitFor(() => {
        expect(screen.getByText(/^PHIẾU BÁO HUỶ MÓN$/)).toBeInTheDocument();
        expect(printSpy).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('AC-10.4: Provisional VietQR Slip Integrity — Wait for QR Image Load Before window.print() (Hard Invariant 4)', () => {
    it('should build valid Napas247 VietQR URL embedding amount and "TT {order_code}" memo, and wait for img onLoad (or onError fallback SVG) before calling window.print()', async () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      const qrUrl = buildVietQrImageUrl({
        amount: 220000,
        orderCode: 'HD-20261108-0039',
        bankId: 'VCB',
        accountNo: '0123456789',
        accountName: 'QUAN MI CAY SON BAO',
      });
      expect(qrUrl).toContain('amount=220000');
      expect(qrUrl).toContain('TT+HD-20261108-0039');

      function TestPrintTrigger() {
        const { printProvisionalVietQr } = useThermalPrinter();
        return (
          <button
            type="button"
            data-testid="trigger-provisional-print"
            onClick={() =>
              printProvisionalVietQr({
                orderId: 538,
                orderCode: 'HD-20261108-0039',
                orderType: 'DINE_IN',
                tableId: 7,
                tableLabel: 'BÀN 07',
                takeawayNumber: null,
                cashierName: 'V.Anh',
                createdAt: '2026-11-08T19:00:22.000Z',
                totalAmount: 220000,
                status: 'SERVING',
                vietQrPayload: qrUrl,
                paymentAccount: {
                  id: 1,
                  label: 'TK Chính (Vietcombank)',
                  bankCode: 'VCB',
                  bankName: 'Vietcombank',
                  accountNo: '0123456789',
                  accountName: 'QUAN MI CAY SON BAO',
                },
                items: [
                  {
                    name: 'Mì Kim Chi Bò Mỹ',
                    quantity: 2,
                    unitPrice: 70000,
                    lineTotal: 140000,
                    modifiers: ['Cấp độ 3', 'Thêm Bò viên'],
                    note: null,
                  },
                  {
                    name: 'Khoai Tây Chiên',
                    quantity: 1,
                    unitPrice: 30000,
                    lineTotal: 30000,
                    modifiers: [],
                    note: null,
                  },
                  {
                    name: 'Trà Đào Cam Sả',
                    quantity: 2,
                    unitPrice: 25000,
                    lineTotal: 50000,
                    modifiers: [],
                    note: null,
                  },
                ],
              })
            }
          >
            Print Provisional
          </button>
        );
      }

      render(
        <ThermalPrintProvider>
          <TestPrintTrigger />
        </ThermalPrintProvider>,
      );

      fireEvent.click(screen.getByTestId('trigger-provisional-print'));

      // Verify slip content is rendered in #thermal-print-container
      expect(screen.getByText(/PHIẾU TẠM TÍNH/)).toBeInTheDocument();
      expect(screen.getByText(/Phiếu này dùng để kiểm tra món ăn/)).toBeInTheDocument();
      expect(screen.getByText(/TT B07 HD-20261108-0039/)).toBeInTheDocument();
      expect(screen.getByTestId('provisional-vietqr-bank-account')).toHaveTextContent(
        'Vietcombank — STK: 0123456789',
      );
      expect(screen.getByTestId('provisional-vietqr-account-name')).toHaveTextContent(
        'QUAN MI CAY SON BAO',
      );

      const qrImg = (await screen.findByTestId('provisional-vietqr-image')) as HTMLImageElement;
      expect(qrImg).toBeInTheDocument();
      expect(qrImg.src.startsWith('data:image/png;base64,')).toBe(true);

      // Crucial: window.print() MUST NOT be called before image finishes loading
      expect(printSpy).not.toHaveBeenCalled();

      // Simulate VietQR image load complete
      fireEvent.load(qrImg);

      await waitFor(() => {
        expect(printSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should hide QR image and show unconfigured message (no fake SVG) while still calling window.print() when paymentAccount is missing', async () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            bill={{
              orderId: 599,
              orderCode: 'HD-20261108-0099',
              orderType: 'TAKEAWAY',
              tableId: null,
              takeawayNumber: 5,
              totalAmount: 185000,
              status: 'SERVING',
              items: [
                {
                  name: 'Mì Hải Sản',
                  quantity: 1,
                  unitPrice: 185000,
                  lineTotal: 185000,
                  modifiers: ['Cấp độ 0', 'Xúc xích (5k)'],
                  pricedModifiers: ['Xúc xích (5k)'],
                  note: 'Không hành',
                },
              ],
            }}
            onReadyToPrint={() => window.print()}
          />
        </ThermalPrintProvider>,
      );

      expect(screen.getByTestId('provisional-qr-unconfigured')).toHaveTextContent(
        'Chưa cấu hình tài khoản nhận tiền',
      );
      expect(screen.queryByTestId('provisional-vietqr-image')).not.toBeInTheDocument();
      // Bordered 3-column table, priced modifier shown, 0đ modifier & item note hidden
      expect(screen.getByTestId('provisional-items-table')).toBeInTheDocument();
      expect(screen.getByText(/\+ Xúc xích \(5k\)/)).toBeInTheDocument();
      expect(screen.queryByText(/Cấp độ 0/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Không hành/)).not.toBeInTheDocument();

      await waitFor(() => {
        expect(printSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('AC-14.11: Dynamic Store Header/Footer & Logo Toggle on Thermal Slips', () => {
    const customSettings = {
      ...DEFAULT_STORE_SETTINGS,
      storeName: 'Mì Cay Seoul',
      subtitle: 'Chi nhánh 1',
      description: 'Mì cay 7 cấp độ',
      brandColor: '#2563EB',
      defaultTheme: 'light' as const,
      qr: { storeName: '', subtitle: '', welcomeMessage: '', theme: 'system' as const },
      receipt: {
        printName: 'QUÁN MÌ CAY SEOUL',
        address: '123 Lê Lợi, Hà Nội',
        phone: '0909123456',
        footerNote: 'Dòng 1 cảm ơn\nDòng 2 hẹn gặp lại',
        showLogo: false,
      },
      navLabels: {},
      pageHeaders: {},
      updatedAt: '2026-11-15T10:00:00.000Z',
      assets: {
        logo: '2026-11-15T10:00:00.000Z',
        favicon: null,
        qrLogo: null,
      },
    };

    it('renders dynamic receipt header, address, phone, multiline footer and omits logo img when showLogo=false', () => {
      render(
        <OfficialReceiptSlip
          orderCode="HD-20261115-0001"
          tableLabel="BÀN 02"
          paymentMethod="CASH"
          cashAmount={100000}
          transferAmount={0}
          totalAmount={100000}
          items={[
            {
              name: 'Mì Bò',
              quantity: 1,
              unitPrice: 100000,
              lineTotal: 100000,
              modifiers: [],
              note: null,
            },
          ]}
          storeSettings={customSettings}
        />,
      );

      expect(screen.getByText('QUÁN MÌ CAY SEOUL')).toBeInTheDocument();
      expect(screen.getByText('123 Lê Lợi, Hà Nội')).toBeInTheDocument();
      expect(screen.getByText('ĐT: 0909123456')).toBeInTheDocument();
      expect(screen.getByText(/Dòng 1 cảm ơn/)).toBeInTheDocument();
      expect(screen.getByText(/Dòng 2 hẹn gặp lại/)).toBeInTheDocument();
      expect(screen.queryByTestId('official-receipt-logo')).not.toBeInTheDocument();
    });

    it('renders monochrome logo img on both official and provisional slips when showLogo=true and asset exists', () => {
      const withLogo = {
        ...customSettings,
        receipt: { ...customSettings.receipt, showLogo: true },
      };

      const { unmount } = render(
        <OfficialReceiptSlip
          orderCode="HD-20261115-0002"
          tableLabel="BÀN 03"
          paymentMethod="CASH"
          cashAmount={50000}
          transferAmount={0}
          totalAmount={50000}
          items={[]}
          storeSettings={withLogo}
        />,
      );
      const officialLogo = screen.getByTestId('official-receipt-logo') as HTMLImageElement;
      expect(officialLogo.src).toContain('/api/v1/public/store-assets/logo?v=');
      unmount();

      render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            bill={{
              orderId: 700,
              orderCode: 'HD-20261115-0003',
              orderType: 'DINE_IN',
              tableId: 4,
              takeawayNumber: null,
              totalAmount: 50000,
              status: 'SERVING',
              items: [],
            }}
            storeSettings={withLogo}
          />
        </ThermalPrintProvider>,
      );
      const provisionalLogo = screen.getByTestId('provisional-receipt-logo') as HTMLImageElement;
      expect(provisionalLogo.src).toContain('/api/v1/public/store-assets/logo?v=');
      expect(screen.getByText('QUÁN MÌ CAY SEOUL')).toBeInTheDocument();
      expect(screen.getByText('123 Lê Lợi, Hà Nội')).toBeInTheDocument();
    });
  });

  describe('Story 16 — Custom PrintTemplates across all 5 80mm Thermal Slips (AC-16.1 to AC-16.8)', () => {
    const makePublicSettings = (
      overrides: Partial<PublicStoreSettingsResponse> = {},
    ): PublicStoreSettingsResponse => ({
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: '2026-11-15T10:00:00.000Z',
      assets: { logo: '2026-11-15T10:00:00.000Z', favicon: null, qrLogo: null },
      ...overrides,
    });

    it('customizes ProvisionalVietQrSlip blocks and keeps VietQR + total locked even when optional blocks are disabled (AC-16.3, AC-16.4, AC-16.5)', async () => {
      const settings = makePublicSettings({
        receipt: { ...DEFAULT_STORE_SETTINGS.receipt, showLogo: true },
        printTemplates: {
          ...DEFAULT_STORE_SETTINGS.printTemplates,
          provisional: {
            title: 'TẠM TÍNH BÀN',
            footerNote: 'Kiểm tra món kỹ trước khi thanh toán',
            fontSizePt: 8,
            blocks: {
              logo: false,
              address: false,
              phone: false,
              orderCode: false,
              cashier: false,
              itemModifiers: false,
              itemNotes: false,
              discountLine: true,
              bankInfo: false,
            },
          },
        },
      });

      render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            bill={{
              orderId: 901,
              orderCode: 'HD-20261115-0901',
              orderType: 'DINE_IN',
              tableId: 5,
              takeawayNumber: null,
              totalAmount: 110000,
              status: 'SERVING',
              cashierName: 'Nguyễn Minh Quân',
              paymentAccount: {
                id: 1,
                label: 'MB Chính',
                bankName: 'MB Bank',
                bankCode: 'MB',
                accountNo: '0123456789',
                accountName: 'CHU QUAN TEST',
              },
              items: [
                {
                  name: 'Mì Bò Mỹ',
                  quantity: 2,
                  unitPrice: 55000,
                  lineTotal: 110000,
                  modifiers: ['Cấp độ 3'],
                  note: 'Ít hành',
                },
              ],
            }}
            storeSettings={settings}
          />
        </ThermalPrintProvider>,
      );

      expect(screen.getByText('TẠM TÍNH BÀN')).toBeInTheDocument();
      expect(screen.getByTestId('provisional-discount-line')).toBeInTheDocument();
      expect(screen.getByTestId('provisional-receipt-footer')).toHaveTextContent(
        'Kiểm tra món kỹ trước khi thanh toán',
      );
      expect(screen.queryByTestId('provisional-receipt-logo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('provisional-vietqr-bank-account')).not.toBeInTheDocument();
      expect(screen.queryByText(/Nguyễn Minh Quân/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cấp độ 3/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Ít hành/)).not.toBeInTheDocument();
      // Hard Invariant 4 locked elements remain visible:
      expect(screen.getByText(/1\. Mì Bò Mỹ/)).toBeInTheDocument();
      expect(screen.getByTestId('provisional-total-amount')).toHaveTextContent('110.000 đ');
      expect(await screen.findByTestId('provisional-vietqr-image')).toBeInTheDocument();
      expect(screen.getByText(/Nội dung CK:/)).toBeInTheDocument();
    });

    it('hides optional cashier & payment breakdown on OfficialReceiptSlip while preserving logo when only provisional logo is toggled off (AC-16.2, AC-16.3)', () => {
      const settings = makePublicSettings({
        receipt: { ...DEFAULT_STORE_SETTINGS.receipt, showLogo: true },
        printTemplates: {
          ...DEFAULT_STORE_SETTINGS.printTemplates,
          provisional: {
            ...DEFAULT_STORE_SETTINGS.printTemplates.provisional,
            blocks: { ...DEFAULT_STORE_SETTINGS.printTemplates.provisional.blocks, logo: false },
          },
          official: {
            title: 'HOÁ ĐƠN BÁN LẺ',
            footerNote: 'Cảm ơn quý khách nhiều!',
            fontSizePt: 8,
            blocks: {
              logo: true,
              address: false,
              phone: false,
              orderCode: false,
              cashier: false,
              paymentBreakdown: false,
              itemModifiers: true,
              itemNotes: false,
            },
          },
        },
      });

      render(
        <OfficialReceiptSlip
          orderCode="HD-20261115-0902"
          tableLabel="BÀN 08"
          cashierName="Trần Thị Lan"
          paymentMethod="SPLIT"
          cashAmount={40000}
          transferAmount={60000}
          totalAmount={100000}
          items={[
            {
              name: 'Mì Kim Chi',
              quantity: 1,
              unitPrice: 100000,
              lineTotal: 100000,
              modifiers: ['Cấp độ 1', 'Thêm Thịt bò (20k)'],
              pricedModifiers: ['Thêm Thịt bò (20k)'],
              note: 'Không giá',
            },
          ]}
          storeSettings={settings}
        />,
      );

      expect(screen.getByText('HOÁ ĐƠN BÁN LẺ')).toBeInTheDocument();
      expect(screen.getByTestId('official-receipt-logo')).toBeInTheDocument();
      expect(screen.queryByText(/Trần Thị Lan/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('official-receipt-payment-breakdown')).not.toBeInTheDocument();
      expect(screen.queryByText(/Không giá/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cấp độ 1/)).not.toBeInTheDocument();
      expect(screen.getByText(/\+ Thêm Thịt bò \(20k\)/)).toBeInTheDocument();
      expect(screen.getByTestId('official-receipt-total-amount')).toHaveTextContent('100.000 đ');
      expect(screen.getByTestId('official-receipt-footer')).toHaveTextContent(
        'Cảm ơn quý khách nhiều!',
      );
    });

    it('applies free fontSizePt, kitchen SL header without Cấp độ cay, toppings without qty, and category unitPrice (AC-16.4, AC-16.6, AC-16.7)', () => {
      const settings = makePublicSettings({
        printTemplates: {
          ...DEFAULT_STORE_SETTINGS.printTemplates,
          kitchen: {
            title: 'BẾP CHÍNH',
            footerNote: 'Ưu tiên bàn VIP',
            fontSizePt: 11.5,
            priceCategoryIds: [2],
            blocks: {
              stationLogo: false,
              orderCode: false,
              time: false,
              itemNotes: false,
            },
          },
          kitchenCancel: {
            title: 'HUỶ GẤP',
            footerNote: 'Ngừng chế biến ngay',
            fontSizePt: 7,
            blocks: {
              time: false,
              reason: true,
            },
          },
          tableTransfer: {
            title: 'CHUYỂN BÀN BẾP',
            footerNote: 'Đưa từ {fromTable} qua {toTable} gấp!',
            fontSizePt: 8,
            blocks: {
              time: false,
              cashier: true,
            },
          },
        },
      });

      const { unmount } = render(
        <KitchenSplitSlip
          orderCode="HD-20261115-0903"
          tableLabel="BÀN 04"
          orderNote="Làm nhanh"
          tickets={[
            {
              station: 'BEP_NAU',
              stationTitle: 'BẾP NẤU (MÌ CAY)',
              logoType: 'CHEF_HAT_NOODLE',
              batchNo: 2,
              batchLabel: '[GỌI THÊM - LƯỢT 2]',
              items: [
                {
                  name: 'Lẩu Kim Chi',
                  qty: 2,
                  modifiers: ['Cấp độ 2', 'Thêm Thịt bò (20k)'],
                  note: 'Ít cay',
                  unitPrice: 199000,
                  categoryId: 2,
                },
              ],
            },
          ]}
          storeSettings={settings}
        />,
      );

      const kitchenPage = screen.getByTestId('kitchen-ticket-page-BEP_NAU');
      expect(kitchenPage).toHaveAttribute('data-font-size-pt', '11.5');
      expect(kitchenPage.style.fontSize).toBe('11.5pt');
      expect(screen.getByText('BẾP NẤU (MÌ CAY)')).toBeInTheDocument();
      expect(screen.queryByText(/CẤP ĐỘ CAY/i)).not.toBeInTheDocument();
      expect(screen.getByText('Lẩu Kim Chi — 199.000')).toBeInTheDocument();
      expect(screen.getByText('+ Thêm Thịt bò (20k)')).toBeInTheDocument();
      // Only main item has quantity '02', NOT the topping line
      expect(screen.getAllByText('02')).toHaveLength(1);
      expect(screen.getByTestId('kitchen-addon-batch-banner-BEP_NAU')).toBeInTheDocument();
      expect(screen.getByTestId('kitchen-custom-title-BEP_NAU')).toHaveTextContent('BẾP CHÍNH');
      expect(screen.getByTestId('kitchen-custom-footer-BEP_NAU')).toHaveTextContent(
        'Ưu tiên bàn VIP',
      );
      expect(screen.queryByTestId('kitchen-item-note-0')).not.toBeInTheDocument();
      unmount();

      const { unmount: unmountCancel } = render(
        <KitchenCancelItemSlip
          orderCode="HD-20261115-0903"
          slips={[{ station: 'BEP_CHIEN', tableLabel: 'BÀN 04', itemName: 'Khoai Chiên', quantity: 1 }]}
          storeSettings={settings}
        />,
      );
      const cancelPage = screen.getByTestId('kitchen-cancel-slip-BEP_CHIEN-0');
      expect(cancelPage).toHaveAttribute('data-font-size-pt', '7');
      expect(cancelPage.style.fontSize).toBe('7pt');
      expect(screen.getByText('HUỶ GẤP')).toBeInTheDocument();
      expect(screen.getByTestId('kitchen-cancel-reason-BEP_CHIEN-0')).toHaveTextContent(
        'Ngừng chế biến ngay',
      );
      unmountCancel();

      render(
        <TableTransferNoticeSlip
          orderCode="HD-20261115-0903"
          fromLabel="Bàn 02"
          toLabel="Bàn 09"
          affectedStations={['BEP_NAU']}
          cashierName="Trần Thị Lan"
          storeSettings={settings}
        />,
      );
      expect(screen.getByText('CHUYỂN BÀN BẾP')).toBeInTheDocument();
      expect(screen.getByTestId('table-transfer-cashier')).toHaveTextContent('Trần Thị Lan');
      expect(screen.getByTestId('table-transfer-footer')).toHaveTextContent(
        'Đưa từ BÀN 02 qua BÀN 09 gấp!',
      );
    });
  });

  describe('Story 18 — Discount 3-Line Breakdown on Provisional & Official Receipts', () => {
    it('renders TỔNG CỘNG TIỀN MÓN, GIẢM GIÁ (<code>), and TỔNG THANH TOÁN automatically when discountAmount > 0 even if discountLine toggle is false', () => {
      const settings: PublicStoreSettingsResponse = {
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: '2026-11-15T10:00:00.000Z',
        assets: { logo: null, favicon: null, qrLogo: null },
        printTemplates: {
          ...DEFAULT_STORE_SETTINGS.printTemplates,
          provisional: {
            ...DEFAULT_STORE_SETTINGS.printTemplates.provisional,
            blocks: {
              ...DEFAULT_STORE_SETTINGS.printTemplates.provisional.blocks,
              discountLine: false,
            },
          },
        },
      };

      const { unmount } = render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            storeSettings={settings}
            bill={{
              orderId: 902,
              orderCode: 'HD-20261115-0902',
              orderType: 'DINE_IN',
              tableId: 4,
              takeawayNumber: null,
              subtotalAmount: 200000,
              discountAmount: 20000,
              discountSnapshot: {
                kind: 'CODE',
                discountId: 1,
                code: 'GIAM10',
                name: 'Giảm 10%',
                valueType: 'PERCENT',
                value: 10,
                maxDiscountAmount: 20000,
                scope: 'ORDER',
                targetCategoryIds: [],
                targetProductIds: [],
                minOrderAmount: null,
                appliedAt: '2026-11-15T10:00:00.000Z',
                appliedBy: 1,
                reason: null,
              },
              totalAmount: 180000,
              status: 'SERVING',
              paymentAccount: {
                id: 1,
                label: 'VPBank',
                bankName: 'VPBank',
                bankCode: 'VPB',
                accountNo: '186877721',
                accountName: 'CHU QUAN',
              },
              items: [
                {
                  name: 'Mì Cay Bò Mỹ',
                  quantity: 2,
                  unitPrice: 100000,
                  lineTotal: 200000,
                  modifiers: [],
                  note: null,
                },
              ],
            }}
          />
        </ThermalPrintProvider>,
      );

      expect(screen.getByTestId('provisional-subtotal-amount')).toHaveTextContent('200.000 đ');
      expect(screen.getByTestId('provisional-discount-line')).toHaveTextContent('GIẢM GIÁ (GIAM10)');
      expect(screen.getByTestId('provisional-discount-line')).toHaveTextContent('-20.000 đ');
      expect(screen.getByTestId('provisional-total-amount')).toHaveTextContent('180.000 đ');
      unmount();

      render(
        <ThermalPrintProvider>
          <OfficialReceiptSlip
            storeSettings={settings}
            orderCode="HD-20261115-0902"
            tableLabel="Bàn 04"
            paymentMethod="CASH"
            cashAmount={180000}
            transferAmount={0}
            subtotalAmount={200000}
            discountAmount={20000}
            discountLabel="GIAM10"
            totalAmount={180000}
            items={[
              {
                name: 'Mì Cay Bò Mỹ',
                quantity: 2,
                unitPrice: 100000,
                lineTotal: 200000,
                modifiers: [],
                note: null,
              },
            ]}
          />
        </ThermalPrintProvider>,
      );

      expect(screen.getByTestId('official-receipt-subtotal-amount')).toHaveTextContent('200.000 đ');
      expect(screen.getByTestId('official-receipt-discount-line')).toHaveTextContent('GIẢM GIÁ (GIAM10)');
      expect(screen.getByTestId('official-receipt-discount-line')).toHaveTextContent('-20.000 đ');
      expect(screen.getByTestId('official-receipt-total-amount')).toHaveTextContent('180.000 đ');
    });

    it('formats ISO paidAt timestamps into Asia/Ho_Chi_Minh local time and wraps payment method label cleanly', () => {
      render(
        <ThermalPrintProvider>
          <OfficialReceiptSlip
            orderCode="HD-20261117-0001"
            tableLabel="Bàn 02"
            cashierName="Nguyễn Minh Quân"
            paidAt="2026-11-16T23:58:55.562Z"
            paymentMethod="SPLIT"
            cashAmount={49000}
            transferAmount={100000}
            totalAmount={149000}
            items={[
              {
                name: 'Mì Hải Sản',
                quantity: 1,
                unitPrice: 55000,
                lineTotal: 55000,
                modifiers: [],
                note: null,
              },
            ]}
          />
        </ThermalPrintProvider>,
      );

      const slip = screen.getByTestId('official-receipt-slip');
      expect(slip).toHaveTextContent('06:58:55 17/11/2026');
      expect(slip.textContent).not.toContain('2026-11-16T23:58:55.562Z');
      expect(screen.getByTestId('official-receipt-payment-method')).toHaveTextContent(
        'HỖN HỢP TIỀN MẶT + QR (SPLIT)',
      );
      expect(screen.getByTestId('official-receipt-payment-method').parentElement).toHaveClass(
        'flex-wrap',
        'gap-x-2',
      );
    });

    it('renders customized TableQrSlip copy for Takeaway, toggles link text, handles logo load failure, and signals ready-to-print', () => {
      const onReadyToPrint = vi.fn();
      const { rerender } = render(
        <TableQrSlip
          tableName="Đơn Mang Về"
          storeName="Ăn Vặt Tran"
          headline="QUÉT MÃ QR ĐẶT MÓN MANG VỀ"
          subtitle="Đặt mang về nhanh không cần xếp hàng"
          footerText="Mở Zalo quét mã"
          qrUrl="https://pos.micay.vn/q/mangve-qpy2"
          qrImageDataUrl="data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E"
          showLinkText={false}
          logoUrl="/api/v1/public/store-assets/qr-logo?v=1"
          onReadyToPrint={onReadyToPrint}
        />,
      );

      const slip = screen.getByTestId('thermal-table-qr-print-slip');
      expect(slip).toHaveTextContent('QUÉT MÃ QR ĐẶT MÓN MANG VỀ');
      expect(slip).toHaveTextContent('Đặt mang về nhanh không cần xếp hàng');
      expect(slip).toHaveTextContent('Mở Zalo quét mã');
      expect(slip).not.toHaveTextContent('mangve-qpy2');

      const logoImg = screen.getByTestId('thermal-table-qr-logo');
      fireEvent.error(logoImg);
      expect(screen.queryByTestId('thermal-table-qr-logo')).not.toBeInTheDocument();
      expect(onReadyToPrint).toHaveBeenCalledTimes(1);

      rerender(
        <TableQrSlip
          tableName="Bàn 01"
          qrUrl="https://pos.micay.vn/q/ban01-zry8"
          qrImageDataUrl="data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E"
          showLinkText={true}
        />,
      );
      expect(screen.getByTestId('thermal-table-qr-print-slip')).toHaveTextContent(
        'https://pos.micay.vn/q/ban01-zry8',
      );
    });

    it('centers "Tên món" header, appends drink size (M)/(L) to product names without duplicate modifier lines, and groups takeaway items under *** MANG VỀ *** on kitchen tickets', () => {
      const { unmount: unmountOfficial } = render(
        <ThermalPrintProvider>
          <OfficialReceiptSlip
            orderCode="HD-20261124-0001"
            tableLabel="Bàn 03"
            paymentMethod="CASH"
            cashAmount={82000}
            transferAmount={0}
            totalAmount={82000}
            items={[
              {
                name: 'Trà Đào Cam Sả',
                quantity: 1,
                unitPrice: 37000,
                lineTotal: 37000,
                modifiers: ['Size L', 'Trân châu trắng (5k)'],
                pricedModifiers: ['Size L', 'Trân châu trắng (5k)'],
                note: null,
                isTakeaway: true,
              },
              {
                name: 'Trà Sữa Truyền Thống',
                quantity: 1,
                unitPrice: 30000,
                lineTotal: 30000,
                modifiers: ['Size M'],
                pricedModifiers: [],
                note: null,
                isTakeaway: false,
              },
            ]}
          />
        </ThermalPrintProvider>,
      );

      const officialHeader = screen.getByRole('columnheader', { name: 'Tên món' });
      expect(officialHeader).toHaveClass('text-center');
      expect(officialHeader).toHaveAttribute('data-print-align', 'center');
      expect(screen.getByText('1. Trà Đào Cam Sả (L) [Mang về]')).toBeInTheDocument();
      expect(screen.getByText('2. Trà Sữa Truyền Thống (M)')).toBeInTheDocument();
      expect(screen.getByText('+ Trân châu trắng (5k)')).toBeInTheDocument();
      expect(screen.queryByText(/\+ Size L/)).not.toBeInTheDocument();
      unmountOfficial();

      const { unmount: unmountProvisional } = render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            bill={{
              orderId: 910,
              orderCode: 'HD-20261124-0910',
              orderType: 'DINE_IN',
              tableId: 3,
              takeawayNumber: null,
              totalAmount: 37000,
              status: 'SERVING',
              paymentAccount: {
                id: 1,
                label: 'VPBank',
                bankName: 'VPBank',
                bankCode: 'VPB',
                accountNo: '186877721',
                accountName: 'CHU QUAN',
              },
              items: [
                {
                  name: 'Trà Đào Cam Sả',
                  quantity: 1,
                  unitPrice: 37000,
                  lineTotal: 37000,
                  modifiers: ['Size L'],
                  pricedModifiers: ['Size L'],
                  note: null,
                  isTakeaway: true,
                },
              ],
            }}
          />
        </ThermalPrintProvider>,
      );

      const provisionalHeader = screen.getByRole('columnheader', { name: 'Tên món' });
      expect(provisionalHeader).toHaveClass('text-center');
      expect(provisionalHeader).toHaveAttribute('data-print-align', 'center');
      expect(screen.getByText('1. Trà Đào Cam Sả (L) [Mang về]')).toBeInTheDocument();
      expect(screen.queryByText(/\+ Size L/)).not.toBeInTheDocument();
      unmountProvisional();

      render(
        <KitchenSplitSlip
          orderCode="HD-20261124-0910"
          tableLabel="BÀN 03"
          tickets={[
            {
              station: 'PHA_CHE',
              stationTitle: 'QUẦY PHA CHẾ & NƯỚC',
              logoType: 'DRINK_CUP',
              batchNo: 2,
              batchLabel: '[GỌI THÊM - LƯỢT 2]',
              items: [
                {
                  name: 'Trà Sữa Truyền Thống',
                  qty: 1,
                  modifiers: ['Size M'],
                  note: '',
                  isTakeaway: false,
                },
                {
                  name: 'Trà Đào Cam Sả',
                  qty: 2,
                  modifiers: ['Size L', 'Trân châu trắng (5k)'],
                  note: '',
                  isTakeaway: true,
                },
              ],
            },
          ]}
        />,
      );

      expect(screen.getByText('Trà Sữa Truyền Thống (M)')).toBeInTheDocument();
      const takeawaySection = screen.getByTestId('kitchen-takeaway-section-PHA_CHE');
      expect(takeawaySection).toHaveTextContent('*** MANG VỀ ***');
      expect(takeawaySection).toHaveTextContent('Trà Đào Cam Sả (L)');
      expect(takeawaySection).toHaveTextContent('+ Trân châu trắng (5k)');
      expect(takeawaySection).not.toHaveTextContent('+ Size L');
    });

    it('renders LETTER takeaway labels (#A, #AA, MVAA) cleanly on kitchen split and provisional VietQR slips', () => {
      const { unmount: unmountKitchen } = render(
        <KitchenSplitSlip
          orderCode="HD-20261127-0005"
          orderType="TAKEAWAY"
          takeawayNumber={5}
          takeawayLabelFormat="LETTER"
          tickets={[
            {
              station: 'BEP_NAU',
              stationTitle: 'BẾP NẤU',
              logoType: 'CHEF_HAT_NOODLE',
              batchNo: 1,
              batchLabel: '[LƯỢT 1]',
              items: [
                {
                  name: 'Mì Cay Xúc Xích',
                  qty: 2,
                  modifiers: ['Cấp độ 2'],
                  note: 'Ít hành',
                },
              ],
            },
          ]}
        />,
      );

      expect(screen.getByTestId('kitchen-ticket-page-BEP_NAU')).toHaveTextContent('MANG VỀ #AA');
      unmountKitchen();

      render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            bill={{
              orderId: 911,
              orderCode: 'HD-20261127-0005',
              orderType: 'TAKEAWAY',
              tableId: null,
              takeawayNumber: 5,
              takeawayLabelFormat: 'LETTER',
              totalAmount: 80000,
              status: 'SERVING',
              paymentAccount: {
                id: 1,
                label: 'VPBank',
                bankName: 'VPBank',
                bankCode: 'VPB',
                accountNo: '186877721',
                accountName: 'CHU QUAN',
              },
              vietQrPayload: 'data:image/png;base64,ZmFrZQ==',
              items: [
                {
                  name: 'Mì Cay Xúc Xích',
                  quantity: 2,
                  unitPrice: 40000,
                  lineTotal: 80000,
                  modifiers: ['Cấp độ 2'],
                  pricedModifiers: [],
                  note: null,
                },
              ],
            }}
          />
        </ThermalPrintProvider>,
      );

      expect(screen.getByTestId('provisional-vietqr-slip')).toHaveTextContent('MANG VỀ #AA');
      expect(screen.getByTestId('provisional-vietqr-slip')).toHaveTextContent('TT MVAA');
    });

    it('merges same-price/same-topping items and splits different-price, different-topping, different-size, and [Mang về] items on Provisional & Official slips', () => {
      const mixedReceiptItems = [
        {
          name: 'Mì Thập Cẩm',
          quantity: 1,
          unitPrice: 45000,
          lineTotal: 45000,
          modifiers: ['Cấp độ 1', 'Không hành'],
          pricedModifiers: [],
          note: null,
          isTakeaway: false,
        },
        {
          name: 'Mì Thập Cẩm',
          quantity: 1,
          unitPrice: 45000,
          lineTotal: 45000,
          modifiers: ['Cấp độ 3', 'Không Ngao'],
          pricedModifiers: [],
          note: 'Ít nước',
          isTakeaway: false,
        },
        {
          name: 'Mì Thập Cẩm',
          quantity: 1,
          unitPrice: 50000,
          lineTotal: 50000,
          modifiers: ['Cấp độ 2', 'Kim chi (5k)'],
          pricedModifiers: ['Kim chi (5k)'],
          note: null,
          isTakeaway: false,
        },
        {
          name: 'Mì Thập Cẩm',
          quantity: 1,
          unitPrice: 50000,
          lineTotal: 50000,
          modifiers: ['Cấp độ 0', 'Kim chi (5k)'],
          pricedModifiers: ['Kim chi (5k)'],
          note: null,
          isTakeaway: false,
        },
        {
          name: 'Mì Thập Cẩm',
          quantity: 1,
          unitPrice: 50000,
          lineTotal: 50000,
          modifiers: ['Cấp độ 1', 'Xúc xích (5k)'],
          pricedModifiers: ['Xúc xích (5k)'],
          note: null,
          isTakeaway: false,
        },
        {
          name: 'Mì Thập Cẩm',
          quantity: 1,
          unitPrice: 45000,
          lineTotal: 45000,
          modifiers: ['Cấp độ 1'],
          pricedModifiers: [],
          note: null,
          isTakeaway: true,
        },
        {
          name: 'Trà Sữa Matcha',
          quantity: 2,
          unitPrice: 30000,
          lineTotal: 60000,
          modifiers: ['Size M'],
          pricedModifiers: [],
          note: null,
          isTakeaway: false,
        },
        {
          name: 'Trà Sữa Matcha',
          quantity: 1,
          unitPrice: 30000,
          lineTotal: 30000,
          modifiers: ['Size M', 'Ít đá'],
          pricedModifiers: [],
          note: null,
          isTakeaway: false,
        },
        {
          name: 'Trà Sữa Matcha',
          quantity: 1,
          unitPrice: 35000,
          lineTotal: 35000,
          modifiers: ['Size L'],
          pricedModifiers: ['Size L'],
          note: null,
          isTakeaway: false,
        },
      ];

      const { unmount: unmountProvisional } = render(
        <ThermalPrintProvider>
          <ProvisionalVietQrSlip
            bill={{
              orderId: 912,
              orderCode: 'HD-20261127-0912',
              orderType: 'DINE_IN',
              tableId: 10,
              takeawayNumber: null,
              totalAmount: 410000,
              status: 'SERVING',
              paymentAccount: {
                id: 1,
                label: 'BIDV',
                bankName: 'BIDV',
                bankCode: 'BIDV',
                accountNo: '8878564012',
                accountName: 'TRAN VAN HUNG',
              },
              vietQrPayload: 'data:image/png;base64,ZmFrZQ==',
              items: mixedReceiptItems,
            }}
          />
        </ThermalPrintProvider>,
      );

      const provisionalRows = screen
        .getByTestId('provisional-items-table')
        .querySelectorAll('tbody tr');
      expect(provisionalRows).toHaveLength(6);
      expect(provisionalRows[0]).toHaveTextContent('1. Mì Thập Cẩm');
      expect(provisionalRows[0]).toHaveTextContent('290.000');
      expect(provisionalRows[1]).toHaveTextContent('2. Mì Thập Cẩm+ Kim chi (5k)');
      expect(provisionalRows[1]).toHaveTextContent('2100.000');
      expect(provisionalRows[2]).toHaveTextContent('3. Mì Thập Cẩm+ Xúc xích (5k)');
      expect(provisionalRows[2]).toHaveTextContent('150.000');
      expect(provisionalRows[3]).toHaveTextContent('4. Mì Thập Cẩm [Mang về]');
      expect(provisionalRows[3]).toHaveTextContent('145.000');
      expect(provisionalRows[4]).toHaveTextContent('5. Trà Sữa Matcha (M)');
      expect(provisionalRows[4]).toHaveTextContent('390.000');
      expect(provisionalRows[5]).toHaveTextContent('6. Trà Sữa Matcha (L)');
      expect(provisionalRows[5]).toHaveTextContent('135.000');
      unmountProvisional();

      render(
        <ThermalPrintProvider>
          <OfficialReceiptSlip
            orderCode="HD-20261127-0912"
            tableLabel="Bàn 10"
            paymentMethod="CASH"
            cashAmount={410000}
            transferAmount={0}
            totalAmount={410000}
            items={mixedReceiptItems}
          />
        </ThermalPrintProvider>,
      );

      const officialRows = screen
        .getByTestId('official-items-table')
        .querySelectorAll('tbody tr');
      expect(officialRows).toHaveLength(6);
      expect(officialRows[0]).toHaveTextContent('1. Mì Thập Cẩm');
      expect(officialRows[0]).toHaveTextContent('290.000');
      expect(officialRows[1]).toHaveTextContent('2. Mì Thập Cẩm+ Kim chi (5k)');
      expect(officialRows[1]).toHaveTextContent('2100.000');
      expect(officialRows[4]).toHaveTextContent('5. Trà Sữa Matcha (M)');
      expect(officialRows[4]).toHaveTextContent('390.000');
      expect(officialRows[5]).toHaveTextContent('6. Trà Sữa Matcha (L)');
      expect(officialRows[5]).toHaveTextContent('135.000');
    });
  });
});
