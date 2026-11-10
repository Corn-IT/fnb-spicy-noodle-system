import { JwtService } from '@nestjs/jwt';
import { UserPermissionsSchema, SocketEvents, SocketRooms } from '@fnb/shared';
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

  it('should let a QR guest join only the order session for its supplied order', async () => {
    const jwt = { verifyAsync: vi.fn() };
    const prisma = { user: { findUnique: vi.fn() }, diningTable: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) } };
    const client = createClient({ qrToken: 'a'.repeat(64), orderId: '42' });
    const gateway = new PosSocketGateway(jwt as unknown as JwtService, prisma as never);

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledExactlyOnceWith(SocketRooms.orderSession(42));
    expect(client.join).not.toHaveBeenCalledWith(SocketRooms.POS_CASHIER);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
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

  it('should publish POS and QR events to their contracted rooms', () => {
    const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
    const gateway = new PosSocketGateway({} as JwtService, {} as PrismaService);
    (gateway as unknown as { server: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } }).server = {
      to: (room) => ({ emit: (event, payload) => emissions.push({ room, event, payload }) }),
    };
    const payload = { orderId: 42 };

    gateway.emitQrNewOrder(payload);
    gateway.emitQrAddonOrder(payload);
    gateway.emitOrderStatusUpdated(42, payload);
    gateway.emitOrderSessionRedirected(42, payload);
    gateway.emitTableGridSync(payload);

    expect(emissions).toEqual([
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.ORDER_QR_NEW, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.TABLE_GRID_SYNC, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.ORDER_QR_ADDON, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.TABLE_GRID_SYNC, payload },
      { room: SocketRooms.orderSession(42), event: SocketEvents.ORDER_STATUS_UPDATED, payload },
      { room: SocketRooms.orderSession(42), event: SocketEvents.ORDER_SESSION_REDIRECTED, payload },
      { room: SocketRooms.POS_CASHIER, event: SocketEvents.TABLE_GRID_SYNC, payload },
    ]);
  });
});
