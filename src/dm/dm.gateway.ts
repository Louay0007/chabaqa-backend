import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { getCorsOriginHandler, getJwtSecret } from '../common/utils/security-config.util';

@WebSocketGateway({
  namespace: '/dm',
  cors: { origin: getCorsOriginHandler(), credentials: true },
})
export class DmGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token || client.handshake.headers['authorization'] || '').toString().replace('Bearer ', '');
      const payload: any = this.jwtService.verify(token, { secret: getJwtSecret() });
      const userId = payload?.userId || payload?.sub;
      if (!userId) return client.disconnect();

      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      const userSockets = this.onlineUsers.get(userId);
      if (userSockets) {
        if (userSockets.size === 0) {
          this.server.emit('user:status', { userId, status: 'online' });
        }
        userSockets.add(client.id);
      }

      (client as any).userId = userId;
      client.join(`user:${userId}`);
    } catch (e) {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId && this.onlineUsers.has(userId)) {
      const userSockets = this.onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.server.emit('user:status', { userId, status: 'offline' });
          this.onlineUsers.delete(userId);
        }
      }
    }
  }

  @SubscribeMessage('dm:get-online-users')
  handleGetOnlineUsers() {
    return Array.from(this.onlineUsers.keys());
  }

  @SubscribeMessage('dm:join')
  handleJoinRoom(client: Socket, data: { conversationId: string }) {
    if (!data?.conversationId) return;
    client.join(`conv:${data.conversationId}`);
  }

  emitNewMessage(conversationId: string, recipientUserId: string, message: any) {
    this.server.to(`user:${recipientUserId}`).emit('dm:message:new', { conversationId, message });
    this.server.to(`conv:${conversationId}`).emit('dm:message:new', { conversationId, message });
  }

  emitRead(conversationId: string, userId: string, readAt: Date) {
    this.server.to(`conv:${conversationId}`).emit('dm:message:read', { conversationId, userId, readAt });
  }
}


