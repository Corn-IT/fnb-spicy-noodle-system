import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

type DiscountSeedClient = Pick<Prisma.TransactionClient, 'user' | 'discount'>;

export async function seedSampleDiscounts(prisma: DiscountSeedClient): Promise<void> {
  const txLike = prisma as unknown as {
    user?: { findFirst?: unknown };
    discount?: { findUnique?: unknown; upsert?: unknown };
  };
  if (
    typeof txLike.user?.findFirst !== 'function' ||
    typeof txLike.discount?.findUnique !== 'function'
  ) {
    return;
  }

  const adminUser =
    (await prisma.user.findFirst({ where: { isSuperAdmin: true }, orderBy: { id: 'asc' } })) ??
    (await prisma.user.findFirst({ orderBy: { id: 'asc' } }));

  if (!adminUser) {
    console.warn('No user found in database; skipping sample discount seeding.');
    return;
  }

  // 1. Giảm 10% tổng hoá đơn — phù hợp bàn 1-2 người (từ 80k) đến bàn nhóm/lẩu (tối đa 50k)
  const existingGiam10 = await prisma.discount.findUnique({ where: { code: 'GIAM10' } });
  const giam10Data = {
    code: 'GIAM10',
    name: 'Giảm 10% tổng hoá đơn (tối đa 50.000đ)',
    valueType: 'PERCENT',
    value: new Prisma.Decimal(10),
    maxDiscountAmount: new Prisma.Decimal(50000),
    scope: 'ORDER',
    minOrderAmount: new Prisma.Decimal(80000),
    activeWeekdays: [],
    timeWindowStart: null,
    timeWindowEnd: null,
    usageLimit: null,
    isActive: true,
    isArchived: false,
    createdBy: adminUser.id,
  };
  if (existingGiam10 && typeof prisma.discount.update === 'function') {
    await prisma.discount.update({ where: { id: existingGiam10.id }, data: giam10Data });
  } else if (!existingGiam10) {
    await prisma.discount.create({ data: giam10Data });
  }

  // 2. Giờ vàng ngày thường (14:00-17:00, Thứ 2 - Thứ 6) — kick-off khách giờ thấp điểm
  const existingGioVang = await prisma.discount.findUnique({ where: { code: 'GIOVANG15K' } });
  const gioVangData = {
    code: 'GIOVANG15K',
    name: 'Giờ vàng ngày thường — Giảm 15.000đ (14:00–17:00, T2–T6)',
    valueType: 'FIXED',
    value: new Prisma.Decimal(15000),
    maxDiscountAmount: null,
    scope: 'ORDER',
    minOrderAmount: new Prisma.Decimal(100000),
    activeWeekdays: [1, 2, 3, 4, 5],
    timeWindowStart: '14:00',
    timeWindowEnd: '17:00',
    usageLimit: 100,
    isActive: true,
    isArchived: false,
    createdBy: adminUser.id,
  };
  if (existingGioVang && typeof prisma.discount.update === 'function') {
    await prisma.discount.update({ where: { id: existingGioVang.id }, data: gioVangData });
  } else if (!existingGioVang) {
    await prisma.discount.create({ data: gioVangData });
  }
}

async function runStandalone(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedSampleDiscounts(prisma);
    const total = await prisma.discount.count();
    console.log(`Sample discounts ready (total: ${total})`);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.endsWith('seed-discounts.ts'));

if (isDirectEntry) {
  runStandalone().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
