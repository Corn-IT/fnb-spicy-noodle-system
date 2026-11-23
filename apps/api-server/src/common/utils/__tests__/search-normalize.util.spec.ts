import { describe, expect, it, vi } from 'vitest';

import {
  buildIyFallbackKeywords,
  buildSqlLikePattern,
  normalizeSearchTerm,
  queryMatchingIdsBySearchNorm,
} from '../search-normalize.util';

describe('search-normalize.util', () => {
  it('normalizes Vietnamese accents, đ->d, case, and folds y->i', () => {
    expect(normalizeSearchTerm('Mì Cay')).toBe('mi cai');
    expect(normalizeSearchTerm('Mỳ Cay')).toBe('mi cai');
    expect(normalizeSearchTerm('  Đậu   Phụ  Kỳ  Nam ')).toBe('dau phu ki nam');
  });

  it('escapes SQL LIKE wildcards (%, _, \\) safely', () => {
    expect(buildSqlLikePattern('100%_mỳ\\cay')).toBe('%100\\%\\_mi\\\\cai%');
  });

  it('generates i/y fallback keyword variants', () => {
    const variants = buildIyFallbackKeywords('mỳ cay');
    expect(variants).toContain('mỳ cay');
    expect(variants).toContain('mi cai');
    expect(variants).toContain('my cay');
  });

  it('uses parameterized $queryRaw with f_search_norm when available and returns null when mocked without $queryRaw', async () => {
    expect(await queryMatchingIdsBySearchNorm({}, 'products', ['name'], 'mỳ cay')).toBeNull();

    const $queryRaw = vi.fn().mockResolvedValue([{ id: 3 }, { id: 7 }]);
    const ids = await queryMatchingIdsBySearchNorm({ $queryRaw }, 'products', ['name'], 'mỳ cay');
    expect(ids).toEqual([3, 7]);
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });
});
