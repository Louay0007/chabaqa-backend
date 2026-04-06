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
  Query,
  Request,
  Res,
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
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LandingPagesService } from './landing-pages.service';
import { LeadsService, LeadQueryParams } from './leads.service';
import { PageAnalyticsService } from './page-analytics.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { PublishLandingPageDto } from './dto/publish-landing-page.dto';

@ApiTags('Landing Pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('landing-pages')
export class LandingPagesController {
  constructor(
    private readonly landingPagesService: LandingPagesService,
    private readonly leadsService: LeadsService,
    private readonly pageAnalyticsService: PageAnalyticsService,
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

  // ─── Landing Pages CRUD ───────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get all landing pages for the authenticated creator',
  })
  @ApiResponse({
    status: 200,
    description: 'List of landing pages (blocks field excluded)',
  })
  async findAll(@Request() req) {
    const creatorId = this.getRequestUserId(req);
    const pages = await this.landingPagesService.findAllByCreator(creatorId);
    return { success: true, data: pages };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new landing page' })
  @ApiResponse({
    status: 201,
    description: 'Landing page created successfully',
  })
  async create(
    @Request() req,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateLandingPageDto,
  ) {
    const creatorId = this.getRequestUserId(req);
    const page = await this.landingPagesService.create(creatorId, dto);
    return {
      success: true,
      data: page,
      message: 'Landing page created successfully',
    };
  }

  // ─── Community Home Pages ──────────────────────────────────────────────────
  // IMPORTANT: This static route MUST be declared before the dynamic :id route
  // to prevent NestJS from matching "community-homes" as an :id parameter.

  @Get('community-homes')
  @ApiOperation({
    summary: 'Get all community home pages for the authenticated creator',
  })
  @ApiResponse({
    status: 200,
    description: 'List of community home pages with community info',
  })
  async findCommunityHomePages(@Request() req) {
    const creatorId = this.getRequestUserId(req);
    const pages =
      await this.landingPagesService.findCommunityHomePagesByCreator(creatorId);
    return { success: true, data: pages };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single landing page with blocks' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({
    status: 200,
    description: 'Landing page details including blocks',
  })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async findOne(@Param('id') id: string, @Request() req) {
    const creatorId = this.getRequestUserId(req);
    const page = await this.landingPagesService.findOneByCreator(id, creatorId);
    return { success: true, data: page };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a landing page' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({
    status: 200,
    description: 'Landing page updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateLandingPageDto,
  ) {
    const creatorId = this.getRequestUserId(req);
    const page = await this.landingPagesService.update(id, creatorId, dto);
    return {
      success: true,
      data: page,
      message: 'Landing page updated successfully',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a landing page' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({
    status: 200,
    description: 'Landing page deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async remove(@Param('id') id: string, @Request() req) {
    const creatorId = this.getRequestUserId(req);
    await this.landingPagesService.remove(id, creatorId);
    return { success: true, message: 'Landing page deleted successfully' };
  }

  // ─── Publish / Unpublish ──────────────────────────────────────────────────────

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a landing page' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({
    status: 200,
    description: 'Landing page published successfully',
  })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async publish(
    @Param('id') id: string,
    @Request() req,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PublishLandingPageDto,
  ) {
    const creatorId = this.getRequestUserId(req);
    const page = await this.landingPagesService.publish(id, creatorId, dto);
    return {
      success: true,
      data: page,
      message: 'Landing page published successfully',
    };
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish a landing page (revert to draft)' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({
    status: 200,
    description: 'Landing page unpublished successfully',
  })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async unpublish(@Param('id') id: string, @Request() req) {
    const creatorId = this.getRequestUserId(req);
    const page = await this.landingPagesService.unpublish(id, creatorId);
    return {
      success: true,
      data: page,
      message: 'Landing page reverted to draft',
    };
  }

  // ─── Duplicate ────────────────────────────────────────────────────────────────

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicate a landing page' })
  @ApiParam({ name: 'id', description: 'Landing page ID to duplicate' })
  @ApiResponse({
    status: 201,
    description: 'Landing page duplicated successfully',
  })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async duplicate(@Param('id') id: string, @Request() req) {
    const creatorId = this.getRequestUserId(req);
    const copy = await this.landingPagesService.duplicate(id, creatorId);
    return {
      success: true,
      data: copy,
      message: 'Landing page duplicated successfully',
    };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get analytics for a landing page' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiQuery({
    name: 'timeRange',
    required: false,
    description:
      'Time range for analytics (e.g. 7d, 30d, 90d, 12m). Defaults to 30d.',
    example: '30d',
  })
  @ApiResponse({ status: 200, description: 'Analytics data' })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async getAnalytics(
    @Param('id') id: string,
    @Request() req,
    @Query('timeRange') timeRange: string = '30d',
  ) {
    const creatorId = this.getRequestUserId(req);
    const analytics = await this.pageAnalyticsService.getPageAnalytics(
      id,
      creatorId,
      timeRange,
    );
    return { success: true, data: analytics };
  }

  // ─── Leads ────────────────────────────────────────────────────────────────────

  @Get(':id/leads')
  @ApiOperation({ summary: 'Get paginated leads for a landing page' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'score',
    required: false,
    description: 'Minimum lead score filter',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Filter by source',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search in name, email, phone',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
    enum: ['new', 'contacted', 'converted'],
  })
  @ApiResponse({ status: 200, description: 'Paginated list of leads' })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async getLeads(
    @Param('id') id: string,
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('score') score?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'new' | 'contacted' | 'converted',
  ) {
    const creatorId = this.getRequestUserId(req);

    const params: LeadQueryParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      score: score !== undefined ? parseFloat(score) : undefined,
      source,
      search,
      status,
    };

    return this.leadsService.getByPage(id, creatorId, params);
  }

  @Get(':id/leads/export')
  @ApiOperation({ summary: 'Export leads as CSV or JSON' })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Export format',
    enum: ['csv', 'json'],
  })
  @ApiResponse({ status: 200, description: 'Exported file content' })
  @ApiResponse({ status: 404, description: 'Landing page not found' })
  async exportLeads(
    @Param('id') id: string,
    @Request() req,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Res() res: Response,
  ) {
    const creatorId = this.getRequestUserId(req);
    const result = await this.leadsService.exportLeads(
      id,
      creatorId,
      format === 'json' ? 'json' : 'csv',
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Cache-Control', 'no-cache');

    return res.send(result.content);
  }

  @Delete(':pageId/leads/:leadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a lead from a landing page' })
  @ApiParam({ name: 'pageId', description: 'Landing page ID' })
  @ApiParam({ name: 'leadId', description: 'Lead ID' })
  @ApiResponse({ status: 200, description: 'Lead deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lead or landing page not found' })
  async deleteLead(
    @Param('pageId') pageId: string,
    @Param('leadId') leadId: string,
    @Request() req,
  ) {
    const creatorId = this.getRequestUserId(req);
    await this.leadsService.deleteLead(pageId, leadId, creatorId);
    return { success: true, message: 'Lead deleted successfully' };
  }
}
