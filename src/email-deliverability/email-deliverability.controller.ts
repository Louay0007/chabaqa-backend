import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { EmailDeliverabilityService } from './email-deliverability.service';

@ApiTags('Email Deliverability')
@Controller('email-deliverability')
@UseGuards(JwtAuthGuard)
export class EmailDeliverabilityController {
  constructor(private readonly deliverabilityService: EmailDeliverabilityService) {}

  @Get(':communityId/summary')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get deliverability health summary for a community' })
  getSummary(@Param('communityId') communityId: string) {
    return this.deliverabilityService.getHealthSummary(communityId);
  }

  @Get(':communityId/history')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get daily deliverability history' })
  getHistory(@Param('communityId') communityId: string, @Query('days') days?: string) {
    return this.deliverabilityService.getDailySnapshots(communityId, days ? parseInt(days, 10) : 30);
  }
}
