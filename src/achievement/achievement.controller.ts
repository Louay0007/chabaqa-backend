import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AchievementService } from './achievement.service';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { AchievementResponseDto, UserAchievementResponseDto, AchievementWithProgressDto } from './dto/achievement-response.dto';

@ApiTags('Achievements')
@Controller('achievements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new achievement',
    description: 'Create a new achievement template for a community or globally',
  })
  async create(@Body() createDto: CreateAchievementDto): Promise<AchievementResponseDto> {
    return this.achievementService.create(createDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get achievements for a community',
    description: 'Get all active achievements available in a community (including global ones)',
  })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Community slug to filter achievements' })
  async getAchievements(@Query('communitySlug') communitySlug?: string): Promise<AchievementResponseDto[]> {
    return this.achievementService.getAchievementsForCommunity(communitySlug);
  }

  @Get('user')
  @ApiOperation({
    summary: 'Get user achievements with progress',
    description: 'Get all achievements for a community with user progress and unlock status',
  })
  @ApiQuery({ name: 'communitySlug', required: true, description: 'Community slug' })
  async getUserAchievements(
    @Request() req: any,
    @Query('communitySlug') communitySlug: string,
  ): Promise<AchievementWithProgressDto[]> {
    return this.achievementService.getUserAchievementsWithProgress(req.user.userId, communitySlug);
  }

  @Post('check')
  @ApiOperation({
    summary: 'Check for new achievements',
    description: 'Manually trigger achievement checking for the current user in a community',
  })
  @ApiQuery({ name: 'communitySlug', required: true, description: 'Community slug' })
  async checkAchievements(
    @Request() req: any,
    @Query('communitySlug') communitySlug: string,
  ): Promise<UserAchievementResponseDto[]> {
    // Get community ID from slug
    const community = await this.achievementService['communityModel'].findOne({ slug: communitySlug });
    if (!community) {
      throw new Error('Community not found');
    }

    return this.achievementService.checkAchievements(req.user.userId, community._id.toString());
  }
}