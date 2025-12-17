import { ApiProperty } from '@nestjs/swagger';
import { AchievementCriteriaType } from '../../schema/achievement.schema';

export class AchievementResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ required: false })
  icon?: string;

  @ApiProperty()
  criteria: any;

  @ApiProperty({ required: false })
  communityId?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  rarity?: string;

  @ApiProperty({ required: false })
  points?: number;

  @ApiProperty({ required: false })
  tags?: string[];

  @ApiProperty({ required: false })
  order?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UserAchievementResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  achievementId: string;

  @ApiProperty()
  communityId: string;

  @ApiProperty()
  earnedAt: Date;

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty({ required: false })
  sharedAt?: Date;

  @ApiProperty()
  achievement?: AchievementResponseDto;
}

export class AchievementWithProgressDto extends AchievementResponseDto {
  @ApiProperty()
  isUnlocked: boolean;

  @ApiProperty({ required: false })
  progress?: number; // 0-100

  @ApiProperty({ required: false })
  currentValue?: number;

  @ApiProperty({ required: false })
  targetValue?: number;

  @ApiProperty({ required: false })
  earnedAt?: Date;

  @ApiProperty({ required: false })
  userAchievementId?: string;
}