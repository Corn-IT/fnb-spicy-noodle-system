import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema } from '@fnb/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MenuController } from '../menu.controller';
import { MenuService } from '../menu.service';

describe('MenuController HTTP routes', () => {
  const menu = {
    table: { tableId: 7, tableName: 'Bàn 07', status: 'AVAILABLE', activeOrderId: null },
    products: [],
  };
  const menuService = {
    getPublicMenu: vi.fn(async () => menu),
    listProducts: vi.fn(async () => []),
    createProduct: vi.fn(async () => ({ id: 1 })),
    updateProduct: vi.fn(async () => ({ id: 1 })),
  };
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    class MenuHttpTestModule {}
    Module({
      controllers: [MenuController],
      providers: [
        { provide: MenuService, useValue: menuService },
        { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 1, tokenType: 'access' }) } },
        { provide: PrismaService, useValue: { user: { findUnique: async () => ({
          id: 1, employeeId: 1, username: 'admin', isSuperAdmin: true, isActive: true,
          permissions: UserPermissionsSchema.parse({}),
        }) } } },
        {
          provide: JwtAuthGuard,
          useFactory: (jwt: JwtService, prisma: PrismaService) => new JwtAuthGuard(jwt, prisma),
          inject: [JwtService, PrismaService],
        },
        { provide: RbacGuard, useFactory: () => new RbacGuard(new Reflector()) },
      ],
    })(MenuHttpTestModule);
    app = await NestFactory.create(MenuHttpTestModule, { logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => app?.close());

  it('should serve the public QR menu without requiring staff authentication', async () => {
    const response = await fetch(`${baseUrl}/api/v1/public/menu?token=${'a'.repeat(64)}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(menu);
    expect(menuService.getPublicMenu).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('should expose POS product configuration at the versioned menu route', async () => {
    const response = await fetch(`${baseUrl}/api/v1/menu/products`, {
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(menuService.listProducts).toHaveBeenCalledOnce();
  });
});
