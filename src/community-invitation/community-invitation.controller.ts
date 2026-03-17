import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CommunityInvitationService } from './community-invitation.service';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import {
  ImportContactsDto,
  InviteSingleDto,
  InvitationQueryDto,
} from '../dto-community/community-invitation.dto';

@Controller('community-invitations')
@ApiTags('Community Invitations')
export class CommunityInvitationController {
  constructor(
    private readonly invitationService: CommunityInvitationService,
  ) {}

  // -----------------------------------------------------------------------
  // Bulk import
  // -----------------------------------------------------------------------

  @Post('import')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MEMBERS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk import contacts and send invitations' })
  @ApiBody({ type: ImportContactsDto })
  @ApiResponse({ status: 201, description: 'Import result with created/skipped counts' })
  async importContacts(
    @Request() req,
    @Body() dto: ImportContactsDto,
  ) {
    return this.invitationService.importContacts(req.user.userId || req.user._id || req.user.sub, dto);
  }

  // -----------------------------------------------------------------------
  // Single invite
  // -----------------------------------------------------------------------

  @Post('single')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MEMBERS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a single contact' })
  @ApiBody({ type: InviteSingleDto })
  @ApiResponse({ status: 201, description: 'Created invitation' })
  async inviteSingle(
    @Request() req,
    @Body() dto: InviteSingleDto,
  ) {
    return this.invitationService.inviteSingle(req.user.userId || req.user._id || req.user.sub, dto);
  }

  // -----------------------------------------------------------------------
  // Accept flow (public)
  // -----------------------------------------------------------------------

  @Get('accept/:token')
  @ApiOperation({ summary: 'Validate an invitation token (public)' })
  @ApiParam({ name: 'token', description: 'Invitation token (UUID)' })
  @ApiResponse({ status: 200, description: 'Token validation result' })
  async validateToken(@Param('token') token: string) {
    return this.invitationService.validateToken(token);
  }

  @Post('accept/:token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invitation and join the community' })
  @ApiParam({ name: 'token', description: 'Invitation token (UUID)' })
  @ApiResponse({ status: 200, description: 'Acceptance result' })
  async acceptInvitation(
    @Param('token') token: string,
    @Request() req,
  ) {
    return this.invitationService.acceptInvitation(
      token,
      req.user.userId || req.user._id || req.user.sub,
    );
  }

  // -----------------------------------------------------------------------
  // List & Stats (creator-only)
  // -----------------------------------------------------------------------

  @Get(':communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MEMBERS_VIEW)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invitations for a community' })
  @ApiParam({ name: 'communityId' })
  @ApiResponse({ status: 200, description: 'Paginated invitations list' })
  async getInvitations(
    @Param('communityId') communityId: string,
    @Query() query: InvitationQueryDto,
    @Request() req,
  ) {
    return this.invitationService.getInvitations(
      req.user.userId || req.user._id || req.user.sub,
      communityId,
      query,
    );
  }

  @Get(':communityId/stats')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.MEMBERS_VIEW)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invitation statistics for a community' })
  @ApiParam({ name: 'communityId' })
  @ApiResponse({ status: 200, description: 'Invitation stats' })
  async getStats(
    @Param('communityId') communityId: string,
    @Request() req,
  ) {
    return this.invitationService.getStats(
      req.user.userId || req.user._id || req.user.sub,
      communityId,
    );
  }

  // -----------------------------------------------------------------------
  // Actions on single invitation (creator-only)
  // -----------------------------------------------------------------------

  @Post(':invitationId/resend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend an invitation email' })
  @ApiParam({ name: 'invitationId' })
  @ApiResponse({ status: 200, description: 'Resent invitation' })
  async resendInvitation(
    @Param('invitationId') invitationId: string,
    @Request() req,
  ) {
    return this.invitationService.resendInvitation(
      req.user.userId || req.user._id || req.user.sub,
      invitationId,
    );
  }

  @Patch(':invitationId/revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invitation' })
  @ApiParam({ name: 'invitationId' })
  @ApiResponse({ status: 200, description: 'Revoked invitation' })
  async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @Request() req,
  ) {
    return this.invitationService.revokeInvitation(
      req.user.userId || req.user._id || req.user.sub,
      invitationId,
    );
  }

  @Delete(':invitationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an invitation' })
  @ApiParam({ name: 'invitationId' })
  @ApiResponse({ status: 204, description: 'Invitation deleted' })
  async deleteInvitation(
    @Param('invitationId') invitationId: string,
    @Request() req,
  ) {
    return this.invitationService.deleteInvitation(
      req.user.userId || req.user._id || req.user.sub,
      invitationId,
    );
  }
}
