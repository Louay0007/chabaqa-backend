import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested, Min, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO pour ajouter un chapitre à un cours
 */
export class AjouterChapitreDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  titre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsBoolean()
  isPaid: boolean;

  @IsNumber()
  @Min(0)
  ordre: number;

  @IsOptional()
  @IsString()
  duree?: string;
}

/**
 * DTO pour supprimer un chapitre
 */
export class SupprimerChapitreDto {
  @IsString()
  @IsNotEmpty()
  chapitreId: string;
}

/**
 * DTO pour réorganiser les chapitres
 */
export class ReorganiserChapitresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChapitreOrdreDto)
  chapitres: ChapitreOrdreDto[];
}

/**
 * DTO pour l'ordre d'un chapitre
 */
export class ChapitreOrdreDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsNumber()
  @Min(0)
  ordre: number;
}

/**
 * DTO pour mettre à jour un chapitre spécifique
 */
export class MettreAJourChapitreDto {
  @IsString()
  @IsNotEmpty()
  chapitreId: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  titre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ordre?: number;

  @IsOptional()
  @IsString()
  duree?: string;
} 