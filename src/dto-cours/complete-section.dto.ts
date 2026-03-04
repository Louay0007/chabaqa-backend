import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CompleteSectionDto {
  @IsOptional()
  @IsBoolean()
  forceComplete?: boolean; // Deprecated: ignored/blocked for user endpoints.
}

export class CompleteSectionResponseDto {
  success: boolean;
  message: string;
  sectionId: string;
  courseId: string;
  isCompleted: boolean;
  chaptersCompleted: number;
  totalChapters: number;
  completionPercentage: number;
  completedAt?: Date;
  courseJustCompleted?: boolean;
}
