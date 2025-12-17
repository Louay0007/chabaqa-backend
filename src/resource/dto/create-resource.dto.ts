import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsUrl, IsNumber, Min, Max, IsBoolean, ArrayMinSize, MinLength, MaxLength, IsObject, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResourceType, ResourceCategory, ContentElementType } from '../../schema/resource.schema';

/**
 * DTO pour la réponse de résumé des ressources (champs limités)
 */
export class ResourceSummaryDto {
  @ApiProperty({
    description: 'Identifiant de la ressource'
  })
  _id: string;

  @ApiProperty({
    description: 'Titre de la ressource'
  })
  titre: string;

  @ApiProperty({
    description: 'Description de la ressource'
  })
  description: string;

  @ApiProperty({
    description: 'Type de ressource',
    enum: ResourceType
  })
  type: ResourceType;

  @ApiProperty({
    description: 'Temps de lecture estimé'
  })
  readTime: string;

  @ApiProperty({
    description: 'Catégorie de la ressource',
    enum: ResourceCategory
  })
  category: ResourceCategory;

  @ApiPropertyOptional({
    description: 'Slug de la ressource pour URL'
  })
  slug?: string;

  @ApiProperty({
    description: 'Date de création'
  })
  createdAt: Date;
}

/**
 * DTO pour créer un élément de contenu
 */
export class CreateContentElementDto {
  @ApiProperty({
    description: 'Type d\'élément de contenu',
    enum: ContentElementType
  })
  @IsEnum(ContentElementType)
  type: ContentElementType;

  @ApiProperty({
    description: 'Contenu de l\'élément (texte, URL d\'image, URL de vidéo, etc.)',
    minLength: 1
  })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({
    description: 'Titre de l\'élément'
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Description de l\'élément'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Texte alternatif pour les images'
  })
  @IsOptional()
  @IsString()
  alt?: string;

  @ApiPropertyOptional({
    description: 'Légende de l\'élément'
  })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiProperty({
    description: 'Ordre d\'affichage de l\'élément',
    minimum: 0,
    default: 0
  })
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  order: number = 0;

  @ApiPropertyOptional({
    description: 'Métadonnées supplémentaires de l\'élément'
  })
  @IsOptional()
  metadata?: {
    duration?: number;
    size?: number;
    format?: string;
    thumbnail?: string;
    width?: number;
    height?: number;
    language?: string;
    [key: string]: any;
  };
}

/**
 * DTO pour créer une section de guide
 */
