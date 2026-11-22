import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCommitSearch } from '@/lib/use-commit-search';

function SearchHarness({
  committedValue,
  onCommit,
}: {
  committedValue: string;
  onCommit: (nextValue: string) => void;
}) {
  const search = useCommitSearch(committedValue, onCommit);
  return (
    <div>
      <button type="button" data-testid="outside-spot">
        Ngoài vùng tìm kiếm
      </button>
      <div ref={search.containerRef}>
        <input data-testid="search-input" {...search.inputProps} />
        <button type="button" data-testid="clear-btn" onClick={search.clear}>
          Xoá
        </button>
      </div>
    </div>
  );
}

describe('useCommitSearch', () => {
  it('buffers typing without calling onCommit and commits on Enter (ignoring IME composing)', () => {
    const onCommit = vi.fn();
    render(<SearchHarness committedValue="" onCommit={onCommit} />);
    const input = screen.getByTestId('search-input');

    fireEvent.change(input, { target: { value: 'Mì cay' } });
    expect(onCommit).not.toHaveBeenCalled();

    // IME composition Enter should not commit prematurely
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Mì cay');
  });

  it('commits on blur and on outside pointerdown/touchstart (mobile tap outside)', () => {
    const onCommit = vi.fn();
    render(<SearchHarness committedValue="" onCommit={onCommit} />);
    const input = screen.getByTestId('search-input');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Bàn 03' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('outside-spot'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Bàn 03');

    // Subsequent blur should not double-commit the same value
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('resets draft and triggers onCommit immediately when clear() is called', () => {
    const onCommit = vi.fn();
    render(<SearchHarness committedValue="Trà đào" onCommit={onCommit} />);
    const input = screen.getByTestId('search-input') as HTMLInputElement;

    expect(input.value).toBe('Trà đào');
    fireEvent.click(screen.getByTestId('clear-btn'));

    expect(input.value).toBe('');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('');
  });
});
