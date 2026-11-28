import { JwtService } from '@nestjs/jwt';
import { UiPreferencesSchema, UserPermissionsSchema, SocketEvents, SocketRooms } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PosSocketGateway } from '../pos-socket.gateway';

const staff = {
  id: 3,
  employeeId: 9,
  username: 'cashier01',
  isSuperAdmin: false,
  isActive: true,
  permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
};

function createClient(auth: Record<string, unknown>) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
    join: vi.fn(async () => undefined),
    disconnect: vi.fn(),
  };
}

describe('PosSocketGateway', () => {
  it('should allow a valid staff access token into the cashier room', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 3, tokenType: 'access' }) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(staff) }, diningTable: { findUnique: vi.fn() } };
    const client = createClient({ token: 'valid-jwt' });
    const gateway = new PosSocketGateway(jwt as unknown as JwtService, prisma as never);

    await gateway.handleConnection(client as never);

    expect(jwt.verifyAsync).toHaveBeenCalledWith('valid-jwt');
    expect(client.data.user).toMatchObject({ id: 3, username: 'cashier01' });
    expect(client.join).toHaveBeenCalledWith(SocketRooms.POS_CASHIER);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('should let a QR guest join only its table room and order session room', async () => {
    const jwt = { verifyAsync: vi.fn() };
    const prisma = { user: { findUnique: vi.fn() }, diningTable: { findUnique: vi.fn().mockResolvedValue({ id: 7, name: 'Bàn 07' }) } };
    const clientWithOrder = createClient({ qrToken: 'a'.repeat(64), orderId: '42' });
    const clientIdle = createClient({ qrToken: 'a'.repeat(64) });
    const gateway = new PosSocketGateway(jwt as unknown as JwtService, prisma as never);

    await gateway.handleConnection(clientWithOrder as never);
    await gateway.handleConnection(clientIdle as never);

    expect(clientWithOrder.join).toHaveBeenCalledWith(SocketRooms.tableSession(7));
    expect(clientWithOrder.join).toHaveBeenCalledWith(SocketRooms.orderSession(42));
    expect(clientWithOrder.join).toHaveBeenCalledTimes(2);
    expect(clientWithOrder.join).not.toHaveBeenCalledWith(SocketRooms.POS_CASHIER);
    expect(clientIdle.join).toHaveBeenCalledExactlyOnceWith(SocketRooms.tableSession(7));
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('should reject a DINE_IN QR guest joining another table active order (anti-IDOR)', async () => {
    const prisma = {
      diningTable: { findUnique: vi.fn().mockResolvedValue({ id: 2, name: 'Bàn 02' }) },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 42,
          orderCode: 'HD-42',
          tableId: 1,
          orderType: 'DINE_IN',
          orderSource: 'QR_CODE',
          status: 'SERVING',
          tableTransferLogs: [],
        }),
      },
    } as unknown as PrismaService;
    const gateway = new PosSocketGateway({} as JwtService, prisma);
    const client = {
      handshake: { auth: { qrToken: 'b'.repeat(64), orderId: 42 } },
      data: {},
      join: vi.fn(),
    };

    await expect(
      (gateway as unknown as { authenticate: (s: unknown) => Promise<void> }).authenticate(client),
    ).rejects.toThrow(/Order does not belong/);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('should disconnect clients with missing or invalid staff authentication', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('invalid signature')) };
    const prisma = { user: { findUnique: vi.fn() }, diningTable: { findUnique: vi.fn() } };
    const gateway = new PosSocketGateway(jwt as unknown as JwtService, prisma as never);
    const missing = createClient({});
    const invalid = createClient({ token: 'expired-or-invalid' });

    await gateway.handleConnection(missing as never);
    await gateway.handleConnection(invalid as never);

    expect(missing.disconnect).toHaveBeenCalledWith(true);
    expect(invalid.disconnect).toHaveBeenCalledWith(true);
    expect(missing.join).not.toHaveBeenCalled();
    expect(invalid.join).not.toHaveBeenCalled();
  });

  it('should validate the handshake in connection middleware before the socket joins its namespace', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('expired')) };
    const prisma = { user: { findUnique: vi.fn() }, diningTable: { findUnique: vi.fn() } };
    const gateway = new PosSocketGateway(jwt as unknown as JwtService, prisma as never);
    let middleware: ((client: never, next: (error?: Error) => void) => void) | undefined;
    gateway.afterInit({ use: (handler: typeof middleware) => { middleware = handler; } } as never);
    const client = createClient({ token: 'invalid' });
    const next = vi.fn();

    await new Promise<void>((resolve) => middleware?.(client as never, (error) => { next(error); resolve(); }));

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(client.join).not.toHaveBeenCalled();
  });

  it('should reject WebSocket handshakes from untrusted cross-origin domains', async () => {
    const gateway = new PosSocketGateway(
      { verifyAsync: vi.fn() } as unknown as JwtService,
      { diningTable: { findUnique: vi.fn() } } as unknown as PrismaService,
    );
    let middleware: ((client: unknown, next: (err?: Error) => void) => Promise<void>) | undefined;
    gateway.afterInit({
      use: (fn: (client: unknown, next: (err?: Error) => void) => Promise<void>) => {
        middleware = fn;
      },
    } as never);

    const client = {
      handshake: {
        headers: { origin: 'https://evil-attacker.com' },
        auth: { token: 'valid.jwt.token' },
      },
      data: {},
      join: vi.fn(),
    };
    const next = vi.fn();

    await middleware?.(client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(client.join).not.toHaveBeenCalled();
  });

  it('should reject guest QR socket from joining an order room that is VOIDED or TAKEAWAY (anti-IDOR)', async () => {
    const prisma = {
      diningTable: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, tableNumber: 5, isActive: true }),
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 999,
          tableId: null,
          orderType: 'TAKEAWAY',
          orderSource: 'POS_CASHIER',
          status: 'SERVING',
        }),
      },
    } as unknown as PrismaService;
    const gateway = new PosSocketGateway({} as JwtService, prisma);
    let middleware: ((client: unknown, next: (err?: Error) => void) => Promise<void>) | undefined;
    gateway.afterInit({
      use: (fn: (client: unknown, next: (err?: Error) => void) => Promise<void>) => {
        middleware = fn;
      },
    } as never);

    const client = {
      handshake: { auth: { qrToken: 'table-5-qr-token', orderId: 999 } },
      data: {},
      join: vi.fn(),
    };
    const next = vi.fn();

    await middleware?.(client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(client.join).not.toHaveBeenCalled();
  });

  it('should publish POS and QR events to their contracted rooms and global broadcasts', () => {
    const emissions: Array<{ room: string | null; event: string; payload: unknown }> = [];
    const gateway = new PosSocketGateway({} as JwtService, {} as PrismaService);
    (
      gateway as unknown as {
        server: {
          emit: (event: string, payload: unknown) => void;
          to: (room: string) => { emit: (event: string, payload: unknown) => void };
        };
      }
    ).server = {
      emit: (event, payload) => emissions.push({ room: null, event, payload }),
      to: (room) => ({ emit: (event, payload) => emissions.push({ room, event, payload }) }),
    };
    const payload = { orderId: 42 };

    gateway.emitQrNewOrder(payload);
    gateway.emitQrAddonOrder(payload);
    gateway.emitOrderStatusUpdated(42, payload);
    gateway.emitOrderSessionRedirected(42, payload);
    gateway.emitTableGridSync(payload);
    gateway.emitMenuUpdated({ updatedAt: 't1' });
    gateway.emitScheduleUpdated(payload);
    gateway.emitPayrollUpdated(payload);
    gateway.emitStoreSettingsUpdated({ version: 'v1' });
    const perms = UserPermissionsSchema.parse({ pos: { view: true } });
    gateway.emitPermissionsUpdated(7, perms);
    const prefs = UiPreferencesSchema.parse({ sidebarCollapsed: true });
    gateway.emitAccountPreferencesUpdated(7, prefs);
    const qrNotice = {
      orderId: 42,
      tableId: 7,
      kind: 'PROVISIONAL_BILL_PRINTED' as const,
      totalAmount: 150000,
      timestamp: '2026-11-22T12:00:00.000Z',
    };
    gateway.emitQrOrderNotice(42, qrNotice);
    gateway.emitTableOrderNotice(7, {
      orderId: 42,
      tableId: 7,
      kind: 'GUEST_ORDER_CREATED',
      batchNo: 1,
      totalAmount: 50000,
      timestamp: '2026-11-22T12:00:00.000Z',
    });
    gateway.emitTableQrRotated(7, 42);

    expect(emissions).toEqual([
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.ORDER_QR_NEW, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.TABLE_GRID_SYNC, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.ORDER_QR_ADDON, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.TABLE_GRID_SYNC, payload },
      { room: SocketRooms.orderSession(42), event: SocketEvents.ORDER_STATUS_UPDATED, payload },
      { room: SocketRooms.orderSession(42), event: SocketEvents.ORDER_SESSION_REDIRECTED, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.TABLE_GRID_SYNC, payload },
      { room: null, event: SocketEvents.MENU_UPDATED, payload: { updatedAt: 't1' } },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.SCHEDULE_UPDATED, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.PAYROLL_UPDATED, payload },
      { room: null, event: SocketEvents.STORE_SETTINGS_UPDATED, payload: { version: 'v1' } },
      {
        room: SocketRooms.userAccount(7),
        event: SocketEvents.PERMISSIONS_UPDATED,
        payload: { userId: 7, permissions: perms, updatedAt: expect.any(String) },
      },
      {
        room: SocketRooms.userAccount(7),
        event: SocketEvents.ACCOUNT_PREFERENCES_UPDATED,
        payload: { userId: 7, uiPreferences: prefs, updatedAt: expect.any(String) },
      },
      { room: SocketRooms.orderSession(42), event: SocketEvents.QR_ORDER_NOTICE, payload: qrNotice },
      {
        room: SocketRooms.tableSession(7),
        event: SocketEvents.QR_ORDER_NOTICE,
        payload: {
          orderId: 42,
          tableId: 7,
          kind: 'GUEST_ORDER_CREATED',
          batchNo: 1,
          totalAmount: 50000,
          timestamp: '2026-11-22T12:00:00.000Z',
        },
      },
      {
        room: [SocketRooms.tableSession(7), SocketRooms.orderSession(42)],
        event: SocketEvents.TABLE_QR_ROTATED,
        payload: { tableId: 7, rotatedAt: expect.any(String) },
      },
    ]);
  });

  it('tracks staff session presence, revokes rooms, broadcasts drafts/auto-cancel, and handles transferred QR guests', async () => {
    vi.useFakeTimers();
    try {
      const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
      const disconnectSockets = vi.fn();
      const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 3, tokenType: 'access', sid: 'sid-1' }) };
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ ...staff, activeSessionId: 'sid-1' }) },
        diningTable: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce({ id: 9, name: 'Bàn 09' })
            .mockResolvedValueOnce(null),
        },
        masterData: {
          findUnique: vi.fn().mockResolvedValue({ metadata: { qrToken: 'c'.repeat(64) } }),
        },
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 77,
            orderCode: 'HD-77',
            tableId: 12,
            orderType: 'DINE_IN',
            orderSource: 'QR_CODE',
            status: 'SERVING',
            tableTransferLogs: [{ fromTable: 'Bàn 09', toTable: 'Bàn 12' }],
          }),
        },
      };

      const gateway = new PosSocketGateway(jwt as unknown as JwtService, prisma as never);
      (gateway as unknown as { server: unknown }).server = {
        emit: vi.fn(),
        to: (room: string) => ({ emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }) }),
        in: () => ({ disconnectSockets }),
      };

      const staffSocket = { ...createClient({ token: 'tok' }), id: 'sock-1' };
      await gateway.handleConnection(staffSocket as never);
      expect(gateway.isSessionOnline('sid-1')).toBe(true);
      expect(gateway.isSessionOnline(null)).toBe(false);

      gateway.emitSessionRevoked('sid-1', {
        reason: 'FORCED_LOGOUT',
        revokedAt: '2026-11-28T00:00:00.000Z',
        message: 'Đã đăng xuất',
      });
      expect(gateway.isSessionOnline('sid-1')).toBe(false);
      await vi.advanceTimersByTimeAsync(150);
      expect(disconnectSockets).toHaveBeenCalledWith(true);

      // Connect another staff socket & disconnect cleanly
      const staffSocket2 = { ...createClient({ token: 'tok' }), id: 'sock-2' };
      await gateway.handleConnection(staffSocket2 as never);
      gateway.handleDisconnect(staffSocket2 as never);
      expect(gateway.isSessionOnline('sid-1')).toBe(false);

      // Transferred table QR guest still authenticates for old table -> redirected room works
      const transferredGuest = createClient({ qrToken: 'a'.repeat(64), orderId: 77 });
      await gateway.handleConnection(transferredGuest as never);
      expect(transferredGuest.join).toHaveBeenCalledWith(SocketRooms.orderSession(77));

      // Takeaway guest without orderId joins PUBLIC_MENU
      const takeawayPublicGuest = createClient({ qrToken: 'c'.repeat(64) });
      await gateway.handleConnection(takeawayPublicGuest as never);
      expect(takeawayPublicGuest.join).toHaveBeenCalledWith(SocketRooms.PUBLIC_MENU);

      // Extra event emitters + catalog revision
      const revBefore = gateway.getMenuCatalogRevision();
      gateway.emitMenuUpdated({ updatedAt: 't2' });
      expect(gateway.getMenuCatalogRevision()).toBe(revBefore + 1);
      gateway.emitPosDraftsUpdated({ action: 'UPSERT', draftId: 5, revision: 2 });
      gateway.emitQrAutoCancelled(77, {
        orderId: 77,
        orderCode: 'HD-77',
        tableId: 12,
        tableLabel: 'Bàn 12',
        kind: 'NEW',
        cancelledItemCount: 2,
        autoCancelMinutes: 12,
        reason: 'Expired',
        cancelledAt: '2026-11-28T00:00:00.000Z',
      });
      expect(emissions.some((e) => e.event === SocketEvents.POS_DRAFTS_UPDATED)).toBe(true);
      expect(emissions.some((e) => e.event === SocketEvents.ORDER_QR_AUTO_CANCELLED)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
