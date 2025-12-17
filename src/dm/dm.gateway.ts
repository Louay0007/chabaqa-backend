import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ namespace: '/dm', cors: { origin: '*' } })
export class DmGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token || client.handshake.headers['authorization'] || '').toString().replace('Bearer ', '');
      const payload: any = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      const userId = payload?.userId;
      if (!userId) return client.disconnect();
      (client as any).userId = userId;
      client.join(`user:${userId}`);
    } catch (e) {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {}

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