export class CreateGuideSectionDto {
  @ApiProperty({
    description: 'Titre de la section',
    minLength: 2,
    maxLength: 200
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Description de la section'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Éléments de contenu de la section',
    type: [CreateContentElementDto],
    minItems: 1
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateContentElementDto)
  elements: CreateContentElementDto[];

  @ApiProperty({
    description: 'Ordre d\'affichage de la section',
    minimum: 1
  })
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  order: number;
}

/**
 * DTO pour créer le contenu d'un article
 */
export class CreateArticleContentDto {
  @ApiProperty({
    description: 'Éléments de contenu de l\'article',
    type: [CreateContentElementDto],
    minItems: 1
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateContentElementDto)
  elements: CreateContentElementDto[];

  @ApiPropertyOptional({
    description: 'Extrait de l\'article'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({
    description: 'Tags spécifiques à l\'article',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Métadonnées SEO'
  })
  @IsOptional()
  seoMetadata?: {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
    ogImage?: string;
    keywords?: string[];
  };
}

/**
 * DTO pour créer le contenu d'une vidéo
 */
export class CreateVideoContentDto {
  @ApiProperty({
    description: 'URL de la vidéo',
    format: 'url'
  })
  @IsUrl()
  videoUrl: string;

  @ApiPropertyOptional({
    description: 'URL de la miniature',
    format: 'url'
  })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'Durée de la vidéo en secondes',
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({
    description: 'Qualité de la vidéo'
  })
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiPropertyOptional({
    description: 'URLs des fichiers de sous-titres',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  subtitles?: string[];

  @ApiPropertyOptional({
    description: 'Métadonnées de la vidéo'
  })
  @IsOptional()
  videoMetadata?: {
    resolution?: string;
    bitrate?: number;
    codec?: string;
    frameRate?: number;
    size?: number;
  };

  @ApiPropertyOptional({
    description: 'Description enrichie de la vidéo',
    type: [CreateContentElementDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContentElementDto)
  description?: CreateContentElementDto[];

  @ApiPropertyOptional({
    description: 'Chapitres avec timestamps',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chapters?: string[];
}

/**
 * DTO pour créer le contenu d'un guide
 */
export class CreateGuideContentDto {
  @ApiProperty({
    description: 'Sections du guide',
    type: [CreateGuideSectionDto],
    minItems: 1
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGuideSectionDto)
  sections: CreateGuideSectionDto[];

  @ApiPropertyOptional({
    description: 'Introduction du guide',
    type: [CreateContentElementDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContentElementDto)
  introduction?: CreateContentElementDto[];

  @ApiPropertyOptional({
    description: 'Conclusion du guide',
    type: [CreateContentElementDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContentElementDto)
  conclusion?: CreateContentElementDto[];

  @ApiPropertyOptional({
    description: 'Métadonnées du guide'
  })
  @IsOptional()
  guideMetadata?: {
    difficulty?: 'Débutant' | 'Intermédiaire' | 'Avancé';
    prerequisites?: string[];
    learningOutcomes?: string[];
    tools?: string[];
    resources?: string[];
  };
}

/**
 * DTO de base pour tous les types de ressources
 */
class BaseResourceDto {
  @ApiProperty({
    description: 'Titre de la ressource',
    minLength: 5,
    maxLength: 200
  })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  titre: string;

  @ApiProperty({
    description: 'Description de la ressource',
    minLength: 10,
    maxLength: 1000
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @ApiProperty({
    description: 'Temps de lecture estimé',
    example: '15 min de lecture'
  })
  @IsString()
  @MinLength(1)
  readTime: string;

  @ApiProperty({
    description: 'Catégorie de la ressource',
    enum: ResourceCategory,
    example: ResourceCategory.COMMUNITY_DEVELOPMENT
  })
  @IsString()
  @Transform(({ value }) => {
    // Mapper les chaînes en valeurs d'enum pour les catégories
    const categoryMapping: { [key: string]: ResourceCategory } = {
      'Développement communautaire': ResourceCategory.COMMUNITY_DEVELOPMENT,
      'développement communautaire': ResourceCategory.COMMUNITY_DEVELOPMENT,
      'COMMUNITY_DEVELOPMENT': ResourceCategory.COMMUNITY_DEVELOPMENT,
      'Monétisation': ResourceCategory.MONETIZATION,
      'monétisation': ResourceCategory.MONETIZATION,
      'MONETIZATION': ResourceCategory.MONETIZATION,
      'Marketing': ResourceCategory.MARKETING,
      'marketing': ResourceCategory.MARKETING,
      'MARKETING': ResourceCategory.MARKETING,
      'Création de contenu': ResourceCategory.CONTENT_CREATION,
      'création de contenu': ResourceCategory.CONTENT_CREATION,
      'CONTENT_CREATION': ResourceCategory.CONTENT_CREATION,
      'Analytiques': ResourceCategory.ANALYTICS,
      'analytiques': ResourceCategory.ANALYTICS,
      'ANALYTICS': ResourceCategory.ANALYTICS,
      'Engagement': ResourceCategory.ENGAGEMENT,
      'engagement': ResourceCategory.ENGAGEMENT,
      'ENGAGEMENT': ResourceCategory.ENGAGEMENT,
      'Gestion': ResourceCategory.MANAGEMENT,
      'gestion': ResourceCategory.MANAGEMENT,
      'MANAGEMENT': ResourceCategory.MANAGEMENT,
      'Technique': ResourceCategory.TECHNICAL,
      'technique': ResourceCategory.TECHNICAL,
      'TECHNICAL': ResourceCategory.TECHNICAL,
      'Business': ResourceCategory.BUSINESS,
      'business': ResourceCategory.BUSINESS,
      'BUSINESS': ResourceCategory.BUSINESS,
      'Design': ResourceCategory.DESIGN,
      'design': ResourceCategory.DESIGN,
      'DESIGN': ResourceCategory.DESIGN,
    };
    
    return categoryMapping[value] || value;
  })
  @IsEnum(ResourceCategory)
  category: ResourceCategory;

  @ApiPropertyOptional({
    description: 'ID de la communauté associée'
  })
  @IsOptional()
  @IsString()
  communityId?: string;

  @ApiPropertyOptional({
    description: 'URL de l\'image miniature',
    format: 'url'
  })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'URL de l\'image de couverture',
    format: 'url'
  })
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Publier immédiatement la ressource',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublished?: boolean = false;

  @ApiPropertyOptional({
    description: 'Marquer comme ressource mise en avant',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isFeature?: boolean = false;

  @ApiPropertyOptional({
    description: 'Marquer comme ressource premium',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPremium?: boolean = false;

  @ApiPropertyOptional({
    description: 'Tags associés à la ressource',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Slug personnalisé pour l\'URL'
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  slug?: string;
}

/**
 * DTO principal pour créer une ressource - accepte tous les types
 */
export class CreateResourceDto extends BaseResourceDto {
  @ApiProperty({
    description: 'Type de ressource',
    enum: ResourceType,
    example: ResourceType.ARTICLE
  })
  @IsString()
  @Transform(({ value }) => {
    // Mapper les chaînes en valeurs d'enum
    const typeMapping: { [key: string]: ResourceType } = {
      'Article': ResourceType.ARTICLE,
      'article': ResourceType.ARTICLE,
      'ARTICLE': ResourceType.ARTICLE,
      'Video': ResourceType.VIDEO,
      'video': ResourceType.VIDEO,
      'VIDEO': ResourceType.VIDEO,
      'Guide': ResourceType.GUIDE,
      'guide': ResourceType.GUIDE,
      'GUIDE': ResourceType.GUIDE,
      'Podcast': ResourceType.PODCAST,
      'podcast': ResourceType.PODCAST,
      'PODCAST': ResourceType.PODCAST,
      'Ebook': ResourceType.EBOOK,
      'ebook': ResourceType.EBOOK,
      'EBOOK': ResourceType.EBOOK,
    };
    
    return typeMapping[value] || value;
  })
  @IsEnum(ResourceType)
  type: ResourceType;

  @ApiProperty({
    description: 'Contenu de la ressource (structure varie selon le type)',
    example: {
      elements: [
        {
          type: 'text',
          content: 'Contenu de l\'article...',
          title: 'Introduction',
          order: 0
        }
      ]
    }
  })
  @IsObject()
  @IsNotEmpty()
  content: any;
}

/**
 * DTO spécifique pour créer un article
 */
export class CreateArticleResourceDto extends BaseResourceDto {
  @ApiProperty({
    description: 'Type de ressource',
    enum: [ResourceType.ARTICLE],
    default: ResourceType.ARTICLE
  })
  @IsEnum([ResourceType.ARTICLE])
  type: ResourceType.ARTICLE;

  @ApiProperty({
    description: 'Contenu de l\'article',
    type: CreateArticleContentDto
  })
  @ValidateNested()
  @Type(() => CreateArticleContentDto)
  content: CreateArticleContentDto;
}

/**
 * DTO spécifique pour créer une vidéo
 */
export class CreateVideoResourceDto extends BaseResourceDto {
  @ApiProperty({
    description: 'Type de ressource',
    enum: [ResourceType.VIDEO],
    default: ResourceType.VIDEO
  })
  @IsEnum([ResourceType.VIDEO])
  type: ResourceType.VIDEO;

  @ApiProperty({
    description: 'Contenu de la vidéo',
    type: CreateVideoContentDto
  })
  @ValidateNested()
  @Type(() => CreateVideoContentDto)
  content: CreateVideoContentDto;
}

/**
 * DTO spécifique pour créer un guide
 */
export class CreateGuideResourceDto extends BaseResourceDto {
  @ApiProperty({
    description: 'Type de ressource',
    enum: [ResourceType.GUIDE],
    default: ResourceType.GUIDE
  })
  @IsEnum([ResourceType.GUIDE])
  type: ResourceType.GUIDE;

  @ApiProperty({
    description: 'Contenu du guide',
    type: CreateGuideContentDto
  })
  @ValidateNested()
  @Type(() => CreateGuideContentDto)
  content: CreateGuideContentDto;
} 