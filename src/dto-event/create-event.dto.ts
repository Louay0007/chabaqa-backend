import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum, IsBoolean, IsArray, IsNumber, Min, Max, MaxLength, MinLength, IsUrl, ArrayMaxSize } from 'class-validator';

/**
 * DTO pour créer une session d'événement
 */
export class CreateEventSessionDto {
  @ApiProperty({
    description: 'Titre de la session',
    example: 'Keynote: The Future of AI',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Le titre de la session ne peut pas dépasser 200 caractères' })
  title: string;

  @ApiProperty({
    description: 'Description de la session',
    example: 'Opening keynote discussing emerging trends in artificial intelligence',
    maxLength: 1000
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'La description ne peut pas dépasser 1000 caractères' })
  description: string;

  @ApiProperty({
    description: 'Heure de début',
    example: '09:00'
  })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Heure de fin',
    example: '10:30'
  })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty({
    description: 'Nom du conférencier',
    example: 'Dr. Rebecca Miller',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Le nom du conférencier ne peut pas dépasser 100 caractères' })
  speaker: string;

  @ApiPropertyOptional({
    description: 'Notes additionnelles',
    example: 'Need 30 laptops for workshop',
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Les notes ne peuvent pas dépasser 500 caractères' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Indique si la session est active',
    example: true,
    default: true
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Nombre d\'assistants',
    example: 85,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Le nombre d\'assistants doit être positif' })
  attendance?: number;
}

/**
 * DTO pour créer un billet d'événement
 */
export class CreateEventTicketDto {
  @ApiProperty({
    description: 'Type de billet',
    example: 'regular',
    enum: ['regular', 'vip', 'early-bird', 'student', 'free']
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['regular', 'vip', 'early-bird', 'student', 'free'], {
    message: 'Le type de billet doit être valide'
  })
  type: 'regular' | 'vip' | 'early-bird' | 'student' | 'free';

  @ApiProperty({
    description: 'Nom du billet',
    example: 'General Admission',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Le nom du billet ne peut pas dépasser 100 caractères' })
  name: string;

  @ApiProperty({
    description: 'Prix du billet',
    example: 99.99,
    minimum: 0
  })
  @IsNumber()
  @Min(0, { message: 'Le prix doit être positif' })
  price: number;

  @ApiProperty({
    description: 'Description du billet',
    example: 'Access to all sessions and lunch included',
    maxLength: 500
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'La description ne peut pas dépasser 500 caractères' })
  description: string;

  @ApiPropertyOptional({
    description: 'Quantité disponible (optionnel pour illimité)',
    example: 100,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'La quantité doit être positive' })
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Nombre de billets vendus',
    example: 0,
    minimum: 0,
    default: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Le nombre de billets vendus doit être positif' })
  sold?: number;
}

/**
 * DTO pour créer un conférencier d'événement
 */
export class CreateEventSpeakerDto {
  @ApiProperty({
    description: 'Nom du conférencier',
    example: 'Dr. Rebecca Miller',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Le nom du conférencier ne peut pas dépasser 100 caractères' })
  name: string;

  @ApiProperty({
    description: 'Titre du conférencier',
    example: 'Chief Technology Officer at TechCorp',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Le titre ne peut pas dépasser 200 caractères' })
  title: string;

  @ApiProperty({
    description: 'Biographie du conférencier',
    example: 'Expert in AI and machine learning with 15 years of industry experience',
    maxLength: 1000
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'La biographie ne peut pas dépasser 1000 caractères' })
  bio: string;

  @ApiPropertyOptional({
    description: 'Photo du conférencier',
    example: 'https://example.com/speaker-photo.jpg'
  })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'L\'URL de la photo doit être valide' })
  photo?: string;
}

/**
 * DTO pour créer un événement
 */
export class CreateEventDto {
  @ApiProperty({
    description: 'ID de la communauté',
    example: 'community_123'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    description: 'Titre de l\'événement',
    example: 'Tech Conference 2023',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Le titre ne peut pas dépasser 200 caractères' })
  title: string;

  @ApiProperty({
    description: 'Description de l\'événement',
    example: 'Annual technology conference featuring the latest innovations in software development and AI',
    maxLength: 2000
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
  description: string;

  @ApiProperty({
    description: 'Date de début',
    example: '2024-02-15'
  })
  @IsDateString({}, { message: 'La date de début doit être au format ISO' })
  startDate: string;

  @ApiPropertyOptional({
    description: 'Date de fin',
    example: '2024-02-17'
  })
  @IsDateString({}, { message: 'La date de fin doit être au format ISO' })
  @IsOptional()
  endDate?: string;

  @ApiProperty({
    description: 'Heure de début',
    example: '09:00'
  })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Heure de fin',
    example: '18:00'
  })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty({
    description: 'Fuseau horaire',
    example: 'EST',
    maxLength: 50
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: 'Le fuseau horaire ne peut pas dépasser 50 caractères' })
  timezone: string;

  @ApiProperty({
    description: 'Lieu de l\'événement',
    example: 'New York Convention Center',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Le lieu ne peut pas dépasser 200 caractères' })
  location: string;

  @ApiPropertyOptional({
    description: 'URL en ligne (pour événements en ligne/hybrides)',
    example: 'https://example.com/tech-conf-2023'
  })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'L\'URL en ligne doit être valide' })
  onlineUrl?: string;

  @ApiProperty({
    description: 'Catégorie de l\'événement',
    example: 'Technology',
    maxLength: 50
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: 'La catégorie ne peut pas dépasser 50 caractères' })
  category: string;

  @ApiProperty({
    description: 'Type d\'événement',
    example: 'Hybrid',
    enum: ['In-person', 'Online', 'Hybrid']
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['In-person', 'Online', 'Hybrid'], {
    message: 'Le type d\'événement doit être valide'
  })
  type: 'In-person' | 'Online' | 'Hybrid';

  @ApiPropertyOptional({
    description: 'Notes sur l\'événement',
    example: 'Keynote speaker needs green room with bottled water and vegan meal option',
    maxLength: 1000
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Les notes ne peuvent pas dépasser 1000 caractères' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Image de l\'événement',
    example: 'https://example.com/event-image.jpg'
  })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'L\'URL de l\'image doit être valide' })
  image?: string;

  @ApiPropertyOptional({
    description: 'Sessions de l\'événement',
    type: [CreateEventSessionDto]
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50, { message: 'Il ne peut pas y avoir plus de 50 sessions' })
  sessions?: CreateEventSessionDto[];

  @ApiPropertyOptional({
    description: 'Billets de l\'événement',
    type: [CreateEventTicketDto]
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20, { message: 'Il ne peut pas y avoir plus de 20 types de billets' })
  tickets?: CreateEventTicketDto[];

  @ApiPropertyOptional({
    description: 'Conférenciers de l\'événement',
    type: [CreateEventSpeakerDto]
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50, { message: 'Il ne peut pas y avoir plus de 50 conférenciers' })
  speakers?: CreateEventSpeakerDto[];

  @ApiPropertyOptional({
    description: 'Tags de l\'événement',
    example: ['technology', 'ai', 'conference'],
    maxItems: 10
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Il ne peut pas y avoir plus de 10 tags' })
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Indique si l\'événement est actif',
    example: true,
    default: true
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Indique si l\'événement est publié',
    example: false,
    default: false
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
