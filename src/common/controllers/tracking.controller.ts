import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Param, 
  Body, 
  Query, 
  UseGuards, 
  Req, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { ContentTrackingService } from '../services/content-tracking.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TrackableContentType, TrackingActionType } from '../../schema/content-tracking.schema';
import { UpdateIncrementalWatchTimeDto } from '../dto/update-watch-time.dto';

interface AuthenticatedUser {
  _id: string;
  role: string;
}

const resolveRequestIpAddress = (req: any): string | undefined => {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const realIp = req?.headers?.['x-real-ip'];

  let candidate: unknown = null;
  if (Array.isArray(forwarded)) candidate = forwarded[0];
  else if (typeof forwarded === 'string') candidate = forwarded.split(',')[0];
  else if (Array.isArray(realIp)) candidate = realIp[0];
  else if (typeof realIp === 'string') candidate = realIp;
  else candidate = req?.ip || req?.socket?.remoteAddress;

  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
};

const enrichTrackingMetadata = (req: any, metadata?: any) => {
  const enriched = { ...(metadata || {}) };
  const userAgent = req?.headers?.['user-agent'];
  if (typeof userAgent === 'string' && !enriched.userAgent) {
    enriched.userAgent = userAgent;
  }

  const ipAddress = resolveRequestIpAddress(req);
  if (ipAddress && !enriched.ipAddress) {
    enriched.ipAddress = ipAddress;
  }

  return enriched;
};

@ApiTags('Content Tracking')
@Controller('tracking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TrackingController {
  constructor(private readonly trackingService: ContentTrackingService) {}

  /**
   * Enregistrer une vue
   */
  @Post(':contentType/:contentId/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track content view' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackView(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('metadata') metadata?: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const enriched = enrichTrackingMetadata(req, metadata);
    return await this.trackingService.trackView(user._id, contentId, contentType as TrackableContentType, enriched);
  }

  /**
   * Enregistrer un démarrage
   */
  @Post(':contentType/:contentId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track content start' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackStart(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('metadata') metadata?: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const enriched = enrichTrackingMetadata(req, metadata);
    return await this.trackingService.trackStart(user._id, contentId, contentType as TrackableContentType, enriched);
  }

  /**
   * Enregistrer une completion
   */
  @Post(':contentType/:contentId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track content completion' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackComplete(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('metadata') metadata?: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const enriched = enrichTrackingMetadata(req, metadata);
    return await this.trackingService.trackComplete(user._id, contentId, contentType as TrackableContentType, enriched);
  }

  /**
   * Mettre à jour le temps de visionnage
   */
  @Put(':contentType/:contentId/watch-time')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update watch time' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ type: UpdateIncrementalWatchTimeDto })
  async updateWatchTime(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body() body: UpdateIncrementalWatchTimeDto,
    @Req() req
  ) {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.updateWatchTime(user._id, contentId, contentType as TrackableContentType, body.additionalTime);
  }

  /**
   * Enregistrer un like
   */
  @Post(':contentType/:contentId/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track content like' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackLike(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('metadata') metadata?: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const enriched = enrichTrackingMetadata(req, metadata);
    return await this.trackingService.trackLike(user._id, contentId, contentType as TrackableContentType, enriched);
  }

  /**
   * Enregistrer un partage
   */
  @Post(':contentType/:contentId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track content share' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackShare(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('metadata') metadata?: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const enriched = enrichTrackingMetadata(req, metadata);
    return await this.trackingService.trackShare(user._id, contentId, contentType as TrackableContentType, enriched);
  }

  /**
   * Enregistrer un téléchargement
   */
  @Post(':contentType/:contentId/download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track content download' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackDownload(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('metadata') metadata?: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const enriched = enrichTrackingMetadata(req, metadata);
    return await this.trackingService.trackDownload(user._id, contentId, contentType as TrackableContentType, enriched);
  }

  /**
   * Ajouter un bookmark
   */
  @Post(':contentType/:contentId/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add content bookmark' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async addBookmark(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req,
    @Body('bookmarkId') bookmarkId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.addBookmark(user._id, contentId, contentType as TrackableContentType, bookmarkId);
  }

  /**
   * Retirer un bookmark
   */
  @Put(':contentType/:contentId/bookmark/:bookmarkId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove content bookmark' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiParam({ name: 'bookmarkId', description: 'Bookmark ID' })
  async removeBookmark(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Param('bookmarkId') bookmarkId: string,
    @Req() req
  ) {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.removeBookmark(user._id, contentId, contentType as TrackableContentType, bookmarkId);
  }

  /**
   * Ajouter une note/évaluation
   */
  @Post(':contentType/:contentId/rating')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add content rating' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async addRating(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body('rating') rating: number,
    @Req() req,
    @Body('review') review?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.addRating(user._id, contentId, contentType as TrackableContentType, rating, review);
  }

  /**
   * Obtenir la progression d'un contenu
   */
  @Get(':contentType/:contentId/progress')
  @ApiOperation({ summary: 'Get content progress' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async getProgress(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Req() req
  ) {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.getProgress(user._id, contentId, contentType as TrackableContentType);
  }

  /**
   * Obtenir les progressions d'un utilisateur par type
   */
  @Get('user/:contentType')
  @ApiOperation({ summary: 'Get user progress by content type' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserProgressByType(
    @Param('contentType') contentType: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Req() req
  ) {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.getUserProgressByType(
      user._id,
      contentType as TrackableContentType,
      Number(page) || 1,
      Number(limit) || 10
    );
  }

  /**
   * Obtenir les statistiques d'un contenu
   */
  @Get(':contentType/:contentId/stats')
  @ApiOperation({ summary: 'Get content statistics' })
  @ApiParam({ name: 'contentType', enum: TrackableContentType })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async getContentStats(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string
  ) {
    return await this.trackingService.getContentStats(contentId, contentType as TrackableContentType);
  }

  /**
   * Obtenir les actions récentes d'un utilisateur
   */
  @Get('user/actions/recent')
  @ApiOperation({ summary: 'Get user recent actions' })
  @ApiQuery({ name: 'contentType', required: false, enum: TrackableContentType })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserRecentActions(
    @Req() req,
    @Query('contentType') contentType?: string,
    @Query('limit') limit = '20',
  ): Promise<any> {
    const user = req.user as AuthenticatedUser;
    return await this.trackingService.getUserRecentActions(
      user._id,
      contentType as TrackableContentType | undefined,
      Number(limit) || 20
    );
  }
}
