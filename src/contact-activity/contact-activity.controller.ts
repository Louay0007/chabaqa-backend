import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { ContactActivityService } from './contact-activity.service';
import { ContactActivityType } from '../schema/contact-activity.schema';

@ApiTags('Contact Activity')
@Controller('contact-activity')
@UseGuards(JwtAuthGuard)
export class ContactActivityController {
  constructor(private readonly activityService: ContactActivityService) {}

  @Get(':communityId/user/:userId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Get activity timeline for a contact' })
  getTimeline(
    @Param('communityId') communityId: string,
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('types') types?: string,
  ) {
    const parsedTypes = types
      ? (types.split(',').filter((t) => Object.values(ContactActivityType).includes(t as ContactActivityType)) as ContactActivityType[])
      : undefined;
    return this.activityService.getTimeline(communityId, userId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      types: parsedTypes,
    });
  }
}
