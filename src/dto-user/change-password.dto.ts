import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current account password',
    example: 'CurrentSecurePassword123!',
    minLength: 8,
  })
  @IsString({ message: 'Le mot de passe actuel doit etre une chaine de caracteres' })
  @IsNotEmpty({ message: 'Le mot de passe actuel est requis' })
  @MinLength(8, { message: 'Le mot de passe actuel doit contenir au moins 8 caracteres' })
  currentPassword: string;

  @ApiProperty({
    description: 'New account password',
    example: 'NewSecurePassword123!',
    minLength: 8,
  })
  @IsString({ message: 'Le nouveau mot de passe doit etre une chaine de caracteres' })
  @IsNotEmpty({ message: 'Le nouveau mot de passe est requis' })
  @MinLength(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caracteres' })
  newPassword: string;
}
