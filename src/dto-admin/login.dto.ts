import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({
    description: 'Admin email address',
    example: 'admin@shabaka.com',
    format: 'email'
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  email: string;

  @ApiProperty({
    description: 'Admin password',
    example: 'adminpassword123',
    minLength: 8
  })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;

  @ApiPropertyOptional({
    description: 'Remember me option for extended session duration',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean({ message: 'Remember me doit être un booléen' })
  remember_me?: boolean;
} 
