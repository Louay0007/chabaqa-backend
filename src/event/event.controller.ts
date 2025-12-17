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
  DefaultValuePipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EventService } from './event.service';
import { CreateEventDto, CreateEventSessionDto, CreateEventTicketDto, CreateEventSpeakerDto } from '../dto-event/create-event.dto';
import { UpdateEventDto } from '../dto-event/update-event.dto';
import { EventResponseDto, EventListResponseDto, EventStatsResponseDto } from '../dto-event/event-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Events')
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
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
    const userId = req.user._id || req.user.userId;
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
    @Query('isActive') isActive?: boolean,
    @Query('isPublished') isPublished?: boolean,
    @Query('search') search?: string
  ): Promise<{ success: boolean; data: EventListResponseDto }> {
    const events = await this.eventService.findAll(
      page,
      limit,
      communityId,
      category,
      type,
      isActive,
      isPublished,
      search
    );
    return { success: true, data: events };
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
  @ApiResponse({ status: 200, description: 'Événements de la communauté récupérés avec succès', type: EventListResponseDto })
  async findByCommunity(
    @Param('communityId') communityId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ): Promise<{ success: boolean; data: EventListResponseDto }> {
    const events = await this.eventService.findByCommunity(communityId, page, limit);
    return { success: true, data: events };
  }

  @Get('creator/:creatorId')
  @ApiOperation({ summary: 'Récupérer les événements d\'un créateur' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiResponse({ status: 200, description: 'Événements du créateur récupérés avec succès', type: EventListResponseDto })
  async findByCreator(
    @Param('creatorId') creatorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ): Promise<{ success: boolean; data: EventListResponseDto }> {
    const events = await this.eventService.findByCreator(creatorId, page, limit);
    return { success: true, data: events };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
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
    const event = await this.eventService.update(id, updateEventDto, req.user.userId);
    return { success: true, data: event };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
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
    const result = await this.eventService.remove(id, req.user.userId);
    return { success: true, ...result };
  }

  @Post(':id/sessions')
  @UseGuards(JwtAuthGuard)
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
    const session = await this.eventService.addSession(eventId, createSessionDto, req.user.userId);
    return { success: true, data: session };
  }

  @Delete(':id/sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
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
    const result = await this.eventService.removeSession(eventId, sessionId, req.user.userId);
    return { success: true, ...result };
  }

  @Post(':id/tickets')
  @UseGuards(JwtAuthGuard)
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
    const ticket = await this.eventService.addTicket(eventId, createTicketDto, req.user.userId);
    return { success: true, data: ticket };
  }

  @Delete(':id/tickets/:ticketId')
  @UseGuards(JwtAuthGuard)
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
    const result = await this.eventService.removeTicket(eventId, ticketId, req.user.userId);
    return { success: true, ...result };
  }

  @Post(':id/speakers')
  @UseGuards(JwtAuthGuard)
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
    const speaker = await this.eventService.addSpeaker(eventId, createSpeakerDto, req.user.userId);
    return { success: true, data: speaker };
  }

  @Delete(':id/speakers/:speakerId')
  @UseGuards(JwtAuthGuard)
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
    const result = await this.eventService.removeSpeaker(eventId, speakerId, req.user.userId);
    return { success: true, ...result };
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
    const result = await this.eventService.registerAttendee(eventId, ticketType, req.user.userId, promoCode);
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
    const result = await this.eventService.unregisterAttendee(eventId, req.user.userId);
    return { success: true, ...result };
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
    const events = await this.eventService.getMyRegistrations(req.user.userId);
    return { success: true, events };
  }

  @Patch(':id/toggle-published')
  @UseGuards(JwtAuthGuard)
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
    const result = await this.eventService.togglePublished(eventId, req.user.userId);
    return { success: true, ...result };
  }
}

