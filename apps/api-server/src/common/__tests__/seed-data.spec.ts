import { describe, expect, it } from 'vitest';
import { masterDataSeed, productSeed, tableNames } from '../../../prisma/seed-data';

describe('restaurant seed data', () => {
  it('should create only the thirty physical dining tables', () => {
    expect(tableNames).toHaveLength(30);
    expect(tableNames[0]).toBe('Bàn 01');
    expect(tableNames[29]).toBe('Bàn 30');
    expect(tableNames).not.toContain('Mang về');
  });

  it('should seed all required master data categories', () => {
    expect(new Set(masterDataSeed.map((entry) => entry.category))).toEqual(
      new Set(['POSITION', 'SPECIALTY', 'INGREDIENT', 'UNIT', 'SUPPLIER', 'MENU_CATEGORY']),
    );
    expect(masterDataSeed.every((entry) => entry.normalizedName.length > 0)).toBe(true);
  });

  it('should seed all four product stations and combo components on real kitchen stations', () => {
    expect(new Set(productSeed.map((product) => product.station))).toEqual(
      new Set(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE', 'COMBO']),
    );
    const combo = productSeed.find((product) => product.station === 'COMBO');
    expect(combo?.comboItems.length).toBeGreaterThan(0);
    expect(combo?.comboItems.every((item) => item.station !== 'COMBO')).toBe(true);
  });
});
