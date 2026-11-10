import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { MdmCategory, ProductStation } from '@fnb/shared';
import { cashierPermissions, masterDataSeed, productSeed, tableNames } from './seed-data';

type SeedClient = Pick<PrismaClient, '$transaction'>;

const seedEmployees = [
  {
    fullName: 'Nguyễn Minh Quân',
    shortName: 'M.Quân',
    username: 'superadmin',
    position: 'Quản Lý Cửa Hàng',
    specialty: 'Phục Vụ Bàn',
    isSuperAdmin: true,
  },
  {
    fullName: 'Trần Thị Lan',
    shortName: 'T.Lan',
    username: 'cashier01',
    position: 'Thu Ngân Quầy',
    specialty: 'Phục Vụ Bàn',
    isSuperAdmin: false,
  },
] as const;

type SeedModifierDef = {
  name: string;
  extraPrice: string;
  isDefaultChecked?: boolean;
  defaultSubstituteName?: string;
};

const spiceLevels1To7: readonly SeedModifierDef[] = Array.from({ length: 7 }, (_, idx) => ({
  name: `Cấp ${idx + 1}`,
  extraPrice: '0.00',
}));

const defaultNoodleGarnishes: readonly SeedModifierDef[] = [
  { name: 'Tôm viên', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Xúc xích', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Ngô', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Rau', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Nấm kim châm', extraPrice: '0.00', isDefaultChecked: true },
  { name: 'Kim chi', extraPrice: '0.00', isDefaultChecked: true },
];

