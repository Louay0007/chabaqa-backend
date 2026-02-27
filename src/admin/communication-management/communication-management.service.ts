import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmailCampaign,
  EmailCampaignDocument,
  EmailCampaignStatus,
} from '../../schema/email-campaign.schema';
import { User, UserDocument } from '../../schema/user.schema';
import { Community, CommunityDocument } from '../../schema/community.schema';
import { Notification } from '../../schema/notification.schema';
import {
  NotificationConfig,
  NotificationConfigDocument,
} from '../schemas/notification-config.schema';
import {
  EmailTemplate,
  EmailTemplateDocument,
  TemplateCategory,
} from '../schemas/email-template.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationService } from '../../notification/notification.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { AdminAction } from '../schemas/audit-log.schema';
import {
  CreateEmailCampaignDto,
  AudienceTargetType,
} from './dto/create-email-campaign.dto';
import { UpdateEmailCampaignDto } from './dto/update-email-campaign.dto';
import { BulkMessageDto, MessageChannel } from './dto/bulk-message.dto';
import {
  CampaignFiltersDto,
  CampaignStatus,
} from './dto/campaign-filters.dto';
import {
  NotificationConfigDto,
  UpdateNotificationConfigDto,
} from './dto/notification-config.dto';
import {
  CommunicationMetricsDto,
  CampaignPerformanceDto,
  DeliveryStatusDto,
  EngagementStatisticsDto,
  CommunicationAnalyticsQueryDto,
} from './dto/communication-analytics.dto';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  TestEmailTemplateDto,
} from './dto/email-template.dto';

