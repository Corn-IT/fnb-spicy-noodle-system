import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthPrincipalSchema,
  type PermissionsUpdatedSocketPayload,
  type QrAutoCancelledPayload,
  QrTokenSchema,
  SocketEvents,
  SocketNamespace,
  SocketRooms,
  type UserPermissions,
  UserPermissionsSchema,
  type RevokedSessionNotice,
} from '@fnb/shared';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../common/prisma/prisma.service';
import { isAllowedCorsOrigin, parseAllowedCorsOrigins } from '../common/security/cors-origin.util';
import {
  assertActiveSessionMatches,
  extractTokenSessionId,
} from '../common/security/session-validation.util';

type SocketAuth = { token?: unknown; qrToken?: unknown; orderId?: unknown };
type PosSocket = Socket & {
  data: Socket['data'] & {
    authMode?: 'staff' | 'guest';
    user?: { id: number };
    sessionId?: string;
    orderId?: number;
  };
};

@Injectable()
@WebSocketGateway({ namespace: SocketNamespace })
export class PosSocketGateway
  implements OnGatewayInit<Server>, OnGatewayConnection<PosSocket>, OnGatewayDisconnect<PosSocket>
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(PosSocketGateway.name);
  private readonly sessionConnections = new Map<string, Set<string>>();

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
        if (client.data.user?.id) {
          await client.join(SocketRooms.userAccount(client.data.user.id));
        }
        if (client.data.sessionId) {
          await client.join(SocketRooms.userSession(client.data.sessionId));
          if (typeof client.id === 'string' && client.id.length > 0) {
            let sockets = this.sessionConnections.get(client.data.sessionId);
            if (!sockets) {
              sockets = new Set<string>();
              this.sessionConnections.set(client.data.sessionId, sockets);
            }
            sockets.add(client.id);
          }
        }
        return;
      }
      if (client.data.authMode === 'guest' && client.data.orderId) {
        await client.join(SocketRooms.orderSession(client.data.orderId));
        return;
      }
      if (client.data.authMode === 'guest') {
        await client.join(SocketRooms.PUBLIC_MENU);
        return;
      }
      throw new Error('Socket authentication state is missing');
    } catch {
      this.logger.warn('Rejected unauthenticated POS socket connection');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: PosSocket): void {
    const sessionId = client.data?.sessionId;
    if (!sessionId || typeof client.id !== 'string') return;
    const sockets = this.sessionConnections.get(sessionId);
    if (!sockets) return;
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.sessionConnections.delete(sessionId);
    }
  }

  isSessionOnline(sessionId?: string | null): boolean {
    if (!sessionId) return false;
    return (this.sessionConnections.get(sessionId)?.size ?? 0) > 0;
  }

  emitSessionRevoked(sessionId: string, payload: RevokedSessionNotice): void {
    if (!sessionId) return;
    this.server?.to(SocketRooms.userSession(sessionId)).emit(SocketEvents.SESSION_REVOKED, {
      ...payload,
      sessionId,
    });
    this.sessionConnections.delete(sessionId);
    if (typeof this.server?.in === 'function') {
      const roomTarget = this.server.in(SocketRooms.userSession(sessionId));
      setTimeout(() => {
        roomTarget.disconnectSockets(true);
      }, 100);
    }
  }

  emitPermissionsUpdated(userId: number, permissions: UserPermissions): void {
    const payload: PermissionsUpdatedSocketPayload = {
      userId,
      permissions,
      updatedAt: new Date().toISOString(),
    };
    this.server?.to(SocketRooms.userAccount(userId)).emit(SocketEvents.PERMISSIONS_UPDATED, payload);
  }

  emitQrNewOrder(payload: unknown): void {
    this.server.to(SocketRooms.POS_CASHIER).emit(SocketEvents.ORDER_QR_NEW, payload);
    this.emitTableGridSync(payload);
  }

  emitQrAddonOrder(payload: unknown): void {
    this.server.to(SocketRooms.POS_CASHIER).emit(SocketEvents.ORDER_QR_ADDON, payload);
    this.emitTableGridSync(payload);
  }

  emitQrAutoCancelled(orderId: number, payload: QrAutoCancelledPayload): void {
    this.server?.to(SocketRooms.POS_CASHIER).emit(SocketEvents.ORDER_QR_AUTO_CANCELLED, payload);
    this.server?.to(SocketRooms.orderSession(orderId)).emit(SocketEvents.ORDER_QR_AUTO_CANCELLED, payload);
  }

  emitOrderStatusUpdated(orderId: number, payload: unknown): void {
    this.server.to(SocketRooms.orderSession(orderId)).emit(SocketEvents.ORDER_STATUS_UPDATED, payload);
  }

  emitOrderSessionRedirected(previousOrderId: number, payload: unknown): void {
    this.server.to(SocketRooms.orderSession(previousOrderId)).emit(SocketEvents.ORDER_SESSION_REDIRECTED, payload);
  }

  emitTableGridSync(payload: unknown): void {
    this.server?.to(SocketRooms.POS_CASHIER).emit(SocketEvents.TABLE_GRID_SYNC, payload);
  }

  emitMenuUpdated(payload: unknown = { updatedAt: new Date().toISOString() }): void {
    this.server?.emit(SocketEvents.MENU_UPDATED, payload);
  }

  emitScheduleUpdated(payload: unknown = { updatedAt: new Date().toISOString() }): void {
    this.server?.to(SocketRooms.POS_CASHIER).emit(SocketEvents.SCHEDULE_UPDATED, payload);
  }

  emitPayrollUpdated(payload: unknown = { updatedAt: new Date().toISOString() }): void {
    this.server?.to(SocketRooms.POS_CASHIER).emit(SocketEvents.PAYROLL_UPDATED, payload);
  }

  emitStoreSettingsUpdated(payload: unknown = { version: new Date().toISOString() }): void {
    this.server?.emit(SocketEvents.STORE_SETTINGS_UPDATED, payload);
  }

  private async authenticate(client: PosSocket): Promise<void> {
    const handshakeHeaders = (client.handshake as { headers?: Record<string, unknown> }).headers;
    const rawOrigin = typeof handshakeHeaders?.origin === 'string' ? handshakeHeaders.origin : undefined;
    if (rawOrigin) {
      const configuredOrigins = parseAllowedCorsOrigins(
        process.env.FNB_CORS_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      );
      if (!isAllowedCorsOrigin(rawOrigin, configuredOrigins, process.env.NODE_ENV ?? 'development')) {
        throw new Error('Disallowed WebSocket origin');
      }
    }

    const auth = (client.handshake.auth ?? {}) as SocketAuth;

    if (auth.token !== undefined) {
      if (typeof auth.token !== 'string' || auth.token.length === 0) throw new Error('Invalid staff token');
      const payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
        tokenType?: unknown;
        sid?: unknown;
      }>(auth.token);
      const userId = typeof payload.sub === 'number' ? payload.sub : Number(payload.sub);
      if (payload.tokenType !== 'access' || !Number.isSafeInteger(userId) || userId < 1) {
        throw new Error('Invalid staff token claims');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          employeeId: true,
          username: true,
          isSuperAdmin: true,
          permissions: true,
          isActive: true,
          activeSessionId: true,
          lastRevokedNotice: true,
        },
      });
      const permissions = UserPermissionsSchema.safeParse(user?.permissions);
      if (!user?.isActive || !permissions.success) throw new Error('Inactive or invalid staff account');

      const tokenSid = extractTokenSessionId(payload);
      assertActiveSessionMatches(user, tokenSid);

      const principal = AuthPrincipalSchema.parse({
        id: user.id,
        employeeId: user.employeeId,
        username: user.username,
        isSuperAdmin: user.isSuperAdmin,
        permissions: permissions.data,
        ...(tokenSid ? { sessionId: tokenSid } : {}),
      });
      client.data.user = principal;
      if (tokenSid) {
        client.data.sessionId = tokenSid;
      }
      client.data.authMode = 'staff';
      return;
    }

    if (!QrTokenSchema.safeParse(auth.qrToken).success) {
      throw new Error('Invalid QR guest credentials');
    }

    const table = await this.prisma.diningTable.findUnique({
      where: { qrToken: auth.qrToken as string },
      select: { id: true },
    });
    if (!table) throw new Error('Unknown QR table token');
    client.data.authMode = 'guest';

    const orderId = typeof auth.orderId === 'number' ? auth.orderId : Number(auth.orderId);
    if (Number.isSafeInteger(orderId) && orderId >= 1) {
      const orderRepo = (this.prisma as unknown as {
        order?: {
          findUnique?: (args: unknown) => Promise<{
            id: number;
            tableId: number | null;
            orderType: string;
            orderSource: string;
            status: string;
          } | null>;
        };
      }).order;

      if (typeof orderRepo?.findUnique === 'function') {
        const order = await orderRepo.findUnique({
          where: { id: orderId },
          select: { id: true, tableId: true, orderType: true, orderSource: true, status: true },
        });
        const validSessionOrder =
          order !== null &&
          order.orderType === 'DINE_IN' &&
          order.status !== 'VOIDED' &&
          (order.tableId === table.id || order.orderSource === 'QR_CODE');
        if (!validSessionOrder) {
          throw new Error('Order does not belong to this QR table session');
        }
      }
      client.data.orderId = orderId;
    }
  }
}
