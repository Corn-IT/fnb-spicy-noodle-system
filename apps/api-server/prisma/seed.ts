import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { MdmCategory, ProductStation, type UserPermissions } from '@fnb/shared';
import { normalizeVietnameseString } from '../src/common/utils/normalized-string.util';
import { generateShortQrToken } from '../src/common/utils/qr-token.util';
import { seedSampleDiscounts } from './seed-discounts';
import {
  adminPermissions,
  adminViewPermissions,
  cashierPermissions,
  defaultOpeningBudgetSeed,
  defaultPaymentAccountsSeed,
  defaultQrSecurityConfigSeed,
  defaultStoreSettingsSeed,
  masterDataSeed,
  productSeed,
  seedEmployees,
  tableNames,
  type SeedEmployeeDef,
  type SeedModifierDef,
} from './seed-data';

type SeedClient = Pick<PrismaClient, '$transaction'>;

function resolveAccountPermissions(roleKey: NonNullable<SeedEmployeeDef['account']>['roleKey']): UserPermissions | Record<string, never> {
  if (roleKey === 'SUPERADMIN') return {};
  if (roleKey === 'ADMIN') return adminPermissions;
  if (roleKey === 'ADMIN_VIEW') return adminViewPermissions;
  return cashierPermissions;
}

function resolveInitialSeedPassword(): string {
  const configuredPassword = process.env.FNB_SEED_INITIAL_PASSWORD?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!configuredPassword || configuredPassword.length < 16) {
      throw new Error('FNB_SEED_INITIAL_PASSWORD is required in production and must be at least 16 characters.');
    }
    return configuredPassword;
  }
  return configuredPassword || 'Password@123';
}

export async function seedDatabase(prisma: SeedClient): Promise<void> {
  const passwordHash = await hash(resolveInitialSeedPassword(), 10);

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
      masterDataIds.set(`${entry.category}:${entry.normalizedName}`, record.id);
    }

    await tx.masterData.upsert({
      where: {
        category_normalizedName: {
          category: defaultStoreSettingsSeed.category,
          normalizedName: defaultStoreSettingsSeed.normalizedName,
        },
      },
      update: {},
      create: {
        category: defaultStoreSettingsSeed.category,
        name: defaultStoreSettingsSeed.name,
        normalizedName: defaultStoreSettingsSeed.normalizedName,
        metadata: {
          ...defaultStoreSettingsSeed.settings,
          updatedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
        isActive: true,
      },
    });

    await tx.masterData.upsert({
      where: {
        category_normalizedName: {
          category: defaultQrSecurityConfigSeed.category,
          normalizedName: defaultQrSecurityConfigSeed.normalizedName,
        },
      },
      update: {},
      create: {
        category: defaultQrSecurityConfigSeed.category,
        name: defaultQrSecurityConfigSeed.name,
        normalizedName: defaultQrSecurityConfigSeed.normalizedName,
        metadata: {
          ...defaultQrSecurityConfigSeed.config,
          updatedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
        isActive: true,
      },
    });

    await tx.masterData.upsert({
      where: {
        category_normalizedName: {
          category: defaultOpeningBudgetSeed.category,
          normalizedName: defaultOpeningBudgetSeed.normalizedName,
        },
      },
      update: {},
      create: {
        category: defaultOpeningBudgetSeed.category,
        name: defaultOpeningBudgetSeed.name,
        normalizedName: defaultOpeningBudgetSeed.normalizedName,
        metadata: {
          opening_budget: defaultOpeningBudgetSeed.openingBudget,
        } as Prisma.InputJsonObject,
        isActive: false,
      },
    });

    for (const employee of seedEmployees) {
      const positionId =
        masterDataIds.get(`${MdmCategory.POSITION}:${employee.position}`) ??
        masterDataIds.get(`${MdmCategory.POSITION}:${normalizeVietnameseString(employee.position)}`);
      const specialtyId =
        masterDataIds.get(`${MdmCategory.SPECIALTY}:${employee.specialty}`) ??
        masterDataIds.get(`${MdmCategory.SPECIALTY}:${normalizeVietnameseString(employee.specialty)}`);
      if (!positionId || !specialtyId) {
        throw new Error(`Missing master data for ${employee.fullName}`);
      }

      const existingEmployee = await tx.employee.findFirst({ where: { fullName: employee.fullName } });
      const employeeRecord = existingEmployee
        ? await tx.employee.update({
            where: { id: existingEmployee.id },
            data: {
              shortName: employee.shortName,
              positionId,
              specialtyId,
              ...(employee.phone ? { phone: employee.phone } : {}),
              ...(employee.note ? { note: employee.note } : {}),
              isDeleted: false,
            },
          })
        : await tx.employee.create({
            data: {
              fullName: employee.fullName,
              shortName: employee.shortName,
              positionId,
              specialtyId,
              ...(employee.phone ? { phone: employee.phone } : {}),
              ...(employee.note ? { note: employee.note } : {}),
            },
          });

      if (employee.account) {
        const permissionsPayload = resolveAccountPermissions(employee.account.roleKey) as Prisma.InputJsonObject;
        await tx.user.upsert({
          where: { username: employee.account.username },
          update: {
            employeeId: employeeRecord.id,
            passwordHash,
            isSuperAdmin: employee.account.isSuperAdmin,
            permissions: permissionsPayload,
            isActive: true,
          },
          create: {
            employeeId: employeeRecord.id,
            username: employee.account.username,
            passwordHash,
            isSuperAdmin: employee.account.isSuperAdmin,
            permissions: permissionsPayload,
          },
        });
      }
    }

    for (const name of tableNames) {
      await tx.diningTable.upsert({
        where: { name },
        update: {},
        create: { name, qrToken: generateShortQrToken(name) },
      });
    }

    if ('paymentAccount' in tx && tx.paymentAccount) {
      for (const account of defaultPaymentAccountsSeed) {
        await tx.paymentAccount.upsert({
          where: {
            bankCode_accountNo: {
              bankCode: account.bankCode,
              accountNo: account.accountNo,
            },
          },
          update: {
            label: account.label,
            accountName: account.accountName,
            priority: account.priority,
            isActive: account.isActive,
          },
          create: {
            label: account.label,
            bankCode: account.bankCode,
            accountNo: account.accountNo,
            accountName: account.accountName,
            priority: account.priority,
            isActive: account.isActive,
          },
        });
      }
    }

    const productIds = new Map<string, number>();
    for (const product of productSeed) {
      const categoryId = product.categoryName
        ? masterDataIds.get(`${MdmCategory.MENU_CATEGORY}:${product.categoryName}`) ??
          masterDataIds.get(`${MdmCategory.MENU_CATEGORY}:${normalizeVietnameseString(product.categoryName)}`) ??
          null
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
      const groups = product.modifierGroups;
      if (!groups || groups.length === 0) continue;
      const productId = productIds.get(product.name);
      if (!productId) throw new Error(`Missing seeded product ${product.name}`);

      for (const group of groups) {
        await upsertModifierGroup(
          tx,
          productId,
          group.name,
          group.isRequired,
          group.maxSelect,
          group.modifiers,
          {
            isAutoSelect: group.isAutoSelect,
            allowSubstitution: group.allowSubstitution,
          },
        );
      }
    }
    await seedSampleDiscounts(tx);
  }, { maxWait: 15000, timeout: 120000 });
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

