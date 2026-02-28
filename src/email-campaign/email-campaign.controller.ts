import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
  @ApiOperation({ summary: 'Create email campaign' })
  createCampaign(@Request() req, @Body() dto: CreateEmailCampaignDto): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createCampaign(req.user._id, dto);
  }

  @Post('inactive-users')
  @ApiOperation({ summary: 'Create inactive user campaign' })
  createInactiveUserCampaign(
    @Request() req,
    @Body() dto: CreateInactiveUserCampaignDto,
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.createInactiveUserCampaign(req.user._id, dto);
  }

  @Post('content-reminder')
  @ApiOperation({ summary: 'Create content reminder campaign and queue send' })
  async createAndSendContentReminder(
    @Request() req,
    @Body() dto: CreateContentReminderDto,
  ): Promise<{ campaignId: string; queued: true }> {
    return this.emailCampaignService.createAndSendContentReminder(req.user._id, dto);
  }

  @Get('community/:communityId')
  @ApiOperation({ summary: 'Get community campaigns' })
  getCommunityCampaigns(
    @Request() req,
    @Param('communityId') communityId: string,
    @Query() query: EmailCampaignQueryDto,
  ): Promise<{ campaigns: EmailCampaignDocument[]; total: number; page: number; limit: number }> {
    return this.emailCampaignService.getCommunityCampaigns(req.user._id, communityId, query);
  }

  @Get('community/:communityId/stats')
  @ApiOperation({ summary: 'Get campaign stats for community' })
  getCampaignStats(@Request() req, @Param('communityId') communityId: string): Promise<CampaignStatsDto> {
    return this.emailCampaignService.getCampaignStats(req.user._id, communityId);
  }

  @Get('community/:communityId/inactive-users')
  @ApiOperation({ summary: 'Get inactive users with period/limit filters' })
  getInactiveUsers(
    @Request() req,
    @Param('communityId') communityId: string,
    @Query() query: InactiveUserQueryDto,
  ): Promise<UserLoginActivityDocument[]> {
    return this.emailCampaignService.getInactiveUsers(req.user._id, communityId, query);
  }

  @Get('community/:communityId/inactive-stats')
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
  @ApiOperation({ summary: 'Cancel scheduled campaign' })
  async cancelCampaign(
    @Request() req,
    @Param('campaignId') campaignId: string,
  ): Promise<{ message: string; campaignId: string }> {
    await this.emailCampaignService.cancelCampaign(campaignId, req.user._id);
    return { message: 'Campaign cancelled successfully', campaignId };
  }

  @Post(':campaignId/duplicate')
  @ApiOperation({ summary: 'Duplicate campaign' })
  duplicateCampaign(
    @Request() req,
    @Param('campaignId') campaignId: string,
    @Body() body: { title?: string },
  ): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.duplicateCampaign(campaignId, req.user._id, body.title);
  }

  @Get(':campaignId/recipients')
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
  @ApiOperation({ summary: 'Get campaign details' })
  getCampaign(@Request() req, @Param('campaignId') campaignId: string): Promise<EmailCampaignDocument> {
    return this.emailCampaignService.getCampaign(campaignId, req.user._id);
  }

  @Put(':campaignId')
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
  @ApiOperation({ summary: 'Delete campaign' })
  deleteCampaign(@Request() req, @Param('campaignId') campaignId: string): Promise<void> {
    return this.emailCampaignService.deleteCampaign(campaignId, req.user._id);
  }
}
