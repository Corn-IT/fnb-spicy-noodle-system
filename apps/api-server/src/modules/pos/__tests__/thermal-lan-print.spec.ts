import * as net from 'node:net';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  UserPermissionsSchema,
  type AuthPrincipal,
} from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { PosController } from '../pos.controller';
import type { PosService } from '../pos.service';
import { ThermalLanPrintService } from '../thermal-lan-print.service';

describe('ThermalLanPrintService & PosController LAN ESC/POS (:9100) printing', () => {
  const service = new ThermalLanPrintService();

  it('connects to a TCP ESC/POS printer socket, delivers exact bytes (including cash drawer kick ESC p & auto-cut GS V), and closes cleanly', async () => {
    const receivedChunks: Buffer[] = [];

    const tcpServer = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        receivedChunks.push(Buffer.from(chunk));
      });
    });

    await new Promise<void>((resolve) => {
      tcpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = tcpServer.address() as net.AddressInfo;

    try {
      // Sample ESC/POS payload: ESC @ (init) + ESC p 0 50 250 (Cash Drawer RJ11 kick) + text + GS V 66 0 (Auto-cutter)
      const escPosBytes = Buffer.from([
        0x1b, 0x40,
        0x1b, 0x70, 0x00, 0x32, 0xfa,
        0x49, 0x50, 0x4f, 0x53, 0x20, 0x69, 0x54, 0x50, 0x36, 0x0a,
        0x1d, 0x56, 0x42, 0x00,
      ]);

      const response = await service.sendEscPosPayload({
        host: '127.0.0.1',
        port: address.port,
        payloadBase64: escPosBytes.toString('base64'),
        timeoutMs: 3000,
      });

      expect(response.success).toBe(true);
      expect(response.host).toBe('127.0.0.1');
      expect(response.port).toBe(address.port);
      expect(response.bytesSent).toBe(escPosBytes.byteLength);

      const merged = Buffer.concat(receivedChunks);
      expect(merged.equals(escPosBytes)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
    }
  });

  it('rejects non-LAN public or cloud metadata IP addresses (SSRF protection)', async () => {
    await expect(
      service.sendEscPosPayload({
        host: '169.254.169.254',
        port: 9100,
        payloadBase64: Buffer.from([0x1b, 0x40]).toString('base64'),
        timeoutMs: 2000,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendEscPosPayload({
        host: '8.8.8.8',
        port: 9100,
        payloadBase64: Buffer.from([0x1b, 0x40]).toString('base64'),
        timeoutMs: 2000,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed or empty base64 payloads with BadRequestException', async () => {
    await expect(
      service.sendEscPosPayload({
        host: '192.168.1.200',
        port: 9100,
        payloadBase64: '!!!not-base64!!!',
        timeoutMs: 2000,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ServiceUnavailableException (503) when the LAN printer TCP port is unreachable or times out', async () => {
    // Get an unused ephemeral local port by opening and immediately closing a server
    const tempServer = net.createServer();
    await new Promise<void>((resolve) => tempServer.listen(0, '127.0.0.1', () => resolve()));
    const closedPort = (tempServer.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    await expect(
      service.sendEscPosPayload({
        host: '127.0.0.1',
        port: closedPort,
        payloadBase64: Buffer.from([0x1b, 0x40]).toString('base64'),
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('enforces RBAC on PosController.printLanEscPos (allows pos/invoices/settings staff, rejects unauthorized roles with 403)', async () => {
    const mockPrintService = {
      sendEscPosPayload: vi.fn(async () => ({
        success: true,
        host: '192.168.1.200',
        port: 9100,
        bytesSent: 16,
        durationMs: 5,
      })),
    } as unknown as ThermalLanPrintService;

    const controller = new PosController(
      {} as PosService,
      undefined,
      undefined,
      mockPrintService,
    );

    const noPrintUser: AuthPrincipal = {
      id: 9,
      employeeId: 9,
      username: 'hr_only',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        employees: { view: true },
      }),
    };

    await expect(
      controller.printLanEscPos(
        {
          host: '192.168.1.200',
          port: 9100,
          payloadBase64: 'G0A=',
          timeoutMs: 2000,
        },
        noPrintUser,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrintService.sendEscPosPayload).not.toHaveBeenCalled();

    const cashierUser: AuthPrincipal = {
      id: 2,
      employeeId: 2,
      username: 'cashier01',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        pos: { view: true },
      }),
    };

    const res = await controller.printLanEscPos(
      {
        host: '192.168.1.200',
        port: 9100,
        payloadBase64: 'G0A=',
        timeoutMs: 2000,
      },
      cashierUser,
    );
    expect(res.success).toBe(true);
    expect(mockPrintService.sendEscPosPayload).toHaveBeenCalledTimes(1);
  });

  it('blocks ESC p cash drawer kick bytes for settings.view / invoices.reprint users without openCashDrawer/checkout/settings.update', async () => {
    const mockPrintService = {
      sendEscPosPayload: vi.fn(async () => ({
        success: true,
        host: '192.168.1.200',
        port: 9100,
        bytesSent: 7,
        durationMs: 3,
      })),
    } as unknown as ThermalLanPrintService;

    const controller = new PosController(
      {} as PosService,
      undefined,
      undefined,
      mockPrintService,
    );

    const escInitOnly = Buffer.from([0x1b, 0x40]).toString('base64');
    const escCashDrawerKick = Buffer.from([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x32, 0xfa]).toString('base64');

    const settingsViewOnlyUser: AuthPrincipal = {
      id: 14,
      employeeId: 14,
      username: 'settings_viewer',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        settings: { view: true, update: false },
      }),
    };

    // Regular ESC/POS receipt print (without ESC p) still works for settings viewer preview
    await expect(
      controller.printLanEscPos(
        { host: '192.168.1.200', port: 9100, payloadBase64: escInitOnly, timeoutMs: 2000 },
        settingsViewOnlyUser,
      ),
    ).resolves.toMatchObject({ success: true });

    // Any payload carrying ESC p (0x1b 0x70) must be blocked with 403
    await expect(
      controller.printLanEscPos(
        { host: '192.168.1.200', port: 9100, payloadBase64: escCashDrawerKick, timeoutMs: 2000 },
        settingsViewOnlyUser,
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED' }),
    });

    const invoicesReprintOnlyUser: AuthPrincipal = {
      id: 15,
      employeeId: 15,
      username: 'invoice_clerk',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        invoices: { view: true, reprint: true },
      }),
    };

    await expect(
      controller.printLanEscPos(
        { host: '192.168.1.200', port: 9100, payloadBase64: escCashDrawerKick, timeoutMs: 2000 },
        invoicesReprintOnlyUser,
      ),
    ).rejects.toThrow(ForbiddenException);

    // Explicitly granting pos.openCashDrawer allows the drawer kick command
    const drawerAllowedUser: AuthPrincipal = {
      id: 16,
      employeeId: 16,
      username: 'drawer_staff',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({
        pos: { view: true, openCashDrawer: true },
      }),
    };

    await expect(
      controller.printLanEscPos(
        { host: '192.168.1.200', port: 9100, payloadBase64: escCashDrawerKick, timeoutMs: 2000 },
        drawerAllowedUser,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(mockPrintService.sendEscPosPayload).toHaveBeenCalledTimes(2);
  });
});
