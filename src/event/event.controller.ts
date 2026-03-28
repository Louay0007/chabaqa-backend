import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { EventService } from './event.service';
import { CreateEventDto, CreateEventSessionDto, CreateEventTicketDto, CreateEventSpeakerDto } from '../dto-event/create-event.dto';
import { UpdateEventDto } from '../dto-event/update-event.dto';
import { EventResponseDto, EventListResponseDto, EventStatsResponseDto } from '../dto-event/event-response.dto';
import { EventQrTokenResponseDto } from '../dto-event/event-qr-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { PlanFeatureGuard, RequireFeature } from '../common/guards/plan-feature.guard';

@ApiTags('Events')
@Controller('events')
@UseInterceptors(HttpCacheInterceptor)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard, PlanFeatureGuard)
  @RequireFeature('events')
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouvel événement' })
  @ApiResponse({ status: 201, description: 'Événement créé avec succès', type: EventResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de la communauté' })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async create(
    @Body() createEventDto: CreateEventDto,
    @Request() req
  ): Promise<{ success: boolean; data: EventResponseDto }> {
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    const event = await this.eventService.create(createEventDto, userId);
    return { success: true, data: event };
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer tous les événements' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: 'ID de la communauté' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Catégorie de l\'événement' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Type d\'événement' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Statut actif' })
  @ApiQuery({ name: 'isPublished', required: false, type: Boolean, description: 'Statut publié' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Terme de recherche' })
  @ApiResponse({ status: 200, description: 'Liste des événements récupérée avec succès', type: EventListResponseDto })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('communityId') communityId?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('isActive') isActive?: string | boolean,
    @Query('isPublished') isPublished?: string | boolean,
    @Query('search') search?: string
  ): Promise<{ success: boolean; data: EventListResponseDto }> {
    const parsedIsActive = this.parseBooleanQuery(isActive);
    const parsedIsPublished = this.parseBooleanQuery(isPublished);

    const events = await this.eventService.findAll(
      page,
      limit,
      communityId,
      category,
      type,
      parsedIsActive,
      parsedIsPublished,
      search
    );
    return { success: true, data: events };
  }

  @Get('my-registrations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les événements auxquels l\'utilisateur est inscrit' })
  @ApiResponse({ status: 200, description: 'Événements récupérés avec succès', type: EventListResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getMyRegistrations(
    @Request() req
  ): Promise<{ success: boolean; events: any[] }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const events = await this.eventService.getMyRegistrations(userId);
    return { success: true, events };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Récupérer les statistiques des événements' })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: 'ID de la communauté' })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées avec succès', type: EventStatsResponseDto })
  async getStats(
    @Query('communityId') communityId?: string
  ): Promise<{ success: boolean; data: EventStatsResponseDto }> {
    const stats = await this.eventService.getStats(communityId);
    return { success: true, data: stats };
  }

  @Get('ticket/verify/:token')
  @ApiOperation({ summary: 'Public ticket verification via QR token — no auth required' })
  @ApiResponse({ status: 200, description: 'Ticket verification data' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyTicketPublic(
    @Param('token') token: string,
  ): Promise<{ success: boolean; data: any }> {
    const data = await this.eventService.verifyTicketPublic(token);
    return { success: true, data };
  }

  @Get(':id/qr')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Générer un QR code pour un billet d\'événement' })
  @ApiResponse({ status: 200, description: 'QR token généré', type: EventQrTokenResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Événement ou inscription non trouvé' })
  async getEventQr(
    @Param('id') eventId: string,
    @Request() req
  ): Promise<{ success: boolean; data: EventQrTokenResponseDto }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.buildEventQrToken(eventId, userId);
    return { success: true, data: result };
  }

  @Post(':id/check-in')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check-in un participant via QR token (creator/admin)' })
  @ApiResponse({ status: 200, description: 'Check-in réussi' })
  @ApiResponse({ status: 400, description: 'Token invalide' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas autorisé' })
  @ApiResponse({ status: 404, description: 'Événement ou inscription non trouvé' })
  @ApiBody({ schema: { type: 'object', properties: { token: { type: 'string' } } } })
  async checkInByQrToken(
    @Param('id') eventId: string,
    @Body('token') token: string,
    @Request() req,
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const data = await this.eventService.checkInAttendeeByQrToken(eventId, token, userId);
    return { success: true, data };
  }

  @Patch(':id/attendees/:attendeeId/check-in')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check-in un participant (manual) (creator/admin)' })
  @ApiResponse({ status: 200, description: 'Check-in réussi' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas autorisé' })
  @ApiResponse({ status: 404, description: 'Événement ou inscription non trouvé' })
  async checkInAttendee(
    @Param('id') eventId: string,
    @Param('attendeeId') attendeeId: string,
    @Request() req,
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const data = await this.eventService.checkInAttendee(eventId, attendeeId, userId);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un événement par ID' })
  @ApiResponse({ status: 200, description: 'Événement récupéré avec succès', type: EventResponseDto })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async findOne(@Param('id') id: string): Promise<{ success: boolean; data: EventResponseDto }> {
    const event = await this.eventService.findOne(id);
    return { success: true, data: event };
  }

  @Get('community/:communityId')
  @ApiOperation({ summary: 'Récupérer les événements d\'une communauté' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filtrer par statut actif (défaut: true)' })
  @ApiQuery({ name: 'isPublished', required: false, type: Boolean, description: 'Filtrer par statut publié (défaut: true)' })
  @ApiResponse({ status: 200, description: 'Événements de la communauté récupérés avec succès', type: EventListResponseDto })
  async findByCommunity(
    @Param('communityId') communityId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('isActive') isActive?: string | boolean,
    @Query('isPublished') isPublished?: string | boolean,
  ): Promise<{ success: boolean; data: EventListResponseDto }> {
    const parsedIsActive = this.parseBooleanQuery(isActive);
    const parsedIsPublished = this.parseBooleanQuery(isPublished);

    const events = await this.eventService.findByCommunity(
      communityId,
      page,
      limit,
      parsedIsActive ?? true,
      parsedIsPublished ?? true,
    );
    return { success: true, data: events };
  }

  @Get('creator/:creatorId')
  @ApiOperation({ summary: 'Récupérer les événements d\'un créateur' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: 'ID de la communauté (filtre)' })
  @ApiResponse({ status: 200, description: 'Événements du créateur récupérés avec succès', type: EventListResponseDto })
  async findByCreator(
    @Param('creatorId') creatorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('communityId') communityId?: string
  ): Promise<{ success: boolean; data: EventListResponseDto }> {
    const events = await this.eventService.findByCreator(creatorId, page, limit, communityId);
    return { success: true, data: events };
  }

  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'S\'inscrire à un événement' })
  @ApiResponse({ status: 201, description: 'Inscription réussie' })
  @ApiResponse({ status: 400, description: 'Inscription impossible' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Événement ou type de billet non trouvé' })
  @ApiQuery({ name: 'promoCode', required: false, type: String })
  async registerAttendee(
    @Param('id') eventId: string,
    @Body('ticketType') ticketType: string,
    @Query('promoCode') promoCode: string | undefined,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.registerAttendee(eventId, ticketType, userId, promoCode);
    return { success: true, ...result };
  }

  @Post(':id/unregister')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Se désinscrire d\'un événement' })
  @ApiResponse({ status: 200, description: 'Désinscription réussie' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Événement ou inscription non trouvé' })
  async unregisterAttendee(
    @Param('id') eventId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.unregisterAttendee(eventId, userId);
    return { success: true, ...result };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un événement' })
  @ApiResponse({ status: 200, description: 'Événement mis à jour avec succès', type: EventResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @Request() req
  ): Promise<{ success: boolean; data: EventResponseDto }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    console.log('🔐 [EVENT UPDATE] User attempting to update event:', {
      eventId: id,
      userId: userId,
      userObject: req.user,
      updateData: {
        title: updateEventDto.title,
        isActive: updateEventDto.isActive,
        isPublished: updateEventDto.isPublished
      }
    });
    const event = await this.eventService.update(id, updateEventDto, userId);
    return { success: true, data: event };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un événement' })
  @ApiResponse({ status: 200, description: 'Événement supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async remove(
    @Param('id') id: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.remove(id, userId);
    return { success: true, ...result };
  }

  @Post(':id/sessions')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter une session à un événement' })
  @ApiResponse({ status: 201, description: 'Session ajoutée avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async addSession(
    @Param('id') eventId: string,
    @Body() createSessionDto: CreateEventSessionDto,
    @Request() req
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const session = await this.eventService.addSession(eventId, createSessionDto, userId);
    return { success: true, data: session };
  }

  @Delete(':id/sessions/:sessionId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer une session d\'un événement' })
  @ApiResponse({ status: 200, description: 'Session supprimée avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement ou session non trouvé' })
  async removeSession(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.removeSession(eventId, sessionId, userId);
    return { success: true, ...result };
  }

  @Post(':id/tickets')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un billet à un événement' })
  @ApiResponse({ status: 201, description: 'Billet ajouté avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async addTicket(
    @Param('id') eventId: string,
    @Body() createTicketDto: CreateEventTicketDto,
    @Request() req
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const ticket = await this.eventService.addTicket(eventId, createTicketDto, userId);
    return { success: true, data: ticket };
  }

  @Delete(':id/tickets/:ticketId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un billet d\'un événement' })
  @ApiResponse({ status: 200, description: 'Billet supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement ou billet non trouvé' })
  async removeTicket(
    @Param('id') eventId: string,
    @Param('ticketId') ticketId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.removeTicket(eventId, ticketId, userId);
    return { success: true, ...result };
  }

  @Post(':id/speakers')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un conférencier à un événement' })
  @ApiResponse({ status: 201, description: 'Conférencier ajouté avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async addSpeaker(
    @Param('id') eventId: string,
    @Body() createSpeakerDto: CreateEventSpeakerDto,
    @Request() req
  ): Promise<{ success: boolean; data: any }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const speaker = await this.eventService.addSpeaker(eventId, createSpeakerDto, userId);
    return { success: true, data: speaker };
  }

  @Delete(':id/speakers/:speakerId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un conférencier d\'un événement' })
  @ApiResponse({ status: 200, description: 'Conférencier supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement ou conférencier non trouvé' })
  async removeSpeaker(
    @Param('id') eventId: string,
    @Param('speakerId') speakerId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.removeSpeaker(eventId, speakerId, userId);
    return { success: true, ...result };
  }

  @Patch(':id/toggle-published')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Event', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Basculer le statut de publication d\'un événement' })
  @ApiResponse({ status: 200, description: 'Statut de publication mis à jour avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas le créateur de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  async togglePublished(
    @Param('id') eventId: string,
    @Request() req
  ): Promise<{ success: boolean; message: string; isPublished: boolean }> {
    const userId = req.user._id || req.user.userId || req.user.id;
    const result = await this.eventService.togglePublished(eventId, userId);
    return { success: true, ...result };
  }

  private parseBooleanQuery(value?: string | boolean): boolean | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return undefined;
  }
}

