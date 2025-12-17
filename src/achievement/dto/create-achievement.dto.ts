import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional, IsBoolean, IsEnum, IsNumber, IsArray } from 'class-validator';
import { AchievementCriteriaType } from '../../schema/achievement.schema';

export class CreateAchievementDto {
  @ApiProperty({ example: 'Course Master' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Complete 10 courses to earn this badge' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'trophy-gold', required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({
    example: { type: 'count_completed', contentType: 'course', count: 10 }
  })
  @IsObject()
  criteria: any; // Will be validated in service

  @ApiProperty({ example: '507f1f77bcf86cd799439011', required: false })
  @IsOptional()
  @IsString()
  communityId?: string;

  @ApiProperty({ example: 'rare', enum: ['common', 'rare', 'epic', 'legendary'], required: false })
  @IsOptional()
  @IsString()
  rarity?: string;

  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @IsNumber()
  points?: number;

  @ApiProperty({ example: ['learning', 'engagement'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  order?: number;
}