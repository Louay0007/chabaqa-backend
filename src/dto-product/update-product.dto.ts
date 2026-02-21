import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreateProductFileDto,
  CreateProductVariantDto,
} from './create-product.dto';

/**
 * DTO pour mettre à jour un produit
 * Tous les champs sont optionnels et limités aux propriétés éditables
 */
export class UpdateProductDto {
  @ApiPropertyOptional({
    description: 'Titre du produit',
    example: 'Cours de React Avancé',
    maxLength: 200,
  })
  @IsString()
  @IsOptional()
  @MaxLength(200, {
    message: 'Le titre ne peut pas dépasser 200 caractères',
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'Description du produit',
    example: 'Apprenez les concepts avancés de React avec des projets pratiques',
    maxLength: 2000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000, {
    message: 'La description ne peut pas dépasser 2000 caractères',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Prix du produit',
    example: 99.99,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Le prix doit être positif' })
  price?: number;

  @ApiPropertyOptional({
    description: 'Devise du prix',
    example: 'USD',
    enum: ['USD', 'EUR', 'TND'],
  })
  @IsString()
  @IsOptional()
  @IsEnum(['USD', 'EUR', 'TND'], {
    message: 'La devise doit être USD, EUR ou TND',
  })
  currency?: string;

  @ApiPropertyOptional({
    description: 'Catégorie du produit',
    example: 'Formation',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, {
    message: 'La catégorie ne peut pas dépasser 100 caractères',
  })
  category?: string;

  @ApiPropertyOptional({
    description: 'Type de produit',
    example: 'digital',
    enum: ['digital', 'physical'],
  })
  @IsString()
  @IsOptional()
  @IsEnum(['digital', 'physical'], {
    message: 'Le type doit être digital ou physical',
  })
  type?: 'digital' | 'physical';

  @ApiPropertyOptional({
    description: 'Inventaire du produit (pour les produits physiques)',
    example: 100,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: "L'inventaire doit être positif" })
  inventory?: number;

  @ApiPropertyOptional({
    description: 'Images du produit',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({
    description: 'Variantes du produit',
    type: [CreateProductVariantDto],
  })
  @IsArray()
  @IsOptional()
  variants?: CreateProductVariantDto[];

  @ApiPropertyOptional({
    description: 'Fichiers du produit',
    type: [CreateProductFileDto],
  })
  @IsArray()
  @IsOptional()
  files?: CreateProductFileDto[];

  @ApiPropertyOptional({
    description: 'Termes de licence',
    example: 'Ce produit est sous licence MIT',
    maxLength: 2000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000, {
    message: 'Les termes de licence ne peuvent pas dépasser 2000 caractères',
  })
  licenseTerms?: string;

  @ApiPropertyOptional({
    description: 'Fonctionnalités du produit',
    example: ['Support 24/7', 'Accès à vie', 'Certificat'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({
    description: 'Indique si le produit est publié',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
