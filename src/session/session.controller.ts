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
  UseInterceptors,
  Request,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CacheDuration, CacheTTL } from '../common/decorators/cache-ttl.decorator';
import { PlanFeatureGuard, RequireFeature } from '../common/guards/plan-feature.guard';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  private getRequestUserId(req: any): string {
    return (
      req?.user?._id ||
      req?.user?.userId ||
      req?.user?.sub ||
      req?.user?.id ||
      ''
    ).toString();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PlanFeatureGuard)
  @RequireFeature('sessions')
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
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(CacheDuration.ONE_MINUTE)
  @ApiOperation({ summary: 'Récupérer toutes les sessions avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des sessions récupérée avec succès', type: SessionListResponseDto })
  @ApiQuery({ name: 'page', required: false, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'éléments par page', example: 10 })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Slug de la communauté' })
  @ApiQuery({ name: 'communityId', required: false, description: 'ID de la communauté' })
  @ApiQuery({ name: 'category', required: false, description: 'Catégorie de la session' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Si la session est active' })
  @ApiQuery({ name: 'creatorId', required: false, description: 'ID du créateur' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('communitySlug') communitySlug?: string,
    @Query('communityId') communityId?: string,
    @Query('category') category?: string,
    @Query('isActive') isActive?: boolean,
    @Query('creatorId') creatorId?: string
  ): Promise<SessionListResponseDto> {
    return this.sessionService.findAll(
      page,
      limit,
      communitySlug,
      communityId,
      category,
      isActive,
      creatorId
    );
  }

  @Get('community/:communitySlug')
  @ApiOperation({ summary: 'Récupérer les sessions d\'une communauté' })
  @ApiResponse({ status: 200, description: 'Sessions de la communauté récupérées avec succès', type: [SessionResponseDto] })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async findByCommunity(
    @Param('communitySlug') communitySlug: string,
    @Request() req: any
  ): Promise<SessionResponseDto[]> {
    // Get userId from JWT if authenticated, otherwise undefined
    const userId = req.user?._id || req.user?.userId || req.user?.sub;
    return this.sessionService.findByCommunity(communitySlug, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.sessionService.update(id, updateSessionDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.sessionService.remove(id, userId);
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
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    return this.sessionService.bookSession(sessionId, bookSessionDto, userId, promoCode);
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
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    console.log(`[confirmBooking] bookingId: ${bookingId}, userId: ${userId}`);
    return this.sessionService.confirmBooking(bookingId, confirmBookingDto, userId);
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
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    console.log(`[cancelBooking] bookingId: ${bookingId}, userId: ${userId}`);
    return this.sessionService.cancelBooking(bookingId, cancelBookingDto, userId);
  }

  @Post('bookings/:bookingId/create-meet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Google Meet link for a booking' })
  @ApiResponse({ status: 200, description: 'Meet link created successfully' })
  @ApiResponse({ status: 400, description: 'Cannot create Meet link' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async createMeetLink(
    @Param('bookingId') bookingId: string,
    @Request() req: any
  ): Promise<{ bookingId: string; meetingUrl?: string; googleEventId?: string; meetStatus: 'not_required' | 'pending' | 'created' | 'failed'; meetFailureReason?: string }> {
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    console.log(`[createMeetLink] bookingId: ${bookingId}, userId: ${userId}`);
    return this.sessionService.createMeetLinkForBooking(bookingId, userId);
  }

  @Get('bookings/:bookingId/meet-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Meet provisioning status for a booking' })
  @ApiResponse({ status: 200, description: 'Meet provisioning status retrieved' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getMeetStatus(
    @Param('bookingId') bookingId: string,
    @Request() req: any
  ): Promise<any> {
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    return this.sessionService.getMeetStatusForBooking(bookingId, userId);
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
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    console.log(`[completeSession] bookingId: ${bookingId}, userId: ${userId}`);
    return this.sessionService.completeSession(bookingId, completeSessionDto, userId);
  }

  @Get('bookings/user')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les réservations d\'un utilisateur' })
  @ApiResponse({ status: 200, description: 'Réservations de l\'utilisateur récupérées avec succès', type: UserBookingsResponseDto })
  @ApiQuery({ name: 'communityId', required: false, description: 'Filtrer les réservations par ID de communauté' })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Filtrer les réservations par slug de communauté' })
  async getUserBookings(
    @Request() req: any,
    @Query('communityId') communityId?: string,
    @Query('communitySlug') communitySlug?: string,
  ): Promise<UserBookingsResponseDto> {
    const userId = req.user._id || req.user.userId || req.user.sub;
    console.log(`[getUserBookings Controller] User from JWT: ${JSON.stringify({ _id: req.user._id, userId: req.user.userId, sub: req.user.sub })}`);
    console.log(`[getUserBookings Controller] Resolved userId: ${userId}`);
    
    // First sync any missing bookings from paid orders
    await this.sessionService.syncBookingsFromPaidOrders(userId);
    // Then return the bookings
    return this.sessionService.getUserBookings(userId, { communityId, communitySlug });
  }

  @Post('bookings/cleanup-duplicates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clean up duplicate bookings for the current user' })
  @ApiResponse({ status: 200, description: 'Duplicate bookings cleaned up successfully' })
  async cleanupDuplicateBookings(@Request() req: any) {
    const userId = req.user._id || req.user.userId || req.user.sub;
    console.log(`[cleanupDuplicateBookings Controller] Cleaning up duplicates for user: ${userId}`);
    const result = await this.sessionService.cleanupDuplicateBookings(userId);
    return {
      success: true,
      message: `Cleaned up ${result.duplicatesRemoved} duplicate booking(s) from ${result.sessionsProcessed} session(s)`,
      ...result
    };
  }

  @Post('bookings/retry-meet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry pending/failed Meet provisioning for current creator' })
  @ApiResponse({ status: 200, description: 'Retry completed' })
  async retryMeetProvisioning(@Request() req: any) {
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    const result = await this.sessionService.retryPendingMeetProvisioning(userId);
    return {
      success: true,
      ...result,
    };
  }

  @Get('bookings/creator')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les réservations d\'un créateur' })
  @ApiResponse({ status: 200, description: 'Réservations du créateur récupérées avec succès', type: CreatorBookingsResponseDto })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending, confirmed, completed, cancelled)' })
  @ApiQuery({ name: 'timeFilter', required: false, description: 'Filter by time (upcoming, past, all)', example: 'all' })
  @ApiQuery({ name: 'sessionId', required: false, description: 'Filter by session ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by user name or session title' })
  async getCreatorBookings(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('timeFilter') timeFilter?: string,
    @Query('sessionId') sessionId?: string,
    @Query('search') search?: string,
  ): Promise<CreatorBookingsResponseDto> {
    const userId = req.user._id || req.user.userId || req.user.sub;
    console.log(`[getCreatorBookings] Fetching bookings for creator: ${userId}`);
    const result = await this.sessionService.getCreatorBookings(userId, {
      page: page || 1,
      limit: limit || 20,
      status,
      timeFilter: timeFilter || 'all',
      sessionId,
      search,
    });
    console.log(`[getCreatorBookings] Found ${result.total} bookings`);
    return result;
  }

  // Get sessions for a specific user (for profile viewing)
  @Get('by-user/:userId')
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  @ApiOperation({ 
    summary: 'Get sessions for a specific user',
    description: 'Retrieve sessions associated with a user (booked + created)'
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, enum: ['booked', 'created', 'all'], description: 'Session type filter' })
  @ApiQuery({ name: 'timeFilter', required: false, enum: ['upcoming', 'past', 'all'], description: 'Time filter' })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: 'Filter by community ID' })
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
    @Query('timeFilter') timeFilter: 'upcoming' | 'past' | 'all' = 'all',
    @Query('communityId') communityId?: string,
    @Request() req?: any,
  ) {
    const requesterId = this.getRequestUserId(req);
    const requestedUserId = String(userId || '').trim();
    const resolvedUserId = requestedUserId.toLowerCase() === 'me' ? requesterId : requestedUserId;

    if (!resolvedUserId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const visibilityScope = requesterId && requesterId === resolvedUserId ? 'owner' : 'public';
    return await this.sessionService.getSessionsByUser(
      resolvedUserId,
      Number(page) || 1, 
      Number(limit) || 10,
      type,
      timeFilter,
      communityId,
      visibilityScope,
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
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    return this.sessionService.bookSlot(sessionId, bookSlotDto, userId);
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
