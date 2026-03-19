import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ApprovalAction {
  APPROVE = 'approve',
  REJECT = 'reject'
}

export class ApproveCommunityDto {
  @ApiProperty({ description: 'Optional approval notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectCommunityDto {
  @ApiProperty({ description: 'Reason for rejection', minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;

  @ApiProperty({ description: 'Optional additional notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BulkCommunityApprovalDto {
  @ApiProperty({ description: 'Array of community IDs to process', type: [String] })
  @IsString({ each: true })
  communityIds: string[];

  @ApiProperty({ enum: ApprovalAction, description: 'Action to perform on all communities' })
  @IsEnum(ApprovalAction)
  action: string;

  @ApiProperty({ description: 'Reason for bulk action (required for rejection)', required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ description: 'Optional notes for bulk action' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CommunityModerationDto {
  @ApiProperty({ description: 'Set featured status', required: false })
  @IsOptional()
  featured?: boolean;

  @ApiProperty({ description: 'Set verified status', required: false })
  @IsOptional()
  verified?: boolean;

  @ApiProperty({ description: 'Set active status', required: false })
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ description: 'Admin notes', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;

  @ApiProperty({ description: 'Reason for moderation action' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}