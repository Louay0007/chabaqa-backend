import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import {
  getCorsOriginHandler,
  getJwtSecret,
} from '../common/utils/security-config.util';

@WebSocketGateway({
  namespace: '/channel',
  cors: { origin: getCorsOriginHandler(), credentials: true },
})
export class ChannelGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (
        client.handshake.auth?.token ||
        client.handshake.headers['authorization'] ||
        ''
      )
        .toString()
        .replace('Bearer ', '');
      const payload: any = this.jwtService.verify(token, {
        secret: getJwtSecret(),
      });
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

  @SubscribeMessage('channel:get-online-users')
  handleGetOnlineUsers() {
    return Array.from(this.onlineUsers.keys());
  }

  @SubscribeMessage('channel:join')
  handleJoinChannel(client: Socket, data: { channelId: string }) {
    if (!data?.channelId) return;
    client.join(`ch:${data.channelId}`);
  }

  @SubscribeMessage('channel:leave')
  handleLeaveChannel(client: Socket, data: { channelId: string }) {
    if (!data?.channelId) return;
    client.leave(`ch:${data.channelId}`);
  }

  @SubscribeMessage('channel:join-community')
  handleJoinCommunity(client: Socket, data: { communityId: string }) {
    if (!data?.communityId) return;
    client.join(`community:${data.communityId}`);
  }

  @SubscribeMessage('channel:typing:start')
  handleTypingStart(client: Socket, data: { channelId: string }) {
    if (!data?.channelId) return;
    const userId = (client as any).userId;
    if (!userId) return;
    client.to(`ch:${data.channelId}`).emit('channel:typing:start', {
      userId,
      channelId: data.channelId,
    });
  }

  @SubscribeMessage('channel:typing:stop')
  handleTypingStop(client: Socket, data: { channelId: string }) {
    if (!data?.channelId) return;
    const userId = (client as any).userId;
    if (!userId) return;
    client.to(`ch:${data.channelId}`).emit('channel:typing:stop', {
      userId,
      channelId: data.channelId,
    });
  }

  // ── Server → Client emit methods (called by ChannelService) ──────────

  emitNewMessage(channelId: string, message: any) {
    this.server
      .to(`ch:${channelId}`)
      .emit('channel:message:new', { channelId, message });
  }

  emitMessageEdited(channelId: string, message: any) {
    this.server
      .to(`ch:${channelId}`)
      .emit('channel:message:edited', { channelId, message });
  }

  emitMessageDeleted(
    channelId: string,
    messageId: string,
    deletedBy: string,
  ) {
    this.server
      .to(`ch:${channelId}`)
      .emit('channel:message:deleted', { channelId, messageId, deletedBy });
  }

  emitReactionUpdate(
    channelId: string,
    messageId: string,
    reactions: any[],
  ) {
    this.server
      .to(`ch:${channelId}`)
      .emit('channel:message:reaction', { channelId, messageId, reactions });
  }

  emitPinnedMessage(channelId: string, message: any) {
    this.server
      .to(`ch:${channelId}`)
      .emit('channel:message:pinned', { channelId, message });
  }

  emitUnreadCountUpdate(
    userId: string,
    channelId: string,
    unreadCount: number,
  ) {
    this.server
      .to(`user:${userId}`)
      .emit('channel:unread:update', { channelId, unreadCount });
  }

  emitChannelCreated(communityId: string, channel: any) {
    this.server
      .to(`community:${communityId}`)
      .emit('channel:created', channel);
  }

  emitChannelUpdated(communityId: string, channel: any) {
    this.server
      .to(`community:${communityId}`)
      .emit('channel:updated', channel);
  }

  emitChannelDeleted(communityId: string, channelId: string) {
    this.server
      .to(`community:${communityId}`)
      .emit('channel:deleted', { channelId });
  }
}
