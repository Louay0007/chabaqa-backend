import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de réponse pour un créneau disponible
 */
export class AvailableSlotResponseDto {
  @ApiProperty({ description: 'ID du créneau', example: 'slot_123' })
  id: string;

  @ApiProperty({ description: 'Heure de début', example: '2024-02-20T14:00:00.000Z' })
  startTime: string;

  @ApiProperty({ description: 'Heure de fin', example: '2024-02-20T15:00:00.000Z' })
  endTime: string;

  @ApiProperty({ description: 'Si le créneau est disponible', example: true })
  isAvailable: boolean;

  @ApiPropertyOptional({ description: 'ID de l\'utilisateur qui a réservé', example: 'user_456' })
  bookedBy?: string;

  @ApiPropertyOptional({ description: 'Date de réservation', example: '2024-02-15T10:30:00.000Z' })
  bookedAt?: string;

  @ApiProperty({ description: 'Date de création du créneau', example: '2024-02-15T10:30:00.000Z' })
  createdAt: string;
}

/**
 * DTO de réponse pour une disponibilité récurrente
 */
export class RecurringAvailabilityResponseDto {
  @ApiProperty({ description: 'ID de la disponibilité', example: 'availability_123' })
  id: string;

  @ApiProperty({ description: 'Jour de la semaine (0=Dimanche, 1=Lundi, etc.)', example: 1 })
  dayOfWeek: number;

  @ApiProperty({ description: 'Heure de début', example: '09:00' })
  startTime: string;

  @ApiProperty({ description: 'Heure de fin', example: '17:00' })
  endTime: string;

  @ApiProperty({ description: 'Durée des créneaux en minutes', example: 60 })
  slotDuration: number;

  @ApiProperty({ description: 'Si cette disponibilité est active', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Date de création', example: '2024-02-15T10:30:00.000Z' })
  createdAt: string;
}

/**
 * DTO de réponse pour les créneaux disponibles
 */
export class AvailableSlotsResponseDto {
  @ApiProperty({ description: 'Liste des créneaux disponibles', type: [AvailableSlotResponseDto] })
  slots: AvailableSlotResponseDto[];

  @ApiProperty({ description: 'Nombre total de créneaux', example: 25 })
  total: number;

  @ApiProperty({ description: 'Nombre de créneaux disponibles', example: 20 })
  available: number;

  @ApiProperty({ description: 'Nombre de créneaux réservés', example: 5 })
  booked: number;
}

/**
 * DTO de réponse pour les heures de disponibilité
 */
export class AvailableHoursResponseDto {
  @ApiProperty({ description: 'Disponibilités récurrentes', type: [RecurringAvailabilityResponseDto] })
  recurringAvailability: RecurringAvailabilityResponseDto[];

  @ApiProperty({ description: 'Génération automatique des créneaux', example: true })
  autoGenerateSlots: boolean;

  @ApiProperty({ description: 'Nombre de jours à l\'avance pour la réservation', example: 30 })
  advanceBookingDays: number;

  @ApiProperty({ description: 'Nombre total de créneaux générés', example: 50 })
  totalSlots: number;

  @ApiProperty({ description: 'Nombre de créneaux disponibles', example: 35 })
  availableSlots: number;
}
