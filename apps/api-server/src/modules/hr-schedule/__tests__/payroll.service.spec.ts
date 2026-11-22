import { describe, expect, it, vi } from 'vitest';
import { PayrollService, computeAttendanceDurationHours } from '../payroll.service';

describe('PayrollService', () => {
  it('computes duration hours cleanly including overnight shifts', () => {
    expect(computeAttendanceDurationHours('08:00', '17:00')).toBe(9);
    expect(computeAttendanceDurationHours('18:00', '01:30')).toBe(7.5);
    expect(computeAttendanceDurationHours('08:00', '08:00')).toBe(0);
    expect(computeAttendanceDurationHours(undefined, '17:00')).toBe(0);
  });

  it('calculates Full-time (Full ca + Giờ lẻ) and Part-time salaries accurately using configured rates', async () => {
    const prisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            fullName: 'Nguyễn Văn Full',
            shortName: 'N.Full',
            isDeleted: false,
            position: { name: 'Thu ngân' },
            specialty: null,
          },
          {
            id: 2,
            fullName: 'Trần Thị Part',
            shortName: 'T.Part',
            isDeleted: false,
            position: { name: 'Phục vụ' },
            specialty: null,
          },
        ]),
      },
      workSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
            dayOfWeek: 0, // 2026-11-02
            timeSlot: 'Full-time',
            employeeIds: [
              { employeeId: 1, mode: 'FULL_SHIFT' },
            ],
          },
          {
            weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
            dayOfWeek: 1, // 2026-11-03
            timeSlot: 'Full-time',
            employeeIds: [
              { employeeId: 1, mode: 'CUSTOM_HOURS', startTime: '08:00', endTime: '14:00' }, // 6h
            ],
          },
          {
            weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
            dayOfWeek: 2, // 2026-11-04
            timeSlot: 'Part-time',
            employeeIds: [
              { employeeId: 2, mode: 'CUSTOM_HOURS', startTime: '17:30', endTime: '22:00' }, // 4.5h
            ],
          },
        ]),
      },
      masterData: {
        findUnique: vi.fn().mockResolvedValue({
          metadata: {
            defaultBaseSalary: 8400000, // 8.4M / 28 = 300k/day; 300k / 12 = 25k/h
            standardFullTimeDays: 28,
            standardHoursPerDay: 12,
            defaultPartTimeHourlyRate: 30000,
          },
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new PayrollService(prisma as never);
    const res = await service.getPayrollSummary({ fromDate: '2026-11-01', toDate: '2026-11-30' });

    const ftRow = res.items.find((r) => r.employeeId === 1)!;
    const ptRow = res.items.find((r) => r.employeeId === 2)!;

    expect(ftRow).toMatchObject({
      shiftType: 'FULL_TIME',
      fullShiftDays: 1,
      customHours: 6,
      totalSalary: 450000, // 300,000 * 1 + 25,000 * 6
    });
    expect(ptRow).toMatchObject({
      shiftType: 'PART_TIME',
      fullShiftDays: 0,
      customHours: 4.5,
      totalSalary: 135000, // 30,000 * 4.5
    });
    expect(res.summary.totalSalary).toBe(585000);
  });

  it('persists config updates and per-employee overrides with audit logging', async () => {
    const auditLogService = { record: vi.fn() };
    const posSocketGateway = { emitPayrollUpdated: vi.fn() };
    const prisma = {
      masterData: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      employee: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, fullName: 'Lê Minh', shortName: 'L.Minh' }),
        findMany: vi.fn().mockResolvedValue([{ id: 5, fullName: 'Lê Minh', shortName: 'L.Minh', isDeleted: false, position: null, specialty: null }]),
      },
      workSchedule: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new PayrollService(prisma as never, auditLogService as never, posSocketGateway as never);

    await service.updatePayrollConfig({
      defaultBaseSalary: 9000000,
      standardFullTimeDays: 28,
      standardHoursPerDay: 12,
      defaultPartTimeHourlyRate: 28000,
    });
    expect(prisma.masterData.upsert).toHaveBeenCalledTimes(1);
    expect(posSocketGateway.emitPayrollUpdated).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      module: 'PAYROLL',
      action: 'Cấu hình tính lương',
    }));

    prisma.masterData.findMany = vi.fn().mockResolvedValue([]);
    await service.updateEmployeePayroll(5, {
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      shiftType: 'FULL_TIME',
      useCustomRate: true,
      customBaseSalary: 11200000,
      customHourlyRate: null,
      overrideFullShiftDays: 2,
      overrideCustomHours: 4,
      bonusOrAdjustment: 50000,
      note: 'Thưởng thêm',
    });
    expect(prisma.masterData.upsert).toHaveBeenCalledTimes(3);
    expect(posSocketGateway.emitPayrollUpdated).toHaveBeenCalledTimes(2);
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      module: 'PAYROLL',
      action: 'Chỉnh sửa lương nhân viên',
    }));
  });

  it('matches Vietnamese employee names and short names without diacritics in keyword filter', async () => {
    const prisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            fullName: 'Nguyễn Văn Anh',
            shortName: 'V.Anh',
            isDeleted: false,
            position: { name: 'Bếp nấu' },
            specialty: null,
          },
          {
            id: 2,
            fullName: 'Lê Thị Lan',
            shortName: 'T.Lan',
            isDeleted: false,
            position: { name: 'Phục vụ' },
            specialty: null,
          },
        ]),
      },
      workSchedule: { findMany: vi.fn().mockResolvedValue([]) },
      masterData: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new PayrollService(prisma as never);
    const res = await service.getPayrollSummary({
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      keyword: 'van anh',
    });

    expect(res.items.map((item) => item.employeeId)).toEqual([1]);
    expect(res.summary.totalEmployees).toBe(1);
  });
});
