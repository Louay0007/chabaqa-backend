import { IsString, IsOptional, IsBoolean, IsEnum, IsDate } from 'class-validator';
import { ContentStatus } from '../enums/content-status.enum';

export class ApproveContentDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectContentDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class FeatureContentDto {
  @IsBoolean()
  featured: boolean;
}

export class SuspendContentDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkContentActionDto {
  @IsString({ each: true })
  ids: string[];

  @IsEnum(ContentStatus)
  action: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ModerateContentDto {
  @IsEnum(['hide', 'delete', 'restore'])
  action: 'hide' | 'delete' | 'restore';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class MessageAttendeesDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean = true;
}

export class ApproveSubmissionDto {
  @IsOptional()
  @IsString()
  feedback?: string;

  @IsOptional()
  @IsBoolean()
  markAsWinner?: boolean;
}

export class RejectSubmissionDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
