import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de réponse pour une session d'événement
 */
export class EventSessionResponseDto {
  @ApiProperty({
    description: 'ID unique de la session',
    example: 'session_123'
  })
  id: string;

  @ApiProperty({
    description: 'Titre de la session',
    example: 'Keynote: The Future of AI'
  })
  title: string;

  @ApiProperty({
    description: 'Description de la session',
    example: 'Opening keynote discussing emerging trends in artificial intelligence'
  })
  description: string;

  @ApiProperty({
    description: 'Heure de début',
    example: '09:00'
  })
  startTime: string;

  @ApiProperty({
    description: 'Heure de fin',
    example: '10:30'
  })
  endTime: string;

  @ApiProperty({
    description: 'Nom du conférencier',
    example: 'Dr. Rebecca Miller'
  })
  speaker: string;

  @ApiPropertyOptional({
    description: 'Notes additionnelles',
    example: 'Need 30 laptops for workshop'
  })
  notes?: string;

  @ApiProperty({
    description: 'Indique si la session est active',
    example: true
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Nombre d\'assistants',
    example: 85
  })
  attendance: number;
}

/**
 * DTO de réponse pour un billet d'événement
 */
export class EventTicketResponseDto {
  @ApiProperty({
    description: 'ID unique du billet',
    example: 'ticket_123'
  })
  id: string;

  @ApiProperty({
    description: 'Type de billet',
    example: 'regular'
  })
  type: string;

  @ApiProperty({
    description: 'Nom du billet',
    example: 'General Admission'
  })
  name: string;

  @ApiProperty({
    description: 'Prix du billet',
    example: 99.99
  })
  price: number;

  @ApiProperty({
    description: 'Description du billet',
    example: 'Access to all sessions and lunch included'
  })
  description: string;

  @ApiPropertyOptional({
    description: 'Quantité disponible',
    example: 100
  })
  quantity?: number;

  @ApiProperty({
    description: 'Nombre de billets vendus',
    example: 45
  })
  sold: number;
}

/**
 * DTO de réponse pour un conférencier d'événement
 */
export class EventSpeakerResponseDto {
  @ApiProperty({
    description: 'ID unique du conférencier',
    example: 'speaker_123'
  })
  id: string;

  @ApiProperty({
    description: 'Nom du conférencier',
    example: 'Dr. Rebecca Miller'
  })
  name: string;

  @ApiProperty({
    description: 'Titre du conférencier',
    example: 'Chief Technology Officer at TechCorp'
  })
  title: string;

  @ApiProperty({
    description: 'Biographie du conférencier',
    example: 'Expert in AI and machine learning with 15 years of industry experience'
  })
  bio: string;

  @ApiPropertyOptional({
    description: 'Photo du conférencier',
    example: 'https://example.com/speaker-photo.jpg'
  })
  photo?: string;
}

/**
 * DTO de réponse pour un participant d'événement
 */
export class EventAttendeeResponseDto {
  @ApiProperty({
    description: 'ID unique du participant',
    example: 'attendee_123'
  })
  id: string;

  @ApiProperty({
    description: 'Informations de l\'utilisateur',
    example: {
      id: 'user_123',
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
  user: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Type de billet',
    example: 'regular'
  })
  ticketType: string;

  @ApiProperty({
    description: 'Date d\'inscription',
    example: '2024-02-10T10:00:00.000Z'
  })
  registeredAt: string;

  @ApiProperty({
    description: 'Indique si le participant a check-in',
    example: false
  })
  checkedIn: boolean;

  @ApiPropertyOptional({
    description: 'Date de check-in',
    example: '2024-02-15T09:00:00.000Z'
  })
  checkedInAt?: string;
}

/**
 * DTO de réponse pour un événement
 */
export class EventResponseDto {
  @ApiProperty({
    description: 'ID unique de l\'événement',
    example: 'event_123'
  })
  id: string;

  @ApiProperty({
    description: 'Titre de l\'événement',
    example: 'Tech Conference 2023'
  })
  title: string;

  @ApiProperty({
    description: 'Description de l\'événement',
    example: 'Annual technology conference featuring the latest innovations in software development and AI'
  })
  description: string;

  @ApiProperty({
    description: 'Date de début',
    example: '2024-02-15T00:00:00.000Z'
  })
  startDate: string;

  @ApiPropertyOptional({
    description: 'Date de fin',
    example: '2024-02-17T00:00:00.000Z'
  })
  endDate?: string;

  @ApiProperty({
    description: 'Heure de début',
    example: '09:00'
  })
  startTime: string;

  @ApiProperty({
    description: 'Heure de fin',
    example: '18:00'
  })
  endTime: string;

  @ApiProperty({
    description: 'Fuseau horaire',
    example: 'EST'
  })
  timezone: string;

