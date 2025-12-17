import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength, IsOptional, IsDateString } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', description: 'User\'s full name' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'user@example.com', description: 'User\'s email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User\'s password (at least 8 characters)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: '1234567890', description: 'User\'s phone number', required: false })
  @IsOptional()
  @IsString()
  numtel?: string;

  @ApiProperty({ example: '1990-01-01', description: 'User\'s date of birth', required: false })
  @IsOptional()
  @IsDateString()
  date_naissance?: string;
}
