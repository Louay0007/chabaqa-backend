import { Injectable, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from '../schema/conversation.schema';
import { Message, MessageDocument } from '../schema/message.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User } from '../schema/user.schema';
import { Admin, AdminDocument } from '../schema/admin.schema';
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

  async listUnassignedHelpThreads() {
    const items = await this.conversationModel
      .find({ type: 'HELP_DM', $or: [{ participantB: { $exists: false } }, { participantB: null }] })
      .sort({ createdAt: 1 });
    return { items };
  }

  async listInbox(userId: string, type?: 'community' | 'help' | 'peer', page = 1, limit = 20) {
    const filter: any = { $or: [{ participantA: new Types.ObjectId(userId) }, { participantB: new Types.ObjectId(userId) }] };
    if (type === 'community') filter.type = 'COMMUNITY_DM';
    if (type === 'help') filter.type = 'HELP_DM';
    if (type === 'peer') filter.type = 'PEER_DM';
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
    const totalPages = Math.ceil(total / limit);
    return {
      conversations: items,
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
}


