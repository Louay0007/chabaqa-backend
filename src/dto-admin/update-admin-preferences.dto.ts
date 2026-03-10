import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAdminPreferencesDto {
  @ApiPropertyOptional({
    description: 'Preferred theme',
    enum: ['light', 'dark', 'system'],
    example: 'system',
  })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @ApiPropertyOptional({
    description: 'Preferred locale',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({
    description: 'Preferred timezone',
    example: 'UTC',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Enable email notifications for admin events',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

