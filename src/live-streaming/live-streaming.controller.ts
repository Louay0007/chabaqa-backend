import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsDateString, IsString, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { LiveStreamingService } from './live-streaming.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import {
  RequireCommunityPermission,
  CommunityIdFrom,
} from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { LiveRoomType, LiveRoomStatus } from '../schema/live-room.schema';

class CreateLiveRoomDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(LiveRoomType)
  roomType?: LiveRoomType;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(1000)
  @Type(() => Number)
  maxParticipants?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowScreenShare?: boolean;

  @IsOptional()
  @IsBoolean()
  allowQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  reactionsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;
}

@ApiTags('Live Streaming')
@Controller('live-rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LiveStreamingController {
  constructor(private readonly liveStreamingService: LiveStreamingService) {}

  // ─── Creator: manage live rooms ───────────────────────────────────────────

  @Post(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'param', paramName: 'communityId' })
  @ApiOperation({ summary: 'Create a new live room' })
  @ApiResponse({ status: 201, description: 'Live room created' })
  async createLiveRoom(
    @Param('communityId') communityId: string,
    @Request() req: any,
    @Body() dto: CreateLiveRoomDto,
  ) {
    const room = await this.liveStreamingService.createLiveRoom(
      communityId,
      req.user._id || req.user.sub,
      {
        ...dto,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    );
    return { success: true, data: room };
  }

  @Post(':communityId/:roomId/start')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'param', paramName: 'communityId' })
  @ApiOperation({ summary: 'Start a scheduled live room' })
  async startLiveRoom(
    @Param('communityId') communityId: string,
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    const room = await this.liveStreamingService.startLiveRoom(
      roomId,
      req.user._id || req.user.sub,
    );
    return { success: true, data: room };
  }

  @Post(':communityId/:roomId/end')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'param', paramName: 'communityId' })
  @ApiOperation({ summary: 'End a live room' })
  async endLiveRoom(
    @Param('communityId') communityId: string,
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    await this.liveStreamingService.endLiveRoom(
      roomId,
      req.user._id || req.user.sub,
    );
    return { success: true, message: 'Live room ended' };
  }

  @Delete(':communityId/:roomId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'param', paramName: 'communityId' })
  @ApiOperation({ summary: 'Cancel a scheduled live room' })
  async cancelLiveRoom(
    @Param('communityId') communityId: string,
    @Param('roomId') roomId: string,
    @Request() req: any,
  ) {
    await this.liveStreamingService.cancelLiveRoom(
      roomId,
      req.user._id || req.user.sub,
    );
    return { success: true, message: 'Live room cancelled' };
  }

  // ─── Member: join & view ─────────────────────────────────────────────────

  @Get(':communityId/:roomId/token')
  @ApiOperation({ summary: 'Get LiveKit join token for a room' })
  @ApiQuery({ name: 'role', enum: ['host', 'speaker', 'viewer'], required: false })
  async getRoomToken(
    @Param('communityId') communityId: string,
    @Param('roomId') roomId: string,
    @Request() req: any,
    @Query('role') role: 'host' | 'speaker' | 'viewer' = 'viewer',
  ) {
    const userId = String(req.user._id || req.user.sub || '');
    const userName = req.user.name || req.user.username || 'User';
    const result = await this.liveStreamingService.getRoomToken(
      roomId,
      userId,
      userName,
      role,
    );
    return { success: true, ...result };
  }

  @Get(':communityId/:roomId')
  @ApiOperation({ summary: 'Get a specific live room' })
  async getLiveRoom(
    @Param('communityId') communityId: string,
    @Param('roomId') roomId: string,
  ) {
    const room = await this.liveStreamingService.getLiveRoomById(roomId);
    return { success: true, data: room };
  }

  @Get(':communityId')
  @ApiOperation({ summary: 'Get live rooms for community' })
  @ApiQuery({ name: 'status', enum: Object.values(LiveRoomStatus), required: false })
  async getLiveRooms(
    @Param('communityId') communityId: string,
    @Query('status') status?: string,
  ) {
    const rooms = await this.liveStreamingService.getCommunityLiveRooms(
      communityId,
      status as LiveRoomStatus | undefined,
    );
    return { success: true, data: rooms };
  }

  @Get(':communityId/schedule/upcoming')
  @ApiOperation({ summary: 'Get upcoming scheduled streams' })
  async getUpcomingStreams(@Param('communityId') communityId: string) {
    const rooms = await this.liveStreamingService.getUpcomingStreams(communityId);
    return { success: true, data: rooms };
  }

  @Get(':communityId/stream/active')
  @ApiOperation({ summary: 'Get currently active live stream' })
  async getActiveLive(@Param('communityId') communityId: string) {
    const room = await this.liveStreamingService.getActiveLive(communityId);
    return { success: true, data: room };
  }

  @Get(':communityId/history/past')
  @ApiOperation({ summary: 'Get past/ended streams' })
  async getPastStreams(@Param('communityId') communityId: string) {
    const rooms = await this.liveStreamingService.getPastStreams(communityId);
    return { success: true, data: rooms };
  }
}
