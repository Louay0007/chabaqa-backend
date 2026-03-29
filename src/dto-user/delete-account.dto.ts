import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: 'Current account password (required for users with a local password)',
    example: 'CurrentSecurePassword123!',
    minLength: 8,
  })
  @IsOptional()
  @IsString({ message: 'Le mot de passe actuel doit etre une chaine de caracteres' })
  @ValidateIf((o) => o.currentPassword !== undefined && o.currentPassword !== '')
  @MinLength(8, { message: 'Le mot de passe actuel doit contenir au moins 8 caracteres' })
  currentPassword?: string;

  @ApiProperty({
    description: 'Confirmation text. Must be exactly DELETE',
    example: 'DELETE',
  })
  @IsString({ message: 'Le texte de confirmation doit etre une chaine de caracteres' })
  @IsNotEmpty({ message: 'Le texte de confirmation est requis' })
  confirmText: string;
}
