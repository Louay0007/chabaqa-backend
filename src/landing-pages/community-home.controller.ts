import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LandingPagesService } from './landing-pages.service';
import { PageAnalyticsService } from './page-analytics.service';
import { CommunityHomeMigrationService } from './community-home-migration.service';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { PublishLandingPageDto } from './dto/publish-landing-page.dto';

@ApiTags('Community Home Page')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('communities')
export class CommunityHomeController {
  constructor(
    private readonly landingPagesService: LandingPagesService,
    private readonly pageAnalyticsService: PageAnalyticsService,
    private readonly migrationService: CommunityHomeMigrationService,
  ) {}

  private getRequestUserId(req: any): string {
    return (
      req?.user?._id ||
      req?.user?.userId ||
      req?.user?.sub ||
      req?.user?.id ||
      ''
    ).toString();
  }

  private assertAdminForMigration(req: any): void {
    const role = String(req?.user?.role || '').toLowerCase();
    const isAdminFlag = Boolean(req?.user?.isAdmin);
    const isAllowedRole = role === 'admin' || role === 'super-admin';
    if (!isAdminFlag && !isAllowedRole) {
      throw new ForbiddenException(
        'Only administrators can execute community home page migration',
      );
    }
  }

  // ─── Get or Create Home Page Draft ────────────────────────────────────────────

  @Post(':communityId/home-page')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get or create a community home page draft' })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({ status: 200, description: 'Community home page draft' })
  async getOrCreateDraft(
    @Param('communityId') communityId: string,
    @Request() req,
  ) {
    const userId = this.getRequestUserId(req);
    const page = await this.landingPagesService.createOrGetCommunityHomeDraft(
      communityId,
      userId,
    );
    return { success: true, data: page };
  }

  // ─── Get Home Page for Editing ────────────────────────────────────────────────

  @Get(':communityId/home-page/edit')
  @ApiOperation({ summary: 'Get community home page for editing' })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({ status: 200, description: 'Community home page with blocks' })
  @ApiResponse({ status: 404, description: 'No home page found' })
  async getForEditing(
    @Param('communityId') communityId: string,
    @Request() req,
  ) {
    const userId = this.getRequestUserId(req);
    const page = await this.landingPagesService.createOrGetCommunityHomeDraft(
      communityId,
      userId,
    );
    return { success: true, data: page };
  }

  // ─── Update Home Page ─────────────────────────────────────────────────────────

  @Patch(':communityId/home-page')
  @ApiOperation({ summary: 'Update community home page' })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({ status: 200, description: 'Home page updated successfully' })
  @ApiResponse({ status: 404, description: 'No home page found' })
  async updateHomePage(
    @Param('communityId') communityId: string,
    @Request() req,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateLandingPageDto,
  ) {
    const userId = this.getRequestUserId(req);
    // Get or create the home page
    const homePage = await this.landingPagesService.createOrGetCommunityHomeDraft(
      communityId,
      userId,
    );
    const pageId = (homePage as any)._id?.toString() || (homePage as any).id;
    const updated = await this.landingPagesService.update(pageId, userId, dto);
    return { success: true, data: updated, message: 'Community home page updated successfully' };
  }

  // ─── Publish Home Page ────────────────────────────────────────────────────────

  @Post(':communityId/home-page/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish community home page' })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({ status: 200, description: 'Home page published successfully' })
  async publishHomePage(
    @Param('communityId') communityId: string,
    @Request() req,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PublishLandingPageDto,
  ) {
    const userId = this.getRequestUserId(req);
    const homePage = await this.landingPagesService.createOrGetCommunityHomeDraft(
      communityId,
      userId,
    );
    const pageId = (homePage as any)._id?.toString() || (homePage as any).id;
    const published = await this.landingPagesService.publish(pageId, userId, dto);
    return { success: true, data: published, message: 'Community home page published successfully' };
  }

  // ─── Unpublish Home Page ──────────────────────────────────────────────────────

  @Post(':communityId/home-page/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish community home page' })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiResponse({ status: 200, description: 'Home page unpublished successfully' })
  async unpublishHomePage(
    @Param('communityId') communityId: string,
    @Request() req,
  ) {
    const userId = this.getRequestUserId(req);
    const homePage = await this.landingPagesService.getCommunityHomePage(communityId);
    if (!homePage) {
      return { success: false, message: 'No home page found for this community' };
    }
    const pageId = (homePage as any)._id?.toString() || (homePage as any).id;
    const unpublished = await this.landingPagesService.unpublish(pageId, userId);
    return { success: true, data: unpublished, message: 'Community home page reverted to draft' };
  }

  // ─── Home Page Analytics ──────────────────────────────────────────────────────

  @Get(':communityId/home-page/analytics')
  @ApiOperation({ summary: 'Get community home page analytics' })
  @ApiParam({ name: 'communityId', description: 'Community ID' })
  @ApiQuery({ name: 'timeRange', required: false, description: 'Time range (e.g. 7d, 30d)' })
  @ApiResponse({ status: 200, description: 'Home page analytics data' })
  async getHomePageAnalytics(
    @Param('communityId') communityId: string,
    @Request() req,
    @Query('timeRange') timeRange: string = '30d',
  ) {
    const userId = this.getRequestUserId(req);
    const homePage = await this.landingPagesService.getCommunityHomePage(communityId);
    if (!homePage) {
      return {
        success: true,
        data: {
          views: 0, uniqueVisitors: 0, conversions: 0, conversionRate: 0,
          avgTimeOnPage: 0, bounceRate: 0, dailyViews: [], deviceBreakdown: [], topReferrers: [],
        },
      };
    }
    const pageId = (homePage as any)._id?.toString() || (homePage as any).id;
    const analytics = await this.pageAnalyticsService.getPageAnalytics(pageId, userId, timeRange);
    return { success: true, data: analytics };
  }

  // ─── Migration Operations ──────────────────────────────────────────────────

  @Get('home-page-migration/status')
  @ApiOperation({ summary: 'Check community home page migration status' })
  @ApiResponse({ status: 200, description: 'Migration status summary' })
  async getMigrationStatus() {
    const status = await this.migrationService.getMigrationStatus();
    return { success: true, data: status };
  }

  @Post('home-page-migration/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute community home page migration' })
  @ApiQuery({ name: 'dryRun', required: false, description: 'If true, only preview what would be migrated' })
  @ApiResponse({ status: 200, description: 'Migration execution result' })
  async executeMigration(
    @Request() req,
    @Query('dryRun') dryRun?: string,
  ) {
    this.assertAdminForMigration(req);
    const isDryRun = dryRun === 'true' || dryRun === '1';
    const result = await this.migrationService.migrateAll(isDryRun);
    return { success: true, data: result };
  }
}
