import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsNumber, IsArray, IsString, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateScoringWeightsDto {
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() postLikeReceived?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() commentLikeReceived?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() postCreated?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() commentCreated?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() courseCompleted?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() challengeTaskApproved?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() challengeCompleted?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() dailyLoginStreak?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() weeklyStreakBonus?: number;
}

export class UpdateDailyCapsDto {
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() postCreated?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() commentCreated?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() postLikeReceived?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() commentLikeReceived?: number;
}

export class LevelThresholdDto {
  @ApiProperty() @IsNumber() level: number;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() minPoints: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() icon?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() color?: string;
}

export class UnlockRuleDto {
  @ApiProperty() @IsNumber() level: number;
  @ApiProperty() @IsString() targetType: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() targetId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
}

export class UpdateGamificationConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  publicLeaderboard?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  scoringWeights?: UpdateScoringWeightsDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  dailyCaps?: UpdateDailyCapsDto;

  @ApiProperty({ required: false, type: [LevelThresholdDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LevelThresholdDto)
  levelThresholds?: LevelThresholdDto[];

  @ApiProperty({ required: false, type: [UnlockRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnlockRuleDto)
  unlockRules?: UnlockRuleDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  cooldownSeconds?: number;
}
