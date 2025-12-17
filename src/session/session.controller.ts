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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { CreateSessionDto } from '../dto-session/create-session.dto';
import { UpdateSessionDto } from '../dto-session/update-session.dto';
import { BookSessionDto, ConfirmBookingDto, CancelBookingDto, CompleteSessionDto } from '../dto-session/book-session.dto';
import { SessionResponseDto, SessionListResponseDto, UserBookingsResponseDto, CreatorBookingsResponseDto } from '../dto-session/session-response.dto';
import { SetAvailableHoursDto, GenerateSlotsDto, BookSlotDto, GetAvailableSlotsDto } from '../dto-session/available-hours.dto';
import { AvailableSlotsResponseDto, AvailableHoursResponseDto } from '../dto-session/available-slots-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une nouvelle session' })
  @ApiResponse({ status: 201, description: 'Session créée avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async create(
    @Body() createSessionDto: CreateSessionDto,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    const userId = req.user._id || req.user.userId;
    return this.sessionService.create(createSessionDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer toutes les sessions avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des sessions récupérée avec succès', type: SessionListResponseDto })
  @ApiQuery({ name: 'page', required: false, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'éléments par page', example: 10 })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Slug de la communauté' })
  @ApiQuery({ name: 'category', required: false, description: 'Catégorie de la session' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Si la session est active' })
  @ApiQuery({ name: 'creatorId', required: false, description: 'ID du créateur' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('communitySlug') communitySlug?: string,
    @Query('category') category?: string,
    @Query('isActive') isActive?: boolean,
    @Query('creatorId') creatorId?: string
  ): Promise<SessionListResponseDto> {
    return this.sessionService.findAll(
      page,
      limit,
      communitySlug,
      category,
      isActive,
      creatorId
    );
  }

  @Get('community/:communitySlug')
  @ApiOperation({ summary: 'Récupérer les sessions d\'une communauté' })
  @ApiResponse({ status: 200, description: 'Sessions de la communauté récupérées avec succès', type: [SessionResponseDto] })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async findByCommunity(@Param('communitySlug') communitySlug: string): Promise<SessionResponseDto[]> {
    return this.sessionService.findByCommunity(communitySlug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une session par son ID' })
  @ApiResponse({ status: 200, description: 'Session récupérée avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  async findOne(@Param('id') id: string): Promise<SessionResponseDto> {
    return this.sessionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour une session' })
  @ApiResponse({ status: 200, description: 'Session mise à jour avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  async update(
    @Param('id') id: string,
    @Body() updateSessionDto: UpdateSessionDto,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.update(id, updateSessionDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une session' })
  @ApiResponse({ status: 204, description: 'Session supprimée avec succès' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    return this.sessionService.remove(id, req.user.userId);
  }

  @Post(':id/book')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Réserver une session' })
  @ApiResponse({ status: 201, description: 'Session réservée avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de réserver la session' })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  @ApiQuery({ name: 'promoCode', required: false, type: String })
  async bookSession(
    @Param('id') sessionId: string,
    @Body() bookSessionDto: BookSessionDto,
    @Query('promoCode') promoCode: string | undefined,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.bookSession(sessionId, bookSessionDto, req.user.userId, promoCode);
  }

  @Patch('bookings/:bookingId/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmer une réservation' })
  @ApiResponse({ status: 200, description: 'Réservation confirmée avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de confirmer la réservation' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  async confirmBooking(
    @Param('bookingId') bookingId: string,
    @Body() confirmBookingDto: ConfirmBookingDto,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.confirmBooking(bookingId, confirmBookingDto, req.user.userId);
  }

  @Patch('bookings/:bookingId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Annuler une réservation' })
  @ApiResponse({ status: 200, description: 'Réservation annulée avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible d\'annuler la réservation' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  async cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body() cancelBookingDto: CancelBookingDto,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.cancelBooking(bookingId, cancelBookingDto, req.user.userId);
  }

  @Patch('bookings/:bookingId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marquer une session comme terminée' })
  @ApiResponse({ status: 200, description: 'Session marquée comme terminée avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de marquer la session comme terminée' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  async completeSession(
    @Param('bookingId') bookingId: string,
    @Body() completeSessionDto: CompleteSessionDto,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.completeSession(bookingId, completeSessionDto, req.user.userId);
  }

  @Get('bookings/user')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les réservations d\'un utilisateur' })
  @ApiResponse({ status: 200, description: 'Réservations de l\'utilisateur récupérées avec succès', type: UserBookingsResponseDto })
  async getUserBookings(@Request() req: any): Promise<UserBookingsResponseDto> {
    return this.sessionService.getUserBookings(req.user.userId);
  }

  @Get('bookings/creator')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les réservations d\'un créateur' })
  @ApiResponse({ status: 200, description: 'Réservations du créateur récupérées avec succès', type: CreatorBookingsResponseDto })
  async getCreatorBookings(@Request() req: any): Promise<CreatorBookingsResponseDto> {
    return this.sessionService.getCreatorBookings(req.user.userId);
  }

  // Get sessions for a specific user (for profile viewing)
  @Get('by-user/:userId')
  @ApiOperation({ 
    summary: 'Get sessions for a specific user',
    description: 'Retrieve sessions associated with a user (booked + created)'
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, enum: ['booked', 'created', 'all'], description: 'Session type filter' })
  @ApiQuery({ name: 'timeFilter', required: false, enum: ['upcoming', 'past', 'all'], description: 'Time filter' })
  @ApiResponse({
    status: 200,
    description: 'User sessions retrieved successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'User sessions retrieved successfully',
          data: {
            sessions: [
              {
                id: '1',
                title: 'Design Systems Workshop',
                description: 'Learn to build scalable design systems',
                thumbnail: 'https://example.com/thumb.jpg',
                startTime: '2024-01-20T14:00:00Z',
                duration: 60,
                status: 'upcoming',
                type: 'booked',
                creator: {
                  name: 'Jane Doe',
                  avatar: 'https://example.com/avatar.jpg'
                }
              }
            ],
            pagination: {
              page: 1,
              limit: 10,
              total: 5,
              totalPages: 1
            }
          }
        }
      }
    }
  })
  async getSessionsByUser(
    @Param('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('type') type: 'booked' | 'created' | 'all' = 'all',
    @Query('timeFilter') timeFilter: 'upcoming' | 'past' | 'all' = 'all'
  ) {
    return await this.sessionService.getSessionsByUser(
      userId, 
      Number(page) || 1, 
      Number(limit) || 10,
      type,
      timeFilter
    );
  }

  // ============ GESTION DES HEURES DE DISPONIBILITÉ ============

  @Post(':id/available-hours')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Définir les heures de disponibilité pour une session' })
  @ApiResponse({ status: 200, description: 'Heures de disponibilité définies avec succès', type: AvailableHoursResponseDto })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  async setAvailableHours(
    @Param('id') sessionId: string,
    @Body() setAvailableHoursDto: SetAvailableHoursDto,
    @Request() req: any
  ): Promise<AvailableHoursResponseDto> {
    return this.sessionService.setAvailableHours(sessionId, setAvailableHoursDto, req.user.userId);
  }

  @Get(':id/available-hours')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les heures de disponibilité d\'une session' })
  @ApiResponse({ status: 200, description: 'Heures de disponibilité récupérées avec succès', type: AvailableHoursResponseDto })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  async getAvailableHours(
    @Param('id') sessionId: string,
    @Request() req: any
  ): Promise<AvailableHoursResponseDto> {
    return this.sessionService.getAvailableHours(sessionId, req.user.userId);
  }

  @Post(':id/generate-slots')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Générer les créneaux disponibles pour une session' })
  @ApiResponse({ status: 200, description: 'Créneaux générés avec succès', type: AvailableSlotsResponseDto })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  async generateAvailableSlots(
    @Param('id') sessionId: string,
    @Body() generateSlotsDto: GenerateSlotsDto,
    @Request() req: any
  ): Promise<AvailableSlotsResponseDto> {
    return this.sessionService.generateAvailableSlots(sessionId, generateSlotsDto, req.user.userId);
  }

  @Get(':id/available-slots')
  @ApiOperation({ summary: 'Récupérer les créneaux disponibles pour une session' })
  @ApiResponse({ status: 200, description: 'Créneaux disponibles récupérés avec succès', type: AvailableSlotsResponseDto })
  @ApiResponse({ status: 404, description: 'Session non trouvée' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Date de début pour filtrer les créneaux' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Date de fin pour filtrer les créneaux' })
  async getAvailableSlots(
    @Param('id') sessionId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<AvailableSlotsResponseDto> {
    const getAvailableSlotsDto: GetAvailableSlotsDto = {};
    if (startDate) getAvailableSlotsDto.startDate = startDate;
    if (endDate) getAvailableSlotsDto.endDate = endDate;
    
    return this.sessionService.getAvailableSlots(sessionId, getAvailableSlotsDto);
  }

  // ============ RÉSERVATION DE CRÉNEAUX ============

  @Post(':id/book-slot')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Réserver un créneau spécifique' })
  @ApiResponse({ status: 201, description: 'Créneau réservé avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de réserver le créneau' })
  @ApiResponse({ status: 404, description: 'Session ou créneau non trouvé' })
  async bookSlot(
    @Param('id') sessionId: string,
    @Body() bookSlotDto: BookSlotDto,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.bookSlot(sessionId, bookSlotDto, req.user.userId);
  }

  @Patch(':id/cancel-slot/:slotId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Annuler un créneau réservé' })
  @ApiResponse({ status: 200, description: 'Créneau annulé avec succès', type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible d\'annuler le créneau' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Session ou créneau non trouvé' })
  async cancelSlot(
    @Param('id') sessionId: string,
    @Param('slotId') slotId: string,
    @Request() req: any
  ): Promise<SessionResponseDto> {
    return this.sessionService.cancelSlot(sessionId, slotId, req.user.userId);
  }
}
