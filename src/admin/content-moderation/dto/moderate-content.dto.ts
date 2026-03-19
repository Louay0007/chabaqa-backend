import { IsString, IsOptional, IsArray, IsEnum, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus, ModerationReason } from '../../schemas/content-moderation-queue.schema';

/**
 * DTO for moderating individual content items
 */
export class ModerateContentDto {
  @ApiProperty({ 
    description: 'Moderation action to take',
    enum: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED, ModerationStatus.ESCALATED]
  })
  @IsEnum([ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED, ModerationStatus.ESCALATED])
  action: string;

  @ApiPropertyOptional({ 
    description: 'Review notes from the moderator',
    minLength: 5,
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reviewNotes?: string;

  @ApiPropertyOptional({ 
    description: 'Reasons for rejection or flagging',
    enum: ModerationReason,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ModerationReason, { each: true })
  rejectionReasons?: ModerationReason[];

  @ApiPropertyOptional({ 
    description: 'Escalation reason (required when action is ESCALATED)',
    minLength: 10,
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  escalationReason?: string;

  @ApiPropertyOptional({ 
    description: 'Additional tags for categorization',
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * DTO for bulk moderation operations
 */
export class BulkModerateContentDto {
  @ApiProperty({ 
    description: 'Array of content moderation queue item IDs',
    isArray: true
  })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];

  @ApiProperty({ 
    description: 'Moderation action to apply to all items',
    enum: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED]
  })
  @IsEnum([ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED])
  action: string;

  @ApiPropertyOptional({ 
    description: 'Review notes to apply to all items',
    minLength: 5,
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reviewNotes?: string;

  @ApiPropertyOptional({ 
    description: 'Reasons for rejection or flagging (applies to all items)',
    enum: ModerationReason,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ModerationReason, { each: true })
  rejectionReasons?: ModerationReason[];
}

/**
 * DTO for updating content priority
 */
export class UpdateContentPriorityDto {
  @ApiProperty({ 
    description: 'New priority level for the content',
    enum: ['low', 'normal', 'high', 'urgent']
  })
  @IsEnum(['low', 'normal', 'high', 'urgent'])
  priority: string;

  @ApiPropertyOptional({ 
    description: 'Reason for priority change',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * DTO for assigning content to moderator
 */
export class AssignContentDto {
  @ApiProperty({ 
    description: 'Admin user ID to assign the content to'
  })
  @IsString()
  moderatorId: string;

  @ApiPropertyOptional({ 
    description: 'Assignment notes',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}