import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
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
    description: 'Confirmation text. Must be exactly DELETE',
    example: 'DELETE',
  })
  @IsString({ message: 'Le texte de confirmation doit etre une chaine de caracteres' })
  @IsNotEmpty({ message: 'Le texte de confirmation est requis' })
  confirmText: string;
}
