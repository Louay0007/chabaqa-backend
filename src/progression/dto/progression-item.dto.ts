import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export class ProgressionActionDto {
  @ApiProperty()
  view: string;

  @ApiPropertyOptional()
  continue?: string;
}

export class ProgressionCommunityDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  slug?: string;
}

export class ProgressionItemDto {
  @ApiProperty()
  contentId: string;

  @ApiProperty({ enum: TrackableContentType })
  contentType: TrackableContentType;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  thumbnail?: string;

  @ApiProperty({ enum: ['not_started', 'in_progress', 'completed'] })
  status: 'not_started' | 'in_progress' | 'completed';

  @ApiPropertyOptional()
  progressPercent?: number;

  @ApiPropertyOptional()
  lastAccessedAt?: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiPropertyOptional({ type: () => ProgressionCommunityDto })
  community?: ProgressionCommunityDto;

  @ApiPropertyOptional({ type: Object })
  meta?: Record<string, any>;

  @ApiPropertyOptional({ type: () => ProgressionActionDto })
  actions?: ProgressionActionDto;
}

export class ProgressionSummaryByTypeDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  completed: number;
}

export class ProgressionSummaryDto {
  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  completed: number;

  @ApiProperty()
  inProgress: number;

  @ApiProperty()
  notStarted: number;

  @ApiProperty({ type: Object })
  byType: Record<string, ProgressionSummaryByTypeDto>;
}

export class ProgressionPaginationDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class ProgressionOverviewDto {
  @ApiProperty({ type: () => ProgressionSummaryDto })
  summary: ProgressionSummaryDto;

  @ApiProperty({ type: () => ProgressionPaginationDto })
  pagination: ProgressionPaginationDto;

  @ApiProperty({ type: () => [ProgressionItemDto] })
  items: ProgressionItemDto[];
}

