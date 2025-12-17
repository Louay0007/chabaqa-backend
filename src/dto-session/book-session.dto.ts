import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum, MaxLength, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour réserver une session
 */
export class BookSessionDto {
  @ApiProperty({ description: 'Date et heure de la session', example: '2024-02-20T14:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ description: 'Notes pour la session', example: 'Review React project structure' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * DTO pour confirmer une réservation
 */
export class ConfirmBookingDto {
  @ApiPropertyOptional({ description: 'URL de la réunion', example: 'https://meet.google.com/abc-def-ghi' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Notes du créateur', example: 'Looking forward to our session!' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * DTO pour annuler une réservation
 */
export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Raison de l\'annulation', example: 'Schedule conflict' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/**
 * DTO pour marquer une session comme terminée
 */
export class CompleteSessionDto {
  @ApiPropertyOptional({ description: 'Notes de la session terminée', example: 'Great session! Student made excellent progress.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Évaluation de la session (1-5)', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;
}

/**
 * DTO pour mettre à jour le statut d'une réservation
 */
export class UpdateBookingStatusDto {
  @ApiProperty({ 
    description: 'Nouveau statut de la réservation', 
    example: 'confirmed',
    enum: ['pending', 'confirmed', 'completed', 'cancelled']
  })
  @IsEnum(['pending', 'confirmed', 'completed', 'cancelled'])
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'Notes additionnelles' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
