import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument, LiveSupportStatus } from '../schema/conversation.schema';
import {
  SupportMessage,
  SupportMessageDocument,
  SupportSenderType,
} from '../schema/support-message.schema';
import { LiveSupportAiService } from './live-support-ai.service';
import { LiveSupportGateway } from './live-support.gateway';

export type LiveSupportView = 'available' | 'mine' | 'closed';

@Injectable()
export class LiveSupportService {
  private static readonly SUPPORT_USER_FIELDS =
    'name firstName lastName username email profile_picture photo_profil avatar photo';

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(SupportMessage.name)
    private readonly supportMessageModel: Model<SupportMessageDocument>,
    private readonly aiService: LiveSupportAiService,
    private readonly gateway: LiveSupportGateway,
  ) {}

  private ensureEnabled() {
    const enabled = String(process.env.LIVE_SUPPORT_ENABLED ?? 'true').toLowerCase();
    if (enabled === 'false' || enabled === '0' || enabled === 'off') {
      throw new NotFoundException('Live support is disabled');
    }
  }

  private toObjectId(id: string, field = 'id'): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid ${field}`);
    return new Types.ObjectId(id);
  }

  private normalizeTicket(ticket: any) {
    if (!ticket) return null;
    return {
      ...ticket,
      id: ticket._id?.toString?.() || ticket.id,
    };
  }

  private normalizeMessage(message: any) {
    if (!message) return null;
    return {
      ...message,
      id: message._id?.toString?.() || message.id,
      conversationId: message.conversationId?.toString?.() || message.conversationId,
    };
  }

  async getMyOpenOrLatestTicket(userId: string) {
    this.ensureEnabled();
    const uid = this.toObjectId(userId, 'userId');

    const openTicket = await this.conversationModel
      .findOne({
        type: 'LIVE_SUPPORT',
        participantA: uid,
        isOpen: true,
        supportStatus: { $in: ['BOT_ACTIVE', 'WAITING_ADMIN', 'ASSIGNED'] },
      })
      .sort({ updatedAt: -1 })
      .lean();

    if (openTicket) return { ticket: this.normalizeTicket(openTicket) };

    const latest = await this.conversationModel
      .findOne({ type: 'LIVE_SUPPORT', participantA: uid })
      .sort({ updatedAt: -1 })
      .lean();

    return { ticket: this.normalizeTicket(latest) };
  }

  private async createLiveSupportTicket(uid: Types.ObjectId) {
    const ticket = await this.conversationModel.create({
      type: 'LIVE_SUPPORT',
      participantA: uid,
      isOpen: true,
      unreadCountA: 0,
      unreadCountB: 0,
      supportStatus: 'BOT_ACTIVE',
    });

    const fullTicket = await this.conversationModel.findById(ticket._id).lean();
    const normalized = this.normalizeTicket(fullTicket);
    this.gateway.emitTicketCreated(normalized);
    return normalized;
  }

  private async saveMessage(params: {
    conversationId: Types.ObjectId;
    senderType: SupportSenderType;
    text: string;
    senderUserId?: Types.ObjectId;
    senderAdminId?: Types.ObjectId;
  }) {
    const created = await this.supportMessageModel.create({
      conversationId: params.conversationId,
      senderType: params.senderType,
      senderUserId: params.senderUserId,
      senderAdminId: params.senderAdminId,
      text: params.text,
    });
    return this.normalizeMessage(created.toObject());
  }

  async sendUserMessage(userId: string, text: string) {
    this.ensureEnabled();
    const uid = this.toObjectId(userId, 'userId');
    const content = String(text || '').trim();
    if (!content) throw new BadRequestException('Message text is required');

    let ticket = await this.conversationModel.findOne({
      type: 'LIVE_SUPPORT',
      participantA: uid,
      isOpen: true,
      supportStatus: { $in: ['BOT_ACTIVE', 'WAITING_ADMIN', 'ASSIGNED'] },
    }).sort({ updatedAt: -1 });

    if (!ticket) {
      const created = await this.createLiveSupportTicket(uid);
      ticket = await this.conversationModel.findById(created.id);
      if (!ticket) throw new NotFoundException('Failed to create support ticket');
    }

    const userMessage = await this.saveMessage({
      conversationId: ticket._id,
      senderType: 'user',
      senderUserId: uid,
      text: content,
    });

    ticket.lastMessageText = content;
    ticket.lastMessageAt = new Date();
    if (ticket.supportStatus === 'ASSIGNED') {
      ticket.unreadCountB = (ticket.unreadCountB || 0) + 1;
    }
    await ticket.save();

    this.gateway.emitMessage(ticket._id.toString(), userMessage, ticket.participantA.toString());
    this.gateway.emitTicketUpdated(this.normalizeTicket(ticket.toObject()));

    let aiMessage: any = null;
    if (ticket.supportStatus === 'BOT_ACTIVE') {
      const recentMessages = await this.supportMessageModel
        .find({ conversationId: ticket._id })
        .sort({ createdAt: -1 })
        .limit(12)
        .lean();

      const aiReply = await this.aiService.reply({
        userMessage: content,
        supportStatus: ticket.supportStatus,
        recentMessages: recentMessages.reverse().map((message) => ({
          senderType: message.senderType,
          text: message.text,
        })),
      });
      aiMessage = await this.saveMessage({
        conversationId: ticket._id,
        senderType: 'ai',
        text: aiReply.text,
      });

      ticket.lastMessageText = aiReply.text;
      ticket.lastMessageAt = new Date();
      ticket.unreadCountA = (ticket.unreadCountA || 0) + 1;
      await ticket.save();
      this.gateway.emitMessage(ticket._id.toString(), aiMessage, ticket.participantA.toString());
      this.gateway.emitTicketUpdated(this.normalizeTicket(ticket.toObject()));
    }

    return {
      ticket: this.normalizeTicket(ticket.toObject()),
      userMessage,
      aiMessage,
    };
  }

  async requestAdmin(userId: string, conversationId: string) {
    this.ensureEnabled();
    const uid = this.toObjectId(userId, 'userId');
    const cid = this.toObjectId(conversationId, 'conversationId');

    const ticket = await this.conversationModel.findOne({
      _id: cid,
      type: 'LIVE_SUPPORT',
      participantA: uid,
      isOpen: true,
    });

    if (!ticket) throw new NotFoundException('Support ticket not found');

    if (ticket.supportStatus === 'CLOSED') {
      throw new BadRequestException('Ticket is already closed');
    }

    if (ticket.supportStatus === 'BOT_ACTIVE') {
      ticket.supportStatus = 'WAITING_ADMIN';
      ticket.requestedAdminAt = new Date();
      await ticket.save();
      this.gateway.emitTicketUpdated(this.normalizeTicket(ticket.toObject()));
    }

    return { ticket: this.normalizeTicket(ticket.toObject()) };
  }

  async getTicketMessagesForUser(userId: string, cursor?: string, limit = 40) {
    this.ensureEnabled();
    const uid = this.toObjectId(userId, 'userId');
    const ticket = await this.conversationModel
      .findOne({ type: 'LIVE_SUPPORT', participantA: uid })
      .sort({ updatedAt: -1 });

    if (!ticket) return { ticket: null, messages: [] };

    const query: any = { conversationId: ticket._id };
    if (cursor) {
      const d = new Date(cursor);
      if (!Number.isNaN(d.getTime())) query.createdAt = { $lt: d };
    }

    const messages = await this.supportMessageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();

    return {
      ticket: this.normalizeTicket(ticket.toObject()),
      messages: messages.reverse().map((m) => this.normalizeMessage(m)),
    };
  }

  async listAdminTickets(
    adminId: string,
    view: LiveSupportView,
    search?: string,
    page = 1,
    limit = 20,
  ) {
    this.ensureEnabled();
    const aid = this.toObjectId(adminId, 'adminId');
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);

    const filter: any = { type: 'LIVE_SUPPORT' };

    if (view === 'available') {
      filter.isOpen = true;
      filter.supportStatus = 'WAITING_ADMIN';
      filter.assignedAdminId = { $exists: false };
    } else if (view === 'mine') {
      filter.isOpen = true;
      filter.supportStatus = 'ASSIGNED';
      filter.assignedAdminId = aid;
    } else if (view === 'closed') {
      filter.isOpen = false;
      filter.supportStatus = 'CLOSED';
    }

    if (search?.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ lastMessageText: regex }];
    }

    const skip = (safePage - 1) * safeLimit;
    const [items, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .populate('participantA', LiveSupportService.SUPPORT_USER_FIELDS)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.conversationModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => this.normalizeTicket(item)),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async getTicketMessagesForAdmin(adminId: string, ticketId: string, cursor?: string, limit = 40) {
    this.ensureEnabled();
    const aid = this.toObjectId(adminId, 'adminId');
    const cid = this.toObjectId(ticketId, 'ticketId');

    const ticket = await this.conversationModel.findOne({ _id: cid, type: 'LIVE_SUPPORT' });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const canAccess =
      ticket.supportStatus === 'WAITING_ADMIN' ||
      (ticket.assignedAdminId && ticket.assignedAdminId.equals(aid)) ||
      ticket.supportStatus === 'CLOSED';

    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    const query: any = { conversationId: ticket._id };
    if (cursor) {
      const d = new Date(cursor);
      if (!Number.isNaN(d.getTime())) query.createdAt = { $lt: d };
    }

    const messages = await this.supportMessageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();

    const hydratedTicket = await this.conversationModel
      .findById(ticket._id)
      .populate('participantA', LiveSupportService.SUPPORT_USER_FIELDS)
      .lean();

    return {
      ticket: this.normalizeTicket(hydratedTicket || ticket.toObject()),
      messages: messages.reverse().map((m) => this.normalizeMessage(m)),
    };
  }

  async claimTicket(adminId: string, ticketId: string) {
    this.ensureEnabled();
    const aid = this.toObjectId(adminId, 'adminId');
    const cid = this.toObjectId(ticketId, 'ticketId');

    const updated = await this.conversationModel.findOneAndUpdate(
      {
        _id: cid,
        type: 'LIVE_SUPPORT',
        isOpen: true,
        supportStatus: 'WAITING_ADMIN',
        $or: [{ assignedAdminId: { $exists: false } }, { assignedAdminId: null }],
      },
      {
        $set: {
          supportStatus: 'ASSIGNED' as LiveSupportStatus,
          assignedAdminId: aid,
          claimedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new ConflictException('Ticket is no longer available');
    }

    const normalized = this.normalizeTicket(updated.toObject());
    this.gateway.emitTicketClaimed(normalized);
    return { ticket: normalized };
  }

  async sendAdminMessage(adminId: string, ticketId: string, text: string) {
    this.ensureEnabled();
    const aid = this.toObjectId(adminId, 'adminId');
    const cid = this.toObjectId(ticketId, 'ticketId');
    const content = String(text || '').trim();

    if (!content) throw new BadRequestException('Message text is required');

    const ticket = await this.conversationModel.findOne({ _id: cid, type: 'LIVE_SUPPORT', isOpen: true });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.supportStatus !== 'ASSIGNED' || !ticket.assignedAdminId || !ticket.assignedAdminId.equals(aid)) {
      throw new ForbiddenException('Only the assigned admin can reply');
    }

    const message = await this.saveMessage({
      conversationId: ticket._id,
      senderType: 'admin',
      senderAdminId: aid,
      text: content,
    });

    ticket.lastMessageText = content;
    ticket.lastMessageAt = new Date();
    ticket.unreadCountA = (ticket.unreadCountA || 0) + 1;
    await ticket.save();

    const normalized = this.normalizeTicket(ticket.toObject());
    this.gateway.emitMessage(ticket._id.toString(), message, ticket.participantA.toString());
    this.gateway.emitTicketUpdated(normalized);

    return { ticket: normalized, message };
  }

  async closeTicket(adminId: string, ticketId: string) {
    this.ensureEnabled();
    const aid = this.toObjectId(adminId, 'adminId');
    const cid = this.toObjectId(ticketId, 'ticketId');

    const ticket = await this.conversationModel.findOne({ _id: cid, type: 'LIVE_SUPPORT', isOpen: true });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (!ticket.assignedAdminId || !ticket.assignedAdminId.equals(aid)) {
      throw new ForbiddenException('Only the assigned admin can close this ticket');
    }

    ticket.isOpen = false;
    ticket.closedAt = new Date();
    ticket.closeReason = 'manual';
    ticket.supportStatus = 'CLOSED';
    ticket.closedByAdminId = aid;
    await ticket.save();

    const normalized = this.normalizeTicket(ticket.toObject());
    this.gateway.emitTicketClosed(normalized);
    return { ticket: normalized };
  }

  async getQueueCounts(adminId: string) {
    this.ensureEnabled();
    const aid = this.toObjectId(adminId, 'adminId');

    const [available, mine, closed] = await Promise.all([
      this.conversationModel.countDocuments({
        type: 'LIVE_SUPPORT',
        isOpen: true,
        supportStatus: 'WAITING_ADMIN',
        $or: [{ assignedAdminId: { $exists: false } }, { assignedAdminId: null }],
      }),
      this.conversationModel.countDocuments({
        type: 'LIVE_SUPPORT',
        isOpen: true,
        supportStatus: 'ASSIGNED',
        assignedAdminId: aid,
      }),
      this.conversationModel.countDocuments({ type: 'LIVE_SUPPORT', isOpen: false, supportStatus: 'CLOSED' }),
    ]);

    return { available, mine, closed };
  }
}
