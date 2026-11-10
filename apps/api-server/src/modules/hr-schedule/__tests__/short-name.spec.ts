import { describe, expect, it } from 'vitest';
import { generateShortName } from '../short-name.util';

describe('generateShortName', () => {
  it('should use the final name and middle initial for a three-word name', () => {
    expect(generateShortName('Nguyễn Văn Anh', [], 12)).toBe('V.Anh');
  });

  it('should use the final name for a two-word name', () => {
    expect(generateShortName('Nguyễn Anh', [], 12)).toBe('Anh');
  });

  it('should use the only word for a one-word name', () => {
    expect(generateShortName('Anh', [], 12)).toBe('Anh');
  });

  it('should resolve a two-person collision with the first initial and employee id', () => {
    expect(generateShortName('Trần Văn Anh', [{ id: 12, shortName: 'V.Anh' }], 15)).toBe('T.V.Anh (#15)');
  });

  it('should keep three same-name employees distinct by employee id', () => {
    const existing = [
      { id: 12, shortName: 'V.Anh' },
      { id: 15, shortName: 'T.V.Anh (#15)' },
    ];
    expect(generateShortName('Nguyễn Văn Anh', existing, 21)).toBe('N.V.Anh (#21)');
  });

  it('should ignore the current employee when recalculating their short name', () => {
    expect(generateShortName('Nguyễn Văn Anh', [{ id: 12, shortName: 'V.Anh' }], 12)).toBe('V.Anh');
  });

  it('should compare existing short names without case sensitivity', () => {
    expect(generateShortName('Trần Văn Anh', [{ id: 12, shortName: 'v.anh' }], 15)).toBe('T.V.Anh (#15)');
  });

  it('should return the employee id for an empty name', () => {
    expect(generateShortName('   ', [], 12)).toBe('#12');
  });
});
