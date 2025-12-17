
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChannelPreferencesDto {
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

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  sms?: boolean;
}

class QuietHoursDto {
  @ApiProperty({ example: '22:00', required: false })
  @IsString()
  @IsOptional()
  start?: string;

  @ApiProperty({ example: '08:00', required: false })
  @IsString()
  @IsOptional()
  end?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: 'object', additionalProperties: { $ref: '#/components/schemas/ChannelPreferencesDto' } })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChannelPreferencesDto)
  preferences?: Map<string, ChannelPreferencesDto>;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;
}
