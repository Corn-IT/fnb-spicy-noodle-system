import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes, MdmCategory } from '@fnb/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MdmService } from '../../mdm/mdm.service';
import { EmployeesService } from '../employees.service';
import { SchedulesService } from '../schedules.service';

function createHarness() {
  const tx = {
    employee: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    masterData: { findUnique: vi.fn() },
    workSchedule: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const mdm = {
    findOrCreate: vi.fn(async (category: string, name: string) => ({
      id: category === MdmCategory.POSITION ? 1 : 2,
      category,
      name,
      normalizedName: name.toLowerCase(),
    })),
  };
  return { prisma, tx, mdm };
}

const createInput = {
  fullName: 'Nguyễn Văn Anh',
  positionId: 1,
  specialtyId: 2,
  attachmentUrls: [],
};
const employeeManager = { isSuperAdmin: false };
const superAdmin = { isSuperAdmin: true };

const activeEmployee = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  fullName: 'Nguyễn Văn Anh',
  shortName: 'V.Anh',
  positionId: 1,
  specialtyId: 2,
  dob: null,
  phone: null,
  address: null,
  citizenId: null,
  citizenIdIssuedPlace: null,
  startDate: null,
  bankName: null,
  bankAccountNo: null,
  bankAccountName: null,
  avatarUrl: null,
  attachmentUrls: [],
  note: null,
  isDeleted: false,
  position: { id: 1, name: 'Phục Vụ' },
  specialty: { id: 2, name: 'Bếp Nấu', normalizedName: 'bep nau' },
  user: null,
  ...overrides,
});

