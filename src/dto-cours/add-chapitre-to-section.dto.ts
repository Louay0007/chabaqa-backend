import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';

/**
 * DTO pour ajouter un chapitre à une section spécifique d'un cours
 */
export class AddChapitreToSectionDto {
  @ApiProperty({ description: 'Titre du chapitre', example: 'Introduction aux Variables' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  titre: string;

  @ApiProperty({ description: 'Description/contenu du chapitre', example: 'Dans ce chapitre, nous allons apprendre...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({ description: 'URL de la vidéo du chapitre', example: 'https://example.com/videos/variables.mp4' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiProperty({ description: 'Le chapitre est-il payant ?', example: false })
  @IsBoolean()
  isPaid: boolean;

  @ApiProperty({ description: 'Ordre du chapitre dans la section', example: 1 })
  @IsNumber()
  @Min(1)
  ordre: number;

  @ApiPropertyOptional({ description: 'Durée du chapitre (format HH:MM)', example: '15:30' })
  @IsOptional()
  @IsString()
  duree?: string;

  @ApiPropertyOptional({ description: 'Notes supplémentaires du chapitre' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
} 