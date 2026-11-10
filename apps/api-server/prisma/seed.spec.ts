import { compare, getRounds } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { seedDatabase } from './seed';

type SeedRow = Record<string, unknown> & { id: number };

describe('seedDatabase', () => {
  it('should stop before creating accounts when required master data is missing', async () => {
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: { masterData: { upsert: () => Promise<{ id: number }> } }) => Promise<void>) =>
        callback({ masterData: { upsert: async () => ({ id: 0 }) } }),
      ),
    } as never;

    await expect(seedDatabase(prisma)).rejects.toThrow('Missing master data for superadmin');
  });

  it('should seed linked staff accounts, physical tables, combo items, and modifiers idempotently', async () => {
    let nextId = 0;
    const masterData = new Map<string, SeedRow>();
    const employees = new Map<string, SeedRow>();
    const users = new Map<string, SeedRow>();
    const tables = new Map<string, SeedRow>();
    const products = new Map<string, SeedRow>();
    const productsById = new Map<number, SeedRow>();
    const comboItems = new Map<string, SeedRow>();
    const modifierGroups = new Map<string, SeedRow>();
    const modifiers = new Map<string, SeedRow>();
    const tx = {
      masterData: {
        upsert: vi.fn(async (args: {
          where: { category_normalizedName: { category: string; normalizedName: string } };
          create: Record<string, unknown>;
        }) => {
          const key = `${args.where.category_normalizedName.category}:${args.where.category_normalizedName.normalizedName}`;
          const row = masterData.get(key) ?? { ...args.create, id: ++nextId };
          masterData.set(key, row);
          return row;
        }),
      },
      employee: {
        findFirst: vi.fn(async (args: { where: { fullName: string } }) => employees.get(args.where.fullName) ?? null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { ...args.data, id: ++nextId } as SeedRow;
          employees.set(String(row.fullName), row);
          return row;
        }),
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          const entry = [...employees.entries()].find(([, row]) => row.id === args.where.id);
          if (!entry) throw new Error('Employee to update was not found');
          const row = { ...entry[1], ...args.data } as SeedRow;
          employees.set(entry[0], row);
          return row;
        }),
      },
      user: {
        upsert: vi.fn(async (args: {
          where: { username: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const row = users.get(args.where.username)
            ? { ...users.get(args.where.username)!, ...args.update }
            : { ...args.create, id: ++nextId };
          users.set(args.where.username, row as SeedRow);
          return row as SeedRow;
        }),
      },
      diningTable: {
        upsert: vi.fn(async (args: { where: { name: string }; create: Record<string, unknown> }) => {
          const row = tables.get(args.where.name) ?? { ...args.create, id: ++nextId };
          tables.set(args.where.name, row);
          return row;
        }),
      },
      product: {
        findFirst: vi.fn(async (args: { where: { name: string } }) => products.get(args.where.name) ?? null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { ...args.data, id: ++nextId } as SeedRow;
          products.set(String(row.name), row);
          productsById.set(row.id, row);
          return row;
        }),
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          const existing = productsById.get(args.where.id);
          if (!existing) throw new Error('Product to update was not found');
          const row = { ...existing, ...args.data } as SeedRow;
          products.set(String(row.name), row);
          productsById.set(row.id, row);
          return row;
        }),
      },
      comboItem: {
        upsert: vi.fn(async (args: {
          where: { parentProductId_childProductId: { parentProductId: number; childProductId: number } };
          create: Record<string, unknown>;
        }) => {
          const key = `${args.where.parentProductId_childProductId.parentProductId}:${args.where.parentProductId_childProductId.childProductId}`;
          const row = comboItems.get(key) ?? { ...args.create, id: ++nextId };
          comboItems.set(key, row);
          return row;
        }),
      },
      modifierGroup: {
        findFirst: vi.fn(async (args: { where: { productId: number; name: string } }) =>
          modifierGroups.get(`${args.where.productId}:${args.where.name}`) ?? null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { ...args.data, id: ++nextId } as SeedRow;
          modifierGroups.set(`${String(row.productId)}:${String(row.name)}`, row);
          return row;
        }),
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          const entry = [...modifierGroups.entries()].find(([, row]) => row.id === args.where.id);
          if (!entry) throw new Error('Modifier group to update was not found');
          const row = { ...entry[1], ...args.data } as SeedRow;
          modifierGroups.set(entry[0], row);
          return row;
        }),
      },
      modifier: {
        findFirst: vi.fn(async (args: { where: { groupId: number; name: string } }) =>
          modifiers.get(`${args.where.groupId}:${args.where.name}`) ?? null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { ...args.data, id: ++nextId } as SeedRow;
          modifiers.set(`${String(row.groupId)}:${String(row.name)}`, row);
          return row;
        }),
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          const entry = [...modifiers.entries()].find(([, row]) => row.id === args.where.id);
          if (!entry) throw new Error('Modifier to update was not found');
          const row = { ...entry[1], ...args.data } as SeedRow;
          modifiers.set(entry[0], row);
          return row;
        }),
      },
    };
    const transaction = vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));
    const prisma = { $transaction: transaction } as never;

    await seedDatabase(prisma);
    await seedDatabase(prisma);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(masterData.size).toBeGreaterThan(0);
    expect(new Set([...masterData.values()].map((row) => row.category))).toEqual(
      new Set(['POSITION', 'SPECIALTY', 'INGREDIENT', 'UNIT', 'SUPPLIER', 'MENU_CATEGORY']),
    );
    expect(employees.size).toBe(2);
    expect(users.size).toBe(2);
    expect([...users.keys()]).toEqual(['superadmin', 'cashier01']);
    expect(users.get('superadmin')?.isSuperAdmin).toBe(true);
    expect(users.get('cashier01')?.isSuperAdmin).toBe(false);
    for (const user of users.values()) {
      expect(await compare('Password@123', String(user.passwordHash))).toBe(true);
      expect(getRounds(String(user.passwordHash))).toBe(10);
    }

    expect(tables.size).toBe(30);
    expect(tables.has('Bàn 01')).toBe(true);
    expect(tables.has('Bàn 30')).toBe(true);
    expect(tables.has('Mang về')).toBe(false);
    const qrTokens = [...tables.values()].map((table) => String(table.qrToken));
    expect(qrTokens.every((token) => /^[0-9a-f]{64}$/.test(token))).toBe(true);
    expect(new Set(qrTokens).size).toBe(30);

    expect(products.size).toBe(11);
    expect(comboItems.size).toBe(2);
    for (const item of comboItems.values()) {
      expect(productsById.get(Number(item.childProductId))?.station).not.toBe('COMBO');
    }
    expect(modifierGroups.size).toBe(13);
    expect(modifiers.size).toBe(68);
    expect([...modifierGroups.values()].filter((group) => group.name === 'Cấp độ cay' && group.isRequired === true && group.maxSelect === 1)).toHaveLength(4);
    expect([...modifierGroups.values()].filter((group) => group.name === 'Đồ ăn chính của món' && group.allowSubstitution === true)).toHaveLength(1);
    expect([...modifierGroups.values()].filter((group) => group.name === 'Thêm Topping' && group.isRequired === false && group.maxSelect === 5)).toHaveLength(6);
    expect([...modifiers.values()].filter((modifier) => modifier.name === 'Cấp độ 0' && modifier.extraPrice === '0.00')).toHaveLength(3);
    expect(tx.employee.create).toHaveBeenCalledTimes(2);
    expect(tx.product.create).toHaveBeenCalledTimes(11);
    expect(tx.diningTable.upsert).toHaveBeenCalledTimes(60);
    expect(tx.modifierGroup.create).toHaveBeenCalledTimes(13);
    expect(tx.modifier.create).toHaveBeenCalledTimes(68);
  });
});
