import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ConsentType } from '../../schema/consent-record.schema';

export class RecordConsentDto {
  @ApiProperty({ enum: ConsentType })
  @IsEnum(ConsentType)
  consentType: ConsentType;

  @ApiProperty({ required: false, default: '1.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty()
  @IsBoolean()
  granted: boolean;
}
