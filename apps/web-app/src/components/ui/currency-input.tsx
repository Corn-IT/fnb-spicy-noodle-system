import * as React from 'react';

import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/utils/cn';
import { extractCurrencyDigits, formatCurrencyDigits } from '@/utils/currency';

export interface CurrencyInputProps
  extends Omit<InputProps, 'type' | 'value' | 'defaultValue' | 'onChange'> {
  /** Current raw numeric value or numeric string (e.g. 100000, "100000", or ""). */
  value: string | number | null | undefined;
  /** Called with raw unformatted digit string (e.g. "100000" or "") and numeric value (null when empty). */
  onValueChange: (rawDigits: string, numericValue: number | null) => void;
  /** Optional suffix label rendered inside the right edge of the input (e.g. "đ"). */
  suffix?: string;
}

function toDigitString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.max(0, Math.round(value)));
  }
  return extractCurrencyDigits(value);
}

function countDigitsBeforeCursor(str: string, cursorPos: number): number {
  let count = 0;
  for (let i = 0; i < Math.min(cursorPos, str.length); i += 1) {
    if (/\d/.test(str[i] ?? '')) count += 1;
  }
  return count;
}

function findCursorPosForDigitCount(formatted: string, digitTarget: number): number {
  if (digitTarget <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i] ?? '')) {
      count += 1;
      if (count >= digitTarget) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

/**
 * Controlled currency input that formats Vietnamese thousands separators (`100.000`)
 * in real time while typing and preserves cursor position across edits.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, onKeyDown, className, suffix, placeholder = 'VD: 100.000', ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const pendingCaretDigitCount = React.useRef<number | null>(null);

    const setCombinedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const rawDigits = toDigitString(value);
    const displayValue = formatCurrencyDigits(rawDigits);

    React.useLayoutEffect(() => {
      if (pendingCaretDigitCount.current === null || !innerRef.current) return;
      const targetDigits = pendingCaretDigitCount.current;
      pendingCaretDigitCount.current = null;
      const nextPos = findCursorPosForDigitCount(displayValue, targetDigits);
      try {
        innerRef.current.setSelectionRange(nextPos, nextPos);
      } catch {
        // Ignore in jsdom or non-selectable input states
      }
    }, [displayValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.target;
      const rawText = inputEl.value;
      const cursor = inputEl.selectionStart ?? rawText.length;
      const digitsBeforeCaret = countDigitsBeforeCursor(rawText, cursor);

      const nextDigits = extractCurrencyDigits(rawText);
      const nextNumeric = nextDigits === '' ? null : Number(nextDigits);

      pendingCaretDigitCount.current = digitsBeforeCaret;
      onValueChange(nextDigits, nextNumeric);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      // When user presses Backspace immediately after a dot separator ("100.|000"),
      // delete the digit right before the dot instead of leaving the number unchanged.
      if (e.key === 'Backspace' && innerRef.current) {
        const start = innerRef.current.selectionStart;
        const end = innerRef.current.selectionEnd;
        if (start !== null && start === end && start > 1 && displayValue[start - 1] === '.') {
          e.preventDefault();
          const digitsBeforeDot = countDigitsBeforeCursor(displayValue, start - 1);
          const targetDigitIdx = digitsBeforeDot - 1;
          if (targetDigitIdx >= 0) {
            const nextDigits =
              rawDigits.slice(0, targetDigitIdx) + rawDigits.slice(targetDigitIdx + 1);
            const normalized = extractCurrencyDigits(nextDigits);
            pendingCaretDigitCount.current = Math.max(0, targetDigitIdx);
            onValueChange(normalized, normalized === '' ? null : Number(normalized));
          }
        }
      }
    };

    const inputElement = (
      <Input
        ref={setCombinedRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={displayValue}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn('tabular-nums font-medium', suffix ? 'pr-8' : '', className)}
        {...props}
      />
    );

    if (!suffix) {
      return inputElement;
    }

    return (
      <div className="relative w-full">
        {inputElement}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
          {suffix}
        </span>
      </div>
    );
  },
);
CurrencyInput.displayName = 'CurrencyInput';
