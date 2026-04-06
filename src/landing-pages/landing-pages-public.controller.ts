import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LandingPagesService } from './landing-pages.service';
import { LeadsService } from './leads.service';
import { PageAnalyticsService, RecordViewData } from './page-analytics.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';

interface TrackViewBody {
  sessionId: string;
  referrer?: string;
  device?: 'desktop' | 'tablet' | 'mobile';
  country?: string;
}

interface ExitBody {
  duration: number;
  converted?: boolean;
}

@ApiTags('Landing Pages – Public')
@Controller('landing-pages/public')
export class LandingPagesPublicController {
  constructor(
    private readonly landingPagesService: LandingPagesService,
    private readonly leadsService: LeadsService,
    private readonly pageAnalyticsService: PageAnalyticsService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private extractIp(forwardedFor: string | undefined, fallback = ''): string {
    if (!forwardedFor) return fallback;
    // x-forwarded-for may be a comma-separated list; take the first (original client)
    return forwardedFor.split(',')[0].trim();
  }

  // ─── Get Page by Creator Slug + Page Slug ─────────────────────────────────

  @Get(':creatorSlug/:slug')
  @ApiOperation({
    summary: 'Get a published landing page by creator slug and page slug',
    description:
      'Publicly accessible. More specific lookup that prevents slug collisions between creators.',
  })
  @ApiParam({ name: 'creatorSlug', description: 'Creator profile slug/handle' })
  @ApiParam({ name: 'slug', description: 'Landing page slug' })
  @ApiResponse({ status: 200, description: 'Published landing page' })
  @ApiResponse({
    status: 404,
    description: 'Landing page not found or not published',
  })
  async getByCreatorAndSlug(
    @Param('creatorSlug') creatorSlug: string,
    @Param('slug') slug: string,
  ) {
    try {
      const page = await this.landingPagesService.findPublicPageByCreatorSlug(
        slug,
        creatorSlug,
      );
      return { success: true, data: page };
    } catch {
      // Fall back to unscoped lookup
      const page = await this.landingPagesService.findPublicPage(slug);
      return { success: true, data: page };
    }
  }

  // ─── Get Page by Slug ─────────────────────────────────────────────────────────

  @Get(':slug')
  @ApiOperation({
    summary: 'Get a published landing page by slug',
    description:
      'Publicly accessible. Returns the full landing page including blocks.',
  })
  @ApiParam({ name: 'slug', description: 'Landing page slug' })
  @ApiResponse({ status: 200, description: 'Published landing page' })
  @ApiResponse({
    status: 404,
    description: 'Landing page not found or not published',
  })
  async getBySlug(@Param('slug') slug: string) {
    const page = await this.landingPagesService.findPublicPage(slug);
    return { success: true, data: page };
  }

  // ─── Get Page by ID ───────────────────────────────────────────────────────────

  @Get('by-id/:id')
  @ApiOperation({
    summary: 'Get a published landing page by ID',
    description:
      'Publicly accessible. Returns the full landing page including blocks.',
  })
  @ApiParam({ name: 'id', description: 'Landing page MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Published landing page' })
  @ApiResponse({
    status: 404,
    description: 'Landing page not found or not published',
  })
  async getById(@Param('id') id: string) {
    const page = await this.landingPagesService.findPublicPageById(id);
    return { success: true, data: page };
  }

  // ─── Submit Lead ──────────────────────────────────────────────────────────────

  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a lead form for a published landing page',
    description:
      'No authentication required. Captures visitor contact info and custom form data.',
  })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({ status: 201, description: 'Lead submitted successfully' })
  @ApiResponse({
    status: 404,
    description: 'Landing page not found or not published',
  })
  async submitLead(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitLeadDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ipAddress = this.extractIp(forwardedFor);
    const lead = await this.leadsService.submit(id, dto, ipAddress, userAgent);
    return {
      success: true,
      data: {
        id: (lead as any)._id,
        score: lead.score,
        status: lead.status,
      },
      message: 'Thank you! Your submission has been received.',
    };
  }

  // ─── Track Page View ──────────────────────────────────────────────────────────

  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Track a page view for a landing page',
    description:
      'Records a unique session view. Idempotent – duplicate sessionIds are ignored.',
  })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiResponse({
    status: 204,
    description: 'View recorded (or silently ignored if duplicate)',
  })
  async trackView(
    @Param('id') id: string,
    @Body() body: TrackViewBody,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!body?.sessionId) return;

    const data: RecordViewData = {
      sessionId: body.sessionId,
      ipAddress: this.extractIp(forwardedFor),
      userAgent,
      referrer: body.referrer,
      device: body.device,
      country: body.country,
    };

    // Fire-and-forget: analytics errors must never break the visitor experience
    this.pageAnalyticsService.recordView(id, data).catch(() => {});
  }

  // ─── Record Exit Duration ─────────────────────────────────────────────────────

  @Post(':id/view/:sessionId/exit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record the session duration when the visitor leaves the page',
    description:
      'Called on page unload / beforeunload / visibilitychange. Updates the duration for the given session.',
  })
  @ApiParam({ name: 'id', description: 'Landing page ID' })
  @ApiParam({ name: 'sessionId', description: 'Visitor session ID' })
  @ApiResponse({ status: 204, description: 'Duration recorded' })
  async recordExit(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ExitBody,
  ) {
    const duration = Number(body?.duration ?? 0);

    // Fire-and-forget: analytics errors must never block the response
    this.pageAnalyticsService
      .updateViewDuration(id, sessionId, duration, body?.converted)
      .catch(() => {});
  }
}
