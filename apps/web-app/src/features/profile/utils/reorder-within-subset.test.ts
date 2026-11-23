import { describe, expect, it } from 'vitest';

import { moveWithinSubset } from './reorder-within-subset';

describe('moveWithinSubset', () => {
  const full = ['/dashboard', '/pos', '/menu', '/invoices', '/cashflow'];

  it('swaps two items of the subset and leaves the others in place', () => {
    const subset = ['/pos', '/menu', '/invoices'];
    expect(moveWithinSubset(full, subset, '/menu', -1)).toEqual([
      '/dashboard',
      '/menu',
      '/pos',
      '/invoices',
      '/cashflow',
    ]);
  });

  it('keeps interleaved outside items on their original slots', () => {
    const interleaved = ['/pos', '/dashboard', '/menu', '/cashflow', '/invoices'];
    expect(moveWithinSubset(interleaved, ['/pos', '/menu', '/invoices'], '/pos', 1)).toEqual([
      '/menu',
      '/dashboard',
      '/pos',
      '/cashflow',
      '/invoices',
    ]);
  });

  it('does nothing at the edges, for unknown ids, or for a single-item subset', () => {
    expect(moveWithinSubset(full, ['/pos', '/menu'], '/pos', -1)).toEqual(full);
    expect(moveWithinSubset(full, ['/pos', '/menu'], '/menu', 1)).toEqual(full);
    expect(moveWithinSubset(full, ['/pos', '/menu'], '/nope', 1)).toEqual(full);
    expect(moveWithinSubset(full, ['/pos'], '/pos', 1)).toEqual(full);
  });

  it('does not mutate its inputs', () => {
    const fullCopy = [...full];
    const subset = ['/pos', '/menu'];
    moveWithinSubset(full, subset, '/pos', 1);
    expect(full).toEqual(fullCopy);
    expect(subset).toEqual(['/pos', '/menu']);
  });
});
