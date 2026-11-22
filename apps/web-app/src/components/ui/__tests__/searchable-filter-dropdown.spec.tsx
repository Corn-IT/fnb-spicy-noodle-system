import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchableFilterDropdown } from '@/components/ui/searchable-filter-dropdown';

const SAMPLE_OPTIONS = [
  { value: '1', label: 'Mỳ Cay Kim Chi Hàn Quốc' },
  { value: '2', label: 'Trà Sữa Truyền Thống' },
  { value: '3', label: 'Nước Ép Hoa Quả' },
];

describe('SearchableFilterDropdown', () => {
  it('defaults to "Tất cả danh mục", filters options via Vietnamese search without auto-focusing, and toggles back on re-select', () => {
    const onChange = vi.fn();
    render(
      <div>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <SearchableFilterDropdown
          value="ALL"
          options={SAMPLE_OPTIONS}
          onChange={onChange}
          triggerTestId="cat-trigger"
          optionTestIdPrefix="cat-opt"
        />
      </div>,
    );

    const trigger = screen.getByTestId('cat-trigger');
    expect(trigger).toHaveTextContent('Tất cả danh mục');

    fireEvent.click(trigger);
    const searchInput = screen.getByTestId('cat-trigger-search');
    expect(document.activeElement).not.toBe(searchInput);

    // Unaccented Vietnamese query matches accented option
    fireEvent.change(searchInput, { target: { value: 'tra sua' } });
    expect(screen.queryByTestId('cat-opt-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('cat-opt-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cat-opt-2'));
    expect(onChange).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on outside tap/click and resets selected option back to ALL when clicked again', () => {
    const onChange = vi.fn();
    render(
      <div>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <SearchableFilterDropdown
          value="2"
          options={SAMPLE_OPTIONS}
          onChange={onChange}
          triggerTestId="cat-trigger"
          optionTestIdPrefix="cat-opt"
        />
      </div>,
    );

    fireEvent.click(screen.getByTestId('cat-trigger'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Re-selecting current option toggles back to ALL
    fireEvent.click(screen.getByTestId('cat-opt-2'));
    expect(onChange).toHaveBeenCalledWith('ALL');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Outside click closes dropdown
    fireEvent.click(screen.getByTestId('cat-trigger'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
