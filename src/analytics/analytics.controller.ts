import { Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { PlanTier } from '../schema/plan.schema';

@ApiTags('Creator Analytics')
@Controller('analytics/creator')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Overview analytics for creator (plan-gated)' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'communityId', required: false, description: 'Community ID to filter by' })
  async getOverview(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    // Map optional string plan hint on user to PlanTier enum; service still resolves from subscription if undefined
    const planHint = (user.creatorPlan as 'starter'|'growth'|'pro'|undefined);
    const plan: PlanTier | undefined = planHint
      ? (planHint === 'pro' ? PlanTier.PRO : planHint === 'growth' ? PlanTier.GROWTH : PlanTier.STARTER)
      : undefined;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getOverview(creatorId, fromDate, toDate, plan, communityId);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Audience devices breakdown' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getDevices(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getDevices(creatorId, fromDate, toDate, communityId);
  }

  @Get('referrers')
  @ApiOperation({ summary: 'Top referrers/UTMs' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getReferrers(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getReferrers(creatorId, fromDate, toDate, communityId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export CSV (pro plan): scope=overview|courses|challenges|sessions|events|products|posts' })
  @ApiQuery({ name: 'scope', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async exportCsv(
    @Req() req,
    @Query('scope') scope: 'overview'|'courses'|'challenges'|'sessions'|'events'|'products'|'posts',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('communityId') communityId?: string,
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.exportCsv(creatorId, scope, fromDate, toDate, communityId);
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
  @ApiOperation({ summary: 'Courses analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getCourses(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getCourses(creatorId, fromDate, toDate, communityId);
  }

  @Get('challenges')
  @ApiOperation({ summary: 'Challenges analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getChallenges(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getChallenges(creatorId, fromDate, toDate, communityId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Sessions analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getSessions(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getSessions(creatorId, fromDate, toDate, communityId);
  }

  @Get('events')
  @ApiOperation({ summary: 'Events analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getEvents(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getEvents(creatorId, fromDate, toDate, communityId);
  }

  @Get('products')
  @ApiOperation({ summary: 'Products analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getProducts(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getProducts(creatorId, fromDate, toDate, communityId);
  }

  @Get('posts')
  @ApiOperation({ summary: 'Posts analytics (plan-gated)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'communityId', required: false })
  async getPosts(
    @Req() req, 
    @Query('from') from?: string, 
    @Query('to') to?: string,
    @Query('communityId') communityId?: string
  ) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.analyticsService.getPosts(creatorId, fromDate, toDate, communityId);
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
    
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    
    return this.analyticsService.getCourseAnalytics(creatorId, courseId, fromDate, toDate);
  }

  @Get('debug-status')
  @ApiOperation({ summary: 'Debug creator analytics status (tracking vs rollups)' })
  @ApiQuery({ name: 'communityId', required: false })
  async debugStatus(@Req() req, @Query('communityId') communityId?: string) {
    const user = req.user;
    const creatorId = user.sub || user._id || user.userId;
    return this.analyticsService.debugCreatorStatus(creatorId, communityId);
  }
}
