import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BulkSaveScheduleRequestSchema,
  CopyPreviousWeekRequestSchema,
  ErrorCodes,
  ScheduleWeekQuerySchema,
  type BulkSaveScheduleRequest,
  type CopyPreviousWeekRequest,
  type ScheduleCell,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/utils/business-date.util';

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getScheduleWeek(weekStartDate: string) {
    const parsed = ScheduleWeekQuerySchema.safeParse({ weekStartDate });
    if (!parsed.success) throw this.invalidScheduleData(parsed.error.flatten().fieldErrors);
    const weekDate = dateOnly(parsed.data.weekStartDate);
    const cells = await this.prisma.workSchedule.findMany({
      where: { weekStartDate: weekDate },
      orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }],
    });
    const assignedIds = [...new Set(cells.flatMap((cell) => this.readEmployeeIds(cell.employeeIds)))];
    const assignedEmployees = assignedIds.length === 0
      ? []
      : await this.prisma.employee.findMany({
        where: { id: { in: assignedIds } },
        include: { specialty: { select: { normalizedName: true } } },
      });
    const availableEmployees = await this.prisma.employee.findMany({
      where: { isDeleted: false },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      include: { specialty: { select: { normalizedName: true } } },
    });
    const employeeById = new Map<number, ScheduleEmployee>(assignedEmployees.map((employee) => [
      employee.id,
      this.toScheduleEmployee(employee),
    ]));

    return {
      weekStartDate: parsed.data.weekStartDate,
      cells: cells.map((cell) => {
        const employeeIds = this.readEmployeeIds(cell.employeeIds);
        return {
          id: cell.id,
          dayOfWeek: cell.dayOfWeek,
          timeSlot: cell.timeSlot,
          employeeIds,
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

    await this.prisma.$transaction(async (tx) => {
      const existingCells = await tx.workSchedule.findMany({
        where: { weekStartDate },
        select: { id: true, dayOfWeek: true, timeSlot: true, employeeIds: true },
      });
      await this.validateScheduleEmployees(tx, parsed.data.cells, existingCells);
      await this.replaceScheduleCells(tx, weekStartDate, parsed.data.cells, userId, existingCells);
    });

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
      const cells: ScheduleCell[] = sourceCells.map((cell) => ({
        dayOfWeek: cell.dayOfWeek,
        timeSlot: cell.timeSlot,
        employeeIds: this.readEmployeeIds(cell.employeeIds).filter((id) => activeEmployeeIds.has(id)),
      }));
      const targetCells = await tx.workSchedule.findMany({
        where: { weekStartDate: targetWeekStartDate },
        select: { id: true, dayOfWeek: true, timeSlot: true, employeeIds: true },
      });
      await this.replaceScheduleCells(tx, targetWeekStartDate, cells, userId, targetCells);
      copiedCells = cells.length;
    });

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
      const employeeIds = cell.employeeIds as Prisma.InputJsonArray;
      const uniqueKey = {
        weekStartDate,
        dayOfWeek: cell.dayOfWeek,
        timeSlot: cell.timeSlot,
      };
      await tx.workSchedule.upsert({
        where: { weekStartDate_dayOfWeek_timeSlot: uniqueKey },
        create: { ...uniqueKey, employeeIds, createdBy: userId },
        update: { employeeIds, updatedAt: new Date() },
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
    return [...new Set(value.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))];
  }

  private invalidScheduleData(details: unknown): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Dữ liệu lịch làm việc không hợp lệ',
      details: { fieldErrors: details },
    });
  }
}
