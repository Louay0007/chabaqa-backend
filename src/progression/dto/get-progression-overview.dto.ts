import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetProgressionOverviewDto {
  @ApiPropertyOptional({
    description: 'Comma separated list of content types (course,challenge,session,event,product,post)',
    example: 'course,challenge,post',
  })
  @IsOptional()
  @IsString()
  contentTypes?: string;

  @ApiPropertyOptional({ default: 1 })
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 1))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Community ID to filter progression',
  })
  @IsOptional()
  @IsString()
  communityId?: string;

  @ApiPropertyOptional({
    description: 'Community slug to filter progression',
  })
  @IsOptional()
  @IsString()
  communitySlug?: string;
}

