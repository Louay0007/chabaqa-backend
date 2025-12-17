import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2FADto {
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
  @Length(6, 6, { message: 'Le code de vérification doit contenir exactement 6 chiffres' })
  verificationCode: string;
} 