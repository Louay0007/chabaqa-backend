import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  MaxLength,
  MinLength,
  IsUrl,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PostLinkDto {
  @ApiProperty({ description: 'URL du lien', example: 'https://example.com' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: "L'URL du lien doit être valide" })
  url: string;

  @ApiPropertyOptional({ description: 'Titre du lien', example: 'Example Site' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Description du lien', example: 'An example website' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Vignette du lien', example: 'https://example.com/thumb.jpg' })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: "La vignette doit être une URL valide" })
  thumbnail?: string;
}

/**
 * DTO pour créer un commentaire sur un post
 */
export class CreatePostCommentDto {
  @ApiProperty({
    description: 'Contenu du commentaire',
    example: 'Excellent article, merci pour le partage !',
    maxLength: 2000
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Le contenu du commentaire ne peut pas dépasser 2000 caractères' })
  content: string;

  @ApiPropertyOptional({
    description: 'ID du commentaire parent pour une réponse',
    example: 'comment_123'
  })
  @IsString()
  @IsOptional()
  parentId?: string;
}

/**
 * DTO pour créer un post
 */
export class CreatePostDto {
  @ApiPropertyOptional({
    description: 'Titre du post (optionnel)',
    example: 'Getting Started with React Hooks',
    minLength: 2,
    maxLength: 200
  })
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Le titre doit contenir au moins 2 caractères', always: false })
  @MaxLength(200, { message: 'Le titre ne peut pas dépasser 200 caractères' })
  title?: string;

  @ApiProperty({
    description: 'Contenu principal du post',
    example: 'React Hooks have revolutionized how we write React components. In this post, I\'ll share my experience and best practices...',
    maxLength: 10000
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000, { message: 'Le contenu ne peut pas dépasser 10000 caractères' })
  content: string;

  @ApiPropertyOptional({
    description: 'Extrait du post (optionnel)',
    example: 'Learn the fundamentals of React Hooks and how they can simplify your code.',
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'L\'extrait ne peut pas dépasser 500 caractères' })
  excerpt?: string;

  @ApiPropertyOptional({
    description: 'URL de l\'image miniature du post',
    example: 'https://example.com/thumbnail.jpg'
  })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'L\'URL de l\'image miniature doit être valide' })
  thumbnail?: string;

  @ApiProperty({
    description: 'ID de la communauté',
    example: 'community_123'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiPropertyOptional({
    description: 'Tags du post',
    example: ['react', 'hooks', 'javascript'],
    maxItems: 10
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Maximum 10 tags autorisés' })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'URLs des images attachées au post',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    maxItems: 10
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Maximum 10 images autorisées' })
  images?: string[];

  @ApiPropertyOptional({
    description: 'URLs des vidéos attachées au post',
    example: ['https://example.com/video1.mp4'],
    maxItems: 5
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(5, { message: 'Maximum 5 vidéos autorisées' })
  videos?: string[];

  @ApiPropertyOptional({
    description: 'Liens attachés au post',
    example: [{ url: 'https://example.com', title: 'Example Site', description: 'An example website' }],
    maxItems: 5
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(5, { message: 'Maximum 5 liens autorisés' })
  @ValidateNested({ each: true })
  @Type(() => PostLinkDto)
  links?: PostLinkDto[];
}
