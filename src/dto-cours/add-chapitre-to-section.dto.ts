import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsNumber, Min, IsBoolean, ValidateIf } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Description/contenu du chapitre (optionnel si videoUrl est fourni)',
    example: 'Dans ce chapitre, nous allons apprendre...'
  })
  @ValidateIf((o) => !o.videoUrl || !String(o.videoUrl).trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'URL de la vidéo du chapitre (optionnel si description est fourni)',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  })
  @ValidateIf((o) => !o.description || !String(o.description).trim())
  @IsString()
  @IsNotEmpty()
  videoUrl?: string;

  @ApiProperty({ description: 'Le chapitre est-il payant ?', example: false })
  @IsBoolean()
  isPaid: boolean;

  @ApiPropertyOptional({ description: 'Prix spécifique du chapitre (si payant)', example: 9.99 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  prix?: number;

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
