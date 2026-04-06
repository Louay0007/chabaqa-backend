import { ApiProperty } from '@nestjs/swagger';

export class GamificationProfileDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  communityId: string;

  @ApiProperty()
  totalPoints: number;

  @ApiProperty()
  weeklyPoints: number;

  @ApiProperty()
  level: number;

  @ApiProperty()
  levelName: string;

  @ApiProperty()
  nextLevelName: string;

  @ApiProperty()
  nextLevelPoints: number;

  @ApiProperty()
  pointsToNextLevel: number;

  @ApiProperty()
  levelProgress: number;

  @ApiProperty()
  streakCurrent: number;

  @ApiProperty()
  streakBest: number;

  @ApiProperty()
  rank: number;

  @ApiProperty()
  totalPostsCreated: number;

  @ApiProperty()
  totalCommentsCreated: number;

  @ApiProperty()
  totalLikesReceived: number;

  @ApiProperty()
  totalCoursesCompleted: number;

  @ApiProperty()
  totalChallengesCompleted: number;
}

export class LeaderboardEntryDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  userAvatar: string;

  @ApiProperty()
  totalPoints: number;

  @ApiProperty()
  weeklyPoints: number;

  @ApiProperty()
  level: number;

  @ApiProperty()
  levelName: string;

  @ApiProperty()
  streakCurrent: number;
}

export class LeaderboardResponseDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  entries: LeaderboardEntryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  period: string;

  @ApiProperty({ required: false })
  currentUserRank?: number;

  @ApiProperty({ required: false })
  isPrivate?: boolean;
}
