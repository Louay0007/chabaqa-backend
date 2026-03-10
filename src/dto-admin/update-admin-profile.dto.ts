import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminProfileDto {
  @ApiPropertyOptional({
    description: 'Updated admin display name',
    example: 'Platform Administrator',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated admin email',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