describe('EmployeesService and SchedulesService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('should create an employee and optional linked account in one transaction using normalized MDM records', async () => {
    const harness = createHarness();
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockResolvedValue({ ...activeEmployee(12), shortName: 'Tạm' });
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12));
    harness.tx.user.create.mockResolvedValue({ id: 4, employeeId: 12, username: 'anh', isActive: true });
    harness.prisma.employee.findUnique.mockResolvedValue(activeEmployee(12, {
      user: { id: 4, username: 'anh', isActive: true },
    }));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.createEmployee({
      ...createInput,
      account: { username: 'anh', password: 'secret1' },
    }, superAdmin);

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.mdm.findOrCreate).toHaveBeenNthCalledWith(1, MdmCategory.POSITION, 'Phục Vụ', {}, harness.tx);
    expect(harness.mdm.findOrCreate).toHaveBeenNthCalledWith(2, MdmCategory.SPECIALTY, 'Bếp Nấu', {}, harness.tx);
    expect(harness.tx.employee.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fullName: 'Nguyễn Văn Anh' }) }));
    expect(harness.tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ employeeId: 12, username: 'anh', passwordHash: expect.any(String) }),
    }));
  });

  it('should reject a duplicate citizen id with the HR conflict code', async () => {
    const harness = createHarness();
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'unit-test', meta: { target: ['citizen_id'] },
    });
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockRejectedValue(duplicate);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee({ ...createInput, citizenId: '012345678901' }, employeeManager)).rejects.toMatchObject({
      response: { code: ErrorCodes.HR_CITIZEN_ID_DUPLICATE },
    });
  });

  it('should reject invalid employee inputs with structured validation details', async () => {
    const harness = createHarness();
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee({ fullName: ' ', positionId: 1, specialtyId: 2 } as never, employeeManager))
      .rejects.toMatchObject({ response: { code: ErrorCodes.VALIDATION_FAILED, details: { fieldErrors: expect.any(Object) } } });
    await expect(service.updateEmployee(12, {} as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.listEmployees({ page: 0, limit: 10 } as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should create a profile without an account when no login details are requested', async () => {
    const harness = createHarness();
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockResolvedValue({ id: 12 });
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12));
    harness.prisma.employee.findUnique.mockResolvedValue(activeEmployee(12));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.createEmployee(createInput, employeeManager);

    expect(harness.tx.user.create).not.toHaveBeenCalled();
    expect(harness.tx.employee.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dob: null, startDate: null, attachmentUrls: [] }),
    }));
  });

  it('should persist optional employee dates and contact fields when creating a profile', async () => {
    const harness = createHarness();
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockResolvedValue({ id: 12 });
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12));
    harness.prisma.employee.findUnique.mockResolvedValue(activeEmployee(12));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.createEmployee({
      ...createInput,
      dob: '2000-01-02',
      phone: '0900000000',
      address: 'Quận 1',
      citizenId: null,
      citizenIdIssuedPlace: null,
      startDate: '2026-01-02',
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      avatarUrl: null,
      note: 'Ghi chú',
    }, employeeManager);

    expect(harness.tx.employee.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        dob: new Date('2000-01-02T00:00:00.000Z'),
        startDate: new Date('2026-01-02T00:00:00.000Z'),
        phone: '0900000000',
        address: 'Quận 1',
        note: 'Ghi chú',
      }),
    }));
  });

  it('should forbid a non-super-admin from creating an account with an employee profile', async () => {
    const harness = createHarness();
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee({
      ...createInput,
      account: { username: 'anh', password: 'secret1' },
    }, employeeManager)).rejects.toMatchObject({
      status: 403,
      response: { code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED },
    });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject inactive or wrongly categorized MDM references', async () => {
    const harness = createHarness();
    harness.tx.masterData.findUnique.mockResolvedValue({
      id: 1,
      category: MdmCategory.SPECIALTY,
      name: 'Bếp Nấu',
      isActive: true,
    });
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee(createInput, employeeManager)).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.tx.employee.create).not.toHaveBeenCalled();
  });

  it('should update an employee short name when their full name changes', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(activeEmployee(12));
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12, { fullName: 'Trần Minh Bình', shortName: 'M.Bình' }));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.updateEmployee(12, { fullName: 'Trần Minh Bình' });

    expect(harness.tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12 },
      data: expect.objectContaining({ fullName: 'Trần Minh Bình', shortName: 'M.Bình' }),
    }));
  });

  it('should update every employee profile field and normalize changed MDM selections', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(activeEmployee(12));
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12, { fullName: 'Nguyễn Văn Bình' }));
    harness.prisma.employee.findUnique.mockResolvedValue(activeEmployee(12, { fullName: 'Nguyễn Văn Bình' }));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.updateEmployee(12, {
      fullName: 'Nguyễn Văn Bình',
      dob: '2000-01-02',
      phone: '0900000000',
      address: 'Quận 1',
      citizenId: '012345678901',
      citizenIdIssuedPlace: 'Cục CSQLHC',
      positionId: 1,
      specialtyId: 2,
      startDate: null,
      bankName: 'Vietcombank',
      bankAccountNo: '123456789',
      bankAccountName: 'NGUYEN VAN BINH',
      avatarUrl: 'https://example.com/avatar.png',
      attachmentUrls: ['https://example.com/id.png'],
      note: 'Nhân viên chính thức',
    });

    expect(harness.tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12 },
      data: expect.objectContaining({
        fullName: 'Nguyễn Văn Bình',
        shortName: 'V.Bình',
        dob: new Date('2000-01-02T00:00:00.000Z'),
        phone: '0900000000',
        address: 'Quận 1',
        citizenId: '012345678901',
        citizenIdIssuedPlace: 'Cục CSQLHC',
        positionId: 1,
        specialtyId: 2,
        startDate: null,
        bankName: 'Vietcombank',
        bankAccountNo: '123456789',
        bankAccountName: 'NGUYEN VAN BINH',
        avatarUrl: 'https://example.com/avatar.png',
        attachmentUrls: ['https://example.com/id.png'],
        note: 'Nhân viên chính thức',
      }),
    }));
    expect(harness.mdm.findOrCreate).toHaveBeenCalledTimes(2);
  });

  it('should reject updates to an employee who is already deleted', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(activeEmployee(12, { isDeleted: true }));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.updateEmployee(12, { phone: '0900000000' })).rejects.toMatchObject({
      status: 404,
      response: { code: ErrorCodes.HR_EMPLOYEE_DELETED },
    });
  });

  it('should reject an update when the employee id does not exist', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(null);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.updateEmployee(500, { phone: '0900000000' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should accept explicit null dates when clearing a profile date field', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(activeEmployee(12));
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12));
    harness.prisma.employee.findUnique.mockResolvedValue(activeEmployee(12));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.updateEmployee(12, { dob: null, startDate: '2026-01-02' });

    expect(harness.tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { dob: null, startDate: new Date('2026-01-02T00:00:00.000Z') },
    }));
  });

  it('should return the original database error for an unrelated unique constraint', async () => {
    const harness = createHarness();
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'unit-test', meta: { target: ['other_unique_key'] },
    });
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockRejectedValue(duplicate);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee(createInput, employeeManager)).rejects.toBe(duplicate);
  });

  it('should return an unknown transaction error unchanged', async () => {
    const harness = createHarness();
    const failure = new Error('database unavailable');
    harness.tx.masterData.findUnique.mockRejectedValue(failure);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee(createInput, employeeManager)).rejects.toBe(failure);
  });

  it('should map a duplicate account username to the HR username conflict code', async () => {
    const harness = createHarness();
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate username', {
      code: 'P2002', clientVersion: 'unit-test', meta: { target: ['username'] },
    });
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockResolvedValue({ id: 12 });
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.user.create.mockRejectedValue(duplicate);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee({ ...createInput, account: { username: 'anh', password: 'secret1' } }, superAdmin))
      .rejects.toMatchObject({ response: { code: ErrorCodes.HR_USERNAME_TAKEN } });
  });

  it('should map a duplicate employee account link to the one-to-one conflict code', async () => {
    const harness = createHarness();
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate employee link', {
      code: 'P2002', clientVersion: 'unit-test', meta: { target: ['employee_id'] },
    });
    harness.tx.masterData.findUnique
      .mockResolvedValueOnce({ id: 1, category: MdmCategory.POSITION, name: 'Phục Vụ', isActive: true })
      .mockResolvedValueOnce({ id: 2, category: MdmCategory.SPECIALTY, name: 'Bếp Nấu', isActive: true });
    harness.tx.employee.create.mockResolvedValue({ id: 12 });
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.user.create.mockRejectedValue(duplicate);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.createEmployee({ ...createInput, account: { username: 'anh', password: 'secret1' } }, superAdmin))
      .rejects.toMatchObject({ response: { code: ErrorCodes.HR_EMPLOYEE_ACCOUNT_EXISTS } });
  });

  it('should soft-delete the employee and disable their linked account in one transaction', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(activeEmployee(12));
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12, { isDeleted: true }));
    harness.tx.user.updateMany.mockResolvedValue({ count: 1 });
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.softDeleteEmployee(12);

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.tx.employee.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { isDeleted: true } });
    expect(harness.tx.user.updateMany).toHaveBeenCalledWith({ where: { employeeId: 12 }, data: { isActive: false } });
  });

  it('should reactivate an employee and their linked login in one transaction', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue({ id: 12, isDeleted: true });
    harness.tx.employee.update.mockResolvedValue(activeEmployee(12));
    harness.tx.user.updateMany.mockResolvedValue({ count: 1 });
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.setEmployeeActiveStatus(12, true)).resolves.toEqual({
      id: 12,
      isDeleted: false,
      isActive: true,
    });

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.tx.employee.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { isDeleted: false } });
    expect(harness.tx.user.updateMany).toHaveBeenCalledWith({ where: { employeeId: 12 }, data: { isActive: true } });
  });

  it('should paginate only active employees and include safe linked-account details', async () => {
    const harness = createHarness();
    harness.prisma.employee.findMany.mockResolvedValue([activeEmployee(12, {
      user: { id: 4, username: 'anh', isActive: true },
    })]);
    harness.prisma.employee.count.mockResolvedValue(1);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    const result = await service.listEmployees({ page: 2, limit: 10, keyword: 'anh', includeDeleted: false });

    expect(harness.prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isDeleted: false }),
      skip: 10,
      take: 10,
    }));
    expect(result).toMatchObject({ page: 2, limit: 10, total: 1, items: [{ user: { username: 'anh', isActive: true } }] });
  });

  it('should support deleted employee, position and specialty filters without a keyword', async () => {
    const harness = createHarness();
    harness.prisma.employee.findMany.mockResolvedValue([]);
    harness.prisma.employee.count.mockResolvedValue(0);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.listEmployees({ page: 1, limit: 20, includeDeleted: true, positionId: 1, specialtyId: 2 });

    expect(harness.prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { positionId: 1, specialtyId: 2 },
    }));
  });

  it('should list only inactive employees when the inactive status filter is selected', async () => {
    const harness = createHarness();
    harness.prisma.employee.findMany.mockResolvedValue([]);
    harness.prisma.employee.count.mockResolvedValue(0);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await service.listEmployees({ page: 1, limit: 20, includeDeleted: true, inactiveOnly: true });

    expect(harness.prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isDeleted: true },
    }));
  });

  it('should return deleted employees already assigned to the schedule and only active choices', async () => {
    const harness = createHarness();
    harness.prisma.workSchedule.findMany.mockResolvedValue([{
      id: 3,
      weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
      dayOfWeek: 2,
      timeSlot: 'Ca Sáng',
      employeeIds: [12],
    }]);
    harness.prisma.employee.findMany
      .mockResolvedValueOnce([activeEmployee(12, { isDeleted: true })])
      .mockResolvedValueOnce([activeEmployee(15)]);
    const service = new SchedulesService(harness.prisma as never);

    const result = await service.getScheduleWeek('2026-11-02');

    expect(result.cells[0]?.employees[0]).toMatchObject({ id: 12, fullName: 'Nguyễn Văn Anh', isDeleted: true });
    expect(result.cells[0]?.employees[0]?.specialtyCode).toBe('bep nau');
    expect(result.availableEmployees.map(({ id }) => id)).toEqual([15]);
  });

  it('should replace a seven-day matrix with transactional idempotent upserts', async () => {
    const harness = createHarness();
    harness.tx.workSchedule.findMany.mockResolvedValue([]);
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.workSchedule.deleteMany.mockResolvedValue({ count: 0 });
    harness.tx.workSchedule.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
    const service = new SchedulesService(harness.prisma as never);
    const request = {
      weekStartDate: '2026-11-02',
      cells: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, timeSlot: 'Ca Sáng', employeeIds: [] })),
    };

    await service.bulkSaveSchedule(request, 9);
    await service.bulkSaveSchedule(request, 9);

    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(harness.tx.workSchedule.upsert).toHaveBeenCalledTimes(14);
    expect(harness.tx.workSchedule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { weekStartDate_dayOfWeek_timeSlot: { weekStartDate: new Date('2026-11-02T00:00:00.000Z'), dayOfWeek: 0, timeSlot: 'Ca Sáng' } },
    }));
  });

  it('should reject assignments to employees who are deleted and not already scheduled that week', async () => {
    const harness = createHarness();
    harness.tx.workSchedule.findMany.mockResolvedValue([]);
    harness.tx.employee.findMany.mockResolvedValue([]);
    const service = new SchedulesService(harness.prisma as never);
    const request = {
      weekStartDate: '2026-11-02',
      cells: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, timeSlot: 'Ca Sáng', employeeIds: dayOfWeek === 0 ? [12] : [] })),
    };

    await expect(service.bulkSaveSchedule(request, 9)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should retain a deleted employee already assigned in the current week during bulk save', async () => {
    const harness = createHarness();
    harness.tx.workSchedule.findMany.mockResolvedValue([{
      id: 7,
      dayOfWeek: 2,
      timeSlot: 'Ca Sáng',
      employeeIds: [12],
    }]);
    harness.tx.employee.findMany.mockResolvedValue([{ id: 12, isDeleted: true }]);
    harness.tx.workSchedule.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
    const service = new SchedulesService(harness.prisma as never);
    const request = {
      weekStartDate: '2026-11-02',
      cells: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        timeSlot: 'Ca Sáng',
        employeeIds: dayOfWeek === 2 ? [12] : [],
      })),
    };

    await expect(service.bulkSaveSchedule(request, 9)).resolves.toMatchObject({ savedCells: 7 });
    expect(harness.tx.workSchedule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ weekStartDate_dayOfWeek_timeSlot: expect.objectContaining({ dayOfWeek: 2 }) }),
      create: expect.objectContaining({ employeeIds: [12] }),
    }));
  });

  it('should copy only active employees from the previous week and replace target cells', async () => {
    const harness = createHarness();
    harness.tx.workSchedule.findMany.mockResolvedValueOnce([
      { id: 1, dayOfWeek: 0, timeSlot: 'Ca Sáng', employeeIds: [12, 15] },
    ]).mockResolvedValueOnce([]);
    harness.tx.employee.findMany.mockResolvedValue([activeEmployee(15)]);
    harness.tx.workSchedule.deleteMany.mockResolvedValue({ count: 0 });
    harness.tx.workSchedule.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
    const service = new SchedulesService(harness.prisma as never);

    const result = await service.copyPreviousWeek({ sourceWeekStartDate: '2026-10-26', targetWeekStartDate: '2026-11-02' }, 9);

    expect(result).toMatchObject({ sourceWeekStartDate: '2026-10-26', targetWeekStartDate: '2026-11-02', copiedCells: 1 });
    expect(harness.tx.workSchedule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ employeeIds: [15], createdBy: 9 }),
    }));
    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('should return not found when an employee record does not exist', async () => {
    const harness = createHarness();
    harness.prisma.employee.findUnique.mockResolvedValue(null);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.getEmployee(500)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject a schedule query that does not start on Monday', async () => {
    const harness = createHarness();
    const service = new SchedulesService(harness.prisma as never);

    await expect(service.getScheduleWeek('2026-11-03')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(harness.prisma.workSchedule.findMany).not.toHaveBeenCalled();
  });

  it('should return an empty schedule without querying assigned employees when stored ids are invalid JSON', async () => {
    const harness = createHarness();
    harness.prisma.workSchedule.findMany.mockResolvedValue([{
      id: 5,
      weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
      dayOfWeek: 0,
      timeSlot: 'Ca Trống',
      employeeIds: 'invalid',
    }]);
    harness.prisma.employee.findMany.mockResolvedValue([]);
    const service = new SchedulesService(harness.prisma as never);

    const result = await service.getScheduleWeek('2026-11-02');

    expect(result.cells[0]).toMatchObject({ employeeIds: [], employees: [] });
    expect(harness.prisma.employee.findMany).toHaveBeenCalledOnce();
  });

  it('should retain a missing employee reference as a safe placeholder in schedule history', async () => {
    const harness = createHarness();
    harness.prisma.workSchedule.findMany.mockResolvedValue([{
      id: 4,
      weekStartDate: new Date('2026-11-02T00:00:00.000Z'),
      dayOfWeek: 1,
      timeSlot: 'Ca Tối',
      employeeIds: [12, 12, -1, 'bad'],
    }]);
    harness.prisma.employee.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeEmployee(15, { specialty: null })]);
    const service = new SchedulesService(harness.prisma as never);

    const result = await service.getScheduleWeek('2026-11-02');

    expect(result.cells[0]?.employees).toEqual([{
      id: 12,
      fullName: 'Nhân viên #12',
      shortName: '#12',
      specialtyCode: null,
      isDeleted: true,
    }]);
    expect(result.availableEmployees[0]?.specialtyCode).toBeNull();
  });

  it('should replace target cells and remove schedule cells omitted from a bulk save', async () => {
    const harness = createHarness();
    harness.tx.workSchedule.findMany.mockResolvedValue([{
      id: 8,
      dayOfWeek: 6,
      timeSlot: 'Ca Cũ',
      employeeIds: [],
    }]);
    harness.tx.employee.findMany.mockResolvedValue([]);
    harness.tx.workSchedule.deleteMany.mockResolvedValue({ count: 1 });
    harness.tx.workSchedule.upsert.mockResolvedValue({});
    const service = new SchedulesService(harness.prisma as never);
    const request = {
      weekStartDate: '2026-11-02',
      cells: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, timeSlot: 'Ca Mới', employeeIds: [] })),
    };

    await service.bulkSaveSchedule(request, 9);

    expect(harness.tx.workSchedule.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [8] } } });
  });

  it('should reject malformed bulk save and copy requests before starting transactions', async () => {
    const harness = createHarness();
    const service = new SchedulesService(harness.prisma as never);

    await expect(service.bulkSaveSchedule({ weekStartDate: '2026-11-03', cells: [] } as never, 9))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.copyPreviousWeek({
      sourceWeekStartDate: '2026-10-26',
      targetWeekStartDate: '2026-11-03',
    } as never, 9)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should copy empty schedule cells and clear stale target cells transactionally', async () => {
    const harness = createHarness();
    harness.tx.workSchedule.findMany.mockResolvedValueOnce([
      { id: 1, dayOfWeek: 0, timeSlot: 'Ca Trống', employeeIds: [] },
    ]).mockResolvedValueOnce([
      { id: 2, dayOfWeek: 0, timeSlot: 'Ca Cũ', employeeIds: [] },
    ]);
    harness.tx.workSchedule.deleteMany.mockResolvedValue({ count: 1 });
    harness.tx.workSchedule.upsert.mockResolvedValue({});
    const service = new SchedulesService(harness.prisma as never);

    const result = await service.copyPreviousWeek({
      sourceWeekStartDate: '2026-10-26',
      targetWeekStartDate: '2026-11-02',
    }, 9);

    expect(result.copiedCells).toBe(1);
    expect(harness.tx.employee.findMany).not.toHaveBeenCalled();
    expect(harness.tx.workSchedule.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] } } });
  });

  it('should report not found when trying to delete an employee who is already deleted', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(activeEmployee(12, { isDeleted: true }));
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.softDeleteEmployee(12)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should report not found when trying to delete an employee id that does not exist', async () => {
    const harness = createHarness();
    harness.tx.employee.findUnique.mockResolvedValue(null);
    const service = new EmployeesService(harness.prisma as never, harness.mdm as unknown as MdmService);

    await expect(service.softDeleteEmployee(500)).rejects.toBeInstanceOf(NotFoundException);
  });
});

