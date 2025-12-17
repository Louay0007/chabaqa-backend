import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminForgotPasswordDto {
  @ApiProperty({
    description: 'Admin email address for password reset',
    example: 'admin@shabaka.com',
    format: 'email'
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @IsNotEmpty({ message: 'L\'email est requis' })
  email: string;
} 