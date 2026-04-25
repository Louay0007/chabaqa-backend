import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  LiveRoom,
  LiveRoomDocument,
  LiveRoomStatus,
  LiveRoomType,
  LiveParticipant,
  LiveParticipantDocument,
} from '../schema/live-room.schema';
import { LiveKitService } from './livekit.service';

export interface CreateLiveRoomData {
  title: string;
  description?: string;
  roomType?: LiveRoomType;
  scheduledAt?: Date;
  maxParticipants?: number;
  isPublic?: boolean;
  chatEnabled?: boolean;
  allowScreenShare?: boolean;
  allowQuestions?: boolean;
  reactionsEnabled?: boolean;
  recordingEnabled?: boolean;
}

export interface LiveRoomResponse {
  _id: string;
  roomId: string;
  communityId: string;
  hostId: string;
  title: string;
  description?: string;
  roomType: LiveRoomType;
  status: LiveRoomStatus;
  thumbnailUrl?: string;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  liveKitRoomName?: string;
  wsUrl?: string;
  isPublic: boolean;
  maxParticipants: number;
  recordingEnabled: boolean;
  viewerCount: number;
  peakViewerCount: number;
  chatEnabled: boolean;
  allowScreenShare: boolean;
  allowQuestions: boolean;
  reactionsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class LiveStreamingService {
  private readonly logger = new Logger(LiveStreamingService.name);

  constructor(
    @InjectModel(LiveRoom.name)
    private readonly liveRoomModel: Model<LiveRoomDocument>,
    @InjectModel(LiveParticipant.name)
    private readonly participantModel: Model<LiveParticipantDocument>,
    private readonly liveKitService: LiveKitService,
  ) {}

  private toResponse(room: LiveRoomDocument): LiveRoomResponse {
    return {
      _id: room._id.toString(),
      roomId: room.roomId,
      communityId: room.communityId,
      hostId: room.hostId.toString(),
      title: room.title,
      description: room.description,
      roomType: room.roomType,
      status: room.status,
      thumbnailUrl: room.thumbnailUrl,
      scheduledAt: room.scheduledAt?.toISOString(),
      startedAt: room.startedAt?.toISOString(),
      endedAt: room.endedAt?.toISOString(),
      liveKitRoomName: room.liveKitRoomName,
      wsUrl: this.liveKitService.wsUrl || undefined,
      isPublic: room.isPublic,
      maxParticipants: room.maxParticipants,
      recordingEnabled: room.recordingEnabled,
      viewerCount: room.viewerCount,
      peakViewerCount: room.peakViewerCount,
      chatEnabled: room.chatEnabled,
      allowScreenShare: room.allowScreenShare,
      allowQuestions: room.allowQuestions,
      reactionsEnabled: room.reactionsEnabled,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  async createLiveRoom(
    communityId: string,
    hostId: string,
    data: CreateLiveRoomData,
  ): Promise<LiveRoomResponse> {
    const roomId = `live_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const isImmediate = !data.scheduledAt || data.scheduledAt <= new Date();

    let liveKitRoomName: string | undefined;
    if (isImmediate) {
      const lkRoom = await this.liveKitService.createRoom(roomId, {
        maxParticipants: data.maxParticipants ?? 100,
      });
      liveKitRoomName = lkRoom.roomName;
    }

    const room = await this.liveRoomModel.create({
      roomId,
      communityId,
      hostId: new Types.ObjectId(hostId),
      title: data.title,
      description: data.description,
      roomType: data.roomType ?? LiveRoomType.BROADCAST,
      status: isImmediate ? LiveRoomStatus.LIVE : LiveRoomStatus.SCHEDULED,
      scheduledAt: data.scheduledAt,
      startedAt: isImmediate ? new Date() : undefined,
      liveKitRoomName,
      isPublic: data.isPublic ?? true,
      maxParticipants: data.maxParticipants ?? 100,
      chatEnabled: data.chatEnabled ?? true,
      allowScreenShare: data.allowScreenShare ?? false,
      allowQuestions: data.allowQuestions ?? false,
      reactionsEnabled: data.reactionsEnabled ?? true,
      recordingEnabled: data.recordingEnabled ?? false,
    });

    return this.toResponse(room);
  }

  async startLiveRoom(roomId: string, hostId: string): Promise<LiveRoomResponse> {
    const room = await this.liveRoomModel.findOne({
      roomId,
      hostId: new Types.ObjectId(hostId),
    });

    if (!room) throw new NotFoundException('Live room not found');
    if (room.status === LiveRoomStatus.LIVE)
      throw new BadRequestException('Room is already live');
    if (room.status === LiveRoomStatus.ENDED || room.status === LiveRoomStatus.CANCELLED)
      throw new BadRequestException('Room has already ended or been cancelled');

    if (!room.liveKitRoomName) {
      const lkRoom = await this.liveKitService.createRoom(roomId, {
        maxParticipants: room.maxParticipants,
      });
      room.liveKitRoomName = lkRoom.roomName;
    }

    room.status = LiveRoomStatus.LIVE;
    room.startedAt = new Date();
    await room.save();

    return this.toResponse(room);
  }

  async endLiveRoom(roomId: string, hostId: string): Promise<void> {
    const room = await this.liveRoomModel.findOne({
      roomId,
      hostId: new Types.ObjectId(hostId),
    });

    if (!room) throw new NotFoundException('Live room not found');

    room.status = LiveRoomStatus.ENDED;
    room.endedAt = new Date();
    await room.save();

    if (room.liveKitRoomName) {
      await this.liveKitService.endRoom(room.liveKitRoomName);
    }
  }

  async cancelLiveRoom(roomId: string, hostId: string): Promise<void> {
    const room = await this.liveRoomModel.findOne({
      roomId,
      hostId: new Types.ObjectId(hostId),
    });

    if (!room) throw new NotFoundException('Live room not found');
    if (room.status === LiveRoomStatus.LIVE)
      throw new BadRequestException('Cannot cancel a live stream — end it first');

    room.status = LiveRoomStatus.CANCELLED;
    await room.save();
  }

  async getRoomToken(
    roomId: string,
    userId: string,
    userName: string,
    role: 'host' | 'speaker' | 'viewer',
  ): Promise<{ token: string; wsUrl: string }> {
    const room = await this.liveRoomModel.findOne({ roomId });
    if (!room) throw new NotFoundException('Live room not found');
    if (room.status === LiveRoomStatus.ENDED)
      throw new BadRequestException('This live stream has ended');
    if (room.status === LiveRoomStatus.CANCELLED)
      throw new BadRequestException('This live stream was cancelled');
    if (!room.liveKitRoomName)
      throw new BadRequestException('Live room is not yet initialized');

    let token: string;
    switch (role) {
      case 'host':
        token = await this.liveKitService.generateHostToken(room.liveKitRoomName, userId, userName);
        break;
      case 'speaker':
        token = await this.liveKitService.generateSpeakerToken(room.liveKitRoomName, userId, userName);
        break;
      default:
        token = await this.liveKitService.generateViewerToken(room.liveKitRoomName, userId, userName);
    }

    // Track participant join
    await this.participantModel.findOneAndUpdate(
      { roomId, userId: new Types.ObjectId(userId) },
      {
        $setOnInsert: {
          roomId,
          userId: new Types.ObjectId(userId),
          role,
          joinedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return { token, wsUrl: this.liveKitService.wsUrl };
  }

  async getCommunityLiveRooms(
    communityId: string,
    status?: LiveRoomStatus,
  ): Promise<LiveRoomResponse[]> {
    const query: Record<string, unknown> = { communityId };
    if (status) query.status = status;

    const rooms = await this.liveRoomModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();

    return rooms.map((r) => this.toResponse(r));
  }

  async getUpcomingStreams(communityId: string): Promise<LiveRoomResponse[]> {
    const rooms = await this.liveRoomModel
      .find({
        communityId,
        status: LiveRoomStatus.SCHEDULED,
        scheduledAt: { $gte: new Date() },
      })
      .sort({ scheduledAt: 1 })
      .exec();

    return rooms.map((r) => this.toResponse(r));
  }

  async getActiveLive(communityId: string): Promise<LiveRoomResponse | null> {
    const room = await this.liveRoomModel.findOne({
      communityId,
      status: LiveRoomStatus.LIVE,
    });
    return room ? this.toResponse(room) : null;
  }

  async getLiveRoomById(roomId: string): Promise<LiveRoomResponse> {
    const room = await this.liveRoomModel.findOne({ roomId });
    if (!room) throw new NotFoundException('Live room not found');
    return this.toResponse(room);
  }

  async updateViewerCount(roomId: string, count: number): Promise<void> {
    await this.liveRoomModel.updateOne(
      { roomId },
      {
        $set: { viewerCount: count },
        $max: { peakViewerCount: count },
      },
    );
  }

  async getPastStreams(communityId: string, limit = 20): Promise<LiveRoomResponse[]> {
    const rooms = await this.liveRoomModel
      .find({ communityId, status: LiveRoomStatus.ENDED })
      .sort({ endedAt: -1 })
      .limit(limit)
      .exec();

    return rooms.map((r) => this.toResponse(r));
  }
}