@Injectable()
export class CommunicationManagementService {
  constructor(
    @InjectModel(EmailCampaign.name)
    private emailCampaignModel: Model<EmailCampaignDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(NotificationConfig.name)
    private notificationConfigModel: Model<NotificationConfigDocument>,
    @InjectModel(EmailTemplate.name)
    private emailTemplateModel: Model<EmailTemplateDocument>,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Create email campaign with template selection and audience targeting
   */
  async createEmailCampaign(
    dto: CreateEmailCampaignDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailCampaign> {
    // Get target audience
    const targetUsers = await this.getTargetAudience(dto);

    if (targetUsers.length === 0) {
      throw new BadRequestException('No recipients found for the specified audience');
    }

    // Create campaign - Note: The schema requires communityId and creatorId
    // For admin campaigns, we'll use a default community or make these optional
    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      type: dto.type,
      communityId: dto.communityId
        ? new Types.ObjectId(dto.communityId)
        : new Types.ObjectId(), // Keep ObjectId valid even if campaign is global
      creatorId: new Types.ObjectId(adminId),
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      isHtml: dto.isHtml || false,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      templateId: dto.templateId,
      templateData: dto.personalizationVariables,
      metadata: {
        ...dto.metadata,
        audienceTarget: dto.audienceTarget,
        specificUserIds: dto.specificUserIds,
        targetRoles: dto.targetRoles,
      },
      status: dto.scheduledAt ? EmailCampaignStatus.SCHEDULED : EmailCampaignStatus.DRAFT,
      totalRecipients: targetUsers.length,
      createdAt: new Date(),
    });

    const savedCampaign = await campaign.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_CAMPAIGN_CREATE,
      entityType: 'email_campaign',
      entityId: savedCampaign._id,
      metadata: {
        title: dto.title,
        audienceTarget: dto.audienceTarget,
        recipientCount: targetUsers.length,
      },
      ipAddress,
      userAgent,
    });

    return savedCampaign;
  }

  /**
   * Send bulk message to targeted audience
   */
  async sendBulkMessage(
    dto: BulkMessageDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ sent: number; failed: number }> {
    // Get target audience
    const targetUsers = await this.getTargetAudienceForBulkMessage(dto);

    if (targetUsers.length === 0) {
      throw new BadRequestException('No recipients found for the specified audience');
    }

    let sent = 0;
    let failed = 0;

    // Send messages based on channel
    for (const user of targetUsers) {
      try {
        const personalizedContent = this.applyPersonalization(
          dto.content,
          user,
          dto.personalizationVariables,
        );

        // Send email if channel includes email
        if (dto.channel === MessageChannel.EMAIL || dto.channel === MessageChannel.BOTH) {
          await this.emailService.sendGenericEmail({
            to: user.email,
            subject: dto.title,
            text: personalizedContent,
          });
        }

        // Send in-app notification if channel includes in-app
        if (dto.channel === MessageChannel.IN_APP || dto.channel === MessageChannel.BOTH) {
          await this.notificationService.createNotification({
            recipient: user._id.toString(),
            title: dto.title,
            body: personalizedContent,
            type: 'system',
            data: dto.metadata,
          });
        }

        sent++;
      } catch (error) {
        failed++;
        console.error(`Failed to send message to user ${user._id}:`, error);
      }
    }

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.BULK_MESSAGE_SEND,
      entityType: 'bulk_message',
      entityId: new Types.ObjectId(adminId), // Use adminId as entity ID for bulk messages
      metadata: {
        title: dto.title,
        channel: dto.channel,
        audienceTarget: dto.audienceTarget,
        sent,
        failed,
      },
      ipAddress,
      userAgent,
    });

    return { sent, failed };
  }

  /**
   * Get campaigns with filtering and pagination
   */
  async getCampaigns(filters: CampaignFiltersDto): Promise<{
    data: EmailCampaign[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  }> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', ...filterCriteria } = filters;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};

    if (filterCriteria.status) {
      query.status = filterCriteria.status;
    }

    if (filterCriteria.type) {
      query.type = filterCriteria.type;
    }

    if (filterCriteria.communityId) {
      query.communityId = new Types.ObjectId(filterCriteria.communityId);
    }

    if (filterCriteria.search) {
      query.$or = [
        { title: { $regex: filterCriteria.search, $options: 'i' } },
        { subject: { $regex: filterCriteria.search, $options: 'i' } },
      ];
    }

    if (filterCriteria.startDate || filterCriteria.endDate) {
      query.createdAt = {};
      if (filterCriteria.startDate) {
        query.createdAt.$gte = new Date(filterCriteria.startDate);
      }
      if (filterCriteria.endDate) {
        query.createdAt.$lte = new Date(filterCriteria.endDate);
      }
    }

    // Execute query with pagination
    const sortOptions: any = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.emailCampaignModel
        .find(query)
        .populate('creatorId', 'name email username')
        .populate('communityId', 'name slug')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.emailCampaignModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  /**
   * Get a campaign by ID
   */
  async getCampaignById(id: string): Promise<EmailCampaign> {
    const campaign = await this.emailCampaignModel
      .findById(id)
      .populate('creatorId', 'name email username')
      .populate('communityId', 'name slug')
      .lean()
      .exec();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  /**
   * Update campaign details
   */
  async updateCampaign(
    id: string,
    dto: UpdateEmailCampaignDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailCampaign> {
    const campaign = await this.emailCampaignModel.findById(id).exec();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status === EmailCampaignStatus.SENDING || campaign.status === EmailCampaignStatus.SENT) {
      throw new BadRequestException('Cannot update a campaign that is already sending or sent');
    }

    const previousData = {
      title: campaign.title,
      subject: campaign.subject,
      content: campaign.content,
      type: campaign.type,
      status: campaign.status,
      scheduledAt: campaign.scheduledAt,
      metadata: campaign.metadata,
      totalRecipients: campaign.totalRecipients,
    };

    if (dto.title !== undefined) campaign.title = dto.title;
    if (dto.subject !== undefined) campaign.subject = dto.subject;
    if (dto.content !== undefined) campaign.content = dto.content;
    if (dto.type !== undefined) campaign.type = dto.type as any;
    if (dto.communityId !== undefined) {
      campaign.communityId = new Types.ObjectId(dto.communityId);
    }
    if (dto.templateId !== undefined) campaign.templateId = dto.templateId;
    if (dto.isHtml !== undefined) campaign.isHtml = dto.isHtml;
    if (dto.trackOpens !== undefined) campaign.trackOpens = dto.trackOpens;
    if (dto.trackClicks !== undefined) campaign.trackClicks = dto.trackClicks;
    if (dto.personalizationVariables !== undefined) {
      campaign.templateData = dto.personalizationVariables;
    }

    const metadata = { ...(campaign.metadata || {}) };
    if (dto.audienceTarget !== undefined) metadata.audienceTarget = dto.audienceTarget;
    if (dto.specificUserIds !== undefined) metadata.specificUserIds = dto.specificUserIds;
    if (dto.targetRoles !== undefined) metadata.targetRoles = dto.targetRoles;
    if (dto.metadata !== undefined) Object.assign(metadata, dto.metadata);
    campaign.metadata = metadata;

    if (dto.scheduledAt !== undefined) {
      campaign.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
      campaign.status = dto.scheduledAt
        ? EmailCampaignStatus.SCHEDULED
        : EmailCampaignStatus.DRAFT;
    }

    // Recompute audience count when targeting fields are changed.
    if (
      dto.audienceTarget !== undefined ||
      dto.specificUserIds !== undefined ||
      dto.targetRoles !== undefined ||
      dto.communityId !== undefined
    ) {
      const targetUsers = await this.getTargetAudienceFromCampaign(campaign);
      campaign.totalRecipients = targetUsers.length;
    }

    const updatedCampaign = await campaign.save();

    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.SYSTEM_CONFIGURATION,
      entityType: 'email_campaign',
      entityId: updatedCampaign._id,
      previousData: previousData as any,
      newData: {
        title: updatedCampaign.title,
        subject: updatedCampaign.subject,
        content: updatedCampaign.content,
        type: updatedCampaign.type,
        status: updatedCampaign.status,
        scheduledAt: updatedCampaign.scheduledAt,
        metadata: updatedCampaign.metadata,
        totalRecipients: updatedCampaign.totalRecipients,
      },
      metadata: { action: 'update_campaign' },
      ipAddress,
      userAgent,
    });

    return await this.getCampaignById(id);
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(
    id: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const campaign = await this.emailCampaignModel.findById(id).lean().exec();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status === EmailCampaignStatus.SENDING) {
      throw new BadRequestException('Cannot delete a campaign while it is being sent');
    }

    await this.emailCampaignModel.findByIdAndDelete(id).exec();

    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.SYSTEM_CONFIGURATION,
      entityType: 'email_campaign',
      entityId: new Types.ObjectId(id),
      metadata: {
        action: 'delete_campaign',
        title: campaign.title,
        status: campaign.status,
      },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Send an existing campaign immediately
   */
  async sendCampaignById(
    id: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailCampaign> {
    const campaign = await this.emailCampaignModel.findById(id).exec();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status === EmailCampaignStatus.SENDING) {
      throw new BadRequestException('Campaign is already sending');
    }

    if (campaign.status === EmailCampaignStatus.SENT) {
      throw new BadRequestException('Campaign has already been sent');
    }

    const targetUsers = await this.getTargetAudienceFromCampaign(campaign);

    if (!targetUsers.length) {
      throw new BadRequestException('No recipients found for this campaign');
    }

    campaign.totalRecipients = targetUsers.length;
    await campaign.save();

    await this.sendCampaign(campaign, targetUsers);

    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_CAMPAIGN_SEND,
      entityType: 'email_campaign',
      entityId: campaign._id,
      metadata: {
        title: campaign.title,
        recipientCount: targetUsers.length,
      },
      ipAddress,
      userAgent,
    });

    return await this.getCampaignById(id);
  }

  /**
   * Get communication metrics
   */
  async getCommunicationMetrics(
    query: CommunicationAnalyticsQueryDto,
  ): Promise<CommunicationMetricsDto> {
    const dateFilter: any = {};

    if (query.startDate || query.endDate) {
      dateFilter.createdAt = {};
      if (query.startDate) {
        dateFilter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.createdAt.$lte = new Date(query.endDate);
      }
    }

    if (query.communityId) {
      dateFilter.communityId = new Types.ObjectId(query.communityId);
    }

    // Get all campaigns in the period
    const campaigns = await this.emailCampaignModel
      .find({
        ...dateFilter,
        status: { $in: [EmailCampaignStatus.SENT, EmailCampaignStatus.SENDING] },
      })
      .lean()
      .exec();

    if (campaigns.length === 0) {
      return {
        totalCampaigns: 0,
        totalEmailsSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicks: 0,
        averageOpenRate: 0,
        averageClickRate: 0,
        averageDeliveryRate: 0,
        totalBounced: 0,
        bounceRate: 0,
      };
    }

    // Calculate metrics using schema field names
    const totalEmailsSent = campaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + (c.openCount || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clickCount || 0), 0);
    const totalFailed = campaigns.reduce((sum, c) => sum + (c.failedCount || 0), 0);
    const totalBounced = campaigns.reduce((sum, c) => {
      const bounced = c.recipients?.filter(r => r.status === 'bounced').length || 0;
      return sum + bounced;
    }, 0);

    const averageOpenRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    const averageClickRate = totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0;
    const averageDeliveryRate = totalEmailsSent > 0 ? (totalDelivered / totalEmailsSent) * 100 : 0;
    const bounceRate = totalEmailsSent > 0 ? (totalBounced / totalEmailsSent) * 100 : 0;

    return {
      totalCampaigns: campaigns.length,
      totalEmailsSent,
      totalDelivered,
      totalOpened,
      totalClicks,
      averageOpenRate: Math.round(averageOpenRate * 100) / 100,
      averageClickRate: Math.round(averageClickRate * 100) / 100,
      averageDeliveryRate: Math.round(averageDeliveryRate * 100) / 100,
      totalBounced,
      bounceRate: Math.round(bounceRate * 100) / 100,
    };
  }

  /**
   * Get campaign performance details
   */
  async getCampaignPerformance(
    query: CommunicationAnalyticsQueryDto,
  ): Promise<CampaignPerformanceDto[]> {
    const dateFilter: any = {};

    if (query.startDate || query.endDate) {
      dateFilter.sentAt = {};
      if (query.startDate) {
        dateFilter.sentAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.sentAt.$lte = new Date(query.endDate);
      }
    }

    if (query.communityId) {
      dateFilter.communityId = new Types.ObjectId(query.communityId);
    }

    const campaigns = await this.emailCampaignModel
      .find({
        ...dateFilter,
        status: EmailCampaignStatus.SENT,
      })
      .lean()
      .exec();

    return campaigns.map((campaign) => {
      const totalSent = campaign.totalRecipients || 0;
      const delivered = campaign.sentCount || 0;
      const opened = campaign.openCount || 0;
      const clicked = campaign.clickCount || 0;

      return {
        campaignId: campaign._id.toString(),
        title: campaign.title,
        totalSent,
        delivered,
        opened,
        clicked,
        openRate: delivered > 0 ? Math.round((opened / delivered) * 10000) / 100 : 0,
        clickRate: delivered > 0 ? Math.round((clicked / delivered) * 10000) / 100 : 0,
        deliveryRate: totalSent > 0 ? Math.round((delivered / totalSent) * 10000) / 100 : 0,
        sentAt: campaign.sentAt || campaign.createdAt,
      };
    });
  }

  /**
   * Get delivery status tracking
   */
  async getDeliveryStatus(
    query: CommunicationAnalyticsQueryDto,
  ): Promise<DeliveryStatusDto[]> {
    const dateFilter: any = {};

    if (query.startDate || query.endDate) {
      dateFilter.createdAt = {};
      if (query.startDate) {
        dateFilter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.createdAt.$lte = new Date(query.endDate);
      }
    }

    if (query.communityId) {
      dateFilter.communityId = new Types.ObjectId(query.communityId);
    }

    const campaigns = await this.emailCampaignModel
      .find(dateFilter)
      .lean()
      .exec();

    return campaigns.map((campaign) => {
      const totalRecipients = campaign.totalRecipients || 0;
      const delivered = campaign.sentCount || 0;
      const failed = campaign.failedCount || 0;
      const bounced = campaign.recipients?.filter(r => r.status === 'bounced').length || 0;
      const pending = Math.max(0, totalRecipients - delivered - failed - bounced);

      return {
        campaignId: campaign._id.toString(),
        title: campaign.title,
        totalRecipients,
        pending,
        sent: delivered,
        failed,
        bounced,
        status: campaign.status,
        lastUpdated: campaign.updatedAt || campaign.createdAt,
      };
    });
  }

  /**
   * Get engagement statistics
   */
  async getEngagementStatistics(
    query: CommunicationAnalyticsQueryDto,
  ): Promise<EngagementStatisticsDto> {
    const dateFilter: any = {};

    if (query.startDate || query.endDate) {
      dateFilter.createdAt = {};
      if (query.startDate) {
        dateFilter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.createdAt.$lte = new Date(query.endDate);
      }
    }

    if (query.communityId) {
      dateFilter.communityId = new Types.ObjectId(query.communityId);
    }

    const campaigns = await this.emailCampaignModel
      .find({
        ...dateFilter,
        status: EmailCampaignStatus.SENT,
      })
      .lean()
      .exec();

    if (campaigns.length === 0) {
      return {
        period: this.getPeriodLabel(query),
        campaignsCount: 0,
        totalRecipients: 0,
        uniqueEngaged: 0,
        engagementRate: 0,
        averageTimeToOpen: 0,
        averageTimeToClick: 0,
        bestCampaign: { id: '', title: '', openRate: 0 },
        worstCampaign: { id: '', title: '', openRate: 0 },
      };
    }

    const totalRecipients = campaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + (c.openCount || 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);

    // Calculate engagement rate (users who opened at least one email)
    const uniqueEngaged = totalOpened; // Simplified - in real implementation, track unique users
    const engagementRate = totalRecipients > 0 ? (uniqueEngaged / totalRecipients) * 100 : 0;

    // Find best and worst performing campaigns
    const campaignsWithRates = campaigns.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      openRate: c.sentCount > 0 ? (c.openCount / c.sentCount) * 100 : 0,
    }));

    campaignsWithRates.sort((a, b) => b.openRate - a.openRate);

    return {
      period: this.getPeriodLabel(query),
      campaignsCount: campaigns.length,
      totalRecipients,
      uniqueEngaged,
      engagementRate: Math.round(engagementRate * 100) / 100,
      averageTimeToOpen: 2.5, // Placeholder - would need tracking data
      averageTimeToClick: 3.2, // Placeholder - would need tracking data
      bestCampaign: campaignsWithRates[0] || { id: '', title: '', openRate: 0 },
      worstCampaign: campaignsWithRates[campaignsWithRates.length - 1] || { id: '', title: '', openRate: 0 },
    };
  }

  /**
   * Create notification configuration
   */
  async createNotificationConfig(
    dto: NotificationConfigDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<NotificationConfig> {
    // Check if configuration with same name already exists
    const existing = await this.notificationConfigModel.findOne({ name: dto.name });
    if (existing) {
      throw new BadRequestException(`Notification configuration with name "${dto.name}" already exists`);
    }

    const config = new this.notificationConfigModel({
      type: dto.type,
      name: dto.name,
      description: dto.description,
      enabledMethods: dto.enabledMethods,
      isEnabled: dto.isEnabled !== false,
      userControllable: dto.userControllable !== false,
      defaultEnabled: dto.defaultEnabled !== false,
      priority: dto.priority || 'normal',
      metadata: dto.metadata,
      createdBy: new Types.ObjectId(adminId),
      createdAt: new Date(),
    });

    const savedConfig = await config.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.NOTIFICATION_CONFIG_CREATE,
      entityType: 'notification_config',
      entityId: savedConfig._id,
      metadata: {
        name: dto.name,
        type: dto.type,
        enabledMethods: dto.enabledMethods,
      },
      ipAddress,
      userAgent,
    });

    return savedConfig;
  }

  /**
   * Get all notification configurations
   */
  async getNotificationConfigs(): Promise<NotificationConfig[]> {
    return await this.notificationConfigModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Get notification configuration by ID
   */
  async getNotificationConfigById(id: string): Promise<NotificationConfig> {
    const config = await this.notificationConfigModel.findById(id).lean().exec();

    if (!config) {
      throw new NotFoundException('Notification configuration not found');
    }

    return config;
  }

  /**
   * Update notification configuration
   */
  async updateNotificationConfig(
    id: string,
    dto: UpdateNotificationConfigDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<NotificationConfig> {
    const config = await this.notificationConfigModel.findById(id);

    if (!config) {
      throw new NotFoundException('Notification configuration not found');
    }

    // Update fields
    if (dto.description !== undefined) config.description = dto.description;
    if (dto.enabledMethods !== undefined) config.enabledMethods = dto.enabledMethods;
    if (dto.isEnabled !== undefined) config.isEnabled = dto.isEnabled;
    if (dto.userControllable !== undefined) config.userControllable = dto.userControllable;
    if (dto.defaultEnabled !== undefined) config.defaultEnabled = dto.defaultEnabled;
    if (dto.priority !== undefined) config.priority = dto.priority;
    if (dto.metadata !== undefined) config.metadata = dto.metadata;

    config.updatedAt = new Date();

    const updatedConfig = await config.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.NOTIFICATION_CONFIG_UPDATE,
      entityType: 'notification_config',
      entityId: updatedConfig._id,
      metadata: {
        name: config.name,
        changes: dto,
      },
      ipAddress,
      userAgent,
    });

    return updatedConfig;
  }

  /**
   * Delete notification configuration
   */
  async deleteNotificationConfig(
    id: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const config = await this.notificationConfigModel.findById(id);

    if (!config) {
      throw new NotFoundException('Notification configuration not found');
    }

    await this.notificationConfigModel.findByIdAndDelete(id);

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.NOTIFICATION_CONFIG_DELETE,
      entityType: 'notification_config',
      entityId: new Types.ObjectId(id),
      metadata: {
        name: config.name,
        type: config.type,
      },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Get user notification preferences
   */
  async getUserNotificationPreferences(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).lean().exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get all notification configurations
    const configs = await this.notificationConfigModel.find().lean().exec();

    // Get user's notification preferences (assuming stored in user document)
    const userPreferences = (user as any).notificationPreferences || {};

    return {
      userId,
      userName: user.name,
      userEmail: user.email,
      preferences: configs.map((config) => ({
        configId: config._id.toString(),
        name: config.name,
        type: config.type,
        description: config.description,
        userControllable: config.userControllable,
        enabled: userPreferences[config.name] !== undefined
          ? userPreferences[config.name]
          : config.defaultEnabled,
        enabledMethods: config.enabledMethods,
      })),
    };
  }

  /**
   * Get notification delivery statistics
   */
  async getNotificationDeliveryStats(
    query: CommunicationAnalyticsQueryDto,
  ): Promise<any> {
    const dateFilter: any = {};

    if (query.startDate || query.endDate) {
      dateFilter.createdAt = {};
      if (query.startDate) {
        dateFilter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.createdAt.$lte = new Date(query.endDate);
      }
    }

    const notifications = await this.notificationModel
      .find(dateFilter)
      .lean()
      .exec();

    const totalSent = notifications.length;
    const totalRead = notifications.filter((n) => n.isRead).length;
    const readRate = totalSent > 0 ? (totalRead / totalSent) * 100 : 0;

    // Group by type
    const byType: Record<string, { sent: number; read: number }> = {};
    notifications.forEach((n) => {
      if (!byType[n.type]) {
        byType[n.type] = { sent: 0, read: 0 };
      }
      byType[n.type].sent++;
      if (n.isRead) {
        byType[n.type].read++;
      }
    });

    return {
      period: this.getPeriodLabel(query),
      totalSent,
      totalRead,
      readRate: Math.round(readRate * 100) / 100,
      byType: Object.entries(byType).map(([type, stats]) => ({
        type,
        sent: stats.sent,
        read: stats.read,
        readRate: stats.sent > 0 ? Math.round((stats.read / stats.sent) * 10000) / 100 : 0,
      })),
    };
  }

  private normalizeTargetRole(role: string): string {
    if (!role) return role;
    const normalized = role.toLowerCase();
    if (normalized === 'member' || normalized === 'members') {
      return 'user';
    }
    return normalized;
  }

  private getLegacyAudienceTarget(targetAudience?: string): AudienceTargetType | undefined {
    switch ((targetAudience || '').toLowerCase()) {
      case 'all':
        return AudienceTargetType.ALL_USERS;
      case 'creators':
        return AudienceTargetType.USER_ROLE;
      case 'members':
        return AudienceTargetType.USER_ROLE;
      case 'custom':
        return AudienceTargetType.SPECIFIC_USERS;
      default:
        return undefined;
    }
  }

  private async getTargetAudienceFromCampaign(campaign: any): Promise<any[]> {
    const metadata = campaign.metadata || {};
    const audienceTarget =
      metadata.audienceTarget ||
      this.getLegacyAudienceTarget(metadata.targetAudience) ||
      AudienceTargetType.ALL_USERS;

    const specificUserIds: string[] =
      metadata.specificUserIds || metadata.customAudienceIds || [];

    const legacyRoleFromAudience =
      metadata.targetAudience === 'creators'
        ? ['creator']
        : metadata.targetAudience === 'members'
        ? ['user']
        : [];
    const targetRoles: string[] =
      metadata.targetRoles && Array.isArray(metadata.targetRoles)
        ? metadata.targetRoles
        : legacyRoleFromAudience;

    return await this.getTargetAudience({
      title: campaign.title || 'Campaign',
      subject: campaign.subject || 'Campaign',
      content: campaign.content || '',
      type: campaign.type || 'custom',
      audienceTarget,
      communityId: campaign.communityId?.toString?.(),
      specificUserIds,
      targetRoles: targetRoles.map((role) => this.normalizeTargetRole(role)),
    } as any);
  }

  /**
   * Helper: Get target audience for email campaign
   */
  private async getTargetAudience(dto: CreateEmailCampaignDto): Promise<any[]> {
    let query: any = {};

    switch (dto.audienceTarget) {
      case AudienceTargetType.ALL_USERS:
        // No filter - get all users
        break;

      case AudienceTargetType.COMMUNITY_MEMBERS:
        if (!dto.communityId) {
          throw new BadRequestException('Community ID is required for community members targeting');
        }
        // Get users who are members of the specified community
        const community = await this.communityModel.findById(dto.communityId);
        if (!community) {
          throw new NotFoundException('Community not found');
        }
        query._id = { $in: community.members || [] };
        break;

      case AudienceTargetType.ACTIVE_USERS:
        // Users who logged in within last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query.lastLoginAt = { $gte: thirtyDaysAgo };
        break;

      case AudienceTargetType.INACTIVE_USERS:
        // Users who haven't logged in for 30+ days
        const inactiveDate = new Date();
        inactiveDate.setDate(inactiveDate.getDate() - 30);
        query.lastLoginAt = { $lt: inactiveDate };
        break;

      case AudienceTargetType.SPECIFIC_USERS:
        if (!dto.specificUserIds || dto.specificUserIds.length === 0) {
          throw new BadRequestException('Specific user IDs are required for specific users targeting');
        }
        query._id = { $in: dto.specificUserIds.map((id) => new Types.ObjectId(id)) };
        break;

      case AudienceTargetType.USER_ROLE:
        if (!dto.targetRoles || dto.targetRoles.length === 0) {
          throw new BadRequestException('Target roles are required for user role targeting');
        }
        query.role = { $in: dto.targetRoles.map((role) => this.normalizeTargetRole(role)) };
        break;

      default:
        throw new BadRequestException(`Invalid audience target type: ${dto.audienceTarget}`);
    }

    return await this.userModel.find(query).lean().exec();
  }

  /**
   * Helper: Get target audience for bulk message
   */
  private async getTargetAudienceForBulkMessage(dto: BulkMessageDto): Promise<any[]> {
    let query: any = {};

    switch (dto.audienceTarget) {
      case AudienceTargetType.ALL_USERS:
        break;

      case AudienceTargetType.COMMUNITY_MEMBERS:
        if (!dto.communityId) {
          throw new BadRequestException('Community ID is required for community members targeting');
        }
        const community = await this.communityModel.findById(dto.communityId);
        if (!community) {
          throw new NotFoundException('Community not found');
        }
        query._id = { $in: community.members || [] };
        break;

      case AudienceTargetType.ACTIVE_USERS:
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query.lastLoginAt = { $gte: thirtyDaysAgo };
        break;

      case AudienceTargetType.INACTIVE_USERS:
        const inactiveDate = new Date();
        inactiveDate.setDate(inactiveDate.getDate() - 30);
        query.lastLoginAt = { $lt: inactiveDate };
        break;

      case AudienceTargetType.SPECIFIC_USERS:
        if (!dto.specificUserIds || dto.specificUserIds.length === 0) {
          throw new BadRequestException('Specific user IDs are required for specific users targeting');
        }
        query._id = { $in: dto.specificUserIds.map((id) => new Types.ObjectId(id)) };
        break;

      case AudienceTargetType.USER_ROLE:
        if (!dto.targetRoles || dto.targetRoles.length === 0) {
          throw new BadRequestException('Target roles are required for user role targeting');
        }
        query.role = { $in: dto.targetRoles.map((role) => this.normalizeTargetRole(role)) };
        break;

      default:
        throw new BadRequestException(`Invalid audience target type: ${dto.audienceTarget}`);
    }

    return await this.userModel.find(query).lean().exec();
  }

  /**
   * Helper: Apply personalization to content
   */
  private applyPersonalization(
    content: string,
    user: any,
    variables?: Record<string, any>,
  ): string {
    let personalizedContent = content;

    // Replace common variables
    personalizedContent = personalizedContent.replace(/\{\{name\}\}/g, user.name || 'User');
    personalizedContent = personalizedContent.replace(/\{\{email\}\}/g, user.email || '');
    personalizedContent = personalizedContent.replace(/\{\{firstName\}\}/g, user.name?.split(' ')[0] || 'User');

    // Replace custom variables if provided
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        personalizedContent = personalizedContent.replace(regex, String(value));
      });
    }

    return personalizedContent;
  }

  /**
   * Helper: Send campaign to recipients
   */
  private async sendCampaign(
    campaign: EmailCampaignDocument,
    recipients: any[],
  ): Promise<void> {
    campaign.status = EmailCampaignStatus.SENDING;
    campaign.sentAt = new Date();
    await campaign.save();

    let delivered = 0;
    let failed = 0;

    for (const user of recipients) {
      try {
        const personalizedContent = this.personalizeContent(
          campaign.content,
          user,
          campaign.templateData,
        );

        await this.emailService.sendGenericEmail({
          to: user.email || '',
          subject: campaign.subject,
          html: campaign.isHtml ? personalizedContent : '',
          text: !campaign.isHtml ? personalizedContent : '',
        });

        delivered++;
      } catch (error) {
        console.error(`Failed to send email to ${user.email}:`, error);
        failed++;
      }
    }

    // Update campaign statistics
    campaign.status = EmailCampaignStatus.SENT;
    campaign.sentCount = delivered;
    campaign.failedCount = failed;
    await campaign.save();
  }

  /**
   * Helper: Personalize email content
   */
  private personalizeContent(
    content: string,
    user: any,
    variables?: Record<string, any>,
  ): string {
    return this.applyPersonalization(content, user, variables);
  }

  /**
   * Helper: Get period label for analytics
   */
  private getPeriodLabel(query: CommunicationAnalyticsQueryDto): string {
    if (query.startDate && query.endDate) {
      return `${query.startDate} to ${query.endDate}`;
    }
    if (query.startDate) {
      return `From ${query.startDate}`;
    }
    if (query.endDate) {
      return `Until ${query.endDate}`;
    }
    return 'All time';
  }

  /**
   * Email Template Management Methods
   */

  /**
   * Create email template
   */
  async createEmailTemplate(
    dto: CreateEmailTemplateDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailTemplate> {
    // Check if template with same name already exists
    const existing = await this.emailTemplateModel.findOne({ name: dto.name });
    if (existing) {
      throw new BadRequestException(`Email template with name "${dto.name}" already exists`);
    }

    // Extract variables from content and subject
    const extractedVariables = this.extractTemplateVariables(dto.content, dto.subject);
    const variables = dto.variables || extractedVariables;

    const template = new this.emailTemplateModel({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      subject: dto.subject,
      content: dto.content,
      variables,
      isActive: dto.isActive !== false,
      tags: dto.tags || [],
      metadata: dto.metadata || {},
      createdBy: new Types.ObjectId(adminId),
      currentVersion: 1,
      versionHistory: [
        {
          version: 1,
          subject: dto.subject,
          content: dto.content,
          createdBy: new Types.ObjectId(adminId),
          createdAt: new Date(),
          changeNotes: 'Initial version',
        },
      ],
      usageCount: 0,
      createdAt: new Date(),
    });

    const savedTemplate = await template.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_TEMPLATE_CREATE,
      entityType: 'email_template',
      entityId: savedTemplate._id,
      metadata: {
        name: dto.name,
        category: dto.category,
      },
      ipAddress,
      userAgent,
    });

    return savedTemplate;
  }

  /**
   * Get all email templates with filtering
   */
  async getEmailTemplates(filters?: {
    category?: TemplateCategory;
    isActive?: boolean;
    search?: string;
    tags?: string[];
  }): Promise<EmailTemplate[]> {
    const query: any = {};

    if (filters?.category) {
      query.category = filters.category;
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    if (filters?.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    return await this.emailTemplateModel
      .find(query)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Get email template by ID
   */
  async getEmailTemplateById(id: string): Promise<EmailTemplate> {
    const template = await this.emailTemplateModel
      .findById(id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .lean()
      .exec();

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return template;
  }

  /**
   * Update email template
   */
  async updateEmailTemplate(
    id: string,
    dto: UpdateEmailTemplateDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailTemplate> {
    const template = await this.emailTemplateModel.findById(id);

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    // Track if content or subject changed for versioning
    const contentChanged = dto.content && dto.content !== template.content;
    const subjectChanged = dto.subject && dto.subject !== template.subject;

    // Update fields
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.category !== undefined) template.category = dto.category;
    if (dto.subject !== undefined) template.subject = dto.subject;
    if (dto.content !== undefined) template.content = dto.content;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;
    if (dto.tags !== undefined) template.tags = dto.tags;
    if (dto.metadata !== undefined) template.metadata = dto.metadata;

    // Update variables if content or subject changed
    if (contentChanged || subjectChanged) {
      const extractedVariables = this.extractTemplateVariables(
        template.content,
        template.subject,
      );
      template.variables = dto.variables || extractedVariables;
    } else if (dto.variables !== undefined) {
      template.variables = dto.variables;
    }

    template.lastModifiedBy = new Types.ObjectId(adminId);
    template.updatedAt = new Date();

    // Create new version if content or subject changed
    if (contentChanged || subjectChanged) {
      template.currentVersion += 1;
      template.versionHistory.push({
        version: template.currentVersion,
        subject: template.subject,
        content: template.content,
        createdBy: new Types.ObjectId(adminId),
        createdAt: new Date(),
        changeNotes: 'Template updated',
      });
    }

    const updatedTemplate = await template.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_TEMPLATE_UPDATE,
      entityType: 'email_template',
      entityId: updatedTemplate._id,
      metadata: {
        name: template.name,
        changes: dto,
        newVersion: contentChanged || subjectChanged ? template.currentVersion : undefined,
      },
      ipAddress,
      userAgent,
    });

    return updatedTemplate;
  }

  /**
   * Delete email template
   */
  async deleteEmailTemplate(
    id: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const template = await this.emailTemplateModel.findById(id);

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    await this.emailTemplateModel.findByIdAndDelete(id);

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_TEMPLATE_DELETE,
      entityType: 'email_template',
      entityId: new Types.ObjectId(id),
      metadata: {
        name: template.name,
        category: template.category,
      },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Get template version history
   */
  async getTemplateVersionHistory(id: string): Promise<any[]> {
    const template = await this.emailTemplateModel
      .findById(id)
      .populate('versionHistory.createdBy', 'name email')
      .lean()
      .exec();

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return template.versionHistory || [];
  }

  /**
   * Restore template to specific version
   */
  async restoreTemplateVersion(
    id: string,
    version: number,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailTemplate> {
    const template = await this.emailTemplateModel.findById(id);

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    const versionToRestore = template.versionHistory.find((v) => v.version === version);

    if (!versionToRestore) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    // Update template with version content
    template.subject = versionToRestore.subject;
    template.content = versionToRestore.content;
    template.variables = this.extractTemplateVariables(
      versionToRestore.content,
      versionToRestore.subject,
    );
    template.lastModifiedBy = new Types.ObjectId(adminId);
    template.updatedAt = new Date();

    // Create new version entry
    template.currentVersion += 1;
    template.versionHistory.push({
      version: template.currentVersion,
      subject: template.subject,
      content: template.content,
      createdBy: new Types.ObjectId(adminId),
      createdAt: new Date(),
      changeNotes: `Restored from version ${version}`,
    });

    const updatedTemplate = await template.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_TEMPLATE_UPDATE,
      entityType: 'email_template',
      entityId: updatedTemplate._id,
      metadata: {
        name: template.name,
        action: 'restore_version',
        restoredFromVersion: version,
        newVersion: template.currentVersion,
      },
      ipAddress,
      userAgent,
    });

    return updatedTemplate;
  }

  /**
   * Preview template with test data
   */
  async previewTemplate(id: string, testData?: Record<string, any>): Promise<{
    subject: string;
    content: string;
    variables: string[];
  }> {
    const template = await this.emailTemplateModel.findById(id).lean().exec();

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    // Apply test data to template
    const previewSubject = this.applyTemplateVariables(template.subject, testData || {});
    const previewContent = this.applyTemplateVariables(template.content, testData || {});

    return {
      subject: previewSubject,
      content: previewContent,
      variables: template.variables,
    };
  }

  /**
   * Send test email with template
   */
  async sendTestEmail(
    id: string,
    dto: TestEmailTemplateDto,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const template = await this.emailTemplateModel.findById(id);

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    // Apply test data to template
    const testSubject = this.applyTemplateVariables(
      template.subject,
      dto.testData || {},
    );
    const testContent = this.applyTemplateVariables(
      template.content,
      dto.testData || {},
    );

    // Send test email
    await this.emailService.sendGenericEmail({
      to: dto.testEmail,
      subject: `[TEST] ${testSubject}`,
      text: testContent,
      html: testContent,
    });

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_TEMPLATE_TEST,
      entityType: 'email_template',
      entityId: template._id,
      metadata: {
        name: template.name,
        testEmail: dto.testEmail,
      },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Duplicate template
   */
  async duplicateTemplate(
    id: string,
    newName: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<EmailTemplate> {
    const originalTemplate = await this.emailTemplateModel.findById(id).lean().exec();

    if (!originalTemplate) {
      throw new NotFoundException('Email template not found');
    }

    // Check if new name already exists
    const existing = await this.emailTemplateModel.findOne({ name: newName });
    if (existing) {
      throw new BadRequestException(`Email template with name "${newName}" already exists`);
    }

    const duplicatedTemplate = new this.emailTemplateModel({
      name: newName,
      description: `Copy of ${originalTemplate.description}`,
      category: originalTemplate.category,
      subject: originalTemplate.subject,
      content: originalTemplate.content,
      variables: originalTemplate.variables,
      isActive: false, // Start as inactive
      tags: originalTemplate.tags,
      metadata: { ...originalTemplate.metadata, duplicatedFrom: originalTemplate._id },
      createdBy: new Types.ObjectId(adminId),
      currentVersion: 1,
      versionHistory: [
        {
          version: 1,
          subject: originalTemplate.subject,
          content: originalTemplate.content,
          createdBy: new Types.ObjectId(adminId),
          createdAt: new Date(),
          changeNotes: `Duplicated from template: ${originalTemplate.name}`,
        },
      ],
      usageCount: 0,
      createdAt: new Date(),
    });

    const savedTemplate = await duplicatedTemplate.save();

    // Log audit trail
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.EMAIL_TEMPLATE_CREATE,
      entityType: 'email_template',
      entityId: savedTemplate._id,
      metadata: {
        name: newName,
        duplicatedFrom: originalTemplate._id,
        originalName: originalTemplate.name,
      },
      ipAddress,
      userAgent,
    });

    return savedTemplate;
  }

  /**
   * Helper: Extract template variables from content
   */
  private extractTemplateVariables(content: string, subject: string): string[] {
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();

    // Extract from content
    let match;
    while ((match = variablePattern.exec(content)) !== null) {
      variables.add(match[1]);
    }

    // Extract from subject
    variablePattern.lastIndex = 0;
    while ((match = variablePattern.exec(subject)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Helper: Apply variables to template
   */
  private applyTemplateVariables(
    template: string,
    data: Record<string, any>,
  ): string {
    let result = template;

    // Replace all variables
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    });

    return result;
  }
}
