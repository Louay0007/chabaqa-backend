import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmailCampaign,
  EmailCampaignDocument,
  EmailCampaignStatus,
  EmailCampaignType,
  InactivityPeriod,
  EmailRecipient
} from '../schema/email-campaign.schema';
import { UserLoginActivityDocument } from '../schema/user-login-activity.schema';
import { User, UserDocument } from '../schema/user.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { EmailService } from '../common/services/email.service';
import { UserLoginActivityService } from '../user-login-activity/user-login-activity.service';
import {
  CreateEmailCampaignDto,
  CreateInactiveUserCampaignDto,
  UpdateEmailCampaignDto,
  EmailCampaignQueryDto,
  CampaignStatsDto,
  InactiveUserStatsDto,
  CreateContentReminderDto
} from '../dto-email-campaign/email-campaign.dto';

/**
 * Service for managing email campaigns including  inactive user targeting
 */
@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);

  constructor(
    @InjectModel(EmailCampaign.name)
    private emailCampaignModel: Model<EmailCampaignDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    private emailService: EmailService,
    private userLoginActivityService: UserLoginActivityService,
  ) { }

  /**
   * Create a regular email campaign
   */
  async createCampaign(
    creatorId: string,
    dto: CreateEmailCampaignDto
  ): Promise<EmailCampaignDocument> {
    try {
      // Verify creator owns the community
      const community = await this.verifyCommunityAccess(creatorId, dto.communityId);

      // Get community members
      const members = await this.userModel.find({
        _id: { $in: community.members }
      }).select('_id email name');

      if (members.length === 0) {
        // Allow creation with zero recipients so campaigns can be drafted even before members join
        this.logger.warn(`Creating campaign with zero recipients for community ${dto.communityId}`);
      }

      // Create recipients list
      const recipients: EmailRecipient[] = members.map(member => ({
        userId: member._id,
        email: member.email,
        name: member.name,
        status: 'pending',
        opened: false,
        clickCount: 0
      }));

      const campaign = new this.emailCampaignModel({
        title: dto.title,
        subject: dto.subject,
        content: dto.content,
        communityId: new Types.ObjectId(dto.communityId),
        creatorId: new Types.ObjectId(creatorId),
        recipients,
        totalRecipients: recipients.length,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        type: dto.type || EmailCampaignType.CUSTOM,
        status: EmailCampaignStatus.DRAFT,
        isHtml: dto.isHtml || false,
        trackOpens: dto.trackOpens !== false,
        trackClicks: dto.trackClicks !== false,
        metadata: dto.metadata || {}
      });

      const savedCampaign = await campaign.save();

      this.logger.log(`Created campaign ${savedCampaign._id} for community ${dto.communityId} with ${recipients.length} recipients`);

      return savedCampaign;
    } catch (error) {
      this.logger.error(`Error creating campaign:`, error);
      throw error;
    }
  }

  /**
   * Create an inactive user campaign
   */
  async createInactiveUserCampaign(
    creatorId: string,
    dto: CreateInactiveUserCampaignDto
  ): Promise<EmailCampaignDocument> {
    try {
      // Verify creator owns the community
      const community = await this.verifyCommunityAccess(creatorId, dto.communityId);

      // Get inactive users based on selected period
      let inactiveUsers: UserLoginActivityDocument[];

      if (dto.targetAllInactive) {
        inactiveUsers = await this.userLoginActivityService.getAllInactiveUsers(dto.communityId);
      } else {
        inactiveUsers = await this.userLoginActivityService.getInactiveUsersByPeriod(
          dto.communityId,
          dto.inactivityPeriod
        );
      }

      if (inactiveUsers.length === 0) {
        // Allow creation with zero recipients so campaigns can be drafted even before inactive users exist
        this.logger.warn(`Creating inactive user campaign with zero recipients for community ${dto.communityId}`);
      }

      // Apply max recipients limit if specified
      if (dto.maxRecipients && inactiveUsers.length > dto.maxRecipients) {
        inactiveUsers = inactiveUsers.slice(0, dto.maxRecipients);
      }

      // Create recipients list
      const recipients: EmailRecipient[] = inactiveUsers.map(userActivity => {
        const user = userActivity.userId as any;
        return {
          userId: user._id,
          email: user.email,
          name: user.name,
          status: 'pending',
          opened: false,
          clickCount: 0
        };
      });

      // Process email content with variables
      const processedContent = this.processInactiveUserContent(
        dto.content,
        dto.inactivityPeriod,
        community.name
      );

      const processedSubject = this.processInactiveUserContent(
        dto.subject,
        dto.inactivityPeriod,
        community.name
      );

      const campaign = new this.emailCampaignModel({
        title: dto.title,
        subject: processedSubject,
        content: processedContent,
        communityId: new Types.ObjectId(dto.communityId),
        creatorId: new Types.ObjectId(creatorId),
        recipients,
        totalRecipients: recipients.length,
        isInactiveUserCampaign: true,
        targetInactivityPeriod: dto.inactivityPeriod,
        targetDaysThreshold: this.getDaysThreshold(dto.inactivityPeriod),
        targetAllInactive: dto.targetAllInactive || false,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        type: EmailCampaignType.INACTIVE_USER_REACTIVATION,
        status: EmailCampaignStatus.DRAFT,
        trackOpens: dto.trackOpens !== false,
        trackClicks: dto.trackClicks !== false,
        isHtml: dto.isHtml || false,
        metadata: {
          ...dto.metadata,
          reactivationCampaign: true,
          targetPeriod: dto.inactivityPeriod
        }
      });

      const savedCampaign = await campaign.save();

      this.logger.log(
        `Created inactive user campaign ${savedCampaign._id} for community ${dto.communityId} ` +
        `with ${recipients.length} inactive users (period: ${dto.inactivityPeriod})`
      );

      return savedCampaign;
    } catch (error) {
      this.logger.error(`Error creating inactive user campaign:`, error);
      throw error;
    }
  }

  /**
   * Send an email campaign
   */
  async sendCampaign(campaignId: string, creatorId: string): Promise<void> {
    try {
      const campaign = await this.emailCampaignModel.findById(campaignId);

      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }

      // Verify creator owns the campaign
      if (!campaign.creatorId.equals(creatorId)) {
        throw new ForbiddenException('You can only send campaigns you created');
      }

      if (campaign.status !== EmailCampaignStatus.DRAFT &&
        campaign.status !== EmailCampaignStatus.SCHEDULED) {
        throw new BadRequestException('Campaign cannot be sent in current status');
      }

      // Update campaign status
      campaign.status = EmailCampaignStatus.SENDING;
      await campaign.save();

      this.logger.log(`Starting to send campaign ${campaignId} to ${campaign.totalRecipients} recipients`);

      // Send emails in batches to avoid overwhelming the email service
      const batchSize = 10;
      const batches = this.chunkArray(campaign.recipients, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        this.logger.log(`Sending batch ${i + 1}/${batches.length} (${batch.length} emails)`);

        await Promise.allSettled(
          batch.map(recipient => this.sendEmailToRecipient(campaign, recipient))
        );

        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Update campaign status
      campaign.status = EmailCampaignStatus.SENT;
      campaign.sentAt = new Date();
      await campaign.save();

      // Update reactivation email tracking for inactive user campaigns
      if (campaign.isInactiveUserCampaign) {
        await this.updateReactivationEmailTracking(campaign);
      }

      this.logger.log(`Campaign ${campaignId} sent successfully. Sent: ${campaign.sentCount}, Failed: ${campaign.failedCount}`);
    } catch (error) {
      this.logger.error(`Error sending campaign ${campaignId}:`, error);

      // Update campaign status to failed
      try {
        await this.emailCampaignModel.updateOne(
          { _id: campaignId },
          { status: EmailCampaignStatus.FAILED }
        );
      } catch (updateError) {
        this.logger.error(`Error updating campaign status to failed:`, updateError);
      }

      throw error;
    }
  }

  /**
   * Get campaigns for a community
   */
  async getCommunityCampaigns(
    creatorId: string,
    communityId: string,
    query: EmailCampaignQueryDto
  ): Promise<{ campaigns: EmailCampaignDocument[]; total: number }> {
    try {
      // Verify creator has access to community
      await this.verifyCommunityAccess(creatorId, communityId);

      const filter: any = {
        communityId: new Types.ObjectId(communityId)
      };

      // Apply filters
      if (query.status) {
        filter.status = query.status;
      }
      if (query.type) {
        filter.type = query.type;
      }
      if (query.inactiveUserCampaigns !== undefined) {
        filter.isInactiveUserCampaign = query.inactiveUserCampaigns;
      }
      if (query.search) {
        filter.$or = [
          { title: { $regex: query.search, $options: 'i' } },
          { subject: { $regex: query.search, $options: 'i' } }
        ];
      }

      const skip = ((query.page || 1) - 1) * (query.limit || 10);

      const [campaigns, total] = await Promise.all([
        this.emailCampaignModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(query.limit || 10)
          .populate('creatorId', 'name email')
          .exec(),
        this.emailCampaignModel.countDocuments(filter)
      ]);

      return { campaigns, total };
    } catch (error) {
      this.logger.error(`Error getting community campaigns:`, error);
      throw error;
    }
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(creatorId: string, communityId: string): Promise<CampaignStatsDto> {
    try {
      // Verify creator has access to community
      await this.verifyCommunityAccess(creatorId, communityId);

      const campaigns = await this.emailCampaignModel.find({
        communityId: new Types.ObjectId(communityId)
      });

      const stats: CampaignStatsDto = {
        totalCampaigns: campaigns.length,
        totalEmailsSent: campaigns.reduce((sum, c) => sum + c.sentCount, 0),
        totalEmailsFailed: campaigns.reduce((sum, c) => sum + c.failedCount, 0),
        totalOpens: campaigns.reduce((sum, c) => sum + c.openCount, 0),
        totalClicks: campaigns.reduce((sum, c) => sum + c.clickCount, 0),
        averageOpenRate: 0,
        averageClickRate: 0,
        reactivationCampaigns: campaigns.filter(c => c.isInactiveUserCampaign).length,
        reactivationSuccessRate: 0
      };

      // Calculate rates
      if (stats.totalEmailsSent > 0) {
        stats.averageOpenRate = (stats.totalOpens / stats.totalEmailsSent) * 100;
        stats.averageClickRate = (stats.totalClicks / stats.totalEmailsSent) * 100;
      }

      // Calculate reactivation success rate
      const reactivationCampaigns = campaigns.filter(c => c.isInactiveUserCampaign);
      if (reactivationCampaigns.length > 0) {
        const totalReactivationEmails = reactivationCampaigns.reduce((sum, c) => sum + c.sentCount, 0);
        const totalReactivationOpens = reactivationCampaigns.reduce((sum, c) => sum + c.openCount, 0);
        stats.reactivationSuccessRate = totalReactivationEmails > 0
          ? (totalReactivationOpens / totalReactivationEmails) * 100
          : 0;
      }

      return stats;
    } catch (error) {
      this.logger.error(`Error getting campaign stats:`, error);
      throw error;
    }
  }

  /**
    * Get inactive user statistics
    */
  async getInactiveUserStats(communityId: string): Promise<InactiveUserStatsDto> {
    try {
      return await this.userLoginActivityService.getInactivityStats(communityId);
    } catch (error) {
      this.logger.error(`Error getting inactive user stats:`, error);
      throw error;
    }
  }

  /**
   * Create and send a content reminder campaign
   */
  async createAndSendContentReminder(
    creatorId: string,
    dto: CreateContentReminderDto
  ): Promise<{ campaignId: string }> {
    try {
      // Verify creator owns the community
      const community = await this.verifyCommunityAccess(creatorId, dto.communityId);

      // Get community members
      const members = await this.userModel.find({
        _id: { $in: community.members }
      }).select('_id email name');

      if (members.length === 0) {
        throw new BadRequestException('No members found in this community');
      }

      // Process content with template variables
      const processedContent = this.processContentReminderContent(
        dto.content,
        dto.contentType,
        community.name
      );

      const processedSubject = this.processContentReminderContent(
        dto.subject,
        dto.contentType,
        community.name
      );

      // Create recipients list
      const recipients: EmailRecipient[] = members.map(member => ({
        userId: member._id,
        email: member.email,
        name: member.name,
        status: 'pending',
        opened: false,
        clickCount: 0
      }));

      // Create the campaign
      const campaign = new this.emailCampaignModel({
        title: dto.title,
        subject: processedSubject,
        content: processedContent,
        communityId: new Types.ObjectId(dto.communityId),
        creatorId: new Types.ObjectId(creatorId),
        recipients,
        totalRecipients: recipients.length,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        type: EmailCampaignType.CUSTOM,
        status: EmailCampaignStatus.DRAFT,
        trackOpens: dto.trackOpens !== false,
        trackClicks: dto.trackClicks !== false,
        isHtml: dto.isHtml || false,
        metadata: {
          ...dto.metadata,
          contentReminder: true,
          contentType: dto.contentType,
          contentId: dto.contentId
        }
      });

      const savedCampaign = await campaign.save();

      // Send the campaign immediately
      await this.sendCampaign(savedCampaign._id.toString(), creatorId);

      this.logger.log(
        `Created and sent content reminder campaign ${savedCampaign._id} for community ${dto.communityId} ` +
        `for content type: ${dto.contentType}`
      );

      return { campaignId: savedCampaign._id.toString() };
    } catch (error) {
      this.logger.error(`Error creating content reminder campaign:`, error);
      throw error;
    }
  }

  /**
   * Get a specific campaign
   */
  async getCampaign(campaignId: string, creatorId: string): Promise<EmailCampaignDocument> {
    try {
      const campaign = await this.emailCampaignModel
        .findById(campaignId)
        .populate('creatorId', 'name email')
        .exec();

      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }

      // Verify creator has access to the campaign's community
      await this.verifyCommunityAccess(creatorId, campaign.communityId.toString());

      return campaign;
    } catch (error) {
      this.logger.error(`Error getting campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Update a campaign
   */
  async updateCampaign(
    campaignId: string,
    dto: UpdateEmailCampaignDto,
    creatorId: string
  ): Promise<EmailCampaignDocument> {
    try {
      const campaign = await this.emailCampaignModel.findById(campaignId);

      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }

      // Verify creator owns the campaign
      if (!campaign.creatorId.equals(creatorId)) {
        throw new ForbiddenException('You can only update campaigns you created');
      }

      // Only allow updates if campaign is in draft status
      if (campaign.status !== EmailCampaignStatus.DRAFT) {
        throw new BadRequestException('Campaign cannot be updated in current status');
      }

      // Update allowed fields
      const updateData: any = {};
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.subject !== undefined) updateData.subject = dto.subject;
      if (dto.content !== undefined) updateData.content = dto.content;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.scheduledAt !== undefined) updateData.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
      if (dto.isHtml !== undefined) updateData.isHtml = dto.isHtml;
      if (dto.trackOpens !== undefined) updateData.trackOpens = dto.trackOpens;
      if (dto.trackClicks !== undefined) updateData.trackClicks = dto.trackClicks;
      if (dto.metadata !== undefined) updateData.metadata = dto.metadata;

      const updatedCampaign = await this.emailCampaignModel
        .findByIdAndUpdate(campaignId, updateData, { new: true })
        .populate('creatorId', 'name email')
        .exec();

      this.logger.log(`Updated campaign ${campaignId}`);

      return updatedCampaign!;
    } catch (error) {
      this.logger.error(`Error updating campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(campaignId: string, creatorId: string): Promise<void> {
    try {
      const campaign = await this.emailCampaignModel.findById(campaignId);

      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }

      // Verify creator owns the campaign
      if (!campaign.creatorId.equals(creatorId)) {
        throw new ForbiddenException('You can only delete campaigns you created');
      }

      // Only allow deletion if campaign is in draft status
      if (campaign.status !== EmailCampaignStatus.DRAFT) {
        throw new BadRequestException('Campaign cannot be deleted in current status');
      }

      await this.emailCampaignModel.findByIdAndDelete(campaignId);

      this.logger.log(`Deleted campaign ${campaignId}`);
    } catch (error) {
      this.logger.error(`Error deleting campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async verifyCommunityAccess(creatorId: string, communityId: string): Promise<CommunityDocument> {
    const community = await this.communityModel.findOne({
      _id: communityId,
      $or: [
        { createur: new Types.ObjectId(creatorId) },
        { admins: new Types.ObjectId(creatorId) }
      ]
    });

    if (!community) {
      throw new ForbiddenException('You can only manage campaigns for communities you own or admin');
    }

    return community;
  }

  private async sendEmailToRecipient(
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient
  ): Promise<void> {
    try {
      await this.emailService.sendGenericEmail({
        to: recipient.email,
        subject: campaign.subject,
        text: campaign.isHtml ? '' : (campaign.content || ''),
        html: campaign.isHtml ? (campaign.content || '') : undefined,
      });

      recipient.status = 'sent';
      recipient.sentAt = new Date();
      campaign.sentCount++;

      this.logger.debug(`Email sent successfully to ${recipient.email}`);
    } catch (error) {
      recipient.status = 'failed';
      recipient.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      campaign.failedCount++;

      this.logger.error(`Failed to send email to ${recipient.email}:`, error);
    }
  }

  private processInactiveUserContent(
    template: string,
    inactivityPeriod: InactivityPeriod,
    communityName: string
  ): string {
    let processedContent = template;

    // Replace template variables
    processedContent = processedContent.replace(/{{communityName}}/g, communityName);
    processedContent = processedContent.replace(/{{inactivityPeriod}}/g, this.getPeriodText(inactivityPeriod));
    processedContent = processedContent.replace(/{{daysThreshold}}/g, this.getDaysThreshold(inactivityPeriod).toString());

    return processedContent;
  }

  private getDaysThreshold(period: InactivityPeriod): number {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS: return 7;
      case InactivityPeriod.LAST_15_DAYS: return 15;
      case InactivityPeriod.LAST_30_DAYS: return 30;
      case InactivityPeriod.LAST_60_DAYS: return 60;
      case InactivityPeriod.MORE_THAN_60_DAYS: return 60;
      default: return 7;
    }
  }

  private getPeriodText(period: InactivityPeriod): string {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS: return '7 days';
      case InactivityPeriod.LAST_15_DAYS: return '15 days';
      case InactivityPeriod.LAST_30_DAYS: return '30 days';
      case InactivityPeriod.LAST_60_DAYS: return '60 days';
      case InactivityPeriod.MORE_THAN_60_DAYS: return 'more than 60 days';
      default: return '7 days';
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async updateReactivationEmailTracking(campaign: EmailCampaignDocument): Promise<void> {
    try {
      const promises = campaign.recipients.map(recipient =>
        this.userLoginActivityService.updateReactivationEmailSent(
          recipient.userId.toString(),
          campaign.communityId.toString()
        )
      );

      await Promise.all(promises);

      this.logger.log(`Updated reactivation email tracking for campaign ${campaign._id}`);
    } catch (error) {
      this.logger.error(`Error updating reactivation email tracking:`, error);
    }
  }

  private processContentReminderContent(
    template: string,
    contentType: string,
    communityName: string
  ): string {
    let processedContent = template;

    // Replace template variables
    processedContent = processedContent.replace(/{{communityName}}/g, communityName);
    processedContent = processedContent.replace(/{{contentType}}/g, contentType);

    // Add specific content type labels
    const contentTypeLabels: Record<string, string> = {
      'event': 'event',
      'challenge': 'challenge',
      'cours': 'course',
      'product': 'product',
      'session': 'session',
      'all': 'content'
    };

    processedContent = processedContent.replace(/{{contentTypeLabel}}/g, contentTypeLabels[contentType] || contentType);

    return processedContent;
  }

  /**
   * Cancel a scheduled campaign
   */
  async cancelCampaign(campaignId: string, creatorId: string): Promise<void> {
    try {
      const campaign = await this.emailCampaignModel.findById(campaignId);

      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }

      // Verify creator owns the campaign
      if (!campaign.creatorId.equals(creatorId)) {
        throw new ForbiddenException('You can only cancel campaigns you created');
      }

      // Only allow cancellation if campaign is scheduled
      if (campaign.status !== EmailCampaignStatus.SCHEDULED) {
        throw new BadRequestException('Only scheduled campaigns can be cancelled');
      }

      campaign.status = EmailCampaignStatus.CANCELLED;
      await campaign.save();

      this.logger.log(`Cancelled campaign ${campaignId}`);
    } catch (error) {
      this.logger.error(`Error cancelling campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Duplicate/copy a campaign
   */
  async duplicateCampaign(
    campaignId: string,
    creatorId: string,
    newTitle?: string
  ): Promise<EmailCampaignDocument> {
    try {
      const originalCampaign = await this.emailCampaignModel.findById(campaignId);

      if (!originalCampaign) {
        throw new NotFoundException('Campaign not found');
      }

      // Verify creator has access to the original campaign's community
      await this.verifyCommunityAccess(creatorId, originalCampaign.communityId.toString());

      // Get current community members for new recipient list
      const community = await this.communityModel.findById(originalCampaign.communityId);
      if (!community) {
        throw new NotFoundException('Community not found');
      }
      const members = await this.userModel.find({
        _id: { $in: community.members }
      }).select('_id email name');

      if (members.length === 0) {
        throw new BadRequestException('No members found in this community');
      }

      // Create new recipients list
      const recipients: EmailRecipient[] = members.map(member => ({
        userId: member._id,
        email: member.email,
        name: member.name,
        status: 'pending',
        opened: false,
        clickCount: 0
      }));

      const duplicatedCampaign = new this.emailCampaignModel({
        title: newTitle || `Copy of ${originalCampaign.title}`,
        subject: originalCampaign.subject,
        content: originalCampaign.content,
        communityId: originalCampaign.communityId,
        creatorId: new Types.ObjectId(creatorId),
        recipients,
        totalRecipients: recipients.length,
        type: originalCampaign.type,
        isHtml: originalCampaign.isHtml,
        trackOpens: originalCampaign.trackOpens,
        trackClicks: originalCampaign.trackClicks,
        metadata: originalCampaign.metadata,
        status: EmailCampaignStatus.DRAFT
      });

      const savedCampaign = await duplicatedCampaign.save();

      this.logger.log(`Duplicated campaign ${campaignId} as ${savedCampaign._id}`);

      return savedCampaign;
    } catch (error) {
      this.logger.error(`Error duplicating campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Get campaign recipients details
   */
  async getCampaignRecipients(
    campaignId: string,
    creatorId: string,
    query: { page?: number; limit?: number; status?: string; opened?: boolean }
  ): Promise<{ recipients: any[]; total: number; page: number; limit: number }> {
    try {
      const campaign = await this.getCampaign(campaignId, creatorId);

      // Build filter for recipients
      const filter: any = {};
      if (query.status) {
        filter.status = query.status;
      }
      if (query.opened !== undefined) {
        filter.opened = query.opened;
      }

      // Apply pagination
      const page = query.page || 1;
      const limit = Math.min(query.limit || 50, 100);
      const skip = (page - 1) * limit;

      // Filter recipients
      let filteredRecipients = campaign.recipients;
      if (query.status) {
        filteredRecipients = filteredRecipients.filter(r => r.status === query.status);
      }
      if (query.opened !== undefined) {
        filteredRecipients = filteredRecipients.filter(r => r.opened === query.opened);
      }

      const total = filteredRecipients.length;
      const recipients = filteredRecipients
        .slice(skip, skip + limit)
        .map(recipient => ({
          userId: recipient.userId,
          email: recipient.email,
          name: recipient.name,
          status: recipient.status,
          sentAt: recipient.sentAt,
          opened: recipient.opened,
          openedAt: recipient.openedAt,
          clickCount: recipient.clickCount,
          clickedAt: recipient.clickedAt,
          errorMessage: recipient.errorMessage
        }));

      return {
        recipients,
        total,
        page,
        limit
      };
    } catch (error) {
      this.logger.error(`Error getting campaign recipients ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(
    toEmail: string,
    subject: string,
    content: string,
    communityId?: string,
    isHtml: boolean = false
  ): Promise<void> {
    try {
      let processedSubject = subject;
      let processedContent = content;

      // Process template variables if communityId is provided
      if (communityId) {
        const community = await this.communityModel.findById(communityId);
        if (community) {
          processedSubject = processedSubject.replace(/{{communityName}}/g, community.name);
          processedContent = processedContent.replace(/{{communityName}}/g, community.name);
        }
      }

      await this.emailService.sendGenericEmail({
        to: toEmail,
        subject: processedSubject,
        text: isHtml ? '' : processedContent,
        html: isHtml ? processedContent : undefined,
      });

      this.logger.log(`Test email sent successfully to ${toEmail}`);
    } catch (error) {
      this.logger.error(`Error sending test email to ${toEmail}:`, error);
      throw error;
    }
  }
}
