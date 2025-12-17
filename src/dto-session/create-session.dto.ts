import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, Min, Max, MinLength, MaxLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour créer une ressource de session
 */
export class CreateSessionResourceDto {
  @ApiProperty({ description: 'Titre de la ressource', example: 'Guide de préparation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ 
    description: 'Type de ressource', 
    example: 'article',
    enum: ['video', 'article', 'code', 'tool', 'pdf', 'link']
  })
  @IsEnum(['video', 'article', 'code', 'tool', 'pdf', 'link'])
  type: 'video' | 'article' | 'code' | 'tool' | 'pdf' | 'link';

  @ApiProperty({ description: 'URL de la ressource', example: 'https://example.com/guide.pdf' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({ description: 'Description de la ressource', example: 'Guide complet pour préparer votre session' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @ApiProperty({ description: 'Ordre d\'affichage', example: 1 })
  @IsNumber()
  @Min(0)
  order: number;
}

/**
 * DTO pour créer une session
 */
export class CreateSessionDto {
  @ApiProperty({ description: 'Titre de la session', example: '1-on-1 Code Review Session' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Description de la session', example: 'Get personalized feedback on your code and projects from an experienced developer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ description: 'Durée de la session en minutes', example: 60 })
  @IsNumber()
  @Min(15)
  @Max(480) // 8 heures max
  duration: number;

  @ApiProperty({ description: 'Prix de la session', example: 150 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ 
    description: 'Devise du prix', 
    example: 'USD',
    enum: ['USD', 'EUR', 'TND']
  })
  @IsEnum(['USD', 'EUR', 'TND'])
  currency: string;

  @ApiProperty({ description: 'Slug de la communauté', example: 'web-dev-community' })
  @IsString()
  @IsNotEmpty()
  communitySlug: string;

  @ApiPropertyOptional({ description: 'Catégorie de la session', example: 'Code Review' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Nombre maximum de réservations par semaine', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxBookingsPerWeek?: number;

  @ApiPropertyOptional({ description: 'Notes additionnelles', example: 'Come prepared with specific code you\'d like reviewed' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Si la session est active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Ressources de la session', type: [CreateSessionResourceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSessionResourceDto)
  resources: CreateSessionResourceDto[];
}
