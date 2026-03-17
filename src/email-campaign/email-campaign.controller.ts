import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import {
  CampaignStatsDto,
  CreateContentReminderDto,
  CreateCourseProgressCampaignDto,
  CreateEmailCampaignDto,
  CreateInactiveUserCampaignDto,
  CreateInactivityAutomationDto,
  CreateWelcomeTemplateDto,
  EmailCampaignQueryDto,
  InactiveUserQueryDto,
  InactiveUserStatsDto,
  PreviewAudienceDto,
  PreviewAudienceResponseDto,
  UpdateEmailCampaignDto,
  UpdateWelcomeTemplateDto,
} from '../dto-email-campaign/email-campaign.dto';
import { EmailCampaignDocument, InactivityPeriod } from '../schema/email-campaign.schema';
import { UserLoginActivityDocument } from '../schema/user-login-activity.schema';
import { EmailCampaignService } from './email-campaign.service';

@Controller('email-campaigns')
@UseGuards(JwtAuthGuard)
@ApiTags('Email Campaigns')
@ApiBearerAuth()
export class EmailCampaignController {
  constructor(private readonly emailCampaignService: EmailCampaignService) {}

  @Post()
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Create email campaign' })
  createCampaign(@Request() req, @Body() dto: CreateEmailCampaignDto): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createCampaign(req.user._id, dto);
  }

  @Post('inactive-users')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Create inactive user campaign' })
  createInactiveUserCampaign(
    @Request() req,
    @Body() dto: CreateInactiveUserCampaignDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createInactiveUserCampaign(req.user._id, dto);
  }

  @Post('content-reminder')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Create content reminder campaign and queue send' })
  async createAndSendContentReminder(
    @Request() req,
    @Body() dto: CreateContentReminderDto,
  ): Promise<{ campaignId: string; queued: true }> {
    return this.emailCampaignService.createAndSendContentReminder(req.user._id, dto);
  }

  @Get('community/:communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get community campaigns' })
  getCommunityCampaigns(
    @Request() req,
    @Param('communityId') communityId: string,
    @Query() query: EmailCampaignQueryDto,
  ): Promise<{ campaigns: EmailCampaignDocument[]; total: number; page: number; limit: number }> {
    return this.emailCampaignService.getCommunityCampaigns(req.user._id, communityId, query);
  }

  @Get('community/:communityId/stats')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get campaign stats for community' })
  getCampaignStats(@Request() req, @Param('communityId') communityId: string): Promise<CampaignStatsDto> {
    return this.emailCampaignService.getCampaignStats(req.user._id, communityId);
  }

  @Get('community/:communityId/inactive-users')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get inactive users with period/limit filters' })
  getInactiveUsers(
    @Request() req,
    @Param('communityId') communityId: string,
    @Query() query: InactiveUserQueryDto,
  ): Promise<UserLoginActivityDocument[]> {
    return this.emailCampaignService.getInactiveUsers(req.user._id, communityId, query);
  }

  @Get('community/:communityId/inactive-stats')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get inactive user stats for community' })
  getInactiveStats(
    @Request() req,
    @Param('communityId') communityId: string,
  ): Promise<InactiveUserStatsDto> {
    return this.emailCampaignService.getInactiveUserStats(req.user._id, communityId);
  }

  @Get('inactivity-periods')
  @ApiOperation({ summary: 'Get supported inactivity periods' })
  getInactivityPeriods(): { periods: Array<{ value: string; label: string; days: number }> } {
    return {
      periods: [
        { value: InactivityPeriod.LAST_7_DAYS, label: 'Last 7 days', days: 7 },
        { value: InactivityPeriod.LAST_15_DAYS, label: 'Last 15 days', days: 15 },
        { value: InactivityPeriod.LAST_30_DAYS, label: 'Last 30 days', days: 30 },
        { value: InactivityPeriod.LAST_60_DAYS, label: 'Last 60 days', days: 60 },
        { value: InactivityPeriod.MORE_THAN_60_DAYS, label: 'More than 60 days', days: 61 },
      ],
    };
  }

  @Post(':campaignId/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Queue campaign for sending' })
  @ApiParam({ name: 'campaignId' })
  @ApiResponse({
    status: 202,
    description: 'Campaign send job queued',
  })
  async sendCampaign(
    @Request() req,
    @Param('campaignId') campaignId: string,
  ): Promise<{ message: string; campaignId: string; queued: true }> {
    const result = await this.emailCampaignService.sendCampaign(campaignId, req.user._id);
    return {
      message: result.message,
      campaignId: result.campaignId,
      queued: result.queued,
    };
  }

  @Post(':campaignId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Cancel scheduled campaign' })
  async cancelCampaign(
    @Request() req,
    @Param('campaignId') campaignId: string,
  ): Promise<{ message: string; campaignId: string }> {
    await this.emailCampaignService.cancelCampaign(campaignId, req.user._id);
    return { message: 'Campaign cancelled successfully', campaignId };
  }

  @Post(':campaignId/duplicate')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Duplicate campaign' })
  duplicateCampaign(
    @Request() req,
    @Param('campaignId') campaignId: string,
    @Body() body: { title?: string },
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.duplicateCampaign(campaignId, req.user._id, body.title);
  }

  @Get(':campaignId/recipients')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Get campaign recipients' })
  getCampaignRecipients(
    @Request() req,
    @Param('campaignId') campaignId: string,
    @Query() query: { page?: number; limit?: number; status?: string; opened?: boolean },
  ): Promise<{ recipients: any[]; total: number; page: number; limit: number }> {
    return this.emailCampaignService.getCampaignRecipients(campaignId, req.user._id, query);
  }

  @Post('test-email')
  @ApiOperation({ summary: 'Send a test email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['toEmail', 'subject', 'content'],
      properties: {
        toEmail: { type: 'string' },
        subject: { type: 'string' },
        content: { type: 'string' },
        communityId: { type: 'string' },
        isHtml: { type: 'boolean' },
      },
    },
  })
  sendTestEmail(
    @Body()
    body: {
      toEmail: string;
      subject: string;
      content: string;
      communityId?: string;
      isHtml?: boolean;
    },
  ): Promise<void> {
    return this.emailCampaignService.sendTestEmail(
      body.toEmail,
      body.subject,
      body.content,
      body.communityId,
      body.isHtml,
    );
  }

  @Get(':campaignId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Get campaign details' })
  getCampaign(@Request() req, @Param('campaignId') campaignId: string): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.getCampaign(campaignId, req.user._id);
  }

  @Put(':campaignId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Update campaign' })
  updateCampaign(
    @Request() req,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateEmailCampaignDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.updateCampaign(campaignId, dto, req.user._id);
  }

  @Delete(':campaignId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'campaignId' })
  @ApiOperation({ summary: 'Delete campaign' })
  deleteCampaign(@Request() req, @Param('campaignId') campaignId: string): Promise<void> {
    return this.emailCampaignService.deleteCampaign(campaignId, req.user._id);
  }

  // ─── Course Progress Campaigns ──────────────────────────────────────────────

  @Post('course-progress')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({
    summary: 'Create course-progress reminder campaign',
    description:
      'Target enrolled users whose completion % is below a threshold after N enrollment days. ' +
      'Accepts {{userName}}, {{progressPct}}, {{enrolledDays}}, {{communityName}} template variables.',
  })
  createCourseProgressCampaign(
    @Request() req,
    @Body() dto: CreateCourseProgressCampaignDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createCourseProgressCampaign(req.user._id, dto);
  }

  // ─── Audience Preview ───────────────────────────────────────────────────────

  @Post('preview-audience')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({
    summary: 'Preview the audience for a filter before sending',
    description:
      'Returns the total user count + a sample of up to 10 users that match the given filter (inactivity or course_progress). Use this before creating a campaign to validate the target audience.',
  })
  @ApiResponse({ status: 200, type: PreviewAudienceResponseDto })
  previewAudience(
    @Request() req,
    @Body() dto: PreviewAudienceDto,
  ): Promise<PreviewAudienceResponseDto> {
    return this.emailCampaignService.previewCampaignAudience(req.user._id, dto);
  }

  // ─── Welcome / Automation Templates ────────────────────────────────────────

  @Post('welcome-template/:communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({
    summary: 'Create automated welcome email template',
    description:
      'Creates (or replaces) the automated welcome email that is sent to every new member who joins the community. ' +
      'Supported template variables: {{userName}}, {{communityName}}.',
  })
  @ApiParam({ name: 'communityId' })
  createWelcomeTemplate(
    @Request() req,
    @Param('communityId') communityId: string,
    @Body() dto: CreateWelcomeTemplateDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createWelcomeTemplate(req.user._id, communityId, dto);
  }

  @Get('welcome-template/:communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get active welcome email template for a community' })
  @ApiParam({ name: 'communityId' })
  getWelcomeTemplate(
    @Request() req,
    @Param('communityId') communityId: string,
  ): Promise<EmailCampaignDocument | null> {
    return this.emailCampaignService.getWelcomeTemplate(req.user._id, communityId);
  }

  @Put('welcome-template/:communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Update the welcome email template content' })
  @ApiParam({ name: 'communityId' })
  updateWelcomeTemplate(
    @Request() req,
    @Param('communityId') communityId: string,
    @Body() dto: UpdateWelcomeTemplateDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.updateWelcomeTemplate(req.user._id, communityId, dto);
  }

  @Delete('welcome-template/:communityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Delete the welcome email template' })
  @ApiParam({ name: 'communityId' })
  deleteWelcomeTemplate(
    @Request() req,
    @Param('communityId') communityId: string,
  ): Promise<void> {
    return this.emailCampaignService.deleteWelcomeTemplate(req.user._id, communityId);
  }

  @Patch('welcome-template/:communityId/toggle')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Enable or disable the welcome email automation' })
  @ApiParam({ name: 'communityId' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['active'],
      properties: { active: { type: 'boolean', example: true } },
    },
  })
  toggleWelcomeTemplate(
    @Request() req,
    @Param('communityId') communityId: string,
    @Body('active') active: boolean,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.toggleWelcomeTemplate(req.user._id, communityId, active);
  }

  // ─── Continuous Inactivity Automations ─────────────────────────────────────

  @Post('inactivity-automation')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({
    summary: 'Create a continuous inactivity automation',
    description:
      'Set and forget: the system will automatically send this email to any community member who reaches `minInactiveDays` days of inactivity. ' +
      'The check runs daily and respects a 30-day cooldown per user. ' +
      'Variables: {{userName}}, {{communityName}}, {{daysThreshold}}.',
  })
  createInactivityAutomation(
    @Request() req,
    @Body() dto: CreateInactivityAutomationDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createInactivityAutomation(req.user._id, dto);
  }

  @Get('inactivity-automation/:communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'List all inactivity automations for a community' })
  @ApiParam({ name: 'communityId' })
  getInactivityAutomations(
    @Request() req,
    @Param('communityId') communityId: string,
  ): Promise<EmailCampaignDocument[]> {
    return this.emailCampaignService.getInactivityAutomations(req.user._id, communityId);
  }

  @Patch('inactivity-automation/:automationId/toggle')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'EmailCampaign', paramName: 'automationId' })
  @ApiOperation({ summary: 'Enable or disable an inactivity automation' })
  @ApiParam({ name: 'automationId' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['active'],
      properties: { active: { type: 'boolean', example: true } },
    },
  })
  toggleInactivityAutomation(
    @Request() req,
    @Param('automationId') automationId: string,
    @Body('active') active: boolean,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.toggleInactivityAutomation(automationId, req.user._id, active);
  }
}
