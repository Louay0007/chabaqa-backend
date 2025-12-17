import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested, Min, MinLength, MaxLength, IsEnum, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour les options de paiement d'un cours
 */
export class CoursePaymentOptionsDto {
  @ApiPropertyOptional({
    description: 'Autoriser les paiements échelonnés',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  allowInstallments?: boolean;

  @ApiPropertyOptional({
    description: 'Nombre d\'échéances (2-12)',
    example: 3,
    minimum: 2,
    maximum: 12
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(12)
  installmentCount?: number;

  @ApiPropertyOptional({
    description: 'Remise early bird (%)',
    example: 20,
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  earlyBirdDiscount?: number;

  @ApiPropertyOptional({
    description: 'Remise groupe (%)',
    example: 15,
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  groupDiscount?: number;

  @ApiPropertyOptional({
    description: 'Remise membre (%)',
    example: 10,
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  memberDiscount?: number;
}

/**
 * DTO pour la configuration de prix d'un cours
 */
export class CoursePricingDto {
  @ApiPropertyOptional({
    description: 'Prix de base en TND',
    example: 99.99,
    minimum: 0,
    default: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Devise',
    enum: ['USD', 'EUR', 'TND'],
    example: 'TND',
    default: 'TND'
  })
  @IsOptional()
  @IsEnum(['USD', 'EUR', 'TND'])
  currency?: string;

  @ApiPropertyOptional({
    description: 'Type de prix',
    enum: ['free', 'one-time', 'monthly', 'yearly'],
    example: 'one-time',
    default: 'free'
  })
  @IsOptional()
  @IsEnum(['free', 'one-time', 'monthly', 'yearly'])
  priceType?: string;

  @ApiPropertyOptional({
    description: 'Produit récurrent',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description: 'Intervalle de récurrence',
    enum: ['month', 'year', 'week'],
    example: 'month'
  })
  @IsOptional()
  @IsEnum(['month', 'year', 'week'])
  recurringInterval?: string;

  @ApiPropertyOptional({
    description: 'Fonctionnalités incluses',
    example: ['Accès à vie', 'Support prioritaire', 'Ressources téléchargeables', 'Certificat'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Options de paiement',
    type: CoursePaymentOptionsDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoursePaymentOptionsDto)
  paymentOptions?: CoursePaymentOptionsDto;

  @ApiPropertyOptional({
    description: 'Jours d\'essai gratuits',
    example: 7,
    minimum: 0,
    maximum: 30
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  freeTrialDays?: number;

  @ApiPropertyOptional({
    description: 'Fonctionnalités d\'essai',
    example: ['Accès aux 2 premiers chapitres', 'Support communautaire'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trialFeatures?: string[];
}

/**
 * DTO pour créer un chapitre dans une section
 */
export class CreateChapitreDto {
  @ApiProperty({ description: 'Titre du chapitre', example: 'Introduction aux variables JavaScript' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  titre: string;

  @ApiProperty({ description: 'Description/contenu du chapitre', example: 'Dans ce chapitre, nous apprendrons...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ description: 'URL de la vidéo du chapitre', example: 'https://example.com/video.mp4' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiProperty({ description: 'Si le chapitre est gratuit ou payant', example: false })
  @IsBoolean()
  isPaid: boolean;

  @ApiPropertyOptional({ description: 'Prix spécifique du chapitre (si différent du cours)', example: 9.99 })
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
  notes?: string;
}

/**
 * DTO pour créer une section avec ses chapitres
 */
export class CreateSectionDto {
  @ApiProperty({ description: 'Titre de la section', example: 'Les Fondamentaux' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  titre: string;

  @ApiPropertyOptional({ description: 'Description de la section', example: 'Cette section couvre les bases...' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Ordre de la section dans le cours', example: 1 })
  @IsNumber()
  @Min(1)
  ordre: number;

  @ApiProperty({ description: 'Liste des chapitres de cette section', type: [CreateChapitreDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChapitreDto)
  chapitres: CreateChapitreDto[];
}

/**
 * DTO pour créer un cours avec sections et chapitres
 */
export class CreateCoursDto {
  @ApiProperty({ description: 'Titre du cours', example: 'Développement Web avec Node.js' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  titre: string;

  @ApiProperty({ description: 'Description complète du cours', example: 'Un cours complet pour apprendre Node.js...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ description: 'Image miniature du cours', example: 'https://example.com/thumb.jpg' })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiProperty({ description: 'Prix du cours', example: 49.99 })
  @IsNumber()
  @Min(0)
  prix: number;

  @ApiProperty({ description: 'Si le cours est gratuit ou payant', example: true })
  @IsBoolean()
  isPaid: boolean;

  @ApiPropertyOptional({ description: 'Devise du prix', example: 'TND', enum: ['USD', 'EUR', 'TND'] })
  @IsOptional()
  @IsString()
  devise?: string;

  @ApiProperty({ description: 'Slug de la communauté', example: 'digital-marketing-masters' })
  @IsString()
  @IsNotEmpty()
  communitySlug: string;

  @ApiPropertyOptional({ description: 'Si le cours est publié', example: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: 'Catégorie du cours', example: 'Programmation' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Niveau du cours', example: 'débutant' })
  @IsOptional()
  @IsString()
  niveau?: string;

  @ApiPropertyOptional({ description: 'Durée totale du cours', example: '12h 30min' })
  @IsOptional()
  @IsString()
  duree?: string;

  @ApiPropertyOptional({ description: 'Objectifs d\'apprentissage', example: ['Maîtriser Node.js', 'Créer des APIs'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningObjectives?: string[];

  @ApiPropertyOptional({ description: 'Prérequis du cours', example: ['Bases en JavaScript', 'HTML/CSS'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @ApiPropertyOptional({ description: 'Notes supplémentaires', example: 'Cours avec ressources téléchargeables' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Sections du cours avec leurs chapitres', type: [CreateSectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  sections: CreateSectionDto[];

  // ============ Configuration de prix avancée (Optionnel) ============
  
  @ApiPropertyOptional({
    description: 'Configuration de prix avancée du cours (optionnel)',
    type: CoursePricingDto,
    example: {
      price: 99.99,
      currency: 'TND',
      priceType: 'one-time',
      isRecurring: false,
      features: ['Accès à vie', 'Support prioritaire', 'Ressources téléchargeables', 'Certificat'],
      paymentOptions: {
        allowInstallments: true,
        installmentCount: 3,
        earlyBirdDiscount: 20,
        groupDiscount: 15,
        memberDiscount: 10
      },
      freeTrialDays: 7,
      trialFeatures: ['Accès aux 2 premiers chapitres', 'Support communautaire']
    }
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoursePricingDto)
  pricing?: CoursePricingDto;
} 