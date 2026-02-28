import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de réponse pour une ressource de session
 */
export class SessionResourceResponseDto {
  @ApiProperty({ description: 'ID de la ressource', example: 'resource_123' })
  id: string;

  @ApiProperty({ description: 'Titre de la ressource', example: 'Guide de préparation' })
  title: string;

  @ApiProperty({ description: 'Type de ressource', example: 'article' })
  type: 'video' | 'article' | 'code' | 'tool' | 'pdf' | 'link';

  @ApiProperty({ description: 'URL de la ressource', example: 'https://example.com/guide.pdf' })
  url: string;

  @ApiProperty({ description: 'Description de la ressource', example: 'Guide complet pour préparer votre session' })
  description: string;

  @ApiProperty({ description: 'Ordre d\'affichage', example: 1 })
  order: number;
}

/**
 * DTO de réponse pour une réservation de session
 */
export class SessionBookingResponseDto {
  @ApiProperty({ description: 'ID de la réservation', example: 'booking_123' })
  id: string;

  @ApiProperty({ description: 'ID de l\'utilisateur', example: 'user_456' })
  userId: string;

  @ApiProperty({ description: 'Nom de l\'utilisateur', example: 'John Doe' })
  userName: string;

  @ApiPropertyOptional({ description: 'Avatar de l\'utilisateur', example: 'https://example.com/avatar.jpg' })
  userAvatar?: string;

  @ApiProperty({ description: 'Date et heure programmée', example: '2024-02-20T14:00:00.000Z' })
  scheduledAt: string;

