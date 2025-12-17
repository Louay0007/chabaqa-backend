
import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  recipient: string;

  @ApiProperty({ required: false })
  @IsMongoId()
  @IsOptional()
  sender?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
