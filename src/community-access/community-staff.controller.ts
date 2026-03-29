import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityAccessService } from './community-access.service';
import { CommunityPermissionGuard } from './community-permission.guard';
import { RequireCommunityPermission } from './community-permission.decorator';
import { CommunityPermission, CommunityStaffRole } from '../common/permissions';
import { AssignStaffRoleDto, UpdateStaffRoleDto } from './dto/staff.dto';

@ApiTags('Community Staff')
@Controller('communities/:communityId/staff')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommunityStaffController {
  constructor(
    private readonly communityAccess: CommunityAccessService,
  ) {}

  private getUserId(req: any): string {
    return (req.user?._id || req.user?.sub || '').toString();
  }

  // ───────────────────────────────────────────────────────────────────
  // GET /communities/:communityId/staff
  // ───────────────────────────────────────────────────────────────────
  @Get()
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MEMBERS_VIEW)
  @ApiOperation({ summary: 'List all staff (owner + staff) for a community' })
  @ApiParam({ name: 'communityId', description: 'Community ObjectId' })
  async listStaff(@Param('communityId') communityId: string) {
    return this.communityAccess.listStaff(communityId);
  }

  // ───────────────────────────────────────────────────────────────────
  // POST /communities/:communityId/staff
  // ───────────────────────────────────────────────────────────────────
  @Post()
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Assign a staff role to a community member' })
  @ApiParam({ name: 'communityId', description: 'Community ObjectId' })
  async assignStaff(
    @Param('communityId') communityId: string,
    @Body() dto: AssignStaffRoleDto,
    @Req() req: any,
  ) {
    return this.communityAccess.assignStaffRole(
      communityId,
      dto.userId,
      dto.role as CommunityStaffRole,
      this.getUserId(req),
    );
  }

  // ───────────────────────────────────────────────────────────────────
  // PATCH /communities/:communityId/staff/:userId
  // ───────────────────────────────────────────────────────────────────
  @Patch(':userId')
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Update a staff member\'s role' })
  @ApiParam({ name: 'communityId', description: 'Community ObjectId' })
  @ApiParam({ name: 'userId', description: 'Target user ObjectId' })
  async updateStaffRole(
    @Param('communityId') communityId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffRoleDto,
    @Req() req: any,
  ) {
    return this.communityAccess.updateStaffRole(
      communityId,
      userId,
      dto.role as CommunityStaffRole,
      this.getUserId(req),
    );
  }

  // ───────────────────────────────────────────────────────────────────
  // DELETE /communities/:communityId/staff/:userId
  // ───────────────────────────────────────────────────────────────────
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Remove a staff role from a user' })
  @ApiParam({ name: 'communityId', description: 'Community ObjectId' })
  @ApiParam({ name: 'userId', description: 'Target user ObjectId' })
  async removeStaff(
    @Param('communityId') communityId: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    await this.communityAccess.removeStaffRole(
      communityId,
      userId,
      this.getUserId(req),
    );
  }
}