export async function resetAndSeedMenu(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({});
    await tx.comboItem.deleteMany({});
    await tx.modifier.deleteMany({});
    await tx.modifierGroup.deleteMany({});
    await tx.product.deleteMany({});
    await tx.masterData.deleteMany({ where: { category: MdmCategory.MENU_CATEGORY } });
  }, { maxWait: 15000, timeout: 120000 });
  await seedDatabase(prisma);
}

export async function resetAllOperationalAndSeed(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.diningTable.updateMany({ data: { status: 'AVAILABLE', activeOrderId: null } });
    await tx.diningTable.deleteMany({ where: { name: { notIn: tableNames } } });
    await tx.auditLog.deleteMany({});
    await tx.workSchedule.deleteMany({});
    await tx.inventoryImport.deleteMany({});
    await tx.cashDrawerSettlement.deleteMany({});
    await tx.orderItem.deleteMany({});
    await tx.order.deleteMany({});
    await tx.paymentAccount.deleteMany({});
    await tx.discountTarget.deleteMany({});
    await tx.discount.deleteMany({});
    await tx.comboItem.deleteMany({});
    await tx.modifier.deleteMany({});
    await tx.modifierGroup.deleteMany({});
    await tx.product.deleteMany({});
    await tx.user.deleteMany({});
    await tx.employee.deleteMany({});
    await tx.masterData.deleteMany({
      where: {
        NOT: {
          category: 'SYSTEM_CONFIG',
          normalizedName: { in: ['store_settings', 'store_logo', 'store_favicon', 'store_qr_logo'] },
        },
      },
    });
  }, { maxWait: 15000, timeout: 120000 });
  await seedDatabase(prisma);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const isResetAll = process.argv.includes('--reset-all');
  try {
    if (isResetAll) {
      await resetAllOperationalAndSeed(prisma);
      console.info('Full database operational reset & seed completed.');
    } else {
      await resetAndSeedMenu(prisma);
      console.info('Database menu reset & seed completed.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((err) => {
    console.error('Database seed failed.', err);
    process.exitCode = 1;
  });
}
