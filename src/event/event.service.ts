import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event, EventDocument } from '../schema/event.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreateEventDto, CreateEventSessionDto, CreateEventTicketDto, CreateEventSpeakerDto } from '../dto-event/create-event.dto';
import { UpdateEventDto } from '../dto-event/update-event.dto';
import { EventResponseDto, EventListResponseDto, EventStatsResponseDto } from '../dto-event/event-response.dto';
import { FeeService } from '../common/services/fee.service';
import { PromoService } from '../common/services/promo.service';
import { PolicyService } from '../common/services/policy.service';
import { TrackableContentType } from '../schema/content-tracking.schema';

@Injectable()
export class EventService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    private readonly feeService: FeeService,
    private readonly promoService: PromoService,
    private readonly policyService: PolicyService,
  ) {}

  /**
   * Créer un nouvel événement
   */
  async create(createEventDto: CreateEventDto, userId: string): Promise<EventResponseDto> {
    // Vérifier que la communauté existe
    const community = await this.communityModel.findById(createEventDto.communityId);
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    // Vérifier que l'utilisateur est le créateur de la communauté
    if (community.createur.toString() !== userId) {
      throw new ForbiddenException('Seul le créateur de la communauté peut créer des événements');
    }

    // Générer les IDs pour les sous-objets
    const sessions = createEventDto.sessions?.map(session => ({
      id: new Types.ObjectId().toString(),
      ...session,
      isActive: session.isActive ?? true,
      attendance: session.attendance ?? 0
    })) || [];

    const tickets = createEventDto.tickets?.map(ticket => ({
      id: new Types.ObjectId().toString(),
      ...ticket,
      sold: ticket.sold ?? 0
    })) || [];

    const speakers = createEventDto.speakers?.map(speaker => ({
      id: new Types.ObjectId().toString(),
      ...speaker
    })) || [];

    // Gating: require active subscription to publish/activate events
    const hasSub = await this.policyService.hasActiveSubscription(userId);
    if (!hasSub && (createEventDto.isActive || createEventDto.isPublished)) {
      throw new ForbiddenException('Un abonnement actif est requis pour publier ou activer un événement');
    }

    const eventData = {
      ...createEventDto,
      communityId: new Types.ObjectId(createEventDto.communityId),
      creatorId: new Types.ObjectId(userId),
      startDate: new Date(createEventDto.startDate),
      endDate: createEventDto.endDate ? new Date(createEventDto.endDate) : undefined,
      sessions,
      tickets,
      speakers,
      attendees: [],
      isActive: createEventDto.isActive ?? true,
      isPublished: createEventDto.isPublished ?? false,
      tags: createEventDto.tags || []
    };

    const event = new this.eventModel(eventData);
    await event.save();

    return this.transformToResponseDto(event, community);
  }

  /**
   * Récupérer tous les événements avec pagination et filtres
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    communityId?: string,
    category?: string,
    type?: string,
    isActive?: boolean,
    isPublished?: boolean,
    search?: string,
    creatorId?: string
  ): Promise<EventListResponseDto> {
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (communityId) {
      filter.communityId = new Types.ObjectId(communityId);
    }
    if (category) {
      filter.category = category;
    }
    if (type) {
      filter.type = type;
    }
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }
    if (isPublished !== undefined) {
      filter.isPublished = isPublished;
    }
    if (creatorId) {
      filter.creatorId = new Types.ObjectId(creatorId);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const [events, total] = await Promise.all([
      this.eventModel
        .find(filter)
        .populate('communityId', 'name slug')
        .populate('creatorId', 'name email profile_picture')
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.eventModel.countDocuments(filter)
    ]);

    const transformedEvents = await Promise.all(
      events.map(event => this.transformToResponseDto(event, event.communityId as any))
    );

    return {
      events: transformedEvents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Récupérer un événement par ID
   */
  async findOne(id: string): Promise<EventResponseDto> {
    const event = await this.eventModel
      .findOne({ id })
      .populate('communityId', 'name slug')
      .populate('creatorId', 'name email profile_picture')
      .exec();

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    return this.transformToResponseDto(event, event.communityId as any);
  }

  /**
   * Récupérer les événements d'une communauté
   */
  async findByCommunity(communityId: string, page: number = 1, limit: number = 10): Promise<EventListResponseDto> {
    return this.findAll(page, limit, communityId);
  }

  /**
   * Récupérer les événements d'un créateur
   */
  async findByCreator(creatorId: string, page: number = 1, limit: number = 10): Promise<EventListResponseDto> {
    return this.findAll(page, limit, undefined, undefined, undefined, undefined, undefined, undefined, creatorId);
  }

  /**
   * Mettre à jour un événement
   */
  async update(id: string, updateEventDto: UpdateEventDto, userId: string): Promise<EventResponseDto> {
    const event = await this.eventModel.findOne({ id });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    // Mettre à jour les dates si fournies
    if (updateEventDto.startDate) {
      updateEventDto.startDate = new Date(updateEventDto.startDate) as any;
    }
    if (updateEventDto.endDate) {
      updateEventDto.endDate = new Date(updateEventDto.endDate) as any;
    }

    // Mettre à jour les sessions si fournies
    if (updateEventDto.sessions) {
      updateEventDto.sessions = updateEventDto.sessions.map(session => ({
        id: new Types.ObjectId().toString(),
        ...session,
        isActive: session.isActive ?? true,
        attendance: session.attendance ?? 0
      })) as any;
    }

    // Mettre à jour les billets si fournis
    if (updateEventDto.tickets) {
      updateEventDto.tickets = updateEventDto.tickets.map(ticket => ({
        id: new Types.ObjectId().toString(),
        ...ticket,
        sold: ticket.sold ?? 0
      })) as any;
    }

    // Mettre à jour les conférenciers si fournis
    if (updateEventDto.speakers) {
      updateEventDto.speakers = updateEventDto.speakers.map(speaker => ({
        id: new Types.ObjectId().toString(),
        ...speaker
      })) as any;
    }

    Object.assign(event, updateEventDto);
    await event.save();

    const community = await this.communityModel.findById(event.communityId);
    return this.transformToResponseDto(event, community);
  }

  /**
   * Supprimer un événement
   */
  async remove(id: string, userId: string): Promise<{ message: string }> {
    const event = await this.eventModel.findOne({ id });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres événements');
    }

    await this.eventModel.deleteOne({ id });
    return { message: 'Événement supprimé avec succès' };
  }

  /**
   * Ajouter une session à un événement
   */
  async addSession(eventId: string, createSessionDto: CreateEventSessionDto, userId: string): Promise<any> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    const session = {
      id: new Types.ObjectId().toString(),
      ...createSessionDto,
      isActive: createSessionDto.isActive ?? true,
      attendance: createSessionDto.attendance ?? 0
    };

    event.sessions.push(session);
    await event.save();

    return {
      id: session.id,
      title: session.title,
      description: session.description,
      startTime: session.startTime,
      endTime: session.endTime,
      speaker: session.speaker,
      notes: session.notes,
      isActive: session.isActive,
      attendance: session.attendance
    };
  }

  /**
   * Supprimer une session d'un événement
   */
  async removeSession(eventId: string, sessionId: string, userId: string): Promise<{ message: string }> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    const sessionIndex = event.sessions.findIndex(session => session.id === sessionId);
    if (sessionIndex === -1) {
      throw new NotFoundException('Session non trouvée');
    }

    event.sessions.splice(sessionIndex, 1);
    await event.save();

    return { message: 'Session supprimée avec succès' };
  }

  /**
   * Ajouter un billet à un événement
   */
  async addTicket(eventId: string, createTicketDto: CreateEventTicketDto, userId: string): Promise<any> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    const ticket = {
      id: new Types.ObjectId().toString(),
      ...createTicketDto,
      sold: createTicketDto.sold ?? 0
    };

    event.tickets.push(ticket);
    await event.save();

    return {
      id: ticket.id,
      type: ticket.type,
      name: ticket.name,
      price: ticket.price,
      description: ticket.description,
      quantity: ticket.quantity,
      sold: ticket.sold
    };
  }

  /**
   * Supprimer un billet d'un événement
   */
  async removeTicket(eventId: string, ticketId: string, userId: string): Promise<{ message: string }> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    const ticketIndex = event.tickets.findIndex(ticket => ticket.id === ticketId);
    if (ticketIndex === -1) {
      throw new NotFoundException('Billet non trouvé');
    }

    event.tickets.splice(ticketIndex, 1);
    await event.save();

    return { message: 'Billet supprimé avec succès' };
  }

  /**
   * Ajouter un conférencier à un événement
   */
  async addSpeaker(eventId: string, createSpeakerDto: CreateEventSpeakerDto, userId: string): Promise<any> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    const speaker = {
      id: new Types.ObjectId().toString(),
      ...createSpeakerDto
    };

    event.speakers.push(speaker);
    await event.save();

    return {
      id: speaker.id,
      name: speaker.name,
      title: speaker.title,
      bio: speaker.bio,
      photo: speaker.photo
    };
  }

  /**
   * Supprimer un conférencier d'un événement
   */
  async removeSpeaker(eventId: string, speakerId: string, userId: string): Promise<{ message: string }> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    const speakerIndex = event.speakers.findIndex(speaker => speaker.id === speakerId);
    if (speakerIndex === -1) {
      throw new NotFoundException('Conférencier non trouvé');
    }

    event.speakers.splice(speakerIndex, 1);
    await event.save();

    return { message: 'Conférencier supprimé avec succès' };
  }

  /**
   * Inscrire un utilisateur à un événement
   */
  async registerAttendee(eventId: string, ticketType: string, userId: string, promoCode?: string): Promise<{ message: string }> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    if (!event.isActive || !event.isPublished) {
      throw new BadRequestException('L\'événement n\'est pas disponible pour les inscriptions');
    }

    // Vérifier que le type de billet existe
    const ticket = event.tickets.find(t => t.type === ticketType);
    if (!ticket) {
      throw new NotFoundException('Type de billet non trouvé');
    }

    // Vérifier la disponibilité
    if (ticket.quantity && ticket.sold >= ticket.quantity) {
      throw new BadRequestException('Plus de billets disponibles pour ce type');
    }

    // Vérifier que l'utilisateur n'est pas déjà inscrit
    const existingAttendee = event.attendees.find(attendee => attendee.userId.toString() === userId);
    if (existingAttendee) {
      throw new BadRequestException('Vous êtes déjà inscrit à cet événement');
    }

    const attendee = {
      id: new Types.ObjectId().toString(),
      userId: new Types.ObjectId(userId),
      ticketType,
      registeredAt: new Date(),
      checkedIn: false
    };

    event.attendees.push(attendee);
    ticket.sold += 1;
    // Si billet payant, appliquer promo et créer une commande avec calcul des frais
    if (ticket.price && ticket.price > 0) {
      let effective = ticket.price;
      let discountDT = 0;
      let appliedCode: string | undefined;
      if (promoCode) {
        const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, ticket.price, TrackableContentType.EVENT, (event as any)._id.toString(), (buyer as any)?.email);
        if (promo.valid) {
          effective = promo.finalAmountDT;
          discountDT = promo.discountDT;
          appliedCode = promo.appliedCode;
        }
      }
      const breakdown = await this.feeService.calculateForAmount(effective, event.creatorId.toString());
      await this.orderModel.create({
        buyerId: new Types.ObjectId(userId),
        creatorId: event.creatorId,
        contentType: TrackableContentType.EVENT,
        contentId: (event as any)._id.toString(),
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
    await event.save();

    return { message: 'Inscription réussie' };
  }

  /**
   * Désinscrire un utilisateur d'un événement
   */
  async unregisterAttendee(eventId: string, userId: string): Promise<{ message: string }> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    const attendeeIndex = event.attendees.findIndex(attendee => attendee.userId.toString() === userId);
    if (attendeeIndex === -1) {
      throw new NotFoundException('Vous n\'êtes pas inscrit à cet événement');
    }

    const attendee = event.attendees[attendeeIndex];
    const ticket = event.tickets.find(t => t.type === attendee.ticketType);
    if (ticket) {
      ticket.sold -= 1;
    }

    event.attendees.splice(attendeeIndex, 1);
    await event.save();

    return { message: 'Désinscription réussie' };
  }

  /**
   * Basculer le statut de publication d'un événement
   */
  async togglePublished(eventId: string, userId: string): Promise<{ message: string; isPublished: boolean }> {
    const event = await this.eventModel.findOne({ id: eventId });
    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (event.creatorId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres événements');
    }

    event.isPublished = !event.isPublished;
    if (event.isPublished) {
      event.publishedAt = new Date();
    } else {
      event.publishedAt = undefined;
    }

    await event.save();

    return {
      message: `Événement ${event.isPublished ? 'publié' : 'dépublié'} avec succès`,
      isPublished: event.isPublished
    };
  }

  /**
   * Récupérer les statistiques des événements
   */
  async getStats(communityId?: string): Promise<EventStatsResponseDto> {
    const filter: any = {};
    if (communityId) {
      filter.communityId = new Types.ObjectId(communityId);
    }

    const [totalEvents, activeEvents, publishedEvents, events] = await Promise.all([
      this.eventModel.countDocuments(filter),
      this.eventModel.countDocuments({ ...filter, isActive: true }),
      this.eventModel.countDocuments({ ...filter, isPublished: true }),
      this.eventModel.find(filter).exec()
    ]);

    const totalRevenue = events.reduce((sum, event) => sum + event.totalRevenue, 0);
    const totalAttendees = events.reduce((sum, event) => sum + event.totalAttendees, 0);
    const averageAttendance = events.length > 0 ? events.reduce((sum, event) => sum + event.averageAttendance, 0) / events.length : 0;

    // Statistiques par catégorie
    const eventsByCategory: Record<string, number> = {};
    events.forEach(event => {
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
    });

    // Statistiques par type
    const eventsByType: Record<string, number> = {};
    events.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    });

    return {
      totalEvents,
      activeEvents,
      publishedEvents,
      totalRevenue,
      totalAttendees,
      averageAttendance,
      eventsByCategory,
      eventsByType
    };
  }

  /**
   * Transformer un document Event en DTO de réponse
   */
  private async transformToResponseDto(event: EventDocument, community?: CommunityDocument | null): Promise<EventResponseDto> {
    // Récupérer les informations de la communauté si pas fournies
    let communityData = community;
    if (!communityData) {
      communityData = await this.communityModel.findById(event.communityId).select('name slug');
    }
    
    // Provide default values if community not found
    const communityInfo = communityData ? {
      id: communityData._id.toString(),
      name: communityData.name,
      slug: communityData.slug
    } : {
      id: event.communityId?.toString() || 'unknown',
      name: 'Unknown Community',
      slug: 'unknown-community'
    };

    // Récupérer les informations du créateur
    const creator = await this.userModel.findById(event.creatorId).select('name email profile_picture');
    const creatorInfo = creator ? {
      id: creator._id.toString(),
      name: creator.name,
      email: creator.email,
      profile_picture: creator.profile_picture
    } : {
      id: event.creatorId?.toString() || 'unknown',
      name: 'Unknown Creator',
      email: 'unknown@example.com',
      profile_picture: 'https://placehold.co/64x64?text=UC'
    };

    // Transformer les participants
    const attendees = await Promise.all(
      event.attendees.map(async (attendee) => {
        const user = await this.userModel.findById(attendee.userId).select('name email');
        if (!user) {
          throw new NotFoundException('Utilisateur non trouvé');
        }
        return {
          id: attendee.id,
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email
          },
          ticketType: attendee.ticketType,
          registeredAt: attendee.registeredAt?.toISOString() || new Date().toISOString(),
          checkedIn: attendee.checkedIn,
          checkedInAt: attendee.checkedInAt?.toISOString()
        };
      })
    );

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startDate: event.startDate?.toISOString() || new Date().toISOString(),
      endDate: event.endDate?.toISOString(),
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
      location: event.location,
      onlineUrl: event.onlineUrl,
      category: event.category,
      type: event.type,
      isActive: event.isActive,
      notes: event.notes,
      image: event.image,
      attendees,
      tickets: event.tickets.map(ticket => ({
        id: ticket.id,
        type: ticket.type,
        name: ticket.name,
        price: ticket.price,
        description: ticket.description,
        quantity: ticket.quantity,
        sold: ticket.sold
      })),
      speakers: event.speakers.map(speaker => ({
        id: speaker.id,
        name: speaker.name,
        title: speaker.title,
        bio: speaker.bio,
        photo: speaker.photo
      })),
      sessions: event.sessions.map(session => ({
        id: session.id,
        title: session.title,
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        speaker: session.speaker,
        notes: session.notes,
        isActive: session.isActive,
        attendance: session.attendance
      })),
      community: communityInfo,
      creator: creatorInfo,
      totalRevenue: event.totalRevenue,
      totalAttendees: event.totalAttendees,
      averageAttendance: event.averageAttendance,
      tags: event.tags,
      isPublished: event.isPublished,
      publishedAt: event.publishedAt?.toISOString(),
      createdAt: (event as any).createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: (event as any).updatedAt?.toISOString() || new Date().toISOString()
    };
  }

  /**
   * Récupérer les événements auxquels l'utilisateur est inscrit
   */
  async getMyRegistrations(userId: string): Promise<any[]> {
    try {
      // Chercher tous les événements où l'utilisateur est inscrit comme participant
      const events = await this.eventModel.find({
        'attendees.userId': new Types.ObjectId(userId),
        isPublished: true,
        isActive: true
      })
      .populate('communityId', 'name slug')
      .populate('creatorId', 'name email')
      .sort({ startDate: 1 })
      .exec();

      // Transformer les événements pour la réponse
      const transformedEvents = await Promise.all(
        events.map(async (event) => {
          // Trouver les détails de l'inscription de l'utilisateur
          const userRegistration = event.attendees.find(
            attendee => attendee.userId.toString() === userId
          );

          // Informations de la communauté
          const communityInfo = event.communityId ? {
            id: (event.communityId as any)._id.toString(),
            name: (event.communityId as any).name,
            slug: (event.communityId as any).slug
          } : null;

          // Informations du créateur
          const creatorInfo = event.creatorId ? {
            id: (event.creatorId as any)._id.toString(),
            name: (event.creatorId as any).name,
            email: (event.creatorId as any).email
          } : null;

          return {
            _id: (event as any)._id.toString(),
            id: event.id,
            title: event.title,
            description: event.description,
            start_date: event.startDate.toISOString(),
            end_date: event.endDate?.toISOString(),
            start_time: event.startTime,
            end_time: event.endTime,
            location: event.location,
            venue: event.location,
            onlineUrl: event.onlineUrl,
            category: event.category,
            type: event.type,
            is_active: event.isActive,
            is_published: event.isPublished,
            attendees_count: event.attendees.length,
            max_attendees: event.tickets.reduce((total, ticket) => total + (ticket.quantity || 0), 0),
            thumbnail: event.image,
            cover_image: event.image,
            tickets: event.tickets,
            sessions: event.sessions,
            speakers: event.speakers,
            tags: event.tags,
            created_at: (event as any).createdAt?.toISOString() || new Date().toISOString(),
            updated_at: (event as any).updatedAt?.toISOString() || new Date().toISOString(),
            created_by: creatorInfo,
            community_id: communityInfo,
            // Détails de l'inscription de l'utilisateur
            user_registration: {
              ticket_type: userRegistration?.ticketType,
              registered_at: userRegistration?.registeredAt?.toISOString(),
              checked_in: userRegistration?.checkedIn,
              checked_in_at: userRegistration?.checkedInAt?.toISOString()
            }
          };
        })
      );

      return transformedEvents;
    } catch (error) {
      console.error('Erreur lors de la récupération des inscriptions:', error);
      throw error;
    }
  }
}
