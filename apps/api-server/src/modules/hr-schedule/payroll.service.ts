import { Inject, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCodes,
  PayrollConfigSchema,
  PayrollQuerySchema,
  PayrollSummaryResponseSchema,
  UpdateEmployeePayrollSchema,
  UpdatePayrollConfigSchema,
  type AuthPrincipal,
  type PayrollConfig,
  type PayrollQuery,
  type PayrollRow,
  type PayrollShiftType,
  type UpdateEmployeePayrollInput,
  type UpdatePayrollConfigInput,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { compareEmployeesForDisplay } from '../../common/utils/display-order.util';
import { normalizeVietnameseString } from '../../common/utils/normalized-string.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/utils/business-date.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

const SYSTEM_CONFIG_CATEGORY = 'SYSTEM_CONFIG';
const PAYROLL_CONFIG_KEY = 'payroll_config';
const PAYROLL_EMP_PREFIX = 'payroll_emp_profile_';
const PAYROLL_PERIOD_PREFIX = 'payroll_period_';

const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  defaultBaseSalary: 7000000,
  standardFullTimeDays: 28,
  standardHoursPerDay: 12,
  defaultPartTimeHourlyRate: 25000,
};

interface EmployeePayrollProfile {
  shiftType?: PayrollShiftType;
  useCustomRate?: boolean;
  customBaseSalary?: number | null;
  customHourlyRate?: number | null;
}

interface PeriodPayrollOverride {
  overrideFullShiftDays?: number | null;
  overrideCustomHours?: number | null;
  bonusOrAdjustment?: number;
  note?: string | null;
}

interface AggregatedAttendance {
  fullShiftDays: number;
  customHours: number;
  fullTimeSlots: number;
  partTimeSlots: number;
}

function parseTimeMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function computeAttendanceDurationHours(startTime?: string, endTime?: string): number {
  const start = parseTimeMinutes(startTime);
  const end = parseTimeMinutes(endTime);
  if (start === null || end === null) return 0;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toRecordObject(val: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
  ) {}

  async getPayrollSummary(query: PayrollQuery) {
    const parsed = PayrollQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Bộ lọc kỳ tính lương không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const { fromDate, toDate, keyword } = parsed.data;
    const config = await this.loadPayrollConfig();

    const searchFromMonday = addDaysIso(fromDate, -6);
    const periodPrefixForRange = `${PAYROLL_PERIOD_PREFIX}${fromDate}_${toDate}_emp_`;

    const [rawEmployees, scheduleCells, configRows] = await Promise.all([
      this.prisma.employee.findMany({
        where: { isDeleted: false },
        orderBy: [{ id: 'asc' }],
        include: {
          position: { select: { name: true, normalizedName: true, metadata: true } },
          specialty: { select: { name: true, normalizedName: true, metadata: true } },
          user: { select: { username: true, isSuperAdmin: true, isActive: true } },
        },
      }),
      this.prisma.workSchedule.findMany({
        where: {
          weekStartDate: {
            gte: dateOnly(searchFromMonday),
            lte: dateOnly(toDate),
          },
        },
        select: {
          weekStartDate: true,
          dayOfWeek: true,
          timeSlot: true,
          employeeIds: true,
        },
      }),
      typeof this.prisma.masterData?.findMany === 'function'
        ? this.prisma.masterData.findMany({
            where: {
              category: SYSTEM_CONFIG_CATEGORY,
              OR: [
                { normalizedName: { startsWith: PAYROLL_EMP_PREFIX } },
                { normalizedName: { startsWith: periodPrefixForRange } },
              ],
            },
            select: { normalizedName: true, metadata: true },
          })
        : Promise.resolve([]),
    ]);

    const employees = [...rawEmployees].sort(compareEmployeesForDisplay);

    const empProfileMap = new Map<number, EmployeePayrollProfile>();
    const periodOverrideMap = new Map<number, PeriodPayrollOverride>();

    for (const row of configRows) {
      const meta = toRecordObject(row.metadata);
      if (row.normalizedName.startsWith(PAYROLL_EMP_PREFIX)) {
        const empId = Number(row.normalizedName.slice(PAYROLL_EMP_PREFIX.length));
        if (Number.isSafeInteger(empId) && empId > 0) {
          empProfileMap.set(empId, {
            shiftType: meta.shiftType === 'PART_TIME' ? 'PART_TIME' : meta.shiftType === 'FULL_TIME' ? 'FULL_TIME' : undefined,
            useCustomRate: meta.useCustomRate === true,
            customBaseSalary: typeof meta.customBaseSalary === 'number' ? meta.customBaseSalary : null,
            customHourlyRate: typeof meta.customHourlyRate === 'number' ? meta.customHourlyRate : null,
          });
        }
      } else if (row.normalizedName.startsWith(periodPrefixForRange)) {
        const empId = Number(row.normalizedName.slice(periodPrefixForRange.length));
        if (Number.isSafeInteger(empId) && empId > 0) {
          periodOverrideMap.set(empId, {
            overrideFullShiftDays: typeof meta.overrideFullShiftDays === 'number' ? meta.overrideFullShiftDays : null,
            overrideCustomHours: typeof meta.overrideCustomHours === 'number' ? meta.overrideCustomHours : null,
            bonusOrAdjustment: typeof meta.bonusOrAdjustment === 'number' ? meta.bonusOrAdjustment : 0,
            note: typeof meta.note === 'string' ? meta.note : null,
          });
        }
      }
    }

    const attendanceByEmpId = new Map<number, AggregatedAttendance>();
    const ensureAgg = (empId: number): AggregatedAttendance => {
      let agg = attendanceByEmpId.get(empId);
      if (!agg) {
        agg = { fullShiftDays: 0, customHours: 0, fullTimeSlots: 0, partTimeSlots: 0 };
        attendanceByEmpId.set(empId, agg);
      }
      return agg;
    };

    for (const cell of scheduleCells) {
      const mondayIso = cell.weekStartDate.toISOString().slice(0, 10);
      const cellDate = addDaysIso(mondayIso, cell.dayOfWeek);
      if (cellDate < fromDate || cellDate > toDate) continue;

      const isFullTimeSlot = cell.timeSlot.toLowerCase().includes('full');
      const isPartTimeSlot = cell.timeSlot.toLowerCase().includes('part');
      const entries = Array.isArray(cell.employeeIds) ? cell.employeeIds : [];

      for (const entry of entries) {
        let empId = 0;
        let mode: 'FULL_SHIFT' | 'CUSTOM_HOURS' | undefined;
        let startTime: string | undefined;
        let endTime: string | undefined;

        if (typeof entry === 'number' && Number.isSafeInteger(entry) && entry > 0) {
          empId = entry;
        } else if (entry && typeof entry === 'object' && 'employeeId' in entry) {
          const obj = entry as { employeeId?: unknown; mode?: unknown; startTime?: unknown; endTime?: unknown };
          if (typeof obj.employeeId === 'number' && Number.isSafeInteger(obj.employeeId) && obj.employeeId > 0) {
            empId = obj.employeeId;
            if (obj.mode === 'FULL_SHIFT' || obj.mode === 'CUSTOM_HOURS') mode = obj.mode;
            if (typeof obj.startTime === 'string') startTime = obj.startTime;
            if (typeof obj.endTime === 'string') endTime = obj.endTime;
          }
        }

        if (empId <= 0) continue;
        const agg = ensureAgg(empId);
        if (isFullTimeSlot) agg.fullTimeSlots += 1;
        if (isPartTimeSlot) agg.partTimeSlots += 1;

        if (isFullTimeSlot) {
          if (mode === 'FULL_SHIFT' || (!mode && !startTime && !endTime)) {
            agg.fullShiftDays += 1;
          } else {
            const hrs = computeAttendanceDurationHours(startTime, endTime);
            agg.customHours = Math.round((agg.customHours + hrs) * 100) / 100;
          }
        } else {
          if (mode === 'FULL_SHIFT') {
            agg.fullShiftDays += 1;
          } else {
            const hrs = computeAttendanceDurationHours(startTime, endTime);
            agg.customHours = Math.round((agg.customHours + hrs) * 100) / 100;
          }
        }
      }
    }

    const normalizedKeyword = normalizeVietnameseString(keyword ?? '');
    const rows: PayrollRow[] = [];

    for (const emp of employees) {
      if (normalizedKeyword) {
        const matches =
          normalizeVietnameseString(emp.fullName).includes(normalizedKeyword) ||
          normalizeVietnameseString(emp.shortName).includes(normalizedKeyword);
        if (!matches) continue;
      }

      const agg = attendanceByEmpId.get(emp.id) ?? {
        fullShiftDays: 0,
        customHours: 0,
        fullTimeSlots: 0,
        partTimeSlots: 0,
      };
      const profile = empProfileMap.get(emp.id);
      const override = periodOverrideMap.get(emp.id);

      const inferredShiftType: PayrollShiftType =
        agg.partTimeSlots > 0 && agg.fullTimeSlots === 0 ? 'PART_TIME' : 'FULL_TIME';
      const shiftType: PayrollShiftType = profile?.shiftType ?? inferredShiftType;

      const useCustomRate = Boolean(profile?.useCustomRate);
      const appliedBaseSalary =
        useCustomRate && profile?.customBaseSalary != null
          ? profile.customBaseSalary
          : config.defaultBaseSalary;
      const appliedHourlyRate =
        shiftType === 'FULL_TIME'
          ? Math.round((appliedBaseSalary / config.standardFullTimeDays / config.standardHoursPerDay) * 100) / 100
          : useCustomRate && profile?.customHourlyRate != null
            ? profile.customHourlyRate
            : config.defaultPartTimeHourlyRate;

      const fullShiftDays =
        override?.overrideFullShiftDays !== undefined && override?.overrideFullShiftDays !== null
          ? override.overrideFullShiftDays
          : agg.fullShiftDays;
      const customHours =
        override?.overrideCustomHours !== undefined && override?.overrideCustomHours !== null
          ? override.overrideCustomHours
          : agg.customHours;
      const bonusOrAdjustment = override?.bonusOrAdjustment ?? 0;

      const hasManualOverride = Boolean(
        useCustomRate ||
          override?.overrideFullShiftDays != null ||
          override?.overrideCustomHours != null ||
          bonusOrAdjustment !== 0 ||
          override?.note,
      );

      let totalSalary = 0;
      if (shiftType === 'FULL_TIME') {
        const dailyRate = appliedBaseSalary / config.standardFullTimeDays;
        const ftHourlyRate = dailyRate / config.standardHoursPerDay;
        totalSalary = Math.round(fullShiftDays * dailyRate + customHours * ftHourlyRate + bonusOrAdjustment);
      } else {
        totalSalary = Math.round(
          customHours * appliedHourlyRate +
            fullShiftDays * config.standardHoursPerDay * appliedHourlyRate +
            bonusOrAdjustment,
        );
      }

      rows.push({
        employeeId: emp.id,
        fullName: emp.fullName,
        shortName: emp.shortName,
        isDeleted: emp.isDeleted,
        positionName: emp.position?.name ?? null,
        specialtyName: emp.specialty?.name ?? null,
        shiftType,
        scheduleFullShiftDays: agg.fullShiftDays,
        scheduleCustomHours: agg.customHours,
        fullShiftDays,
        customHours,
        hasManualOverride,
        useCustomRate,
        appliedBaseSalary,
        appliedHourlyRate,
        bonusOrAdjustment,
        note: override?.note ?? null,
        totalSalary,
      });
    }

    const totalFullShiftDays = Math.round(rows.reduce((sum, r) => sum + r.fullShiftDays, 0) * 100) / 100;
    const totalCustomHours = Math.round(rows.reduce((sum, r) => sum + r.customHours, 0) * 100) / 100;
    const totalSalary = rows.reduce((sum, r) => sum + r.totalSalary, 0);

    return PayrollSummaryResponseSchema.parse({
      fromDate,
      toDate,
      config,
      items: rows,
      summary: {
        totalEmployees: rows.length,
        totalFullShiftDays,
        totalCustomHours,
        totalSalary,
      },
    });
  }

  async updatePayrollConfig(input: UpdatePayrollConfigInput, actor?: AuthPrincipal) {
    const parsed = UpdatePayrollConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Cấu hình tính lương không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const previous = await this.loadPayrollConfig();
    const nextConfig = parsed.data;

    await this.prisma.masterData.upsert({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: PAYROLL_CONFIG_KEY,
        },
      },
      create: {
        category: SYSTEM_CONFIG_CATEGORY,
        name: 'Cấu hình Bảng tính lương',
        normalizedName: PAYROLL_CONFIG_KEY,
        isActive: true,
        metadata: nextConfig as unknown as Prisma.InputJsonObject,
      },
      update: {
        isActive: true,
        metadata: nextConfig as unknown as Prisma.InputJsonObject,
      },
    });

    const changes: Array<{ field: string; from: string; to: string }> = [];
    if (previous.defaultBaseSalary !== nextConfig.defaultBaseSalary) {
      changes.push({
        field: 'Lương cơ bản mặc định',
        from: `${previous.defaultBaseSalary.toLocaleString('vi-VN')}đ`,
        to: `${nextConfig.defaultBaseSalary.toLocaleString('vi-VN')}đ`,
      });
    }
    if (previous.standardFullTimeDays !== nextConfig.standardFullTimeDays) {
      changes.push({
        field: 'Số ngày chuẩn Full-time',
        from: String(previous.standardFullTimeDays),
        to: String(nextConfig.standardFullTimeDays),
      });
    }
    if (previous.standardHoursPerDay !== nextConfig.standardHoursPerDay) {
      changes.push({
        field: 'Số giờ chuẩn 1 ngày Full ca',
        from: String(previous.standardHoursPerDay),
        to: String(nextConfig.standardHoursPerDay),
      });
    }
    if (previous.defaultPartTimeHourlyRate !== nextConfig.defaultPartTimeHourlyRate) {
      changes.push({
        field: 'Lương theo giờ Part-time mặc định',
        from: `${previous.defaultPartTimeHourlyRate.toLocaleString('vi-VN')}đ`,
        to: `${nextConfig.defaultPartTimeHourlyRate.toLocaleString('vi-VN')}đ`,
      });
    }

    await this.auditLogService?.record({
      module: 'PAYROLL',
      action: 'Cấu hình tính lương',
      detail: `Lương CB ${nextConfig.defaultBaseSalary.toLocaleString('vi-VN')}đ / ${nextConfig.standardFullTimeDays} ngày (${nextConfig.standardHoursPerDay}h), Part-time ${nextConfig.defaultPartTimeHourlyRate.toLocaleString('vi-VN')}đ/h`,
      message: 'cập nhật cấu hình công thức Bảng tính lương',
      actor,
      metadata: {
        ...nextConfig,
        ...(changes.length > 0 ? { changes } : {}),
      },
    });

    this.posSocketGateway?.emitPayrollUpdated();

    return nextConfig;
  }

  async updateEmployeePayroll(
    employeeId: number,
    input: UpdateEmployeePayrollInput,
    actor?: AuthPrincipal,
  ) {
    const parsed = UpdateEmployeePayrollSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu chỉnh sửa lương nhân viên không hợp lệ',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true, shortName: true },
    });
    if (!employee) {
      throw new NotFoundException({ message: 'Không tìm thấy hồ sơ nhân viên' });
    }

    const data = parsed.data;
    const empProfileKey = `${PAYROLL_EMP_PREFIX}${employeeId}`;
    const periodKey = `${PAYROLL_PERIOD_PREFIX}${data.fromDate}_${data.toDate}_emp_${employeeId}`;

    const empProfileMeta: Prisma.InputJsonObject = {
      shiftType: data.shiftType,
      useCustomRate: data.useCustomRate,
      customBaseSalary: data.customBaseSalary ?? null,
      customHourlyRate: data.customHourlyRate ?? null,
    };

    const periodMeta: Prisma.InputJsonObject = {
      overrideFullShiftDays: data.overrideFullShiftDays ?? null,
      overrideCustomHours: data.overrideCustomHours ?? null,
      bonusOrAdjustment: data.bonusOrAdjustment,
      note: data.note ?? null,
    };

    await this.prisma.$transaction([
      this.prisma.masterData.upsert({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: empProfileKey,
          },
        },
        create: {
          category: SYSTEM_CONFIG_CATEGORY,
          name: `Cấu hình lương ${employee.shortName}`,
          normalizedName: empProfileKey,
          isActive: true,
          metadata: empProfileMeta,
        },
        update: {
          isActive: true,
          metadata: empProfileMeta,
        },
      }),
      this.prisma.masterData.upsert({
        where: {
          category_normalizedName: {
            category: SYSTEM_CONFIG_CATEGORY,
            normalizedName: periodKey,
          },
        },
        create: {
          category: SYSTEM_CONFIG_CATEGORY,
          name: `Điều chỉnh lương ${employee.shortName} (${data.fromDate}→${data.toDate})`,
          normalizedName: periodKey,
          isActive: true,
          metadata: periodMeta,
        },
        update: {
          isActive: true,
          metadata: periodMeta,
        },
      }),
    ]);

    await this.auditLogService?.record({
      module: 'PAYROLL',
      action: 'Chỉnh sửa lương nhân viên',
      detail: `${employee.fullName} (@${employee.shortName}) kỳ ${data.fromDate} → ${data.toDate}`,
      message: `chỉnh sửa bảng lương của nhân viên ${employee.fullName} (ca ${data.shiftType === 'FULL_TIME' ? 'Full-time' : 'Part-time'})`,
      actor,
      metadata: {
        employeeId,
        employeeName: employee.fullName,
        fromDate: data.fromDate,
        toDate: data.toDate,
        shiftType: data.shiftType,
        useCustomRate: data.useCustomRate,
        customBaseSalary: data.customBaseSalary ?? null,
        customHourlyRate: data.customHourlyRate ?? null,
        overrideFullShiftDays: data.overrideFullShiftDays ?? null,
        overrideCustomHours: data.overrideCustomHours ?? null,
        bonusOrAdjustment: data.bonusOrAdjustment,
        note: data.note ?? null,
      },
    });

    const summary = await this.getPayrollSummary({
      fromDate: data.fromDate,
      toDate: data.toDate,
    });
    this.posSocketGateway?.emitPayrollUpdated({ employeeId });
    return summary.items.find((item) => item.employeeId === employeeId) ?? null;
  }

  private async loadPayrollConfig(): Promise<PayrollConfig> {
    if (typeof this.prisma.masterData?.findUnique !== 'function') {
      return DEFAULT_PAYROLL_CONFIG;
    }
    const row = await this.prisma.masterData.findUnique({
      where: {
        category_normalizedName: {
          category: SYSTEM_CONFIG_CATEGORY,
          normalizedName: PAYROLL_CONFIG_KEY,
        },
      },
      select: { metadata: true },
    });
    if (!row) return DEFAULT_PAYROLL_CONFIG;
    const parsed = PayrollConfigSchema.safeParse(row.metadata);
    return parsed.success ? parsed.data : DEFAULT_PAYROLL_CONFIG;
  }
}
