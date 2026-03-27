import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { getCorsOriginHandler, getJwtSecret } from '../common/utils/security-config.util';

@WebSocketGateway({
  namespace: '/live-support',
  cors: { origin: getCorsOriginHandler(), credentials: true },
})
export class LiveSupportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token || client.handshake.headers['authorization'] || '')
        .toString()
        .replace('Bearer ', '')
        .trim();
      const payload: any = this.jwtService.verify(token, {
        secret: getJwtSecret(),
      });

      const actorId = String(payload?.sub || payload?.userId || '').trim();
      if (!actorId) {
        client.disconnect();
        return;
      }

      const role = String(payload?.role || '').toLowerCase();
      const isAdmin = role === 'admin' || role === 'super_admin' || role === 'moderator';

      (client as any).actorId = actorId;
      (client as any).isAdmin = isAdmin;

      if (isAdmin) {
        client.join('support:admins');
        client.join(`support:admin:${actorId}`);
      } else {
        client.join(`support:user:${actorId}`);
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(_client: Socket) {}

  @SubscribeMessage('support:join-ticket')
  handleJoinTicket(@ConnectedSocket() client: Socket, payload: { conversationId: string }) {
    if (!payload?.conversationId) return;
    client.join(`support:ticket:${payload.conversationId}`);
  }

  emitTicketCreated(ticket: any) {
    const userId = String(ticket?.participantA || '');
    this.server.to('support:admins').emit('support:ticket:created', { ticket });
    if (userId) {
      this.server.to(`support:user:${userId}`).emit('support:ticket:created', { ticket });
    }
  }

  emitTicketUpdated(ticket: any) {
    const ticketId = String(ticket?._id || ticket?.id || '');
    const userId = String(ticket?.participantA || '');
    this.server.to('support:admins').emit('support:ticket:updated', { ticket });
    if (ticketId) this.server.to(`support:ticket:${ticketId}`).emit('support:ticket:updated', { ticket });
    if (userId) this.server.to(`support:user:${userId}`).emit('support:ticket:updated', { ticket });
  }

  emitTicketClaimed(ticket: any) {
    const ticketId = String(ticket?._id || ticket?.id || '');
    const userId = String(ticket?.participantA || '');
    this.server.to('support:admins').emit('support:ticket:claimed', { ticket });
    if (ticketId) this.server.to(`support:ticket:${ticketId}`).emit('support:ticket:claimed', { ticket });
    if (userId) this.server.to(`support:user:${userId}`).emit('support:ticket:claimed', { ticket });
  }

  emitTicketClosed(ticket: any) {
    const ticketId = String(ticket?._id || ticket?.id || '');
    const userId = String(ticket?.participantA || '');
    this.server.to('support:admins').emit('support:ticket:closed', { ticket });
    if (ticketId) this.server.to(`support:ticket:${ticketId}`).emit('support:ticket:closed', { ticket });
    if (userId) this.server.to(`support:user:${userId}`).emit('support:ticket:closed', { ticket });
  }

  emitMessage(ticketId: string, message: any, participantA: string) {
    this.server.to('support:admins').emit('support:message:new', { conversationId: ticketId, message });
    this.server.to(`support:ticket:${ticketId}`).emit('support:message:new', { conversationId: ticketId, message });
    if (participantA) {
      this.server.to(`support:user:${participantA}`).emit('support:message:new', { conversationId: ticketId, message });
    }
  }
}
