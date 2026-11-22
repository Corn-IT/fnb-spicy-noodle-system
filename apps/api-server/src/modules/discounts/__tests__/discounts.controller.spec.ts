import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DiscountsController } from '../discounts.controller';
import { DiscountsService } from '../discounts.service';

describe('DiscountsController HTTP routes & RBAC (Invariant 8)', () => {
  const discountsService = {
    list: vi.fn(async () => ({ page: 1, limit: 20, total: 0, items: [] })),
    create: vi.fn(async () => ({ id: 1, code: 'GIAM10' })),
    update: vi.fn(async () => ({ id: 1, code: 'GIAM10' })),
    toggleStatus: vi.fn(async () => ({ id: 1, isActive: false })),
    remove: vi.fn(async () => ({ deleted: true, archived: false })),
  };

  const adminRecord = {
    id: 1,
    employeeId: 1,
    username: 'superadmin',
    isSuperAdmin: true,
    isActive: true,
    permissions: UserPermissionsSchema.parse({}),
  };

  const cashierNoDiscountPerms = {
    id: 2,
    employeeId: 2,
    username: 'cashier01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({ pos: { view: true, checkout: true } }),
  };

  const managerWithViewAndCreate = {
    id: 3,
    employeeId: 3,
    username: 'manager01',
    isSuperAdmin: false,
    isActive: true,
    permissions: UserPermissionsSchema.parse({
      discounts: { view: true, create: true, update: true, delete: false },
    }),
  };

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class DiscountsHttpTestModule {}
    Module({
      controllers: [DiscountsController],
      providers: [
        { provide: DiscountsService, useValue: discountsService },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async (token: string) => ({
              sub: token === 'cashier' ? 2 : token === 'manager' ? 3 : 1,
              tokenType: 'access',
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async (args: { where: { id: number } }) => {
                if (args.where.id === 2) return cashierNoDiscountPerms;
                if (args.where.id === 3) return managerWithViewAndCreate;
                return adminRecord;
              },
            },
          },
        },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(DiscountsHttpTestModule);

    app = await NestFactory.create(DiscountsHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => app?.close());

  it('returns 401 when unauthenticated and 403 when missing discounts permission', async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/discounts`);
    expect(unauth.status).toBe(401);

    const cashierGet = await fetch(`${baseUrl}/api/v1/discounts`, {
      headers: { authorization: 'Bearer cashier' },
    });
    expect(cashierGet.status).toBe(403);

    const managerDelete = await fetch(`${baseUrl}/api/v1/discounts/1`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer manager' },
    });
    expect(managerDelete.status).toBe(403);
  });

  it('allows authorized users to list, create, update, toggle status, and delete discounts', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/discounts?page=1&limit=20`, {
      headers: { authorization: 'Bearer manager' },
    });
    expect(listRes.status).toBe(200);
    expect(discountsService.list).toHaveBeenCalled();

    const createRes = await fetch(`${baseUrl}/api/v1/discounts`, {
      method: 'POST',
      headers: { authorization: 'Bearer manager', 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'GIAM10',
        name: 'Giảm 10%',
        valueType: 'PERCENT',
        value: 10,
        scope: 'ORDER',
      }),
    });
    expect(createRes.status).toBe(201);
    expect(discountsService.create).toHaveBeenCalled();

    const statusRes = await fetch(`${baseUrl}/api/v1/discounts/1/status`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer manager', 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(statusRes.status).toBe(200);

    const deleteRes = await fetch(`${baseUrl}/api/v1/discounts/1`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer admin' },
    });
    expect(deleteRes.status).toBe(200);
  });
});
