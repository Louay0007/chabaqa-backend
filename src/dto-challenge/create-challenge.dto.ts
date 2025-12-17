import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsBoolean, IsArray, ValidateNested, Min, Max, MinLength, MaxLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour créer une ressource de défi
 */
export class CreateChallengeResourceDto {
  @ApiProperty({ description: 'Titre de la ressource', example: 'Guide HTML5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ 
    description: 'Type de ressource', 
    example: 'video',
    enum: ['video', 'article', 'code', 'tool', 'pdf', 'link']
  })
  @IsEnum(['video', 'article', 'code', 'tool', 'pdf', 'link'])
  type: 'video' | 'article' | 'code' | 'tool' | 'pdf' | 'link';

  @ApiProperty({ description: 'URL de la ressource', example: 'https://example.com/guide.pdf' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({ description: 'Description de la ressource', example: 'Guide complet sur HTML5' })
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
 * DTO pour créer une ressource de tâche
 */
export class CreateChallengeTaskResourceDto {
  @ApiProperty({ description: 'Titre de la ressource', example: 'Tutoriel CSS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ 
    description: 'Type de ressource', 
    example: 'video',
    enum: ['video', 'article', 'code', 'tool']
  })
  @IsEnum(['video', 'article', 'code', 'tool'])
  type: 'video' | 'article' | 'code' | 'tool';

  @ApiProperty({ description: 'URL de la ressource', example: 'https://example.com/tutorial.mp4' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({ description: 'Description de la ressource', example: 'Tutoriel vidéo sur CSS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;
}

/**
 * DTO pour créer une tâche de défi
 */
export class CreateChallengeTaskDto {
  @ApiPropertyOptional({ description: 'ID unique de la tâche', example: 'task-1234567890-0' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Jour de la tâche', example: 1 })
  @IsNumber()
  @Min(1)
  day: number;

  @ApiProperty({ description: 'Titre de la tâche', example: 'Créer une page HTML' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Description de la tâche', example: 'Créer une page HTML avec les éléments sémantiques' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ description: 'Livrable attendu', example: 'Page HTML avec header, nav, main, footer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  deliverable: string;

  @ApiProperty({ description: 'Points attribués', example: 100 })
  @IsNumber()
  @Min(0)
  points: number;

  @ApiProperty({ description: 'Instructions détaillées', example: 'Utilisez les balises sémantiques HTML5...' })
  @IsString()
  @IsNotEmpty()
  instructions: string;

  @ApiPropertyOptional({ description: 'Notes supplémentaires' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Ressources de la tâche', type: [CreateChallengeTaskResourceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallengeTaskResourceDto)
  resources: CreateChallengeTaskResourceDto[];
}

/**
 * DTO pour créer un défi
 */
export class CreateChallengeDto {
  @ApiProperty({ description: 'Titre du défi', example: '30-Day Coding Challenge' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Description du défi', example: 'Un défi de 30 jours pour apprendre le développement web' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ description: 'Slug de la communauté', example: 'web-dev-community' })
  @IsString()
  @IsNotEmpty()
  communitySlug: string;

  @ApiProperty({ description: 'Date de début', example: '2024-02-01T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Date de fin', example: '2024-03-01T23:59:59.000Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Montant de dépôt requis', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ description: 'Nombre maximum de participants', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxParticipants?: number;

  @ApiPropertyOptional({ description: 'Récompense de completion', example: 25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  completionReward?: number;

  @ApiPropertyOptional({ description: 'Bonus pour le meilleur performer', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  topPerformerBonus?: number;

  @ApiPropertyOptional({ description: 'Bonus de streak', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  streakBonus?: number;

  @ApiPropertyOptional({ description: 'Catégorie du défi', example: 'Web Development' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ 
    description: 'Difficulté du défi', 
    example: 'beginner',
    enum: ['beginner', 'intermediate', 'advanced']
  })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Durée du défi', example: '30 days' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Image miniature du défi', example: 'https://example.com/challenge.jpg' })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiPropertyOptional({ description: 'Notes additionnelles' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Si le défi est actif', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Ressources du défi', type: [CreateChallengeResourceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallengeResourceDto)
  resources: CreateChallengeResourceDto[];

  @ApiProperty({ description: 'Tâches du défi', type: [CreateChallengeTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallengeTaskDto)
  tasks: CreateChallengeTaskDto[];

  // ============= PRICING FIELDS =============

  @ApiPropertyOptional({ description: 'Prix de participation au défi', example: 99 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  participationFee?: number;

  @ApiPropertyOptional({ 
    description: 'Devise du prix', 
    example: 'TND',
    enum: ['USD', 'EUR', 'TND']
  })
  @IsOptional()
  @IsEnum(['USD', 'EUR', 'TND'])
  currency?: string;

  @ApiPropertyOptional({ description: 'Si un dépôt est requis', example: true })
  @IsOptional()
  @IsBoolean()
  depositRequired?: boolean;

  @ApiPropertyOptional({ description: 'Si le défi est premium', example: false })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional({ 
    description: 'Fonctionnalités premium', 
    type: 'object',
    additionalProperties: false,
    properties: {
      personalMentoring: { type: 'boolean' },
      exclusiveResources: { type: 'boolean' },
      priorityFeedback: { type: 'boolean' },
      certificate: { type: 'boolean' },
      liveSessions: { type: 'boolean' },
      communityAccess: { type: 'boolean' }
    }
  })
  @IsOptional()
  premiumFeatures?: {
    personalMentoring?: boolean;
    exclusiveResources?: boolean;
    priorityFeedback?: boolean;
    certificate?: boolean;
    liveSessions?: boolean;
    communityAccess?: boolean;
  };

  @ApiPropertyOptional({ 
    description: 'Options de paiement', 
    type: 'object',
    additionalProperties: false,
    properties: {
      allowInstallments: { type: 'boolean' },
      installmentCount: { type: 'number' },
      earlyBirdDiscount: { type: 'number' },
      groupDiscount: { type: 'number' },
      memberDiscount: { type: 'number' }
    }
  })
  @IsOptional()
  paymentOptions?: {
    allowInstallments?: boolean;
    installmentCount?: number;
    earlyBirdDiscount?: number;
    groupDiscount?: number;
    memberDiscount?: number;
  };

  @ApiPropertyOptional({ description: 'Jours d\'essai gratuit', example: 7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  freeTrialDays?: number;

  @ApiPropertyOptional({ description: 'Fonctionnalités disponibles pendant l\'essai', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trialFeatures?: string[];
}
