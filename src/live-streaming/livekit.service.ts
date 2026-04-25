import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  readonly wsUrl: string;
  private roomClient: RoomServiceClient | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || '';
    this.wsUrl = this.configService.get<string>('LIVEKIT_WS_URL') || '';

    if (this.apiKey && this.apiSecret && this.wsUrl) {
      this.roomClient = new RoomServiceClient(
        this.wsUrl,
        this.apiKey,
        this.apiSecret,
      );
      this.logger.log('LiveKit service initialized');
    } else {
      this.logger.warn(
        'LiveKit credentials not configured — token generation will use mock values. ' +
          'Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL in .env',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret && this.wsUrl);
  }

  /**
   * Generate a LiveKit JWT for a participant.
   * Works fully locally — no external API call required.
   */
  async generateToken(params: {
    roomName: string;
    identity: string;
    name: string;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
  }): Promise<string> {
    if (!this.isConfigured) {
      // Return a placeholder token for demo/development mode
      return `demo-token:${params.roomName}:${params.identity}`;
    }

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: params.identity,
      name: params.name,
      ttl: 3600, // 1 hour
    });

    at.addGrant({
      roomJoin: true,
      room: params.roomName,
      canPublish: params.canPublish ?? true,
      canSubscribe: params.canSubscribe ?? true,
      canPublishData: params.canPublishData ?? true,
    });

    return await at.toJwt();
  }

  async generateHostToken(roomName: string, userId: string, userName: string): Promise<string> {
    return this.generateToken({
      roomName,
      identity: `host_${userId}`,
      name: userName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  }

  async generateViewerToken(roomName: string, userId: string, userName: string): Promise<string> {
    return this.generateToken({
      roomName,
      identity: `viewer_${userId}`,
      name: userName,
      canPublish: false,
      canSubscribe: true,
      canPublishData: true, // allow chat data messages
    });
  }

  async generateSpeakerToken(roomName: string, userId: string, userName: string): Promise<string> {
    return this.generateToken({
      roomName,
      identity: `speaker_${userId}`,
      name: userName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  }

  /**
   * Create a LiveKit room via the Room Service API.
   * Requires LIVEKIT_WS_URL to be set.
   * Falls back gracefully if not configured.
   */
  async createRoom(
    roomName: string,
    options: { maxParticipants?: number } = {},
  ): Promise<{ roomName: string }> {
    if (!this.isConfigured || !this.roomClient) {
      this.logger.warn(`LiveKit not configured — skipping room creation for ${roomName}`);
      return { roomName };
    }

    try {
      const room = await this.roomClient.createRoom({
        name: roomName,
        maxParticipants: options.maxParticipants ?? 100,
        emptyTimeout: 300, // 5 minutes before auto-cleanup
      });
      return { roomName: room.name };
    } catch (err: any) {
      this.logger.error(`Failed to create LiveKit room: ${err?.message}`);
      // Non-fatal — room creation can fail if LiveKit server is temporarily unavailable
      return { roomName };
    }
  }

  /**
   * Delete / end a LiveKit room.
   */
  async endRoom(roomName: string): Promise<void> {
    if (!this.isConfigured || !this.roomClient) return;

    try {
      await this.roomClient.deleteRoom(roomName);
      this.logger.log(`LiveKit room ended: ${roomName}`);
    } catch (err: any) {
      this.logger.warn(`Could not delete LiveKit room ${roomName}: ${err?.message}`);
    }
  }
}
