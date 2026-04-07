import { IsString, IsOptional, IsEnum } from 'class-validator';

export class TriggerTranscriptionDto {
  @IsString()
  chapterId: string;

  @IsString()
  courseId: string;

  @IsOptional()
  @IsEnum(['ar', 'fr', 'en', 'auto'])
  language?: 'ar' | 'fr' | 'en' | 'auto';
}
