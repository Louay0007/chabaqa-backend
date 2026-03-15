import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import {
  CommunityInvitation,
  CommunityInvitationDocument,
  InvitationStatus,
} from '../schema/community-invitation.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { EmailService } from '../common/services/email.service';
import {
  ImportContactsDto,
  InviteSingleDto,
  InvitationQueryDto,
} from '../dto-community/community-invitation.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_EXPIRY_DAYS = 30;
const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CommunityInvitationService {
  private readonly logger = new Logger(CommunityInvitationService.name);

  constructor(
    @InjectModel(CommunityInvitation.name)
    private readonly invitationModel: Model<CommunityInvitationDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private getExpiryDays(): number {
    const env = Number(process.env.INVITATION_EXPIRY_DAYS);
    return Number.isFinite(env) && env > 0 ? env : DEFAULT_EXPIRY_DAYS;
  }

  private getExpiresAt(from: Date = new Date()): Date {
    const d = new Date(from);
    d.setDate(d.getDate() + this.getExpiryDays());
    return d;
  }

  private getFrontendBaseUrl(): string {
    return (
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3001'
    );
  }

  private buildAcceptUrl(token: string): string {
    return `${this.getFrontendBaseUrl()}/invitation/${token}`;
  }

  /** Verify the caller is the creator (owner) of the community. */
  private async verifyCommunityOwnership(
    communityId: string,
    userId: string,
  ): Promise<CommunityDocument> {
    const community = await this.communityModel.findById(communityId);
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const creatorId = community.createur?.toString?.() ?? '';
    const userIdStr = userId?.toString?.() ?? '';
    if (creatorId !== userIdStr) {
      throw new ForbiddenException(
        'Only the community creator can manage invitations',
      );
    }
    return community;
  }

  /** Check whether an email already belongs to a platform user who is already a member. */
  private async isAlreadyMember(
    email: string,
    community: CommunityDocument,
  ): Promise<boolean> {
    const user = await this.userModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return false;
    const memberIds = (community.members as any[]).map((m: any) =>
      m?.toString?.() ?? m,
    );
    return memberIds.includes(user._id.toString());
  }

  // -----------------------------------------------------------------------
  // Import contacts (bulk)
  // -----------------------------------------------------------------------

  async importContacts(
    creatorId: string,
    dto: ImportContactsDto,
  ): Promise<{ created: number; skipped: number; skippedEmails: string[] }> {
    const community = await this.verifyCommunityOwnership(
      dto.communityId,
      creatorId,
    );

    const creatorUser = await this.userModel.findById(creatorId);
    const creatorName = creatorUser?.name || 'A creator';
    const communityName = (community as any).name || (community as any).nom || 'a community';

    let created = 0;
    let skipped = 0;
    const skippedEmails: string[] = [];

    for (const contact of dto.contacts) {
      const email = contact.email.toLowerCase().trim();

      // Skip if already has a non-revoked invitation for this community
      const existing = await this.invitationModel.findOne({
        communityId: new Types.ObjectId(dto.communityId),
        email,
        status: { $in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED] },
      });

      if (existing) {
        skipped++;
        skippedEmails.push(email);
        continue;
      }

      // Skip if already a community member
      if (await this.isAlreadyMember(email, community)) {
        skipped++;
        skippedEmails.push(email);
        continue;
      }

      const token = uuidv4();
      const now = new Date();

      await this.invitationModel.create({
        email,
        name: contact.name?.trim() || '',
        communityId: new Types.ObjectId(dto.communityId),
        creatorId: new Types.ObjectId(creatorId),
        token,
        status: InvitationStatus.PENDING,
        personalMessage: dto.personalMessage?.trim() || '',
        invitedAt: now,
        expiresAt: this.getExpiresAt(now),
      });

      // Fire-and-forget email (don't fail the whole import if one email fails)
      this.sendInvitationEmailSafe(
        email,
        contact.name?.trim() || '',
        communityName,
        creatorName,
        dto.personalMessage?.trim() || '',
        this.buildAcceptUrl(token),
      );

      created++;
    }

    this.logger.log(
      `Imported contacts for community ${dto.communityId}: created=${created}, skipped=${skipped}`,
    );

    return { created, skipped, skippedEmails };
  }

  // -----------------------------------------------------------------------
  // Invite single
  // -----------------------------------------------------------------------

  async inviteSingle(
    creatorId: string,
    dto: InviteSingleDto,
  ): Promise<CommunityInvitationDocument> {
    const community = await this.verifyCommunityOwnership(
      dto.communityId,
      creatorId,
    );

    const email = dto.email.toLowerCase().trim();

    // Check if already an accepted member — hard stop
    const acceptedInvite = await this.invitationModel.findOne({
      communityId: new Types.ObjectId(dto.communityId),
      email,
      status: InvitationStatus.ACCEPTED,
    });
    if (acceptedInvite) {
      throw new ConflictException(`${email} has already joined this community`);
    }

    // Check if already a member via user record
    if (await this.isAlreadyMember(email, community)) {
      throw new ConflictException(
        `${email} is already a member of this community`,
      );
    }

    const creatorUser = await this.userModel.findById(creatorId);
    const creatorName = creatorUser?.name || 'A creator';
    const communityName = (community as any).name || (community as any).nom || 'a community';

    // If a pending / expired / revoked invitation already exists — upsert it
    const existingPending = await this.invitationModel.findOne({
      communityId: new Types.ObjectId(dto.communityId),
      email,
      status: { $in: [InvitationStatus.PENDING, InvitationStatus.EXPIRED, InvitationStatus.REVOKED] },
    });

    if (existingPending) {
      // Reactivate: refresh token, expiry, optional new message / name
      existingPending.token = uuidv4();
      existingPending.status = InvitationStatus.PENDING;
      existingPending.expiresAt = this.getExpiresAt();
      existingPending.resendCount += 1;
      existingPending.lastResentAt = new Date();
      if (dto.name?.trim()) existingPending.name = dto.name.trim();
      if (dto.personalMessage?.trim()) existingPending.personalMessage = dto.personalMessage.trim();
      await existingPending.save();

      await this.sendInvitationEmailSafe(
        email,
        existingPending.name,
        communityName,
        creatorName,
        existingPending.personalMessage,
        this.buildAcceptUrl(existingPending.token),
      );

      return existingPending;
    }

    const token = uuidv4();
    const now = new Date();

    const invitation = await this.invitationModel.create({
      email,
      name: dto.name?.trim() || '',
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      token,
      status: InvitationStatus.PENDING,
      personalMessage: dto.personalMessage?.trim() || '',
      invitedAt: now,
      expiresAt: this.getExpiresAt(now),
    });

    await this.sendInvitationEmailSafe(
      email,
      dto.name?.trim() || '',
      communityName,
      creatorName,
      dto.personalMessage?.trim() || '',
      this.buildAcceptUrl(token),
    );

    return invitation;
  }

  // -----------------------------------------------------------------------
  // List invitations
  // -----------------------------------------------------------------------

  async getInvitations(
    creatorId: string,
    communityId: string,
    query: InvitationQueryDto,
  ): Promise<{
    invitations: CommunityInvitationDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.verifyCommunityOwnership(communityId, creatorId);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: any = {
      communityId: new Types.ObjectId(communityId),
    };

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.search) {
      const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: regex }, { name: regex }];
    }

    const [invitations, total] = await Promise.all([
      this.invitationModel
        .find(filter)
        .sort({ invitedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.invitationModel.countDocuments(filter),
    ]);

    return {
      invitations: invitations as any[],
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  async getStats(
    creatorId: string,
    communityId: string,
  ): Promise<{
    total: number;
    pending: number;
    accepted: number;
    expired: number;
    revoked: number;
    conversionRate: number;
  }> {
    await this.verifyCommunityOwnership(communityId, creatorId);

    const cId = new Types.ObjectId(communityId);

    const [total, pending, accepted, expired, revoked] = await Promise.all([
      this.invitationModel.countDocuments({ communityId: cId }),
      this.invitationModel.countDocuments({ communityId: cId, status: InvitationStatus.PENDING }),
      this.invitationModel.countDocuments({ communityId: cId, status: InvitationStatus.ACCEPTED }),
      this.invitationModel.countDocuments({ communityId: cId, status: InvitationStatus.EXPIRED }),
      this.invitationModel.countDocuments({ communityId: cId, status: InvitationStatus.REVOKED }),
    ]);

    const conversionRate = total > 0 ? Number(((accepted / total) * 100).toFixed(1)) : 0;

    return { total, pending, accepted, expired, revoked, conversionRate };
  }

  // -----------------------------------------------------------------------
  // Resend
  // -----------------------------------------------------------------------

  async resendInvitation(
    creatorId: string,
    invitationId: string,
  ): Promise<CommunityInvitationDocument> {
    const invitation = await this.invitationModel.findById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    await this.verifyCommunityOwnership(
      invitation.communityId.toString(),
      creatorId,
    );

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new BadRequestException('Cannot resend an already accepted invitation');
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new BadRequestException('Cannot resend a revoked invitation');
    }

    // Enforce 24h cooldown
    if (invitation.lastResentAt) {
      const elapsed = Date.now() - invitation.lastResentAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
        throw new BadRequestException(
          `Please wait ${hoursLeft} hour(s) before resending this invitation`,
        );
      }
    }

    const community = await this.communityModel.findById(invitation.communityId);
    const creatorUser = await this.userModel.findById(creatorId);
    const communityName = (community as any)?.name || (community as any)?.nom || 'a community';
    const creatorName = creatorUser?.name || 'A creator';

    // Extend expiry from now
    invitation.expiresAt = this.getExpiresAt();
    invitation.resendCount += 1;
    invitation.lastResentAt = new Date();
    invitation.status = InvitationStatus.PENDING;
    await invitation.save();

    await this.sendInvitationEmailSafe(
      invitation.email,
      invitation.name,
      communityName,
      creatorName,
      invitation.personalMessage,
      this.buildAcceptUrl(invitation.token),
    );

    return invitation;
  }

  // -----------------------------------------------------------------------
  // Revoke
  // -----------------------------------------------------------------------

  async revokeInvitation(
    creatorId: string,
    invitationId: string,
  ): Promise<CommunityInvitationDocument> {
    const invitation = await this.invitationModel.findById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    await this.verifyCommunityOwnership(
      invitation.communityId.toString(),
      creatorId,
    );

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new BadRequestException('Cannot revoke an already accepted invitation');
    }

    invitation.status = InvitationStatus.REVOKED;
    await invitation.save();

    return invitation;
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async deleteInvitation(
    creatorId: string,
    invitationId: string,
  ): Promise<void> {
    const invitation = await this.invitationModel.findById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    await this.verifyCommunityOwnership(
      invitation.communityId.toString(),
      creatorId,
    );

    await this.invitationModel.deleteOne({ _id: invitation._id });
  }

  // -----------------------------------------------------------------------
  // Validate token (public)
  // -----------------------------------------------------------------------

  async validateToken(token: string): Promise<{
    valid: boolean;
    isExpired: boolean;
    isAccepted: boolean;
    isRevoked: boolean;
    email: string;
    communityId: string;
    communityName: string;
    communitySlug: string;
    communityAvatar: string;
    creatorName: string;
    personalMessage: string;
  }> {
    const invitation = await this.invitationModel.findOne({ token });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid token');
    }

    // Auto-expire if past expiresAt and still pending
    if (
      invitation.status === InvitationStatus.PENDING &&
      invitation.expiresAt < new Date()
    ) {
      invitation.status = InvitationStatus.EXPIRED;
      await invitation.save();
    }

    const community = await this.communityModel.findById(invitation.communityId);
    const creatorUser = await this.userModel.findById(invitation.creatorId);

    const communityName = (community as any)?.name || (community as any)?.nom || '';
    const communitySlug = (community as any)?.slug || '';
    const communityAvatar =
      (community as any)?.photo_profil ||
      (community as any)?.logo ||
      (community as any)?.avatar ||
      '';
    const creatorName = creatorUser?.name || '';

    return {
      valid: invitation.status === InvitationStatus.PENDING,
      isExpired: invitation.status === InvitationStatus.EXPIRED,
      isAccepted: invitation.status === InvitationStatus.ACCEPTED,
      isRevoked: invitation.status === InvitationStatus.REVOKED,
      email: invitation.email,
      communityId: invitation.communityId.toString(),
      communityName,
      communitySlug,
      communityAvatar,
      creatorName,
      personalMessage: invitation.personalMessage || '',
    };
  }

  // -----------------------------------------------------------------------
  // Accept invitation
  // -----------------------------------------------------------------------

  async acceptInvitation(
    token: string,
    userId: string,
  ): Promise<{ success: boolean; communityId: string; communitySlug: string }> {
    const invitation = await this.invitationModel.findOne({ token });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid token');
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      const community = await this.communityModel.findById(invitation.communityId);
      return {
        success: true,
        communityId: invitation.communityId.toString(),
        communitySlug: (community as any)?.slug || '',
      };
    }

    if (invitation.status === InvitationStatus.REVOKED) {
      throw new BadRequestException('This invitation has been revoked');
    }

    if (invitation.status === InvitationStatus.EXPIRED || invitation.expiresAt < new Date()) {
      invitation.status = InvitationStatus.EXPIRED;
      await invitation.save();
      throw new BadRequestException('This invitation has expired');
    }

    // Find the community and join the user
    const community = await this.communityModel.findById(invitation.communityId);
    if (!community) {
      throw new NotFoundException('Community no longer exists');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already a member
    const userIdStr = userId?.toString?.() ?? '';
    const memberIds = (community.members as any[]).map((m: any) =>
      m?.toString?.() ?? m,
    );
    const isAlreadyMember = memberIds.includes(userIdStr);

    if (!isAlreadyMember) {
      // Add user to community members
      (community.members as any[]).push(new Types.ObjectId(userIdStr));
      (community as any).membersCount =
        ((community as any).membersCount || 0) + 1;
      await community.save();

      // Add community to user's joinedCommunities
      await this.userModel.updateOne(
        { _id: userId },
        { $addToSet: { joinedCommunities: community._id } },
      );
    }

    // Mark invitation as accepted
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedAt = new Date();
    invitation.acceptedByUserId = new Types.ObjectId(userId);
    await invitation.save();

    this.logger.log(
      `Invitation ${invitation._id} accepted by user ${userId} for community ${invitation.communityId}`,
    );

    return {
      success: true,
      communityId: invitation.communityId.toString(),
      communitySlug: (community as any)?.slug || '',
    };
  }

  // -----------------------------------------------------------------------
  // Cron: expire old invitations
  // -----------------------------------------------------------------------

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireOldInvitations(): Promise<void> {
    const result = await this.invitationModel.updateMany(
      {
        status: InvitationStatus.PENDING,
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: InvitationStatus.EXPIRED } },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Expired ${result.modifiedCount} old invitation(s)`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Email helper (fire-and-forget wrapper)
  // -----------------------------------------------------------------------

  private async sendInvitationEmailSafe(
    to: string,
    name: string,
    communityName: string,
    creatorName: string,
    personalMessage: string,
    acceptUrl: string,
  ): Promise<void> {
    try {
      this.logger.log(`📧 Sending invitation email to ${to} (community: ${communityName})`);
      await this.emailService.sendCommunityInvitationEmail({
        to,
        name,
        communityName,
        creatorName,
        personalMessage,
        acceptUrl,
      });
      this.logger.log(`✅ Invitation email sent to ${to}`);
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to send invitation email to ${to}: ${error?.message || error}`,
        error?.stack,
      );
    }
  }
}
