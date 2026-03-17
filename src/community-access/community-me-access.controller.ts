import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityAccessService } from './community-access.service';

@ApiTags('Community Access')
@Controller('communities/:communityId/me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommunityMeAccessController {
  constructor(
    private readonly communityAccess: CommunityAccessService,
  ) {}

  private getUserId(req: any): string {
    return (req.user?._id || req.user?.sub || '').toString();
  }

  /**
   * GET /communities/:communityId/me/access
   *
   * Returns the current user's role and boolean permission map
   * for the specified community. Used by frontend for UI gating.
   */
  @Get('access')
  @ApiOperation({
    summary: "Get current user's role & permissions for a community",
  })
  @ApiParam({ name: 'communityId', description: 'Community ObjectId' })
  async getMyAccess(
    @Param('communityId') communityId: string,
    @Req() req: any,
  ) {
    return this.communityAccess.getCommunityPermissions(
      communityId,
      this.getUserId(req),
    );
  }
}
