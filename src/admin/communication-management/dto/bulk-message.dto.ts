import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
  MinLength,
  MaxLength,
  IsMongoId,
} from 'class-validator';
import { AudienceTargetType } from './create-email-campaign.dto';

export enum MessageChannel {
  EMAIL = 'email',
  IN_APP = 'in_app',
  BOTH = 'both',
}

export class BulkMessageDto {
  @ApiProperty({
    description: 'Message title',
    example: 'Important Platform Update',
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Message content',
    example: 'We have released new features that you might find useful.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Message delivery channel',
    enum: MessageChannel,
    example: MessageChannel.BOTH,
  })
  @IsEnum(MessageChannel)
  channel: string;

  @ApiProperty({
    description: 'Audience targeting type',
    enum: AudienceTargetType,
    example: AudienceTargetType.ALL_USERS,
  })
  @IsEnum(AudienceTargetType)
  audienceTarget: string;

  @ApiPropertyOptional({
    description: 'Community ID for community-specific messages',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  communityId?: string;

  @ApiPropertyOptional({
    description: 'Specific user IDs to target',
    type: [String],
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  specificUserIds?: string[];

  @ApiPropertyOptional({
    description: 'User roles to target',
    type: [String],
    example: ['creator', 'member'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @ApiPropertyOptional({
    description: 'Personalization variables',
    example: { userName: '{{name}}', communityName: '{{community}}' },
  })
  @IsOptional()
  @IsObject()
  personalizationVariables?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { priority: 'high', category: 'system_update' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
