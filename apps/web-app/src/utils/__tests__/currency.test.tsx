import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { CurrencyInput } from '@/components/ui/currency-input';
import {
  extractCurrencyDigits,
  formatCurrencyDigits,
  formatVnd,
  parseCurrencyValue,
} from '@/utils/currency';

function ControlledCurrencyHarness({ initial = '' }: { initial?: string }) {
  const [raw, setRaw] = React.useState(initial);
  const [numeric, setNumeric] = React.useState<number | null>(
    initial ? Number(initial) : null,
  );
  return (
    <div>
      <CurrencyInput
        data-testid="currency-field"
        value={raw}
        onValueChange={(digits, num) => {
          setRaw(digits);
          setNumeric(num);
        }}
      />
      <span data-testid="raw-val">{raw}</span>
      <span data-testid="num-val">{numeric === null ? 'null' : String(numeric)}</span>
    </div>
  );
}

describe('currency utilities & CurrencyInput', () => {
  it('formats and parses vi-VN dot-separated amounts accurately', () => {
    expect(extractCurrencyDigits('100.000 đ')).toBe('100000');
    expect(extractCurrencyDigits('00015000')).toBe('15000');
    expect(extractCurrencyDigits('0')).toBe('0');
    expect(formatCurrencyDigits('100000')).toBe('100.000');
    expect(formatCurrencyDigits('1250000')).toBe('1.250.000');
    expect(parseCurrencyValue('250.000')).toBe(250000);
    expect(formatVnd(100000)).toBe('100.000 đ');
    expect(formatVnd(-50000)).toBe('-50.000 đ');
    expect(formatVnd(50000, { signed: true })).toBe('+50.000 đ');
  });

  it('formats real-time with dots when typing or pasting into CurrencyInput', () => {
    render(<ControlledCurrencyHarness />);
    const input = screen.getByTestId('currency-field') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '100000', selectionStart: 6 } });
    expect(input.value).toBe('100.000');
    expect(screen.getByTestId('raw-val')).toHaveTextContent('100000');
    expect(screen.getByTestId('num-val')).toHaveTextContent('100000');

    fireEvent.change(input, { target: { value: '1.250.000 đ', selectionStart: 9 } });
    expect(input.value).toBe('1.250.000');
    expect(screen.getByTestId('raw-val')).toHaveTextContent('1250000');

    fireEvent.change(input, { target: { value: '', selectionStart: 0 } });
    expect(input.value).toBe('');
    expect(screen.getByTestId('num-val')).toHaveTextContent('null');
  });
});
