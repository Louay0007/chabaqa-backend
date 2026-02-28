import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CampaignStatsDto,
  CreateContentReminderDto,
  CreateEmailCampaignDto,
  CreateInactiveUserCampaignDto,
  EmailCampaignQueryDto,
  InactiveUserQueryDto,
  InactiveUserStatsDto,
  UpdateEmailCampaignDto,
} from '../dto-email-campaign/email-campaign.dto';
import { EmailService } from '../common/services/email.service';
import { Community, CommunityDocument } from '../schema/community.schema';
import {
  EmailCampaign,
  EmailCampaignDocument,
  EmailCampaignStatus,
  EmailCampaignType,
  EmailRecipient,
  InactivityPeriod,
} from '../schema/email-campaign.schema';
import { User, UserDocument } from '../schema/user.schema';
import { UserLoginActivityDocument } from '../schema/user-login-activity.schema';
import { UserLoginActivityService } from '../user-login-activity/user-login-activity.service';
import { contentTypeToLabel, inactivityPeriodToText, renderTemplate } from './email-campaign-template.util';
import { EmailCampaignQueueService } from './email-campaign.queue';
import { EmailCampaignSendJobPayload } from './email-campaign.jobs';

type RecipientsQuery = { page?: number; limit?: number; status?: string; opened?: boolean };

