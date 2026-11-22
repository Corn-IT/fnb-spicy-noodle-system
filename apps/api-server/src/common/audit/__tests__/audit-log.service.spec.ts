import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../audit-log.service';

describe('AuditLogService', () => {
  it('should format summary as "Nhân viên [Tên] ([username]) đã thực hiện thao tác ..." and persist record', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          username: 'cashier01',
          employee: { fullName: 'Nguyễn Thu Ngân' },
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const service = new AuditLogService(prisma as never);

    await service.record({
      module: 'INVOICES',
      action: 'Sửa PTTT',
      detail: 'HD-20261114-0001',
      actor: 2,
      metadata: { orderId: 501 },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        module: 'INVOICES',
        action: 'Sửa PTTT',
        actorId: 2,
        actorFullName: 'Nguyễn Thu Ngân',
        actorUsername: 'cashier01',
        summary: 'Nhân viên Nguyễn Thu Ngân (cashier01) đã thực hiện thao tác Sửa PTTT HD-20261114-0001 tại Hoá đơn & Doanh thu',
      }),
    });
  });

  it('should filter audit logs by required module, comma-separated actions, keyword, and business date range', async () => {
    const createdAt = new Date('2026-11-14T03:00:00.000Z');
    const prisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 7,
            module: 'CASHFLOW',
            action: 'Bù chênh lệch kết ca',
            actorId: 1,
            actorFullName: 'Chủ Quán Sơn Bảo',
            actorUsername: 'superadmin',
            summary: 'Nhân viên Chủ Quán Sơn Bảo (superadmin) đã thực hiện thao tác bù tiền chênh lệch kết ca tại Kết ca & Dòng tiền',
            metadata: {},
            createdAt,
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const service = new AuditLogService(prisma as never);

    const result = await service.list({
      page: 1,
      limit: 20,
      module: 'CASHFLOW',
      action: 'Chốt ca tiền mặt,Bù chênh lệch kết ca',
      keyword: 'superadmin',
      fromDate: '2026-11-14',
      toDate: '2026-11-14',
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        module: 'CASHFLOW',
        action: { in: ['Chốt ca tiền mặt', 'Bù chênh lệch kết ca'] },
        OR: expect.any(Array),
        createdAt: expect.objectContaining({
          gte: expect.any(Date),
          lte: expect.any(Date),
        }),
      }),
      skip: 0,
      take: 20,
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.createdAt).toBe(createdAt.toISOString());
  });

  it('hides ipAddress and deviceLabel from output and keyword filter unless includeClientInfo is true', async () => {
    const createdAt = new Date('2026-11-17T08:00:00.000Z');
    const prisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 9,
            module: 'POS',
            action: 'Tạo đơn tại bàn',
            actorId: 3,
            actorFullName: 'Trần Thị Lan',
            actorUsername: 'thungan',
            summary: 'Tạo đơn HD-01',
            ipAddress: '192.168.1.50',
            deviceLabel: 'Windows · Chrome',
            metadata: {},
            createdAt,
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const service = new AuditLogService(prisma as never);

    const hidden = await service.list({ page: 1, limit: 20, module: 'POS', keyword: '192.168' });
    expect(hidden.items[0]).toMatchObject({ ipAddress: null, deviceLabel: null });
    const hiddenCall = prisma.auditLog.findMany.mock.calls[0]?.[0] as { where: { OR?: Array<Record<string, unknown>> } };
    expect(hiddenCall.where.OR?.some((clause) => 'ipAddress' in clause || 'deviceLabel' in clause)).toBe(false);

    const full = await service.list(
      { page: 1, limit: 20, module: 'POS', keyword: '192.168' },
      { includeClientInfo: true },
    );
    expect(full.items[0]).toMatchObject({ ipAddress: '192.168.1.50', deviceLabel: 'Windows · Chrome' });
    const fullCall = prisma.auditLog.findMany.mock.calls[1]?.[0] as { where: { OR?: Array<Record<string, unknown>> } };
    expect(fullCall.where.OR?.some((clause) => 'ipAddress' in clause)).toBe(true);
    expect(fullCall.where.OR?.some((clause) => 'deviceLabel' in clause)).toBe(true);
  });
});
