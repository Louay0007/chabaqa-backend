import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class StartChapterDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  watchTime?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StartChapterResponseDto {
  success: boolean;
  message: string;
  enrollmentId: string;
  chapterId: string;
  progress: {
    isCompleted: boolean;
    watchTime: number;
    lastAccessedAt: Date;
  };
}
