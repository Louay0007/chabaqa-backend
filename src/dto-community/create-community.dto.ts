import { IsString, IsOptional, IsEnum, MinLength, MaxLength, ValidateNested, IsObject, IsNotEmpty, IsIn, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface, Validate, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Validateur personnalisé pour s'assurer qu'au moins un lien social est fourni
 */
@ValidatorConstraint({ name: 'AtLeastOneSocialLink', async: false })
export class AtLeastOneSocialLinkConstraint implements ValidatorConstraintInterface {
  validate(socialLinks: any, args: ValidationArguments) {
    if (!socialLinks || typeof socialLinks !== 'object') {
      return false;
    }
    
    // Vérifier qu'au moins un lien social est fourni et n'est pas vide
    const links = Object.values(socialLinks) as string[];
    return links.some(link => link && link.trim() !== '');
  }

  defaultMessage(args: ValidationArguments) {
    return 'Au moins un lien social est requis pour créer une communauté';
  }
}

/**
 * DTO pour les options de paiement
 */
export class PaymentOptionsDto {
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
 * DTO pour les limites de la communauté
 */
export class CommunityLimitsDto {
  @ApiPropertyOptional({
    description: 'Nombre maximum de membres',
    example: 1000,
    default: 1000
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxMembers?: number;

  @ApiPropertyOptional({
    description: 'Nombre maximum de cours',
    example: 50,
    default: 50
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxCourses?: number;

  @ApiPropertyOptional({
    description: 'Nombre maximum de posts',
    example: 1000,
    default: 1000
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPosts?: number;

  @ApiPropertyOptional({
    description: 'Limite de stockage',
    example: '10GB',
    default: '10GB'
  })
  @IsOptional()
  @IsString()
  storageLimit?: string;
}

/**
 * DTO pour la configuration de prix de la communauté
 */
export class CommunityPricingDto {
  @ApiPropertyOptional({
    description: 'Prix de base en TND',
    example: 29.99,
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
    example: 'monthly',
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
    example: ['Accès complet', 'Support prioritaire', 'Ressources exclusives'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Limites de la communauté',
    type: CommunityLimitsDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommunityLimitsDto)
  limits?: CommunityLimitsDto;

  @ApiPropertyOptional({
    description: 'Options de paiement',
    type: PaymentOptionsDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentOptionsDto)
  paymentOptions?: PaymentOptionsDto;

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
    example: ['Accès limité', 'Support communautaire'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trialFeatures?: string[];
}

/**
 * DTO pour les liens sociaux - 100% compatible avec frontend
 */
export class SocialLinksDto {
  @ApiPropertyOptional({
    description: 'Lien Instagram',
    example: 'https://instagram.com/moncompte'
  })
  @IsOptional()
  @IsString()
  instagram?: string;

  @ApiPropertyOptional({
    description: 'Lien TikTok',
    example: 'https://tiktok.com/@moncompte'
  })
  @IsOptional()
  @IsString()
  tiktok?: string;

  @ApiPropertyOptional({
    description: 'Lien Facebook',
    example: 'https://facebook.com/moncompte'
  })
  @IsOptional()
  @IsString()
  facebook?: string;

  @ApiPropertyOptional({
    description: 'Lien YouTube',
    example: 'https://youtube.com/@moncompte'
  })
  @IsOptional()
  @IsString()
  youtube?: string;

  @ApiPropertyOptional({
    description: 'Lien LinkedIn',
    example: 'https://linkedin.com/in/moncompte'
  })
  @IsOptional()
  @IsString()
  linkedin?: string;

  @ApiPropertyOptional({
    description: 'Site web',
    example: 'https://monsite.com'
  })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({
    description: 'Lien Twitter',
    example: 'https://twitter.com/moncompte'
  })
  @IsOptional()
  @IsString()
  twitter?: string;

  @ApiPropertyOptional({
    description: 'Lien Discord',
    example: 'https://discord.gg/moncompte'
  })
  @IsOptional()
  @IsString()
  discord?: string;

  @ApiPropertyOptional({
    description: 'Lien Behance',
    example: 'https://behance.net/moncompte'
  })
  @IsOptional()
  @IsString()
  behance?: string;

  @ApiPropertyOptional({
    description: 'Lien GitHub',
    example: 'https://github.com/moncompte'
  })
  @IsOptional()
  @IsString()
  github?: string;
}

/**
 * DTO pour la création d'une communauté - 100% compatible avec frontend
 */
export class CreateCommunityDto {
  // ============ Informations de base (Étape 1) ============
  
  @ApiProperty({
    description: 'Nom de la communauté (OBLIGATOIRE)',
    example: 'Développeurs JavaScript Tunisie',
    minLength: 2,
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la communauté est obligatoire' })
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @MaxLength(100, { message: 'Le nom ne peut pas dépasser 100 caractères' })
  name: string;

  @ApiPropertyOptional({
    description: 'Description courte de la communauté (OPTIONNEL)',
    example: 'Une communauté pour partager des connaissances sur JavaScript en Tunisie',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La bio ne peut pas dépasser 500 caractères' })
  bio?: string;

  @ApiPropertyOptional({
    description: 'Logo de la communauté (OPTIONNEL)',
    example: 'https://example.com/image.jpg'
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({
    description: 'Pays/localisation (OBLIGATOIRE)',
    example: 'Tunisie'
  })
  @IsString()
  @IsNotEmpty({ message: 'Le pays est obligatoire' })
  country: string;

  // ============ Champs supplémentaires pour compatibilité frontend ============
  
  @ApiPropertyOptional({
    description: 'Catégorie de la communauté',
    example: 'Technology',
    enum: ['Technology', 'Marketing', 'Design', 'Fitness', 'Education', 'Business', 'Creative Arts', 'Personal Development', 'Cooking & Food', 'Travel & Adventure', 'Music & Entertainment']
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Type de contenu (pour compatibilité UI)',
    example: 'community',
    enum: ['community', 'course', 'challenge', 'product', 'oneToOne', 'event'],
    default: 'community'
  })
  @IsOptional()
  @IsEnum(['community', 'course', 'challenge', 'product', 'oneToOne', 'event'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Tags de la communauté',
    example: ['JavaScript', 'React', 'Node.js'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Description longue de la communauté',
    example: 'Une communauté complète pour les développeurs JavaScript...'
  })
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional({
    description: 'Image de couverture de la communauté',
    example: 'https://example.com/cover.jpg'
  })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({
    description: 'Image principale de la communauté',
    example: 'https://example.com/main-image.jpg'
  })
  @IsOptional()
  @IsString()
  image?: string;

  // ============ Paramètres d'accès (Étape 2) ============
  
  @ApiProperty({
    description: 'Statut de visibilité',
    enum: ['public', 'private'],
    example: 'public'
  })
  @IsEnum(['public', 'private'], {
    message: 'Le statut doit être "public" ou "private"'
  })
  status: 'public' | 'private';

  @ApiProperty({
    description: 'Type de frais d\'adhésion',
    enum: ['free', 'paid'],
    example: 'free'
  })
  @IsEnum(['free', 'paid'], {
    message: 'Le type de frais doit être "free" ou "paid"'
  })
  joinFee: 'free' | 'paid';

  @ApiProperty({
    description: 'Montant des frais (si paid) - string numérique',
    example: '25.50'
  })
  @IsString()
  @Transform(({ value, obj }) => {
    // Si joinFee est 'free', on retourne '0'
    if (obj.joinFee === 'free') {
      return '0';
    }
    return value;
  })
  feeAmount: string;

  @ApiProperty({
    description: 'Devise',
    enum: ['USD', 'TND', 'EUR'],
    example: 'TND'
  })
  @IsEnum(['USD', 'TND', 'EUR'], {
    message: 'La devise doit être USD, TND ou EUR'
  })
  currency: 'USD' | 'TND' | 'EUR';

  // ============ Liens sociaux (Étape 3 - au moins 1 requis) ============
  
  @ApiProperty({
    description: 'Liens sociaux (au moins 1 requis pour commencer)',
    type: SocialLinksDto,
    example: {
      instagram: 'https://instagram.com/devjs_tn',
      facebook: 'https://facebook.com/devjs.tn',
      website: 'https://devjs-tunisie.com'
    }
  })
  @IsObject()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  @Validate(AtLeastOneSocialLinkConstraint)
  socialLinks: SocialLinksDto;

  // ============ Configuration de prix (Étape 4 - Optionnel) ============
  
  @ApiPropertyOptional({
    description: 'Configuration de prix de la communauté (optionnel)',
    type: CommunityPricingDto,
    example: {
      price: 29.99,
      currency: 'TND',
      priceType: 'monthly',
      isRecurring: true,
      recurringInterval: 'month',
      features: ['Accès complet', 'Support prioritaire', 'Ressources exclusives'],
      limits: {
        maxMembers: 1000,
        maxCourses: 50,
        maxPosts: 1000,
        storageLimit: '10GB'
      },
      paymentOptions: {
        allowInstallments: true,
        installmentCount: 3,
        earlyBirdDiscount: 20,
        groupDiscount: 15,
        memberDiscount: 10
      },
      freeTrialDays: 7,
      trialFeatures: ['Accès limité', 'Support communautaire']
    }
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommunityPricingDto)
  pricing?: CommunityPricingDto;

  // ============ Settings pour compatibilité frontend ============
  
  @ApiPropertyOptional({
    description: 'Paramètres de personnalisation de la communauté',
    example: {
      primaryColor: '#3b82f6',
      secondaryColor: '#1e40af',
      welcomeMessage: 'Bienvenue dans notre communauté !',
      features: ['Cours exclusifs', 'Support 24/7', 'Ressources premium'],
      benefits: ['Accès complet', 'Support prioritaire', 'Ressources exclusives'],
      template: 'modern',
      fontFamily: 'Inter',
      borderRadius: 12,
      backgroundStyle: 'gradient',
      heroLayout: 'centered',
      showStats: true,
      showFeatures: true,
      showTestimonials: true,
      showPosts: true,
      showFAQ: true,
      enableAnimations: true,
      enableParallax: false,
      heroBackground: 'https://example.com/hero-bg.jpg',
      gallery: ['https://example.com/gallery1.jpg', 'https://example.com/gallery2.jpg'],
      videoUrl: 'https://youtube.com/watch?v=example',
      customSections: [
        {
          id: 1,
          type: 'text',
          title: 'À propos',
          content: 'Description de la communauté...',
          visible: true
        }
      ],
      metaTitle: 'Titre SEO de la communauté',
      metaDescription: 'Description SEO de la communauté'
    }
  })
  @IsOptional()
  @IsObject()
  settings?: {
    primaryColor?: string;
    secondaryColor?: string;
    welcomeMessage?: string;
    features?: string[];
    benefits?: string[];
    template?: string;
    fontFamily?: string;
    borderRadius?: number;
    backgroundStyle?: string;
    heroLayout?: string;
    showStats?: boolean;
    showFeatures?: boolean;
    showTestimonials?: boolean;
    showPosts?: boolean;
    showFAQ?: boolean;
    enableAnimations?: boolean;
    enableParallax?: boolean;
    heroBackground?: string;
    gallery?: string[];
    videoUrl?: string;
    customSections?: {
      id: number;
      type: string;
      title: string;
      content: string;
      visible: boolean;
    }[];
    metaTitle?: string;
    metaDescription?: string;
  };
}
