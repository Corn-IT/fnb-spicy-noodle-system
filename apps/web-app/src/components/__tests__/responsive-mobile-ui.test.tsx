import { type ColumnDef } from '@tanstack/react-table';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BaseTable } from '@/components/base-table/base-table';
import { TruncatedTextWithTooltip } from '@/components/ui/truncated-text-with-tooltip';

interface SampleRow {
  id: number;
  code: string;
  note: string;
  amount: string;
}

const sampleColumns: ColumnDef<SampleRow, unknown>[] = [
  { id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 },
  { accessorKey: 'code', header: 'Mã HĐ' },
  { accessorKey: 'note', header: 'Ghi chú' },
  { accessorKey: 'amount', header: 'Tổng tiền' },
  {
    id: 'actions',
    header: 'Thao tác',
    cell: () => <button type="button">Chi tiết</button>,
  },
];

const sampleData: SampleRow[] = [
  {
    id: 1,
    code: 'HD-20261124-0001',
    note: 'Khách yêu cầu tách nước dùng và mì riêng để mang về',
    amount: '146.000 đ',
  },
];

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('Responsive Mobile & Tablet UI primitives', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders BaseTable as mobile cards on < 768px and toggles to table view on click', () => {
    mockMatchMedia(true);

    render(
      <BaseTable<SampleRow>
        tableId="responsive-test-table"
        data={sampleData}
        columns={sampleColumns}
      />,
    );

    expect(screen.getByTestId('base-table-mobile-cards')).toBeInTheDocument();
    expect(screen.getByText('HD-20261124-0001')).toBeInTheDocument();
    expect(screen.getByText('146.000 đ')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const amountValueCell = screen.getByText('146.000 đ');
    expect(amountValueCell).toHaveClass('items-end', 'text-right');

    fireEvent.click(screen.getByTestId('base-table-view-toggle'));

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table.parentElement).not.toHaveClass('touch-pan-x');
    expect(screen.queryByTestId('base-table-mobile-cards')).not.toBeInTheDocument();
  });

  it('allows touch users to tap TruncatedTextWithTooltip to expand truncated text', () => {
    const longText = 'Ghi chú rất dài vượt quá chiều rộng ô bảng trên màn hình điện thoại di động';
    let resizeCallback: (() => void) | null = null;
    const OriginalResizeObserver = globalThis.ResizeObserver;
    class MockResizeObserver {
      constructor(cb: () => void) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const { container } = render(<TruncatedTextWithTooltip text={longText} />);
      const span = container.querySelector('span') as HTMLSpanElement;

      Object.defineProperty(span, 'scrollWidth', { configurable: true, value: 420 });
      Object.defineProperty(span, 'clientWidth', { configurable: true, value: 120 });

      act(() => {
        resizeCallback?.();
      });

      expect(span).toHaveAttribute('role', 'button');
      expect(span).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(span);
      expect(span).toHaveAttribute('aria-expanded', 'true');
      expect(span).toHaveClass('whitespace-normal');
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });
});
