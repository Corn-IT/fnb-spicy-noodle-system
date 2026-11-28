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

  it('EC-HR-02: retains soft-deleted employees who worked or have period overrides in payroll while excluding unused deleted staff', async () => {
    const activeEmp = {
      id: 1,
      fullName: 'Nguyễn Đang Làm',
      shortName: 'Đ.Làm',
      isDeleted: false,
      position: { name: 'Thu ngân' },
      specialty: null,
    };
    const deletedWorkedEmp = {
      id: 9,
      fullName: 'Trần Nghỉ Giữa Tháng',
      shortName: 'T.Nghỉ',
      isDeleted: true,
      position: { name: 'Phục vụ' },
      specialty: null,
    };

    const prisma = {
      employee: {
        findMany: vi.fn().mockImplementation(async (args?: { where?: { isDeleted?: boolean; id?: { in: number[] } } }) => {
          if (args?.where?.isDeleted === false) return [activeEmp];
          if (args?.where?.id?.in) return [deletedWorkedEmp].filter((e) => args.where!.id!.in.includes(e.id));
          return [activeEmp];
        }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
            dayOfWeek: 0,
            timeSlot: 'Part-time',
            employeeIds: [{ employeeId: 9, mode: 'CUSTOM_HOURS', startTime: '17:00', endTime: '22:00' }], // 5h
          },
        ]),
      },
      masterData: {
        findUnique: vi.fn().mockResolvedValue({
          metadata: {
            defaultBaseSalary: 7000000,
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

    const deletedRow = res.items.find((r) => r.employeeId === 9);
    expect(deletedRow).toMatchObject({
      employeeId: 9,
      fullName: 'Trần Nghỉ Giữa Tháng',
      isDeleted: true,
      shiftType: 'PART_TIME',
      customHours: 5,
      totalSalary: 150000,
    });
    expect(res.summary.totalEmployees).toBe(2);
    expect(res.summary.totalSalary).toBe(150000);

    // NotFound & Validation error branches
    await expect(service.updatePayrollConfig({ defaultBaseSalary: -1 } as never)).rejects.toThrow();
    await expect(
      service.updateEmployeePayroll(999, {
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        shiftType: 'FULL_TIME',
        useCustomRate: false,
        bonusOrAdjustment: 0,
      }),
    ).rejects.toThrow();

    // Mixed Full-time custom hours, Part-time FULL_SHIFT, legacy numeric ID, out-of-range cell, custom profile & period override
    const ftEmp = { id: 11, fullName: 'NV Full-time', shortName: 'FT', isDeleted: false, position: { name: 'Bếp' }, specialty: null };
    const ptEmp = { id: 12, fullName: 'NV Part-time', shortName: 'PT', isDeleted: false, position: { name: 'Phục vụ' }, specialty: null };
    const richPrisma = {
      employee: {
        findMany: vi.fn().mockImplementation(async (args?: { where?: { isDeleted?: boolean } }) =>
          args?.where?.isDeleted === false ? [ftEmp, ptEmp] : [],
        ),
      },
      workSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            weekStartDate: new Date('2026-10-26T00:00:00.000Z'), // dayOfWeek 0 = 2026-10-26 (out of Nov range)
            dayOfWeek: 0,
            timeSlot: 'Full-time',
            employeeIds: [11],
          },
          {
            weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
            dayOfWeek: 0,
            timeSlot: 'Full-time',
            employeeIds: [
              11, // legacy integer
              { employeeId: 12, mode: 'FULL_SHIFT' }, // part-timer doing full shift
              { employeeId: 11, mode: 'CUSTOM_HOURS', startTime: '08:00', endTime: '12:00' }, // 4h custom in Full-time slot
            ],
          },
          {
            weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
            dayOfWeek: 1,
            timeSlot: 'Part-time',
            employeeIds: [
              { employeeId: 12, mode: 'CUSTOM_HOURS', startTime: '17:00', endTime: '21:30' },
            ],
          },
        ]),
      },
      masterData: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          {
            normalizedName: 'payroll_emp_profile_11',
            metadata: { shiftType: 'FULL_TIME', useCustomRate: true, customBaseSalary: 8400000, customHourlyRate: null },
          },
          {
            normalizedName: 'payroll_emp_profile_12',
            metadata: { shiftType: 'PART_TIME', useCustomRate: true, customBaseSalary: null, customHourlyRate: 35000 },
          },
          {
            normalizedName: 'payroll_period_2026-11-01_2026-11-30_emp_11',
            metadata: { overrideFullShiftDays: 2, overrideCustomHours: 4, bonusOrAdjustment: 100000, note: 'Thưởng bếp' },
          },
        ]),
      },
    };
    const richRes = await new PayrollService(richPrisma as never).getPayrollSummary({ fromDate: '2026-11-01', toDate: '2026-11-30' });
    const row11 = richRes.items.find((i) => i.employeeId === 11);
    const row12 = richRes.items.find((i) => i.employeeId === 12);
    expect(row11).toMatchObject({ fullShiftDays: 2, customHours: 4, bonusOrAdjustment: 100000, note: 'Thưởng bếp' });
    expect(row12).toMatchObject({ shiftType: 'PART_TIME', fullShiftDays: 1, customHours: 4.5 });
  });
});
