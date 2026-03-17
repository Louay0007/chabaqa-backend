import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { PlanTier } from '../schema/plan.schema';
import { CreatorInsightsService } from './creator-insights.service';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, OptionalCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

@ApiTags('Creator Analytics')
@Controller('analytics/creator')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly creatorInsightsService: CreatorInsightsService,
  ) {}

  private parseDateRange(from?: string, to?: string) {
    const toDate = to ? new Date(to) : new Date();
    if (Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid "to" date parameter');
    }

    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    if (Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException('Invalid "from" date parameter');
    }

    if (fromDate > toDate) {
      throw new BadRequestException('"from" date must be before "to" date');
    }

    return { fromDate, toDate };
  }

  private parseCommunityFilters(communityId?: string, communitySlug?: string) {
    const normalizedId = communityId?.trim() || undefined;
    const normalizedSlug = communitySlug?.trim() || undefined;

    if (normalizedId && normalizedId.length > 128) {
      throw new BadRequestException('Invalid "communityId" parameter');
    }
    if (normalizedSlug && normalizedSlug.length > 128) {
      throw new BadRequestException('Invalid "communitySlug" parameter');
    }

    return { communityId: normalizedId, communitySlug: normalizedSlug };
  }

  private normalizeContentType(value?: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('contentType is required');
    }
    return normalized;
  }

  private normalizeContentId(value?: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new BadRequestException('contentId is required');
    }
    if (normalized.length > 256) {
      throw new BadRequestException('Invalid "contentId" parameter');
    }
    return normalized;
  }

  @Get('overview')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Overview analytics for creator (plan-gated)' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'communityId', required: false, description: 'Community ID to filter by' })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Community slug to filter by' })
  async getOverview(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    // Map optional string plan hint on user to PlanTier enum; service still resolves from subscription if undefined
    const planHint = (user.creatorPlan as 'starter'|'growth'|'pro'|undefined);
    const plan: PlanTier | undefined = planHint
      ? (planHint === 'pro' ? PlanTier.PRO : planHint === 'growth' ? PlanTier.GROWTH : PlanTier.STARTER)
      : undefined;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getOverview(creatorId, fromDate, toDate, plan, filters.communityId, filters.communitySlug);
  }

  @Get('devices')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Audience devices breakdown' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getDevices(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getDevices(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('referrers')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Top referrers/UTMs' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getReferrers(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getReferrers(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('funnel')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Content funnel for a specific content item' })
  @ApiQuery({ name: 'contentType', required: true, description: 'course|challenge|session|event|product|post|community' })
  @ApiQuery({ name: 'contentId', required: true, description: 'Content identifier (id or Mongo _id)' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getFunnel(
    @Req() req,
    @Query('contentType') contentType?: string,
    @Query('contentId') contentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const normalizedContentType = this.normalizeContentType(contentType);
    const normalizedContentId = this.normalizeContentId(contentId);
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getFunnel(
      creatorId,
      normalizedContentType,
      normalizedContentId,
      fromDate,
      toDate,
      filters.communityId,
      filters.communitySlug,
    );
  }

  @Get('course/:courseId/chapters/funnel')
  @ApiOperation({ summary: 'Course chapter funnel (ordered) with drop-off detection' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getCourseChaptersFunnel(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const courseId = String(req.params.courseId || '').trim();
    if (!courseId) {
      throw new BadRequestException('courseId is required');
    }
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getCourseChaptersFunnel(
      creatorId,
      courseId,
      fromDate,
      toDate,
      filters.communityId,
      filters.communitySlug,
    );
  }

  @Get('challenge/:challengeId/tasks/funnel')
  @ApiOperation({ summary: 'Challenge task funnel (ordered) with drop-off detection' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getChallengeTasksFunnel(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const challengeId = String(req.params.challengeId || '').trim();
    if (!challengeId) {
      throw new BadRequestException('challengeId is required');
    }
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getChallengeTasksFunnel(
      creatorId,
      challengeId,
      fromDate,
      toDate,
      filters.communityId,
      filters.communitySlug,
    );
  }

  @Post('insights')
  @ApiOperation({ summary: 'Generate AI drop-off & conversion insights for content (cached + rate-limited)' })
  async generateInsights(
    @Req() req,
    @Body() body: any,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;

    const normalizedContentType = this.normalizeContentType(body?.contentType);
    const normalizedContentId = this.normalizeContentId(body?.contentId);
    const { fromDate, toDate } = this.parseDateRange(body?.from, body?.to);
    const focusStepId = body?.focusStepId ? String(body.focusStepId).trim() : undefined;
    const filters = this.parseCommunityFilters(communityId, communitySlug);

    return this.creatorInsightsService.generateInsights(
      creatorId,
      normalizedContentType,
      normalizedContentId,
      fromDate,
      toDate,
      filters.communityId,
      filters.communitySlug,
      focusStepId,
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Export CSV (pro plan): scope=overview|courses|challenges|sessions|events|products|posts' })
  @ApiQuery({ name: 'scope', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async exportCsv(
    @Req() req,
    @Query('scope') scope: 'overview'|'courses'|'challenges'|'sessions'|'events'|'products'|'posts',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.exportCsv(creatorId, scope, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('communities')
  @ApiOperation({ summary: 'Communities analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getCommunities(@Req() req, @Query('from') from?: string, @Query('to') to?: string) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getCommunities(creatorId, fromDate, toDate);
  }

  @Get('courses')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Courses analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getCourses(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getCourses(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('challenges')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Challenges analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getChallenges(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getChallenges(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('sessions')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Sessions analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getSessions(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getSessions(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('events')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Events analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getEvents(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getEvents(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('products')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Products analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getProducts(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getProducts(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Get('posts')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ANALYTICS_VIEW)
  @OptionalCommunityPermission()
  @ApiOperation({ summary: 'Posts analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async getPosts(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const { fromDate, toDate } = this.parseDateRange(from, to);
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.getPosts(creatorId, fromDate, toDate, filters.communityId, filters.communitySlug);
  }

  @Post('backfill')
  @ApiOperation({ summary: 'Backfill analytics daily rollups for the creator (last N days)' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to backfill (default 90)' })
  async backfillPost(@Req() req, @Query('days') days?: string) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const num = Math.max(1, Math.min(365, Number(days) || 90));
    return this.analyticsService.backfillForCreator(creatorId, num);
  }

  @Get('backfill')
  @ApiOperation({ summary: 'Backfill analytics daily rollups for the creator (last N days)' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to backfill (default 90)' })
  async backfill(@Req() req, @Query('days') days?: string) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const num = Math.max(1, Math.min(365, Number(days) || 90));
    return this.analyticsService.backfillForCreator(creatorId, num);
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: 'Get specific course analytics' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getCourseAnalytics(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const courseId = req.params.courseId;

    const { fromDate, toDate } = this.parseDateRange(from, to);
    const data = await this.analyticsService.getCourseAnalytics(creatorId, courseId, fromDate, toDate);
    return { success: true, data };
  }

  @Get('debug-status')
  @ApiOperation({ summary: 'Debug creator analytics status (tracking vs rollups)' })
  @ApiQuery({ name: 'communityId', required: false })
  @ApiQuery({ name: 'communitySlug', required: false })
  async debugStatus(
    @Req() req,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const filters = this.parseCommunityFilters(communityId, communitySlug);
    return this.analyticsService.debugCreatorStatus(creatorId, filters.communityId, filters.communitySlug);
  }
}