@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);

  constructor(
    @InjectModel(EmailCampaign.name)
    private readonly emailCampaignModel: Model<EmailCampaignDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    private readonly emailService: EmailService,
    private readonly userLoginActivityService: UserLoginActivityService,
    private readonly emailCampaignQueueService: EmailCampaignQueueService,
  ) {}

  async createCampaign(creatorId: string, dto: CreateEmailCampaignDto): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    const recipients = await this.buildCommunityRecipients(community);
    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      scheduledAt,
      type: dto.type || EmailCampaignType.CUSTOM,
      status,
      isHtml: dto.isHtml || false,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      metadata: dto.metadata || {},
    });

    const savedCampaign = await campaign.save();
    await this.enqueueIfScheduled(savedCampaign, creatorId, 'scheduled');

    this.logger.log(
      `Created campaign ${savedCampaign._id.toString()} for community ${dto.communityId} with ${recipients.length} recipients`,
    );

    return savedCampaign;
  }

  async createInactiveUserCampaign(
    creatorId: string,
    dto: CreateInactiveUserCampaignDto,
  ): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    const inactiveUsers = await this.getInactiveUsersForCampaign(dto);
    const recipients = inactiveUsers.map((userActivity) => {
      const user = userActivity.userId as any;
      return {
        userId: user._id,
        email: user.email,
        name: user.name,
        status: 'pending',
        opened: false,
        clickCount: 0,
      } as EmailRecipient;
    });

    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);
    const targetDaysThreshold = this.getDaysThreshold(dto.inactivityPeriod);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      isInactiveUserCampaign: true,
      targetInactivityPeriod: dto.inactivityPeriod,
      targetDaysThreshold,
      targetAllInactive: dto.targetAllInactive || false,
      scheduledAt,
      type: EmailCampaignType.INACTIVE_USER_REACTIVATION,
      status,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      isHtml: dto.isHtml || false,
      metadata: {
        ...dto.metadata,
        reactivationCampaign: true,
        targetPeriod: dto.inactivityPeriod,
        targetDaysThreshold,
        communityName: community.name,
      },
    });

    const savedCampaign = await campaign.save();
    await this.enqueueIfScheduled(savedCampaign, creatorId, 'scheduled');

    return savedCampaign;
  }

  async createAndSendContentReminder(
    creatorId: string,
    dto: CreateContentReminderDto,
  ): Promise<{ campaignId: string; queued: true }> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    const recipients = await this.buildCommunityRecipients(community);
    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      scheduledAt,
      type: EmailCampaignType.CUSTOM,
      status,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      isHtml: dto.isHtml || false,
      metadata: {
        ...dto.metadata,
        contentReminder: true,
        contentType: dto.contentType,
        contentId: dto.contentId,
        communityName: community.name,
      },
    });

    const savedCampaign = await campaign.save();
    await this.emailCampaignQueueService.queueCampaignSend(
      {
        campaignId: savedCampaign._id.toString(),
        requestedBy: creatorId,
        trigger: scheduledAt ? 'scheduled' : 'content-reminder',
      },
      scheduledAt,
    );

    return { campaignId: savedCampaign._id.toString(), queued: true };
  }

  async sendCampaign(
    campaignId: string,
    creatorId: string,
  ): Promise<{ queued: true; campaignId: string; message: string }> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only send campaigns you created');
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be sent in current status');
    }

    campaign.status = EmailCampaignStatus.DRAFT;
    campaign.scheduledAt = undefined;
    await campaign.save();

    await this.emailCampaignQueueService.queueCampaignSend({
      campaignId,
      requestedBy: creatorId,
      trigger: 'manual',
    });

    return {
      queued: true,
      campaignId,
      message: 'Campaign queued for sending',
    };
  }

  async executeSendCampaignJob(payload: EmailCampaignSendJobPayload): Promise<void> {
    const { campaignId } = payload;
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();

    if (!campaign) {
      this.logger.warn(`Skipping send job for missing campaign ${campaignId}`);
      return;
    }

    if (campaign.status === EmailCampaignStatus.CANCELLED || campaign.status === EmailCampaignStatus.SENT) {
      this.logger.log(`Skipping campaign ${campaignId} with status ${campaign.status}`);
      return;
    }
    if (campaign.status === EmailCampaignStatus.SENDING) {
      this.logger.warn(`Skipping campaign ${campaignId} because it is already sending`);
      return;
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      this.logger.warn(`Campaign ${campaignId} has unsupported status ${campaign.status}`);
      return;
    }

    const community = await this.communityModel.findById(campaign.communityId).select('name').lean().exec();
    const communityName = community?.name || '';

    campaign.status = EmailCampaignStatus.SENDING;
    await campaign.save();

    const recipientsToProcess = campaign.recipients.filter((recipient) => recipient.status !== 'sent');
    if (recipientsToProcess.length === 0) {
      campaign.sentCount = campaign.recipients.filter((recipient) => recipient.status === 'sent').length;
      campaign.failedCount = campaign.recipients.filter((recipient) => recipient.status === 'failed').length;
      campaign.status = campaign.failedCount > 0 ? EmailCampaignStatus.FAILED : EmailCampaignStatus.SENT;
      campaign.sentAt = new Date();
      await campaign.save();
      return;
    }

    const batchSize = 10;
    const batches = this.chunkArray(recipientsToProcess, batchSize);

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      await Promise.allSettled(
        batch.map((recipient) => this.sendEmailToRecipient(campaign, recipient, communityName)),
      );

      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    campaign.sentCount = campaign.recipients.filter((recipient) => recipient.status === 'sent').length;
    campaign.failedCount = campaign.recipients.filter((recipient) => recipient.status === 'failed').length;
    campaign.sentAt = new Date();
    campaign.status =
      campaign.sentCount > 0 ? EmailCampaignStatus.SENT : EmailCampaignStatus.FAILED;
    await campaign.save();

    if (campaign.isInactiveUserCampaign) {
      await this.updateReactivationEmailTracking(campaign);
    }
  }

  async markCampaignSendFailed(campaignId: string, errorMessage: string): Promise<void> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) return;
    if (
      campaign.status === EmailCampaignStatus.SENT ||
      campaign.status === EmailCampaignStatus.CANCELLED
    ) {
      return;
    }

    campaign.status = EmailCampaignStatus.FAILED;
    campaign.metadata = {
      ...(campaign.metadata || {}),
      queueError: errorMessage,
      queueFailedAt: new Date().toISOString(),
    };
    if (!campaign.sentAt) {
      campaign.sentAt = new Date();
    }
    await campaign.save();
  }

  async getCommunityCampaigns(
    creatorId: string,
    communityId: string,
    query: EmailCampaignQueryDto,
  ): Promise<{ campaigns: EmailCampaignDocument[]; total: number; page: number; limit: number }> {
    await this.verifyCommunityAccess(creatorId, communityId);

    const filter: Record<string, any> = {
      communityId: new Types.ObjectId(communityId),
    };

    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.inactiveUserCampaigns !== undefined) {
      filter.isInactiveUserCampaign = query.inactiveUserCampaigns;
    }
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { subject: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      this.emailCampaignModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('creatorId', 'name email')
        .exec(),
      this.emailCampaignModel.countDocuments(filter).exec(),
    ]);

    return { campaigns, total, page, limit };
  }

  async getCampaignStats(creatorId: string, communityId: string): Promise<CampaignStatsDto> {
    await this.verifyCommunityAccess(creatorId, communityId);

    const campaigns = await this.emailCampaignModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .lean()
      .exec();

    const totalCampaigns = campaigns.length;
    const totalEmailsSent = campaigns.reduce((sum, campaign) => sum + (campaign.sentCount || 0), 0);
    const totalEmailsFailed = campaigns.reduce((sum, campaign) => sum + (campaign.failedCount || 0), 0);
    const totalOpens = campaigns.reduce((sum, campaign) => sum + (campaign.openCount || 0), 0);
    const totalClicks = campaigns.reduce((sum, campaign) => sum + (campaign.clickCount || 0), 0);

    const reactivationCampaigns = campaigns.filter((campaign) => campaign.isInactiveUserCampaign).length;
    const reactivationSent = campaigns
      .filter((campaign) => campaign.isInactiveUserCampaign)
      .reduce((sum, campaign) => sum + (campaign.sentCount || 0), 0);
    const reactivationOpens = campaigns
      .filter((campaign) => campaign.isInactiveUserCampaign)
      .reduce((sum, campaign) => sum + (campaign.openCount || 0), 0);

    return {
      totalCampaigns,
      totalEmailsSent,
      totalEmailsFailed,
      totalOpens,
      totalClicks,
      averageOpenRate: totalEmailsSent > 0 ? (totalOpens / totalEmailsSent) * 100 : 0,
      averageClickRate: totalEmailsSent > 0 ? (totalClicks / totalEmailsSent) * 100 : 0,
      reactivationCampaigns,
      reactivationSuccessRate: reactivationSent > 0 ? (reactivationOpens / reactivationSent) * 100 : 0,
    };
  }

  async getInactiveUsers(
    creatorId: string,
    communityId: string,
    query: InactiveUserQueryDto,
  ): Promise<UserLoginActivityDocument[]> {
    await this.verifyCommunityAccess(creatorId, communityId);
    const limit = query.limit || 100;
    if (query.period) {
      return this.userLoginActivityService.getInactiveUsersByPeriod(communityId, query.period, limit);
    }
    return this.userLoginActivityService.getAllInactiveUsers(communityId, limit);
  }

  async getInactiveUserStats(creatorId: string, communityId: string): Promise<InactiveUserStatsDto> {
    await this.verifyCommunityAccess(creatorId, communityId);
    return this.userLoginActivityService.getInactivityStats(communityId);
  }

  async getCampaign(campaignId: string, creatorId: string): Promise<EmailCampaignDocument> {
    const campaign = await this.emailCampaignModel
      .findById(campaignId)
      .populate('creatorId', 'name email')
      .exec();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    await this.verifyCommunityAccess(creatorId, campaign.communityId.toString());
    return campaign;
  }

  async updateCampaign(
    campaignId: string,
    dto: UpdateEmailCampaignDto,
    creatorId: string,
  ): Promise<EmailCampaignDocument> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only update campaigns you created');
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be updated in current status');
    }

    if (dto.title !== undefined) campaign.title = dto.title;
    if (dto.subject !== undefined) campaign.subject = dto.subject;
    if (dto.content !== undefined) campaign.content = dto.content;
    if (dto.isHtml !== undefined) campaign.isHtml = dto.isHtml;
    if (dto.trackOpens !== undefined) campaign.trackOpens = dto.trackOpens;
    if (dto.trackClicks !== undefined) campaign.trackClicks = dto.trackClicks;
    if (dto.metadata !== undefined) campaign.metadata = dto.metadata;

    if (dto.scheduledAt !== undefined) {
      campaign.scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
      campaign.status = this.resolveCampaignStatus(campaign.scheduledAt);
    } else if (dto.status === EmailCampaignStatus.DRAFT) {
      campaign.status = EmailCampaignStatus.DRAFT;
      campaign.scheduledAt = undefined;
    } else if (dto.status === EmailCampaignStatus.SCHEDULED) {
      if (!campaign.scheduledAt) {
        throw new BadRequestException('scheduledAt is required when setting status to scheduled');
      }
      campaign.status = EmailCampaignStatus.SCHEDULED;
    }

    const updatedCampaign = await campaign.save();

    if (updatedCampaign.status === EmailCampaignStatus.SCHEDULED && updatedCampaign.scheduledAt) {
      await this.emailCampaignQueueService.queueCampaignSend(
        {
          campaignId: updatedCampaign._id.toString(),
          requestedBy: creatorId,
          trigger: 'scheduled',
        },
        updatedCampaign.scheduledAt,
      );
    } else {
      await this.emailCampaignQueueService.removeScheduledCampaignSend(updatedCampaign._id.toString());
    }

    await updatedCampaign.populate('creatorId', 'name email');
    return updatedCampaign;
  }

  async deleteCampaign(campaignId: string, creatorId: string): Promise<void> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only delete campaigns you created');
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be deleted in current status');
    }

    await this.emailCampaignQueueService.removeScheduledCampaignSend(campaignId);
    await this.emailCampaignModel.deleteOne({ _id: campaignId }).exec();
  }

  async cancelCampaign(campaignId: string, creatorId: string): Promise<void> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only cancel campaigns you created');
    }
    if (campaign.status !== EmailCampaignStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled campaigns can be cancelled');
    }

    campaign.status = EmailCampaignStatus.CANCELLED;
    await campaign.save();
    await this.emailCampaignQueueService.removeScheduledCampaignSend(campaignId);
  }

  async duplicateCampaign(
    campaignId: string,
    creatorId: string,
    newTitle?: string,
  ): Promise<EmailCampaignDocument> {
    const source = await this.emailCampaignModel.findById(campaignId).exec();
    if (!source) {
      throw new NotFoundException('Campaign not found');
    }
    await this.verifyCommunityAccess(creatorId, source.communityId.toString());

    const community = await this.communityModel.findById(source.communityId).exec();
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    const recipients = await this.buildCommunityRecipients(community);

    const duplicate = new this.emailCampaignModel({
      title: newTitle || `Copy of ${source.title}`,
      subject: source.subject,
      content: source.content,
      communityId: source.communityId,
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      type: source.type,
      isHtml: source.isHtml,
      trackOpens: source.trackOpens,
      trackClicks: source.trackClicks,
      metadata: source.metadata || {},
      status: EmailCampaignStatus.DRAFT,
    });

    return duplicate.save();
  }

  async getCampaignRecipients(
    campaignId: string,
    creatorId: string,
    query: RecipientsQuery,
  ): Promise<{ recipients: any[]; total: number; page: number; limit: number }> {
    const campaign = await this.getCampaign(campaignId, creatorId);

    let recipients = campaign.recipients.slice();
    if (query.status) recipients = recipients.filter((recipient) => recipient.status === query.status);
    if (query.opened !== undefined) recipients = recipients.filter((recipient) => recipient.opened === query.opened);

    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const start = (page - 1) * limit;
    const paged = recipients.slice(start, start + limit).map((recipient) => ({
      userId: recipient.userId,
      email: recipient.email,
      name: recipient.name,
      status: recipient.status,
      sentAt: recipient.sentAt,
      opened: recipient.opened,
      openedAt: recipient.openedAt,
      clickCount: recipient.clickCount,
      clickedAt: recipient.clickedAt,
      errorMessage: recipient.errorMessage,
    }));

    return {
      recipients: paged,
      total: recipients.length,
      page,
      limit,
    };
  }

  async sendTestEmail(
    toEmail: string,
    subject: string,
    content: string,
    communityId?: string,
    isHtml = false,
  ): Promise<void> {
    let communityName = '';
    if (communityId && Types.ObjectId.isValid(communityId)) {
      const community = await this.communityModel.findById(communityId).select('name').lean().exec();
      communityName = community?.name || '';
    }

    const variables = this.buildBaseVariables({
      recipientName: 'Test User',
      communityName,
      targetDaysThreshold: undefined,
      targetInactivityPeriod: undefined,
      contentType: undefined,
    });

    const processedSubject = renderTemplate(subject, variables);
    const processedContent = renderTemplate(content, variables);

    await this.emailService.sendGenericEmail({
      to: toEmail,
      subject: processedSubject,
      text: isHtml ? '' : processedContent,
      html: isHtml ? processedContent : undefined,
    });
  }

  private async verifyCommunityAccess(creatorId: string, communityId: string): Promise<CommunityDocument> {
    const community = await this.communityModel
      .findOne({
        _id: new Types.ObjectId(communityId),
        $or: [
          { createur: new Types.ObjectId(creatorId) },
          { admins: new Types.ObjectId(creatorId) },
        ],
      })
      .exec();

    if (!community) {
      throw new ForbiddenException('You can only manage campaigns for communities you own or admin');
    }
    return community;
  }

  private async buildCommunityRecipients(community: CommunityDocument): Promise<EmailRecipient[]> {
    const members = await this.userModel
      .find({ _id: { $in: community.members } })
      .select('_id email name')
      .lean()
      .exec();

    return members.map((member) => ({
      userId: member._id as any,
      email: member.email,
      name: member.name,
      status: 'pending',
      opened: false,
      clickCount: 0,
    }));
  }

  private async getInactiveUsersForCampaign(
    dto: CreateInactiveUserCampaignDto,
  ): Promise<UserLoginActivityDocument[]> {
    const limit = dto.maxRecipients || 1000;
    if (dto.targetAllInactive) {
      return this.userLoginActivityService.getAllInactiveUsers(dto.communityId, limit);
    }
    return this.userLoginActivityService.getInactiveUsersByPeriod(
      dto.communityId,
      dto.inactivityPeriod,
      limit,
    );
  }

  private normalizeScheduledAt(raw?: string): Date | undefined {
    if (!raw) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid scheduledAt value');
    }
    return parsed.getTime() > Date.now() ? parsed : undefined;
  }

  private resolveCampaignStatus(scheduledAt?: Date): EmailCampaignStatus {
    return scheduledAt ? EmailCampaignStatus.SCHEDULED : EmailCampaignStatus.DRAFT;
  }

  private async enqueueIfScheduled(
    campaign: EmailCampaignDocument,
    creatorId: string,
    trigger: EmailCampaignSendJobPayload['trigger'],
  ): Promise<void> {
    if (campaign.status !== EmailCampaignStatus.SCHEDULED || !campaign.scheduledAt) return;
    await this.emailCampaignQueueService.queueCampaignSend(
      {
        campaignId: campaign._id.toString(),
        requestedBy: creatorId,
        trigger,
      },
      campaign.scheduledAt,
    );
  }

  private async sendEmailToRecipient(
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient,
    communityName: string,
  ): Promise<void> {
    const variables = this.buildBaseVariables({
      recipientName: recipient.name,
      communityName,
      targetDaysThreshold: campaign.targetDaysThreshold,
      targetInactivityPeriod: campaign.targetInactivityPeriod,
      contentType: String(campaign.metadata?.contentType || ''),
    });

    const subject = renderTemplate(campaign.subject, variables);
    const content = renderTemplate(campaign.content, variables);

    try {
      await this.emailService.sendGenericEmail({
        to: recipient.email,
        subject,
        text: campaign.isHtml ? '' : content,
        html: campaign.isHtml ? content : undefined,
      });

      recipient.status = 'sent';
      recipient.sentAt = new Date();
      recipient.errorMessage = undefined;
      recipient.personalizedSubject = subject;
      recipient.personalizedContent = content;
    } catch (error) {
      recipient.status = 'failed';
      recipient.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      recipient.personalizedSubject = subject;
      recipient.personalizedContent = content;
      this.logger.error(
        `Failed sending campaign ${campaign._id.toString()} to ${recipient.email}: ${recipient.errorMessage}`,
      );
    }
  }

  private buildBaseVariables(input: {
    recipientName: string;
    communityName: string;
    targetDaysThreshold?: number;
    targetInactivityPeriod?: InactivityPeriod;
    contentType?: string;
  }): Record<string, string | number> {
    const now = new Date();
    const contentType = input.contentType || '';
    return {
      userName: input.recipientName || '',
      communityName: input.communityName || '',
      currentDate: now.toISOString().slice(0, 10),
      currentYear: now.getUTCFullYear(),
      daysThreshold: input.targetDaysThreshold || '',
      inactivityPeriod: inactivityPeriodToText(input.targetInactivityPeriod),
      contentType,
      contentTypeLabel: contentTypeToLabel(contentType),
    };
  }

  private async updateReactivationEmailTracking(campaign: EmailCampaignDocument): Promise<void> {
    const sentRecipients = campaign.recipients.filter((recipient) => recipient.status === 'sent');
    await Promise.all(
      sentRecipients.map((recipient) =>
        this.userLoginActivityService.updateReactivationEmailSent(
          recipient.userId.toString(),
          campaign.communityId.toString(),
        ),
      ),
    );
  }

  private getDaysThreshold(period: InactivityPeriod): number {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS:
        return 7;
      case InactivityPeriod.LAST_15_DAYS:
        return 15;
      case InactivityPeriod.LAST_30_DAYS:
        return 30;
      case InactivityPeriod.LAST_60_DAYS:
        return 60;
      case InactivityPeriod.MORE_THAN_60_DAYS:
        return 61;
      default:
        return 7;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < array.length; index += size) {
      chunks.push(array.slice(index, index + size));
    }
    return chunks;
  }
}
