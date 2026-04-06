import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import {
  RequireCommunityPermission,
  CommunityIdFrom,
} from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { GamificationService } from './gamification.service';
import { UpdateGamificationConfigDto } from './dto/update-gamification-config.dto';
import { AdminAdjustmentDto } from './dto/admin-adjustment.dto';

@ApiTags('Gamification')
@Controller('gamification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  // ─── Member Read Endpoints ────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Get current user gamification profile for a community',
  })
  @ApiQuery({ name: 'communitySlug', required: true })
  async getMyProfile(
    @Request() req: any,
    @Query('communitySlug') communitySlug: string,
  ) {
    const userId = req.user.sub || req.user._id || req.user.id;
    const data = await this.gamificationService.getMyProfile(
      userId,
      communitySlug,
    );
    return { success: true, data };
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get community leaderboard (weekly or all-time)' })
  @ApiQuery({ name: 'communitySlug', required: true })
  @ApiQuery({ name: 'period', required: false, enum: ['weekly', 'all_time'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async getLeaderboard(
    @Request() req: any,
    @Query('communitySlug') communitySlug: string,
    @Query('period') period: 'weekly' | 'all_time' = 'all_time',
    @Query('limit') limit: string = '25',
    @Query('offset') offset: string = '0',
  ) {
    const userId = req.user.sub || req.user._id || req.user.id;
    const data = await this.gamificationService.getLeaderboard(
      communitySlug,
      period,
      parseInt(limit, 10),
      parseInt(offset, 10),
      userId,
    );
    return { success: true, data };
  }

  @Get('profile/:userId')
  @ApiOperation({ summary: "Get another member's gamification profile" })
  @ApiParam({ name: 'userId' })
  @ApiQuery({ name: 'communitySlug', required: true })
  async getUserProfile(
    @Request() req: any,
    @Param('userId') userId: string,
    @Query('communitySlug') communitySlug: string,
  ) {
    const requestingUserId = req.user.sub || req.user._id || req.user.id;
    const data = await this.gamificationService.getUserProfile(
      userId,
      communitySlug,
      requestingUserId,
    );
    return { success: true, data };
  }

  @Get('config')
  @ApiOperation({
    summary: 'Get gamification config for a community (public read)',
  })
  @ApiQuery({ name: 'communitySlug', required: true })
  async getConfig(@Query('communitySlug') communitySlug: string) {
    const data = await this.gamificationService.getConfigBySlug(communitySlug);
    return { success: true, data };
  }

  // ─── Admin Endpoints (require COMMUNITY_MANAGE_SETTINGS) ─────

  @Patch('config/:communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @CommunityIdFrom({ type: 'param', name: 'communityId' })
  @ApiOperation({
    summary: '[Admin] Update gamification config for a community',
  })
  @ApiParam({ name: 'communityId' })
  async updateConfig(
    @Param('communityId') communityId: string,
    @Body() dto: UpdateGamificationConfigDto,
  ) {
    const data = await this.gamificationService.updateConfig(communityId, dto);
    return { success: true, data };
  }

  @Post('admin/adjustment/:communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @CommunityIdFrom({ type: 'param', name: 'communityId' })
  @ApiOperation({ summary: "[Admin] Manually adjust a member's points" })
  @ApiParam({ name: 'communityId' })
  async adminAdjustment(
    @Request() req: any,
    @Param('communityId') communityId: string,
    @Body() dto: AdminAdjustmentDto,
  ) {
    const adminUserId = req.user.sub || req.user._id || req.user.id;
    await this.gamificationService.adminAdjustment(
      communityId,
      dto,
      adminUserId,
    );
    return { success: true, message: 'Adjustment applied' };
  }

  @Post('recompute/:communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @CommunityIdFrom({ type: 'param', name: 'communityId' })
  @ApiOperation({
    summary: '[Admin] Recompute all member points and levels from event ledger',
  })
  @ApiParam({ name: 'communityId' })
  async recompute(@Param('communityId') communityId: string) {
    const result =
      await this.gamificationService.recomputeAllMembers(communityId);
    return { success: true, data: result };
  }
}
