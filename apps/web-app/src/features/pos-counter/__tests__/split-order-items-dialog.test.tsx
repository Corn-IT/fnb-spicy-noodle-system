import { OrderSource, OrderStatus, OrderType, PaymentMethod, type OrderDetailResponse } from '@fnb/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SplitOrderItemsDialog } from '../components/split-order-items-dialog';

const sampleOrder: OrderDetailResponse = {
  orderId: 50,
  orderCode: 'HD-20261127-0050',
  orderType: OrderType.DINE_IN,
  orderSource: OrderSource.POS_COUNTER,
  tableId: 4,
  tableLabel: 'Bàn 04',
  takeawayNumber: null,
  status: OrderStatus.SERVING,
  subtotalAmount: 280000,
  discountAmount: 0,
  totalAmount: 280000,
  discountSnapshot: null,
  paymentMethod: null,
  cashAmount: 0,
  transferAmount: 0,
  note: null,
  createdAt: '2026-11-27T10:00:00.000Z',
  paidAt: null,
  tableTransferLogs: [],
  items: [
    {
      id: 101,
      productId: 11,
      name: 'Mì Kim Chi Bò Mỹ',
      quantity: 3,
      unitPrice: 60000,
      lineTotal: 180000,
      modifiers: ['Cấp độ 3', 'Thêm trứng (+10.000đ)'],
      pricedModifiers: ['Thêm trứng (+10.000đ)'],
      itemNote: 'Ít hành',
      batchNo: 1,
      kitchenStatus: 'PRINTED',
      isTakeaway: false,
    },
    {
      id: 102,
      productId: 12,
      name: 'Trà Đào Cam Sả',
      quantity: 1,
      unitPrice: 30000,
      lineTotal: 30000,
      modifiers: [],
      itemNote: null,
      batchNo: 1,
      kitchenStatus: 'NEW',
      isTakeaway: true,
    },
    {
      id: 103,
      productId: 13,
      name: 'Món Đã Huỷ',
      quantity: 2,
      unitPrice: 35000,
      lineTotal: 70000,
      modifiers: [],
      itemNote: null,
      batchNo: 1,
      kitchenStatus: 'CANCELLED',
    },
  ],
};

