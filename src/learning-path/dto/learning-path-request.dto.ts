import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class LearningPathRequestDto {
  @IsString()
  @IsNotEmpty()
  goals: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  communityId?: string;
}
