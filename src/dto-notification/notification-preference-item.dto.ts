import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ItemChannelPreferencesDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  inApp?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  push?: boolean;
}

export class UpsertNotificationPreferenceItemDto {
  @ApiPropertyOptional({ description: 'Community ID for per-community override, omit for global' })
  @IsMongoId()
  @IsOptional()
  communityId?: string | null;

  @ApiProperty({ description: 'Notification type, e.g. post_mention' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ItemChannelPreferencesDto)
  channels: ItemChannelPreferencesDto;
}

export class BulkUpsertPreferenceItemsDto {
  @ApiProperty({ type: [UpsertNotificationPreferenceItemDto] })
  @ValidateNested({ each: true })
  @Type(() => UpsertNotificationPreferenceItemDto)
  items: UpsertNotificationPreferenceItemDto[];
}
