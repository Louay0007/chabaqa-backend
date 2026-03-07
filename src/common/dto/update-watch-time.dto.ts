import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateTotalWatchTimeDto {
  @ApiProperty({
    description: 'Total accepted watch time in seconds',
    minimum: 0,
    example: 125,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  watchTime: number;

  @ApiPropertyOptional({
    description: 'Client-observed media duration in seconds. Used only when backend duration is missing.',
    minimum: 1,
    example: 1800,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  videoDuration?: number;
}

export class UpdateIncrementalWatchTimeDto {
  @ApiProperty({
    description: 'Additional watch time in seconds since the last accepted heartbeat',
    minimum: 0,
    example: 15,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  additionalTime: number;
}
