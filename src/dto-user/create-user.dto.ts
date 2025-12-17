import { IsString, IsEmail, IsNotEmpty, MinLength, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
    minLength: 3,
    maxLength: 100
  })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est requis' })
  @MinLength(3, { message: 'Le nom doit contenir au moins 3 caractères' })
  readonly name: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email'
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  readonly email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePassword123!',
    minLength: 8,
    maxLength: 128
  })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  readonly password: string;

  @ApiProperty({
    description: 'User role in the system',
    example: 'user',
    enum: ['user', 'creator', 'admin'],
    default: 'user'
  })
  @IsString({ message: 'Le rôle doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le rôle est requis' })
  @IsEnum(['user', 'creator', 'admin'], { message: 'Le rôle doit être user, creator ou admin' })
  readonly role: string;

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890',
    maxLength: 20
  })
  @IsOptional()
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères' })
  readonly numtel?: string;

  @ApiPropertyOptional({
    description: 'User birth date',
    example: '1990-01-15',
    format: 'date'
  })
  @IsOptional()
  @IsDateString({}, { message: 'La date de naissance doit être au format ISO 8601' })
  readonly date_naissance?: string;

  @ApiPropertyOptional({
    description: 'User gender',
    example: 'male',
    enum: ['male', 'female', 'other']
  })
  @IsOptional()
  @IsString({ message: 'Le sexe doit être une chaîne de caractères' })
  @IsEnum(['male', 'female', 'other'], { message: 'Le sexe doit être male, female ou other' })
  readonly sexe?: string;

  @ApiPropertyOptional({
    description: 'User country',
    example: 'Tunisia',
    maxLength: 100
  })
  @IsOptional()
  @IsString({ message: 'Le pays doit être une chaîne de caractères' })
  readonly pays?: string;

  @ApiPropertyOptional({
    description: 'User city',
    example: 'Tunis',
    maxLength: 100
  })
  @IsOptional()
  @IsString({ message: 'La ville doit être une chaîne de caractères' })
  readonly ville?: string;

  @ApiPropertyOptional({
    description: 'User postal code',
    example: '1000',
    maxLength: 20
  })
  @IsOptional()
  @IsString({ message: 'Le code postal doit être une chaîne de caractères' })
  readonly code_postal?: string;

  @ApiPropertyOptional({
    description: 'User address',
    example: '123 Main Street, Downtown',
    maxLength: 200
  })
  @IsOptional()
  @IsString({ message: 'L\'adresse doit être une chaîne de caractères' })
  readonly adresse?: string;

  @ApiPropertyOptional({
    description: 'User profile picture URL',
    example: 'https://example.com/profile-picture.jpg',
    format: 'uri'
  })
  @IsOptional()
  @IsString({ message: 'La photo de profil doit être une chaîne de caractères' })
  readonly photo_profil?: string;

  @ApiPropertyOptional({
    description: 'User biography or description',
    example: 'Passionate developer with 5 years of experience in web development.',
    maxLength: 500
  })
  @IsOptional()
  @IsString({ message: 'La bio doit être une chaîne de caractères' })
  readonly bio?: string;

  @ApiPropertyOptional({
    description: 'User Instagram profile link',
    example: 'https://instagram.com/johndoe',
    format: 'uri'
  })
  @IsOptional()
  @IsString({ message: 'Le lien Instagram doit être une chaîne de caractères' })
  readonly lien_instagram?: string;
}