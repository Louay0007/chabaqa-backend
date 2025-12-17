import { IsEmail, IsNotEmpty, IsString, MinLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email'
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  email: string;

  @ApiProperty({
    description: '6-digit verification code sent to user email',
    example: '123456',
    minLength: 6,
    maxLength: 6
  })
  @IsString({ message: 'Le code de vérification doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le code de vérification est requis' })
  @Length(6, 6, { message: 'Le code de vérification doit contenir exactement 6 caractères' })
  verificationCode: string;

  @ApiProperty({
    description: 'New password for the user account',
    example: 'NewSecurePassword123!',
    minLength: 8,
    maxLength: 128
  })
  @IsString({ message: 'Le nouveau mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nouveau mot de passe est requis' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  newPassword: string;
} 