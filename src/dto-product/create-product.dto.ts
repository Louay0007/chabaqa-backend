import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsEnum, IsBoolean, MaxLength, MinLength, Min, Max, ArrayMaxSize, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour créer une variante de produit
 */
export class CreateProductVariantDto {
  @ApiProperty({
    description: 'Nom de la variante',
    example: 'Taille L',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Le nom de la variante ne peut pas dépasser 100 caractères' })
  name: string;

  @ApiProperty({
    description: 'Prix de la variante',
    example: 29.99,
    minimum: 0
  })
  @IsNumber()
  @Min(0, { message: 'Le prix doit être positif' })
  price: number;

  @ApiPropertyOptional({
    description: 'Description de la variante',
    example: 'Variante avec des matériaux premium',
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'La description ne peut pas dépasser 500 caractères' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Inventaire de la variante',
    example: 50,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'L\'inventaire doit être positif' })
  inventory?: number;
}

/**
 * DTO pour créer un fichier de produit
 */
export class CreateProductFileDto {
  @ApiProperty({
    description: 'Nom du fichier',
    example: 'UI_Kit.fig',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Le nom du fichier ne peut pas dépasser 200 caractères' })
  name: string;

  @ApiProperty({
    description: 'URL du fichier',
    example: 'https://example.com/download/ui-kit'
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: 'L\'URL du fichier doit être valide' })
  url: string;

  @ApiProperty({
    description: 'Type de fichier',
    example: 'Figma',
    enum: ['Figma', 'PDF', 'SVG', 'PNG', 'JPG', 'ZIP', 'PSD', 'AI', 'SKETCH', 'XD', 'MP4', 'MP3', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'TXT', 'MD', 'JSON', 'XML', 'CSS', 'JS', 'HTML', 'PHP', 'PY', 'JAVA', 'CPP', 'C', 'OTHER']
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['Figma', 'PDF', 'SVG', 'PNG', 'JPG', 'ZIP', 'PSD', 'AI', 'SKETCH', 'XD', 'MP4', 'MP3', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'TXT', 'MD', 'JSON', 'XML', 'CSS', 'JS', 'HTML', 'PHP', 'PY', 'JAVA', 'CPP', 'C', 'OTHER'], {
    message: 'Le type de fichier doit être valide'
  })
  type: string;

  @ApiPropertyOptional({
    description: 'Taille du fichier',
    example: '8.5MB'
  })
  @IsString()
  @IsOptional()
  size?: string;

  @ApiPropertyOptional({
    description: 'Description du fichier',
    example: 'Fichier principal du kit UI avec tous les composants',
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'La description ne peut pas dépasser 500 caractères' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Ordre d\'affichage du fichier',
    example: 1,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'L\'ordre doit être positif' })
  order?: number;

  @ApiPropertyOptional({
    description: 'Indique si le fichier est actif',
    example: true,
    default: true
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * DTO pour créer un produit
 */
export class CreateProductDto {
  @ApiProperty({
    description: 'Titre du produit',
    example: 'Cours de React Avancé',
    minLength: 2,
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Le titre doit contenir au moins 2 caractères' })
  @MaxLength(200, { message: 'Le titre ne peut pas dépasser 200 caractères' })
  title: string;

  @ApiProperty({
    description: 'Description du produit',
    example: 'Apprenez les concepts avancés de React avec des projets pratiques',
    maxLength: 2000
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
  description: string;

  @ApiProperty({
    description: 'Prix du produit',
    example: 99.99,
    minimum: 0
  })
  @IsNumber()
  @Min(0, { message: 'Le prix doit être positif' })
  price: number;

  @ApiPropertyOptional({
    description: 'Devise du prix',
    example: 'USD',
    enum: ['USD', 'EUR', 'TND'],
    default: 'USD'
  })
  @IsString()
  @IsOptional()
  @IsEnum(['USD', 'EUR', 'TND'], { message: 'La devise doit être USD, EUR ou TND' })
  currency?: string;

  @ApiProperty({
    description: 'ID de la communauté',
    example: 'community_123'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    description: 'Catégorie du produit',
    example: 'Formation',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'La catégorie ne peut pas dépasser 100 caractères' })
  category: string;

  @ApiPropertyOptional({
    description: 'Type de produit',
    example: 'digital',
    enum: ['digital', 'physical'],
    default: 'digital'
  })
  @IsString()
  @IsOptional()
  @IsEnum(['digital', 'physical'], { message: 'Le type doit être digital ou physical' })
  type?: 'digital' | 'physical';

  @ApiPropertyOptional({
    description: 'Inventaire du produit (pour les produits physiques)',
    example: 100,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'L\'inventaire doit être positif' })
  inventory?: number;

  @ApiPropertyOptional({
    description: 'Images du produit',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    maxItems: 10
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Maximum 10 images autorisées' })
  images?: string[];

  @ApiPropertyOptional({
    description: 'Variantes du produit',
    type: [CreateProductVariantDto],
    maxItems: 20
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20, { message: 'Maximum 20 variantes autorisées' })
  variants?: CreateProductVariantDto[];

  @ApiPropertyOptional({
    description: 'Fichiers du produit',
    type: [CreateProductFileDto],
    maxItems: 50
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50, { message: 'Maximum 50 fichiers autorisés' })
  files?: CreateProductFileDto[];

  @ApiPropertyOptional({
    description: 'Termes de licence',
    example: 'Ce produit est sous licence MIT',
    maxLength: 2000
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: 'Les termes de licence ne peuvent pas dépasser 2000 caractères' })
  licenseTerms?: string;

  @ApiPropertyOptional({
    description: 'Indique si le produit est récurrent',
    example: false,
    default: false
  })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description: 'Intervalle de récurrence',
    example: 'month',
    enum: ['month', 'year', 'week']
  })
  @IsString()
  @IsOptional()
  @IsEnum(['month', 'year', 'week'], { message: 'L\'intervalle doit être month, year ou week' })
  recurringInterval?: 'month' | 'year' | 'week';

  @ApiPropertyOptional({
    description: 'Fonctionnalités du produit',
    example: ['Support 24/7', 'Accès à vie', 'Certificat'],
    maxItems: 20
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(20, { message: 'Maximum 20 fonctionnalités autorisées' })
  features?: string[];
}