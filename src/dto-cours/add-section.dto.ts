import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsNumber, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateChapitreDto } from './create-cours.dto';

/**
 * DTO pour ajouter une section à un cours existant
 */
export class AddSectionDto {
  @ApiProperty({ description: 'Titre de la section', example: 'Nouvelle Section Avancée' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  titre: string;

  @ApiPropertyOptional({ description: 'Description de la section', example: 'Cette section couvre les concepts avancés...' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Ordre de la section dans le cours', example: 3 })
  @IsNumber()
  @Min(1)
  ordre: number;

  @ApiPropertyOptional({ description: 'Liste des chapitres de cette section (optionnel)', type: [CreateChapitreDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChapitreDto)
  chapitres?: CreateChapitreDto[];
} 