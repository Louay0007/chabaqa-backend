import { ApiProperty } from '@nestjs/swagger';

/**
 * Normalized course session state returned to the frontend.
 * This is the single source of truth for chapter access and progression.
 */
export class ChapterSessionDto {
  @ApiProperty() chapterId: string;
  @ApiProperty() chapterTitle: string;
  @ApiProperty() sectionId: string;
  @ApiProperty() sectionTitle: string;
  @ApiProperty() index: number;
  @ApiProperty() isPreview: boolean;
  @ApiProperty() isPaidChapter: boolean;
  @ApiProperty() isCompleted: boolean;
  @ApiProperty() watchTime: number;
  @ApiProperty() videoDuration: number;
  @ApiProperty() canAccess: boolean;
  @ApiProperty() lockCode: string;
  @ApiProperty({ required: false }) lockReason?: string;
  @ApiProperty({ required: false }) needsPayment?: boolean;
  @ApiProperty({ required: false }) chapterPrice?: number;
  @ApiProperty({ required: false }) requiredChapterId?: string;
}

export class NextChapterActionDto {
  @ApiProperty({ enum: ['navigate', 'blocked', 'course_complete'] })
  action: 'navigate' | 'blocked' | 'course_complete';

  @ApiProperty({ required: false }) chapterId?: string;
  @ApiProperty({ required: false }) chapterTitle?: string;
  @ApiProperty({ required: false }) sectionId?: string;
  @ApiProperty({ required: false }) lockCode?: string;
  @ApiProperty({ required: false }) reason?: string;
  @ApiProperty({ required: false }) needsPayment?: boolean;
  @ApiProperty({ required: false }) chapterPrice?: number;
  @ApiProperty({ required: false }) requiredChapterId?: string;
}

export class CourseSessionDto {
  @ApiProperty() courseId: string;
  @ApiProperty() isEnrolled: boolean;
  @ApiProperty() sequentialProgressionEnabled: boolean;
  @ApiProperty({ required: false }) unlockMessage?: string;

  @ApiProperty() progressPercent: number;
  @ApiProperty() completedChapters: number;
  @ApiProperty() totalChapters: number;

  @ApiProperty({ type: [ChapterSessionDto] })
  chapters: ChapterSessionDto[];

  @ApiProperty({ type: NextChapterActionDto, required: false })
  nextChapterAction?: NextChapterActionDto;
}
