import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Channel, ChannelDocument } from '../schema/channel.schema';
import {
  ChannelMessage,
  ChannelMessageDocument,
} from '../schema/channel-message.schema';
import {
  ChannelMember,
  ChannelMemberDocument,
} from '../schema/channel-member.schema';
import {
  ChannelReadCursor,
  ChannelReadCursorDocument,
} from '../schema/channel-read-cursor.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User } from '../schema/user.schema';

import { ChannelGateway } from './channel.gateway';
import { CommunityAccessService } from '../community-access/community-access.service';
import { NotificationService } from '../notification/notification.service';
import {
  CommunityRole,
  CommunityPermission,
  ROLE_HIERARCHY,
} from '../common/permissions/community-roles.constants';
import { NotificationType } from '../notification/notification-types';

import { CreateChannelDto } from '../dto-channel/create-channel.dto';
import { UpdateChannelDto } from '../dto-channel/update-channel.dto';
import { SendChannelMessageDto } from '../dto-channel/send-channel-message.dto';

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(
    @InjectModel(Channel.name)
    private channelModel: Model<ChannelDocument>,
    @InjectModel(ChannelMessage.name)
    private messageModel: Model<ChannelMessageDocument>,
    @InjectModel(ChannelMember.name)
    private memberModel: Model<ChannelMemberDocument>,
    @InjectModel(ChannelReadCursor.name)
    private cursorModel: Model<ChannelReadCursorDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel('User') private userModel: Model<User>,

    private readonly communityAccessService: CommunityAccessService,
    private readonly channelGateway: ChannelGateway,
    private readonly notificationService: NotificationService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate a URL-safe slug from a channel name.
   */
  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'channel'
    );
  }

  /**
   * Ensure the slug is unique within the community; append a counter if needed.
   */
  private async ensureUniqueSlug(
    communityId: string,
    baseSlug: string,
    excludeChannelId?: string,
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    const communityOid = new Types.ObjectId(communityId);

    while (true) {
      const query: any = { communityId: communityOid, slug };
      if (excludeChannelId) {
        query._id = { $ne: new Types.ObjectId(excludeChannelId) };
      }
      const exists = await this.channelModel.exists(query);
      if (!exists) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }

  /**
   * Assert the user has access to a channel.
   *
   * - NONE role → throw
   * - PRIVATE channel → must be ChannelMember or OWNER/ADMIN
   * - Archived channels are readable but the caller should check sendability separately
   */
  private async assertChannelAccess(
    userId: string,
    channel: ChannelDocument,
  ): Promise<CommunityRole> {
    const role = await this.communityAccessService.getCommunityRole(
      channel.communityId.toString(),
      userId,
    );

    if (role === CommunityRole.NONE) {
      throw new ForbiddenException('You are not a member of this community');
    }

    if (channel.visibility === 'PRIVATE') {
      const isPrivileged =
        role === CommunityRole.OWNER || role === CommunityRole.ADMIN;

      if (!isPrivileged) {
        const membership = await this.memberModel.exists({
          channelId: channel._id,
          userId: new Types.ObjectId(userId),
        });
        if (!membership) {
          throw new ForbiddenException(
            'You do not have access to this private channel',
          );
        }
      }
    }

    return role;
  }

  /**
   * Assert the user can send messages in a channel.
   */
  private async assertCanSend(
    userId: string,
    channel: ChannelDocument,
    role: CommunityRole,
  ): Promise<void> {
    if (channel.isArchived) {
      throw new ForbiddenException(
        'Cannot send messages in an archived channel',
      );
    }

    // ANNOUNCEMENTS channels are restricted to ADMIN+
    if (channel.type === 'ANNOUNCEMENTS') {
      if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[CommunityRole.ADMIN]) {
        throw new ForbiddenException(
          'Only admins and above can post in announcement channels',
        );
      }
    }

    // allowedRoles gate (if the array is non-empty, the user's role must be listed)
    if (channel.allowedRoles && channel.allowedRoles.length > 0) {
      if (!channel.allowedRoles.includes(role as string)) {
        throw new ForbiddenException(
          'Your role does not have permission to send messages in this channel',
        );
      }
    }

    // Muted member check
    const memberRecord = await this.memberModel
      .findOne({
        channelId: channel._id,
        userId: new Types.ObjectId(userId),
      })
      .lean();

    if (memberRecord?.isMuted) {
      throw new ForbiddenException('You are muted in this channel');
    }
  }

  /**
   * Parse @mentions out of a message text and resolve usernames to user IDs.
   */
  private async parseMentions(
    text: string,
    communityId: string,
  ): Promise<Types.ObjectId[]> {
    if (!text) return [];

    const mentionRegex = /@(\w+)/g;
    const usernames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      usernames.push(match[1].toLowerCase());
    }

    if (usernames.length === 0) return [];

    const users = await this.userModel
      .find({ username: { $in: usernames } })
      .select('_id')
      .lean();

    return users.map((u: any) => u._id as Types.ObjectId);
  }

  /**
   * Populate a message's senderId with user info.
   */
  private async populateMessage(msg: ChannelMessageDocument): Promise<any> {
    const populated = await this.messageModel.populate(msg, {
      path: 'senderId',
      select: 'name username photo_profil profile_picture',
    });
    return populated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. createChannel
  // ═══════════════════════════════════════════════════════════════════════

  async createChannel(creatorId: string, dto: CreateChannelDto) {
    const communityId = dto.communityId;

    await this.communityAccessService.assertPermission(
      communityId,
      creatorId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    const baseSlug = this.slugify(dto.name);
    const slug = await this.ensureUniqueSlug(communityId, baseSlug);

    // Determine position: max existing + 1
    const lastChannel = await this.channelModel
      .findOne(
        { communityId: new Types.ObjectId(communityId), isArchived: false },
        { position: 1 },
      )
      .sort({ position: -1 })
      .lean();

    const position = (lastChannel?.position ?? -1) + 1;

    const channel = await this.channelModel.create({
      communityId: new Types.ObjectId(communityId),
      name: dto.name,
      slug,
      description: dto.description || '',
      type: dto.type || 'TEXT',
      visibility: dto.visibility || 'PUBLIC',
      createdBy: new Types.ObjectId(creatorId),
      position,
      emoji: dto.emoji || '',
      allowedRoles: dto.allowedRoles || [],
    });

    // If private, add the creator as a member automatically
    if (channel.visibility === 'PRIVATE') {
      await this.memberModel.create({
        channelId: channel._id,
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(creatorId),
        role: 'moderator',
        addedBy: null,
      });
      await this.channelModel.updateOne(
        { _id: channel._id },
        { $set: { memberCount: 1 } },
      );
    }

    // System message
    await this.messageModel.create({
      channelId: channel._id,
      communityId: new Types.ObjectId(communityId),
      senderId: new Types.ObjectId(creatorId),
      text: 'Channel created',
      isSystem: true,
      systemEvent: 'channel_created',
    });

    this.channelGateway.emitChannelCreated(communityId, channel);

    return channel;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. listChannels
  // ═══════════════════════════════════════════════════════════════════════

  async listChannels(
    userId: string,
    communityId: string,
  ): Promise<{ channels: any[]; totalUnread: number }> {
    const role = await this.communityAccessService.getCommunityRole(
      communityId,
      userId,
    );
    if (role === CommunityRole.NONE) {
      throw new ForbiddenException('You are not a member of this community');
    }

    const channels = await this.channelModel
      .find({
        communityId: new Types.ObjectId(communityId),
        isArchived: false,
      })
      .sort({ position: 1, createdAt: 1 })
      .lean();

    // For non-privileged users, filter out PRIVATE channels they are not members of
    let visibleChannels = channels;
    const isPrivileged =
      role === CommunityRole.OWNER || role === CommunityRole.ADMIN;

    if (!isPrivileged) {
      const privateChannelIds = channels
        .filter((c) => c.visibility === 'PRIVATE')
        .map((c) => c._id);

      let memberChannelIds = new Set<string>();
      if (privateChannelIds.length > 0) {
        const memberships = await this.memberModel
          .find({
            channelId: { $in: privateChannelIds },
            userId: new Types.ObjectId(userId),
          })
          .select('channelId')
          .lean();
        memberChannelIds = new Set(
          memberships.map((m) => m.channelId.toString()),
        );
      }

      visibleChannels = channels.filter((c) => {
        if (c.visibility !== 'PRIVATE') return true;
        return memberChannelIds.has(c._id.toString());
      });
    }

    // Batch-fetch read cursors for unread counts
    const channelIds = visibleChannels.map((c) => c._id);
    const cursors = await this.cursorModel
      .find({
        channelId: { $in: channelIds },
        userId: new Types.ObjectId(userId),
      })
      .lean();

    const cursorMap = new Map<string, number>();
    for (const cursor of cursors) {
      cursorMap.set(cursor.channelId.toString(), cursor.unreadCount);
    }

    let totalUnread = 0;
    const enriched = visibleChannels.map((ch) => {
      const unreadCount = cursorMap.get(ch._id.toString()) ?? 0;
      totalUnread += unreadCount;
      return { ...ch, unreadCount };
    });

    return { channels: enriched, totalUnread };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. getChannel
  // ═══════════════════════════════════════════════════════════════════════

  async getChannel(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.assertChannelAccess(userId, channel);
    return channel;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. updateChannel
  // ═══════════════════════════════════════════════════════════════════════

  async updateChannel(
    editorId: string,
    channelId: string,
    dto: UpdateChannelDto,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      editorId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    const updateData: any = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
      const baseSlug = this.slugify(dto.name);
      updateData.slug = await this.ensureUniqueSlug(
        channel.communityId.toString(),
        baseSlug,
        channelId,
      );
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.visibility !== undefined) updateData.visibility = dto.visibility;
    if (dto.emoji !== undefined) updateData.emoji = dto.emoji;
    if (dto.allowedRoles !== undefined)
      updateData.allowedRoles = dto.allowedRoles;
    if (dto.isPinned !== undefined) updateData.isPinned = dto.isPinned;

    const updated = await this.channelModel.findByIdAndUpdate(
      channelId,
      { $set: updateData },
      { new: true },
    );

    this.channelGateway.emitChannelUpdated(
      channel.communityId.toString(),
      updated,
    );

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. deleteChannel (soft-delete via isArchived)
  // ═══════════════════════════════════════════════════════════════════════

  async deleteChannel(deleterId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      deleterId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    await this.channelModel.updateOne(
      { _id: channel._id },
      { $set: { isArchived: true } },
    );

    this.channelGateway.emitChannelDeleted(
      channel.communityId.toString(),
      channelId,
    );

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. reorderChannels
  // ═══════════════════════════════════════════════════════════════════════

  async reorderChannels(
    ownerId: string,
    communityId: string,
    orderedIds: string[],
  ) {
    await this.communityAccessService.assertPermission(
      communityId,
      ownerId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(id),
          communityId: new Types.ObjectId(communityId),
        },
        update: { $set: { position: index } },
      },
    }));

    if (bulkOps.length > 0) {
      await this.channelModel.bulkWrite(bulkOps);
    }

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. createAutoChannel (for COURSE_CHAT / EVENT_CHAT)
  // ═══════════════════════════════════════════════════════════════════════

  async createAutoChannel(
    communityId: string,
    linkedId: string,
    type: 'COURSE_CHAT' | 'EVENT_CHAT',
    createdById: string,
    name?: string,
  ) {
    const channelName =
      name || (type === 'COURSE_CHAT' ? 'Course Chat' : 'Event Chat');
    const baseSlug = this.slugify(channelName);
    const slug = await this.ensureUniqueSlug(communityId, baseSlug);

    const lastChannel = await this.channelModel
      .findOne(
        { communityId: new Types.ObjectId(communityId), isArchived: false },
        { position: 1 },
      )
      .sort({ position: -1 })
      .lean();

    const position = (lastChannel?.position ?? -1) + 1;

    const channelData: any = {
      communityId: new Types.ObjectId(communityId),
      name: channelName,
      slug,
      type,
      visibility: 'PUBLIC',
      createdBy: new Types.ObjectId(createdById),
      position,
    };

    if (type === 'COURSE_CHAT') {
      channelData.linkedCourseId = new Types.ObjectId(linkedId);
    } else {
      channelData.linkedEventId = new Types.ObjectId(linkedId);
    }

    const channel = await this.channelModel.create(channelData);

    // System message
    await this.messageModel.create({
      channelId: channel._id,
      communityId: new Types.ObjectId(communityId),
      senderId: new Types.ObjectId(createdById),
      text: `${type === 'COURSE_CHAT' ? 'Course' : 'Event'} chat channel created`,
      isSystem: true,
      systemEvent: 'channel_created',
    });

    this.channelGateway.emitChannelCreated(communityId, channel);
    return channel;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8. addMembersToPrivateChannel
  // ═══════════════════════════════════════════════════════════════════════

  async addMembersToPrivateChannel(
    adminId: string,
    channelId: string,
    userIds: string[],
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      adminId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    const communityId = channel.communityId.toString();
    const community = await this.communityModel
      .findById(communityId)
      .select('members')
      .lean();
    if (!community) throw new NotFoundException('Community not found');

    const communityMemberSet = new Set(
      (community.members || []).map((m: any) => m.toString()),
    );

    const validUserIds = userIds.filter((uid) => communityMemberSet.has(uid));

    if (validUserIds.length === 0) {
      throw new BadRequestException(
        'None of the provided users are community members',
      );
    }

    const bulkOps = validUserIds.map((uid) => ({
      updateOne: {
        filter: {
          channelId: channel._id,
          userId: new Types.ObjectId(uid),
        },
        update: {
          $setOnInsert: {
            channelId: channel._id,
            communityId: new Types.ObjectId(communityId),
            userId: new Types.ObjectId(uid),
            role: 'member' as const,
            addedBy: new Types.ObjectId(adminId),
          },
        },
        upsert: true,
      },
    }));

    await this.memberModel.bulkWrite(bulkOps);

    // Update member count
    const memberCount = await this.memberModel.countDocuments({
      channelId: channel._id,
    });
    await this.channelModel.updateOne(
      { _id: channel._id },
      { $set: { memberCount } },
    );

    // System messages for each added user
    const users = await this.userModel
      .find({ _id: { $in: validUserIds.map((id) => new Types.ObjectId(id)) } })
      .select('name username')
      .lean();

    const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

    const systemMessages = validUserIds.map((uid) => {
      const user = userMap.get(uid) as any;
      const displayName = user?.username || user?.name || 'A user';
      return {
        channelId: channel._id,
        communityId: new Types.ObjectId(communityId),
        senderId: new Types.ObjectId(adminId),
        text: `${displayName} was added to the channel`,
        isSystem: true,
        systemEvent: 'member_added',
      };
    });

    if (systemMessages.length > 0) {
      await this.messageModel.insertMany(systemMessages);
    }

    return { added: validUserIds.length, memberCount };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 9. removeMemberFromChannel
  // ═══════════════════════════════════════════════════════════════════════

  async removeMemberFromChannel(
    adminId: string,
    channelId: string,
    targetUserId: string,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      adminId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    await this.memberModel.deleteOne({
      channelId: channel._id,
      userId: new Types.ObjectId(targetUserId),
    });

    const memberCount = await this.memberModel.countDocuments({
      channelId: channel._id,
    });
    await this.channelModel.updateOne(
      { _id: channel._id },
      { $set: { memberCount } },
    );

    // System message
    const targetUser = (await this.userModel
      .findById(targetUserId)
      .select('name username')
      .lean()) as any;
    const displayName = targetUser?.username || targetUser?.name || 'A user';

    await this.messageModel.create({
      channelId: channel._id,
      communityId: channel.communityId,
      senderId: new Types.ObjectId(adminId),
      text: `${displayName} was removed from the channel`,
      isSystem: true,
      systemEvent: 'member_removed',
    });

    return { success: true, memberCount };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10. setChannelMemberRole
  // ═══════════════════════════════════════════════════════════════════════

  async setChannelMemberRole(
    adminId: string,
    channelId: string,
    targetUserId: string,
    role: 'member' | 'moderator',
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      adminId,
      CommunityPermission.CHANNELS_MANAGE,
    );

    const updated = await this.memberModel.findOneAndUpdate(
      {
        channelId: channel._id,
        userId: new Types.ObjectId(targetUserId),
      },
      { $set: { role } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Member not found in this channel');
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 11. updateMemberNotificationPreference
  // ═══════════════════════════════════════════════════════════════════════

  async updateMemberNotificationPreference(
    userId: string,
    channelId: string,
    level: 'all' | 'mentions' | 'none',
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    const updated = await this.memberModel.findOneAndUpdate(
      {
        channelId: channel._id,
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { notificationLevel: level },
        $setOnInsert: {
          channelId: channel._id,
          communityId: channel.communityId,
          userId: new Types.ObjectId(userId),
          role: 'member' as const,
        },
      },
      { upsert: true, new: true },
    );

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 12. muteMember
  // ═══════════════════════════════════════════════════════════════════════

  async muteMember(adminId: string, channelId: string, targetUserId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      adminId,
      CommunityPermission.CHANNELS_MODERATE,
    );

    const updated = await this.memberModel.findOneAndUpdate(
      {
        channelId: channel._id,
        userId: new Types.ObjectId(targetUserId),
      },
      { $set: { isMuted: true } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Member not found in this channel');
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 13. listMembers
  // ═══════════════════════════════════════════════════════════════════════

  async listMembers(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.assertChannelAccess(userId, channel);

    const members = await this.memberModel
      .find({ channelId: channel._id })
      .populate('userId', 'name username photo_profil profile_picture email')
      .sort({ createdAt: 1 })
      .lean();

    return members;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 14. sendMessage
  // ═══════════════════════════════════════════════════════════════════════

  async sendMessage(
    senderId: string,
    channelId: string,
    dto: SendChannelMessageDto,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    const role = await this.assertChannelAccess(senderId, channel);
    await this.assertCanSend(senderId, channel, role);

    const communityId = channel.communityId.toString();

    // Parse @mentions
    const mentionIds = await this.parseMentions(dto.text || '', communityId);

    // Build message document
    const messageData: any = {
      channelId: channel._id,
      communityId: channel.communityId,
      senderId: new Types.ObjectId(senderId),
      text: dto.text || '',
      mentions: mentionIds,
    };

    if (dto.parentMessageId) {
      messageData.parentMessageId = new Types.ObjectId(dto.parentMessageId);
    }

    const message = await this.messageModel.create(messageData);

    // Update channel metadata
    const preview = (dto.text || '').substring(0, 100);
    await this.channelModel.updateOne(
      { _id: channel._id },
      {
        $set: {
          lastMessageAt: message.get('createdAt') || new Date(),
          lastMessagePreview: preview,
        },
        $inc: { messageCount: 1 },
      },
    );

    // If reply, increment parent replyCount
    if (dto.parentMessageId) {
      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(dto.parentMessageId) },
        { $inc: { replyCount: 1 } },
      );
    }

    // Increment unread count for all other users who have a cursor for this channel
    await this.cursorModel.updateMany(
      {
        channelId: channel._id,
        userId: { $ne: new Types.ObjectId(senderId) },
      },
      { $inc: { unreadCount: 1 } },
    );

    // Populate and emit
    const populated = await this.populateMessage(message);
    this.channelGateway.emitNewMessage(channelId, populated);

    // Fire notifications for mentions
    if (mentionIds.length > 0) {
      for (const mentionedUserId of mentionIds) {
        const mentionUid = mentionedUserId.toString();
        if (mentionUid === senderId) continue;

        this.notificationService
          .createNotification({
            recipient: mentionUid,
            sender: senderId,
            type: NotificationType.CHANNEL_MENTION,
            title: 'You were mentioned',
            body: preview,
            data: {
              communityId,
              channelId,
              messageId: message._id.toString(),
            },
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to send mention notification: ${err?.message}`,
            );
          });
      }
    }

    // Fire reply notification
    if (dto.parentMessageId) {
      const parentMsg = await this.messageModel
        .findById(dto.parentMessageId)
        .select('senderId')
        .lean();

      if (parentMsg && parentMsg.senderId.toString() !== senderId) {
        this.notificationService
          .createNotification({
            recipient: parentMsg.senderId.toString(),
            sender: senderId,
            type: NotificationType.CHANNEL_REPLY,
            title: 'New reply to your message',
            body: preview,
            data: {
              communityId,
              channelId,
              messageId: message._id.toString(),
              parentMessageId: dto.parentMessageId,
            },
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to send reply notification: ${err?.message}`,
            );
          });
      }
    }

    return populated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 15. listMessages (cursor-based pagination)
  // ═══════════════════════════════════════════════════════════════════════

  async listMessages(
    userId: string,
    channelId: string,
    cursor?: string,
    limit = 50,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.assertChannelAccess(userId, channel);

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const query: any = {
      channelId: channel._id,
      parentMessageId: null,
      isModeratorDeleted: { $ne: true },
    };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit + 1)
      .populate('senderId', 'name username photo_profil profile_picture')
      .lean();

    const hasMore = messages.length > safeLimit;
    const sliced = hasMore ? messages.slice(0, safeLimit) : messages;

    const nextCursor =
      hasMore && sliced.length > 0
        ? (sliced[sliced.length - 1] as any).createdAt?.toISOString()
        : null;

    return {
      messages: sliced,
      nextCursor,
      hasMore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 16. listThreadReplies
  // ═══════════════════════════════════════════════════════════════════════

  async listThreadReplies(
    userId: string,
    channelId: string,
    parentMessageId: string,
    cursor?: string,
    limit = 50,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.assertChannelAccess(userId, channel);

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const query: any = {
      channelId: channel._id,
      parentMessageId: new Types.ObjectId(parentMessageId),
      isModeratorDeleted: { $ne: true },
    };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit + 1)
      .populate('senderId', 'name username photo_profil profile_picture')
      .lean();

    const hasMore = messages.length > safeLimit;
    const sliced = hasMore ? messages.slice(0, safeLimit) : messages;

    const nextCursor =
      hasMore && sliced.length > 0
        ? (sliced[sliced.length - 1] as any).createdAt?.toISOString()
        : null;

    return {
      messages: sliced,
      nextCursor,
      hasMore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 17. editMessage
  // ═══════════════════════════════════════════════════════════════════════

  async editMessage(
    editorId: string,
    channelId: string,
    messageId: string,
    newText: string,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    const message = await this.messageModel.findOne({
      _id: new Types.ObjectId(messageId),
      channelId: channel._id,
    });
    if (!message) throw new NotFoundException('Message not found');

    const isOwner = message.senderId.toString() === editorId;

    if (!isOwner) {
      // Must have CHANNELS_MODERATE permission
      await this.communityAccessService.assertPermission(
        channel.communityId.toString(),
        editorId,
        CommunityPermission.CHANNELS_MODERATE,
      );
    }

    message.text = newText;
    message.editedAt = new Date();
    await message.save();

    const populated = await this.populateMessage(message);
    this.channelGateway.emitMessageEdited(channelId, populated);

    return populated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 18. deleteMessage
  // ═══════════════════════════════════════════════════════════════════════

  async deleteMessage(deleterId: string, channelId: string, messageId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    const message = await this.messageModel.findOne({
      _id: new Types.ObjectId(messageId),
      channelId: channel._id,
    });
    if (!message) throw new NotFoundException('Message not found');

    const isOwn = message.senderId.toString() === deleterId;

    if (isOwn) {
      // Soft delete for the user themselves
      await this.messageModel.updateOne(
        { _id: message._id },
        { $addToSet: { deletedFor: new Types.ObjectId(deleterId) } },
      );
    } else {
      // Must be a moderator+ — do a moderator delete
      await this.communityAccessService.assertPermission(
        channel.communityId.toString(),
        deleterId,
        CommunityPermission.CHANNELS_MODERATE,
      );

      await this.messageModel.updateOne(
        { _id: message._id },
        {
          $set: {
            isModeratorDeleted: true,
            text: '',
            attachments: [],
          },
        },
      );
    }

    this.channelGateway.emitMessageDeleted(channelId, messageId, deleterId);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 19. pinMessage
  // ═══════════════════════════════════════════════════════════════════════

  async pinMessage(adminId: string, channelId: string, messageId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      adminId,
      CommunityPermission.CHANNELS_MODERATE,
    );

    // Check max 5 pinned messages per channel
    const pinnedCount = await this.messageModel.countDocuments({
      channelId: channel._id,
      isPinned: true,
    });

    if (pinnedCount >= 5) {
      throw new BadRequestException(
        'Maximum of 5 pinned messages per channel reached',
      );
    }

    const message = await this.messageModel.findOneAndUpdate(
      { _id: new Types.ObjectId(messageId), channelId: channel._id },
      { $set: { isPinned: true } },
      { new: true },
    );

    if (!message) throw new NotFoundException('Message not found');

    const populated = await this.populateMessage(message);
    this.channelGateway.emitPinnedMessage(channelId, populated);

    return populated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 20. unpinMessage
  // ═══════════════════════════════════════════════════════════════════════

  async unpinMessage(adminId: string, channelId: string, messageId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.communityAccessService.assertPermission(
      channel.communityId.toString(),
      adminId,
      CommunityPermission.CHANNELS_MODERATE,
    );

    const message = await this.messageModel.findOneAndUpdate(
      { _id: new Types.ObjectId(messageId), channelId: channel._id },
      { $set: { isPinned: false } },
      { new: true },
    );

    if (!message) throw new NotFoundException('Message not found');

    return message;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 21. listPinnedMessages
  // ═══════════════════════════════════════════════════════════════════════

  async listPinnedMessages(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.assertChannelAccess(userId, channel);

    const pinned = await this.messageModel
      .find({
        channelId: channel._id,
        isPinned: true,
        isModeratorDeleted: { $ne: true },
      })
      .populate('senderId', 'name username photo_profil profile_picture')
      .sort({ createdAt: -1 })
      .lean();

    return pinned;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 22. addReaction (toggle semantics)
  // ═══════════════════════════════════════════════════════════════════════

  async addReaction(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.assertChannelAccess(userId, channel);

    const userOid = new Types.ObjectId(userId);
    const msgOid = new Types.ObjectId(messageId);

    // Check if user already reacted with this emoji
    const existingReaction = await this.messageModel.findOne({
      _id: msgOid,
      channelId: channel._id,
      'reactions.emoji': emoji,
      'reactions.userIds': userOid,
    });

    if (existingReaction) {
      // Remove the user from this reaction
      await this.messageModel.updateOne(
        { _id: msgOid, 'reactions.emoji': emoji },
        { $pull: { 'reactions.$.userIds': userOid } },
      );

      // Clean up empty reaction entries
      await this.messageModel.updateOne(
        { _id: msgOid },
        { $pull: { reactions: { emoji, userIds: { $size: 0 } } } },
      );
    } else {
      // Check if this emoji already exists in the reactions array
      const hasEmoji = await this.messageModel.exists({
        _id: msgOid,
        'reactions.emoji': emoji,
      });

      if (hasEmoji) {
        // Add user to existing emoji reaction
        await this.messageModel.updateOne(
          { _id: msgOid, 'reactions.emoji': emoji },
          { $addToSet: { 'reactions.$.userIds': userOid } },
        );
      } else {
        // Create new reaction entry
        await this.messageModel.updateOne(
          { _id: msgOid },
          {
            $push: {
              reactions: { emoji, userIds: [userOid] },
            },
          },
        );
      }
    }

    // Fetch updated reactions and emit
    const updated = await this.messageModel
      .findById(msgOid)
      .select('reactions')
      .lean();

    const reactions = updated?.reactions || [];
    this.channelGateway.emitReactionUpdate(channelId, messageId, reactions);

    return reactions;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 23. markChannelAsRead
  // ═══════════════════════════════════════════════════════════════════════

  async markChannelAsRead(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    // Find the latest message to record as lastReadMessageId
    const latestMessage = await this.messageModel
      .findOne({ channelId: channel._id })
      .sort({ createdAt: -1 })
      .select('_id')
      .lean();

    await this.cursorModel.findOneAndUpdate(
      {
        channelId: channel._id,
        userId: new Types.ObjectId(userId),
      },
      {
        $set: {
          lastReadAt: new Date(),
          unreadCount: 0,
          ...(latestMessage ? { lastReadMessageId: latestMessage._id } : {}),
        },
        $setOnInsert: {
          channelId: channel._id,
          userId: new Types.ObjectId(userId),
        },
      },
      { upsert: true, new: true },
    );

    this.channelGateway.emitUnreadCountUpdate(userId, channelId, 0);

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 24. getUnreadCounts
  // ═══════════════════════════════════════════════════════════════════════

  async getUnreadCounts(userId: string, communityId: string) {
    const role = await this.communityAccessService.getCommunityRole(
      communityId,
      userId,
    );
    if (role === CommunityRole.NONE) {
      throw new ForbiddenException('You are not a member of this community');
    }

    // Get all channel IDs in this community
    const channels = await this.channelModel
      .find({
        communityId: new Types.ObjectId(communityId),
        isArchived: false,
      })
      .select('_id')
      .lean();

    const channelIds = channels.map((c) => c._id);

    const cursors = await this.cursorModel
      .find({
        channelId: { $in: channelIds },
        userId: new Types.ObjectId(userId),
      })
      .lean();

    const unreadMap: Record<string, number> = {};
    let totalUnread = 0;

    for (const cursor of cursors) {
      const count = cursor.unreadCount || 0;
      unreadMap[cursor.channelId.toString()] = count;
      totalUnread += count;
    }

    return { unreadMap, totalUnread };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 25. searchMessages
  // ═══════════════════════════════════════════════════════════════════════

  async searchMessages(
    userId: string,
    communityId: string,
    query: string,
    channelId?: string,
  ) {
    const role = await this.communityAccessService.getCommunityRole(
      communityId,
      userId,
    );
    if (role === CommunityRole.NONE) {
      throw new ForbiddenException('You are not a member of this community');
    }

    if (!query || query.trim().length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }

    const filter: any = {
      communityId: new Types.ObjectId(communityId),
      isModeratorDeleted: { $ne: true },
      $text: { $search: query },
    };

    if (channelId) {
      filter.channelId = new Types.ObjectId(channelId);
    }

    const messages = await this.messageModel
      .find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(50)
      .populate('senderId', 'name username photo_profil profile_picture')
      .populate('channelId', 'name slug emoji')
      .lean();

    return messages;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 28. uploadAttachment
  // ═══════════════════════════════════════════════════════════════════════

  async uploadAttachment(
    senderId: string,
    channelId: string,
    file: {
      url: string;
      type: string;
      size: number;
      name: string;
      mimeType: string;
    },
  ) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    const role = await this.assertChannelAccess(senderId, channel);
    await this.assertCanSend(senderId, channel, role);

    const communityId = channel.communityId.toString();

    const message = await this.messageModel.create({
      channelId: channel._id,
      communityId: channel.communityId,
      senderId: new Types.ObjectId(senderId),
      text: '',
      attachments: [
        {
          url: file.url,
          type: file.type,
          size: file.size,
          name: file.name,
          mimeType: file.mimeType,
        },
      ],
    });

    // Update channel metadata
    await this.channelModel.updateOne(
      { _id: channel._id },
      {
        $set: {
          lastMessageAt: message.get('createdAt') || new Date(),
          lastMessagePreview: `📎 ${file.name}`,
        },
        $inc: { messageCount: 1 },
      },
    );

    // Increment unread count for other users
    await this.cursorModel.updateMany(
      {
        channelId: channel._id,
        userId: { $ne: new Types.ObjectId(senderId) },
      },
      { $inc: { unreadCount: 1 } },
    );

    const populated = await this.populateMessage(message);
    this.channelGateway.emitNewMessage(channelId, populated);

    return populated;
  }
}
