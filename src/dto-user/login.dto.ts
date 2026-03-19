import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email'
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    minLength: 8
  })
  @Transform(({ value }) => (typeof value === 'string' ? value : String(value ?? '')))
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;

  @ApiPropertyOptional({
    description: 'Remember me option for extended session duration',
    example: false,
    default: false
  })
  @Transform(({ value, obj }) => {
    if (typeof value === 'boolean') return value;
    if (typeof obj?.rememberMe === 'boolean') return obj.rememberMe;
    return value;
  })
  @IsOptional()
  @IsBoolean({ message: 'Remember me doit être un booléen' })
  remember_me?: boolean;
} 
