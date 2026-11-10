import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const prismaDirectory = resolve(import.meta.dirname, '../../../prisma');
const schema = readFileSync(resolve(prismaDirectory, 'schema.prisma'), 'utf8');
const migration = readFileSync(resolve(prismaDirectory, 'migrations/20261107000000_init_schema_and_constraints/migration.sql'), 'utf8');
const inventoryCashflowMigration = readFileSync(
  resolve(prismaDirectory, 'migrations/20261108000000_inventory_cashflow_config_and_settlement_lock/migration.sql'),
  'utf8',
);

describe('Prisma schema and initial migration', () => {
  it('should define exactly the thirteen physical models from the ERD', () => {
    const tableNames = [
      'master_data', 'employees', 'users', 'dining_tables', 'products', 'combo_items',
      'modifier_groups', 'modifiers', 'orders', 'order_items', 'inventory_imports',
      'cash_drawer_settlements', 'work_schedules',
    ];

    expect([...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map((match) => match[1])).toEqual(tableNames);
    expect([...schema.matchAll(/^model\s+/gm)]).toHaveLength(13);
  });

  it('should keep every monetary column as Decimal(12, 2)', () => {
    const monetaryFields = [
      'price', 'extraPrice', 'cashAmount', 'transferAmount', 'totalAmount', 'unitPrice',
      'totalCost', 'openingBudget', 'totalCashSales', 'totalTransferSales', 'totalCashImports',
      'expectedCashInDrawer', 'actualCountedCash', 'discrepancyAmount',
    ];

    for (const field of monetaryFields) {
      const fieldDefinition = schema.split('\n').find((line) => new RegExp(`\\b${field}\\s+Decimal\\b`).test(line));
      expect(fieldDefinition).toContain('@db.Decimal(12, 2)');
    }

    expect(schema.split('\n').filter((line) => /\bunitPrice\s+Decimal\b/.test(line))).toHaveLength(2);
    expect(schema).toMatch(/quantity\s+Decimal\s+@db\.Decimal\(10, 2\)/);
  });

  it('should enforce the required business constraints and indexes in SQL', () => {
    for (const identifier of [
      'chk_order_type_target', 'chk_order_payment_amounts', 'chk_combo_no_self_ref',
      'uq_mdm_category_normalized', 'uq_schedule_cell', 'idx_one_active_order_per_table',
      'idx_orders_created_status', 'idx_order_items_order_kitchen', 'idx_imports_date_mdm',
      'idx_settlements_date', 'chk_import_total_cost_matches', 'chk_settlement_status_amounts',
      'chk_settlement_note_required',
    ]) {
      expect(migration).toContain(identifier);
    }
    expect(migration).toContain('"payment_method" IS NOT NULL');
  });

  it('should prevent duplicate shift settlements and index cash import queries', () => {
    expect(inventoryCashflowMigration).toContain('uq_settlement_date_shift');
    expect(inventoryCashflowMigration).toContain('idx_imports_created_payment');
    expect(inventoryCashflowMigration).not.toContain('CREATE TABLE');
  });
});