describe('SplitOrderItemsDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('handles null order safely and runs PROVISIONAL split selection with quantity +/- controls', () => {
    const onOpenChange = vi.fn();
    const onPrintSplitProvisional = vi.fn();
    const onConfirmSplitCheckout = vi.fn();

    const { rerender } = render(
      <SplitOrderItemsDialog
        open
        onOpenChange={onOpenChange}
        mode="PROVISIONAL"
        order={null}
        isSubmitting={false}
        onPrintSplitProvisional={onPrintSplitProvisional}
        onConfirmSplitCheckout={onConfirmSplitCheckout}
      />,
    );
    expect(screen.queryByTestId('split-order-items-dialog')).not.toBeInTheDocument();

    rerender(
      <SplitOrderItemsDialog
        open
        onOpenChange={onOpenChange}
        mode="PROVISIONAL"
        order={sampleOrder}
        isSubmitting={false}
        onPrintSplitProvisional={onPrintSplitProvisional}
        onConfirmSplitCheckout={onConfirmSplitCheckout}
      />,
    );

    expect(screen.getByText(/Tách đơn In Tạm Tính — Bàn 04/)).toBeInTheDocument();
    expect(screen.queryByTestId('split-item-row-103')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-split-provisional-btn')).toBeDisabled();

    // Toggle item 101 selects full qty (3 -> 180,000), then decrement once (2 -> 120,000)
    fireEvent.click(screen.getByTestId('split-item-toggle-101'));
    expect(screen.getByTestId('split-item-qty-101')).toHaveTextContent('3/3');
    const row101 = screen.getByTestId('split-item-row-101');
    const rowButtons = row101.querySelectorAll('button');
    // [0] toggle button, [1] minus button, [2] plus button
    fireEvent.click(rowButtons[1]!);
    expect(screen.getByTestId('split-item-qty-101')).toHaveTextContent('2/3');

    // Toggle takeaway item 102 (+30,000 => total 150,000)
    fireEvent.click(screen.getByTestId('split-item-toggle-102'));
    expect(screen.getByTestId('split-selected-total').textContent).toContain('150');

    // Plus/minus untoggle check on item 102 then re-add via +
    const row102Buttons = screen.getByTestId('split-item-row-102').querySelectorAll('button');
    fireEvent.click(row102Buttons[1]!);
    expect(screen.getByTestId('split-item-qty-102')).toHaveTextContent('0/1');
    fireEvent.click(row102Buttons[2]!);
    expect(screen.getByTestId('split-item-qty-102')).toHaveTextContent('1/1');

    fireEvent.click(screen.getByTestId('confirm-split-provisional-btn'));
    expect(onPrintSplitProvisional).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          orderItemId: 101,
          quantity: 2,
          lineTotal: 120000,
          pricedModifiers: ['Thêm trứng (+10.000đ)'],
        }),
        expect.objectContaining({
          orderItemId: 102,
          quantity: 1,
          lineTotal: 30000,
          isTakeaway: true,
        }),
      ],
      150000,
    );

    // Toggle item 102 off and dismiss dialog
    fireEvent.click(screen.getByTestId('split-item-toggle-102'));
    expect(screen.getByTestId('split-item-qty-102')).toHaveTextContent('0/1');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bỏ' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('validates CASH, TRANSFER, and SPLIT payments in CHECKOUT mode and submits exact payloads', () => {
    const onConfirmSplitCheckout = vi.fn();

    render(
      <SplitOrderItemsDialog
        open
        onOpenChange={vi.fn()}
        mode="CHECKOUT"
        order={{ ...sampleOrder, tableLabel: null }}
        isSubmitting={false}
        onPrintSplitProvisional={vi.fn()}
        onConfirmSplitCheckout={onConfirmSplitCheckout}
      />,
    );

    expect(screen.getByText(/Tách đơn Thanh Toán — HD-20261127-0050/)).toBeInTheDocument();

    // Select item 101 full quantity (3 * 60,000 = 180,000)
    fireEvent.click(screen.getByTestId('split-item-toggle-101'));

    // CASH no print
    fireEvent.click(screen.getByTestId('confirm-split-checkout-noprint-btn'));
    expect(onConfirmSplitCheckout).toHaveBeenLastCalledWith(
      {
        items: [{ orderItemId: 101, quantity: 3 }],
        paymentMethod: PaymentMethod.CASH,
        cashAmount: 180000,
        transferAmount: 0,
        printReceipt: false,
      },
      expect.any(Array),
      180000,
    );

    // TRANSFER with print
    fireEvent.click(screen.getByTestId(`split-payment-method-${PaymentMethod.TRANSFER}`));
    fireEvent.click(screen.getByTestId('confirm-split-checkout-print-btn'));
    expect(onConfirmSplitCheckout).toHaveBeenLastCalledWith(
      {
        items: [{ orderItemId: 101, quantity: 3 }],
        paymentMethod: PaymentMethod.TRANSFER,
        cashAmount: 0,
        transferAmount: 180000,
        printReceipt: true,
      },
      expect.any(Array),
      180000,
    );

    // SPLIT mismatch blocks checkout until cash + transfer === 180,000
    fireEvent.click(screen.getByTestId(`split-payment-method-${PaymentMethod.SPLIT}`));
    fireEvent.change(screen.getByTestId('split-order-cash-input'), { target: { value: '100000' } });
    fireEvent.change(screen.getByTestId('split-order-transfer-input'), { target: { value: '50000' } });
    expect(screen.getByText(/Cần khớp đúng/)).toBeInTheDocument();
    expect(screen.getByTestId('confirm-split-checkout-print-btn')).toBeDisabled();

    fireEvent.change(screen.getByTestId('split-order-transfer-input'), { target: { value: '80000' } });
    expect(screen.getByText(/Tổng tiền mặt \+ chuyển khoản khớp với phần tách/)).toBeInTheDocument();
    expect(screen.getByTestId('confirm-split-checkout-print-btn')).toBeEnabled();

    fireEvent.click(screen.getByTestId('confirm-split-checkout-print-btn'));
    expect(onConfirmSplitCheckout).toHaveBeenLastCalledWith(
      {
        items: [{ orderItemId: 101, quantity: 3 }],
        paymentMethod: PaymentMethod.SPLIT,
        cashAmount: 100000,
        transferAmount: 80000,
        printReceipt: true,
      },
      expect.any(Array),
      180000,
    );
  });
});
