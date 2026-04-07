import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { EmailSuppressionService } from './email-suppression.service';

@ApiTags('Email Suppression')
@Controller('email-suppression')
@UseGuards(JwtAuthGuard)
export class EmailSuppressionController {
  constructor(private readonly suppressionService: EmailSuppressionService) {}

  @Get(':communityId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'List suppressed emails for a community' })
  list(
    @Param('communityId') communityId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.suppressionService.list(communityId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Delete(':communityId/:email')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MARKETING_MANAGE)
  @ApiOperation({ summary: 'Remove email from suppression list (re-subscribe)' })
  async remove(
    @Param('communityId') communityId: string,
    @Param('email') email: string,
    @Res() res: Response,
  ) {
    await this.suppressionService.remove(communityId, decodeURIComponent(email));
    res.status(200).json({ success: true });
  }
}