  @ApiProperty({ description: 'Statut de la réservation', example: 'confirmed' })
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'URL de la réunion', example: 'https://meet.google.com/abc-def-ghi' })
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'ID de l\'événement Google Calendar' })
  googleEventId?: string;

  @ApiPropertyOptional({ description: 'Statut de provisionnement Meet', enum: ['not_required', 'pending', 'created', 'failed'] })
  meetStatus?: 'not_required' | 'pending' | 'created' | 'failed';

  @ApiPropertyOptional({ description: 'Raison du dernier échec Meet' })
  meetFailureReason?: string;

  @ApiPropertyOptional({ description: 'Notes de la réservation' })
  notes?: string;

  @ApiPropertyOptional({ description: 'Prix de la session', example: 50 })
  sessionPrice?: number;

  @ApiPropertyOptional({ description: 'Devise de la session', example: 'USD' })
  sessionCurrency?: string;

  @ApiPropertyOptional({ description: 'Durée de la session en minutes', example: 60 })
  sessionDuration?: number;

  @ApiPropertyOptional({ description: 'ID du créateur de session', example: 'user_789' })
  creatorId?: string;

  @ApiPropertyOptional({ description: 'ID de la communauté', example: 'community_456' })
  communityId?: string;

  @ApiPropertyOptional({ description: 'Montant payé', example: 50 })
  amountPaid?: number;

  @ApiProperty({ description: 'Date de création', example: '2024-02-15T10:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ description: 'Date de mise à jour', example: '2024-02-15T10:30:00.000Z' })
  updatedAt: string;
}

/**
 * DTO de réponse pour une session
 */
export class SessionResponseDto {
  @ApiProperty({ description: 'ID de la session', example: 'session_123' })
  id: string;

  @ApiProperty({ description: 'Titre de la session', example: '1-on-1 Code Review Session' })
  title: string;

  @ApiProperty({ description: 'Description de la session', example: 'Get personalized feedback on your code and projects' })
  description: string;

  @ApiPropertyOptional({ description: 'URL de l\'image de couverture (thumbnail)', example: 'https://example.com/session-cover.jpg' })
  thumbnail?: string;

  @ApiProperty({ description: 'Durée de la session en minutes', example: 60 })
  duration: number;

  @ApiProperty({ description: 'Prix de la session', example: 150 })
  price: number;

  @ApiProperty({ description: 'Devise du prix', example: 'USD' })
  currency: string;

  @ApiProperty({ description: 'ID de la communauté', example: 'community_456' })
  communityId: string;

  @ApiProperty({ description: 'Slug de la communauté', example: 'web-dev-community' })
  communitySlug: string;

  @ApiPropertyOptional({ description: 'Nom de la communauté', example: 'Web Dev Community' })
  communityName?: string;

  @ApiProperty({ description: 'ID du créateur', example: 'user_789' })
  creatorId: string;

  @ApiProperty({ description: 'Nom du créateur', example: 'Jane Smith' })
  creatorName: string;

  @ApiPropertyOptional({ description: 'Avatar du créateur', example: 'https://example.com/avatar.jpg' })
  creatorAvatar?: string;

  @ApiProperty({ description: 'Si la session est active', example: true })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Note moyenne de la session', example: 4.5 })
  averageRating?: number;

  @ApiPropertyOptional({ description: 'Nombre de notes reçues', example: 10 })
  ratingCount?: number;

  @ApiProperty({ description: 'Réservations de la session', type: [SessionBookingResponseDto] })
  bookings: SessionBookingResponseDto[];

  @ApiProperty({ description: 'Date de création', example: '2024-01-15T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ description: 'Date de mise à jour', example: '2024-02-01T00:00:00.000Z' })
  updatedAt: string;

  @ApiPropertyOptional({ description: 'Catégorie de la session', example: 'Code Review' })
  category?: string;

  @ApiPropertyOptional({ description: 'Nombre maximum de réservations par semaine', example: 5 })
  maxBookingsPerWeek?: number;

  @ApiPropertyOptional({ description: 'Notes additionnelles' })
  notes?: string;

  @ApiProperty({ description: 'Ressources de la session', type: [SessionResourceResponseDto] })
  resources: SessionResourceResponseDto[];

  @ApiProperty({ description: 'Nombre de réservations', example: 3 })
  bookingsCount: number;

  @ApiProperty({ description: 'Réservations cette semaine', example: 2 })
  bookingsThisWeek: number;

  @ApiProperty({ description: 'Peut réserver plus', example: true })
  canBookMore: boolean;
}

/**
 * DTO de réponse pour la liste des sessions
 */
export class SessionListResponseDto {
  @ApiProperty({ description: 'Liste des sessions', type: [SessionResponseDto] })
  sessions: SessionResponseDto[];

  @ApiProperty({ description: 'Nombre total de sessions', example: 50 })
  total: number;

  @ApiProperty({ description: 'Page actuelle', example: 1 })
  page: number;

  @ApiProperty({ description: 'Nombre d\'éléments par page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Nombre total de pages', example: 5 })
  totalPages: number;
}

/**
 * DTO de réponse pour les réservations d'un utilisateur
 */
export class UserBookingsResponseDto {
  @ApiProperty({ description: 'Réservations de l\'utilisateur', type: [SessionBookingResponseDto] })
  bookings: SessionBookingResponseDto[];

  @ApiProperty({ description: 'Nombre total de réservations', example: 10 })
  total: number;
}

/**
 * DTO de réponse pour une réservation de session (version étendue pour créateur)
 */
export class CreatorBookingResponseDto {
  @ApiProperty({ description: 'ID de la réservation', example: 'booking_123' })
  id: string;

  @ApiPropertyOptional({ description: 'ID de commande', example: 'order_456' })
  oderId?: string;

  @ApiProperty({ description: 'ID de la session', example: 'session_789' })
  sessionId: string;

  @ApiProperty({ description: 'Titre de la session', example: '1-on-1 Code Review' })
  sessionTitle: string;

  @ApiProperty({ description: 'Durée de la session en minutes', example: 60 })
  sessionDuration: number;

  @ApiProperty({ description: 'Prix de la session', example: 150 })
  sessionPrice: number;

  @ApiProperty({ description: 'ID de l\'utilisateur', example: 'user_456' })
  userId: string;

  @ApiProperty({ description: 'Nom de l\'utilisateur', example: 'John Doe' })
  userName: string;

  @ApiPropertyOptional({ description: 'Email de l\'utilisateur', example: 'john@example.com' })
  userEmail?: string;

  @ApiPropertyOptional({ description: 'Avatar de l\'utilisateur', example: 'https://example.com/avatar.jpg' })
  userAvatar?: string;

  @ApiProperty({ description: 'Date et heure programmée', example: '2024-02-20T14:00:00.000Z' })
  scheduledAt: string;

  @ApiProperty({ description: 'Si la session est à venir', example: true })
  isUpcoming: boolean;

  @ApiProperty({ description: 'Statut de la réservation', example: 'confirmed' })
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'URL de la réunion', example: 'https://meet.google.com/abc-def-ghi' })
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'ID de l\'événement Google Calendar' })
  googleEventId?: string;

  @ApiPropertyOptional({ description: 'Statut de provisionnement Meet', enum: ['not_required', 'pending', 'created', 'failed'] })
  meetStatus?: 'not_required' | 'pending' | 'created' | 'failed';

  @ApiPropertyOptional({ description: 'Raison du dernier échec Meet' })
  meetFailureReason?: string;

  @ApiPropertyOptional({ description: 'Notes de la réservation' })
  notes?: string;

  @ApiProperty({ description: 'Date de création', example: '2024-02-15T10:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ description: 'Date de mise à jour', example: '2024-02-15T10:30:00.000Z' })
  updatedAt: string;
}

/**
 * Statistiques des réservations
 */
export class BookingStatsDto {
  @ApiProperty({ description: 'Total des réservations', example: 50 })
  total: number;

  @ApiProperty({ description: 'Réservations en attente', example: 5 })
  pending: number;

  @ApiProperty({ description: 'Réservations confirmées', example: 30 })
  confirmed: number;

  @ApiProperty({ description: 'Réservations terminées', example: 10 })
  completed: number;

  @ApiProperty({ description: 'Réservations annulées', example: 5 })
  cancelled: number;

  @ApiProperty({ description: 'Sessions à venir', example: 15 })
  upcoming: number;

  @ApiProperty({ description: 'Sessions passées', example: 35 })
  past: number;
}

/**
 * DTO de réponse pour les réservations d'un créateur
 */
export class CreatorBookingsResponseDto {
  @ApiProperty({ description: 'Réservations du créateur', type: [CreatorBookingResponseDto] })
  bookings: CreatorBookingResponseDto[];

  @ApiProperty({ description: 'Nombre total de réservations', example: 25 })
  total: number;

  @ApiPropertyOptional({ description: 'Page actuelle', example: 1 })
  page?: number;

  @ApiPropertyOptional({ description: 'Nombre d\'éléments par page', example: 20 })
  limit?: number;

  @ApiPropertyOptional({ description: 'Nombre total de pages', example: 3 })
  totalPages?: number;

  @ApiPropertyOptional({ description: 'Statistiques des réservations', type: BookingStatsDto })
  stats?: BookingStatsDto;
}
