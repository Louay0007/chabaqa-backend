import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsObject, IsEnum } from 'class-validator';
import { GamificationEventType } from '../../schema/gamification-event.schema';

export class RecordGamificationEventDto {
  @ApiProperty({ enum: GamificationEventType })
  @IsEnum(GamificationEventType)
  eventType: GamificationEventType;

  @ApiProperty()
  @IsString()
  actorUserId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recipientUserId?: string;

  @ApiProperty()
  @IsString()
  communityId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  pointsOverride?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
