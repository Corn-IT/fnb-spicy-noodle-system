import { describe, expect, it } from 'vitest';
import {
  TakeawayLabelFormat,
  formatTakeawayLabel,
  formatTakeawayShortCode,
  formatTakeawaySuffix,
  parseTakeawayLabelNumber,
} from '../index';

describe('takeaway-label.util', () => {
  it('formats NUMBER mode with 2-digit zero padding and handles >=100 cleanly', () => {
    expect(formatTakeawaySuffix(1, TakeawayLabelFormat.NUMBER)).toBe('01');
    expect(formatTakeawaySuffix(9, 'NUMBER')).toBe('09');
    expect(formatTakeawaySuffix(10, 'NUMBER')).toBe('10');
    expect(formatTakeawaySuffix(135, 'NUMBER')).toBe('135');
    expect(formatTakeawayLabel(5, 'NUMBER')).toBe('Mang về #05');
    expect(formatTakeawayLabel(5, 'NUMBER', { uppercase: true })).toBe('MANG VỀ #05');
    expect(formatTakeawayShortCode(5, 'NUMBER')).toBe('MV05');
  });

  it('follows the exact LETTER sequence from #A to #ZD and falls back cleanly at 131+', () => {
    const samples: Array<[number, string]> = [
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
      [4, 'D'],
      [5, 'AA'],
      [6, 'AB'],
      [7, 'AC'],
      [8, 'AD'],
      [9, 'BA'],
      [12, 'BD'],
      [13, 'CA'],
      [16, 'CD'],
      [17, 'DA'],
      [20, 'DD'],
      [21, 'E'],
      [22, 'EA'],
      [25, 'ED'],
      [26, 'F'],
      [27, 'FA'],
      [30, 'FD'],
      [31, 'G'],
      [126, 'Z'],
      [127, 'ZA'],
      [130, 'ZD'],
      [131, '131'],
      [132, '132'],
    ];

    for (const [num, expected] of samples) {
      expect(formatTakeawaySuffix(num, TakeawayLabelFormat.LETTER)).toBe(expected);
    }

    expect(formatTakeawayLabel(1, 'LETTER')).toBe('Mang về #A');
    expect(formatTakeawayLabel(5, 'LETTER', { uppercase: true })).toBe('MANG VỀ #AA');
    expect(formatTakeawayShortCode(22, 'LETTER')).toBe('MVEA');
  });

  it('produces zero collisions across numbers 1..500 in LETTER mode', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 500; i += 1) {
      const suffix = formatTakeawaySuffix(i, 'LETTER');
      expect(seen.has(suffix)).toBe(false);
      seen.add(suffix);
    }
    expect(seen.size).toBe(500);
  });

  it('handles null, undefined, zero, negative, and NaN inputs safely without throwing', () => {
    expect(formatTakeawayLabel(null, null)).toBe('Mang về #01');
    expect(formatTakeawayLabel(undefined, 'LETTER')).toBe('Mang về #A');
    expect(formatTakeawaySuffix(0, 'LETTER')).toBe('A');
    expect(formatTakeawaySuffix(-5, 'NUMBER')).toBe('01');
    expect(formatTakeawaySuffix(Number.NaN, 'LETTER')).toBe('A');
    expect(formatTakeawaySuffix(3.9, 'LETTER')).toBe('C');
  });

  it('parses takeaway search keywords across NUMBER and LETTER labels cleanly', () => {
    expect(parseTakeawayLabelNumber('#01')).toBe(1);
    expect(parseTakeawayLabelNumber('Mang về #09')).toBe(9);
    expect(parseTakeawayLabelNumber('#A')).toBe(1);
    expect(parseTakeawayLabelNumber('Mang về #D')).toBe(4);
    expect(parseTakeawayLabelNumber('Mang về #AA')).toBe(5);
    expect(parseTakeawayLabelNumber('mv#ed')).toBe(25);
    expect(parseTakeawayLabelNumber('ZD')).toBe(130);
    expect(parseTakeawayLabelNumber('Bàn 01')).toBeNull();
    expect(parseTakeawayLabelNumber('AE')).toBeNull();
    expect(parseTakeawayLabelNumber('')).toBeNull();
  });
});
