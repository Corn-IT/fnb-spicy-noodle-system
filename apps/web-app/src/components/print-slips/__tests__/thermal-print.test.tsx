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
  buildVietQrFallbackSvgDataUrl,
  buildVietQrImageUrl,
  KitchenCancelItemSlip,
  KitchenSplitSlip,
  OfficialReceiptSlip,
  ProvisionalVietQrSlip,
  StationLogo,
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

      const qrImg = screen.getByTestId('provisional-vietqr-image') as HTMLImageElement;
      expect(qrImg).toBeInTheDocument();
      expect(qrImg.src).toContain('amount=220000');

      // Crucial: window.print() MUST NOT be called before image finishes loading
      expect(printSpy).not.toHaveBeenCalled();

      // Simulate VietQR image load complete
      fireEvent.load(qrImg);

      await waitFor(() => {
        expect(printSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should fallback to internal SVG QR data URL and still call window.print() when external VietQR image fails to load (onError)', async () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      const fallbackSvg = buildVietQrFallbackSvgDataUrl({
        amount: 185000,
        orderCode: 'HD-20261108-0099',
      });
      expect(fallbackSvg.startsWith('data:image/svg+xml;utf8,')).toBe(true);

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
              vietQrPayload: 'https://img.vietqr.io/broken-network.png?amount=185000',
              items: [
                {
                  name: 'Mì Hải Sản',
                  quantity: 1,
                  unitPrice: 185000,
                  lineTotal: 185000,
                  modifiers: ['Cấp 2'],
                  note: null,
                },
              ],
            }}
            onReadyToPrint={() => window.print()}
          />
        </ThermalPrintProvider>,
      );

      const qrImg = screen.getByTestId('provisional-vietqr-image') as HTMLImageElement;
      expect(printSpy).not.toHaveBeenCalled();

      // Simulate network error on external VietQR image
      fireEvent.error(qrImg);

      await waitFor(() => {
        expect(qrImg.src.startsWith('data:image/svg+xml;utf8,')).toBe(true);
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

    it('customizes ProvisionalVietQrSlip blocks and keeps VietQR + total locked even when optional blocks are disabled (AC-16.3, AC-16.4, AC-16.5)', () => {
      const settings = makePublicSettings({
        receipt: { ...DEFAULT_STORE_SETTINGS.receipt, showLogo: true },
        printTemplates: {
          ...DEFAULT_STORE_SETTINGS.printTemplates,
          provisional: {
            title: 'TẠM TÍNH BÀN',
            footerNote: 'Kiểm tra món kỹ trước khi thanh toán',
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
      expect(screen.getByText('Mì Bò Mỹ')).toBeInTheDocument();
      expect(screen.getByTestId('provisional-total-amount')).toHaveTextContent('110.000 đ');
      expect(screen.getByTestId('provisional-vietqr-image')).toBeInTheDocument();
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
              modifiers: ['Cấp độ 1'],
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
      expect(screen.getByText(/\+ Cấp độ 1/)).toBeInTheDocument();
      expect(screen.getByTestId('official-receipt-total-amount')).toHaveTextContent('100.000 đ');
      expect(screen.getByTestId('official-receipt-footer')).toHaveTextContent(
        'Cảm ơn quý khách nhiều!',
      );
    });

    it('applies kitchen and kitchenCancel fontSize scales (sm/md/lg) and custom TableTransferNoticeSlip placeholders (AC-16.4, AC-16.6, AC-16.7)', () => {
      const settings = makePublicSettings({
        printTemplates: {
          ...DEFAULT_STORE_SETTINGS.printTemplates,
          kitchen: {
            title: 'BẾP CHÍNH',
            footerNote: 'Ưu tiên bàn VIP',
            fontSize: 'lg',
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
            fontSize: 'sm',
            blocks: {
              time: false,
              reason: true,
            },
          },
          tableTransfer: {
            title: 'CHUYỂN BÀN BẾP',
            footerNote: 'Đưa từ {fromTable} qua {toTable} gấp!',
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
              items: [{ name: 'Mì Hải Sản', qty: 1, modifiers: ['Cấp độ 2'], note: 'Ít cay' }],
            },
          ]}
          storeSettings={settings}
        />,
      );

      const kitchenPage = screen.getByTestId('kitchen-ticket-page-BEP_NAU');
      expect(kitchenPage).toHaveAttribute('data-font-size', 'lg');
      expect(kitchenPage.className).toContain('text-sm');
      expect(kitchenPage.className).toContain('break-words');
      expect(screen.getByText('BẾP NẤU (MÌ CAY)')).toBeInTheDocument();
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
      expect(cancelPage).toHaveAttribute('data-font-size', 'sm');
      expect(cancelPage.className).toContain('text-[11px]');
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
  });
});
