import { type OrderDetailResponse } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CurrencyInput } from '@/components/ui/currency-input';
import { CancelOrderConfirmDialog } from '../cancel-order-confirm-dialog';
import { DraftDiscardButton } from '../draft-discard-button';

const MOCK_ORDER: OrderDetailResponse = {
  orderId: 101,
  orderCode: 'HD-20261123-0101',
  orderType: 'DINE_IN',
  orderSource: 'POS_COUNTER',
  tableId: 2,
  tableLabel: 'Bàn 02',
  takeawayNumber: null,
  status: 'SERVING',
  paymentMethod: null,
  cashAmount: 0,
  transferAmount: 0,
  subtotalAmount: 150000,
  discountAmount: 0,
  totalAmount: 150000,
  note: null,
  createdAt: '2026-11-23T06:00:00.000Z',
  paidAt: null,
  tableTransferLogs: [],
  items: [
    {
      id: 1,
      productId: 10,
      categoryId: 1,
      name: 'Mì Cay Hải Sản',
      quantity: 2,
      unitPrice: 50000,
      lineTotal: 100000,
      modifiers: ['Cấp độ 2'],
      itemNote: null,
      batchNo: 1,
      kitchenStatus: 'PRINTED',
    },
    {
      id: 2,
      productId: 11,
      categoryId: 3,
      name: 'Trà Đào',
      quantity: 1,
      unitPrice: 50000,
      lineTotal: 50000,
      modifiers: [],
      itemNote: null,
      batchNo: 1,
      kitchenStatus: 'NEW',
    },
  ],
};

describe('CancelOrderConfirmDialog', () => {
  it('shows order summary, printed kitchen warning, quick reason chips, and calls onConfirm with selected reason', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CancelOrderConfirmDialog
        open
        onOpenChange={onOpenChange}
        order={MOCK_ORDER}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Bàn 02/)).toBeInTheDocument();
    expect(screen.getByText(/3 món/)).toBeInTheDocument();
    expect(screen.getByTestId('cancel-order-printed-warning')).toHaveTextContent('2 món đã báo bếp');

    // Switch to custom reason: < 10 chars disables confirm button
    fireEvent.click(screen.getByTestId('cancel-reason-chip-custom'));
    const input = screen.getByTestId('cancel-order-custom-reason-input');
    fireEvent.change(input, { target: { value: 'Quá ngắn' } });
    expect(screen.getByTestId('btn-cancel-order-confirm')).toBeDisabled();
    expect(screen.getByTestId('cancel-order-reason-error')).toBeInTheDocument();

    // >= 10 chars enables confirm button
    fireEvent.change(input, { target: { value: 'Khách có việc gấp phải rời đi ngay' } });
    expect(screen.getByTestId('btn-cancel-order-confirm')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('btn-cancel-order-confirm'));

    expect(onConfirm).toHaveBeenCalledWith('Khách có việc gấp phải rời đi ngay');
  });

  it('dismisses without calling onConfirm when clicking Quay lại', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CancelOrderConfirmDialog
        open
        onOpenChange={onOpenChange}
        order={MOCK_ORDER}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('btn-cancel-order-dismiss'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('exercises DraftDiscardButton confirm/dismiss and CurrencyInput dot-separator backspace + ref', async () => {
    const onDiscard = vi.fn().mockResolvedValueOnce(true);
    render(
      <DraftDiscardButton disabled={false} pending={false} onDiscard={onDiscard} testId="discard-btn" />,
    );

    fireEvent.click(screen.getByTestId('discard-btn'));
    expect(await screen.findByText('Bỏ toàn bộ giỏ chưa gửi?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => expect(screen.queryByText('Bỏ toàn bộ giỏ chưa gửi?')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('discard-btn'));
    fireEvent.click(await screen.findByTestId('confirm-discard-draft'));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledTimes(1));

    const refObj = React.createRef<HTMLInputElement>();
    const onValueChange = vi.fn();
    render(
      <CurrencyInput
        ref={refObj}
        data-testid="curr-input"
        value={100000}
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByTestId('curr-input') as HTMLInputElement;
    expect(input.value).toBe('100.000');
    input.setSelectionRange(4, 4); // right after the dot separator in "100.|000"
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onValueChange).toHaveBeenCalledWith('10000', 10000);
    fireEvent.change(input, { target: { value: '' } });
    expect(onValueChange).toHaveBeenCalledWith('', null);
  });
});
