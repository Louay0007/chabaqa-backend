import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CompleteSectionDto {
  @IsOptional()
  @IsBoolean()
  forceComplete?: boolean; // Option pour forcer la completion même si tous les chapitres ne sont pas terminés
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
}
