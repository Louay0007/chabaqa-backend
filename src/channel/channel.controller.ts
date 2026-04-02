import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Delete,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChannelService } from './channel.service';
import { UploadService, FileType } from '../upload/upload.service';
import { MediaPurpose } from '../media/media.types';
import { CreateChannelDto } from '../dto-channel/create-channel.dto';
import { UpdateChannelDto } from '../dto-channel/update-channel.dto';
import { SendChannelMessageDto } from '../dto-channel/send-channel-message.dto';
import { AddReactionDto } from '../dto-channel/add-reaction.dto';
import { ReorderChannelsDto } from '../dto-channel/reorder-channels.dto';
import { AddChannelMembersDto } from '../dto-channel/add-channel-members.dto';

@ApiTags('Community Chat Channels')
@Controller('channel')
export class ChannelController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly uploadService: UploadService,
  ) {}

  private getRequestUserId(req: any): string {
    return (
      req?.user?._id ||
      req?.user?.userId ||
      req?.user?.sub ||
      req?.user?.id ||
      ''
    ).toString();
  }

  // ── Channel CRUD ─────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new channel in a community' })
  async createChannel(@Body() dto: CreateChannelDto, @Request() req: any) {
    const channel = await this.channelService.createChannel(
      this.getRequestUserId(req),
      dto,
    );
    return { channel };
  }

  @Get('community/:communityId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all channels for a community' })
  async listChannels(
    @Param('communityId') communityId: string,
    @Request() req: any,
  ) {
    const channels = await this.channelService.listChannels(
      communityId,
      this.getRequestUserId(req),
    );
    return { channels };
  }

  @Get(':channelId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single channel by ID' })
  async getChannel(@Param('channelId') channelId: string, @Request() req: any) {
    const channel = await this.channelService.getChannel(
      channelId,
      this.getRequestUserId(req),
    );
    return { channel };
  }

  @Patch(':channelId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a channel' })
  async updateChannel(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
    @Request() req: any,
  ) {
    const channel = await this.channelService.updateChannel(
      channelId,
      this.getRequestUserId(req),
      dto,
    );
    return { channel };
  }

  @Delete(':channelId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive or delete a channel' })
  async deleteChannel(
    @Param('channelId') channelId: string,
    @Request() req: any,
  ) {
    await this.channelService.deleteChannel(
      channelId,
      this.getRequestUserId(req),
    );
    return { success: true };
  }

  @Patch('community/:communityId/reorder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder channels within a community' })
  async reorderChannels(
    @Param('communityId') communityId: string,
    @Body() dto: ReorderChannelsDto,
    @Request() req: any,
  ) {
    await this.channelService.reorderChannels(
      communityId,
      this.getRequestUserId(req),
      dto.orderedIds,
    );
    return { success: true };
  }

  // ── Membership ───────────────────────────────────────────────────────

  @Post(':channelId/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add members to a channel' })
  async addMembers(
    @Param('channelId') channelId: string,
    @Body() dto: AddChannelMembersDto,
    @Request() req: any,
  ) {
    const members = await this.channelService.addMembersToPrivateChannel(
      this.getRequestUserId(req),
      channelId,
      dto.userIds,
    );
    return { members };
  }

  @Delete(':channelId/members/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a member from a channel' })
  async removeMember(
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    await this.channelService.removeMemberFromChannel(
      this.getRequestUserId(req),
      channelId,
      userId,
    );
    return { success: true };
  }

  @Patch(':channelId/members/:userId/role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a member role in a channel' })
  async setMemberRole(
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
    @Request() req: any,
  ) {
    const member = await this.channelService.setChannelMemberRole(
      this.getRequestUserId(req),
      channelId,
      userId,
      body.role as 'member' | 'moderator',
    );
    return { member };
  }

  @Patch(':channelId/members/:userId/mute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mute or unmute a member in a channel' })
  async muteMember(
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
    @Body() body: { muted: boolean },
    @Request() req: any,
  ) {
    const member = await this.channelService.muteMember(
      this.getRequestUserId(req),
      channelId,
      userId,
    );
    return { member };
  }

  @Get(':channelId/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List members of a channel' })
  async listMembers(
    @Param('channelId') channelId: string,
    @Request() req: any,
  ) {
    const members = await this.channelService.listMembers(
      channelId,
      this.getRequestUserId(req),
    );
    return { members };
  }

  @Patch(':channelId/me/notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my notification preferences for a channel' })
  async updateMyNotifications(
    @Param('channelId') channelId: string,
    @Body() body: { level: string },
    @Request() req: any,
  ) {
    const member = await this.channelService.updateMemberNotificationPreference(
      this.getRequestUserId(req),
      channelId,
      body.level as 'all' | 'mentions' | 'none',
    );
    return { member };
  }

  // ── Messages ─────────────────────────────────────────────────────────

  @Get(':channelId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List messages in a channel (cursor-based)' })
  async listMessages(
    @Param('channelId') channelId: string,
    @Query('cursor') cursor: string,
    @Query('limit') limit: number,
    @Request() req: any,
  ) {
    return this.channelService.listMessages(
      channelId,
      this.getRequestUserId(req),
      cursor,
      Number(limit) || 30,
    );
  }

  @Post(':channelId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a message in a channel' })
  @Throttle({ default: { ttl: 60, limit: 30 } } as any)
  async sendMessage(
    @Param('channelId') channelId: string,
    @Body() dto: SendChannelMessageDto,
    @Request() req: any,
  ) {
    const message = await this.channelService.sendMessage(
      channelId,
      this.getRequestUserId(req),
      dto,
    );
    return { message };
  }

  @Post(':channelId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload an attachment and send it as a message in a channel',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const extension = extname(file.originalname).toLowerCase();
          let folder = 'uploads/document';

          if (
            ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(
              extension,
            )
          ) {
            folder = 'uploads/image';
          } else if (
            ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(
              extension,
            )
          ) {
            folder = 'uploads/video';
          } else if (
            ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(
              extension,
            )
          ) {
            folder = 'uploads/document';
          } else if (
            ['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)
          ) {
            folder = 'uploads/audio';
          }

          cb(null, folder);
        },
        filename: (req, file, cb) => {
          const extension = extname(file.originalname);
          const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 100 * 1024 * 1024,
      },
    }),
  )
  async uploadAttachment(
    @Param('channelId') channelId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      return { message: 'No file provided' };
    }

    const processed = await this.uploadService.processUploadedFile(
      file,
      file.filename,
      {
        userId: req.user._id || req.user.userId,
        purpose: MediaPurpose.GENERIC,
        entityType: 'channel',
        entityId: channelId,
      },
    );

    const attachmentType: 'image' | 'file' | 'video' =
      processed.type === FileType.IMAGE
        ? 'image'
        : processed.type === FileType.VIDEO
          ? 'video'
          : 'file';

    const message = await this.channelService.uploadAttachment(
      this.getRequestUserId(req),
      channelId,
      {
        url: processed.url,
        type: attachmentType,
        size: processed.size,
        name: file.originalname,
        mimeType: file.mimetype,
      },
    );

    return { message };
  }

  @Patch(':channelId/messages/:messageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a channel message' })
  async editMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: { text: string },
    @Request() req: any,
  ) {
    const message = await this.channelService.editMessage(
      channelId,
      messageId,
      this.getRequestUserId(req),
      body.text,
    );
    return { message };
  }

  @Delete(':channelId/messages/:messageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a channel message' })
  async deleteMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ) {
    await this.channelService.deleteMessage(
      channelId,
      messageId,
      this.getRequestUserId(req),
    );
    return { success: true };
  }

  @Patch(':channelId/messages/:messageId/pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin a message in a channel' })
  async pinMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ) {
    const message = await this.channelService.pinMessage(
      channelId,
      messageId,
      this.getRequestUserId(req),
    );
    return { message };
  }

  @Delete(':channelId/messages/:messageId/pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpin a message in a channel' })
  async unpinMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ) {
    const message = await this.channelService.unpinMessage(
      channelId,
      messageId,
      this.getRequestUserId(req),
    );
    return { message };
  }

  @Get(':channelId/messages/pinned')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pinned messages in a channel' })
  async listPinnedMessages(
    @Param('channelId') channelId: string,
    @Request() req: any,
  ) {
    const messages = await this.channelService.listPinnedMessages(
      channelId,
      this.getRequestUserId(req),
    );
    return { messages };
  }

  @Post(':channelId/messages/:messageId/reactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add or toggle a reaction on a message' })
  async addReaction(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: AddReactionDto,
    @Request() req: any,
  ) {
    const message = await this.channelService.addReaction(
      channelId,
      messageId,
      this.getRequestUserId(req),
      dto.emoji,
    );
    return { message };
  }

  @Get(':channelId/messages/:messageId/thread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List thread replies for a message' })
  async listThreadReplies(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ) {
    const messages = await this.channelService.listThreadReplies(
      channelId,
      messageId,
      this.getRequestUserId(req),
    );
    return { messages };
  }

  @Post(':channelId/messages/:messageId/thread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a reply in a message thread' })
  async sendThreadReply(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: SendChannelMessageDto,
    @Request() req: any,
  ) {
    const message = await this.channelService.sendMessage(
      channelId,
      this.getRequestUserId(req),
      {
        ...dto,
        parentMessageId: messageId,
      },
    );
    return { message };
  }

  @Patch(':channelId/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a channel as read' })
  async markAsRead(@Param('channelId') channelId: string, @Request() req: any) {
    await this.channelService.markChannelAsRead(
      this.getRequestUserId(req),
      channelId,
    );
    return { success: true };
  }

  @Get('community/:communityId/unread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get unread message counts for all channels in a community',
  })
  async getUnreadCounts(
    @Param('communityId') communityId: string,
    @Request() req: any,
  ) {
    const unread = await this.channelService.getUnreadCounts(
      communityId,
      this.getRequestUserId(req),
    );
    return { unread };
  }

  @Get('community/:communityId/search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search messages across channels in a community' })
  async searchMessages(
    @Param('communityId') communityId: string,
    @Query('q') q: string,
    @Query('channelId') channelId: string,
    @Request() req: any,
  ) {
    const results = await this.channelService.searchMessages(
      communityId,
      this.getRequestUserId(req),
      q,
      channelId,
    );
    return { results };
  }
}
