import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendEmailOtpDto {
  @ApiProperty({
    description: 'User email address to resend OTP',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @IsNotEmpty({ message: "L'email est requis" })
  email: string;
}
