import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthPrincipalSchema,
  QrTokenSchema,
  SocketEvents,
  SocketNamespace,
  SocketRooms,
  UserPermissionsSchema,
} from '@fnb/shared';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../common/prisma/prisma.service';

type SocketAuth = { token?: unknown; qrToken?: unknown; orderId?: unknown };
type PosSocket = Socket & {
  data: Socket['data'] & {
    authMode?: 'staff' | 'guest';
    user?: unknown;
    orderId?: number;
  };
};

@Injectable()
@WebSocketGateway({ namespace: SocketNamespace })
export class PosSocketGateway implements OnGatewayInit<Server>, OnGatewayConnection<PosSocket> {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(PosSocketGateway.name);

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    server.use((client, next) => {
      void this.authenticate(client as PosSocket).then(
        () => next(),
        () => next(new Error('Unauthorized')),
      );
    });
  }

  async handleConnection(client: PosSocket): Promise<void> {
    try {
      if (!client.data.authMode) await this.authenticate(client);
      if (client.data.authMode === 'staff') {
        await client.join(SocketRooms.POS_CASHIER);
        return;
      }
      if (client.data.authMode === 'guest' && client.data.orderId) {
        await client.join(SocketRooms.orderSession(client.data.orderId));
        return;
      }
      throw new Error('Socket authentication state is missing');
    } catch {
      this.logger.warn('Rejected unauthenticated POS socket connection');
      client.disconnect(true);
    }
  }

  emitQrNewOrder(payload: unknown): void {
    this.server.to(SocketRooms.POS_CASHIER).emit(SocketEvents.ORDER_QR_NEW, payload);
    this.emitTableGridSync(payload);
  }

  emitQrAddonOrder(payload: unknown): void {
    this.server.to(SocketRooms.POS_CASHIER).emit(SocketEvents.ORDER_QR_ADDON, payload);
    this.emitTableGridSync(payload);
  }

  emitOrderStatusUpdated(orderId: number, payload: unknown): void {
    this.server.to(SocketRooms.orderSession(orderId)).emit(SocketEvents.ORDER_STATUS_UPDATED, payload);
  }

  emitOrderSessionRedirected(previousOrderId: number, payload: unknown): void {
    this.server.to(SocketRooms.orderSession(previousOrderId)).emit(SocketEvents.ORDER_SESSION_REDIRECTED, payload);
  }

  emitTableGridSync(payload: unknown): void {
    this.server.to(SocketRooms.POS_CASHIER).emit(SocketEvents.TABLE_GRID_SYNC, payload);
  }

  private async authenticate(client: PosSocket): Promise<void> {
    const auth = (client.handshake.auth ?? {}) as SocketAuth;

    if (auth.token !== undefined) {
      if (typeof auth.token !== 'string' || auth.token.length === 0) throw new Error('Invalid staff token');
      const payload = await this.jwtService.verifyAsync<{ sub?: unknown; tokenType?: unknown }>(auth.token);
      const userId = typeof payload.sub === 'number' ? payload.sub : Number(payload.sub);
      if (payload.tokenType !== 'access' || !Number.isSafeInteger(userId) || userId < 1) {
        throw new Error('Invalid staff token claims');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, employeeId: true, username: true, isSuperAdmin: true, permissions: true, isActive: true },
      });
      const permissions = UserPermissionsSchema.safeParse(user?.permissions);
      if (!user?.isActive || !permissions.success) throw new Error('Inactive or invalid staff account');

      const principal = AuthPrincipalSchema.parse({
        id: user.id,
        employeeId: user.employeeId,
        username: user.username,
        isSuperAdmin: user.isSuperAdmin,
        permissions: permissions.data,
      });
      client.data.user = principal;
      client.data.authMode = 'staff';
      return;
    }

    const orderId = typeof auth.orderId === 'number' ? auth.orderId : Number(auth.orderId);
    if (!QrTokenSchema.safeParse(auth.qrToken).success || !Number.isSafeInteger(orderId) || orderId < 1) {
      throw new Error('Invalid QR guest credentials');
    }

    const table = await this.prisma.diningTable.findUnique({
      where: { qrToken: auth.qrToken as string },
      select: { id: true },
    });
    if (!table) throw new Error('Unknown QR table token');
    client.data.authMode = 'guest';
    client.data.orderId = orderId;
  }
}
