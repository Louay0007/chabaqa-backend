
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour les fonctionnalités premium d'un défi
 */
export class ChallengePremiumFeaturesDto {
  @ApiPropertyOptional({ description: 'Mentorat personnel', example: true })
  @IsOptional()
  @IsBoolean()
  personalMentoring?: boolean;

  @ApiPropertyOptional({ description: 'Ressources exclusives', example: true })
  @IsOptional()
  @IsBoolean()
  exclusiveResources?: boolean;

  @ApiPropertyOptional({ description: 'Feedback prioritaire', example: true })
  @IsOptional()
  @IsBoolean()
  priorityFeedback?: boolean;

  @ApiPropertyOptional({ description: 'Certificat de completion', example: true })
  @IsOptional()
  @IsBoolean()
  certificate?: boolean;

  @ApiPropertyOptional({ description: 'Sessions en direct', example: false })
  @IsOptional()
  @IsBoolean()
  liveSessions?: boolean;

  @ApiPropertyOptional({ description: 'Accès à la communauté', example: true })
  @IsOptional()
  @IsBoolean()
  communityAccess?: boolean;
}

/**
 * DTO pour les options de paiement d'un défi
 */
export class ChallengePaymentOptionsDto {
  @ApiPropertyOptional({ description: 'Permettre les paiements échelonnés', example: true })
  @IsOptional()
  @IsBoolean()
  allowInstallments?: boolean;

  @ApiPropertyOptional({ description: 'Nombre d\'échéances', example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(12)
  installmentCount?: number;

  @ApiPropertyOptional({ description: 'Remise early bird (%)', example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  earlyBirdDiscount?: number;

  @ApiPropertyOptional({ description: 'Remise groupe (%)', example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  groupDiscount?: number;

  @ApiPropertyOptional({ description: 'Remise membre (%)', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  memberDiscount?: number;
}

/**
 * DTO pour créer la configuration de prix d'un défi
 */
export class CreateChallengePricingDto {
  @ApiProperty({ description: 'Prix de participation au défi', example: 99 })
  @IsNumber()
  @Min(0)
  participationFee: number;

  @ApiProperty({ 
    description: 'Devise du prix', 
    example: 'TND',
    enum: ['USD', 'EUR', 'TND']
  })
  @IsEnum(['USD', 'EUR', 'TND'])
  currency: string;

  @ApiPropertyOptional({ description: 'Montant du dépôt requis', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ description: 'Si un dépôt est requis', example: true })
  @IsOptional()
  @IsBoolean()
  depositRequired?: boolean;

  @ApiPropertyOptional({ description: 'Si le défi est premium', example: false })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

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

  @ApiPropertyOptional({ description: 'Fonctionnalités premium', type: ChallengePremiumFeaturesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChallengePremiumFeaturesDto)
  premiumFeatures?: ChallengePremiumFeaturesDto;

  @ApiPropertyOptional({ description: 'Options de paiement', type: ChallengePaymentOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChallengePaymentOptionsDto)
  paymentOptions?: ChallengePaymentOptionsDto;

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

/**
 * DTO pour mettre à jour la configuration de prix d'un défi
 */
export class UpdateChallengePricingDto {
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

  @ApiPropertyOptional({ description: 'Montant du dépôt requis', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ description: 'Si un dépôt est requis', example: true })
  @IsOptional()
  @IsBoolean()
  depositRequired?: boolean;

  @ApiPropertyOptional({ description: 'Si le défi est premium', example: false })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

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

  @ApiPropertyOptional({ description: 'Fonctionnalités premium', type: ChallengePremiumFeaturesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChallengePremiumFeaturesDto)
  premiumFeatures?: ChallengePremiumFeaturesDto;

  @ApiPropertyOptional({ description: 'Options de paiement', type: ChallengePaymentOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChallengePaymentOptionsDto)
  paymentOptions?: ChallengePaymentOptionsDto;

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

/**
 * DTO pour calculer le prix d'un défi avec remises
 */
export class CalculateChallengePriceDto {
  @ApiProperty({ description: 'ID du défi', example: 'challenge_123' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiPropertyOptional({ 
    description: 'Type d\'utilisateur pour calculer les remises', 
    example: 'early-bird',
    enum: ['early-bird', 'group', 'member', 'regular']
  })
  @IsOptional()
  @IsEnum(['early-bird', 'group', 'member', 'regular'])
  userType?: 'early-bird' | 'group' | 'member' | 'regular';

  @ApiPropertyOptional({ description: 'Nombre de participants (pour remise groupe)', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  groupSize?: number;
}

/**
 * DTO de réponse pour le calcul de prix
 */
export class ChallengePriceCalculationResponseDto {
  @ApiProperty({ description: 'Prix de base', example: 99 })
  basePrice: number;

  @ApiProperty({ description: 'Devise', example: 'USD' })
  currency: string;

  @ApiProperty({ description: 'Remise appliquée (%)', example: 20 })
  discountPercentage: number;

  @ApiProperty({ description: 'Montant de la remise', example: 19.8 })
  discountAmount: number;

  @ApiProperty({ description: 'Prix final', example: 79.2 })
  finalPrice: number;

  @ApiProperty({ description: 'Type de remise appliquée', example: 'early-bird' })
  appliedDiscountType: string;

  @ApiProperty({ description: 'Si le défi est gratuit', example: false })
  isFree: boolean;

  @ApiPropertyOptional({ description: 'Montant du dépôt requis', example: 50 })
  depositAmount?: number;

  @ApiPropertyOptional({ description: 'Prix par échéance (si paiement échelonné)', example: 26.4 })
  installmentAmount?: number;

  @ApiPropertyOptional({ description: 'Nombre d\'échéances', example: 3 })
  installmentCount?: number;
}

/**
 * DTO pour vérifier l'accès à un défi
 */
export class CheckChallengeAccessDto {
  @ApiProperty({ description: 'ID du défi', example: 'challenge_123' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiProperty({ description: 'ID de l\'utilisateur', example: 'user_456' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

/**
 * DTO de réponse pour l'accès au défi
 */
export class ChallengeAccessResponseDto {
  @ApiProperty({ description: 'Si l\'utilisateur peut accéder au défi', example: true })
  hasAccess: boolean;

  @ApiProperty({ description: 'Raison de l\'accès ou du refus', example: 'User has paid for challenge' })
  reason: string;

  @ApiProperty({ description: 'Si le défi est gratuit', example: false })
  isFree: boolean;

  @ApiProperty({ description: 'Si l\'utilisateur a payé', example: true })
  hasPaid: boolean;

  @ApiPropertyOptional({ description: 'Jours restants de l\'essai gratuit', example: 5 })
  trialDaysRemaining?: number;

  @ApiPropertyOptional({ description: 'Fonctionnalités disponibles pendant l\'essai', type: [String] })
  trialFeatures?: string[];

  @ApiPropertyOptional({ description: 'Prix à payer pour accéder', example: 99 })
  priceToPay?: number;

  @ApiPropertyOptional({ description: 'Devise', example: 'USD' })
  currency?: string;
}