  @ApiProperty({
    description: 'Lieu de l\'événement',
    example: 'New York Convention Center'
  })
  location: string;

  @ApiPropertyOptional({
    description: 'URL en ligne',
    example: 'https://example.com/tech-conf-2023'
  })
  onlineUrl?: string;

  @ApiProperty({
    description: 'Catégorie de l\'événement',
    example: 'Technology'
  })
  category: string;

  @ApiProperty({
    description: 'Type d\'événement',
    example: 'Hybrid'
  })
  type: string;

  @ApiProperty({
    description: 'Indique si l\'événement est actif',
    example: true
  })
  isActive: boolean;

  @ApiPropertyOptional({
    description: 'Notes sur l\'événement',
    example: 'Keynote speaker needs green room with bottled water and vegan meal option'
  })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Image de l\'événement',
    example: 'https://example.com/event-image.jpg'
  })
  image?: string;

  @ApiProperty({
    description: 'Participants de l\'événement',
    type: [EventAttendeeResponseDto]
  })
  attendees: EventAttendeeResponseDto[];

  @ApiProperty({
    description: 'Billets de l\'événement',
    type: [EventTicketResponseDto]
  })
  tickets: EventTicketResponseDto[];

  @ApiProperty({
    description: 'Conférenciers de l\'événement',
    type: [EventSpeakerResponseDto]
  })
  speakers: EventSpeakerResponseDto[];

  @ApiProperty({
    description: 'Sessions de l\'événement',
    type: [EventSessionResponseDto]
  })
  sessions: EventSessionResponseDto[];

  @ApiProperty({
    description: 'Informations de la communauté',
    example: {
      id: 'community_123',
      name: 'Tech Community',
      slug: 'tech-community'
    }
  })
  community: {
    id: string;
    name: string;
    slug: string;
  };

  @ApiProperty({
    description: 'Informations du créateur',
    example: {
      id: 'user_123',
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
  creator: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Revenus totaux',
    example: 15000.50
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Nombre total de participants',
    example: 150
  })
  totalAttendees: number;

  @ApiProperty({
    description: 'Moyenne d\'assistance',
    example: 85.5
  })
  averageAttendance: number;

  @ApiProperty({
    description: 'Tags de l\'événement',
    example: ['technology', 'ai', 'conference']
  })
  tags: string[];

  @ApiProperty({
    description: 'Indique si l\'événement est publié',
    example: true
  })
  isPublished: boolean;

  @ApiPropertyOptional({
    description: 'Date de publication',
    example: '2024-02-10T10:00:00.000Z'
  })
  publishedAt?: string;

  @ApiProperty({
    description: 'Date de création',
    example: '2024-02-10T10:00:00.000Z'
  })
  createdAt: string;

  @ApiProperty({
    description: 'Date de dernière mise à jour',
    example: '2024-02-10T10:00:00.000Z'
  })
  updatedAt: string;
}

/**
 * DTO de réponse pour la liste d'événements
 */
export class EventListResponseDto {
  @ApiProperty({
    description: 'Liste des événements',
    type: [EventResponseDto]
  })
  events: EventResponseDto[];

  @ApiProperty({
    description: 'Nombre total d\'événements',
    example: 25
  })
  total: number;

  @ApiProperty({
    description: 'Page actuelle',
    example: 1
  })
  page: number;

  @ApiProperty({
    description: 'Nombre d\'éléments par page',
    example: 10
  })
  limit: number;

  @ApiProperty({
    description: 'Nombre total de pages',
    example: 3
  })
  totalPages: number;
}

/**
 * DTO de réponse pour les statistiques d'événement
 */
export class EventStatsResponseDto {
  @ApiProperty({
    description: 'Nombre total d\'événements',
    example: 25
  })
  totalEvents: number;

  @ApiProperty({
    description: 'Événements actifs',
    example: 20
  })
  activeEvents: number;

  @ApiProperty({
    description: 'Événements publiés',
    example: 18
  })
  publishedEvents: number;

  @ApiProperty({
    description: 'Revenus totaux',
    example: 50000.75
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Participants totaux',
    example: 1250
  })
  totalAttendees: number;

  @ApiProperty({
    description: 'Moyenne d\'assistance',
    example: 78.5
  })
  averageAttendance: number;

  @ApiProperty({
    description: 'Événements par catégorie',
    example: {
      'Technology': 10,
      'Business': 8,
      'Design': 4,
      'Marketing': 3
    }
  })
  eventsByCategory: Record<string, number>;

  @ApiProperty({
    description: 'Événements par type',
    example: {
      'In-person': 12,
      'Online': 8,
      'Hybrid': 5
    }
  })
  eventsByType: Record<string, number>;
}

