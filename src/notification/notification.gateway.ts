
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationGateway');
  // Map<userId, Set<socketId>> to support multiple connections per user (web + mobile + tabs)
  private userSockets = new Map<string, Set<string>>();
  // Reverse index to quickly resolve userId by socketId for cleanup
  private socketToUser = new Map<string, string>();

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const userId = this.socketToUser.get(client.id);
    if (!userId) return;

    this.socketToUser.delete(client.id);
    const set = this.userSockets.get(userId);
    if (!set) return;

    set.delete(client.id);
    if (set.size === 0) {
      this.userSockets.delete(userId);
      // Room will be empty; Socket.IO cleans up room automatically
    }
  }

  @SubscribeMessage('register')
  handleRegister(@ConnectedSocket() client: Socket, @MessageBody() userId: string): void {
    if (!userId || typeof userId !== 'string') return;
    this.logger.log(`User registered: ${userId} with socket ${client.id}`);

    // Track mapping
    this.socketToUser.set(client.id, userId);
    const set = this.userSockets.get(userId) || new Set<string>();
    set.add(client.id);
    this.userSockets.set(userId, set);

    // Join per-user room for easy fan-out
    const room = this.roomForUser(userId);
    client.join(room);
  }

  @SubscribeMessage('unregister')
  handleUnregister(@ConnectedSocket() client: Socket): void {
    const userId = this.socketToUser.get(client.id);
    if (!userId) return;
    this.logger.log(`User unregistered: ${userId} socket ${client.id}`);
    this.handleDisconnect(client);
    try { client.leave(this.roomForUser(userId)); } catch {}
  }

  sendNotificationToUser(userId: string, notification: any): void {
    // Emit to the user's room to cover all active sockets
    this.server.to(this.roomForUser(userId)).emit('notification', notification);
  }

  /** Send a notification to many users efficiently */
  sendNotificationToUsers(userIds: string[], notification: any): void {
    const rooms = userIds.map((id) => this.roomForUser(id));
    if (rooms.length > 0) {
      this.server.to(rooms).emit('notification', notification);
    }
  }

  private roomForUser(userId: string): string {
    return `user:${userId}`;
  }
}
