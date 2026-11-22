import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Script nạp 20.000 hoá đơn lịch sử (PAID / VOIDED) trải đều trong 90 ngày gần nhất
 * để kiểm thử hiệu năng phân trang BaseTable (Module 2, 3, 4, 5) và SQL Aggregation
 * trước khi chạy Load Test k6 trên Docker 2 vCPU / 4 GB RAM.
 *
 * Cách chạy:
 *   npx tsx scripts/seed-load-test-20k.ts
 */
const prisma = new PrismaClient();

const TOTAL_ORDERS = Number(process.env.SEED_ORDER_COUNT ?? 20_000);
const BATCH_SIZE = 500;

async function main() {
  console.log(`[seed-load-test-20k] Chuẩn bị nạp ${TOTAL_ORDERS.toLocaleString('vi-VN')} hoá đơn lịch sử...`);

  const [tables, products, paymentAccounts, users] = await Promise.all([
    prisma.diningTable.findMany({ where: { status: { not: 'DELETED' } }, select: { id: true } }),
    prisma.product.findMany({ where: { sortOrder: { gte: 0 } }, select: { id: true, price: true } }),
    prisma.paymentAccount.findMany({ select: { id: true } }),
    prisma.user.findMany({ select: { id: true } }),
  ]);

  if (tables.length === 0 || products.length === 0) {
    throw new Error('Cần chạy `npx prisma db seed` trước khi nạp 20.000 đơn thử tải.');
  }

  // Đảm bảo 30 bàn có qrToken chuẩn 64-hex để khớp với scripts/load-test-40vus.js
  for (let i = 0; i < Math.min(30, tables.length); i += 1) {
    const tableIndex = i + 1;
    const hexSuffix = tableIndex.toString(16).padStart(2, '0');
    const token = `${'a'.repeat(62)}${hexSuffix}`;
    await prisma.diningTable.update({
      where: { id: tables[i]!.id },
      data: { qrToken: token },
    });
  }

  const cashierId = users[0]?.id ?? null;
  const primaryAccountId = paymentAccounts[0]?.id ?? null;
  const nowMs = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  let inserted = 0;
  for (let offset = 0; offset < TOTAL_ORDERS; offset += BATCH_SIZE) {
    const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_ORDERS - offset);
    const rows: Prisma.OrderCreateManyInput[] = [];

    for (let i = 0; i < currentBatchSize; i += 1) {
      const seq = offset + i + 1;
      const createdAt = new Date(nowMs - Math.floor((seq / TOTAL_ORDERS) * ninetyDaysMs));
      const isTakeaway = seq % 5 === 0;
      const isVoided = seq % 25 === 0;
      const paymentRoll = seq % 3;
      const paymentMethod = isVoided
        ? null
        : paymentRoll === 0
          ? 'CASH'
          : paymentRoll === 1
            ? 'TRANSFER'
            : 'SPLIT';

      const baseAmount = ((seq % 8) + 1) * 45000;
      const totalDec = new Prisma.Decimal(baseAmount);
      const cashDec =
        paymentMethod === 'CASH'
          ? totalDec
          : paymentMethod === 'SPLIT'
            ? new Prisma.Decimal(Math.floor(baseAmount / 2))
            : new Prisma.Decimal(0);
      const transferDec =
        paymentMethod === 'TRANSFER'
          ? totalDec
          : paymentMethod === 'SPLIT'
            ? totalDec.minus(cashDec)
            : new Prisma.Decimal(0);

      rows.push({
        orderCode: `LT-${String(seq).padStart(6, '0')}`,
        orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        orderSource: seq % 2 === 0 ? 'QR_CODE' : 'POS_COUNTER',
        tableId: isTakeaway ? null : tables[seq % tables.length]!.id,
        takeawayNumber: isTakeaway ? (seq % 200) + 1 : null,
        status: isVoided ? 'VOIDED' : 'PAID',
        paymentMethod,
        paymentAccountId:
          paymentMethod === 'TRANSFER' || paymentMethod === 'SPLIT' ? primaryAccountId : null,
        cashAmount: cashDec,
        transferAmount: transferDec,
        subtotalAmount: totalDec,
        discountAmount: new Prisma.Decimal(0),
        totalAmount: totalDec,
        cashierId,
        voidReason: isVoided ? 'Đơn giả lập huỷ trong kịch bản load test 20k' : null,
        createdAt,
        paidAt: isVoided ? null : new Date(createdAt.getTime() + 25 * 60_000),
      });
    }

    await prisma.order.createMany({
      data: rows,
      skipDuplicates: true,
    });
    inserted += currentBatchSize;
    if (inserted % 2500 === 0 || inserted === TOTAL_ORDERS) {
      console.log(`[seed-load-test-20k] Đã nạp ${inserted.toLocaleString('vi-VN')} / ${TOTAL_ORDERS.toLocaleString('vi-VN')} đơn...`);
    }
  }

  console.log('[seed-load-test-20k] Hoàn tất nạp dữ liệu thử tải!');
}

main()
  .catch((err) => {
    console.error('[seed-load-test-20k] Lỗi:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
