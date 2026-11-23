import { describe, expect, it } from 'vitest';

import { matchesVietnameseQuery, normalizeVietnameseText } from '../search';

describe('search.ts (Vietnamese diacritic & i/y folding)', () => {
  it('folds i and y symmetrically along with diacritics, đ/d, case, and whitespace', () => {
    expect(normalizeVietnameseText('Mì Cay')).toBe(normalizeVietnameseText('Mỳ Cay'));
    expect(normalizeVietnameseText('  MỲ   CAY  ')).toBe('mi cai');
    expect(normalizeVietnameseText('Đậu Phụ Kỳ Nam')).toBe('dau phu ki nam');
  });

  it('matches "mì cay", "mỳ cay", "my cay", "mi cay" identically against products with either i or y', () => {
    const productI = 'Mì Cay Hải Sản 7 Cấp Độ';
    const productY = 'Mỳ Cay Bò Mỹ Kim Chi';

    for (const q of ['mì cay', 'mỳ cay', 'mi cay', 'my cay', 'MỲ CAY', 'MÌ CAY']) {
      expect(matchesVietnameseQuery(q, productI)).toBe(true);
      expect(matchesVietnameseQuery(q, productY)).toBe(true);
    }

    expect(matchesVietnameseQuery('lẩu thái', productI)).toBe(false);
    expect(matchesVietnameseQuery('   ', productI)).toBe(true);
  });
});