const seafoodMainIngredients: readonly SeedModifierDef[] = [
  { name: 'Tôm', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Mực' },
  { name: 'Ngao', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Mực' },
  { name: 'Mực', extraPrice: '0.00', isDefaultChecked: true, defaultSubstituteName: 'Tôm' },
];

const seafoodExtraToppings: readonly SeedModifierDef[] = [
  { name: 'Xúc xích', extraPrice: '5000.00' },
  { name: 'Tôm viên', extraPrice: '5000.00' },
  { name: 'Đậu hũ', extraPrice: '5000.00' },
  { name: 'Bò Mỹ', extraPrice: '10000.00' },
  { name: 'Sườn sụn', extraPrice: '10000.00' },
  { name: 'Ngao', extraPrice: '5000.00' },
  { name: 'Tôm', extraPrice: '10000.00' },
  { name: 'Mực', extraPrice: '10000.00' },
  { name: 'Kim chi', extraPrice: '5000.00' },
  { name: 'Nấm kim châm', extraPrice: '5000.00' },
];

const spiceLevels = Array.from({ length: 8 }, (_, level) => ({ name: `Cấp độ ${level}`, extraPrice: '0.00' }));
const toppings = [
  { name: 'Thêm Bò viên', extraPrice: '15000.00' },
  { name: 'Thêm Phô mai', extraPrice: '10000.00' },
  { name: 'Thêm Tôm', extraPrice: '20000.00' },
] as const;

export async function seedDatabase(prisma: SeedClient): Promise<void> {
  const passwordHash = await hash('Password@123', 10);

  await prisma.$transaction(async (tx) => {
    const masterDataIds = new Map<string, number>();
    for (const entry of masterDataSeed) {
      const record = await tx.masterData.upsert({
        where: { category_normalizedName: { category: entry.category, normalizedName: entry.normalizedName } },
        update: { name: entry.name, metadata: entry.metadata as Prisma.InputJsonObject, isActive: true },
        create: {
          category: entry.category,
          name: entry.name,
          normalizedName: entry.normalizedName,
          metadata: entry.metadata as Prisma.InputJsonObject,
          isActive: true,
        },
      });
      masterDataIds.set(`${entry.category}:${entry.name}`, record.id);
    }

    for (const employee of seedEmployees) {
      const positionId = masterDataIds.get(`${MdmCategory.POSITION}:${employee.position}`);
      const specialtyId = masterDataIds.get(`${MdmCategory.SPECIALTY}:${employee.specialty}`);
      if (!positionId || !specialtyId) throw new Error(`Missing master data for ${employee.username}`);

      const existingEmployee = await tx.employee.findFirst({ where: { fullName: employee.fullName } });
      const employeeRecord = existingEmployee
        ? await tx.employee.update({
            where: { id: existingEmployee.id },
            data: { shortName: employee.shortName, positionId, specialtyId, isDeleted: false },
          })
        : await tx.employee.create({
            data: {
              fullName: employee.fullName,
              shortName: employee.shortName,
              positionId,
              specialtyId,
            },
          });

      await tx.user.upsert({
        where: { username: employee.username },
        update: {
          employeeId: employeeRecord.id,
          passwordHash,
          isSuperAdmin: employee.isSuperAdmin,
          permissions: employee.isSuperAdmin ? {} : cashierPermissions as Prisma.InputJsonObject,
          isActive: true,
        },
        create: {
          employeeId: employeeRecord.id,
          username: employee.username,
          passwordHash,
          isSuperAdmin: employee.isSuperAdmin,
          permissions: employee.isSuperAdmin ? {} : cashierPermissions as Prisma.InputJsonObject,
        },
      });
    }

    for (const name of tableNames) {
      await tx.diningTable.upsert({
        where: { name },
        update: {},
        create: { name, qrToken: randomBytes(32).toString('hex') },
      });
    }

    const productIds = new Map<string, number>();
    for (const product of productSeed) {
      const categoryId = product.categoryName
        ? masterDataIds.get(`${MdmCategory.MENU_CATEGORY}:${product.categoryName}`) ?? null
        : null;
      const existingProduct = await tx.product.findFirst({ where: { name: product.name } });
      const productRecord = existingProduct
        ? await tx.product.update({
            where: { id: existingProduct.id },
            data: {
              subtitle: product.subtitle ?? null,
              categoryId,
              price: product.price,
              station: product.station,
              isAvailable: true,
              sortOrder: product.sortOrder,
            },
          })
        : await tx.product.create({
            data: {
              name: product.name,
              subtitle: product.subtitle ?? null,
              categoryId,
              price: product.price,
              station: product.station,
              sortOrder: product.sortOrder,
            },
          });
      productIds.set(product.name, productRecord.id);

      for (const item of product.comboItems) {
        const childProductId = productIds.get(item.productName);
        if (product.station !== ProductStation.COMBO || !childProductId) {
          throw new Error(`Invalid combo component for ${product.name}`);
        }
        await tx.comboItem.upsert({
          where: {
            parentProductId_childProductId: {
              parentProductId: productRecord.id,
              childProductId,
            },
          },
          update: { quantity: item.quantity },
          create: { parentProductId: productRecord.id, childProductId, quantity: item.quantity },
        });
      }
    }

    for (const product of productSeed) {
      if (product.station !== ProductStation.BEP_NAU && product.station !== ProductStation.BEP_CHIEN) continue;
      const productId = productIds.get(product.name);
      if (!productId) throw new Error(`Missing seeded product ${product.name}`);

      if (product.name === 'Mì cay hải sản') {
        await upsertModifierGroup(tx, productId, 'Cấp độ cay', true, 1, spiceLevels1To7);
        await upsertModifierGroup(tx, productId, 'Đồ ăn mặc định (0đ)', false, 6, defaultNoodleGarnishes, { isAutoSelect: true });
        await upsertModifierGroup(tx, productId, 'Đồ ăn chính của món', false, 3, seafoodMainIngredients, {
          isAutoSelect: true,
          allowSubstitution: true,
        });
        await upsertModifierGroup(tx, productId, 'Đồ ăn thêm', false, 10, seafoodExtraToppings);
        continue;
      }

      if (product.station === ProductStation.BEP_NAU) {
        await upsertModifierGroup(tx, productId, 'Cấp độ cay', true, 1, spiceLevels);
      }
      await upsertModifierGroup(tx, productId, 'Thêm Topping', false, 5, toppings);
    }
  });
}

async function upsertModifierGroup(
  tx: Prisma.TransactionClient,
  productId: number,
  name: string,
  isRequired: boolean,
  maxSelect: number,
  modifiers: readonly SeedModifierDef[],
  options?: { isAutoSelect?: boolean; allowSubstitution?: boolean },
): Promise<void> {
  const isAutoSelect = options?.isAutoSelect ?? false;
  const allowSubstitution = options?.allowSubstitution ?? false;
  const existingGroup = await tx.modifierGroup.findFirst({ where: { productId, name } });
  const group = existingGroup
    ? await tx.modifierGroup.update({
        where: { id: existingGroup.id },
        data: { isRequired, maxSelect, isAutoSelect, allowSubstitution },
      })
    : await tx.modifierGroup.create({
        data: { productId, name, isRequired, maxSelect, isAutoSelect, allowSubstitution },
      });

  for (const modifier of modifiers) {
    const isDefaultChecked = modifier.isDefaultChecked ?? false;
    const defaultSubstituteName = modifier.defaultSubstituteName ?? null;
    const existingModifier = await tx.modifier.findFirst({ where: { groupId: group.id, name: modifier.name } });
    if (existingModifier) {
      await tx.modifier.update({
        where: { id: existingModifier.id },
        data: { extraPrice: modifier.extraPrice, isDefaultChecked, defaultSubstituteName },
      });
    } else {
      await tx.modifier.create({
        data: { groupId: group.id, name: modifier.name, extraPrice: modifier.extraPrice, isDefaultChecked, defaultSubstituteName },
      });
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
    console.info('Database seed completed.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    console.error('Database seed failed.');
    process.exitCode = 1;
  });
}
