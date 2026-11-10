import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoicesService } from '../invoices.service';

function createHarness() {
  const queries: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.raw.join(''));
      return [];
    }),
    order: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { prisma, tx, queries };
}

describe('InvoicesService', () => {
  afterEach(() => vi.useRealTimers());

  it('should default invoice filtering to the current business day and paginate on the server', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T03:00:00.000Z'));
    const harness = createHarness();
    harness.prisma.order.findMany.mockResolvedValue([]);
    const service = new InvoicesService(harness.prisma as never);

    const result = await service.list({ page: 2, limit: 10 });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: {
        gte: new Date('2026-11-08T00:00:00.000+07:00'),
        lt: new Date('2026-11-09T00:00:00.000+07:00'),
      } }),
      skip: 10,
      take: 10,
    }));
    expect(result).toMatchObject({ page: 2, limit: 10, total: 0, items: [] });
  });

  it('should combine the selected search field with date, status, and payment filters', async () => {
    const harness = createHarness();
    const service = new InvoicesService(harness.prisma as never);

    await service.list({
      page: 1, limit: 20, fromDate: '2026-11-01', toDate: '2026-11-08',
      searchField: 'table', keyword: '07', status: 'PAID', paymentMethod: 'CASH',
    });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'PAID',
        paymentMethod: 'CASH',
        table: { is: { name: { contains: '07', mode: 'insensitive' } } },
      }),
    }));
  });

  it('should default a keyword without an explicit field to order code search', async () => {
    const harness = createHarness();
    const service = new InvoicesService(harness.prisma as never);

    await service.list({ page: 1, limit: 20, keyword: 'HD-0001' });

    expect(harness.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orderCode: { contains: 'HD-0001', mode: 'insensitive' } }),
    }));
  });

  it('should void a paid invoice under a row lock without overwriting payment fields', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({ id: 42, status: 'PAID', totalAmount: new Prisma.Decimal('100.00') });
    harness.tx.order.update.mockResolvedValue({ id: 42, status: 'VOIDED', voidReason: 'Khách phản ánh tính sai' });
    const service = new InvoicesService(harness.prisma as never);

    await expect(service.voidInvoice(42, { voidReason: 'Khách phản ánh tính sai' }, 3))
      .resolves.toMatchObject({ orderId: 42, status: 'VOIDED', voidReason: 'Khách phản ánh tính sai' });

    expect(harness.queries[0]).toContain('FROM orders');
    expect(harness.tx.order.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'VOIDED', voidReason: 'Khách phản ánh tính sai' },
      select: { id: true, orderCode: true, status: true, voidReason: true },
    });
  });

  it('should reject voiding an invoice unless it is currently paid', async () => {
    const harness = createHarness();
    harness.tx.order.findUnique.mockResolvedValue({ id: 42, status: 'SERVING' });
    const service = new InvoicesService(harness.prisma as never);

    await expect(service.voidInvoice(42, { voidReason: 'Khách phản ánh tính sai' }, 3))
      .rejects.toBeInstanceOf(ConflictException);
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });
});
