import { describe, expect, it } from 'vitest';
import {
  cashierPermissions,
  adminPermissions,
  defaultOpeningBudgetSeed,
  defaultPaymentAccountsSeed,
  defaultQrSecurityConfigSeed,
  defaultStoreSettingsSeed,
  masterDataSeed,
  productSeed,
  seedEmployees,
  tableNames,
} from '../../../prisma/seed-data';

describe('restaurant seed data', () => {
  it('grants cashiers draft deletion without confirmed-order deletion', () => {
    expect(cashierPermissions.pos.deleteDrafts).toBe(true);
    expect(cashierPermissions.pos.delete).toBe(false);
    expect(adminPermissions.pos.deleteDrafts).toBe(true);
  });

  it('should create only the thirty physical dining tables', () => {
    expect(tableNames).toHaveLength(30);
    expect(tableNames[0]).toBe('Bàn 01');
    expect(tableNames[29]).toBe('Bàn 30');
    expect(tableNames).not.toContain('Mang về');
  });

  it('should seed all required master data categories and Chợ Khu Vực supplier', () => {
    expect(new Set(masterDataSeed.map((entry) => entry.category))).toEqual(
      new Set(['KITCHEN_STATION', 'POSITION', 'SPECIALTY', 'INGREDIENT', 'UNIT', 'SUPPLIER', 'MENU_CATEGORY']),
    );
    expect(masterDataSeed.every((entry) => entry.normalizedName.length > 0)).toBe(true);
    const suppliers = masterDataSeed.filter((entry) => entry.category === 'SUPPLIER');
    expect(suppliers.map((s) => s.name)).toEqual(['Chợ Khu Vực']);
  });

  it('should assign sequential sortOrder to all seeded master data categories', () => {
    for (const category of ['KITCHEN_STATION', 'POSITION', 'SPECIALTY', 'INGREDIENT', 'UNIT', 'SUPPLIER', 'MENU_CATEGORY'] as const) {
      const orders = masterDataSeed
        .filter((entry) => entry.category === category)
        .map((entry) => entry.metadata.sortOrder);
      expect(orders).toEqual(Array.from({ length: orders.length }, (_, idx) => idx + 1));
    }
  });

  it('should seed 12 employees (4 accounts in hierarchy order + 8 operational staff) and 164 products with chicken combos directly under BEP_CHIEN', () => {
    expect(seedEmployees).toHaveLength(12);
    expect(seedEmployees.filter((e) => Boolean(e.account)).map((e) => e.account?.username)).toEqual([
      'superadmin',
      'admin',
      'adminview',
      'thungan',
    ]);
    expect(productSeed).toHaveLength(164);
    expect(productSeed.every((product) => product.subtitle === undefined)).toBe(true);
    expect(new Set(productSeed.map((product) => product.station))).toEqual(
      new Set(['BEP_NAU', 'BEP_CHIEN', 'PHA_CHE']),
    );
    const chickenCombos = productSeed.filter((product) => product.categoryName === 'Combo Gà Rán');
    expect(chickenCombos).toHaveLength(4);
    expect(chickenCombos.every((item) => item.station === 'BEP_CHIEN' && item.comboItems.length === 0)).toBe(true);
    expect(defaultPaymentAccountsSeed).toEqual([
      {
        label: 'TK Chính (BIDV)',
        bankCode: 'BIDV',
        accountNo: '8878564012',
        accountName: 'TRAN VAN HUNG',
        priority: 1,
        isActive: true,
      },
      {
        label: 'TK Phụ (Vietcombank)',
        bankCode: 'VCB',
        accountNo: '0351000647045',
        accountName: 'TRAN VAN HUNG',
        priority: 2,
        isActive: true,
      },
    ]);
    expect(defaultStoreSettingsSeed.settings.receipt.phone).toBe('0967622716');
    expect(defaultQrSecurityConfigSeed.config.wifiSsid).toBe('An Vat Tran');
    expect(defaultQrSecurityConfigSeed.config.wifiPassword).toBe('chucngonmieng');
    expect(defaultOpeningBudgetSeed.openingBudget).toBe('2000000.00');
  });
});
