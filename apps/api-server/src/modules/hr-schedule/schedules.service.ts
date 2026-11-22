import { Inject, Injectable, Optional, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BulkSaveScheduleRequestSchema,
  CopyPreviousWeekRequestSchema,
  ErrorCodes,
  ScheduleWeekQuerySchema,
  type BulkSaveScheduleRequest,
  type CopyPreviousWeekRequest,
  type ScheduleAttendanceEntry,
  type ScheduleCell,
} from '@fnb/shared';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { compareEmployeesForDisplay } from '../../common/utils/display-order.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/utils/business-date.util';
import { PosSocketGateway } from '../../gateways/pos-socket.gateway';

type ScheduleEmployee = {
  id: number;
  fullName: string;
  shortName: string;
  isDeleted: boolean;
  specialtyCode: string | null;
};
type ExistingScheduleCell = { id: number; dayOfWeek: number; timeSlot: string; employeeIds: Prisma.JsonValue };

@Injectable()
export class SchedulesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AuditLogService) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(PosSocketGateway) private readonly posSocketGateway?: PosSocketGateway,
  ) {}

  async getScheduleWeek(weekStartDate: string) {
    const parsed = ScheduleWeekQuerySchema.safeParse({ weekStartDate });
    if (!parsed.success) throw this.invalidScheduleData(parsed.error.flatten().fieldErrors);
    const weekDate = dateOnly(parsed.data.weekStartDate);
    const cells = await this.prisma.workSchedule.findMany({
      where: { weekStartDate: weekDate },
      orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
    });
    const assignedIds = [...new Set(cells.flatMap((cell) => this.readEmployeeIds(cell.employeeIds)))];
    const scheduleEmployeeInclude = {
      position: { select: { name: true, normalizedName: true, metadata: true } },
      specialty: { select: { name: true, normalizedName: true, metadata: true } },
      user: { select: { username: true, isSuperAdmin: true, isActive: true } },
    } as const;
    const assignedEmployees = assignedIds.length === 0
      ? []
      : await this.prisma.employee.findMany({
        where: { id: { in: assignedIds } },
        include: scheduleEmployeeInclude,
      });
    const rawAvailableEmployees = await this.prisma.employee.findMany({
      where: { isDeleted: false },
      orderBy: [{ id: 'asc' }],
      include: scheduleEmployeeInclude,
    });
    const availableEmployees = [...rawAvailableEmployees].sort(compareEmployeesForDisplay);
    const employeeById = new Map<number, ScheduleEmployee>(assignedEmployees.map((employee) => [
      employee.id,
      this.toScheduleEmployee(employee),
    ]));

    return {
      weekStartDate: parsed.data.weekStartDate,
      cells: cells.map((cell) => {
        const employeeIds = this.readEmployeeIds(cell.employeeIds);
        const attendances = this.readAttendances(cell.employeeIds);
        return {
          id: cell.id,
          dayOfWeek: cell.dayOfWeek,
          timeSlot: cell.timeSlot,
          employeeIds,
          attendances,
          employees: employeeIds.map((employeeId) => employeeById.get(employeeId) ?? this.missingScheduleEmployee(employeeId)),
        };
      }),
      availableEmployees: availableEmployees.map((employee) => this.toScheduleEmployee(employee)),
    };
  }

  async bulkSaveSchedule(input: BulkSaveScheduleRequest, userId: number) {
    const parsed = BulkSaveScheduleRequestSchema.safeParse(input);
    if (!parsed.success) throw this.invalidScheduleData(parsed.error.flatten().fieldErrors);
    const weekStartDate = dateOnly(parsed.data.weekStartDate);

    let previousCellsSnapshot: Array<{ dayOfWeek: number; timeSlot: string; employeeIds: unknown }> = [];
    await this.prisma.$transaction(async (tx) => {
      const existingCells = await tx.workSchedule.findMany({
        where: { weekStartDate },
        select: { id: true, dayOfWeek: true, timeSlot: true, employeeIds: true },
      });
      previousCellsSnapshot = existingCells;
      await this.validateScheduleEmployees(tx, parsed.data.cells, existingCells);
      await this.replaceScheduleCells(tx, weekStartDate, parsed.data.cells, userId, existingCells);
    });

    if (this.auditLogService) {
      const parseEntries = (rawIds: unknown, attendances?: Array<{ employeeId: number; mode?: string; startTime?: string; endTime?: string }>) => {
        const labelById = new Map<number, string>();
        for (const entry of attendances ?? []) {
          if (entry.mode === 'FULL_SHIFT') {
            labelById.set(entry.employeeId, 'Full ca');
          } else {
            const range = [entry.startTime?.trim(), entry.endTime?.trim()].filter(Boolean).join('-');
            if (range) labelById.set(entry.employeeId, range);
          }
        }
        const map = new Map<number, string>();
        if (Array.isArray(rawIds)) {
          for (const item of rawIds) {
            if (typeof item === 'number') {
              map.set(item, labelById.get(item) ?? '');
            } else if (item && typeof item === 'object' && typeof (item as { employeeId?: unknown }).employeeId === 'number') {
              const obj = item as { employeeId: number; mode?: string; startTime?: string; endTime?: string };
              if (obj.mode === 'FULL_SHIFT') {
                map.set(obj.employeeId, 'Full ca');
              } else {
                const range = [obj.startTime?.trim(), obj.endTime?.trim()].filter(Boolean).join('-');
                map.set(obj.employeeId, range || labelById.get(obj.employeeId) || '');
              }
            }
          }
        }
        return map;
      };

      const oldByCell = new Map<string, Map<number, string>>();
      const allIds = new Set<number>();
      for (const cell of previousCellsSnapshot) {
        const key = `${cell.dayOfWeek}::${cell.timeSlot}`;
        const entries = parseEntries(cell.employeeIds);
        for (const id of entries.keys()) allIds.add(id);
        oldByCell.set(key, entries);
      }

      const newByCell = new Map<string, Map<number, string>>();
      for (const cell of parsed.data.cells) {
        const key = `${cell.dayOfWeek}::${cell.timeSlot}`;
        const entries = parseEntries(cell.employeeIds, cell.attendances);
        for (const id of entries.keys()) allIds.add(id);
        newByCell.set(key, entries);
      }

      const empNames = new Map<number, string>();
      if (allIds.size > 0 && typeof this.prisma.employee?.findMany === 'function') {
        const emps = await this.prisma.employee.findMany({
          where: { id: { in: Array.from(allIds) } },
          select: { id: true, shortName: true, fullName: true },
        });
        for (const emp of emps) {
          empNames.set(emp.id, emp.shortName || emp.fullName || `NV#${emp.id}`);
        }
      }

      const formatList = (entries?: Map<number, string>) => {
        if (!entries || entries.size === 0) return 'Chưa xếp';
        return Array.from(entries.entries())
          .sort(([a], [b]) => a - b)
          .map(([id, hrs]) => {
            const label = empNames.get(id) ?? `NV#${id}`;
            return hrs ? `${label} (${hrs})` : label;
          })
          .join(', ');
      };

      const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
      const allKeys = Array.from(new Set([...oldByCell.keys(), ...newByCell.keys()])).sort();
      const changes: Array<{ field: string; from: string; to: string }> = [];
      for (const key of allKeys) {
        const oldEntries = oldByCell.get(key) ?? new Map<number, string>();
        const newEntries = newByCell.get(key) ?? new Map<number, string>();
        const fromText = formatList(oldEntries);
        const toText = formatList(newEntries);
        if (fromText !== toText) {
          const [dayIdxStr, timeSlot] = key.split('::');
          const dayLabel = dayLabels[Number(dayIdxStr)] ?? `Ngày ${Number(dayIdxStr) + 1}`;
          changes.push({
            field: `${dayLabel} (${timeSlot})`,
            from: fromText,
            to: toText,
          });
        }
      }

      await this.auditLogService.record({
        module: 'SCHEDULES',
        action: 'Lưu lịch tuần',
        detail: `${parsed.data.weekStartDate} (${parsed.data.cells.length} ô ca)`,
        message: 'lưu phân công lịch làm việc tuần',
        actor: userId,
        metadata: {
          weekStartDate: parsed.data.weekStartDate,
          savedCells: parsed.data.cells.length,
          ...(changes.length > 0 ? { changes } : {}),
        },
      });
    }

    this.posSocketGateway?.emitScheduleUpdated({ weekStartDate: parsed.data.weekStartDate });

    return { weekStartDate: parsed.data.weekStartDate, savedCells: parsed.data.cells.length };
  }

  async copyPreviousWeek(input: CopyPreviousWeekRequest, userId: number) {
    const parsed = CopyPreviousWeekRequestSchema.safeParse(input);
    if (!parsed.success) throw this.invalidScheduleData(parsed.error.flatten().fieldErrors);
    const sourceWeekStartDate = dateOnly(parsed.data.sourceWeekStartDate);
    const targetWeekStartDate = dateOnly(parsed.data.targetWeekStartDate);
    let copiedCells = 0;

    await this.prisma.$transaction(async (tx) => {
      const sourceCells = await tx.workSchedule.findMany({
        where: { weekStartDate: sourceWeekStartDate },
        orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
        select: { dayOfWeek: true, timeSlot: true, employeeIds: true },
      });
      const sourceEmployeeIds = [...new Set(sourceCells.flatMap((cell) => this.readEmployeeIds(cell.employeeIds)))];
      const activeEmployees = sourceEmployeeIds.length === 0
        ? []
        : await tx.employee.findMany({
          where: { id: { in: sourceEmployeeIds }, isDeleted: false },
          select: { id: true },
        });
      const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
      const cells: ScheduleCell[] = sourceCells.map((cell) => {
        const filteredIds = this.readEmployeeIds(cell.employeeIds).filter((id) => activeEmployeeIds.has(id));
        const filteredAttendances = this.readAttendances(cell.employeeIds).filter((att) =>
          activeEmployeeIds.has(att.employeeId),
        );
        return {
          dayOfWeek: cell.dayOfWeek,
          timeSlot: cell.timeSlot,
          employeeIds: filteredIds,
          ...(filteredAttendances.length > 0 ? { attendances: filteredAttendances } : {}),
        };
      });
      const targetCells = await tx.workSchedule.findMany({
        where: { weekStartDate: targetWeekStartDate },
        select: { id: true, dayOfWeek: true, timeSlot: true, employeeIds: true },
      });
      await this.replaceScheduleCells(tx, targetWeekStartDate, cells, userId, targetCells);
      copiedCells = cells.length;
    });

    await this.auditLogService?.record({
      module: 'SCHEDULES',
      action: 'Sao chép lịch tuần',
      detail: `${parsed.data.sourceWeekStartDate} -> ${parsed.data.targetWeekStartDate} (${copiedCells} ô ca)`,
      message: `sao chép lịch làm việc từ tuần ${parsed.data.sourceWeekStartDate} sang tuần ${parsed.data.targetWeekStartDate} (${copiedCells} ô ca)`,
      actor: userId,
      metadata: { sourceWeekStartDate: parsed.data.sourceWeekStartDate, targetWeekStartDate: parsed.data.targetWeekStartDate, copiedCells },
    });

    this.posSocketGateway?.emitScheduleUpdated({ weekStartDate: parsed.data.targetWeekStartDate });

    return {
      sourceWeekStartDate: parsed.data.sourceWeekStartDate,
      targetWeekStartDate: parsed.data.targetWeekStartDate,
      copiedCells,
    };
  }

  private async validateScheduleEmployees(
    tx: Prisma.TransactionClient,
    cells: ScheduleCell[],
    existingCells: ExistingScheduleCell[],
  ): Promise<void> {
    const requestedIds = [...new Set(cells.flatMap((cell) => cell.employeeIds))];
    if (requestedIds.length === 0) return;
    const previouslyAssigned = new Set(existingCells.flatMap((cell) => this.readEmployeeIds(cell.employeeIds)));
    const employees = await tx.employee.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true, isDeleted: true },
    });
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const invalidIds = requestedIds.filter((id) => {
      const employee = employeeById.get(id);
      return !employee || (employee.isDeleted && !previouslyAssigned.has(id));
    });
    if (invalidIds.length > 0) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Không thể phân ca cho nhân viên không tồn tại hoặc đã nghỉ việc',
        details: { employeeIds: invalidIds },
      });
    }
  }

  private async replaceScheduleCells(
    tx: Prisma.TransactionClient,
    weekStartDate: Date,
    cells: ScheduleCell[],
    userId: number,
    existingCells: ExistingScheduleCell[],
  ): Promise<void> {
    const requestedKeys = new Set(cells.map((cell) => `${cell.dayOfWeek}\u0000${cell.timeSlot}`));
    const staleIds = existingCells
      .filter((cell) => !requestedKeys.has(`${cell.dayOfWeek}\u0000${cell.timeSlot}`))
      .map((cell) => cell.id);
    if (staleIds.length > 0) await tx.workSchedule.deleteMany({ where: { id: { in: staleIds } } });

    for (const cell of cells) {
      const hasRichAttendance =
        Array.isArray(cell.attendances) &&
        cell.attendances.some((att) => Boolean(att.mode || att.startTime?.trim() || att.endTime?.trim()));

      const employeeIdsPayload: Prisma.InputJsonArray = hasRichAttendance
        ? cell.employeeIds.map((empId) => {
            const matched = cell.attendances?.find((a) => a.employeeId === empId);
            if (matched?.mode === 'FULL_SHIFT') {
              return {
                employeeId: empId,
                mode: 'FULL_SHIFT',
              };
            }
            return {
              employeeId: empId,
              ...(matched?.mode ? { mode: matched.mode } : {}),
              ...(matched?.startTime ? { startTime: matched.startTime } : {}),
              ...(matched?.endTime ? { endTime: matched.endTime } : {}),
            };
          })
        : (cell.employeeIds as Prisma.InputJsonArray);

      const uniqueKey = {
        weekStartDate,
        dayOfWeek: cell.dayOfWeek,
        timeSlot: cell.timeSlot,
      };
      await tx.workSchedule.upsert({
        where: { weekStartDate_dayOfWeek_timeSlot: uniqueKey },
        create: { ...uniqueKey, employeeIds: employeeIdsPayload, createdBy: userId },
        update: { employeeIds: employeeIdsPayload, updatedAt: new Date() },
      });
    }
  }

  private toScheduleEmployee(employee: {
    id: number;
    fullName: string;
    shortName: string;
    isDeleted: boolean;
    specialty?: { normalizedName: string } | null;
  }): ScheduleEmployee {
    return {
      id: employee.id,
      fullName: employee.fullName,
      shortName: employee.shortName,
      specialtyCode: employee.specialty?.normalizedName ?? null,
      isDeleted: employee.isDeleted,
    };
  }

  private missingScheduleEmployee(id: number): ScheduleEmployee {
    return { id, fullName: `Nhân viên #${id}`, shortName: `#${id}`, specialtyCode: null, isDeleted: true };
  }

  private readEmployeeIds(value: Prisma.JsonValue): number[] {
    if (!Array.isArray(value)) return [];
    const ids: number[] = [];
    for (const entry of value) {
      if (typeof entry === 'number' && Number.isSafeInteger(entry) && entry > 0) {
        ids.push(entry);
      } else if (
        typeof entry === 'object' &&
        entry !== null &&
        'employeeId' in entry &&
        typeof (entry as { employeeId: unknown }).employeeId === 'number'
      ) {
        const empId = (entry as { employeeId: number }).employeeId;
        if (Number.isSafeInteger(empId) && empId > 0) {
          ids.push(empId);
        }
      }
    }
    return [...new Set(ids)];
  }

  private readAttendances(value: Prisma.JsonValue): ScheduleAttendanceEntry[] {
    if (!Array.isArray(value)) return [];
    const result: ScheduleAttendanceEntry[] = [];
    const seen = new Set<number>();
    for (const entry of value) {
      if (typeof entry === 'number' && Number.isSafeInteger(entry) && entry > 0) {
        if (!seen.has(entry)) {
          seen.add(entry);
          result.push({ employeeId: entry });
        }
      } else if (
        typeof entry === 'object' &&
        entry !== null &&
        'employeeId' in entry &&
        typeof (entry as { employeeId: unknown }).employeeId === 'number'
      ) {
        const raw = entry as { employeeId: number; mode?: unknown; startTime?: unknown; endTime?: unknown };
        if (Number.isSafeInteger(raw.employeeId) && raw.employeeId > 0 && !seen.has(raw.employeeId)) {
          seen.add(raw.employeeId);
          const mode = raw.mode === 'FULL_SHIFT' || raw.mode === 'CUSTOM_HOURS' ? raw.mode : undefined;
          result.push({
            employeeId: raw.employeeId,
            ...(mode ? { mode } : {}),
            ...(typeof raw.startTime === 'string' && raw.startTime.trim() ? { startTime: raw.startTime.trim() } : {}),
            ...(typeof raw.endTime === 'string' && raw.endTime.trim() ? { endTime: raw.endTime.trim() } : {}),
          });
        }
      }
    }
    return result;
  }

  private invalidScheduleData(details: unknown): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Dữ liệu lịch làm việc không hợp lệ',
      details: { fieldErrors: details },
    });
  }
}
