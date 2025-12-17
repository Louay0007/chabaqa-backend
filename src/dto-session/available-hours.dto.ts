import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour définir une disponibilité récurrente
 */
export class RecurringAvailabilityDto {
  @ApiProperty({ description: 'Jour de la semaine (0=Dimanche, 1=Lundi, etc.)', example: 1 })
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ description: 'Heure de début', example: '09:00' })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'Heure de fin', example: '17:00' })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({ description: 'Durée des créneaux en minutes', example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(480)
  slotDuration?: number;

  @ApiPropertyOptional({ description: 'Si cette disponibilité est active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO pour définir les heures de disponibilité d'une session
 */
export class SetAvailableHoursDto {
  @ApiProperty({ description: 'Disponibilités récurrentes', type: [RecurringAvailabilityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecurringAvailabilityDto)
  recurringAvailability: RecurringAvailabilityDto[];

  @ApiPropertyOptional({ description: 'Génération automatique des créneaux', example: true })
  @IsOptional()
  @IsBoolean()
  autoGenerateSlots?: boolean;

  @ApiPropertyOptional({ description: 'Nombre de jours à l\'avance pour la réservation', example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  advanceBookingDays?: number;
}

/**
 * DTO pour générer des créneaux disponibles
 */
export class GenerateSlotsDto {
  @ApiProperty({ description: 'Date de début pour la génération', example: '2024-02-20T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'Date de fin pour la génération', example: '2024-03-20T23:59:59.000Z' })
  @IsString()
  @IsNotEmpty()
  endDate: string;
}

/**
 * DTO pour réserver un créneau spécifique
 */
export class BookSlotDto {
  @ApiProperty({ description: 'ID du créneau à réserver', example: 'slot_123' })
  @IsString()
  @IsNotEmpty()
  slotId: string;

  @ApiPropertyOptional({ description: 'Notes pour la session', example: 'Review React project structure' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO pour obtenir les créneaux disponibles
 */
export class GetAvailableSlotsDto {
  @ApiPropertyOptional({ description: 'Date de début pour filtrer', example: '2024-02-20T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Date de fin pour filtrer', example: '2024-03-20T23:59:59.000Z' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
