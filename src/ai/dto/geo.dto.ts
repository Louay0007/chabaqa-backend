import { IsString, IsOptional, IsEnum, IsInt, IsArray, Min, Max } from 'class-validator';

export type GeoDifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export class AskGeoQuestionDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced', 'expert'])
  difficultyLevel?: GeoDifficultyLevel;
}

export class GenerateQuizDto {
  @IsEnum(['beginner', 'intermediate', 'advanced', 'expert'])
  difficultyLevel: GeoDifficultyLevel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  questionCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionTypes?: string[];
}

export class SubmitQuizDto {
  @IsArray()
  answers: { questionId: string; answer: string }[];
}

export class GetExplanationDto {
  @IsString()
  topic: string;

  @IsEnum(['beginner', 'intermediate', 'advanced', 'expert'])
  difficultyLevel: GeoDifficultyLevel;
}

export class UpdateDifficultyDto {
  @IsEnum(['beginner', 'intermediate', 'advanced', 'expert'])
  difficultyLevel: GeoDifficultyLevel;
}
