import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum MuteTargetDto {
  THREAD = 'thread',
  USER = 'user',
  COMMUNITY = 'community',
}

export class CreateNotificationMuteDto {
  @ApiProperty({ enum: MuteTargetDto })
  @IsEnum(MuteTargetDto)
  targetType: string;

  @ApiProperty({ description: 'ID of target (postId, conversationId, senderId, communityId)' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 date when the mute expires' })
  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}
