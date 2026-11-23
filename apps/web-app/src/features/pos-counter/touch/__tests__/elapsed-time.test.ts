import { describe, expect, it } from 'vitest';

import { formatCompactPrice, formatElapsedSince } from '../elapsed-time';

const NOW = Date.parse('2026-11-23T13:29:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('formatElapsedSince', () => {
  it('shows "Vừa vào" under one minute and for clock skew into the future', () => {
    expect(formatElapsedSince(ago(0), NOW)).toBe('Vừa vào');
    expect(formatElapsedSince(new Date(NOW + 90_000).toISOString(), NOW)).toBe('Vừa vào');
  });

  it('uses minutes below one hour and h:mm above', () => {
    expect(formatElapsedSince(ago(4), NOW)).toBe('4p');
    expect(formatElapsedSince(ago(59), NOW)).toBe('59p');
    expect(formatElapsedSince(ago(60), NOW)).toBe('1h:00p');
    expect(formatElapsedSince(ago(81), NOW)).toBe('1h:21p');
  });

  it('returns an empty label for an invalid date', () => {
    expect(formatElapsedSince('not-a-date', NOW)).toBe('');
  });
});

describe('formatCompactPrice', () => {
  it('abbreviates thousands like a POS price tag', () => {
    expect(formatCompactPrice(35000)).toBe('35K');
    expect(formatCompactPrice(35500)).toBe('35,5K');
    expect(formatCompactPrice(800)).toBe('800đ');
  });
});
