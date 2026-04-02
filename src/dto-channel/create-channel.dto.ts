import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ enum: ['TEXT', 'ANNOUNCEMENTS'] })
  @IsString()
  @IsOptional()
  @IsEnum(['TEXT', 'ANNOUNCEMENTS'])
  type?: 'TEXT' | 'ANNOUNCEMENTS';

  @ApiPropertyOptional({ enum: ['PUBLIC', 'PRIVATE'] })
  @IsString()
  @IsOptional()
  @IsEnum(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  emoji?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedRoles?: string[];
}
