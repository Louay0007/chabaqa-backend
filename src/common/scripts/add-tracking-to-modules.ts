// Script to add tracking integration to all content modules
// This is a reference script showing how to integrate tracking

export const TRACKING_INTEGRATION_TEMPLATE = {
  // Module imports
  moduleImports: `
import { TrackingModule } from '../common/modules/tracking.module';`,

  // Module configuration
  moduleConfig: `
    TrackingModule,`,

  // Service imports
  serviceImports: `
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { TrackableContentType } from '../schema/content-tracking.schema';`,

  // Service constructor
  serviceConstructor: `
    private readonly trackingService: ContentTrackingService,`,

  // Tracking methods template
  trackingMethods: `
  // ============ TRACKING METHODS ============

  /**
   * Enregistrer une vue d'un {contentType}
   */
  async track{ContentType}View({contentType}Id: string, userId: string) {
    return await this.trackingService.trackView(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }

  /**
   * Démarrer un {contentType}
   */
  async track{ContentType}Start({contentType}Id: string, userId: string) {
    return await this.trackingService.trackStart(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }

  /**
   * Marquer un {contentType} comme terminé
   */
  async track{ContentType}Complete({contentType}Id: string, userId: string) {
    return await this.trackingService.trackComplete(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }

  /**
   * Mettre à jour le temps de visionnage d'un {contentType}
   */
  async update{ContentType}WatchTime({contentType}Id: string, userId: string, additionalTime: number) {
    return await this.trackingService.updateWatchTime(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE}, additionalTime);
  }

  /**
   * Enregistrer un like sur un {contentType}
   */
  async track{ContentType}Like({contentType}Id: string, userId: string) {
    return await this.trackingService.trackLike(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }

  /**
   * Enregistrer un partage d'un {contentType}
   */
  async track{ContentType}Share({contentType}Id: string, userId: string) {
    return await this.trackingService.trackShare(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }

  /**
   * Ajouter un bookmark d'un {contentType}
   */
  async add{ContentType}Bookmark({contentType}Id: string, userId: string, bookmarkId: string) {
    return await this.trackingService.addBookmark(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE}, bookmarkId);
  }

  /**
   * Retirer un bookmark d'un {contentType}
   */
  async remove{ContentType}Bookmark({contentType}Id: string, userId: string, bookmarkId: string) {
    return await this.trackingService.removeBookmark(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE}, bookmarkId);
  }

  /**
   * Ajouter une note/évaluation d'un {contentType}
   */
  async add{ContentType}Rating({contentType}Id: string, userId: string, rating: number, review?: string) {
    return await this.trackingService.addRating(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE}, rating, review);
  }

  /**
   * Obtenir la progression d'un utilisateur pour un {contentType}
   */
  async get{ContentType}Progress({contentType}Id: string, userId: string) {
    return await this.trackingService.getProgress(userId, {contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }

  /**
   * Obtenir les statistiques d'un {contentType}
   */
  async get{ContentType}Stats({contentType}Id: string) {
    return await this.trackingService.getContentStats({contentType}Id, TrackableContentType.{CONTENT_TYPE});
  }`,

  // Controller endpoints template
  controllerEndpoints: `
  // ============ TRACKING ENDPOINTS ============

  @Post(':id/track/view')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer une vue d\'un {contentType}' })
  @ApiResponse({ status: 200, description: 'Vue enregistrée avec succès' })
  async trackView(@Param('id') id: string, @Request() req: any) {
    return this.{serviceName}.track{ContentType}View(id, req.user.userId);
  }

  @Post(':id/track/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarrer un {contentType}' })
  @ApiResponse({ status: 200, description: '{ContentType} démarré avec succès' })
  async trackStart(@Param('id') id: string, @Request() req: any) {
    return this.{serviceName}.track{ContentType}Start(id, req.user.userId);
  }

  @Post(':id/track/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer un {contentType} comme terminé' })
  @ApiResponse({ status: 200, description: '{ContentType} marqué comme terminé' })
  async trackComplete(@Param('id') id: string, @Request() req: any) {
    return this.{serviceName}.track{ContentType}Complete(id, req.user.userId);
  }

  @Post(':id/track/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un like sur un {contentType}' })
  @ApiResponse({ status: 200, description: 'Like enregistré avec succès' })
  async trackLike(@Param('id') id: string, @Request() req: any) {
    return this.{serviceName}.track{ContentType}Like(id, req.user.userId);
  }

  @Post(':id/track/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un partage d\'un {contentType}' })
  @ApiResponse({ status: 200, description: 'Partage enregistré avec succès' })
  async trackShare(@Param('id') id: string, @Request() req: any) {
    return this.{serviceName}.track{ContentType}Share(id, req.user.userId);
  }

  @Post(':id/track/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter un bookmark d\'un {contentType}' })
  @ApiResponse({ status: 200, description: 'Bookmark ajouté avec succès' })
  async addBookmark(@Param('id') id: string, @Body('bookmarkId') bookmarkId: string, @Request() req: any) {
    return this.{serviceName}.add{ContentType}Bookmark(id, req.user.userId, bookmarkId);
  }

  @Delete(':id/track/bookmark/:bookmarkId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un bookmark d\'un {contentType}' })
  @ApiResponse({ status: 200, description: 'Bookmark retiré avec succès' })
  async removeBookmark(@Param('id') id: string, @Param('bookmarkId') bookmarkId: string, @Request() req: any) {
    return this.{serviceName}.remove{ContentType}Bookmark(id, req.user.userId, bookmarkId);
  }

  @Post(':id/track/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter une note/évaluation d\'un {contentType}' })
  @ApiResponse({ status: 200, description: 'Note ajoutée avec succès' })
  async addRating(@Param('id') id: string, @Body('rating') rating: number, @Body('review') review?: string, @Request() req: any) {
    return this.{serviceName}.add{ContentType}Rating(id, req.user.userId, rating, review);
  }

  @Get(':id/track/progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir la progression d\'un utilisateur pour un {contentType}' })
  @ApiResponse({ status: 200, description: 'Progression récupérée avec succès' })
  async getProgress(@Param('id') id: string, @Request() req: any) {
    return this.{serviceName}.get{ContentType}Progress(id, req.user.userId);
  }

  @Get(':id/track/stats')
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un {contentType}' })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées avec succès' })
  async getStats(@Param('id') id: string) {
    return this.{serviceName}.get{ContentType}Stats(id);
  }`
};

// Module configurations for each content type
export const MODULE_CONFIGS = [
  {
    name: 'Session',
    contentType: 'session',
    CONTENT_TYPE: 'SESSION',
    serviceName: 'sessionService'
  },
  {
    name: 'Post',
    contentType: 'post',
    CONTENT_TYPE: 'POST',
    serviceName: 'postService'
  },
  {
    name: 'Event',
    contentType: 'event',
    CONTENT_TYPE: 'EVENT',
    serviceName: 'eventService'
  },
  {
    name: 'Product',
    contentType: 'product',
    CONTENT_TYPE: 'PRODUCT',
    serviceName: 'productService'
  },
  {
    name: 'Resource',
    contentType: 'resource',
    CONTENT_TYPE: 'RESOURCE',
    serviceName: 'resourceService'
  }
];
