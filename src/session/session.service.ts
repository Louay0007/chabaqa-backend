import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Session, SessionDocument } from '../schema/session.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreateSessionDto } from '../dto-session/create-session.dto';
import { UpdateSessionDto } from '../dto-session/update-session.dto';
import { BookSessionDto, ConfirmBookingDto, CancelBookingDto, CompleteSessionDto, UpdateBookingStatusDto } from '../dto-session/book-session.dto';
import { SessionResponseDto, SessionListResponseDto, UserBookingsResponseDto, CreatorBookingsResponseDto } from '../dto-session/session-response.dto';
import { SetAvailableHoursDto, GenerateSlotsDto, BookSlotDto, GetAvailableSlotsDto } from '../dto-session/available-hours.dto';
import { AvailableSlotsResponseDto, AvailableHoursResponseDto } from '../dto-session/available-slots-response.dto';
import { PromoService } from '../common/services/promo.service';
import { PolicyService } from '../common/services/policy.service';
import { FeeService } from '../common/services/fee.service';
import { TrackableContentType } from '../schema/content-tracking.schema';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { EmailService, SessionBookingEmailData } from '../email/email.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    private readonly feeService: FeeService,
    private readonly promoService: PromoService,
    private readonly policyService: PolicyService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly emailService: EmailService,
  ) { }

  /**
   * Helper method to find community by communityId (supports both _id and id field)
   */
  private async findCommunityById(communityId: string): Promise<CommunityDocument | null> {
    if (!communityId) return null;
    
    // Try to find by _id first (if it's a valid ObjectId)
    if (Types.ObjectId.isValid(communityId)) {
      const community = await this.communityModel.findById(communityId);
      if (community) return community;
    }
    
    // Fallback to finding by id field
    return this.communityModel.findOne({ id: communityId });
  }

  /**
   * Get sessions for a specific user (booked + created)
   */
  async getSessionsByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type: 'booked' | 'created' | 'all' = 'all',
    timeFilter: 'upcoming' | 'past' | 'all' = 'all'
  ) {
    console.log('🔧 DEBUG - getSessionsByUser');
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📄 Page: ${page}, Limit: ${limit}, Type: ${type}, TimeFilter: ${timeFilter}`);

    const skip = (page - 1) * limit;
    let allSessions: any[] = [];
    let totalCount = 0;
    const now = new Date();

    // Get booked sessions
    if (type === 'booked' || type === 'all') {
      const bookedSessions = await this.sessionModel
        .find({ 'bookings.userId': new Types.ObjectId(userId) })
        .populate('creatorId', 'name email profile_picture photo_profil')
        .populate('communityId', 'name slug')
        .sort({ startTime: -1 })
        .exec();

      const transformedBooked = bookedSessions
        .map(session => {
          const booking = session.bookings.find(b => b.userId.toString() === userId);
          const sessionData = session as any;
          const startTime = new Date(sessionData.startTime || sessionData.dateTime);
          const isUpcoming = startTime > now;
          const isPast = startTime <= now;

          // Apply time filter
          if (timeFilter === 'upcoming' && !isUpcoming) return null;
          if (timeFilter === 'past' && !isPast) return null;

          return {
            id: session.id,
            title: sessionData.title || sessionData.name,
            description: sessionData.description,
            thumbnail: sessionData.thumbnail || sessionData.image || 'https://placehold.co/400x300?text=Session',
            startTime: sessionData.startTime || sessionData.dateTime,
            duration: sessionData.duration || 60,
            status: isUpcoming ? 'upcoming' : 'past',
            type: 'booked',
            bookingStatus: booking?.status || 'confirmed',
            bookedAt: (booking as any)?.bookedAt || (booking as any)?.createdAt,
            creator: {
              name: (session.creatorId as any)?.name || 'Unknown',
              avatar: (session.creatorId as any)?.profile_picture || 'https://placehold.co/64x64?text=MM'
            },
            community: {
              name: (session.communityId as any)?.name || 'Unknown',
              slug: (session.communityId as any)?.slug || 'unknown'
            }
          };
        })
        .filter(Boolean);

      allSessions = [...allSessions, ...transformedBooked];
    }

    // Get created sessions
    if (type === 'created' || type === 'all') {
      const createdSessions = await this.sessionModel
        .find({ creatorId: new Types.ObjectId(userId) })
        .populate('creatorId', 'name email profile_picture photo_profil')
        .populate('communityId', 'name slug')
        .sort({ startTime: -1 })
        .exec();

      const transformedCreated = createdSessions
        .map(session => {
          const sessionData = session as any;
          const startTime = new Date(sessionData.startTime || sessionData.dateTime);
          const isUpcoming = startTime > now;
          const isPast = startTime <= now;

          // Apply time filter
          if (timeFilter === 'upcoming' && !isUpcoming) return null;
          if (timeFilter === 'past' && !isPast) return null;

          return {
            id: session.id,
            title: sessionData.title || sessionData.name,
            description: sessionData.description,
            thumbnail: sessionData.thumbnail || sessionData.image || 'https://placehold.co/400x300?text=Session',
            startTime: sessionData.startTime || sessionData.dateTime,
            duration: sessionData.duration || 60,
            status: isUpcoming ? 'upcoming' : 'past',
            type: 'created',
            bookingsCount: sessionData.bookings?.length || 0,
            maxParticipants: sessionData.maxParticipants || sessionData.capacity,
            createdAt: session.createdAt,
            creator: {
              name: (session.creatorId as any)?.name || 'Unknown',
              avatar: (session.creatorId as any)?.profile_picture || 'https://placehold.co/64x64?text=MM'
            },
            community: {
              name: (session.communityId as any)?.name || 'Unknown',
              slug: (session.communityId as any)?.slug || 'unknown'
            }
          };
        })
        .filter(Boolean);

      allSessions = [...allSessions, ...transformedCreated];
    }

    // Sort by start time (upcoming first, then past)
    allSessions.sort((a, b) => {
      const dateA = new Date(a.startTime);
      const dateB = new Date(b.startTime);

      // If both are upcoming or both are past, sort by date
      if ((dateA > now && dateB > now) || (dateA <= now && dateB <= now)) {
        return dateA.getTime() - dateB.getTime();
      }

      // Upcoming sessions come first
      return dateA > now ? -1 : 1;
    });

    totalCount = allSessions.length;
    const paginatedSessions = allSessions.slice(skip, skip + limit);

    console.log(`   📊 Total sessions found: ${totalCount}`);
    console.log(`   📄 Returning: ${paginatedSessions.length} sessions`);

    return {
      success: true,
      message: 'User sessions retrieved successfully',
      data: {
        sessions: paginatedSessions,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    };
  }

  /**
   * Créer une nouvelle session
   */
  async create(createSessionDto: CreateSessionDto, creatorId: string | any): Promise<SessionResponseDto> {
    // Vérifier que la communauté existe
    const community = await this.communityModel.findOne({ slug: createSessionDto.communitySlug });
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    // Normaliser l'ID créateur pour comparaison
    const normalizedCreatorId = typeof creatorId === 'object'
      ? creatorId.toString()
      : String(creatorId);
    const communityCreatorId = community.createur?.toString();

    // Vérifier que l'utilisateur est le créateur de la communauté
    // DISABLED FOR TESTING - TODO: Re-enable before production
    // if (communityCreatorId !== normalizedCreatorId) {
    //   throw new ForbiddenException('Seul le créateur de la communauté peut créer des sessions');
    // }

    // Générer un ID unique pour la session
    const sessionId = new Types.ObjectId().toString();

    // Gating: require active subscription to activate sessions
    // DISABLED FOR TESTING - TODO: Re-enable before production
    // const hasSub = await this.policyService.hasActiveSubscription(creatorId);
    // if (!hasSub && createSessionDto.isActive) {
    //   throw new ForbiddenException('Un abonnement actif est requis pour activer une session');
    // }
    const hasSub = true; // TESTING: Always allow session creation

    // Créer la session
    const session = new this.sessionModel({
      id: sessionId,
      title: createSessionDto.title,
      description: createSessionDto.description,
      duration: createSessionDto.duration,
      price: createSessionDto.price,
      currency: createSessionDto.currency,
      communityId: community._id.toString(),
      creatorId: new Types.ObjectId(creatorId),
      isActive: createSessionDto.isActive ?? true,
      category: createSessionDto.category,
      maxBookingsPerWeek: createSessionDto.maxBookingsPerWeek,
      notes: createSessionDto.notes,
      resources: createSessionDto.resources || [],
    });

    const savedSession = await session.save();
    return this.transformToResponseDto(savedSession, community);
  }

  /**
   * Récupérer toutes les sessions avec pagination et filtres
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    communitySlug?: string,
    communityId?: string,
    category?: string,
    isActive?: boolean,
    creatorId?: string
  ): Promise<SessionListResponseDto> {
    const query: any = {};

    // Filtres - support both communitySlug and communityId
    if (communityId) {
      // communityId is stored as string in schema
      query.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId).toString()
        : communityId;
    } else if (communitySlug) {
      const community = await this.communityModel.findOne({ slug: communitySlug });
      if (community) {
        query.communityId = community._id.toString();
      }
    }

    if (category) {
      query.category = category;
    }

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    if (creatorId) {
      query.creatorId = new Types.ObjectId(creatorId);
    }

    // Pagination
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find(query)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.sessionModel.countDocuments(query)
    ]);

    // Récupérer les communautés pour chaque session
    const communityIds = [...new Set(sessions.map(s => s.communityId))];
    const communities = await this.communityModel.find({ 
      $or: [
        { _id: { $in: communityIds.filter(id => Types.ObjectId.isValid(id)).map(id => new Types.ObjectId(id)) } },
        { id: { $in: communityIds } }
      ]
    });

    const sessionResponses = await Promise.all(
      sessions.map(session => {
        const community = communities.find(c => c._id.toString() === session.communityId || c.id === session.communityId);
        return this.transformToResponseDto(session, community || undefined);
      })
    );

    return {
      sessions: sessionResponses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Récupérer une session par son ID
   */
  async findOne(id: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel
      .findOne({ id })
      .populate('creatorId', 'name email profile_picture photo_profil')
      .exec();

    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // Look up community by _id (convert string to ObjectId if needed)
    let community;
    try {
      community = await this.communityModel.findOne({
        _id: new Types.ObjectId(session.communityId),
      });
    } catch (e) {
      // If conversion fails, try looking up by id field as fallback
      community = await this.communityModel.findOne({
        id: session.communityId,
      });
    }

    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    return this.transformToResponseDto(session, community);
  }

  /**
   * Récupérer les sessions d'une communauté
   */
  async findByCommunity(communitySlug: string, currentUserId?: string): Promise<SessionResponseDto[]> {
    const community = await this.communityModel.findOne({ slug: communitySlug });
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    const sessions = await this.sessionModel
      .find({ communityId: community._id.toString() })
      .populate('creatorId', 'name email profile_picture photo_profil')
      .sort({ createdAt: -1 })
      .exec();

    return Promise.all(
      sessions.map(session => this.transformToResponseDto(session, community, currentUserId))
    );
  }

  /**
   * Mettre à jour une session
   */
  async update(id: string, updateSessionDto: UpdateSessionDto, userId: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ id });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // Normalize user IDs for comparison
    const sessionCreatorId = session.creatorId.toString();
    const requestUserId = userId?.toString() || '';
    
    console.log('🔧 DEBUG - Session Update');
    console.log(`   Session ID: ${id}`);
    console.log(`   Session Creator ID: ${sessionCreatorId}`);
    console.log(`   Request User ID: ${requestUserId}`);
    console.log(`   Match: ${sessionCreatorId === requestUserId}`);

    // DISABLED FOR TESTING - Creator check
    // Vérifier que l'utilisateur est le créateur de la session
    // if (sessionCreatorId !== requestUserId) {
    //   throw new ForbiddenException('Seul le créateur de la session peut la modifier');
    // }

    // Gating: require active subscription to activate sessions
    // DISABLED FOR TESTING - TODO: Re-enable before production
    // if (updateSessionDto.isActive === true && session.isActive !== true) {
    //   const hasSub = await this.policyService.hasActiveSubscription(userId);
    //   if (!hasSub) {
    //     throw new ForbiddenException('Un abonnement actif est requis pour publier une session');
    //   }
    // }

    // Mettre à jour la session
    Object.assign(session, updateSessionDto);
    const updatedSession = await session.save();

    const community = await this.findCommunityById(session.communityId);
    return this.transformToResponseDto(updatedSession, community || undefined);
  }

  /**
   * Supprimer une session
   */
  async remove(id: string, userId: string): Promise<void> {
    const session = await this.sessionModel.findOne({ id });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // DISABLED FOR TESTING - Creator check
    // Vérifier que l'utilisateur est le créateur de la session
    // if (session.creatorId.toString() !== userId) {
    //   throw new ForbiddenException('Seul le créateur de la session peut la supprimer');
    // }

    await this.sessionModel.deleteOne({ id });
  }

  /**
   * Réserver une session
   */
  async bookSession(sessionId: string, bookSessionDto: BookSessionDto, userId: string, promoCode?: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // Vérifier que la session est active
    if (!session.isActive) {
      throw new BadRequestException('Cette session n\'est plus active');
    }

    // Vérifier que l'utilisateur n'est pas le créateur
    if (session.creatorId.toString() === userId) {
      throw new BadRequestException('Vous ne pouvez pas réserver votre propre session');
    }

    const scheduledAt = new Date(bookSessionDto.scheduledAt);

    // Vérifier que la date est dans le futur
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('La date de la session doit être dans le futur');
    }

    // Vérifier la disponibilité
    if (!session.isTimeSlotAvailable(scheduledAt)) {
      throw new BadRequestException('Ce créneau horaire n\'est pas disponible');
    }

    // Vérifier la limite hebdomadaire
    if (!session.canBookMore()) {
      throw new BadRequestException('Limite de réservations hebdomadaires atteinte');
    }

    // Créer la réservation
    const booking = {
      id: new Types.ObjectId().toString(),
      userId: new Types.ObjectId(userId),
      scheduledAt: scheduledAt,
      status: 'pending' as const,
      notes: bookSessionDto.notes,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    session.addBooking(booking);
    // Si la session est payante, appliquer promo puis créer une commande avec calcul des frais
    if (session.price && session.price > 0) {
      // Check for existing paid order first
      const existingOrder = await this.orderModel.findOne({
        buyerId: new Types.ObjectId(userId),
        contentType: TrackableContentType.SESSION,
        contentId: session._id.toString(),
        status: 'paid'
      });

      if (!existingOrder) {
        let effective = session.price;
        let discountDT = 0;
        let appliedCode: string | undefined;
        if (promoCode) {
          const buyer = await this.userModel.findById(userId).select('email');
          const promo = await this.promoService.validateAndApply(promoCode, session.price, TrackableContentType.SESSION, session._id.toString(), (buyer as any)?.email);
          if (promo.valid) {
            effective = promo.finalAmountDT;
            discountDT = promo.discountDT;
            appliedCode = promo.appliedCode;
          }
        }
        const breakdown = await this.feeService.calculateForAmount(effective, session.creatorId.toString());
        await this.orderModel.create({
          buyerId: new Types.ObjectId(userId),
          creatorId: session.creatorId,
          contentType: TrackableContentType.SESSION,
          contentId: session._id.toString(),
          amountDT: breakdown.amountDT,
          platformPercent: breakdown.platformPercent,
          platformFixedDT: breakdown.platformFixedDT,
          platformFeeDT: breakdown.platformFeeDT,
          creatorNetDT: breakdown.creatorNetDT,
          promoCode: appliedCode,
          discountDT,
          status: 'paid'
        });
      }
    }
    await session.save();

    const community = await this.communityModel.findOne({ id: session.communityId });
    return this.transformToResponseDto(session, community || undefined, userId);
  }

  /**
   * Confirmer une réservation
   */
  async confirmBooking(bookingId: string, confirmBookingDto: ConfirmBookingDto, userId: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ 'bookings.id': bookingId });
    if (!session) {
      throw new NotFoundException('Réservation non trouvée');
    }

    // Vérifier que l'utilisateur est le créateur de la session
    if (session.creatorId.toString() !== userId) {
      throw new ForbiddenException('Seul le créateur de la session peut confirmer les réservations');
    }

    const booking = session.getBooking(bookingId);
    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    if (booking.status !== 'pending') {
      throw new BadRequestException('Cette réservation ne peut pas être confirmée');
    }

    // Try to create Google Meet link if creator has Google Calendar connected
    let meetingUrl = confirmBookingDto.meetingUrl;
    let googleEventId: string | undefined;
    
    if (!meetingUrl) {
      try {
        const hasGoogleAccess = await this.googleCalendarService.hasValidAccess(userId);
        if (hasGoogleAccess) {
          // Get participant email
          const participant = await this.userModel.findById(booking.userId).select('email name');
          if (participant?.email) {
            const scheduledAt = new Date(booking.scheduledAt);
            const endTime = new Date(scheduledAt.getTime() + (session.duration || 60) * 60 * 1000);
            
            this.logger.log(`[confirmBooking] Creating Google Meet for booking ${bookingId}`);
            const result = await this.googleCalendarService.createCalendarEventWithMeet(
              userId,
              session.id,
              participant.email,
              scheduledAt,
              endTime,
              session.title,
              session.description
            );
            
            meetingUrl = result.meetLink;
            googleEventId = result.eventId;
            this.logger.log(`[confirmBooking] Google Meet created: ${meetingUrl}`);
          }
        }
      } catch (error: any) {
        this.logger.warn(`[confirmBooking] Failed to create Google Meet: ${error.message}`);
        // Continue without Meet link - don't fail the confirmation
      }
    }

    // Mettre à jour la réservation
    booking.status = 'confirmed';
    booking.meetingUrl = meetingUrl;
    if (googleEventId) {
      (booking as any).googleEventId = googleEventId;
    }
    if (confirmBookingDto.notes) {
      booking.notes = confirmBookingDto.notes;
    }
    booking.updatedAt = new Date();

    session.markModified('bookings');
    await session.save();

    // Send confirmation email to participant
    try {
      const participant = await this.userModel.findById(booking.userId).select('email name');
      const creator = await this.userModel.findById(userId).select('email name');
      if (participant?.email && creator?.email) {
        await this.emailService.sendBookingConfirmation({
          participantEmail: participant.email,
          participantName: participant.name || 'Participant',
          creatorName: creator.name || 'Creator',
          creatorEmail: creator.email,
          sessionTitle: session.title,
          sessionDescription: session.description,
          scheduledAt: booking.scheduledAt,
          duration: session.duration || 60,
          meetingUrl: meetingUrl,
          bookingId: bookingId,
          sessionId: session.id,
        });
      }
    } catch (emailError: any) {
      this.logger.warn(`[confirmBooking] Failed to send confirmation email: ${emailError.message}`);
    }

    const community = await this.communityModel.findOne({ id: session.communityId });
    return this.transformToResponseDto(session, community || undefined);
  }

  /**
   * Annuler une réservation
   */
  async cancelBooking(bookingId: string, cancelBookingDto: CancelBookingDto, userId: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ 'bookings.id': bookingId });
    if (!session) {
      throw new NotFoundException('Réservation non trouvée');
    }

    const booking = session.getBooking(bookingId);
    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    // Vérifier que l'utilisateur peut annuler (créateur ou utilisateur de la réservation)
    if (session.creatorId.toString() !== userId && booking.userId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas annuler cette réservation');
    }

    if (booking.status === 'cancelled') {
      throw new BadRequestException('Cette réservation est déjà annulée');
    }

    if (booking.status === 'completed') {
      throw new BadRequestException('Cette réservation est déjà terminée');
    }

    // Mettre à jour la réservation
    booking.status = 'cancelled';
    if (cancelBookingDto.reason) {
      booking.notes = cancelBookingDto.reason;
    }
    booking.updatedAt = new Date();

    await session.save();

    const community = await this.communityModel.findOne({ id: session.communityId });
    return this.transformToResponseDto(session, community || undefined);
  }

  /**
   * Create Google Meet link for an existing booking
   */
  async createMeetLinkForBooking(bookingId: string, userId: string): Promise<{ meetingUrl: string; googleEventId: string }> {
    this.logger.debug(`[createMeetLinkForBooking] Looking for booking: ${bookingId}`);
    const session = await this.sessionModel.findOne({ 'bookings.id': bookingId });
    if (!session) {
      throw new NotFoundException('Booking not found');
    }

    this.logger.debug(`[createMeetLinkForBooking] Found session: ${session.id}, title: ${session.title}`);
    this.logger.debug(`[createMeetLinkForBooking] Session creatorId type: ${typeof session.creatorId}, value: ${session.creatorId}`);
    
    // Verify user is the creator - handle both ObjectId and string comparisons
    const creatorIdStr = session.creatorId?.toString();
    const userIdStr = userId?.toString();
    this.logger.debug(`[createMeetLinkForBooking] Comparing creatorId: "${creatorIdStr}" with userId: "${userIdStr}"`);
    this.logger.debug(`[createMeetLinkForBooking] Are they equal: ${creatorIdStr === userIdStr}`);
    
    if (creatorIdStr !== userIdStr) {
      this.logger.warn(`[createMeetLinkForBooking] Creator mismatch: session.creatorId=${creatorIdStr}, userId=${userIdStr}`);
      throw new ForbiddenException('Only the session creator can create Meet links');
    }

    const booking = session.getBooking(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check if booking already has a Meet link
    if (booking.meetingUrl) {
      throw new BadRequestException('This booking already has a Meet link');
    }

    // Check if creator has Google Calendar connected
    const hasGoogleAccess = await this.googleCalendarService.hasValidAccess(userId);
    if (!hasGoogleAccess) {
      throw new BadRequestException('Please connect your Google Calendar first');
    }

    // Get participant email
    const participant = await this.userModel.findById(booking.userId).select('email name');
    if (!participant?.email) {
      throw new BadRequestException('Participant email not found');
    }

    const scheduledAt = new Date(booking.scheduledAt);
    const endTime = new Date(scheduledAt.getTime() + (session.duration || 60) * 60 * 1000);

    this.logger.log(`[createMeetLinkForBooking] Creating Google Meet for booking ${bookingId}`);
    
    const result = await this.googleCalendarService.createCalendarEventWithMeet(
      userId,
      session.id,
      participant.email,
      scheduledAt,
      endTime,
      session.title,
      session.description
    );

    // Update booking with Meet link
    booking.meetingUrl = result.meetLink;
    (booking as any).googleEventId = result.eventId;
    booking.updatedAt = new Date();

    session.markModified('bookings');
    await session.save();

    this.logger.log(`[createMeetLinkForBooking] Google Meet created: ${result.meetLink}`);

    return { meetingUrl: result.meetLink, googleEventId: result.eventId };
  }

  /**
   * Marquer une session comme terminée
   */
  async completeSession(bookingId: string, completeSessionDto: CompleteSessionDto, userId: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ 'bookings.id': bookingId });
    if (!session) {
      throw new NotFoundException('Réservation non trouvée');
    }

    // Vérifier que l'utilisateur est le créateur de la session
    const creatorIdStr = session.creatorId?.toString();
    const userIdStr = userId?.toString();
    this.logger.debug(`[completeSession] Comparing creatorId: "${creatorIdStr}" with userId: "${userIdStr}"`);
    
    if (creatorIdStr !== userIdStr) {
      this.logger.warn(`[completeSession] Creator mismatch: session.creatorId=${creatorIdStr}, userId=${userIdStr}`);
      throw new ForbiddenException('Seul le créateur de la session peut la marquer comme terminée');
    }

    const booking = session.getBooking(bookingId);
    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    if (booking.status !== 'confirmed') {
      throw new BadRequestException('Seules les réservations confirmées peuvent être marquées comme terminées');
    }

    // Mettre à jour la réservation
    booking.status = 'completed';
    if (completeSessionDto.notes) {
      booking.notes = completeSessionDto.notes;
    }
    booking.updatedAt = new Date();

    await session.save();

    const community = await this.communityModel.findOne({ id: session.communityId });
    return this.transformToResponseDto(session, community || undefined);
  }

  /**
   * Récupérer les réservations d'un utilisateur
   */
  async getUserBookings(userId: string): Promise<UserBookingsResponseDto> {
    console.log(`[getUserBookings] Fetching bookings for user: ${userId}`);
    
    // Create ObjectId for comparison
    const userObjectId = new Types.ObjectId(userId);
    
    const sessions = await this.sessionModel
      .find({ 'bookings.userId': userObjectId })
      .populate('creatorId', 'name email profile_picture photo_profil')
      .exec();

    console.log(`[getUserBookings] Found ${sessions.length} sessions with bookings for user`);

    interface BookingWithSession {
      id: string;
      userId: Types.ObjectId;
      scheduledAt: Date;
      status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
      meetingUrl?: string;
      notes?: string;
      createdAt: Date;
      updatedAt: Date;
      sessionId: string;
      sessionTitle: string;
      creatorName: string;
      creatorAvatar?: string;
    }

    const allBookings: BookingWithSession[] = [];
    for (const session of sessions) {
      console.log(`[getUserBookings] Session ${session.id} has ${session.bookings.length} total bookings`);
      
      const userBookings = session.bookings.filter(booking => {
        // Use ObjectId.equals() for proper comparison
        const bookingUserIdObj = booking.userId;
        let match = false;
        
        if (bookingUserIdObj instanceof Types.ObjectId) {
          match = bookingUserIdObj.equals(userObjectId);
        } else {
          // Fallback to string comparison
          match = String(bookingUserIdObj) === String(userObjectId);
        }
        
        console.log(`[getUserBookings] Comparing booking userId: ${bookingUserIdObj} with ${userObjectId} => ${match}`);
        return match;
      });
      
      console.log(`[getUserBookings] Session ${session.id} has ${userBookings.length} bookings for this user`);
      for (const booking of userBookings) {
        // Get creator avatar - check both photo_profil and profile_picture fields
        const creator = session.creatorId as any;
        const creatorAvatar = creator?.photo_profil || creator?.profile_picture || creator?.avatar || undefined;
        
        allBookings.push({
          ...(booking as any).toObject ? (booking as any).toObject() : booking,
          sessionId: session.id,
          sessionTitle: session.title,
          creatorName: creator?.name || 'Unknown',
          creatorAvatar: creatorAvatar
        });
      }
    }

    console.log(`[getUserBookings] Total bookings found: ${allBookings.length}`);

    // Trier par date de création
    allBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      bookings: allBookings.map(booking => ({
        id: booking.id,
        sessionId: booking.sessionId,
        sessionTitle: booking.sessionTitle,
        creatorName: booking.creatorName,
        creatorAvatar: booking.creatorAvatar,
        userId: booking.userId.toString(),
        userName: 'Current User', // L'utilisateur actuel
        userAvatar: undefined,
        scheduledAt: booking.scheduledAt.toISOString(),
        status: booking.status,
        meetingUrl: booking.meetingUrl,
        notes: booking.notes,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      })),
      total: allBookings.length
    };
  }

  /**
   * Sync bookings from paid orders (for fixing missing bookings)
   */
  async syncBookingsFromPaidOrders(userId: string): Promise<{ synced: number; existing: number }> {
    console.log(`[syncBookingsFromPaidOrders] Syncing bookings for user: ${userId}`);
    
    const userObjectId = new Types.ObjectId(userId);
    
    // Find all paid session orders for this user
    const paidOrders = await this.orderModel.find({
      buyerId: userObjectId,
      contentType: 'session',
      status: 'paid',
    }).exec();

    console.log(`[syncBookingsFromPaidOrders] Found ${paidOrders.length} paid session orders`);

    let synced = 0;
    let existing = 0;

    for (const order of paidOrders) {
      // Find the session - contentId is stored as session._id.toString()
      // Try findById first since that's how contentId is stored
      let session = await this.sessionModel.findById(order.contentId);
      if (!session) {
        // Fallback to custom id field
        session = await this.sessionModel.findOne({ id: order.contentId });
      }
      console.log(`[syncBookingsFromPaidOrders] Session lookup for contentId ${order.contentId}: ${session ? `found (id: ${session.id})` : 'not found'}`);

      if (session) {
        // Check if booking already exists using ObjectId.equals()
        const existingBooking = session.bookings.find(b => {
          if (b.userId instanceof Types.ObjectId) {
            return b.userId.equals(userObjectId);
          }
          return String(b.userId) === String(userObjectId);
        });

        if (!existingBooking) {
          // Get slot info from order metadata if available
          const metadata = (order as any).metadata || {};
          const slotStartTime = metadata.slotStartTime;
          const notes = metadata.notes;

          // Create booking - push directly to avoid validation checks since this is a sync from paid orders
          const bookingId = new Types.ObjectId().toString();
          const newBooking = {
            id: bookingId,
            userId: userObjectId,
            scheduledAt: slotStartTime ? new Date(slotStartTime) : new Date(),
            status: 'confirmed' as const,
            notes: notes || undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          // Push directly to bookings array (bypass addBooking validation)
          session.bookings.push(newBooking as any);
          
          // Mark the bookings array as modified to ensure Mongoose saves it
          session.markModified('bookings');
          
          await session.save();
          synced++;
          console.log(`[syncBookingsFromPaidOrders] Created booking ${bookingId} for session ${session.id}, userId: ${userId}`);
          console.log(`[syncBookingsFromPaidOrders] Session now has ${session.bookings.length} bookings`);
        } else {
          existing++;
          console.log(`[syncBookingsFromPaidOrders] Booking already exists for session ${session.id}, bookingUserId: ${existingBooking.userId}`);
        }
      } else {
        console.log(`[syncBookingsFromPaidOrders] Session not found for order ${order._id}, contentId: ${order.contentId}`);
      }
    }

    return { synced, existing };
  }

  /**
   * Clean up duplicate bookings for a user in all sessions
   * Keeps only the oldest booking per user per session
   */
  async cleanupDuplicateBookings(userId?: string): Promise<{ sessionsProcessed: number; duplicatesRemoved: number }> {
    console.log(`[cleanupDuplicateBookings] Starting cleanup${userId ? ` for user: ${userId}` : ' for all users'}`);
    
    // Find sessions with bookings
    const query = userId 
      ? { 'bookings.userId': new Types.ObjectId(userId) }
      : { 'bookings.0': { $exists: true } };
    
    const sessions = await this.sessionModel.find(query).exec();
    
    let sessionsProcessed = 0;
    let duplicatesRemoved = 0;

    for (const session of sessions) {
      const bookingsByUser = new Map<string, any[]>();
      
      // Group bookings by userId
      for (const booking of session.bookings) {
        const bookingUserId = String(booking.userId);
        if (!bookingsByUser.has(bookingUserId)) {
          bookingsByUser.set(bookingUserId, []);
        }
        bookingsByUser.get(bookingUserId)!.push(booking);
      }

      // Find users with duplicate bookings
      let sessionHadDuplicates = false;
      const bookingsToKeep: any[] = [];

      for (const [userIdKey, userBookings] of bookingsByUser) {
        if (userBookings.length > 1) {
          // Sort by createdAt (oldest first) and keep only the first one
          userBookings.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          bookingsToKeep.push(userBookings[0]);
          duplicatesRemoved += userBookings.length - 1;
          sessionHadDuplicates = true;
          console.log(`[cleanupDuplicateBookings] Session ${session.id}: Removing ${userBookings.length - 1} duplicate(s) for user ${userIdKey}`);
        } else {
          bookingsToKeep.push(userBookings[0]);
        }
      }

      if (sessionHadDuplicates) {
        session.bookings = bookingsToKeep;
        session.markModified('bookings');
        await session.save();
        sessionsProcessed++;
      }
    }

    console.log(`[cleanupDuplicateBookings] Completed: ${sessionsProcessed} sessions processed, ${duplicatesRemoved} duplicates removed`);
    return { sessionsProcessed, duplicatesRemoved };
  }

  /**
   * Récupérer les réservations d'un créateur avec filtres et pagination
   */
  async getCreatorBookings(
    creatorId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      timeFilter?: string;
      sessionId?: string;
      search?: string;
    } = {}
  ): Promise<CreatorBookingsResponseDto> {
    const { page = 1, limit = 20, status, timeFilter = 'all', sessionId, search } = options;
    
    // Build query for sessions
    const sessionQuery: any = { creatorId: new Types.ObjectId(creatorId) };
    if (sessionId) {
      sessionQuery.id = sessionId;
    }
    
    const sessions = await this.sessionModel
      .find(sessionQuery)
      .populate('creatorId', 'name email profile_picture photo_profil')
      .exec();

    interface BookingWithSession {
      id: string;
      oderId?: string;
      userId: Types.ObjectId;
      scheduledAt: Date;
      status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
      meetingUrl?: string;
      googleEventId?: string;
      notes?: string;
      createdAt: Date;
      updatedAt: Date;
      sessionId: string;
      sessionTitle: string;
      sessionDuration: number;
      sessionPrice: number;
    }

    let allBookings: BookingWithSession[] = [];
    const now = new Date();
    
    for (const session of sessions) {
      for (const booking of session.bookings) {
        // Skip bookings without userId
        if (!booking.userId) {
          this.logger.warn(`[getCreatorBookings] Skipping booking ${booking.id} without userId`);
          continue;
        }
        
        const scheduledAt = new Date(booking.scheduledAt);
        const isUpcoming = scheduledAt > now;
        const isPast = scheduledAt <= now;
        
        // Apply time filter
        if (timeFilter === 'upcoming' && !isUpcoming) continue;
        if (timeFilter === 'past' && !isPast) continue;
        
        // Apply status filter
        if (status && booking.status !== status) continue;
        
        allBookings.push({
          id: booking.id,
          oderId: (booking as any).oderId,
          userId: booking.userId,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
          meetingUrl: booking.meetingUrl,
          googleEventId: (booking as any).googleEventId,
          notes: booking.notes,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          sessionId: session.id,
          sessionTitle: session.title,
          sessionDuration: session.duration || 60,
          sessionPrice: session.price || 0,
        });
      }
    }

    // Récupérer les informations des utilisateurs
    const userIds = [...new Set(allBookings.filter(b => b.userId).map(booking => booking.userId.toString()))];
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name email profile_picture photo_profil');
    
    // Create a map for quick user lookup
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
    // Apply search filter (after getting user info)
    if (search) {
      const searchLower = search.toLowerCase();
      allBookings = allBookings.filter(booking => {
        const user = userMap.get(booking.userId.toString());
        const userName = user?.name?.toLowerCase() || '';
        const sessionTitle = booking.sessionTitle.toLowerCase();
        return userName.includes(searchLower) || sessionTitle.includes(searchLower);
      });
    }

    // Sort: upcoming first (by date asc), then past (by date desc)
    allBookings.sort((a, b) => {
      const dateA = new Date(a.scheduledAt);
      const dateB = new Date(b.scheduledAt);
      const aIsUpcoming = dateA > now;
      const bIsUpcoming = dateB > now;
      
      if (aIsUpcoming && bIsUpcoming) {
        return dateA.getTime() - dateB.getTime(); // Upcoming: earliest first
      }
      if (!aIsUpcoming && !bIsUpcoming) {
        return dateB.getTime() - dateA.getTime(); // Past: most recent first
      }
      return aIsUpcoming ? -1 : 1; // Upcoming before past
    });

    // Calculate totals before pagination
    const total = allBookings.length;
    const totalPages = Math.ceil(total / limit);
    
    // Apply pagination
    const skip = (page - 1) * limit;
    const paginatedBookings = allBookings.slice(skip, skip + limit);

    // Calculate stats
    const stats = {
      total,
      pending: allBookings.filter(b => b.status === 'pending').length,
      confirmed: allBookings.filter(b => b.status === 'confirmed').length,
      completed: allBookings.filter(b => b.status === 'completed').length,
      cancelled: allBookings.filter(b => b.status === 'cancelled').length,
      upcoming: allBookings.filter(b => new Date(b.scheduledAt) > now && b.status !== 'cancelled').length,
      past: allBookings.filter(b => new Date(b.scheduledAt) <= now).length,
    };

    return {
      bookings: paginatedBookings.map(booking => {
        const user = userMap.get(booking.userId.toString());
        const userAvatar = user?.photo_profil || user?.profile_picture;
        const scheduledAt = new Date(booking.scheduledAt);
        return {
          id: booking.id,
          oderId: booking.oderId,
          sessionId: booking.sessionId,
          sessionTitle: booking.sessionTitle,
          sessionDuration: booking.sessionDuration,
          sessionPrice: booking.sessionPrice,
          userId: booking.userId?.toString() || '',
          userName: user?.name || 'Utilisateur inconnu',
          userEmail: user?.email,
          userAvatar: userAvatar,
          scheduledAt: booking.scheduledAt?.toISOString() || new Date().toISOString(),
          isUpcoming: scheduledAt > now,
          status: booking.status,
          meetingUrl: booking.meetingUrl,
          googleEventId: booking.googleEventId,
          notes: booking.notes,
          createdAt: booking.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: booking.updatedAt?.toISOString() || new Date().toISOString()
        };
      }),
      total,
      page,
      limit,
      totalPages,
      stats,
    };
  }

  /**
   * Définir les heures de disponibilité pour une session
   */
  async setAvailableHours(sessionId: string, setAvailableHoursDto: SetAvailableHoursDto, userId: string): Promise<AvailableHoursResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // DISABLED FOR TESTING - TODO: Re-enable before production
    // Vérifier que l'utilisateur est le créateur de la session
    // if (session.creatorId.toString() !== userId) {
    //   throw new ForbiddenException('Seul le créateur de la session peut définir les heures de disponibilité');
    // }

    // Mettre à jour les disponibilités récurrentes
    session.recurringAvailability = setAvailableHoursDto.recurringAvailability.map(av => ({
      id: new Types.ObjectId().toString(),
      dayOfWeek: av.dayOfWeek,
      startTime: av.startTime,
      endTime: av.endTime,
      slotDuration: av.slotDuration || 60,
      isActive: av.isActive ?? true,
      createdAt: new Date()
    }));

    // Mettre à jour les autres paramètres
    session.autoGenerateSlots = setAvailableHoursDto.autoGenerateSlots ?? false;
    session.advanceBookingDays = setAvailableHoursDto.advanceBookingDays || 30;

    await session.save();

    return this.transformToAvailableHoursResponseDto(session);
  }

  /**
   * Générer les créneaux disponibles pour une session
   */
  async generateAvailableSlots(sessionId: string, generateSlotsDto: GenerateSlotsDto, userId: string): Promise<AvailableSlotsResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // DISABLED FOR TESTING - TODO: Re-enable before production
    // Vérifier que l'utilisateur est le créateur de la session
    // if (session.creatorId.toString() !== userId) {
    //   throw new ForbiddenException('Seul le créateur de la session peut générer les créneaux');
    // }

    const startDate = new Date(generateSlotsDto.startDate);
    const endDate = new Date(generateSlotsDto.endDate);

    // Générer les créneaux
    session.generateAvailableSlots(startDate, endDate);
    await session.save();

    return this.transformToAvailableSlotsResponseDto(session);
  }

  /**
   * Obtenir les heures de disponibilité d'une session
   */
  async getAvailableHours(sessionId: string, userId: string): Promise<AvailableHoursResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // DISABLED FOR TESTING - TODO: Re-enable before production
    // Vérifier que l'utilisateur est le créateur de la session
    // if (session.creatorId.toString() !== userId) {
    //   throw new ForbiddenException('Seul le créateur de la session peut voir les heures de disponibilité');
    // }

    return this.transformToAvailableHoursResponseDto(session);
  }

  /**
   * Obtenir les créneaux disponibles pour une session
   */
  async getAvailableSlots(sessionId: string, getAvailableSlotsDto?: GetAvailableSlotsDto): Promise<AvailableSlotsResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    console.log(`[getAvailableSlots] Session ${sessionId}:`, {
      autoGenerateSlots: session.autoGenerateSlots,
      recurringAvailabilityCount: session.recurringAvailability?.length || 0,
      existingSlotsCount: session.availableSlots?.length || 0,
    });

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (getAvailableSlotsDto?.startDate) {
      startDate = new Date(getAvailableSlotsDto.startDate);
    }
    if (getAvailableSlotsDto?.endDate) {
      endDate = new Date(getAvailableSlotsDto.endDate);
    }

    // Si aucune date n'est spécifiée, utiliser les 30 prochains jours
    if (!startDate) {
      startDate = new Date();
    }
    if (!endDate) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + (session.advanceBookingDays || 30));
    }

    // Générer les créneaux si nécessaire (auto-generate OR if no slots exist but availability is configured)
    const shouldGenerate = (session.autoGenerateSlots || (session.availableSlots?.length === 0)) 
      && session.recurringAvailability 
      && session.recurringAvailability.length > 0;
    
    if (shouldGenerate) {
      console.log(`[getAvailableSlots] Generating slots for session ${sessionId} from ${startDate} to ${endDate}`);
      session.generateAvailableSlots(startDate, endDate);
      await session.save();
      console.log(`[getAvailableSlots] Generated ${session.availableSlots?.length || 0} slots`);
    }

    return this.transformToAvailableSlotsResponseDto(session, startDate, endDate);
  }

  /**
   * Réserver un créneau spécifique
   */
  async bookSlot(sessionId: string, bookSlotDto: BookSlotDto, userId: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    // Vérifier que la session est active
    if (!session.isActive) {
      throw new BadRequestException('Cette session n\'est plus active');
    }

    // Vérifier que l'utilisateur n'est pas le créateur
    if (session.creatorId.toString() === userId) {
      throw new BadRequestException('Vous ne pouvez pas réserver votre propre session');
    }

    // Trouver le créneau
    const slot = session.getSlot(bookSlotDto.slotId);
    if (!slot) {
      throw new NotFoundException('Créneau non trouvé');
    }

    if (!slot.isAvailable) {
      throw new BadRequestException('Ce créneau n\'est plus disponible');
    }

    // Vérifier que la date est dans le futur
    if (slot.startTime <= new Date()) {
      throw new BadRequestException('Impossible de réserver un créneau dans le passé');
    }

    // Réserver le créneau
    const success = session.bookSlot(bookSlotDto.slotId, userId);
    if (!success) {
      throw new BadRequestException('Impossible de réserver ce créneau');
    }

    // Créer une réservation traditionnelle pour la compatibilité
    const booking = {
      id: new Types.ObjectId().toString(),
      userId: new Types.ObjectId(userId),
      scheduledAt: slot.startTime,
      status: 'confirmed' as const,
      notes: bookSlotDto.notes,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    session.addBooking(booking);

    // Try to create Google Meet link if creator has Google Calendar connected
    try {
      const attendee = await this.userModel.findById(userId).select('email');
      const creator = await this.userModel.findById(session.creatorId).select('email');

      if (attendee?.email && creator?.email) {
        const endTime = new Date(slot.startTime.getTime() + session.duration * 60000);

        const { meetLink } = await this.googleCalendarService.createCalendarEventWithMeet(
          session.creatorId.toString(),
          sessionId,
          attendee.email,
          slot.startTime,
          endTime,
          session.title,
          session.description
        );

        // Update the booking with the Meet link
        const bookingIndex = session.bookings.findIndex(b => b.id === booking.id);
        if (bookingIndex !== -1) {
          session.bookings[bookingIndex].meetingUrl = meetLink;
        }
      }
    } catch (error) {
      // Log error but don't fail the booking if Google Calendar fails
      console.warn('Failed to create Google Meet link:', error.message);
    }

    // Si la session est payante, créer une commande
    if (session.price && session.price > 0) {
      const breakdown = await this.feeService.calculateForAmount(session.price, session.creatorId.toString());
      await this.orderModel.create({
        buyerId: new Types.ObjectId(userId),
        creatorId: session.creatorId,
        contentType: TrackableContentType.SESSION,
        contentId: session._id.toString(),
        amountDT: breakdown.amountDT,
        platformPercent: breakdown.platformPercent,
        platformFixedDT: breakdown.platformFixedDT,
        platformFeeDT: breakdown.platformFeeDT,
        creatorNetDT: breakdown.creatorNetDT,
        status: 'paid'
      });
    }

    await session.save();

    // Send email notifications
    try {
      const attendee = await this.userModel.findById(userId).select('email name');
      const creator = await this.userModel.findById(session.creatorId).select('email name');

      if (attendee?.email && creator?.email) {
        const emailData: SessionBookingEmailData = {
          sessionTitle: session.title,
          sessionDescription: session.description,
          creatorName: creator.name || 'Creator',
          creatorEmail: creator.email,
          participantName: attendee.name || 'Participant',
          participantEmail: attendee.email,
          scheduledAt: slot.startTime,
          duration: session.duration,
          meetingUrl: session.bookings.find(b => b.id === booking.id)?.meetingUrl,
          bookingId: booking.id,
          sessionId: sessionId,
        };

        // Send confirmation to participant
        await this.emailService.sendBookingConfirmation(emailData);
        
        // Send notification to creator
        await this.emailService.sendBookingNotificationToCreator(emailData);
      }
    } catch (error) {
      // Log error but don't fail the booking if email fails
      console.warn('Failed to send email notifications:', error.message);
    }

    const community = await this.communityModel.findOne({ id: session.communityId });
    return this.transformToResponseDto(session, community || undefined);
  }

  /**
   * Annuler un créneau réservé
   */
  async cancelSlot(sessionId: string, slotId: string, userId: string): Promise<SessionResponseDto> {
    const session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      throw new NotFoundException('Session non trouvée');
    }

    const slot = session.getSlot(slotId);
    if (!slot) {
      throw new NotFoundException('Créneau non trouvé');
    }

    // Vérifier que l'utilisateur peut annuler (créateur ou utilisateur qui a réservé)
    if (session.creatorId.toString() !== userId && slot.bookedBy?.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas annuler ce créneau');
    }

    // Annuler le créneau
    const success = session.cancelSlot(slotId);
    if (!success) {
      throw new BadRequestException('Impossible d\'annuler ce créneau');
    }

    // Annuler la réservation correspondante si elle existe
    const correspondingBooking = session.bookings.find(booking =>
      booking.scheduledAt.getTime() === slot.startTime.getTime() &&
      booking.userId.toString() === userId
    );

    if (correspondingBooking) {
      correspondingBooking.status = 'cancelled';
      correspondingBooking.updatedAt = new Date();
    }

    await session.save();

    const community = await this.communityModel.findOne({ id: session.communityId });
    return this.transformToResponseDto(session, community || undefined);
  }

  /**
   * Transformer un document Session en DTO de réponse
   */
  private async transformToResponseDto(
    session: SessionDocument, 
    community?: CommunityDocument | null,
    currentUserId?: string
  ): Promise<SessionResponseDto> {
    // Récupérer les informations du créateur - include all possible avatar fields
    const creator = await this.userModel.findById(session.creatorId).select('name email profile_picture photo_profil');

    // Filter bookings based on currentUserId if provided
    let bookingsToShow = session.bookings;
    if (currentUserId) {
      const userObjectId = new Types.ObjectId(currentUserId);
      // Only show bookings for the current user OR if user is the creator
      const isCreator = session.creatorId.equals(userObjectId);
      if (!isCreator) {
        bookingsToShow = session.bookings.filter(b => b.userId.equals(userObjectId));
      }
    }

    // Transformer les réservations
    const bookingUserIds = bookingsToShow.map(b => b.userId);
    const bookingUsers = await this.userModel.find({ _id: { $in: bookingUserIds } }).select('name email profile_picture photo_profil');

    const bookings = bookingsToShow.map(booking => {
      const user = bookingUsers.find(u => u._id.equals(booking.userId));
      // Check all possible avatar fields
      const userAvatar = user?.photo_profil || user?.profile_picture;
      return {
        id: booking.id,
        userId: booking.userId.toString(),
        userName: user?.name || 'Utilisateur inconnu',
        userAvatar: userAvatar,
        scheduledAt: booking.scheduledAt.toISOString(),
        status: booking.status,
        meetingUrl: booking.meetingUrl,
        notes: booking.notes,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      };
    });

    // Get creator avatar from all possible fields
    const creatorAvatar = creator?.photo_profil || creator?.profile_picture;

    return {
      id: session.id,
      title: session.title,
      description: session.description,
      duration: session.duration,
      price: session.price,
      currency: session.currency,
      communityId: session.communityId,
      communitySlug: community?.slug || '',
      creatorId: session.creatorId.toString(),
      creatorName: creator?.name || 'Créateur inconnu',
      creatorAvatar: creatorAvatar,
      isActive: session.isActive,
      bookings: bookings,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      category: session.category,
      maxBookingsPerWeek: session.maxBookingsPerWeek,
      notes: session.notes,
      resources: session.resources || [],
      bookingsCount: session.getBookingsCount(),
      bookingsThisWeek: session.getBookingsThisWeek(),
      canBookMore: session.canBookMore()
    };
  }

  /**
   * Transformer un document Session en DTO de réponse pour les heures de disponibilité
   */
  private transformToAvailableHoursResponseDto(session: SessionDocument): AvailableHoursResponseDto {
    return {
      recurringAvailability: (session.recurringAvailability || []).map(av => ({
        id: av.id,
        dayOfWeek: av.dayOfWeek,
        startTime: av.startTime,
        endTime: av.endTime,
        slotDuration: av.slotDuration,
        isActive: av.isActive,
        createdAt: av.createdAt.toISOString()
      })),
      autoGenerateSlots: session.autoGenerateSlots || false,
      advanceBookingDays: session.advanceBookingDays || 30,
      totalSlots: session.availableSlots?.length || 0,
      availableSlots: session.availableSlots?.filter(slot => slot.isAvailable).length || 0
    };
  }

  /**
   * Transformer un document Session en DTO de réponse pour les créneaux disponibles
   */
  private transformToAvailableSlotsResponseDto(session: SessionDocument, startDate?: Date, endDate?: Date): AvailableSlotsResponseDto {
    let slots = session.availableSlots || [];

    // Filtrer par plage de dates si spécifiée
    if (startDate) {
      slots = slots.filter(slot => slot.startTime >= startDate);
    }
    if (endDate) {
      slots = slots.filter(slot => slot.startTime <= endDate);
    }

    const availableSlots = slots.filter(slot => slot.isAvailable);
    const bookedSlots = slots.filter(slot => !slot.isAvailable);

    return {
      slots: slots.map(slot => ({
        id: slot.id,
        startTime: slot.startTime.toISOString(),
        endTime: slot.endTime.toISOString(),
        isAvailable: slot.isAvailable,
        bookedBy: slot.bookedBy?.toString(),
        bookedAt: slot.bookedAt?.toISOString(),
        createdAt: slot.createdAt.toISOString()
      })),
      total: slots.length,
      available: availableSlots.length,
      booked: bookedSlots.length
    };
  }
}
