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

  @ApiPropertyOptional({ description: 'Notes de la réservation' })
  notes?: string;

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

  @ApiProperty({ description: 'ID du créateur', example: 'user_789' })
  creatorId: string;

  @ApiProperty({ description: 'Nom du créateur', example: 'Jane Smith' })
  creatorName: string;

  @ApiPropertyOptional({ description: 'Avatar du créateur', example: 'https://example.com/avatar.jpg' })
  creatorAvatar?: string;

  @ApiProperty({ description: 'Si la session est active', example: true })
  isActive: boolean;

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
 * DTO de réponse pour les réservations d'un créateur
 */
export class CreatorBookingsResponseDto {
  @ApiProperty({ description: 'Réservations du créateur', type: [SessionBookingResponseDto] })
  bookings: SessionBookingResponseDto[];

  @ApiProperty({ description: 'Nombre total de réservations', example: 25 })
  total: number;
}
