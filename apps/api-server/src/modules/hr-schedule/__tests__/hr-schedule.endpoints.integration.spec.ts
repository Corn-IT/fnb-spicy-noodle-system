import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmployeesController } from '../employees.controller';
import { EmployeesService } from '../employees.service';
import { SchedulesController } from '../schedules.controller';
import { SchedulesService } from '../schedules.service';

describe('HR and schedule HTTP endpoints', () => {
  const permissions = UserPermissionsSchema.parse({
    employees: { view: true, create: true, update: true, delete: true },
    schedules: { view: true, update: true },
  });
  const limitedPermissions = UserPermissionsSchema.parse({});
  const verifyAsync = vi.fn(async (token: string) => {
    if (token === 'invalid') throw new Error('invalid signature');
    return { sub: token === 'superadmin' ? 1 : token === 'limited' ? 5 : 4, tokenType: 'access' };
  });
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        employeeId: where.id + 10,
        username: where.id === 1 ? 'superadmin' : where.id === 5 ? 'limited' : 'manager',
        isSuperAdmin: where.id === 1,
        permissions: where.id === 5 ? limitedPermissions : permissions,
        isActive: true,
      })),
    },
  };
  const hrScheduleService = {
    listEmployees: vi.fn(async (query: unknown) => ({ page: 1, limit: 20, total: 0, items: [], query })),
    getEmployee: vi.fn(async (id: number) => ({ id, fullName: 'Nguyễn Văn Anh' })),
    createEmployee: vi.fn(async (body: unknown, actor: unknown) => ({ body, actor })),
    updateEmployee: vi.fn(async (id: number, body: unknown) => ({ id, body })),
    softDeleteEmployee: vi.fn(async (id: number) => ({ id, isDeleted: true })),
    setEmployeeActiveStatus: vi.fn(async (id: number, isActive: boolean) => ({ id, isDeleted: !isActive, isActive })),
    getScheduleWeek: vi.fn(async (weekStartDate: string) => ({ weekStartDate, cells: [], availableEmployees: [] })),
    bulkSaveSchedule: vi.fn(async (body: unknown, userId: number) => ({ body, userId })),
    copyPreviousWeek: vi.fn(async (body: unknown, userId: number) => ({ body, userId })),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class HrScheduleIntegrationModule {}
    Module({
      controllers: [EmployeesController, SchedulesController],
      providers: [
        { provide: JwtService, useValue: { verifyAsync } },
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeesService, useValue: hrScheduleService },
        { provide: SchedulesService, useValue: hrScheduleService },
        { provide: JwtAuthGuard, useFactory: (jwt: JwtService, db: PrismaService) => new JwtAuthGuard(jwt, db), inject: [JwtService, PrismaService] },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(HrScheduleIntegrationModule);

    app = await NestFactory.create(HrScheduleIntegrationModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 401 without authentication and 403 when an authenticated user lacks employee permission', async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/employees`);
    const forbidden = await fetch(`${baseUrl}/api/v1/employees`, { headers: { authorization: 'Bearer limited' } });

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('serves employee reads and forwards validated filters', async () => {
    const headers = { authorization: 'Bearer manager' };
    const list = await fetch(`${baseUrl}/api/v1/employees?page=2&limit=10&keyword=Anh&positionId=1`, { headers });
    const detail = await fetch(`${baseUrl}/api/v1/employees/12`, { headers });

    expect(list.status).toBe(200);
    expect(hrScheduleService.listEmployees).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      limit: 10,
      keyword: 'Anh',
      positionId: 1,
    }));
    expect(detail.status).toBe(200);
    expect(hrScheduleService.getEmployee).toHaveBeenCalledWith(12);
  });

  it('serves employee create, update and soft-delete routes to permitted managers', async () => {
    const headers = { authorization: 'Bearer manager', 'content-type': 'application/json' };
    const create = await fetch(`${baseUrl}/api/v1/employees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fullName: 'Nguyễn Văn Anh', positionId: 1, specialtyId: 2 }),
    });
    const update = await fetch(`${baseUrl}/api/v1/employees/12`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ phone: '0900000000' }),
    });
    const remove = await fetch(`${baseUrl}/api/v1/employees/12`, { method: 'DELETE', headers });

    expect(create.status).toBe(201);
    expect(hrScheduleService.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Nguyễn Văn Anh' }),
      expect.objectContaining({ id: 4 }),
    );
    expect(update.status).toBe(200);
    expect(hrScheduleService.updateEmployee).toHaveBeenCalledWith(12, { phone: '0900000000' });
    expect(remove.status).toBe(200);
    expect(hrScheduleService.softDeleteEmployee).toHaveBeenCalledWith(12);
  });

  it('serves employee activation status updates to permitted managers', async () => {
    const response = await fetch(`${baseUrl}/api/v1/employees/12/status`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer manager', 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });
    const responseBody = await response.text();

    expect(response.status, responseBody).toBe(200);
    expect(hrScheduleService.setEmployeeActiveStatus).toHaveBeenCalledWith(12, true);

    const forbidden = await fetch(`${baseUrl}/api/v1/employees/12/status`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer limited', 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });
    expect(forbidden.status).toBe(403);
  });

  it('serves schedule reads, weekly bulk-save and copy-previous-week routes', async () => {
    const headers = { authorization: 'Bearer manager', 'content-type': 'application/json' };
    const cells = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, timeSlot: 'Ca Sáng', employeeIds: [] }));
    const read = await fetch(`${baseUrl}/api/v1/schedules?weekStartDate=2026-11-02`, { headers });
    const save = await fetch(`${baseUrl}/api/v1/schedules/bulk-save`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ weekStartDate: '2026-11-02', cells }),
    });
    const copy = await fetch(`${baseUrl}/api/v1/schedules/copy-previous-week`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceWeekStartDate: '2026-10-26', targetWeekStartDate: '2026-11-02' }),
    });

    expect(read.status).toBe(200);
    expect(hrScheduleService.getScheduleWeek).toHaveBeenCalledWith('2026-11-02');
    expect(save.status).toBe(200);
    expect(hrScheduleService.bulkSaveSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ weekStartDate: '2026-11-02', cells }),
      4,
    );
    expect(copy.status).toBe(201);
    expect(hrScheduleService.copyPreviousWeek).toHaveBeenCalledWith(
      { sourceWeekStartDate: '2026-10-26', targetWeekStartDate: '2026-11-02' },
      4,
    );
  });
});
