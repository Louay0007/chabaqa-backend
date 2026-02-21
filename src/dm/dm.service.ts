import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Conversation, ConversationDocument } from '../schema/conversation.schema';
import { Message, MessageDocument } from '../schema/message.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User } from '../schema/user.schema';
import { Admin, AdminDocument } from '../schema/admin.schema';
import { Session } from '../schema/session.schema';
import { PolicyService } from '../common/services/policy.service';
import { DmGateway } from './dm.gateway';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class DmService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel('User') private userModel: Model<User>,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(Session.name) private sessionModel: Model<any>,

    private readonly policyService: PolicyService,
    private readonly dmGateway: DmGateway,
    private readonly notificationService: NotificationService,
  ) { }

  async startCommunityConversation(userId: string, communityId: string): Promise<ConversationDocument> {
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new NotFoundException('Communauté introuvable');

    const uid = new Types.ObjectId(userId);
    const isMember = community.isMember(uid);
    if (!isMember) throw new ForbiddenException('Vous devez être membre de cette communauté');

    const creatorId = community.createur;
    // Prevent starting a community DM with yourself if you are the creator
    if (uid.equals(creatorId)) {
      throw new BadRequestException('Vous ne pouvez pas démarrer une conversation avec vous-même');
    }

    const existing = await this.conversationModel.findOne({
      type: 'COMMUNITY_DM',
      participantA: uid,
      participantB: creatorId,
      communityId: community._id,
    });
    if (existing) return existing;

    try {
      const conv = await this.conversationModel.create({
        type: 'COMMUNITY_DM',
        participantA: uid,
        participantB: creatorId,
        communityId: community._id,
        isOpen: true,
        unreadCountA: 0,
        unreadCountB: 0,
      });

      const result = await this.conversationModel.findById(conv._id)
        .populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username')
        .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username')
        .populate('communityId', 'name slug logo');

      if (!result) throw new InternalServerErrorException('Error creating conversation');
      return result;
    } catch (err: any) {
      // Handle duplicate key error (race condition) — fetch existing conversation
      if (err?.code === 11000) {
        const dup = await this.conversationModel.findOne({
          type: 'COMMUNITY_DM',
          participantA: uid,
          participantB: creatorId,
          communityId: community._id,
        }).populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('communityId', 'name slug logo');
        if (dup) return dup;
      }
      throw err;
    }
  }

  async startPeerConversation(userId: string, targetUserId: string, communityId: string): Promise<ConversationDocument> {
    if (userId === targetUserId) {
      throw new BadRequestException('Vous ne pouvez pas démarrer une conversation avec vous-même');
    }

    const community = await this.communityModel.findById(communityId);
    if (!community) throw new NotFoundException('Communauté introuvable');

    const uid = new Types.ObjectId(userId);
    const targetUid = new Types.ObjectId(targetUserId);

    const isMemberA = community.isMember(uid);
    const isMemberB = community.isMember(targetUid);

    if (!isMemberA || !isMemberB) {
      throw new ForbiddenException('Les deux utilisateurs doivent être membres de la même communauté');
    }

    // Check if this is actually a message to the creator, if so, redirect to startCommunityConversation logic
    if (targetUid.equals(community.createur)) {
      return this.startCommunityConversation(userId, communityId);
    }

    // Normal peer-to-peer conversation
    const existing = await this.conversationModel.findOne({
      type: 'PEER_DM',
      communityId: community._id,
      $or: [
        { participantA: uid, participantB: targetUid },
        { participantA: targetUid, participantB: uid },
      ],
    }).populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username')
      .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username')
      .populate('communityId', 'name slug logo');

    if (existing) return existing;

    try {
      const conv = await this.conversationModel.create({
        type: 'PEER_DM',
        participantA: uid,
        participantB: targetUid,
        communityId: community._id,
        isOpen: true,
        unreadCountA: 0,
        unreadCountB: 0,
      });

      const result = await this.conversationModel.findById(conv._id)
        .populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username')
        .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username')
        .populate('communityId', 'name slug logo');

      if (!result) throw new InternalServerErrorException('Error creating conversation');
      return result;
    } catch (err: any) {
      // Handle duplicate key error (race condition) — fetch existing conversation
      if (err?.code === 11000) {
        const existing = await this.conversationModel.findOne({
          type: 'PEER_DM',
          communityId: community._id,
          $or: [
            { participantA: uid, participantB: targetUid },
            { participantA: targetUid, participantB: uid },
          ],
        }).populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username')
          .populate('communityId', 'name slug logo');
        if (existing) return existing;
      }
      throw err;
    }
  }

  async startHelpConversation(userId: string): Promise<ConversationDocument> {
    const existing = await this.conversationModel.findOne({
      type: 'HELP_DM',
      participantA: new Types.ObjectId(userId),
      isOpen: true,
    }).populate('participantB', 'name email photo_profil poste departement');

    if (existing) {
      // Auto-assign admin if not already assigned and send welcome message
      if (!existing.participantB) {
        await this.autoAssignAdminToHelp(existing._id.toString());
        const updatedConv = await this.conversationModel.findById(existing._id).populate('participantB', 'name email photo_profil poste departement');
        return updatedConv || existing;
      }
      return existing;
    }

    const conv = await this.conversationModel.create({
      type: 'HELP_DM',
      participantA: new Types.ObjectId(userId),
      isOpen: true,
      unreadCountA: 0,
      unreadCountB: 0,
    });

    // Auto-assign admin and send welcome message
    await this.autoAssignAdminToHelp(conv._id.toString());

    const finalConv = await this.conversationModel.findById(conv._id).populate('participantB', 'name email photo_profil poste departement');
    return finalConv || conv;
  }

  async startSessionConversation(userId: string, bookingId: string): Promise<ConversationDocument> {
    const normalizedBookingId = String(bookingId || '').trim();
    if (!normalizedBookingId) {
      throw new BadRequestException('Booking ID is required');
    }

    let uid: Types.ObjectId;
    try {
      uid = new Types.ObjectId(String(userId || ''));
    } catch {
      throw new ForbiddenException('Invalid user ID format');
    }
    const sessionDoc = await this.sessionModel
      .findOne({ 'bookings.id': normalizedBookingId })
      .select('id title duration creatorId communityId bookings')
      .exec();

    if (!sessionDoc) {
      throw new NotFoundException('Booking not found');
    }

    const booking = (sessionDoc.bookings || []).find((b: any) => String(b?.id) === normalizedBookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (String(booking.userId) !== uid.toString()) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (booking.status !== 'confirmed') {
      throw new BadRequestException('Temporary mentor chat is only available for confirmed bookings');
    }

    let mentorId: Types.ObjectId;
    try {
      mentorId = new Types.ObjectId(String(sessionDoc.creatorId || ''));
    } catch {
      throw new BadRequestException('Session creator is invalid');
    }
    if (uid.equals(mentorId)) {
      throw new BadRequestException('You cannot start a mentor chat with yourself');
    }

    const scheduledAt = new Date(booking.scheduledAt);
    const durationMinutes = Number(sessionDoc.duration || 60);
    const expiresAt = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

    const existing = await this.conversationModel
      .findOne({ type: 'SESSION_TEMP_DM', sessionBookingId: normalizedBookingId })
      .populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
      .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
      .populate('communityId', 'name slug logo')
      .exec();

    if (existing) {
      const normalizedExisting = await this.enforceSessionTempLifecycle(existing);
      if (!normalizedExisting.isOpen) {
        throw new ConflictException('This session chat is closed because the session has finished.');
      }
      return normalizedExisting;
    }

    if (new Date() >= expiresAt) {
      throw new ConflictException('This session chat is closed because the session has finished.');
    }

    const communityObjectId = Types.ObjectId.isValid(String(sessionDoc.communityId))
      ? new Types.ObjectId(String(sessionDoc.communityId))
      : undefined;

    const conv = await this.conversationModel.create({
      type: 'SESSION_TEMP_DM',
      participantA: uid,
      participantB: mentorId,
      communityId: communityObjectId,
      sessionId: String(sessionDoc.id || ''),
      sessionBookingId: normalizedBookingId,
      expiresAt,
      isOpen: true,
      unreadCountA: 0,
      unreadCountB: 0,
    });

    const result = await this.conversationModel.findById(conv._id)
      .populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
      .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
      .populate('communityId', 'name slug logo')
      .exec();

    if (!result) {
      throw new InternalServerErrorException('Error creating conversation');
    }
    return result;
  }

  private async enforceSessionTempLifecycle(conv: ConversationDocument): Promise<ConversationDocument> {
    if (!conv || conv.type !== 'SESSION_TEMP_DM') {
      return conv;
    }

    let shouldClose = false;
    let closeReason: 'session_finished' | 'booking_cancelled' | 'booking_completed' | 'manual' = 'manual';
    const now = new Date();

    const tryClose = (reason: 'session_finished' | 'booking_cancelled' | 'booking_completed' | 'manual') => {
      if (conv.isOpen) {
        shouldClose = true;
        closeReason = reason;
      }
    };

    if (conv.expiresAt && new Date(conv.expiresAt).getTime() <= now.getTime()) {
      tryClose('session_finished');
    }

    if (!shouldClose && conv.sessionBookingId) {
      const sessionDoc = await this.sessionModel
        .findOne({ 'bookings.id': conv.sessionBookingId })
        .select('duration bookings')
        .exec();

      if (!sessionDoc) {
        tryClose('manual');
      } else {
        const booking = (sessionDoc.bookings || []).find((b: any) => String(b?.id) === String(conv.sessionBookingId));
        if (!booking) {
          tryClose('manual');
        } else if (booking.status === 'cancelled') {
          tryClose('booking_cancelled');
        } else if (booking.status === 'completed') {
          tryClose('booking_completed');
        } else {
          const computedExpiry = new Date(new Date(booking.scheduledAt).getTime() + Number(sessionDoc.duration || 60) * 60 * 1000);
          if (!conv.expiresAt || new Date(conv.expiresAt).getTime() !== computedExpiry.getTime()) {
            conv.expiresAt = computedExpiry;
          }
          if (computedExpiry.getTime() <= now.getTime()) {
            tryClose('session_finished');
          }
        }
      }
    }

    if (shouldClose) {
      conv.isOpen = false;
      conv.closedAt = now;
      conv.closeReason = closeReason;
      await conv.save();
    } else if (conv.isModified()) {
      await conv.save();
    }

    return conv;
  }

  async listUnassignedHelpThreads() {
    const items = await this.conversationModel
      .find({ type: 'HELP_DM', $or: [{ participantB: { $exists: false } }, { participantB: null }] })
      .sort({ createdAt: 1 });
    return { items };
  }

  async listInbox(userId: string, type?: 'community' | 'help' | 'peer' | 'session', page = 1, limit = 20) {
    const filter: any = { $or: [{ participantA: new Types.ObjectId(userId) }, { participantB: new Types.ObjectId(userId) }] };
    if (type === 'community') filter.type = 'COMMUNITY_DM';
    if (type === 'help') filter.type = 'HELP_DM';
    if (type === 'peer') filter.type = 'PEER_DM';
    if (type === 'session') filter.type = 'SESSION_TEMP_DM';
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
        .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
        .populate('communityId', 'name slug logo')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit),
      this.conversationModel.countDocuments(filter),
    ]);
    const normalizedItems = await Promise.all(items.map((item) => this.enforceSessionTempLifecycle(item)));
    const totalPages = Math.ceil(total / limit);
    return {
      conversations: normalizedItems,
      page,
      total,
      totalPages,
      hasMore: page < totalPages,
      limit
    };
  }

  async listMessages(conversationId: string, userId: string, page = 1, limit = 30, options?: { isAdmin?: boolean }) {
    const conv = await this.conversationModel.findById(conversationId)
      .populate('participantA', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
      .populate('participantB', 'name firstName lastName email profile_picture photo_profil avatar photo username role');

    if (!conv) throw new NotFoundException('Conversation introuvable');
    await this.enforceSessionTempLifecycle(conv);

    // Convert userId to ObjectId for comparison
    let uid: Types.ObjectId;
    try {
      uid = new Types.ObjectId(userId);
    } catch (error) {
      console.error('❌ [DM] Invalid userId format:', userId);
      throw new ForbiddenException('Invalid user ID format');
    }

    // Check permissions: user must be participant or admin viewing help conversation
    const participantAId = (conv as any)?.participantA?._id ? (conv as any).participantA._id : (conv as any).participantA;
    const participantBId = (conv as any)?.participantB?._id ? (conv as any).participantB._id : (conv as any).participantB;

    const isParticipantA = participantAId ? uid.equals(participantAId) : false;
    const isParticipantB = participantBId ? uid.equals(participantBId) : false;
    const isParticipant = isParticipantA || isParticipantB;
    const isAdminViewingHelp = options?.isAdmin && conv.type === 'HELP_DM';

    if (!isParticipant && !isAdminViewingHelp) {
      throw new ForbiddenException('You do not have access to this conversation');
    }

    // Membership check for COMMUNITY_DM and PEER_DM
    if ((conv.type === 'COMMUNITY_DM' || conv.type === 'PEER_DM') && conv.communityId) {
      const community = await this.communityModel.findById(conv.communityId);
      if (!community || !community.isMember(uid)) {
        throw new ForbiddenException('Vous n\'êtes plus membre de cette communauté');
      }
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: conv._id })
        .populate('senderId', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
        .populate('recipientId', 'name firstName lastName email profile_picture photo_profil avatar photo username role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.messageModel.countDocuments({ conversationId: conv._id }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      messages: items.reverse(),
      conversation: conv,
      page,
      total,
      totalPages,
      hasMore: page < totalPages,
      limit
    };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    payload: { text?: string; attachments?: { url: string; type: 'image' | 'file' | 'video'; size: number }[] },
    options?: { isAdmin?: boolean }
  ) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation introuvable');
    await this.enforceSessionTempLifecycle(conv);
    const sid = new Types.ObjectId(senderId);
    const isParticipantA = sid.equals(conv.participantA);
    const isParticipantB = conv.participantB && sid.equals(conv.participantB);
    if (!isParticipantA && !isParticipantB) {
      // Special case: HELP_DM unassigned, allow admin to reply and auto-assign
      if (!(conv.type === 'HELP_DM' && !conv.participantB && options?.isAdmin)) {
        throw new ForbiddenException();
      }
      conv.participantB = sid; // auto-assign to this admin
    }

    // Membership check for COMMUNITY_DM and PEER_DM
    if ((conv.type === 'COMMUNITY_DM' || conv.type === 'PEER_DM') && conv.communityId) {
      const community = await this.communityModel.findById(conv.communityId);
      if (!community || !community.isMember(sid)) {
        throw new ForbiddenException('Vous n\'êtes plus membre de cette communauté');
      }
    }

    if (conv.type === 'SESSION_TEMP_DM' && !conv.isOpen) {
      throw new ForbiddenException('This session chat is closed');
    }

    if (!payload.text && (!payload.attachments || payload.attachments.length === 0)) {
      throw new BadRequestException('Message vide');
    }

    // Determine recipient
    const recipientId = sid.equals(conv.participantA) ? conv.participantB : conv.participantA;
    if (!recipientId) {
      // For HELP_DM: first admin assignment will be handled elsewhere; allow sending only if both participants exist
      if (conv.type === 'HELP_DM') throw new BadRequestException('Aucun admin n\'est assigné');
    }

    const msg = await this.messageModel.create({
      conversationId: conv._id,
      senderId: sid,
      recipientId: recipientId!,
      text: payload.text,
      attachments: payload.attachments || [],
    });

    // Update conversation summary
    conv.lastMessageText = payload.text || (payload.attachments && payload.attachments.length > 0 ? '[Pièce jointe]' : '');
    conv.lastMessageAt = new Date();
    if (sid.equals(conv.participantA)) {
      conv.unreadCountB = (conv.unreadCountB || 0) + 1;
    } else {
      conv.unreadCountA = (conv.unreadCountA || 0) + 1;
    }
    await conv.save();

    // Emit realtime events
    if (recipientId) {
      this.dmGateway.emitNewMessage(conv._id.toString(), recipientId.toString(), msg);

      // Send notification
      let sender: any = null;
      let senderName = 'Unknown User';

      // Check if sender is admin or regular user
      if (options?.isAdmin) {
        const adminSender = await this.adminModel.findById(senderId);
        sender = adminSender;
        senderName = adminSender?.name || 'Support Agent';
      } else {
        const userSender = await this.userModel.findById(senderId);
        sender = userSender;
        senderName = userSender?.name || 'User';
      }

      if (sender) {
        this.notificationService.createNotification({
          recipient: recipientId.toString(),
          sender: senderId,
          type: 'new_dm_message',
          title: `New message from ${senderName}`,
          body: msg.text || 'You received a new attachment.',
          data: { conversationId: conv._id.toString() },
        });
      }
    }

    return msg;
  }

  async markRead(conversationId: string, userId: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation introuvable');
    await this.enforceSessionTempLifecycle(conv);
    const uid = new Types.ObjectId(userId);
    const now = new Date();
    if (uid.equals(conv.participantA)) conv.unreadCountA = 0;
    else if (conv.participantB && uid.equals(conv.participantB)) conv.unreadCountB = 0;
    else throw new ForbiddenException();

    await Promise.all([
      conv.save(),
      this.messageModel.updateMany(
        { conversationId: conv._id, recipientId: uid, readAt: { $exists: false } },
        { $set: { readAt: now } }
      ),
    ]);
    this.dmGateway.emitRead(conv._id.toString(), uid.toString(), now);
    return { ok: true, readAt: now };
  }

  async assignHelpThread(conversationId: string, adminId: string) {
    const conv = await this.conversationModel.findById(conversationId)
      .populate('participantA', 'name email profile_picture');
    if (!conv) throw new NotFoundException('Conversation introuvable');
    if (conv.type !== 'HELP_DM') throw new BadRequestException('Non applicable');
    if (conv.participantB) return conv; // already assigned

    const admin = await this.adminModel.findById(adminId);
    if (!admin) throw new NotFoundException('Admin introuvable');

    conv.participantB = new Types.ObjectId(adminId);
    await conv.save();

    // Send welcome message from admin
    await this.sendWelcomeMessage(conversationId, adminId, admin.name);

    return await this.conversationModel.findById(conversationId)
      .populate('participantA', 'name email profile_picture')
      .populate('participantB', 'name email photo_profil poste departement');
  }

  /**
   * Auto-assign available admin to help conversation
   */
  private async autoAssignAdminToHelp(conversationId: string) {
    // Find an available admin (simple round-robin or least busy)
    const availableAdmin = await this.adminModel.findOne({ role: 'admin' }).sort({ createdAt: 1 });

    if (availableAdmin) {
      await this.assignHelpThread(conversationId, availableAdmin._id.toString());
    }
  }

  /**
   * Send welcome message from assigned admin
   */
  private async sendWelcomeMessage(conversationId: string, adminId: string, adminName: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) return;

    const welcomeText = `Hello! I'm ${adminName}, your support agent. How can I help you today? 😊`;

    const msg = await this.messageModel.create({
      conversationId: conv._id,
      senderId: new Types.ObjectId(adminId),
      recipientId: conv.participantA,
      text: welcomeText,
      attachments: [],
    });

    // Update conversation
    conv.lastMessageText = welcomeText;
    conv.lastMessageAt = new Date();
    conv.unreadCountA = (conv.unreadCountA || 0) + 1;
    await conv.save();

    // Emit realtime event
    this.dmGateway.emitNewMessage(conv._id.toString(), conv.participantA.toString(), msg);
  }

  /**
   * Get admin info for help conversations
   */
  async getHelpConversationAdmin(conversationId: string) {
    const conv = await this.conversationModel.findById(conversationId)
      .populate('participantB', 'name email photo_profil poste departement');

    if (conv?.type === 'HELP_DM' && conv.participantB) {
      return conv.participantB;
    }

    return null;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async closeExpiredSessionTempChats() {
    const now = new Date();
    const openSessionConversations = await this.conversationModel
      .find({
        type: 'SESSION_TEMP_DM',
        isOpen: true,
        $or: [
          { expiresAt: { $lte: now } },
          { expiresAt: { $exists: false } },
        ],
      })
      .select('_id')
      .limit(200)
      .exec();

    await Promise.all(
      openSessionConversations.map(async (item) => {
        const conv = await this.conversationModel.findById(item._id).exec();
        if (conv) {
          await this.enforceSessionTempLifecycle(conv);
        }
      }),
    );
  }
}


